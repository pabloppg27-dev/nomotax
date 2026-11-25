/**
 * Bandeja del panel del asesor: todo lo pendiente de todos los clientes en un sitio.
 * Peticiones (supabase/panel-asesor.sql), llamadas y citas, altas laborales,
 * cambios de IRPF, gastos por revisar, posibles amortizaciones y notificaciones con plazo.
 * Si alguna tabla aún no existe (falta su SQL), esa parte sale vacía.
 */
import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { EstadoTrabajador } from './types'

export type TipoPeticion = 'renta' | 'certificado' | 'consulta' | 'documento' | 'nota' | 'otro'

export const TIPOS_PETICION: Record<TipoPeticion, string> = {
  renta: 'Declaración de la renta',
  certificado: 'Un certificado',
  consulta: 'Una consulta',
  documento: 'Un documento o modelo',
  nota: 'Una nota para el asesor',
  otro: 'Otra cosa',
}

export type Peticion = { id: string; owner_id: string; tipo: TipoPeticion; texto: string | null; estado: 'pendiente' | 'hecha'; respuesta: string | null; created_at: string }
export type Llamada = { id: string; owner_id: string; tipo: 'llamame' | 'cita'; inicio: string | null; modalidad: string | null; telefono: string | null; tema: string | null; franja: string | null; meet_link: string | null; created_at: string }
export type Alta = { id: string; owner_id: string; nombre: string; fecha_inicio: string; estado: EstadoTrabajador; created_at: string }
export type CambioIrpf = { id: string; owner_id: string; trabajador_id: string; pct_actual: number | null; pct_solicitado: number; desde: string; comentario: string | null; created_at: string; trabajador: { nombre: string } | null }
export type GastosPorRevisar = { owner_id: string; cuantos: number; desde: string }
export type Amortizable = { id: string; owner_id: string; proveedor: string | null; concepto: string | null; base: number; fecha: string | null }
export type Notificacion = { id: string; owner_id: string; titulo: string; organismo: string | null; fecha_limite: string; tipo: string }

export interface Bandeja {
  peticiones: Peticion[]
  llamadas: Llamada[]
  altas: Alta[]
  irpf: CambioIrpf[]
  gastos: GastosPorRevisar[]
  amortizables: Amortizable[]
  notificaciones: Notificacion[]
  /** id → nombre de cada cuenta */
  nombres: Map<string, string>
}

const lista = <T,>(r: { data: unknown; error: unknown }): T[] => (r.error ? [] : ((r.data as T[]) ?? []))

export async function cargarBandeja(): Promise<Bandeja> {
  const [perfiles, pe, ll, al, ir, ga, am, no] = await Promise.all([
    supabase.from('profiles').select('id, nombre, nombre_comercial, email'),
    supabase.from('peticiones').select('*').eq('estado', 'pendiente').order('created_at'),
    supabase.from('llamadas').select('*').eq('estado', 'pendiente').order('created_at'),
    supabase.from('trabajadores').select('id, owner_id, nombre, fecha_inicio, estado, created_at').in('estado', ['solicitada', 'en_tramite']).order('fecha_inicio'),
    supabase.from('solicitudes_irpf').select('*, trabajador:trabajadores(nombre)').eq('estado', 'pendiente').order('created_at'),
    supabase.from('expenses').select('owner_id, created_at').eq('estado', 'pendiente').order('created_at'),
    supabase.from('expenses').select('id, owner_id, proveedor, concepto, base, fecha').eq('revision', 'pendiente').order('fecha'),
    supabase.from('archivo').select('id, owner_id, titulo, organismo, fecha_limite, tipo').eq('atendida', false).not('fecha_limite', 'is', null).order('fecha_limite'),
  ])
  const nombres = new Map(
    lista<{ id: string; nombre: string | null; nombre_comercial: string | null; email: string | null }>(perfiles).map((p) => [
      p.id,
      p.nombre_comercial || p.nombre || p.email || 'Cliente',
    ]),
  )
  // Gastos subidos por el cliente sin revisar: uno por cliente, con el más antiguo
  const porCliente = new Map<string, GastosPorRevisar>()
  for (const g of lista<{ owner_id: string; created_at: string }>(ga)) {
    const c = porCliente.get(g.owner_id)
    if (c) c.cuantos++
    else porCliente.set(g.owner_id, { owner_id: g.owner_id, cuantos: 1, desde: g.created_at })
  }
  return {
    peticiones: lista(pe),
    llamadas: lista(ll),
    altas: lista(al),
    irpf: lista(ir),
    gastos: [...porCliente.values()].sort((a, b) => b.cuantos - a.cuantos),
    amortizables: lista(am),
    notificaciones: lista(no),
    nombres,
  }
}

/** Cuántas cosas hay pendientes (los gastos cuentan por cliente, no uno a uno) */
export const totalBandeja = (b: Bandeja) =>
  b.peticiones.length + b.llamadas.length + b.altas.length + b.irpf.length + b.gastos.length + b.amortizables.length + b.notificaciones.length

/** Avisar al menú de que algo ha cambiado (para el número de la Bandeja) */
export const avisarBandeja = () => window.dispatchEvent(new Event('nt-bandeja'))

/** Número para el menú: se recarga al cambiar de página y cuando la Bandeja avisa */
export function useTotalBandeja(activo: boolean, clave: string): number {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!activo) return setN(0)
    let vivo = true
    const cargar = () => cargarBandeja().then((b) => vivo && setN(totalBandeja(b))).catch(() => {})
    cargar()
    window.addEventListener('nt-bandeja', cargar)
    return () => {
      vivo = false
      window.removeEventListener('nt-bandeja', cargar)
    }
  }, [activo, clave])
  return n
}
