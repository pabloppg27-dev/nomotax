/** Solo en local (npm run dev) con ?demo en la URL: trabajadores y fichajes de ejemplo, sin tocar Supabase */
import type { Fichaje, TipoFichaje } from './fichaje'
import type { Trabajador } from './types'

/** Se queda puesta en la pestaña al navegar; ?demo=0 la quita */
export function enDemo(): boolean {
  if (!import.meta.env.DEV) return false
  try {
    const q = new URLSearchParams(window.location.search).get('demo')
    if (q !== null) sessionStorage.setItem('nt-demo', q === '0' ? '' : '1')
    return sessionStorage.getItem('nt-demo') === '1'
  } catch {
    return false
  }
}

export const TRABAJADORES_DEMO = [
  { id: 'd1', nombre: 'Laura Gómez', dni: '12345678Z' },
  { id: 'd2', nombre: 'Marc Puig', dni: '87654321X' },
  { id: 'd3', nombre: 'Ana Ruiz (parcial)', dni: '11223344B' },
] as unknown as Trabajador[]

let n = 0
const f = (trab: string, d: Date, hhmm: string, tipo: TipoFichaje, extra: Partial<Fichaje> = {}): Fichaje => {
  const [h, m] = hhmm.split(':').map(Number)
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m)
  return {
    id: `f${++n}`, owner_id: 'demo', trabajador_id: trab, tipo, momento: t.toISOString(), origen: 'app', estado: 'valido',
    motivo: null, anula_id: null, registrado_por: null, revisado_por: null, revisado_at: null, created_at: t.toISOString(), ...extra,
  }
}

/** Días laborables del mes en curso hasta ayer, y hoy con la jornada en marcha */
export function fichajesDemo(): Fichaje[] {
  const out: Fichaje[] = []
  const hoy = new Date()
  for (let d = new Date(hoy.getFullYear(), hoy.getMonth(), 1); d < hoy; d.setDate(d.getDate() + 1)) {
    if (d.getDay() === 0 || d.getDay() === 6) continue
    const esHoy = d.toDateString() === hoy.toDateString()
    const r = (x: number) => String((d.getDate() * 7 + x) % 15).padStart(2, '0')
    out.push(f('d1', d, `08:${r(1)}`, 'entrada'), f('d1', d, '14:00', 'pausa'), f('d1', d, '15:00', 'reanudar'))
    if (!esHoy) out.push(f('d1', d, `17:${r(2)}`, 'salida'))
    out.push(f('d2', d, `09:${r(3)}`, 'entrada'))
    if (!esHoy && d.getDate() !== 3) out.push(f('d2', d, `18:${r(4)}`, 'salida'))
    if (d.getDay() <= 3) {
      out.push(f('d3', d, '09:00', 'entrada'))
      if (!esHoy) out.push(f('d3', d, '13:00', 'salida'))
    }
    if (esHoy) break
  }
  // Marc olvidó fichar la salida el día 3: ha pedido la corrección
  const dia3 = new Date(hoy.getFullYear(), hoy.getMonth(), 3)
  if (dia3 < hoy) out.push(f('d2', dia3, '18:05', 'salida', { origen: 'correccion', estado: 'pendiente', motivo: 'Olvidé fichar la salida' }))
  return out
}
