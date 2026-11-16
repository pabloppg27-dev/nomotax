import { GState, jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { signedUrl } from './supabase'
import { calcularTotales, importeLinea } from './totals'
import { direccionCompleta, eur, fecha, num } from './format'
import { MODO_PRUEBAS_FACTURAS } from './config'
import { CAUSAS_RECTIFICACION } from './estados'
import type { ClienteSnapshot, Emisor, Invoice, Quote } from './types'
import { TEXTOS, idiomaDePais } from './idiomaFactura'

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

async function cargarLogo(path: string | null | undefined) {
  if (!path) return null
  try {
    const url = await signedUrl(path, 120)
    if (!url) return null
    const blob = await (await fetch(url)).blob()
    const dataUrl: string = await new Promise((res, rej) => {
      const r = new FileReader()
      r.onload = () => res(r.result as string)
      r.onerror = rej
      r.readAsDataURL(blob)
    })
    const dims: { w: number; h: number } = await new Promise((res, rej) => {
      const img = new Image()
      img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight })
      img.onerror = rej
      img.src = dataUrl
    })
    const formato = blob.type.includes('png') ? 'PNG' : blob.type.includes('webp') ? 'WEBP' : 'JPEG'
    return { dataUrl, formato, ...dims }
  } catch {
    return null
  }
}

function bloqueDatos(doc: jsPDF, x: number, y: number, titulo: string, d: ClienteSnapshot & { telefono?: string | null }, nif = 'NIF') {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...MUTED)
  doc.text(titulo.toUpperCase(), x, y)
  doc.setTextColor(...INK)
  doc.setFontSize(10.5)
  doc.text(d.nombre || '—', x, y + 6)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  let yy = y + 11
  const lineas = [d.nif ? `${nif} ${d.nif}` : null, ...direccionCompleta(d), d.email, d.telefono].filter(
    (l): l is string => Boolean(l),
  )
  for (const l of lineas) {
    doc.text(l, x, yy, { maxWidth: 80 })
    yy += 4.6
  }
  return yy
}

export async function descargarPdf(
  tipo: Tipo,
  d: (Invoice | Quote) & { vencimiento?: string | null; valido_hasta?: string | null },
  emisor: Emisor,
  colorMarca?: string | null,
) {
  const MARCA = colorDeMarca(colorMarca)
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = 210
  const M = 18
  const esFactura = tipo === 'factura'
  const inv = d as Invoice
  const rectificativa = esFactura && inv.tipo === 'rectificativa'
  const estado = (d as Invoice).estado
  const borrador = estado === 'borrador'
  const pruebas = esFactura && MODO_PRUEBAS_FACTURAS
  // Idioma según el país del cliente
  const T = TEXTOS[idiomaDePais(d.cliente?.pais)]

  // Franja superior
  doc.setFillColor(...INK)
  doc.rect(0, 0, W, 4, 'F')
  doc.setFillColor(...MARCA)
  doc.rect(0, 4, 42, 1.2, 'F')

  // Logo
  const logo = await cargarLogo(emisor.logo_path)
  if (logo) {
    const maxW = 50
    const maxH = 20
    const ratio = Math.min(maxW / logo.w, maxH / logo.h)
    doc.addImage(logo.dataUrl, logo.formato, M, 14, logo.w * ratio, logo.h * ratio)
  } else {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(15)
    doc.setTextColor(...INK)
    doc.text(emisor.nombre || '', M, 24, { maxWidth: 90 })
  }

  // Título y número
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(rectificativa ? 16 : 22)
  doc.setTextColor(...INK)
  doc.text(rectificativa ? T.rectificativa : esFactura ? T.factura : T.presupuesto, W - M, 22, { align: 'right' })
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  const meta: [string, string][] = [
    [T.numero, d.numero || (borrador ? T.borrador : '—')],
    [T.fecha, fecha(d.fecha)],
  ]
  if (esFactura && d.vencimiento) meta.push([T.vencimiento, fecha(d.vencimiento)])
  if (!esFactura && d.valido_hasta) meta.push([T.validoHasta, fecha(d.valido_hasta)])
  let my = 30
  for (const [k, v] of meta) {
    doc.setTextColor(...MUTED)
    doc.text(k, W - M - 42, my)
    doc.setTextColor(...INK)
    doc.text(v, W - M, my, { align: 'right' })
    my += 5.5
  }

  // Emisor y cliente
  const top = 56
  // El emisor es español: su identificador es el NIF (en otros idiomas, «NIF/VAT»)
  const nifEmisor = T.nif === 'NIF' ? 'NIF' : 'NIF/VAT'
  const yEmisor = bloqueDatos(doc, M, top, T.de, emisor, nifEmisor)
  const yCliente = bloqueDatos(doc, W / 2 + 4, top, esFactura ? T.facturarA : T.para, d.cliente || {}, T.nif)
  const startY = Math.max(yEmisor, yCliente) + 6

  // Líneas
  autoTable(doc, {
    startY,
    margin: { left: M, right: M },
    head: [[T.concepto, T.cant, T.precio, T.impuesto, T.importe]],
    body: d.lineas.map((l) => [l.concepto, num(l.cantidad), eur(l.precio), `${num(l.iva)} %`, eur(importeLinea(l))]),
    theme: 'plain',
    styles: { font: 'helvetica', fontSize: 9.5, cellPadding: { top: 3, bottom: 3, left: 2.5, right: 2.5 }, textColor: INK },
    headStyles: { fillColor: INK, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5 },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { halign: 'right', cellWidth: 16 },
      2: { halign: 'right', cellWidth: 28 },
      3: { halign: 'right', cellWidth: 16 },
      4: { halign: 'right', cellWidth: 30 },
    },
    didParseCell: (data) => {
      if (data.section === 'head' && data.column.index > 0) data.cell.styles.halign = 'right'
    },
    didDrawCell: (data) => {
      if (data.section === 'body') {
        doc.setDrawColor(...LINE)
        doc.setLineWidth(0.2)
        doc.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height)
      }
    },
  })

  // Totales
  const t = calcularTotales(d.lineas, Number(d.irpf_pct))
  let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8
  if (y > 240) {
    doc.addPage()
    y = 24
  }
  // Bloque de totales: los importes van con margen interior para que no queden pegados al borde del recuadro lima
  const xl = W - M - 78 // inicio del bloque
  const pad = 5 // aire interior a izquierda y derecha
  const xv = W - M - pad // columna de importes
  const fila = (label: string, valor: string) => {
    doc.setFontSize(9.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...MUTED)
    doc.text(label, xl + pad, y)
    doc.setTextColor(...INK)
    doc.text(valor, xv, y, { align: 'right' })
    y += 5.8
  }
  fila(T.base, eur(t.base))
  for (const r of t.desglose) fila(`${T.impuesto} ${num(r.tipo)} %${t.desglose.length > 1 ? ` (${T.sobreBase} ${eur(r.base)})` : ''}`, eur(r.cuota))
  if (t.cuota_irpf) fila(`${T.retencion} ${num(Number(d.irpf_pct))} %`, eur(-t.cuota_irpf))
  y += 2
  doc.setFillColor(...MARCA)
  doc.roundedRect(xl, y - 2, W - M - xl, 14, 3, 3, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12.5)
  doc.setTextColor(...textoSobre(MARCA))
  doc.text(T.total, xl + pad, y + 6.6)
  doc.text(eur(t.total), xv, y + 6.6, { align: 'right' })
  y += 22

  // Notas, forma de pago, pie
  const bloques: [string, string][] = []
  if (rectificativa) {
    const causa = CAUSAS_RECTIFICACION.find((c) => c.id === inv.causa_rectificacion)
    bloques.push([
      T.bloqueRectificativa,
      T.rectifica(inv.rectifica_numero ?? '', inv.rectifica_fecha ? fecha(inv.rectifica_fecha) : null) +
        (causa ? ` ${T.causa}: ${causa.id} · ${causa.nombre}.` : '') +
        (inv.motivo_rectificacion ? ` ${T.motivo}: ${inv.motivo_rectificacion}` : ''),
    ])
  }
  if (d.notas) bloques.push([T.notas, d.notas])
  if (esFactura && emisor.iban) bloques.push([T.formaPago, T.transferencia(emisor.iban)])
  if (emisor.pie_factura) bloques.push(['', emisor.pie_factura])
  for (const [titulo, texto] of bloques) {
    if (y > 270) {
      doc.addPage()
      y = 24
    }
    if (titulo) {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8)
      doc.setTextColor(...MUTED)
      doc.text(titulo.toUpperCase(), M, y)
      y += 4.5
    }
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...INK)
    const partes = doc.splitTextToSize(texto, W - 2 * M)
    doc.text(partes, M, y)
    y += partes.length * 4.2 + 4
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
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...MUTED)
    const pie = [emisor.nombre, emisor.nif ? `${nifEmisor} ${emisor.nif}` : null].filter(Boolean).join(' · ')
    doc.text(pie, M, 289)
    doc.text(T.pagina(p, paginas), W - M, 289, { align: 'right' })
    if (pruebas && !borrador) {
      doc.text(T.avisoPruebas, W / 2, 284, { align: 'center' })
    }
  }

  const nombre = `${esFactura ? T.archivoFactura : T.archivoPresupuesto}-${d.numero || T.borrador.toLowerCase()}.pdf`
  doc.save(nombre)
}
