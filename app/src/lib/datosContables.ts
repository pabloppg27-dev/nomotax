import { supabase } from './supabase'
import type { AsientoManual, DatosContables, Inmovilizado } from './contabilidad.ts'
import type { Expense, Invoice, Nomina } from './types'

/** Todo lo que necesita el motor contable de una cuenta */
export async function cargarDatosContables(ownerId: string): Promise<DatosContables> {
  const [f, g, n, t, m, i] = await Promise.all([
    supabase.from('invoices').select('*').eq('owner_id', ownerId),
    supabase.from('expenses').select('*').eq('owner_id', ownerId),
    supabase.from('nominas').select('*').eq('owner_id', ownerId),
    supabase.from('trabajadores').select('id, nombre').eq('owner_id', ownerId),
    supabase.from('asientos_manuales').select('*').eq('owner_id', ownerId),
    supabase.from('inmovilizados').select('*').eq('owner_id', ownerId),
  ])
  const nombreTrab = new Map(((t.data as { id: string; nombre: string }[]) ?? []).map((x) => [x.id, x.nombre]))
  return {
    facturas: (f.data as Invoice[]) ?? [],
    gastos: (g.data as Expense[]) ?? [],
    nominas: ((n.data as Nomina[]) ?? []).map((x) => ({ ...x, trabajador_nombre: x.trabajador_id ? nombreTrab.get(x.trabajador_id) : null })),
    manuales: (m.data as AsientoManual[]) ?? [],
    inmovilizados: (i.data as Inmovilizado[]) ?? [],
  }
}

export function descargar(datos: ArrayBuffer | string, nombre: string, tipo: string) {
  const blob = new Blob([datos], { type: tipo })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
