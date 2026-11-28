/**
 * Correos del registro de jornada (Edge Function «jornada»): informe semanal al trabajador, informe del
 * equipo al propietario y avisos de ausencias. Diseño aprobado por Pablo (maquetas de test-data/).
 * HTML de correo: tablas y estilos en línea. Botones sin flecha.
 */
import { duracionCorta, textoSemana, type DiaInforme, type InformeTrabajador } from './informeJornada.ts'
import type { TipoAusencia } from './ausencias.ts'

export const APP_URL = 'https://clientes.nomotax.io'
const LOGO = 'https://clientes.nomotax.io/logo.png'
const F = 'Helvetica,Arial,sans-serif'
const MONO = 'Menlo,Consolas,monospace'
const GRIS = '#6b6b66'
const LINEA = '#e7e7e2'

export function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)
}

const pila = (nombre: string) => nombre.trim().split(/\s+/)[0] ?? ''

type Tono = 'ok' | 'falta' | 'salida' | 'pend' | 'aus' | 'gris'
function chip(tono: Tono, texto: string): string {
  const c: Record<Tono, [string, string]> = {
    ok: ['#CDF564', '#111110'],
    falta: ['#fde7e4', '#a8200d'],
    salida: ['#fff1d6', '#8a5a00'],
    pend: ['#e8eefc', '#2a4a9c'],
    aus: ['#eef9cf', '#3d5200'],
    gris: ['#efefea', '#4a4a45'],
  }
  const [bg, fg] = c[tono]
  return `<span style="display:inline-block;margin:3px 4px 0 0;padding:2px 8px;border-radius:999px;background:${bg};color:${fg};font:600 11px/1.6 ${F};white-space:nowrap">${esc(texto)}</span>`
}

function cabecera(empresa: string, etiqueta: string): string {
  return `
  <tr><td style="background:#111110;padding:24px 28px">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td><img src="${LOGO}" width="40" height="40" alt="" style="display:block;border-radius:8px"></td>
      <td style="padding-left:12px;font:600 17px/1.3 ${F};color:#ffffff">${esc(empresa)}<br>
        <span style="font:500 11px ${F};letter-spacing:2px;color:#CDF564">${etiqueta}</span></td>
    </tr></table>
  </td></tr>`
}

function barra(hecho: number, total: number): string {
  const p = total > 0 ? Math.max(0, Math.min(100, Math.round((hecho / total) * 100))) : 100
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px;border-radius:999px;overflow:hidden;background:#e7e7e2"><tr>
    <td width="${Math.max(p, 1)}%" style="height:10px;background:${p >= 100 ? '#CDF564' : '#111110'};font-size:0;line-height:0">&nbsp;</td>
    ${p < 100 ? `<td width="${100 - p}%" style="height:10px;font-size:0;line-height:0">&nbsp;</td>` : ''}
  </tr></table>`
}

const cifra = (titulo: string, valor: string, destacar = false) => `
  <td valign="top" style="padding:0 6px 0 0;font:13px/1.4 ${F};color:#111110">
    <span style="color:${GRIS};font-size:11px;letter-spacing:1px">${titulo}</span><br>
    <strong style="font:600 19px/1.4 ${MONO};${destacar ? 'background:#CDF564;padding:1px 6px;border-radius:6px;' : ''}white-space:nowrap">${valor}</strong>
  </td>`

const cajaLegal = (titulo: string, texto: string) => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:26px 0 6px 0;border-left:3px solid #111110;background:#f7f7f5;border-radius:0 12px 12px 0">
    <tr><td style="padding:16px 18px;font:13px/1.6 ${F};color:#3a3a36">
      <strong style="display:block;margin-bottom:4px;color:#111110;font-size:14px">${titulo}</strong>${texto}
    </td></tr></table>`

const boton = (href: string, texto: string) => `
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 8px 0"><tr><td style="background:#111110;border-radius:999px">
    <a href="${href}" style="display:inline-block;padding:14px 26px;font:600 15px ${F};color:#ffffff;text-decoration:none">${texto}</a>
  </td></tr></table>`

function envoltorio(filas: string, pie: string, prueba?: boolean): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;padding:0;background:#f7f7f5">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7f5;padding:28px 10px"><tr><td align="center">
${prueba ? `<p style="font:600 12px ${F};color:#a8200d;margin:0 0 10px 0">PRUEBA: este correo solo te llega a ti</p>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid ${LINEA}">
${filas}
</table>
<p style="font:12px/1.6 ${F};color:#9a9a94;margin:16px 8px 0 8px;max-width:560px">${pie}</p>
</td></tr></table></body></html>`
}

const contacto = `
  <tr><td style="padding:14px 28px 26px 28px;font:13px/1.6 ${F};color:#111110;border-top:1px solid #efefea">
    <p style="margin:12px 0 4px 0">¿Dudas con el registro o con algún trabajador? Escríbenos:</p>
    <a href="https://wa.me/34642757633" style="color:#111110;font-weight:600">WhatsApp</a> &nbsp;·&nbsp;
    <a href="tel:+34642757633" style="color:#111110;font-weight:600">+34 642 75 76 33</a> &nbsp;·&nbsp;
    <a href="mailto:info@nomotax.io" style="color:#111110;font-weight:600">info@nomotax.io</a>
  </td></tr>`

const NOMBRE_AUS: Record<TipoAusencia, [string, string]> = { vacaciones: ['día de vacaciones', 'días de vacaciones'], permiso: ['día de permiso', 'días de permiso'], baja: ['día de baja', 'días de baja'] }
const plural = (n: number, [uno, varios]: [string, string]) => `${n} ${n === 1 ? uno : varios}`

/** «No cuentan: 1 día de vacaciones y 1 festivo» */
function noCuentan(inf: InformeTrabajador): string {
  const partes = (Object.entries(inf.diasAusencia) as [TipoAusencia, number][]).map(([t, n]) => plural(n, NOMBRE_AUS[t]))
  const fest = inf.dias.filter((d) => d.estado === 'festivo').length
  if (fest) partes.push(plural(fest, ['festivo', 'festivos']))
  if (!partes.length) return ''
  return ` No cuentan: ${partes.length > 1 ? partes.slice(0, -1).join(', ') + ' y ' + partes[partes.length - 1] : partes[0]}.`
}

// ================================================================== Informe al trabajador

export interface DatosInformeTrabajador {
  empresa: string
  inf: InformeTrabajador
  prueba?: boolean
}

export function asuntoInformeTrabajador({ inf, prueba }: DatosInformeTrabajador): string {
  const que =
    inf.estado === 'incompleto'
      ? 'te falta completar tu registro de jornada'
      : inf.estado === 'de_menos'
        ? 'revisa tu registro de jornada'
        : inf.correcciones
          ? 'tu registro de jornada está pendiente de una corrección'
          : 'tu registro de jornada está completo'
  return `${prueba ? '[PRUEBA] ' : ''}${pila(inf.nombre)}, ${que} (semana del ${Number(inf.lunes.slice(8))})`
}

function horario(d: DiaInforme): string {
  if (d.estado === 'festivo') return `<span style="color:${GRIS}">${esc(d.texto)}</span>`
  if (d.estado === 'ausencia') return `<span style="color:${GRIS}">No se ficha</span>`
  if (!d.entrada) return '—'
  const h = (iso: string) => new Date(iso).toLocaleTimeString('es-ES', { hour: 'numeric', minute: '2-digit', timeZone: 'Europe/Madrid' })
  return `${h(d.entrada)} – ${d.salida && d.estado !== 'salida' ? h(d.salida) : '¿?'}`
}

function chipDia(d: DiaInforme): string {
  switch (d.estado) {
    case 'falta':
      return chip('falta', 'Sin fichar')
    case 'salida':
      return chip('salida', 'Falta la salida')
    case 'correccion':
      return chip('pend', 'Corrección enviada')
    case 'festivo':
      return chip('gris', 'Festivo')
    case 'ausencia':
      return chip('aus', `${d.texto}${d.ausenciaPendiente ? ' · por aprobar' : ''}`)
    case 'finde':
      return chip('gris', 'Fin de semana')
    default:
      return ''
  }
}

function filaDia(d: DiaInforme): string {
  const c = chipDia(d)
  const sinHoras = d.estado === 'festivo' || d.estado === 'ausencia'
  return `
  <tr>
    <td valign="top" style="padding:11px 0;border-bottom:1px solid ${LINEA};font:600 14px/1.4 ${F};color:#111110;white-space:nowrap">${d.etiqueta}</td>
    <td valign="top" style="padding:11px 8px;border-bottom:1px solid ${LINEA};font:14px/1.4 ${F};color:${d.estado === 'falta' ? GRIS : '#111110'}">
      ${horario(d)}${d.pausaMin ? `<br><span style="font-size:12px;color:${GRIS}">pausa ${d.pausaMin} min</span>` : ''}
      ${c ? `<br>${c}` : ''}
    </td>
    <td align="right" valign="top" style="padding:11px 0;border-bottom:1px solid ${LINEA};font:600 14px/1.4 ${MONO};color:#111110;white-space:nowrap">${
      sinHoras ? '—' : d.fichadoMin ? duracionCorta(d.fichadoMin) : '0 h'
    }${d.esperadoMin ? `<br><span style="font:12px ${F};color:${GRIS}">de ${duracionCorta(d.esperadoMin)}</span>` : ''}</td>
  </tr>`
}

const paso = (n: number, texto: string) => `
      <tr><td valign="top" style="padding:3px 10px 3px 0"><strong style="display:inline-block;width:22px;height:22px;border-radius:50%;background:#CDF564;text-align:center;line-height:22px;font-size:12px">${n}</strong></td>
          <td style="padding:3px 0">${texto}</td></tr>`

export function htmlInformeTrabajador({ empresa, inf, prueba }: DatosInformeTrabajador): string {
  const nombre = esc(pila(inf.nombre))
  const falta = inf.esperadoMin - inf.fichadoMin
  const diasMal = inf.sinFichar + inf.sinSalida
  const titulo =
    inf.estado === 'incompleto'
      ? `${nombre}, tu registro de la semana pasada está incompleto`
      : inf.estado === 'de_menos'
        ? `${nombre}, revisa tu registro de la semana pasada`
        : inf.correcciones
          ? `${nombre}, tu registro está pendiente de ${inf.correcciones === 1 ? 'una corrección' : 'unas correcciones'}`
          : inf.esperadoMin === 0
            ? `${nombre}, la semana pasada no tenías que fichar`
            : `${nombre}, tu registro de la semana pasada está completo`
  const intro =
    inf.estado === 'incompleto'
      ? `Este es el resumen de tus fichajes ${textoSemana(inf.lunes)}. Te ${diasMal === 1 ? 'falta <strong>1 día</strong>' : `faltan <strong>${diasMal} días</strong>`} por completar: corrígelo en NomoTax esta semana.`
      : inf.estado === 'de_menos'
        ? `Este es el resumen de tus fichajes ${textoSemana(inf.lunes)}. Fichaste <strong>${duracionCorta(falta)} menos</strong> que tu jornada: si falta algún fichaje, corrígelo en NomoTax.`
        : inf.correcciones
          ? `Este es el resumen de tus fichajes ${textoSemana(inf.lunes)}. Ya pediste ${inf.correcciones === 1 ? 'la corrección' : 'las correcciones'}: cuando la empresa ${inf.correcciones === 1 ? 'la apruebe' : 'las apruebe'}, quedará completo. No tienes que hacer nada más.`
          : inf.esperadoMin === 0
            ? `Resumen ${textoSemana(inf.lunes)}: no tenías días de trabajo. No tienes que hacer nada.`
          : `Este es el resumen de tus fichajes ${textoSemana(inf.lunes)}. Todo en orden: no tienes que hacer nada.`
  const hayQueHacer = inf.estado !== 'completo'

  return envoltorio(
    `${cabecera(empresa, 'REGISTRO DE JORNADA')}
  <tr><td style="padding:28px 28px 6px 28px;font:15px/1.6 ${F};color:#111110">
    <h1 style="margin:0 0 10px 0;font:600 23px/1.25 ${F}">${titulo}</h1>
    <p style="margin:0 0 20px 0;color:#3a3a36">${intro}</p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7f5;border-radius:14px"><tr><td style="padding:18px 18px 20px 18px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        ${cifra('FICHADO', duracionCorta(inf.fichadoMin))}
        ${cifra('JORNADA', duracionCorta(inf.esperadoMin))}
        ${falta > 0 ? cifra('FALTA', duracionCorta(falta), true) : cifra('DIFERENCIA', (falta < 0 ? '+' : '') + duracionCorta(-falta), true)}
      </tr></table>
      ${barra(inf.fichadoMin, inf.esperadoMin)}
      <p style="margin:10px 0 0 0;font:12px/1.5 ${F};color:${GRIS}">Tu jornada: ${duracionCorta(inf.horasSemana * 60)} a la semana.${noCuentan(inf)}</p>
    </td></tr></table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0 0 0">
      ${inf.dias.map(filaDia).join('')}
    </table>

    ${
      hayQueHacer
        ? `<h2 style="margin:26px 0 8px 0;font:600 17px/1.3 ${F}">Qué tienes que hacer</h2>
    <table role="presentation" cellpadding="0" cellspacing="0" style="font:14px/1.55 ${F};color:#111110">
      ${paso(1, 'Entra en NomoTax y ve a <strong>Fichar</strong>.')}
      ${paso(2, 'Pulsa <strong>«Se me olvidó fichar»</strong> por cada día marcado, pon la hora real y el motivo.')}
      ${paso(3, 'Tu empresa revisa la corrección y la aprueba.')}
    </table>
    ${boton(`${APP_URL}/fichar`, 'Corregir mis fichajes')}
    ${cajaLegal(
      'Fichar es obligatorio',
      'La ley exige registrar cada día tu hora real de entrada y salida (art. 34.9 del Estatuto de los Trabajadores) y la Inspección de Trabajo puede revisarlo. No fichar cuando la empresa lo pide puede ser un incumplimiento laboral (arts. 5 y 58 del Estatuto).',
    )}`
        : boton(`${APP_URL}/fichar`, 'Ver mi registro')
    }
  </td></tr>
  <tr><td style="padding:14px 28px 26px 28px;font:13px/1.6 ${F};color:${GRIS}">
    Vacaciones, permisos y bajas: pídelos o comunícalos en NomoTax, en <a href="${APP_URL}/mi-espacio/ausencias" style="color:#111110;font-weight:600">Ausencias</a>. Esos días no hay que fichar.
  </td></tr>`,
    `${esc(empresa)} te envía este resumen cada lunes con NomoTax. Si todo está en orden, el correo solo te lo confirma.`,
    prueba,
  )
}

export function textoInformeTrabajador({ empresa, inf }: DatosInformeTrabajador): string {
  const lineas = inf.dias.map((d) => {
    const extra = chipDia(d) ? ` [${chipDia(d).replace(/<[^>]+>/g, '')}]` : ''
    return `· ${d.etiqueta}: ${horario(d).replace(/<[^>]+>/g, '')} — ${d.estado === 'festivo' || d.estado === 'ausencia' ? 'no se ficha' : duracionCorta(d.fichadoMin)}${extra}`
  })
  return [
    `Hola ${pila(inf.nombre)},`,
    '',
    `Resumen de tus fichajes ${textoSemana(inf.lunes)}: ${duracionCorta(inf.fichadoMin)} de ${duracionCorta(inf.esperadoMin)}.`,
    '',
    ...lineas,
    '',
    inf.estado === 'completo' ? 'Todo en orden.' : `Corrige lo que falte en NomoTax → Fichar → «Se me olvidó fichar»: ${APP_URL}/fichar`,
    '',
    'Fichar es obligatorio: la ley exige registrar cada día la hora real de entrada y salida (art. 34.9 del Estatuto de los Trabajadores).',
    '',
    empresa,
  ].join('\n')
}

// ================================================================== Informe del equipo (propietario)

export interface PendienteAprobar {
  nombre: string
  texto: string
  motivo: string | null
}

export interface DatosInformeEquipo {
  empresa: string
  /** Nombre de quien lo recibe (si se sabe) */
  para: string | null
  lunes: string
  informes: InformeTrabajador[]
  /** Trabajadores de alta que no tienen el fichaje activado */
  sinFichaje: string[]
  correcciones: PendienteAprobar[]
  ausencias: PendienteAprobar[]
  prueba?: boolean
}

export function asuntoInformeEquipo(d: DatosInformeEquipo): string {
  const mal = d.informes.filter((i) => i.estado === 'incompleto').length
  return `${d.prueba ? '[PRUEBA] ' : ''}Registro de jornada de ${d.empresa}: semana del ${Number(d.lunes.slice(8))}${mal ? ` · ${mal} con días sin completar` : ' · todo en orden'}`
}

function filaEquipo(i: InformeTrabajador): string {
  const chips: string[] = []
  if (i.sinFichar) chips.push(chip('falta', i.sinFichar === 1 ? '1 día sin fichar' : `${i.sinFichar} días sin fichar`))
  if (i.sinSalida) chips.push(chip('salida', i.sinSalida === 1 ? '1 sin salida' : `${i.sinSalida} sin salida`))
  if (i.correcciones) chips.push(chip('pend', i.correcciones === 1 ? '1 corrección por aprobar' : `${i.correcciones} correcciones por aprobar`))
  for (const [t, n] of Object.entries(i.diasAusencia) as [TipoAusencia, number][]) chips.push(chip('aus', plural(n, NOMBRE_AUS[t])))
  if (i.estado === 'de_menos') chips.push(chip('salida', `${duracionCorta(i.esperadoMin - i.fichadoMin)} por debajo`))
  if (i.estado === 'completo' && !i.correcciones) chips.unshift(chip('ok', 'Completo'))
  const dif = i.fichadoMin - i.esperadoMin
  return `
  <tr>
    <td style="padding:12px 0;border-bottom:1px solid ${LINEA};font:14px/1.4 ${F};color:#111110">
      <strong>${esc(i.nombre)}</strong><br>${chips.join('')}
    </td>
    <td align="right" valign="top" style="padding:12px 0 12px 8px;border-bottom:1px solid ${LINEA};font:600 14px/1.4 ${MONO};color:#111110;white-space:nowrap">
      ${duracionCorta(i.fichadoMin)}<br><span style="font:12px ${F};color:${dif < -60 ? '#a8200d' : GRIS}">${dif ? `${dif > 0 ? '+' : ''}${duracionCorta(dif)} ` : ''}de ${duracionCorta(i.esperadoMin)}</span>
    </td>
  </tr>`
}

const cajaPendiente = (p: PendienteAprobar) => `
    <tr><td style="padding:0 0 8px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${LINEA};border-radius:12px"><tr><td style="padding:12px 16px;font:14px/1.5 ${F};color:#111110">
      <strong>${esc(p.nombre)}</strong> · ${esc(p.texto)}${p.motivo ? `<br><span style="color:${GRIS}">«${esc(p.motivo)}»</span>` : ''}
    </td></tr></table></td></tr>`

export function htmlInformeEquipo(d: DatosInformeEquipo): string {
  const totF = d.informes.reduce((s, i) => s + i.fichadoMin, 0)
  const totT = d.informes.reduce((s, i) => s + i.esperadoMin, 0)
  const mal = d.informes.filter((i) => i.estado === 'incompleto').length
  const pct = totT ? Math.round((totF / totT) * 100) : 100
  const hola = d.para ? `${esc(pila(d.para))}, así` : 'Así'
  return envoltorio(
    `${cabecera(d.empresa, 'INFORME SEMANAL DE JORNADA')}
  <tr><td style="padding:28px 28px 6px 28px;font:15px/1.6 ${F};color:#111110">
    <h1 style="margin:0 0 10px 0;font:600 23px/1.25 ${F}">${hola} fichó tu equipo la semana pasada</h1>
    <p style="margin:0 0 20px 0;color:#3a3a36">Resumen del registro de jornada ${textoSemana(d.lunes)}. ${
      mal
        ? `<strong>${mal} de ${d.informes.length} ${d.informes.length === 1 ? 'persona' : 'personas'}</strong> ${mal === 1 ? 'tiene' : 'tienen'} días sin completar; ya les hemos avisado para que lo corrijan.`
        : 'Todo el equipo tiene el registro completo.'
    }</p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7f5;border-radius:14px"><tr><td style="padding:18px 18px 20px 18px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        ${cifra('FICHADO', duracionCorta(totF))}
        ${cifra('JORNADA', duracionCorta(totT))}
        ${cifra('REGISTRADO', `${pct}%`, true)}
      </tr></table>
      ${barra(totF, totT)}
    </td></tr></table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0 0 0">
      <tr><td style="padding:0 0 6px 0;font:600 11px ${F};letter-spacing:1px;color:${GRIS}">PERSONA</td>
          <td align="right" style="padding:0 0 6px 0;font:600 11px ${F};letter-spacing:1px;color:${GRIS}">FICHADO</td></tr>
      ${d.informes.map(filaEquipo).join('')}
    </table>
    ${
      d.sinFichaje.length
        ? `<p style="margin:12px 0 0 0;font:13px/1.5 ${F};color:#8a5a00">Sin el fichaje activado: <strong>${d.sinFichaje.map(esc).join(', ')}</strong>. También tienen que registrar su jornada: actívalo en Configuración → Usuarios.</p>`
        : ''
    }

    ${
      d.correcciones.length || d.ausencias.length
        ? `<h2 style="margin:26px 0 10px 0;font:600 17px/1.3 ${F}">Pendiente de tu aprobación</h2>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${d.correcciones.map(cajaPendiente).join('')}
      ${d.ausencias.map(cajaPendiente).join('')}
    </table>
    ${boton(`${APP_URL}/laboral/${d.correcciones.length ? 'fichajes' : 'ausencias'}`, d.correcciones.length ? 'Revisar los fichajes' : 'Revisar las ausencias')}`
        : boton(`${APP_URL}/laboral/fichajes`, 'Ver el registro')
    }

    ${cajaLegal(
      'Obligatorio para la empresa',
      'Hay que registrar cada día la entrada y la salida de cada trabajador y guardarlo 4 años (art. 34.9 del Estatuto de los Trabajadores). No hacerlo es una infracción grave: multa de 751€ a 7.500€ por cada infracción (arts. 7.5 y 40 LISOS, importes vigentes), aparte de otras que la Inspección de Trabajo pueda detectar, como horas extra sin pagar o sin cotizar.',
    )}
  </td></tr>
  ${contacto}`,
    `Recibes este informe cada lunes porque ${esc(d.empresa)} tiene el registro de jornada en NomoTax · <a href="https://nomotax.io" style="color:#9a9a94">nomotax.io</a>`,
    d.prueba,
  )
}

export function textoInformeEquipo(d: DatosInformeEquipo): string {
  return [
    `Registro de jornada ${textoSemana(d.lunes)} · ${d.empresa}`,
    '',
    ...d.informes.map((i) => `· ${i.nombre}: ${duracionCorta(i.fichadoMin)} de ${duracionCorta(i.esperadoMin)}${i.sinFichar ? ` · ${i.sinFichar} sin fichar` : ''}${i.sinSalida ? ` · ${i.sinSalida} sin salida` : ''}`),
    '',
    ...(d.correcciones.length || d.ausencias.length
      ? ['Pendiente de tu aprobación:', ...[...d.correcciones, ...d.ausencias].map((p) => `· ${p.nombre}: ${p.texto}`), '']
      : []),
    `Revísalo en ${APP_URL}/laboral/fichajes`,
    '',
    'El registro diario de jornada es obligatorio para la empresa (art. 34.9 del Estatuto de los Trabajadores).',
  ].join('\n')
}

// ================================================================== Avisos de ausencias

export interface DatosAviso {
  empresa: string
  etiqueta: string
  titulo: string
  parrafo: string
  /** Filas «Tipo», «Fechas»… */
  detalle: [string, string][]
  boton: { href: string; texto: string }
  pie: string
}

export function htmlAviso(d: DatosAviso): string {
  return envoltorio(
    `${cabecera(d.empresa, d.etiqueta)}
  <tr><td style="padding:28px 28px 24px 28px;font:15px/1.6 ${F};color:#111110">
    <h1 style="margin:0 0 10px 0;font:600 22px/1.25 ${F}">${esc(d.titulo)}</h1>
    <p style="margin:0 0 18px 0;color:#3a3a36">${d.parrafo}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7f5;border-radius:14px"><tr><td style="padding:8px 18px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${d.detalle
          .map(
            ([k, v], i) => `<tr><td style="padding:8px 0;${i ? `border-top:1px solid ${LINEA};` : ''}font:13px/1.5 ${F};color:${GRIS};white-space:nowrap;vertical-align:top">${esc(k)}</td>
          <td align="right" style="padding:8px 0 8px 12px;${i ? `border-top:1px solid ${LINEA};` : ''}font:14px/1.5 ${F};color:#111110">${esc(v)}</td></tr>`,
          )
          .join('')}
      </table>
    </td></tr></table>
    ${boton(d.boton.href, d.boton.texto)}
  </td></tr>`,
    d.pie,
  )
}

export const textoAviso = (d: DatosAviso) =>
  [d.titulo, '', d.parrafo.replace(/<[^>]+>/g, ''), '', ...d.detalle.map(([k, v]) => `${k}: ${v}`), '', `${d.boton.texto}: ${d.boton.href}`].join('\n')
