/**
 * Informe semanal de jornada (lo manda la Edge Function «jornada» cada lunes).
 * Por trabajador y semana (lunes a domingo, hora de Madrid): lo fichado frente a su jornada,
 * sin pedir que fiche los días de vacaciones, permiso, baja o festivo.
 * Cálculo puro: lo prueba test-data/probar-informe-jornada.ts.
 */
import { resumenDias, type Fichaje } from './fichaje.ts'
import { ausenciaDelDia, diaSemana, diasEntre, nombreAusencia, sumarDias, type Ausencia, type TipoAusencia } from './ausencias.ts'

export const ZONA = 'Europe/Madrid'

/** Día (AAAA-MM-DD) de un instante en Madrid */
export const diaMadrid = (iso: string | Date) => new Date(iso).toLocaleDateString('sv-SE', { timeZone: ZONA })
/** «9:02» en Madrid */
export const horaMadrid = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-ES', { hour: 'numeric', minute: '2-digit', timeZone: ZONA })

/** Lunes de la semana anterior a `hoy` (si hoy es lunes, el de hace 7 días) */
export function lunesAnterior(hoy: string): string {
  const dow = diaSemana(hoy) // 0 domingo
  const lunesEsta = sumarDias(hoy, -((dow + 6) % 7))
  return sumarDias(lunesEsta, -7)
}

const CORTO = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
export const etiquetaDia = (iso: string) => `${CORTO[diaSemana(iso)]} ${Number(iso.slice(8, 10))}`

export type EstadoDia =
  | 'ok'          // fichado y cerrado
  | 'falta'       // laborable sin ningún fichaje
  | 'salida'      // entró y no fichó la salida
  | 'correccion'  // le faltaba algo y ya pidió la corrección (pendiente de aprobar)
  | 'festivo'
  | 'ausencia'    // vacaciones, permiso o baja (aprobada o pendiente de aprobar)
  | 'fuera'       // antes del alta o después de la baja
  | 'finde'       // sábado o domingo con fichajes

export interface DiaInforme {
  dia: string
  etiqueta: string
  estado: EstadoDia
  /** Lo que le tocaba trabajar ese día */
  esperadoMin: number
  fichadoMin: number
  pausaMin: number
  entrada: string | null
  salida: string | null
  /** Festivo: su nombre. Ausencia: «Vacaciones», «Baja»… */
  texto: string | null
  ausenciaTipo?: TipoAusencia
  ausenciaPendiente?: boolean
}

export interface InformeTrabajador {
  trabajadorId: string
  nombre: string
  lunes: string
  domingo: string
  horasSemana: number
  dias: DiaInforme[]
  fichadoMin: number
  esperadoMin: number
  sinFichar: number
  sinSalida: number
  correcciones: number
  /** completo · incompleto (faltan fichajes) · de_menos (todo fichado pero bastante por debajo de su jornada) */
  estado: 'completo' | 'incompleto' | 'de_menos'
  /** Días de vacaciones, permiso y baja de la semana */
  diasAusencia: Partial<Record<TipoAusencia, number>>
}

/** Margen para no avisar por minutos: menos de 1 h por debajo de la jornada de la semana no cuenta */
export const MARGEN_MIN = 60

export function informeSemana(p: {
  trabajador: { id: string; nombre: string; fecha_inicio: string; fecha_baja?: string | null; jornada?: string | null; horas_semana?: number | null }
  /** Horas de la jornada completa del convenio (perfil_laboral), 40 si no se sabe */
  horasConvenio?: number | null
  fichajes: Fichaje[]
  ausencias: Ausencia[]
  festivos: Map<string, string>
  lunes: string
}): InformeTrabajador {
  const { trabajador: t, lunes } = p
  const domingo = sumarDias(lunes, 6)
  const horasSemana = Number(t.jornada === 'parcial' ? t.horas_semana || 0 : t.horas_semana || p.horasConvenio || 40)
  const porDia = Math.round((horasSemana * 60) / 5)

  const mios = p.fichajes.filter((f) => f.trabajador_id === t.id)
  // Sin cerrar el tramo abierto: si no fichó la salida, ese día cuenta lo cerrado y se avisa
  const resumen = new Map(resumenDias(mios, new Date(), diaMadrid, false).map((d) => [d.dia, d]))
  const pendientes = new Set(mios.filter((f) => f.estado === 'pendiente').map((f) => diaMadrid(f.momento)))
  const susAusencias = p.ausencias.filter((a) => a.trabajador_id === t.id)

  const dias: DiaInforme[] = []
  for (const dia of diasEntre(lunes, domingo)) {
    const r = resumen.get(dia)
    const finde = diaSemana(dia) === 0 || diaSemana(dia) === 6
    const base: DiaInforme = {
      dia,
      etiqueta: etiquetaDia(dia),
      estado: 'ok',
      esperadoMin: 0,
      fichadoMin: Math.round(r?.trabajadoMin ?? 0),
      pausaMin: Math.round(r?.pausaMin ?? 0),
      entrada: r?.entrada ?? null,
      salida: r?.salida ?? null,
      texto: null,
    }
    const fueraContrato = dia < t.fecha_inicio || Boolean(t.fecha_baja && dia > t.fecha_baja)
    const aus = ausenciaDelDia(dia, susAusencias)
    const fest = p.festivos.get(dia)

    if (finde) {
      if (r) dias.push({ ...base, estado: r.abierto ? (pendientes.has(dia) ? 'correccion' : 'salida') : 'finde' })
      continue
    }
    if (fueraContrato) {
      if (r) dias.push({ ...base, estado: 'fuera' })
      continue
    }
    if (fest) {
      dias.push({ ...base, estado: 'festivo', texto: fest })
      continue
    }
    if (aus) {
      dias.push({
        ...base,
        estado: 'ausencia',
        texto: nombreAusencia(aus, true),
        ausenciaTipo: aus.tipo,
        ausenciaPendiente: aus.estado === 'pendiente',
      })
      continue
    }
    const esperado = { ...base, esperadoMin: porDia }
    if (!r) dias.push({ ...esperado, estado: pendientes.has(dia) ? 'correccion' : 'falta' })
    else if (r.abierto) dias.push({ ...esperado, estado: pendientes.has(dia) ? 'correccion' : 'salida' })
    else dias.push(esperado)
  }

  const fichadoMin = dias.reduce((s, d) => s + d.fichadoMin, 0)
  const esperadoMin = dias.reduce((s, d) => s + d.esperadoMin, 0)
  const sinFichar = dias.filter((d) => d.estado === 'falta').length
  const sinSalida = dias.filter((d) => d.estado === 'salida').length
  const correcciones = dias.filter((d) => d.estado === 'correccion').length
  const diasAusencia: Partial<Record<TipoAusencia, number>> = {}
  for (const d of dias) if (d.ausenciaTipo) diasAusencia[d.ausenciaTipo] = (diasAusencia[d.ausenciaTipo] ?? 0) + 1

  const estado = sinFichar + sinSalida > 0 ? 'incompleto' : fichadoMin < esperadoMin - MARGEN_MIN && correcciones === 0 ? 'de_menos' : 'completo'
  return {
    trabajadorId: t.id,
    nombre: t.nombre,
    lunes,
    domingo,
    horasSemana,
    dias,
    fichadoMin,
    esperadoMin,
    sinFichar,
    sinSalida,
    correcciones,
    estado,
    diasAusencia,
  }
}

/** «7 h 30», «45 min», «−16 h 30» */
export function duracionCorta(min: number): string {
  const s = min < 0 ? '−' : ''
  const m = Math.abs(Math.round(min))
  const h = Math.floor(m / 60)
  return s + (h ? `${h} h${m % 60 ? ` ${String(m % 60).padStart(2, '0')}` : ''}` : `${m} min`)
}

/** «del lunes 23 al domingo 29 de noviembre» */
export function textoSemana(lunes: string): string {
  const dom = sumarDias(lunes, 6)
  const mes = (iso: string) => new Date(iso + 'T12:00:00Z').toLocaleDateString('es-ES', { month: 'long', timeZone: 'UTC' })
  const d = (iso: string) => Number(iso.slice(8, 10))
  return mes(lunes) === mes(dom)
    ? `del lunes ${d(lunes)} al domingo ${d(dom)} de ${mes(dom)}`
    : `del lunes ${d(lunes)} de ${mes(lunes)} al domingo ${d(dom)} de ${mes(dom)}`
}
