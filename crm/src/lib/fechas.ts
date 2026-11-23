export const hoy = () => iso(new Date())
export const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export function corta(f?: string | null) {
  if (!f) return ''
  const d = new Date(f + 'T00:00:00')
  const dias = Math.round((d.getTime() - new Date(hoy() + 'T00:00:00').getTime()) / 864e5)
  if (dias === 0) return 'Hoy'
  if (dias === 1) return 'Mañana'
  if (dias === -1) return 'Ayer'
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}
export const vencida = (f?: string | null) => !!f && f < hoy()
