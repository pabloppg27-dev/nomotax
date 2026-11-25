import { paisEnIdioma } from './paises'

/**
 * Formato español de Pablo: punto de miles siempre (también en 4 cifras: 1.234),
 * coma decimal y el € pegado al número: 1.234,56€
 */
function agrupar(n: number, decimales: number, fijos: boolean): string {
  const v = Number.isFinite(n) ? n : 0
  let [ent, frac = ''] = Math.abs(v).toFixed(decimales).split('.')
  if (!fijos) frac = frac.replace(/0+$/, '')
  ent = ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const negativo = v < 0 && Number(Math.abs(v).toFixed(decimales)) !== 0
  return `${negativo ? '-' : ''}${ent}${frac ? `,${frac}` : ''}`
}

export const eur = (n: number | null | undefined) => `${agrupar(Number(n ?? 0), 2, true)}€`
export const num = (n: number | null | undefined, decimales = 2) => agrupar(Number(n ?? 0), decimales, false)

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

/** 2026-11-12 → 12/11/2026 */
export function fecha(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

export function fechaLarga(iso: string): string {
  const d = new Date(iso.slice(0, 10) + 'T12:00:00')
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function hoyISO(): string {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

export function sumarDias(iso: string, dias: number): string {
  const d = new Date(iso.slice(0, 10) + 'T12:00:00')
  d.setDate(d.getDate() + dias)
  return d.toISOString().slice(0, 10)
}

export const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/**
 * Periodo elegido en el selector. Por defecto, año (trimestre 0) o trimestre.
 * Si trae «mes» (1-12) es ese mes del año; si trae «desde» y «hasta», unas fechas a medida
 * (entonces «anio» es el año de la fecha final).
 */
export type Periodo = { anio: number; trimestre: 0 | 1 | 2 | 3 | 4; mes?: number; desde?: string; hasta?: string }

const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** Texto del periodo para frases: en = «en el 3.er trimestre de 2026» / «en octubre de 2026» / «del 01/02/2026 al 15/05/2026»; del = «del 3T de 2026»… */
export function textoPeriodo(p: Periodo): { en: string; del: string; archivo: string } {
  if (p.desde && p.hasta)
    return { en: `del ${fecha(p.desde)} al ${fecha(p.hasta)}`, del: `del ${fecha(p.desde)} al ${fecha(p.hasta)}`, archivo: `${p.desde} a ${p.hasta}` }
  if (p.mes) {
    const m = `${MESES_LARGOS[p.mes - 1]} de ${p.anio}`
    return { en: `en ${m}`, del: `de ${m}`, archivo: `${p.anio}-${String(p.mes).padStart(2, '0')}` }
  }
  if (p.trimestre) {
    const t = `${['1.er', '2.º', '3.er', '4.º'][p.trimestre - 1]} trimestre de ${p.anio}`
    return { en: `en el ${t}`, del: `del ${t}`, archivo: `${p.anio}-${p.trimestre}T` }
  }
  return { en: `en el año ${p.anio}`, del: `del año ${p.anio}`, archivo: `${p.anio}` }
}

export function rangoPeriodo(p: Periodo): { desde: string; hasta: string } {
  if (p.desde && p.hasta) return { desde: p.desde, hasta: p.hasta }
  if (p.mes) {
    const mm = String(p.mes).padStart(2, '0')
    return { desde: `${p.anio}-${mm}-01`, hasta: `${p.anio}-${mm}-${new Date(p.anio, p.mes, 0).getDate()}` }
  }
  if (p.trimestre === 0) return { desde: `${p.anio}-01-01`, hasta: `${p.anio}-12-31` }
  const mIni = (p.trimestre - 1) * 3 + 1
  const mFin = mIni + 2
  const ultimo = new Date(p.anio, mFin, 0).getDate()
  return {
    desde: `${p.anio}-${String(mIni).padStart(2, '0')}-01`,
    hasta: `${p.anio}-${String(mFin).padStart(2, '0')}-${ultimo}`,
  }
}

export function enPeriodo(iso: string | null, p: Periodo): boolean {
  if (!iso) return false
  const { desde, hasta } = rangoPeriodo(p)
  const d = iso.slice(0, 10)
  return d >= desde && d <= hasta
}

export function trimestreActual(): Periodo {
  const d = new Date()
  return { anio: d.getFullYear(), trimestre: (Math.floor(d.getMonth() / 3) + 1) as 1 | 2 | 3 | 4 }
}

/** Próximo plazo de las declaraciones trimestrales (303, 130, 111…) */
export function proximoPlazoTrimestral(hoy = new Date()): { fecha: Date; trimestre: string } {
  const y = hoy.getFullYear()
  const plazos = [
    { fecha: new Date(y, 0, 30, 23, 59), trimestre: `4T ${y - 1}` },
    { fecha: new Date(y, 3, 20, 23, 59), trimestre: `1T ${y}` },
    { fecha: new Date(y, 6, 20, 23, 59), trimestre: `2T ${y}` },
    { fecha: new Date(y, 9, 20, 23, 59), trimestre: `3T ${y}` },
    { fecha: new Date(y + 1, 0, 30, 23, 59), trimestre: `4T ${y}` },
  ]
  return plazos.find((p) => p.fecha >= hoy) ?? plazos[plazos.length - 1]
}

export function limpiarNif(nif: string | null | undefined): string | null {
  if (!nif) return null
  const v = nif.toUpperCase().replace(/[\s.-]/g, '')
  return v || null
}

/** Líneas de la dirección. El país sale siempre, escrito en `idioma` (el de la factura; español por defecto) */
export function direccionCompleta(
  d: {
    direccion?: string | null
    cp?: string | null
    ciudad?: string | null
    provincia?: string | null
    pais?: string | null
  },
  idioma = 'es',
): string[] {
  const linea2 = [d.cp, d.ciudad].filter(Boolean).join(' ')
  // La provincia no se repite si es la misma ciudad («Valencia» y «Valencia/València»)
  const plano = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
  const ciudad = plano(d.ciudad ?? '')
  const repite = Boolean(ciudad) && plano(d.provincia ?? '').split('/').some((p) => p.trim() === ciudad)
  const linea3 = [repite ? null : d.provincia, paisEnIdioma(d.pais, idioma)].filter(Boolean).join(', ')
  return [d.direccion, linea2, linea3].filter((x): x is string => Boolean(x && x.trim()))
}
