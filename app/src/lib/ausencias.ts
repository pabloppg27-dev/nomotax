/**
 * Ausencias: vacaciones, permisos y bajas (supabase/ausencias.sql).
 * Aquí solo hay cálculo puro (lo usa también la Edge Function «jornada»): nombres, días laborables
 * y saldo de vacaciones. Las llamadas a Supabase están en ausenciasApi.ts.
 */

export type TipoAusencia = 'vacaciones' | 'permiso' | 'baja'
export type EstadoAusencia = 'pendiente' | 'aprobada' | 'rechazada' | 'anulada'

export interface Ausencia {
  id: string
  owner_id: string
  trabajador_id: string
  tipo: TipoAusencia
  subtipo: string | null
  desde: string
  hasta: string | null
  motivo: string | null
  archivo_path: string | null
  estado: EstadoAusencia
  respuesta: string | null
  solicitado_por: string | null
  revisado_por: string | null
  revisado_at: string | null
  asesor_visto: boolean
  created_at: string
}

export const NOMBRE_TIPO_AUSENCIA: Record<TipoAusencia, string> = {
  vacaciones: 'Vacaciones',
  permiso: 'Permiso',
  baja: 'Baja',
}

export const NOMBRE_ESTADO_AUSENCIA: Record<EstadoAusencia, string> = {
  pendiente: 'Pendiente de aprobar',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
  anulada: 'Anulada',
}

/** Permisos retribuidos del art. 37.3 y 37.9 del Estatuto de los Trabajadores (el convenio puede mejorarlos) */
export const SUBTIPOS_PERMISO: { id: string; nombre: string; ayuda: string }[] = [
  { id: 'matrimonio', nombre: 'Matrimonio o registro de pareja de hecho', ayuda: '15 días naturales (art. 37.3.a ET).' },
  { id: 'familiar', nombre: 'Accidente, enfermedad grave u hospitalización de un familiar', ayuda: '5 días (art. 37.3.b ET).' },
  { id: 'fallecimiento', nombre: 'Fallecimiento de un familiar', ayuda: '2 días; 4 si tienes que desplazarte (art. 37.3.b bis ET).' },
  { id: 'mudanza', nombre: 'Traslado de domicilio', ayuda: '1 día (art. 37.3.c ET).' },
  { id: 'deber', nombre: 'Deber público o personal inexcusable', ayuda: 'El tiempo indispensable (art. 37.3.d ET).' },
  { id: 'prenatal', nombre: 'Exámenes prenatales o preparación al parto', ayuda: 'El tiempo indispensable (art. 37.3.f ET).' },
  { id: 'fuerza_mayor', nombre: 'Urgencia familiar (fuerza mayor)', ayuda: 'Hasta 4 días al año, también por horas (art. 37.9 ET).' },
  { id: 'medico', nombre: 'Visita médica', ayuda: 'Según tu convenio.' },
  { id: 'asuntos_propios', nombre: 'Asuntos propios', ayuda: 'Solo si lo da tu convenio o la empresa.' },
  { id: 'otro', nombre: 'Otro motivo', ayuda: 'Explica el motivo.' },
]

export const SUBTIPOS_BAJA: { id: string; nombre: string }[] = [
  { id: 'enfermedad', nombre: 'Enfermedad común o accidente no laboral' },
  { id: 'accidente_trabajo', nombre: 'Accidente de trabajo o enfermedad profesional' },
  { id: 'nacimiento', nombre: 'Nacimiento y cuidado de menor' },
  { id: 'riesgo_embarazo', nombre: 'Riesgo durante el embarazo o la lactancia' },
  { id: 'otro', nombre: 'Otra' },
]

/** «Vacaciones», «Permiso · Traslado de domicilio», «Baja · Enfermedad común…» */
export function nombreAusencia(a: Pick<Ausencia, 'tipo' | 'subtipo'>, corto = false): string {
  const base = NOMBRE_TIPO_AUSENCIA[a.tipo]
  if (corto || !a.subtipo || a.subtipo === 'otro') return base
  const sub = (a.tipo === 'permiso' ? SUBTIPOS_PERMISO : a.tipo === 'baja' ? SUBTIPOS_BAJA : []).find((s) => s.id === a.subtipo)
  return sub ? `${base} · ${sub.nombre}` : base
}

/** Cuenta en el saldo, el calendario y el informe: pendiente o aprobada */
export const vigente = (a: Pick<Ausencia, 'estado'>) => a.estado === 'pendiente' || a.estado === 'aprobada'

// ------------------------------------------------------------------ Fechas (AAAA-MM-DD, sin husos horarios)

const aFecha = (iso: string) => new Date(iso.slice(0, 10) + 'T12:00:00Z')
const aIso = (d: Date) => d.toISOString().slice(0, 10)

export function sumarDias(iso: string, n: number): string {
  const d = aFecha(iso)
  d.setUTCDate(d.getUTCDate() + n)
  return aIso(d)
}

/** 0 = domingo … 6 = sábado */
export const diaSemana = (iso: string) => aFecha(iso).getUTCDay()
export const esFinDeSemana = (iso: string) => diaSemana(iso) === 0 || diaSemana(iso) === 6

/** Todos los días entre dos fechas, ambas incluidas */
export function diasEntre(desde: string, hasta: string): string[] {
  const out: string[] = []
  for (let d = desde; d <= hasta && out.length < 800; d = sumarDias(d, 1)) out.push(d)
  return out
}

/** Lunes a viernes que no son festivo */
export function diasLaborables(desde: string, hasta: string, festivos: Map<string, string>): string[] {
  return diasEntre(desde, hasta).filter((d) => !esFinDeSemana(d) && !festivos.has(d))
}

/** Días laborables de una ausencia (una baja abierta, hasta `hoy`) */
export function diasDeAusencia(a: Pick<Ausencia, 'desde' | 'hasta'>, festivos: Map<string, string>, hoy: string): number {
  const fin = a.hasta ?? (hoy < a.desde ? a.desde : hoy)
  return diasLaborables(a.desde, fin, festivos).length
}

/** La ausencia vigente que cubre ese día (aprobada antes que pendiente) */
export function ausenciaDelDia<T extends Pick<Ausencia, 'desde' | 'hasta' | 'estado'>>(dia: string, as: T[]): T | null {
  const cubre = as.filter((a) => vigente(a) && a.desde <= dia && (a.hasta ?? '9999-12-31') >= dia)
  return cubre.find((a) => a.estado === 'aprobada') ?? cubre[0] ?? null
}

/** «del 21 al 31 de diciembre», «el 10 de diciembre», «desde el 16 de noviembre» */
export function textoFechas(a: Pick<Ausencia, 'desde' | 'hasta'>, conAnio = false): string {
  const f = (iso: string, anio: boolean) =>
    aFecha(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', ...(anio ? { year: 'numeric' } : {}), timeZone: 'UTC' })
  if (!a.hasta) return `desde el ${f(a.desde, conAnio)}`
  if (a.hasta === a.desde) return `el ${f(a.desde, conAnio)}`
  const mismoMes = a.desde.slice(0, 7) === a.hasta.slice(0, 7)
  const ini = mismoMes ? String(Number(a.desde.slice(8, 10))) : f(a.desde, conAnio && a.desde.slice(0, 4) !== a.hasta.slice(0, 4))
  return `del ${ini} al ${f(a.hasta, conAnio)}`
}

// ------------------------------------------------------------------ Saldo de vacaciones

/** Si la ficha no dice cuántos: 30 días naturales (art. 38 ET) ≈ 22 laborables */
export const VACACIONES_MINIMO_LABORABLES = 22

export interface SaldoVacaciones {
  anio: number
  /** Días laborables que le tocan este año (proporcionales si entró o sale este año) */
  derecho: number
  disfrutados: number
  aprobados: number
  pendientes: number
  quedan: number
  proporcional: boolean
  /** La ficha no tiene los días del contrato: se usa el mínimo legal */
  sinDato: boolean
}

export function saldoVacaciones(
  t: { fecha_inicio: string; fecha_baja?: string | null; vacaciones_dias?: number | null },
  ausencias: Pick<Ausencia, 'tipo' | 'estado' | 'desde' | 'hasta'>[],
  anio: number,
  festivos: Map<string, string>,
  hoy: string,
): SaldoVacaciones {
  const sinDato = !t.vacaciones_dias
  const base = t.vacaciones_dias || VACACIONES_MINIMO_LABORABLES
  const ini = `${anio}-01-01`
  const fin = `${anio}-12-31`
  const desde = t.fecha_inicio > ini ? t.fecha_inicio : ini
  const hasta = t.fecha_baja && t.fecha_baja < fin ? t.fecha_baja : fin
  const total = diasEntre(ini, fin).length
  const trabajados = desde > hasta ? 0 : diasEntre(desde, hasta).length
  const proporcional = trabajados < total
  const derecho = proporcional ? Math.round((base * trabajados) / total) : base

  let disfrutados = 0
  let aprobados = 0
  let pendientes = 0
  for (const a of ausencias) {
    if (a.tipo !== 'vacaciones' || !vigente(a) || !a.hasta) continue
    const d0 = a.desde > ini ? a.desde : ini
    const d1 = a.hasta < fin ? a.hasta : fin
    if (d0 > d1) continue
    const dias = diasLaborables(d0, d1, festivos)
    if (a.estado === 'pendiente') pendientes += dias.length
    else {
      aprobados += dias.length
      disfrutados += dias.filter((d) => d <= hoy).length
    }
  }
  return { anio, derecho, disfrutados, aprobados, pendientes, quedan: derecho - aprobados - pendientes, proporcional, sinDato }
}
