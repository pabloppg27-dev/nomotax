/**
 * Correo con el que una empresa envía su factura a su cliente (función enviar-factura).
 * Mismo diseño que el correo de las facturas de NomoTax (supabase/functions/facturar-planes/correo.ts):
 * cabecera oscura con el logo y el nombre de la empresa, resumen con el total, conceptos, impuestos y pago.
 * El asunto y el mensaje se editan en Configuración → Envío de facturas. Al pie, una marca discreta de NomoTax.
 * Sin navegador: lo usan la vista previa de la app y la función del servidor.
 */
import { eur, fecha as fmtFecha } from './format'
import { TEXTOS, idiomaDePais, type Idioma } from './idiomaFactura'
import { calcularTotales, importeLinea } from './totals'
import type { Linea } from './types'

export const VARIABLES_CORREO: { id: string; detalle: string }[] = [
  { id: 'cliente', detalle: 'Nombre del cliente' },
  { id: 'numero', detalle: 'Número de factura' },
  { id: 'total', detalle: 'Importe total' },
  { id: 'fecha', detalle: 'Fecha de la factura' },
  { id: 'vencimiento', detalle: 'Fecha de vencimiento' },
  { id: 'empresa', detalle: 'Tu nombre o marca' },
]

/** Plantilla por defecto. Si el cliente es de fuera (PDF en otro idioma), en inglés */
export function plantillaPorDefecto(idioma: Idioma = 'es'): { asunto: string; mensaje: string } {
  if (idioma === 'es') {
    return {
      asunto: 'Factura {numero} · {empresa}',
      mensaje:
        'Estimado cliente:\n\nLe enviamos la factura {numero} por un importe de {total}, con vencimiento el {vencimiento}. Encontrará el PDF adjunto y el detalle de los conceptos a continuación.\n\nQuedamos a su disposición para cualquier consulta.',
    }
  }
  return {
    asunto: 'Invoice {numero} · {empresa}',
    mensaje:
      'Dear Customer,\n\nPlease find attached invoice {numero} for {total}, due on {vencimiento}. The breakdown of the charges is shown below.\n\nPlease let us know if you have any questions.',
  }
}

export interface DatosFacturaCorreo {
  cliente: string | null
  numero: string
  fecha: string
  vencimiento: string | null
  total: number
  empresa: string
  pais?: string | null
  /** Conceptos y retención, para el detalle del correo */
  lineas?: Linea[] | null
  irpf_pct?: number | null
}

/** Cambia {cliente}, {numero}… por los datos de la factura (las que no existen se quedan como están) */
export function rellenar(texto: string, d: DatosFacturaCorreo): string {
  const v: Record<string, string> = {
    cliente: d.cliente?.trim() || '',
    numero: d.numero,
    total: eur(d.total),
    fecha: fmtFecha(d.fecha),
    vencimiento: d.vencimiento ? fmtFecha(d.vencimiento) : '—',
    empresa: d.empresa,
  }
  return texto.replace(/\{\s*([a-zA-Z]+)\s*\}/g, (m, k: string) => (k.toLowerCase() in v ? v[k.toLowerCase()] : m))
}

/** Asunto y mensaje listos para enviar: la plantilla de la empresa o la de por defecto */
export function correoDeFactura(
  plantilla: { asunto?: string | null; mensaje?: string | null },
  d: DatosFacturaCorreo,
): { asunto: string; mensaje: string } {
  const idioma = idiomaDePais(d.pais)
  const def = plantillaPorDefecto(idioma === 'es' ? 'es' : 'en')
  // La plantilla propia está en el idioma de la empresa; a un cliente extranjero se le manda la de por defecto en inglés
  const propia = idioma === 'es'
  const asunto = (propia && plantilla.asunto?.trim()) || def.asunto
  const mensaje = (propia && plantilla.mensaje?.trim()) || def.mensaje
  return { asunto: rellenar(asunto, d).replace(/\s+/g, ' ').trim(), mensaje: rellenar(mensaje, d) }
}

export function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)
}

/** Textos fijos del diseño (el resto, de TEXTOS de la factura) */
const FRASES = {
  es: {
    etiqueta: 'FACTURA',
    etiquetaRect: 'FACTURA RECTIFICATIVA',
    atencion: (n: string) => `A la atención de ${n}`,
    titulo: (e: string) => `Factura de ${e}`,
    tituloRect: (e: string) => `Factura rectificativa de ${e}`,
    pago: (iban: string, num: string) =>
      `Pago por transferencia a <strong style="color:#111110">${iban}</strong>, indicando la referencia <strong style="color:#111110">${num}</strong>.`,
    qr: 'El PDF incluye un código QR para pagar desde su banco.',
    vence: 'Vencimiento',
    adjunto: 'Documento adjunto',
    dudas: 'Si tiene cualquier duda, puede responder a este correo o contactarnos en:',
    saludo: 'Atentamente,',
    enviadaCon: 'Enviada con',
  },
  en: {
    etiqueta: 'INVOICE',
    etiquetaRect: 'CORRECTIVE INVOICE',
    atencion: (n: string) => `For the attention of ${n}`,
    titulo: (e: string) => `Invoice from ${e}`,
    tituloRect: (e: string) => `Corrective invoice from ${e}`,
    pago: (iban: string, num: string) =>
      `Payment by bank transfer to <strong style="color:#111110">${iban}</strong>, quoting <strong style="color:#111110">${num}</strong> as the reference.`,
    qr: 'The PDF includes a QR code to pay from your bank.',
    vence: 'Due',
    adjunto: 'Attached document',
    dudas: 'If you have any questions, you can reply to this email or contact us at:',
    saludo: 'Yours sincerely,',
    enviadaCon: 'Sent with',
  },
}

const LIMA = '#CDF564'

export function colorValido(hex: string | null | undefined, porDefecto: string = LIMA): string {
  return /^#[0-9a-f]{6}$/i.test((hex ?? '').trim()) ? (hex as string).trim() : porDefecto
}

/** Cabecera y botón de los correos: negro de NomoTax salvo que la empresa elija otro color */
export const NEGRO_CORREO = '#111110'

/** Relación de contraste entre dos colores (1 a 21; a partir de 3 se lee bien un texto grande o en negrita) */
export function contraste(a: string, b: string): number {
  const [x, y] = [luminancia(a), luminancia(b)]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

/** El color de acento para escribir sobre la cabecera; si no se lee sobre ese fondo, blanco o negro */
export function acentoSobre(acento: string, fondo: string): string {
  return contraste(acento, fondo) >= 3 ? acento : textoSobre(fondo)
}

export function luminancia(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  const lin = (c: number) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255)
}

/** Negro o blanco, lo que mejor se lea sobre el color */
export const textoSobre = (hex: string) => (luminancia(hex) > 0.179 ? '#111110' : '#ffffff')

/** Mezcla el color con blanco (a = proporción del color) */
export function tinte(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16)
  const m = (c: number) => Math.round(255 - (255 - c) * a)
  return `#${[m((n >> 16) & 255), m((n >> 8) & 255), m(n & 255)].map((c) => c.toString(16).padStart(2, '0')).join('')}`
}

export interface DisenoCorreo {
  /** Nombre comercial o razón social */
  empresa: string
  /** Acento (franja, caja del total, etiqueta): #RRGGBB; vacío = lima de NomoTax */
  color?: string | null
  /** Fondo de la cabecera: #RRGGBB; vacío = negro */
  cabecera?: string | null
  /** URL del logo (en el servidor, «cid:…», adjunto en línea) */
  logo?: string | null
  /** Email al que van las respuestas (sale al pie) */
  respuesta?: string | null
  telefono?: string | null
  iban?: string | null
  rectificativa?: boolean
}

const FONT = 'Helvetica,Arial,sans-serif'

/** HTML del correo, con el diseño de las facturas de NomoTax y la marca de la empresa */
export function htmlCorreoFactura(mensaje: string, d: DatosFacturaCorreo, diseno: DisenoCorreo): string {
  const idioma = idiomaDePais(d.pais)
  // El correo va en español o en inglés (el PDF sí sale en el idioma del cliente)
  const lengua = idioma === 'es' ? 'es' : 'en'
  const T = TEXTOS[lengua]
  const F = FRASES[lengua]
  const color = colorValido(diseno.color)
  const cabecera = colorValido(diseno.cabecera, NEGRO_CORREO)
  const textoCab = textoSobre(cabecera)
  // Sobre la cabecera, un acento que no contraste no se leería: se usa blanco o negro
  const acento = acentoSobre(color, cabecera)
  const rect = Boolean(diseno.rectificativa)
  const cliente = d.cliente?.trim() ?? ''

  const parrafos = mensaje
    .trim()
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px 0">${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('')

  const logo = diseno.logo
    ? `<td style="padding-right:14px" valign="middle"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:#ffffff;border-radius:10px;padding:6px 8px"><img src="${esc(diseno.logo)}" alt="" height="32" style="display:block;height:32px;width:auto;max-width:150px;border:0"></td></tr></table></td>`
    : ''

  const fila = (izq: string, der: string, fuerte = false) => `
      <tr><td style="padding:6px 0;font:${fuerte ? '600 ' : ''}14px/1.5 ${FONT};color:${fuerte ? '#111110' : '#6b6b66'}">${izq}</td>
      <td align="right" style="padding:6px 0;font:${fuerte ? '600 ' : ''}14px/1.5 ${FONT};color:#111110;white-space:nowrap">${der}</td></tr>`

  const lineas = (d.lineas ?? []).filter((l) => l.concepto?.trim() || Number(l.precio))
  const conceptos = lineas
    .map((l) => {
      const [titulo, ...resto] = String(l.concepto ?? '').split('\n')
      const detalle = resto.join(' ').trim()
      const cantidad = Number(l.cantidad || 0)
      const extra = [
        cantidad !== 1 ? `${cantidad.toLocaleString('es-ES')} × ${eur(Number(l.precio))}` : '',
        Number(l.descuento) ? `−${Number(l.descuento)}%` : '',
      ]
        .filter(Boolean)
        .join(' · ')
      return `
      <tr><td style="padding:12px 0;border-bottom:1px solid #e7e7e2;font:14px/1.45 ${FONT};color:#111110">
        <strong>${esc(titulo)}</strong>${detalle ? `<br><span style="color:#6b6b66">${esc(detalle)}</span>` : ''}${extra ? `<br><span style="color:#6b6b66">${esc(extra)}</span>` : ''}
      </td>
      <td align="right" valign="top" style="padding:12px 0 12px 16px;border-bottom:1px solid #e7e7e2;font:14px/1.45 ${FONT};color:#111110;white-space:nowrap">${esc(eur(importeLinea(l)))}</td></tr>`
    })
    .join('')

  let impuestos = ''
  if (lineas.length) {
    const irpf = Number(d.irpf_pct || 0)
    const t = calcularTotales(lineas, irpf)
    impuestos =
      fila(esc(T.base), esc(eur(t.base))) +
      t.desglose.map((x) => fila(`${esc(T.impuesto)} ${x.tipo}%`, esc(eur(x.cuota)))).join('') +
      (t.cuota_irpf ? fila(`${esc(T.retencion)} ${irpf}%`, `−${esc(eur(t.cuota_irpf))}`) : '') +
      fila(esc(T.total.charAt(0) + T.total.slice(1).toLowerCase()), esc(eur(d.total)), true)
  }

  const iban = diseno.iban?.toUpperCase().replace(/\s+/g, ' ').trim()
  const contacto = [
    diseno.respuesta ? `<a href="mailto:${esc(diseno.respuesta)}" style="color:#111110;font-weight:600">${esc(diseno.respuesta)}</a>` : '',
    diseno.telefono ? `<a href="tel:${esc(diseno.telefono.replace(/[^\d+]/g, ''))}" style="color:#111110;font-weight:600">${esc(diseno.telefono)}</a>` : '',
  ]
    .filter(Boolean)
    .join(' &nbsp;·&nbsp; ')

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"></head><body style="margin:0;padding:0;background:#f7f7f5">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7f5;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e7e7e2">
  <tr><td style="background:${cabecera};padding:24px 32px">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      ${logo}
      <td valign="middle" style="font:600 18px/1.3 ${FONT};color:${textoCab}">${esc(diseno.empresa)}<br>
        <span style="font:500 11px ${FONT};letter-spacing:2px;color:${acento}">${rect ? F.etiquetaRect : F.etiqueta}</span></td>
    </tr></table>
  </td></tr>
  <tr><td style="height:4px;line-height:4px;font-size:0;background:${color}">&nbsp;</td></tr>
  <tr><td style="padding:30px 32px 8px 32px;font:15px/1.6 ${FONT};color:#111110">
    ${cliente ? `<p style="margin:0 0 4px 0;font:13px/1.5 ${FONT};color:#6b6b66">${esc(F.atencion(cliente))}</p>` : ''}
    <h1 style="margin:0 0 18px 0;font:600 24px/1.25 ${FONT};color:#111110">${esc(rect ? F.tituloRect(diseno.empresa) : F.titulo(diseno.empresa))}</h1>
    ${parrafos}

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7f5;border-radius:14px;margin-top:8px">
      <tr><td style="padding:18px 20px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="font:14px/1.5 ${FONT};color:#111110">
            <span style="color:#6b6b66;font-size:12px;letter-spacing:1px">${rect ? F.etiquetaRect : F.etiqueta}</span><br>
            <strong style="font-size:17px">${esc(d.numero)}</strong><br>
            <span style="color:#6b6b66">${esc(fmtFecha(d.fecha))}${d.vencimiento ? ` · ${F.vence}: ${esc(fmtFecha(d.vencimiento))}` : ''}</span>
          </td>
          <td align="right" valign="top" style="font:14px/1.5 ${FONT};color:#111110">
            <span style="color:#6b6b66;font-size:12px;letter-spacing:1px">${esc(T.total)}</span><br>
            <strong style="font-family:Menlo,Consolas,monospace;font-size:18px;background:${color};color:${textoSobre(color)};padding:2px 8px;border-radius:6px;white-space:nowrap">${esc(eur(d.total))}</strong>
          </td>
        </tr></table>
      </td></tr>
    </table>

    ${
      conceptos
        ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0 4px 0">
      ${conceptos}
      ${impuestos}
    </table>`
        : ''
    }

    ${iban ? `<p style="margin:16px 0 0 0;font-size:14px;color:#6b6b66">${F.pago(esc(iban), esc(d.numero))} ${F.qr}</p>` : ''}
    <p style="margin:16px 0 22px 0;font-size:13px;color:#6b6b66">📎 ${F.adjunto}: ${esc(T.archivoFactura)}-${esc(d.numero)}.pdf</p>
  </td></tr>
  <tr><td style="padding:8px 32px 30px 32px;font:14px/1.6 ${FONT};color:#111110;border-top:1px solid #efefea">
    <p style="margin:18px 0 4px 0">${F.dudas}</p>
    ${contacto}
    <p style="margin:18px 0 0 0">${F.saludo}<br><strong>${esc(diseno.empresa)}</strong></p>
  </td></tr>
</table>
<p style="font:12px ${FONT};color:#9a9a94;margin:16px 0 0 0">${F.enviadaCon} NomoTax · <a href="https://nomotax.io" style="color:#9a9a94">nomotax.io</a></p>
</td></tr></table></body></html>`
}

/** Versión en texto plano (algunos programas de correo la prefieren) */
export function textoCorreoFactura(mensaje: string, d: DatosFacturaCorreo, diseno: DisenoCorreo): string {
  const idioma = idiomaDePais(d.pais)
  // El correo va en español o en inglés (el PDF sí sale en el idioma del cliente)
  const lengua = idioma === 'es' ? 'es' : 'en'
  const T = TEXTOS[lengua]
  const F = FRASES[lengua]
  const cliente = d.cliente?.trim() ?? ''
  const lineas = (d.lineas ?? []).filter((l) => l.concepto?.trim() || Number(l.precio))
  const iban = diseno.iban?.toUpperCase().replace(/\s+/g, ' ').trim()
  return [
    cliente ? F.atencion(cliente) : '',
    diseno.rectificativa ? F.tituloRect(diseno.empresa) : F.titulo(diseno.empresa),
    '',
    mensaje.trim(),
    '',
    `${diseno.rectificativa ? F.etiquetaRect : F.etiqueta} ${d.numero} · ${fmtFecha(d.fecha)}`,
    ...lineas.map((l) => `· ${String(l.concepto).split('\n')[0]}: ${eur(importeLinea(l))}`),
    `${T.total}: ${eur(d.total)}`,
    iban ? F.pago(iban, d.numero).replace(/<[^>]+>/g, '') : '',
    '',
    F.dudas,
    [diseno.respuesta, diseno.telefono].filter(Boolean).join(' · '),
    '',
    F.saludo,
    diseno.empresa,
    '',
    `— ${F.enviadaCon} NomoTax · nomotax.io`,
  ]
    .filter((l, i, a) => !(l === '' && a[i - 1] === ''))
    .join('\n')
}
