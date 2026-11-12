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

export type Periodo = { anio: number; trimestre: 0 | 1 | 2 | 3 | 4 } // 0 = año completo

export function rangoPeriodo(p: Periodo): { desde: string; hasta: string } {
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

export function direccionCompleta(d: {
  direccion?: string | null
  cp?: string | null
  ciudad?: string | null
  provincia?: string | null
  pais?: string | null
}): string[] {
  const linea2 = [d.cp, d.ciudad].filter(Boolean).join(' ')
  const linea3 = [d.provincia, d.pais && d.pais !== 'España' ? d.pais : null].filter(Boolean).join(', ')
  return [d.direccion, linea2, linea3].filter((x): x is string => Boolean(x && x.trim()))
}
