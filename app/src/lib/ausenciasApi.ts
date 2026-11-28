/**
 * Ausencias en Supabase (supabase/ausencias.sql) y, en local con ?demo, en memoria (no se guarda nada).
 * Tras pedir, aprobar, rechazar o anular se avisa por correo con la Edge Function «jornada» (si falla, no
 * se bloquea nada: el cambio ya está hecho).
 */
import { BUCKET, errorMessage, supabase } from './supabase'
import { enDemo } from './demoFichaje'
import { nuevoId } from './id'
import { prepararArchivo } from './upload'
import { diaSemana, sumarDias, type Ausencia, type TipoAusencia } from './ausencias'
import type { FestivoLocal } from './festivos'

export type EventoAusencia = 'nueva' | 'resuelta' | 'anulada'

/** Correo al propietario (nueva) o al trabajador (resuelta, anulada). Sin esperar ni romper nada si falla. */
function avisar(a: Ausencia, evento: EventoAusencia) {
  if (enDemo()) return
  supabase.functions.invoke('jornada', { body: { accion: 'aviso', ausencia_id: a.id, evento } }).catch(() => {})
}

// ------------------------------------------------------------------ Demo (solo npm run dev con ?demo)

const hoy = new Date().toLocaleDateString('sv-SE')
const lunes = sumarDias(hoy, -((diaSemana(hoy) + 6) % 7))
let DEMO: Ausencia[] | null = null
let DEMO_FEST: FestivoLocal[] = [{ id: 'fl1', fecha: `${hoy.slice(0, 4)}-10-06`, nombre: 'Fiesta mayor' }]
const demoAus = (p: Partial<Ausencia>): Ausencia => ({
  id: nuevoId(), owner_id: 'demo', trabajador_id: 'd1', tipo: 'vacaciones', subtipo: null, desde: hoy, hasta: hoy, motivo: null,
  archivo_path: null, estado: 'aprobada', respuesta: null, solicitado_por: null, revisado_por: null, revisado_at: null,
  asesor_visto: false, created_at: new Date().toISOString(), ...p,
})
function demo(): Ausencia[] {
  DEMO ??= [
    demoAus({ trabajador_id: 'd1', desde: `${hoy.slice(0, 4)}-08-03`, hasta: `${hoy.slice(0, 4)}-08-14` }),
    demoAus({ trabajador_id: 'd1', desde: sumarDias(lunes, 21), hasta: sumarDias(lunes, 25), estado: 'pendiente' }),
    demoAus({ trabajador_id: 'd2', tipo: 'permiso', subtipo: 'mudanza', desde: sumarDias(lunes, 9), hasta: sumarDias(lunes, 9), estado: 'pendiente', motivo: 'Me cambio de piso' }),
    demoAus({ trabajador_id: 'd3', tipo: 'baja', subtipo: 'enfermedad', desde: sumarDias(lunes, -3), hasta: null }),
    demoAus({ trabajador_id: 'd2', desde: sumarDias(lunes, 2), hasta: sumarDias(lunes, 3) }),
  ]
  return DEMO
}

// ------------------------------------------------------------------ Lectura

export async function cargarAusencias(ownerId: string, trabajadorId?: string | null): Promise<Ausencia[]> {
  if (enDemo()) return demo().filter((a) => !trabajadorId || a.trabajador_id === trabajadorId)
  let q = supabase.from('ausencias').select('*').eq('owner_id', ownerId)
  if (trabajadorId) q = q.eq('trabajador_id', trabajadorId)
  const { data, error } = await q.order('desde', { ascending: false })
  // Sin la tabla (falta ausencias.sql): ninguna
  if (error) return []
  return (data as Ausencia[]) ?? []
}

export async function cargarFestivosLocales(ownerId: string): Promise<FestivoLocal[]> {
  if (enDemo()) return DEMO_FEST
  const { data, error } = await supabase.from('festivos_empresa').select('id, fecha, nombre').eq('owner_id', ownerId).order('fecha')
  return error ? [] : ((data as FestivoLocal[]) ?? [])
}

// ------------------------------------------------------------------ Cambios

export interface NuevaAusencia {
  cuenta: string
  trabajadorId: string
  tipo: TipoAusencia
  subtipo: string | null
  desde: string
  hasta: string | null
  motivo: string
  archivo?: File | null
}

async function subirJustificante(cuenta: string, trabajadorId: string, f: File): Promise<string> {
  const archivo = await prepararArchivo(f)
  const ext = archivo.type === 'application/pdf' ? 'pdf' : archivo.type === 'image/png' ? 'png' : 'jpg'
  const path = `${cuenta}/laboral/${trabajadorId}/ausencias/${nuevoId()}.${ext}`
  const up = await supabase.storage.from(BUCKET).upload(path, archivo, { contentType: archivo.type })
  if (up.error) throw new Error(await errorMessage(up.error))
  return path
}

export async function pedirAusencia(n: NuevaAusencia, admin: boolean): Promise<Ausencia> {
  if (enDemo()) {
    const solapa = demo().some(
      (a) => a.trabajador_id === n.trabajadorId && (a.estado === 'pendiente' || a.estado === 'aprobada') &&
        a.desde <= (n.hasta ?? '9999-12-31') && (a.hasta ?? '9999-12-31') >= n.desde,
    )
    if (solapa) throw new Error('Ya hay otra ausencia en esas fechas')
    const a = demoAus({ ...n, trabajador_id: n.trabajadorId, motivo: n.motivo || null, archivo_path: n.archivo ? 'demo' : null, estado: admin || n.tipo === 'baja' ? 'aprobada' : 'pendiente' })
    DEMO = [a, ...demo()]
    return a
  }
  const archivo = n.archivo ? await subirJustificante(n.cuenta, n.trabajadorId, n.archivo) : null
  const { data, error } = await supabase.rpc('pedir_ausencia', {
    p_cuenta: n.cuenta,
    p_trabajador: n.trabajadorId,
    p_tipo: n.tipo,
    p_subtipo: n.subtipo,
    p_desde: n.desde,
    p_hasta: n.hasta,
    p_motivo: n.motivo.trim() || null,
    p_archivo: archivo,
  })
  if (error) {
    if (archivo) await supabase.storage.from(BUCKET).remove([archivo])
    throw new Error(await errorMessage(error))
  }
  const a = data as Ausencia
  // Lo que apunta la empresa no necesita aviso al propietario; lo del trabajador, sí
  if (!admin) avisar(a, 'nueva')
  else if (a.tipo !== 'baja') avisar(a, 'resuelta')
  return a
}

function cambiarDemo(id: string, cambios: Partial<Ausencia>): Ausencia {
  DEMO = demo().map((a) => (a.id === id ? { ...a, ...cambios } : a))
  return demo().find((a) => a.id === id)!
}

export async function resolverAusencia(a: Ausencia, aprobar: boolean, respuesta = ''): Promise<Ausencia> {
  if (enDemo()) return cambiarDemo(a.id, { estado: aprobar ? 'aprobada' : 'rechazada', respuesta: respuesta || null })
  const { data, error } = await supabase.rpc('resolver_ausencia', { p_id: a.id, p_aprobar: aprobar, p_respuesta: respuesta.trim() || null })
  if (error) throw new Error(await errorMessage(error))
  avisar(data as Ausencia, 'resuelta')
  return data as Ausencia
}

export async function anularAusencia(a: Ausencia, motivo = '', admin = false): Promise<Ausencia> {
  if (enDemo()) return cambiarDemo(a.id, { estado: 'anulada', respuesta: motivo || null })
  const { data, error } = await supabase.rpc('anular_ausencia', { p_id: a.id, p_motivo: motivo.trim() || null })
  if (error) throw new Error(await errorMessage(error))
  if (admin) avisar(data as Ausencia, 'anulada')
  return data as Ausencia
}

export async function cerrarBaja(a: Ausencia, hasta: string): Promise<Ausencia> {
  if (enDemo()) return cambiarDemo(a.id, { hasta })
  const { data, error } = await supabase.rpc('cerrar_baja', { p_id: a.id, p_hasta: hasta })
  if (error) throw new Error(await errorMessage(error))
  return data as Ausencia
}

export async function adjuntarJustificante(a: Ausencia, f: File): Promise<Ausencia> {
  if (enDemo()) return cambiarDemo(a.id, { archivo_path: 'demo' })
  const path = await subirJustificante(a.owner_id, a.trabajador_id, f)
  const { data, error } = await supabase.rpc('adjuntar_ausencia', { p_id: a.id, p_archivo: path })
  if (error) {
    await supabase.storage.from(BUCKET).remove([path])
    throw new Error(await errorMessage(error))
  }
  return data as Ausencia
}

export async function ponerFestivoLocal(ownerId: string, fecha: string, nombre: string): Promise<void> {
  if (enDemo()) {
    DEMO_FEST = [...DEMO_FEST.filter((f) => f.fecha !== fecha), { id: nuevoId(), fecha, nombre }].sort((a, b) => a.fecha.localeCompare(b.fecha))
    return
  }
  const { error } = await supabase.from('festivos_empresa').insert({ owner_id: ownerId, fecha, nombre: nombre.trim() })
  if (error) throw new Error(/duplicate|unique/i.test(error.message) ? 'Ese día ya está como festivo' : await errorMessage(error))
}

export async function quitarFestivoLocal(id: string): Promise<void> {
  if (enDemo()) {
    DEMO_FEST = DEMO_FEST.filter((f) => f.id !== id)
    return
  }
  const { error } = await supabase.from('festivos_empresa').delete().eq('id', id)
  if (error) throw new Error(await errorMessage(error))
}
