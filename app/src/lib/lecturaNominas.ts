/**
 * Lectura de nóminas con la función leer-nomina (Claude): una nómina, o el mapa de
 * páginas de un PDF con las de todos los trabajadores (panel del asesor → Nóminas).
 */
import { invocar } from './supabase'
import { round2 } from './format'
import { limpiarDni } from './laboral'
import type { Nomina, NominaOcr, Trabajador } from './types'

export async function leerNomina(path: string): Promise<NominaOcr> {
  const data = await invocar<{ datos?: NominaOcr }>('leer-nomina', { path })
  if (!data?.datos) throw new Error('No se han podido leer los datos')
  return data.datos
}

/** Pasa lo leído a los campos de la nómina */
export function datosDeOcr(o: NominaOcr, trabajadores: Trabajador[]) {
  const bruto = Number(o.total_devengado ?? 0)
  const ssEmp = Number(o.ss_empresa ?? 0)
  return {
    trabajador_id: buscarTrabajador(o, trabajadores),
    nombre_leido: o.trabajador?.nombre ?? null,
    dni_leido: limpiarDni(o.trabajador?.dni) || null,
    tipo: o.tipo ?? 'mensual',
    bruto,
    neto: Number(o.liquido ?? 0),
    irpf: Number(o.irpf_importe ?? 0),
    irpf_pct: o.irpf_pct,
    ss_trabajador: Number(o.ss_trabajador ?? 0),
    ss_empresa: ssEmp,
    variables: Number(o.variables ?? 0),
    coste_total: round2(bruto + ssEmp),
    conceptos: o.conceptos_variables,
    ocr: o,
  }
}

export function buscarTrabajador(ocr: NominaOcr, lista: Trabajador[]): string | null {
  const dni = limpiarDni(ocr.trabajador?.dni)
  if (dni) {
    const t = lista.find((w) => limpiarDni(w.dni) === dni)
    if (t) return t.id
  }
  const nombre = (ocr.trabajador?.nombre ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (nombre) {
    const palabras = nombre.split(/[\s,]+/).filter((p) => p.length > 2)
    const t = lista.find((w) => {
      const n = w.nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      return palabras.length > 1 && palabras.every((p) => n.includes(p))
    })
    if (t) return t.id
  }
  return null
}

/** Una nómina dentro de un PDF con varias: sus páginas (desde 1) y de quién es */
export interface TrozoNomina {
  paginas: number[]
  nombre: string | null
  dni: string | null
  periodo_mes: number | null
  periodo_anio: number | null
  tipo: Nomina['tipo']
}

export interface MapaNominas {
  nominas: TrozoNomina[]
  otras_paginas: number[]
  notas: string | null
}

/** Qué páginas son de cada trabajador (leer-nomina en modo «mapa») */
export async function mapaNominas(path: string): Promise<MapaNominas> {
  const data = await invocar<{ mapa?: MapaNominas; datos?: unknown }>('leer-nomina', { path, modo: 'mapa' })
  if (!data?.mapa) {
    if (data?.datos) throw new Error('Falta publicar la nueva versión de la función leer-nomina en Supabase')
    throw new Error('No se ha podido leer el PDF')
  }
  return data.mapa
}
