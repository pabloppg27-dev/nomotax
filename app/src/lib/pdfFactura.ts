import { GState, jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { calcularTotales, importeLinea } from './totals'
import { direccionCompleta, eur, fecha, num } from './format'
import { CAUSAS_RECTIFICACION } from './estados'
import type { Emisor, Invoice, Quote } from './types'
import { TEXTOS, idiomaDePais } from './idiomaFactura'
import { cuentasDeFactura, datosCuenta, dinero, esEur, importesFactura } from './cuentasBancarias'

type Tipo = 'factura' | 'presupuesto'

const INK: [number, number, number] = [17, 17, 16]
const LIMA: [number, number, number] = [205, 245, 100]
const MUTED: [number, number, number] = [107, 107, 101]
const LINE: [number, number, number] = [229, 229, 223]
const BLANCO: [number, number, number] = [255, 255, 255]

type RGB = [number, number, number]

/** Color de marca del cliente (#RRGGBB) o lima de NomoTax si no hay o no es válido. */
function colorDeMarca(hex: string | null | undefined): RGB {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex ?? '').trim())
  if (!m) return LIMA
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Texto negro o blanco, el que mejor se lea sobre ese fondo. */
function textoSobre([r, g, b]: RGB): RGB {
  const lin = (c: number) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
  return L > 0.179 ? INK : BLANCO
}

/** Logo ya cargado (en el navegador o en el servidor): data URL y tamaño en píxeles */
export type LogoPdf = { dataUrl: string; formato: string; w: number; h: number }

/** Mezcla un color con blanco (a = proporción del color). */
function tinte([r, g, b]: RGB, a: number): RGB {
  return [Math.round(255 - (255 - r) * a), Math.round(255 - (255 - g) * a), Math.round(255 - (255 - b) * a)]
}

/** Contenido del QR de transferencia SEPA (estándar EPC069-12, versión 002: BIC opcional). */
function payloadEpc(nombre: string, iban: string, importe: number, referencia: string) {
  return [
    'BCD', '002', '1', 'SCT', '',
    nombre.slice(0, 70),
    iban.replace(/\s+/g, '').toUpperCase(),
    `EUR${importe.toFixed(2)}`,
    '', '',
    referencia.slice(0, 140),
  ].join('\n')
}

const PT = 0.3528 // mm por punto tipográfico

/**
 * Dibuja la factura o el presupuesto con el diseño de la app. Sin navegador:
 * lo usan descargarPdf() (pdf.ts) y la facturación automática del servidor.
 */
export async function construirPdf(
  tipo: Tipo,
  d: (Invoice | Quote) & { vencimiento?: string | null; valido_hasta?: string | null },
  emisor: Emisor,
  /** Del perfil actual del emisor (no fiscal): color y nombre comercial */
  marca: { color?: string | null; nombreComercial?: string | null } | undefined,
  logo: LogoPdf | null,
  modoPruebas = false,
): Promise<{ doc: jsPDF; nombre: string }> {
  const MARCA = colorDeMarca(marca?.color)
  const comercial = marca?.nombreComercial?.trim() || null
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = 210
  const M = 18
  const esFactura = tipo === 'factura'
  const inv = d as Invoice
  const rectificativa = esFactura && inv.tipo === 'rectificativa'
  const estado = (d as Invoice).estado
  const borrador = estado === 'borrador'
  const pruebas = esFactura && modoPruebas
  // Idioma según el país del cliente
  const idioma = idiomaDePais(d.cliente?.pais)
  const T = TEXTOS[idioma]

  const SUAVE = tinte(MARCA, 0.08)
  const H = 297
  const nifEmisor = T.nif === 'NIF' ? 'NIF' : 'NIF/VAT'
  const etiqueta = (txt: string, x: number, yy: number, align: 'left' | 'right' = 'left') => {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.setTextColor(...MUTED)
    doc.text(txt.toUpperCase(), x, yy, { align })
  }

  // Franja superior con el color de marca
  doc.setFillColor(...MARCA)
  doc.rect(0, 0, W, 2, 'F')

  // Emisor: logo y datos (al lado si el logo es compacto, debajo si es alargado)
  let xE = M
  let yE = 18
  let finLogo = 0
  if (logo) {
    const ratio = Math.min(42 / logo.w, 18 / logo.h)
    const lw = logo.w * ratio
    const lh = logo.h * ratio
    doc.addImage(logo.dataUrl, logo.formato, M, 13, lw, lh, undefined, 'FAST')
    finLogo = 13 + lh
    if (lw <= 30) {
      xE = M + lw + 5
      yE = 17
    } else {
        yE = finLogo + 6
    }
  }
  const anchoE = 122 - xE
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10.5)
  doc.setTextColor(...INK)
  const titular = emisor.nombre || ''
  const cabecera = comercial && comercial.toLowerCase() !== titular.toLowerCase() ? comercial : titular
  doc.text(cabecera, xE, yE, { maxWidth: anchoE })
  yE += 4.6
  if (cabecera !== titular && titular) {
    // Autónomo con nombre comercial: el nombre y apellidos van debajo
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.8)
    doc.setTextColor(...INK)
    doc.text(titular, xE, yE, { maxWidth: anchoE })
    yE += 4.1
  }
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.3)
  doc.setTextColor(...MUTED)
  const contacto = [emisor.email, emisor.telefono].filter(Boolean).join(' | ')
  for (const l of [emisor.nif ? `${nifEmisor} ${emisor.nif}` : '', ...direccionCompleta(emisor, idioma), contacto]) {
    if (!l) continue
    doc.text(l, xE, yE, { maxWidth: anchoE })
    yE += 3.8
  }

  // Tipo de documento y número
  etiqueta(rectificativa ? T.rectificativa : esFactura ? T.factura : T.presupuesto, W - M, 17, 'right')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(19)
  doc.setTextColor(...INK)
  doc.text(d.numero || T.borrador, W - M, 25.5, { align: 'right' })

  // Factura en otra moneda (USD, GBP…): precios y totales convertidos con el cambio guardado; contabilidad en euros
  const imp = esFactura
    ? importesFactura(inv)
    : { moneda: 'EUR', tasa: 1, convertida: false, lineas: d.lineas, totales: calcularTotales(d.lineas, Number(d.irpf_pct)) }
  const t = imp.totales
  const $ = (n: number) => dinero(n, imp.moneda)
  const cuentas = esFactura ? cuentasDeFactura(inv, emisor) : []
  const conPago = esFactura && cuentas.length > 0 && t.total > 0

  // Franja de datos: fecha, vencimiento / validez, forma de pago
  let y = Math.max(yE, finLogo, 30) + 5
  const celdas: [string, string][] = [[T.fecha, fecha(d.fecha)]]
  if (esFactura && d.vencimiento) celdas.push([T.vencimiento, fecha(d.vencimiento)])
  if (!esFactura && d.valido_hasta) celdas.push([T.validoHasta, fecha(d.valido_hasta)])
  if (conPago) celdas.push([T.formaPago, T.transferenciaCorta])
  doc.setFillColor(...SUAVE)
  doc.roundedRect(M, y, W - 2 * M, 13, 2, 2, 'F')
  const anchoCelda = (W - 2 * M - 10) / 4
  celdas.forEach(([k, v], i) => {
    const x = M + 5 + i * anchoCelda
    etiqueta(k, x, y + 5)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9.3)
    doc.setTextColor(...INK)
    doc.text(v, x, y + 9.8)
  })
  y += 13 + 8

  // Cliente, con la raya del color de marca
  const c = d.cliente || {}
  const yCli = y
  etiqueta(esFactura ? T.facturarA : T.para, M + 4, y + 2.4)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10.5)
  doc.setTextColor(...INK)
  const nombreCli = doc.splitTextToSize(c.nombre || '—', W - 2 * M - 4)
  doc.text(nombreCli, M + 4, y + 7.4)
  let yc = y + 7.4 + nombreCli.length * 4.4
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(...MUTED)
  for (const l of [c.nif ? `${T.nif} ${c.nif}` : '', direccionCompleta(c, idioma).join(', '), c.email ?? '']) {
    if (!l) continue
    const partes = doc.splitTextToSize(l, W - 2 * M - 4)
    doc.text(partes, M + 4, yc)
    yc += partes.length * 3.9
  }
  doc.setFillColor(...MARCA)
  doc.rect(M, yCli - 0.6, 0.8, yc - yCli - 2.4, 'F')
  y = yc + 5

  // Conceptos: primera línea en negrita; los saltos de línea siguientes son el detalle, en gris
  const pad = 3.2
  const anchoConcepto = W - 2 * M - (14 + 27 + 15 + 28) - 4
  const partirConcepto = (raw: string) => {
    const [primera, ...resto] = raw.split('\n')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9.3)
    const l1: string[] = doc.splitTextToSize(primera || ' ', anchoConcepto)
    const detalle = resto.join('\n').trim()
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.3)
    const l2: string[] = detalle ? doc.splitTextToSize(detalle, anchoConcepto) : []
    return { l1, l2 }
  }
  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M, top: 18, bottom: 24 },
    head: [[T.concepto, T.cant, T.precio, T.impuesto, T.importe].map((h) => h.toUpperCase())],
    body: imp.lineas.map((l) => [l.concepto, num(l.cantidad), $(l.precio), `${num(l.iva)}%`, $(importeLinea(l))]),
    theme: 'plain',
    styles: { font: 'helvetica', fontSize: 9.3, cellPadding: { top: pad, bottom: pad, left: 0, right: 0 }, textColor: INK },
    headStyles: { textColor: MUTED, fontStyle: 'bold', fontSize: 7, cellPadding: { top: 1.5, bottom: 2.4, left: 0, right: 0 } },
    columnStyles: {
      0: { cellWidth: 'auto', fontStyle: 'bold', cellPadding: { top: pad, bottom: pad, left: 0, right: 4 } },
      1: { halign: 'right', cellWidth: 14 },
      2: { halign: 'right', cellWidth: 27 },
      3: { halign: 'right', cellWidth: 15 },
      4: { halign: 'right', cellWidth: 28 },
    },
    didParseCell: (data) => {
      if (data.section === 'head' && data.column.index > 0) data.cell.styles.halign = 'right'
      if (data.section === 'body' && data.column.index === 0) {
        const { l1, l2 } = partirConcepto(String(data.cell.raw ?? ''))
        data.cell.text = ['']
        data.cell.styles.minCellHeight =
          2 * pad + l1.length * 9.3 * 1.15 * PT + (l2.length ? 0.6 + l2.length * 8.3 * 1.2 * PT : 0)
      }
    },
    willDrawCell: (data) => {
      if (data.section !== 'body' || data.column.index !== 0) return
      const cell = data.cell
      const { l1, l2 } = partirConcepto(String(cell.raw ?? ''))
      cell.text = []
      const yy = cell.y + pad
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9.3)
      doc.setTextColor(...INK)
      doc.text(l1, cell.x, yy, { baseline: 'top', lineHeightFactor: 1.15 })
      if (l2.length) {
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8.3)
        doc.setTextColor(...MUTED)
        doc.text(l2, cell.x, yy + l1.length * 9.3 * 1.15 * PT + 0.6, { baseline: 'top', lineHeightFactor: 1.2 })
      }
    },
    didDrawCell: (data) => {
      const { x, y: cy, width, height } = data.cell
      if (data.section === 'head') {
        doc.setDrawColor(...INK)
        doc.setLineWidth(0.35)
      } else {
        doc.setDrawColor(...LINE)
        doc.setLineWidth(0.2)
      }
      doc.line(x, cy + height, x + width, cy + height)
    },
  })

  // Totales
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6
  const filasTot = 1 + t.desglose.length + (t.cuota_irpf ? 1 : 0)
  // Factura en otra moneda: debajo del total, el contravalor en euros (base, impuesto, retención y total)
  const tEur = imp.convertida ? calcularTotales(d.lineas, Number(d.irpf_pct)) : null
  const altoEur = tEur ? 17 + (2 + tEur.desglose.length + (tEur.cuota_irpf ? 1 : 0)) * 4.4 : 0
  if (y + filasTot * 5.6 + 16 + altoEur > H - 26) {
    doc.addPage()
    y = 24
  }
  const xl = W - M - 74 // etiquetas
  const xv = W - M - 4 // importes (con aire dentro de la caja del total)
  const fila = (label: string, valor: string) => {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...MUTED)
    doc.text(label, xl, y)
    doc.setTextColor(...INK)
    doc.text(valor, xv, y, { align: 'right' })
    y += 5.6
  }
  y += 3
  fila(T.base, $(t.base))
  for (const r of t.desglose) fila(`${T.impuesto} ${num(r.tipo)}%${t.desglose.length > 1 ? ` (${T.sobreBase} ${$(r.base)})` : ''}`, $(r.cuota))
  if (t.cuota_irpf) fila(`${T.retencion} ${num(Number(d.irpf_pct))}%`, $(-t.cuota_irpf))
  y -= 1.5
  doc.setFillColor(...MARCA)
  doc.roundedRect(xl - 4, y, W - M - xl + 4, 12, 2.2, 2.2, 'F')
  doc.setTextColor(...textoSobre(MARCA))
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text(T.total, xl, y + 7.6)
  doc.setFontSize(13)
  doc.text($(t.total), xv, y + 7.8, { align: 'right' })
  y += 12

  if (tEur) {
    // Con importes en otra moneda, la factura da también el impuesto en euros (art. 12 RD 1619/2012)
    const x0 = xl - 4
    const ancho = W - M - x0
    const alto = altoEur - 4
    y += 3
    doc.setFillColor(247, 247, 245)
    doc.roundedRect(x0, y, ancho, alto, 2.2, 2.2, 'F')
    etiqueta(T.contravalor, xl, y + 5.6)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.3)
    doc.setTextColor(...MUTED)
    doc.text(T.cambioBce(fecha(inv.fecha_cambio ?? d.fecha), num(imp.tasa, 4), imp.moneda), xl, y + 9.6)
    let ye = y + 15
    const filaEur = (label: string, valor: string, fuerte = false) => {
      doc.setFont('helvetica', fuerte ? 'bold' : 'normal')
      doc.setFontSize(8.3)
      doc.setTextColor(...(fuerte ? INK : MUTED))
      doc.text(label, xl, ye)
      doc.setTextColor(...INK)
      doc.text(valor, xv, ye, { align: 'right' })
      ye += 4.4
    }
    filaEur(T.base, eur(tEur.base))
    for (const r of tEur.desglose) filaEur(`${T.impuesto} ${num(r.tipo)}%`, eur(r.cuota))
    if (tEur.cuota_irpf) filaEur(`${T.retencion} ${num(Number(d.irpf_pct))}%`, eur(-tEur.cuota_irpf))
    filaEur(T.total.charAt(0) + T.total.slice(1).toLowerCase(), eur(tEur.total), true)
    y += alto
  }
  y += 10

  const asegurarHueco = (alto: number) => {
    if (y + alto > H - 26) {
      doc.addPage()
      y = 24
    }
  }

  // Forma de pago: una o varias cuentas (euros, dólares, libras…), referencia y QR SEPA si se paga en euros
  if (conPago) {
    const ibanQr = cuentas.find((c) => esEur(c.moneda) && c.iban?.trim())?.iban
    let qr: string | null = null
    if (esEur(imp.moneda) && ibanQr && !borrador && d.numero) {
      try {
        const QR = await import('qrcode')
        qr = await QR.toDataURL(payloadEpc(emisor.nombre || '', ibanQr, t.total, d.numero), {
          errorCorrectionLevel: 'M',
          margin: 0,
          width: 240,
        })
      } catch {
        qr = null
      }
    }
    // Una sola cuenta en euros: el diseño de siempre (IBAN en una línea y QR SEPA)
    const unaEnEuros = cuentas.length === 1 && esEur(cuentas[0].moneda) && Boolean(cuentas[0].iban?.trim())
    if (unaEnEuros) {
      const iban = cuentas[0].iban!
      const alto = qr ? 26 : 19
      asegurarHueco(alto)
      doc.setDrawColor(...LINE)
      doc.setLineWidth(0.25)
      doc.roundedRect(M, y, W - 2 * M, alto, 2, 2, 'S')
      etiqueta(T.formaPago, M + 5, y + 6)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9.3)
      doc.setTextColor(...INK)
      doc.text(`${T.transferenciaCorta} | IBAN`, M + 5, y + 11.5)
      const xIban = M + 5 + doc.getTextWidth(`${T.transferenciaCorta} | IBAN`) + 1.6
      doc.setFont('helvetica', 'bold')
      doc.text(iban.toUpperCase().replace(/\s+/g, ' ').trim(), xIban, y + 11.5)
      if (d.numero) {
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8.3)
        doc.setTextColor(...MUTED)
        doc.text(T.refPago(d.numero), M + 5, y + 16.2, { maxWidth: W - 2 * M - 40 })
      }
      if (qr) doc.addImage(qr, 'PNG', W - M - 5 - 18, y + 4, 18, 18, undefined, 'FAST')
      y += alto + 8
    } else {
    // Varias cuentas o en otra moneda: cada cuenta en su columna (dos por fila), moneda y banco arriba y debajo «etiqueta  valor»
    const anchoCaja = W - 2 * M
    const pad = 6
    const hueco = 10
    const porFila = cuentas.length > 1 ? 2 : 1
    const anchoCol = (anchoCaja - 2 * pad - (qr ? 24 : 0) - (porFila - 1) * hueco) / porFila
    const columnas = cuentas.map((c) => {
      const { principales, otros } = datosCuenta(c, idioma)
      const banco = c.banco?.trim() || ''
      const filas = [
        ...principales.map(([k, v]) => ({ k, v, fuerte: true })),
        ...otros.filter(([, v]) => v !== banco).map(([k, v]) => ({ k, v, fuerte: false })),
      ]
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7.6)
      const anchoEtiqueta = Math.min(34, Math.max(...filas.map((f) => doc.getTextWidth(f.k)), 10) + 4)
      const partes = filas.map((f) => {
        doc.setFont('helvetica', f.fuerte ? 'bold' : 'normal')
        doc.setFontSize(f.fuerte ? 9 : 8.3)
        const lineas: string[] = doc.splitTextToSize(f.v, anchoCol - anchoEtiqueta)
        return { ...f, lineas, alto: lineas.length * (f.fuerte ? 4.1 : 3.8) + 1.4 }
      })
      return { c, banco, anchoEtiqueta, partes, alto: 8.5 + partes.reduce((s, f) => s + f.alto, 0) }
    })
    const filasCols: (typeof columnas)[] = []
    for (let i = 0; i < columnas.length; i += porFila) filasCols.push(columnas.slice(i, i + porFila))
    const altos = filasCols.map((f) => Math.max(...f.map((c) => c.alto)))
    const cabecera = 11
    const pie = d.numero ? 9 : 2
    const alto = Math.max(qr ? 28 : 0, cabecera + altos.reduce((s, a) => s + a, 0) + (altos.length - 1) * 4 + pie)
    asegurarHueco(alto)
    doc.setDrawColor(...LINE)
    doc.setLineWidth(0.25)
    doc.roundedRect(M, y, anchoCaja, alto, 2, 2, 'S')
    etiqueta(T.formaPago, M + pad, y + 6.5)
    let yf = y + cabecera
    filasCols.forEach((fila, i) => {
      fila.forEach((col, j) => {
        const x = M + pad + j * (anchoCol + hueco)
        if (j > 0) {
          doc.setDrawColor(...LINE)
          doc.setLineWidth(0.2)
          doc.line(x - hueco / 2, yf - 0.5, x - hueco / 2, yf + altos[i] - 3)
        }
        // Moneda en una pastilla negra y, al lado, el banco
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(7.5)
        const codigo = col.c.moneda.toUpperCase()
        const anchoPastilla = doc.getTextWidth(codigo) + 4
        doc.setFillColor(...INK)
        doc.roundedRect(x, yf, anchoPastilla, 4.8, 1.2, 1.2, 'F')
        doc.setTextColor(...BLANCO)
        doc.text(codigo, x + 2, yf + 3.4)
        if (col.banco) {
          doc.setFontSize(9)
          doc.setTextColor(...INK)
          doc.text(col.banco, x + anchoPastilla + 2.5, yf + 3.5, { maxWidth: anchoCol - anchoPastilla - 2.5 })
        }
        let yv = yf + 9.5
        for (const f of col.partes) {
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(7.6)
          doc.setTextColor(...MUTED)
          doc.text(f.k, x, yv)
          doc.setFont('helvetica', f.fuerte ? 'bold' : 'normal')
          doc.setFontSize(f.fuerte ? 9 : 8.3)
          doc.setTextColor(...INK)
          doc.text(f.lineas, x + col.anchoEtiqueta, yv, { lineHeightFactor: 1.25 })
          yv += f.alto
        }
      })
      yf += altos[i] + 4
    })
    if (d.numero) {
      const yr = y + alto - 5
      doc.setDrawColor(...LINE)
      doc.setLineWidth(0.2)
      doc.line(M + pad, yr - 4.2, M + anchoCaja - pad - (qr ? 24 : 0), yr - 4.2)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8.3)
      doc.setTextColor(...MUTED)
      doc.text(T.refPago(d.numero), M + pad, yr)
    }
    if (qr) doc.addImage(qr, 'PNG', W - M - pad - 18, y + 5, 18, 18, undefined, 'FAST')
    y += alto + 8
    }
  }

  // Rectificativa, notas y pie del cliente
  const bloques: [string, string, boolean][] = []
  if (rectificativa) {
    const causa = CAUSAS_RECTIFICACION.find((c) => c.id === inv.causa_rectificacion)
    bloques.push([
      T.bloqueRectificativa,
      T.rectifica(inv.rectifica_numero ?? '', inv.rectifica_fecha ? fecha(inv.rectifica_fecha) : null) +
        (causa ? ` ${T.causa}: ${causa.id} | ${causa.nombre}.` : '') +
        (inv.motivo_rectificacion ? ` ${T.motivo}: ${inv.motivo_rectificacion}` : ''),
      false,
    ])
  }
  if (d.notas) bloques.push([T.notas, d.notas, false])
  if (emisor.pie_factura) bloques.push(['', emisor.pie_factura, true])
  for (const [titulo, texto, discreto] of bloques) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(discreto ? 7.8 : 9)
    const partes = doc.splitTextToSize(texto, W - 2 * M)
    asegurarHueco(partes.length * 4 + (titulo ? 5 : 0))
    if (titulo) {
      etiqueta(titulo, M, y)
      y += 4.5
    }
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(discreto ? 7.8 : 9)
    doc.setTextColor(...(discreto ? MUTED : INK))
    doc.text(partes, M, y)
    y += partes.length * (discreto ? 3.6 : 4.2) + 5
  }

  // Avisos de borrador / pruebas y numeración de páginas
  const paginas = doc.getNumberOfPages()
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p)
    if (borrador || pruebas) {
      doc.saveGraphicsState()
      doc.setGState(new GState({ opacity: 0.07 }))
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(borrador ? 70 : 34)
      doc.setTextColor(...INK)
      doc.text(borrador ? T.borrador.toUpperCase() : T.marcaPruebas, W / 2, 190, { align: 'center', angle: 30 })
      doc.restoreGraphicsState()
    }
    doc.setDrawColor(...LINE)
    doc.setLineWidth(0.2)
    doc.line(M, H - 15, W - M, H - 15)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.3)
    doc.setTextColor(...MUTED)
    const pie = [emisor.nombre, emisor.nif ? `${nifEmisor} ${emisor.nif}` : null].filter(Boolean).join(' | ')
    doc.text(pie, M, H - 10.5)
    doc.text(T.pagina(p, paginas), W - M, H - 10.5, { align: 'right' })
    if (pruebas && !borrador) {
      doc.text(T.avisoPruebas, W / 2, H - 18, { align: 'center' })
    }
    // Marca de NomoTax, discreta, debajo del pie
    doc.setFontSize(6.3)
    doc.setTextColor(170, 170, 164)
    doc.textWithLink(T.hechoCon, W / 2 - doc.getTextWidth(T.hechoCon) / 2, H - 6, { url: 'https://nomotax.io' })
  }

  const nombre = `${esFactura ? T.archivoFactura : T.archivoPresupuesto}-${d.numero || T.borrador.toLowerCase()}.pdf`
  return { doc, nombre }
}
