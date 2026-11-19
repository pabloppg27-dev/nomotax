/**
 * Registro de jornada (art. 34.9 ET). Los fichajes no se editan ni se borran (supabase/fichajes.sql):
 * aquí solo se calculan las horas a partir de los válidos, ignorando los que una corrección sustituye.
 */
export type TipoFichaje = 'entrada' | 'pausa' | 'reanudar' | 'salida'

export interface Fichaje {
  id: string
  owner_id: string
  trabajador_id: string
  tipo: TipoFichaje
  momento: string
  origen: 'app' | 'correccion'
  estado: 'valido' | 'pendiente' | 'rechazado'
  motivo: string | null
  anula_id: string | null
  registrado_por: string | null
  revisado_por: string | null
  revisado_at: string | null
  created_at: string
}

export const NOMBRE_TIPO: Record<TipoFichaje, string> = {
  entrada: 'Entrada',
  pausa: 'Inicio de pausa',
  reanudar: 'Fin de pausa',
  salida: 'Salida',
}

/** Fichajes que cuentan: válidos y no sustituidos por una corrección válida */
export function vigentes(fs: Fichaje[]): Fichaje[] {
  const anulados = new Set(fs.filter((f) => f.estado === 'valido' && f.anula_id).map((f) => f.anula_id))
  return fs.filter((f) => f.estado === 'valido' && !anulados.has(f.id)).sort((a, b) => a.momento.localeCompare(b.momento))
}

/** Día local (AAAA-MM-DD) de un instante */
export function diaLocal(iso: string | Date): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })

/** «7 h 30 min» */
export function duracion(min: number): string {
  const m = Math.max(0, Math.round(min))
  const h = Math.floor(m / 60)
  return h ? `${h} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`
}

export interface Dia {
  dia: string
  entrada: string | null
  salida: string | null
  trabajadoMin: number
  pausaMin: number
  abierto: boolean
  fichajes: Fichaje[]
}

/** Agrupa por día (el de la entrada) y suma el tiempo trabajado y de pausa. `ahora` cierra el tramo abierto. */
export function resumenDias(fs: Fichaje[], ahora = new Date()): Dia[] {
  const dias = new Map<string, Dia>()
  let actual: Dia | null = null
  let desde: number | null = null
  let pausaDesde: number | null = null
  for (const f of vigentes(fs)) {
    const t = new Date(f.momento).getTime()
    if (f.tipo === 'entrada' && actual && (desde !== null || pausaDesde !== null)) actual.abierto = true
    if (f.tipo === 'entrada' || !actual) {
      const d = diaLocal(f.momento)
      actual = dias.get(d) ?? { dia: d, entrada: null, salida: null, trabajadoMin: 0, pausaMin: 0, abierto: false, fichajes: [] }
      dias.set(d, actual)
    }
    actual.fichajes.push(f)
    if (f.tipo === 'entrada') {
      actual.entrada ??= f.momento
      desde = t
      pausaDesde = null
    } else if (f.tipo === 'pausa' && desde !== null) {
      actual.trabajadoMin += (t - desde) / 60000
      desde = null
      pausaDesde = t
    } else if (f.tipo === 'reanudar') {
      if (pausaDesde !== null) actual.pausaMin += (t - pausaDesde) / 60000
      pausaDesde = null
      desde = t
    } else if (f.tipo === 'salida') {
      if (desde !== null) actual.trabajadoMin += (t - desde) / 60000
      if (pausaDesde !== null) actual.pausaMin += (t - pausaDesde) / 60000
      actual.salida = f.momento
      desde = pausaDesde = null
    }
  }
  if (actual && (desde !== null || pausaDesde !== null)) {
    actual.abierto = true
    if (desde !== null) actual.trabajadoMin += (ahora.getTime() - desde) / 60000
    if (pausaDesde !== null) actual.pausaMin += (ahora.getTime() - pausaDesde) / 60000
  }
  return [...dias.values()].sort((a, b) => b.dia.localeCompare(a.dia))
}

/** Estado actual según el último fichaje vigente */
export function estadoActual(fs: Fichaje[]): 'fuera' | 'dentro' | 'pausa' {
  const v = vigentes(fs)
  const u = v[v.length - 1]
  if (!u || Date.now() - new Date(u.momento).getTime() > 24 * 3600 * 1000) return 'fuera'
  return u.tipo === 'pausa' ? 'pausa' : u.tipo === 'salida' ? 'fuera' : 'dentro'
}

/** CSV mensual para Excel / Inspección (separador ;) */
export function csvRegistro(nombre: string, nif: string | null, dias: Dia[]): string {
  const filas = [
    ['Trabajador', nombre],
    ['NIF', nif ?? ''],
    [],
    ['Día', 'Entrada', 'Salida', 'Pausas', 'Horas trabajadas', 'Detalle'],
    ...[...dias]
      .sort((a, b) => a.dia.localeCompare(b.dia))
      .map((d) => [
        d.dia.split('-').reverse().join('/'),
        d.entrada ? hora(d.entrada) : '',
        d.salida ? hora(d.salida) : d.abierto ? 'Sin cerrar' : '',
        duracion(d.pausaMin),
        (d.trabajadoMin / 60).toFixed(2).replace('.', ','),
        d.fichajes.map((f) => `${NOMBRE_TIPO[f.tipo]} ${hora(f.momento)}${f.origen === 'correccion' ? ` (corrección: ${f.motivo})` : ''}`).join(' | '),
      ]),
    [],
    ['Total horas', '', '', '', (dias.reduce((s, d) => s + d.trabajadoMin, 0) / 60).toFixed(2).replace('.', ',')],
  ]
  return '﻿' + filas.map((f) => f.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n')
}

export function descargar(nombreArchivo: string, contenido: string) {
  const url = URL.createObjectURL(new Blob([contenido], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = nombreArchivo
  a.click()
  URL.revokeObjectURL(url)
}
