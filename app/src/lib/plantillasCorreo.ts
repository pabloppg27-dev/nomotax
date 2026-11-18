/**
 * Plantillas de correo de cada empresa (Configuración → Plantillas): facturas, accesos, nóminas y presupuestos.
 * Cada una tiene asunto y mensaje con {variables}; el diseño (cabecera, logo, color de marca, pie) es común.
 * La factura tiene su propio diseño en correoFactura.ts; el resto usa htmlCorreoPlantilla().
 * Sin navegador: lo usan la vista previa de la app y las funciones del servidor (invitar-miembro…).
 */
import { NEGRO_CORREO, VARIABLES_CORREO, acentoSobre, colorValido, esc, plantillaPorDefecto, textoSobre } from './correoFactura'
import { eur, fecha as fmtFecha } from './format'
import { TEXTOS, idiomaDePais } from './idiomaFactura'
import type { Quote } from './types'

export type TipoPlantilla = 'factura' | 'acceso' | 'nomina' | 'presupuesto'

export interface VariablePlantilla {
  id: string
  detalle: string
}

export interface DefPlantilla {
  tipo: TipoPlantilla
  titulo: string
  /** Para qué se usa, en una línea */
  detalle: string
  /** Columnas de profiles donde se guarda (vacío = la de por defecto) */
  colAsunto: 'correo_asunto' | 'acceso_asunto' | 'nomina_asunto' | 'presupuesto_asunto'
  colMensaje: 'correo_mensaje' | 'acceso_mensaje' | 'nomina_mensaje' | 'presupuesto_mensaje'
  variables: VariablePlantilla[]
  porDefecto: { asunto: string; mensaje: string }
  /** El correo ya se envía desde la app (si no, solo se deja preparada la plantilla) */
  enUso: boolean
}

export const NOMBRE_ROL: Record<string, string> = { admin: 'Administración', socio: 'Socio', comercial: 'Comercial', empleado: 'Empleado' }

export const FUNCIONES_ROL: Record<string, string> = {
  admin: 'Llevar la gestión de la empresa: facturas, gastos, bancos y lo demás que te hayan activado.',
  socio: 'Ver cómo va la empresa: cifras clave, pérdidas y ganancias, balance y liquidez.',
  comercial: 'Hacer presupuestos y facturas y llevar la ficha de los clientes.',
  empleado: 'Subir tus tickets de gasto y ver tus nóminas y tus documentos.',
}

export const PLANTILLAS: DefPlantilla[] = [
  {
    tipo: 'factura',
    titulo: 'Facturas',
    detalle: 'El correo con el que envías cada factura a tu cliente (con el PDF adjunto).',
    colAsunto: 'correo_asunto',
    colMensaje: 'correo_mensaje',
    variables: VARIABLES_CORREO,
    porDefecto: plantillaPorDefecto('es'),
    enUso: true,
  },
  {
    tipo: 'acceso',
    titulo: 'Accesos',
    detalle: 'El correo que recibe cada persona a la que das acceso a la empresa. Los datos de acceso se añaden solos.',
    colAsunto: 'acceso_asunto',
    colMensaje: 'acceso_mensaje',
    variables: [
      { id: 'nombre', detalle: 'Nombre de la persona' },
      { id: 'empresa', detalle: 'Tu nombre o marca' },
      { id: 'rol', detalle: 'Su rol (Administración, Socio…)' },
      { id: 'funciones', detalle: 'Lo que puede hacer con ese rol' },
    ],
    porDefecto: {
      asunto: 'Tienes acceso a {empresa}',
      mensaje: 'Hola {nombre}:\n\n{empresa} te ha dado acceso a su Área de clientes como {rol}.\n\n{funciones}',
    },
    enUso: true,
  },
  {
    tipo: 'nomina',
    titulo: 'Nóminas',
    detalle: 'El correo con el que enviarás cada nómina a tus trabajadores (con el PDF adjunto).',
    colAsunto: 'nomina_asunto',
    colMensaje: 'nomina_mensaje',
    variables: [
      { id: 'trabajador', detalle: 'Nombre del trabajador' },
      { id: 'mes', detalle: 'Mes de la nómina (por ejemplo, octubre de 2026)' },
      { id: 'empresa', detalle: 'Tu nombre o marca' },
    ],
    porDefecto: {
      asunto: 'Tu nómina de {mes} · {empresa}',
      mensaje:
        'Hola {trabajador}:\n\nTe adjuntamos tu nómina de {mes}. Si ves cualquier error o tienes alguna duda, responde a este correo y lo revisamos.\n\nUn saludo.',
    },
    enUso: false,
  },
  {
    tipo: 'presupuesto',
    titulo: 'Presupuestos',
    detalle: 'El correo con el que envías cada presupuesto a tu cliente (con el PDF adjunto).',
    colAsunto: 'presupuesto_asunto',
    colMensaje: 'presupuesto_mensaje',
    variables: [
      { id: 'cliente', detalle: 'Nombre del cliente' },
      { id: 'numero', detalle: 'Número de presupuesto' },
      { id: 'total', detalle: 'Importe total' },
      { id: 'fecha', detalle: 'Fecha del presupuesto' },
      { id: 'validez', detalle: 'Hasta cuándo es válido' },
      { id: 'empresa', detalle: 'Tu nombre o marca' },
    ],
    porDefecto: {
      asunto: 'Presupuesto {numero} · {empresa}',
      mensaje:
        'Estimado cliente:\n\nLe enviamos el presupuesto {numero} por un importe de {total}, válido hasta el {validez}. Encontrará el PDF adjunto.\n\nQuedamos a su disposición para cualquier consulta.',
    },
    enUso: true,
  },
]

export const plantillaDe = (tipo: TipoPlantilla): DefPlantilla => PLANTILLAS.find((p) => p.tipo === tipo) as DefPlantilla

/** Cambia {nombre}, {empresa}… por sus datos (las variables que no existen se quedan como están) */
export function rellenarVars(texto: string, vars: Record<string, string>): string {
  return texto.replace(/\{\s*([a-zA-Z]+)\s*\}/g, (m, k: string) => (k.toLowerCase() in vars ? vars[k.toLowerCase()] : m))
}

/** Asunto y mensaje listos para enviar: lo que ha escrito la empresa o, si está vacío, lo de por defecto */
export function correoDePlantilla(
  tipo: TipoPlantilla,
  guardada: { asunto?: string | null; mensaje?: string | null },
  vars: Record<string, string>,
): { asunto: string; mensaje: string } {
  const def = plantillaDe(tipo).porDefecto
  return {
    asunto: rellenarVars(guardada.asunto?.trim() || def.asunto, vars).replace(/\s+/g, ' ').trim(),
    // Si una variable va vacía (p. ej. sin nombre) no queda «Hola :»
    mensaje: rellenarVars(guardada.mensaje?.trim() || def.mensaje, vars).replace(/ +([:,;])/g, '$1'),
  }
}

/** Correo del presupuesto a un cliente de fuera de España: la plantilla propia está en español, se usa esta */
const PRESUPUESTO_EN = {
  asunto: 'Quote {numero} · {empresa}',
  mensaje: 'Dear Customer,\n\nPlease find attached quote {numero} for {total}, valid until {validez}.\n\nPlease let us know if you have any questions.',
}

/** Idioma del correo (el PDF sale en el del cliente; el correo, en español o en inglés, como el de las facturas) */
export const lenguaCorreo = (pais: string | null | undefined): 'es' | 'en' => (idiomaDePais(pais) === 'es' ? 'es' : 'en')

/** Variables del correo de un presupuesto (las mismas en la vista previa y en la función enviar-factura) */
export function variablesPresupuesto(q: Pick<Quote, 'numero' | 'fecha' | 'valido_hasta' | 'total' | 'cliente'>, empresa: string): Record<string, string> {
  const numero = q.numero ?? ''
  return {
    empresa,
    cliente: q.cliente?.nombre?.trim() || '',
    numero,
    total: eur(Number(q.total)),
    fecha: fmtFecha(q.fecha),
    validez: q.valido_hasta ? fmtFecha(q.valido_hasta) : '—',
    archivo: `${TEXTOS[idiomaDePais(q.cliente?.pais)].archivoPresupuesto}-${numero}.pdf`,
  }
}

/** Asunto y mensaje del presupuesto: la plantilla de la empresa o, a un cliente extranjero, la de por defecto en inglés */
export function correoDePresupuesto(
  guardada: { asunto?: string | null; mensaje?: string | null },
  vars: Record<string, string>,
  pais: string | null | undefined,
): { asunto: string; mensaje: string } {
  return correoDePlantilla('presupuesto', lenguaCorreo(pais) === 'es' ? guardada : PRESUPUESTO_EN, vars)
}

/** Datos de ejemplo para la vista previa de cada plantilla */
export function ejemploPlantilla(tipo: TipoPlantilla, empresa: string): Record<string, string> {
  const base = { empresa }
  if (tipo === 'acceso') {
    return { ...base, nombre: 'Laura', rol: NOMBRE_ROL.admin, funciones: FUNCIONES_ROL.admin, usuario: 'laura@tuempresa.com', contrasena: 'k7Hq2mXp9WtB4n' }
  }
  if (tipo === 'nomina') return { ...base, trabajador: 'Laura García', mes: 'octubre de 2026', archivo: 'Nomina-2026-10.pdf' }
  return { ...base, cliente: 'Laura García', numero: 'P2026-0001', total: '1.210,00€', fecha: '17/11/2026', validez: '17/12/2026', archivo: 'Presupuesto-P2026-0001.pdf' }
}

export interface DisenoPlantilla {
  empresa: string
  /** Acento (franja, etiqueta, resaltados): #RRGGBB; vacío = lima de NomoTax */
  color?: string | null
  /** Fondo de la cabecera: #RRGGBB; vacío = negro */
  cabecera?: string | null
  /** Botón de entrada del correo de accesos: #RRGGBB; vacío = negro */
  boton?: string | null
  /** URL del logo (en el servidor, «cid:…», adjunto en línea) */
  logo?: string | null
  /** Email al que van las respuestas (sale al pie) */
  respuesta?: string | null
  telefono?: string | null
  /** Idioma del correo (solo cambia el de presupuestos; por defecto, español) */
  lengua?: 'es' | 'en'
}

const FONT = 'Helvetica,Arial,sans-serif'
export const APP_URL = 'https://clientes.nomotax.io'

const ETIQUETA: Record<Exclude<TipoPlantilla, 'factura'>, string> = { acceso: 'ACCESO', nomina: 'NÓMINA', presupuesto: 'PRESUPUESTO' }

/** Textos fijos del correo de presupuestos en cada idioma (accesos y nóminas, siempre en español) */
const FRASES = {
  es: {
    etiqueta: 'PRESUPUESTO',
    titulo: (e: string) => `Presupuesto de ${e}`,
    total: 'Total',
    valido: (f: string) => `Válido hasta el ${f}`,
    dudas: 'Si tienes cualquier duda, responde a este correo o escríbenos a:',
    enviado: 'Enviado con',
  },
  en: {
    etiqueta: 'QUOTE',
    titulo: (e: string) => `Quote from ${e}`,
    total: 'Total',
    valido: (f: string) => `Valid until ${f}`,
    dudas: 'If you have any questions, reply to this email or write to us at:',
    enviado: 'Sent with',
  },
}

/** Cuadro de resumen de cada tipo (accesos, datos de la nómina o del presupuesto) */
function cuadro(tipo: Exclude<TipoPlantilla, 'factura'>, v: Record<string, string>, color: string, F = FRASES.es): string {
  const etiqueta = (t: string) => `<span style="color:#6b6b66;font-size:12px;letter-spacing:1px">${t}</span><br>`
  let dentro = ''
  if (tipo === 'acceso') {
    const clave = v.contrasena
      ? `Contraseña provisional: <strong style="font-family:Menlo,Consolas,monospace;font-size:16px;background:${color};color:${textoSobre(color)};padding:2px 6px;border-radius:6px">${esc(v.contrasena)}</strong>`
      : 'Contraseña: <strong>la que ya usas en NomoTax</strong><br><span style="color:#6b6b66">Arriba, en la barra lateral, podrás elegir la empresa.</span>'
    dentro = `${etiqueta('TUS ACCESOS')}Usuario: <strong>${esc(v.usuario ?? '')}</strong><br>${clave}`
  } else if (tipo === 'nomina') {
    dentro = `${etiqueta('NÓMINA')}<strong style="font-size:17px">${esc(v.mes ?? '')}</strong><br><span style="color:#6b6b66">📎 ${esc(v.archivo ?? '')}</span>`
  } else {
    dentro = `${etiqueta(F.etiqueta)}<strong style="font-size:17px">${esc(v.numero ?? '')}</strong> · <span style="color:#6b6b66">${esc(v.fecha ?? '')}</span><br>${F.total}: <strong style="font-family:Menlo,Consolas,monospace;background:${color};color:${textoSobre(color)};padding:2px 8px;border-radius:6px;white-space:nowrap">${esc(v.total ?? '')}</strong><br><span style="color:#6b6b66">${esc(F.valido(v.validez ?? ''))} · 📎 ${esc(v.archivo ?? '')}</span>`
  }
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7f5;border-radius:14px;margin-top:8px"><tr><td style="padding:18px 20px;font:15px/1.7 ${FONT};color:#111110">${dentro}</td></tr></table>`
}

const TITULO: Record<Exclude<TipoPlantilla, 'factura'>, (v: Record<string, string>) => string> = {
  acceso: (v) => `Hola${v.nombre ? ' ' + v.nombre : ''}, ya tienes acceso`,
  nomina: (v) => `Tu nómina de ${v.mes ?? ''}`,
  presupuesto: (v) => `Presupuesto de ${v.empresa ?? ''}`,
}

/** HTML del correo de accesos, nóminas y presupuestos, con la marca de la empresa */
export function htmlCorreoPlantilla(
  tipo: Exclude<TipoPlantilla, 'factura'>,
  mensaje: string,
  v: Record<string, string>,
  diseno: DisenoPlantilla,
): string {
  const color = colorValido(diseno.color)
  const cabecera = colorValido(diseno.cabecera, NEGRO_CORREO)
  const colorBoton = colorValido(diseno.boton, NEGRO_CORREO)
  const acento = acentoSobre(color, cabecera)
  const F = FRASES[tipo === 'presupuesto' && diseno.lengua === 'en' ? 'en' : 'es']
  const etiqueta = tipo === 'presupuesto' ? F.etiqueta : ETIQUETA[tipo]
  const titulo = tipo === 'presupuesto' ? F.titulo(v.empresa ?? '') : TITULO[tipo](v)
  const parrafos = mensaje
    .trim()
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px 0">${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('')
  const logo = diseno.logo
    ? `<td style="padding-right:14px" valign="middle"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:#ffffff;border-radius:10px;padding:6px 8px"><img src="${esc(diseno.logo)}" alt="" height="32" style="display:block;height:32px;width:auto;max-width:150px;border:0"></td></tr></table></td>`
    : ''
  const contacto = [
    diseno.respuesta ? `<a href="mailto:${esc(diseno.respuesta)}" style="color:#111110;font-weight:600">${esc(diseno.respuesta)}</a>` : '',
    diseno.telefono ? `<a href="tel:${esc(diseno.telefono.replace(/[^\d+]/g, ''))}" style="color:#111110;font-weight:600">${esc(diseno.telefono)}</a>` : '',
  ]
    .filter(Boolean)
    .join(' &nbsp;·&nbsp; ')
  const boton =
    tipo === 'acceso'
      ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 8px 0"><tr><td style="background:${colorBoton};border-radius:999px"><a href="${APP_URL}" style="display:inline-block;padding:14px 28px;font:600 15px ${FONT};color:${textoSobre(colorBoton)};text-decoration:none">Entrar en el Área de clientes →</a></td></tr></table>${v.contrasena ? `<p style="margin:0 0 16px 0;font-size:13px;color:#6b6b66">Al entrar, cambia la contraseña en «Mi perfil».</p>` : ''}`
      : ''

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"></head><body style="margin:0;padding:0;background:#f7f7f5">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7f5;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e7e7e2">
  <tr><td style="background:${cabecera};padding:24px 32px">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      ${logo}
      <td valign="middle" style="font:600 18px/1.3 ${FONT};color:${textoSobre(cabecera)}">${esc(diseno.empresa)}<br>
        <span style="font:500 11px ${FONT};letter-spacing:2px;color:${acento}">${etiqueta}</span></td>
    </tr></table>
  </td></tr>
  <tr><td style="height:4px;line-height:4px;font-size:0;background:${color}">&nbsp;</td></tr>
  <tr><td style="padding:30px 32px 8px 32px;font:15px/1.6 ${FONT};color:#111110">
    <h1 style="margin:0 0 18px 0;font:600 24px/1.25 ${FONT};color:#111110">${esc(titulo)}</h1>
    ${parrafos}
    ${cuadro(tipo, v, color, F)}
    ${boton}
    <p style="margin:0 0 22px 0"></p>
  </td></tr>
  <tr><td style="padding:8px 32px 30px 32px;font:14px/1.6 ${FONT};color:#111110;border-top:1px solid #efefea">
    ${contacto ? `<p style="margin:18px 0 4px 0">${F.dudas}</p>${contacto}` : ''}
    <p style="margin:18px 0 0 0"><strong>${esc(diseno.empresa)}</strong></p>
  </td></tr>
</table>
<p style="font:12px ${FONT};color:#9a9a94;margin:16px 0 0 0">${F.enviado} NomoTax · <a href="https://nomotax.io" style="color:#9a9a94">nomotax.io</a></p>
</td></tr></table></body></html>`
}

/** Versión en texto plano */
export function textoCorreoPlantilla(
  tipo: Exclude<TipoPlantilla, 'factura'>,
  mensaje: string,
  v: Record<string, string>,
  diseno: DisenoPlantilla,
): string {
  const F = FRASES[tipo === 'presupuesto' && diseno.lengua === 'en' ? 'en' : 'es']
  const extra =
    tipo === 'acceso'
      ? [`Entra en: ${APP_URL}`, `Usuario: ${v.usuario ?? ''}`, v.contrasena ? `Contraseña provisional: ${v.contrasena}` : 'Contraseña: la que ya usas en NomoTax.']
      : tipo === 'nomina'
        ? [`Nómina: ${v.mes ?? ''}`, `Adjunto: ${v.archivo ?? ''}`]
        : [`${F.etiqueta.charAt(0) + F.etiqueta.slice(1).toLowerCase()} ${v.numero ?? ''} · ${v.fecha ?? ''}`, `${F.total}: ${v.total ?? ''}`, F.valido(v.validez ?? '')]
  return [
    tipo === 'presupuesto' ? F.titulo(v.empresa ?? '') : TITULO[tipo](v),
    '',
    mensaje.trim(),
    '',
    ...extra,
    '',
    [diseno.respuesta, diseno.telefono].filter(Boolean).join(' · '),
    diseno.empresa,
    '',
    `— ${F.enviado} NomoTax · nomotax.io`,
  ]
    .filter((l, i, a) => !(l === '' && a[i - 1] === ''))
    .join('\n')
}
