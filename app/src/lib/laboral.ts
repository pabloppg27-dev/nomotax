import { hoyISO } from './format'
import type { CategoriaConvenio, EstadoTrabajador, PerfilLaboral, TipoDocTrabajador } from './types'

export const TIPOS_CONTRATO = [
  { id: 'indefinido', nombre: 'Indefinido' },
  { id: 'fijo_discontinuo', nombre: 'Fijo discontinuo' },
  { id: 'temporal_produccion', nombre: 'Temporal por circunstancias de la producción' },
  { id: 'temporal_sustitucion', nombre: 'Temporal por sustitución' },
  { id: 'formativo_alternancia', nombre: 'Formativo en alternancia' },
  { id: 'formativo_practica', nombre: 'Formativo para la práctica profesional' },
]

export const nombreContrato = (id: string) => TIPOS_CONTRATO.find((t) => t.id === id)?.nombre ?? id
export const esTemporal = (id: string) => id.startsWith('temporal') || id.startsWith('formativo')

export const NIVELES_ESTUDIOS = [
  'Sin estudios',
  'Educación primaria',
  'ESO / Graduado escolar',
  'Bachillerato',
  'FP de grado medio',
  'FP de grado superior',
  'Grado universitario',
  'Máster',
  'Doctorado',
]

export const ESTADOS_TRABAJADOR: Record<EstadoTrabajador, { label: string; tono: 'gris' | 'lima' | 'verde' | 'ambar' | 'rojo' | 'negro' }> = {
  solicitada: { label: 'Alta solicitada', tono: 'lima' },
  en_tramite: { label: 'En trámite', tono: 'ambar' },
  alta: { label: 'De alta', tono: 'verde' },
  baja: { label: 'De baja', tono: 'gris' },
}

export const TIPOS_DOC: { id: TipoDocTrabajador; nombre: string }[] = [
  { id: 'dni', nombre: 'DNI / NIE' },
  { id: 'contrato', nombre: 'Contrato' },
  { id: 'alta_ss', nombre: 'Alta en la Seguridad Social' },
  { id: 'teletrabajo', nombre: 'Acuerdo de teletrabajo' },
  { id: 'modelo_145', nombre: 'Modelo 145' },
  { id: 'otro', nombre: 'Otro' },
]
export const nombreDoc = (id: string) => TIPOS_DOC.find((t) => t.id === id)?.nombre ?? 'Documento'

export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** Días hábiles (lunes a viernes) desde hoy hasta la fecha, sin contar hoy */
export function diasHabilesHasta(iso: string): number {
  const hoy = new Date(hoyISO() + 'T12:00:00')
  const fin = new Date(iso.slice(0, 10) + 'T12:00:00')
  let n = 0
  const d = new Date(hoy)
  while (d < fin) {
    d.setDate(d.getDate() + 1)
    const dia = d.getDay()
    if (dia !== 0 && dia !== 6 && d < fin) n++
  }
  return n
}

export function limpiarDni(v: string | null | undefined): string {
  return (v ?? '').toUpperCase().replace(/[\s.-]/g, '')
}

/**
 * Comprueba el salario contra el mínimo del convenio en cómputo anual,
 * ajustado a la jornada (parcial) y al número de pagas.
 */
export function comprobarSalario(opts: {
  brutoMensual: number
  pagas: number
  jornada: 'completa' | 'parcial'
  horasSemana: number | null
  perfil: PerfilLaboral | null
  categoria: Pick<CategoriaConvenio, 'salario_min_mensual'> | null
}): { ok: boolean; anualOfrecido: number; anualMinimo: number } | null {
  const minMensual = opts.categoria?.salario_min_mensual
  if (!minMensual || !opts.brutoMensual) return null
  const horasConvenio = Number(opts.perfil?.horas_semana_convenio || 40)
  const pagasConvenio = Number(opts.perfil?.pagas_convenio || 14)
  const coef = opts.jornada === 'parcial' && opts.horasSemana ? Math.min(1, opts.horasSemana / horasConvenio) : 1
  const anualMinimo = Math.round(Number(minMensual) * pagasConvenio * coef * 100) / 100
  const anualOfrecido = Math.round(opts.brutoMensual * opts.pagas * 100) / 100
  return { ok: anualOfrecido + 0.01 >= anualMinimo, anualOfrecido, anualMinimo }
}

/** Comprueba la letra de un DNI o NIE español */
export function dniValido(v: string): boolean {
  const d = limpiarDni(v)
  const letras = 'TRWAGMYFPDXBNJZSQVHLCKE'
  const m = d.match(/^([XYZ]?)(\d{7,8})([A-Z])$/)
  if (!m) return false
  const pref = { X: '0', Y: '1', Z: '2' }[m[1] as 'X' | 'Y' | 'Z'] ?? ''
  const num = Number(pref + m[2])
  return letras[num % 23] === m[3]
}

export function limpiarIban(v: string | null | undefined): string {
  return (v ?? '').toUpperCase().replace(/\s+/g, '')
}

/** IBAN con dígitos de control correctos (mod 97) */
export function ibanValido(v: string): boolean {
  const s = limpiarIban(v)
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false
  const reord = s.slice(4) + s.slice(0, 4)
  let resto = 0
  for (const ch of reord) {
    const n = ch >= 'A' ? String(ch.charCodeAt(0) - 55) : ch
    for (const dig of n) resto = (resto * 10 + Number(dig)) % 97
  }
  return resto === 1
}
