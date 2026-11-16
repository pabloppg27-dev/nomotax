// Sin dependencias del navegador: lo usa también scripts/sincronizar.ts
import { MESES_CORTOS, fecha } from './format.ts'

export type FormatoExtracto = 'pdf' | 'csv' | 'excel'

export interface ExtractoBancario {
  id: string
  owner_id: string
  banco: string
  cuenta: string | null
  desde: string
  hasta: string
  formato: FormatoExtracto
  nombre_archivo: string | null
  file_path: string
  conciliado: boolean
  notas: string | null
  subido_por: string | null
  created_at: string
}

/** Lo que se puede elegir en el selector de archivos */
export const ACCEPT_EXTRACTO =
  '.pdf,.csv,.xls,.xlsx,application/pdf,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

const TIPOS: Record<string, { formato: FormatoExtracto; mime: string }> = {
  pdf: { formato: 'pdf', mime: 'application/pdf' },
  csv: { formato: 'csv', mime: 'text/csv' },
  xls: { formato: 'excel', mime: 'application/vnd.ms-excel' },
  xlsx: { formato: 'excel', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
}

/** Se decide por la extensión: Windows suele mandar los CSV como «application/vnd.ms-excel» o sin tipo */
export function tipoExtracto(file: File) {
  const ext = file.name.toLowerCase().split('.').pop() ?? ''
  const t = TIPOS[ext]
  if (!t) throw new Error(`«${file.name}» no es un PDF, CSV ni Excel`)
  if (file.size > 15 * 1024 * 1024) throw new Error(`«${file.name}» supera los 15 MB`)
  if (!file.size) throw new Error(`«${file.name}» está vacío`)
  return { ...t, ext }
}

/* ------------------------------------------------------------- Periodos */

export type TipoPeriodo = 'mes' | 'trimestre' | 'anio' | 'personalizado'

export const TIPOS_PERIODO: { id: TipoPeriodo; label: string }[] = [
  { id: 'mes', label: 'Mes' },
  { id: 'trimestre', label: 'Trimestre' },
  { id: 'anio', label: 'Año' },
  { id: 'personalizado', label: 'Personalizado' },
]

export const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

const dd = (n: number) => String(n).padStart(2, '0')
const ultimoDia = (anio: number, mes: number) => new Date(anio, mes, 0).getDate() // mes 1-12

export function rangoMeses(anio: number, mesIni: number, mesFin: number) {
  return { desde: `${anio}-${dd(mesIni)}-01`, hasta: `${anio}-${dd(mesFin)}-${dd(ultimoDia(anio, mesFin))}` }
}

/** Texto corto del periodo: «Octubre 2026», «3T 2026», «Año 2026» o «01/02/2026 – 15/05/2026» */
export function nombrePeriodo(desde: string, hasta: string): string {
  const [a1, m1, d1] = desde.split('-').map(Number)
  const [a2, m2, d2] = hasta.split('-').map(Number)
  const mesesEnteros = d1 === 1 && d2 === ultimoDia(a2, m2) && a1 === a2
  if (mesesEnteros) {
    if (m1 === m2) return `${MESES[m1 - 1]} ${a1}`
    if (m1 === 1 && m2 === 12) return `Año ${a1}`
    if ((m1 - 1) % 3 === 0 && m2 === m1 + 2) return `${(m1 + 2) / 3}T ${a1}`
    return `${MESES_CORTOS[m1 - 1]}–${MESES_CORTOS[m2 - 1]} ${a1}`
  }
  return `${fecha(desde)} – ${fecha(hasta)}`
}

/**
 * Cobertura de cada mes del año para un banco (o todos): 'completo' si los extractos cubren todos
 * los días del mes, 'parcial' si alguno, null si ninguno.
 */
export function coberturaAnual(lista: ExtractoBancario[], anio: number): ('completo' | 'parcial' | null)[] {
  return Array.from({ length: 12 }, (_, i) => {
    const mes = i + 1
    const { desde, hasta } = rangoMeses(anio, mes, mes)
    const dias = ultimoDia(anio, mes)
    const cubiertos = new Set<number>()
    for (const e of lista) {
      if (e.hasta < desde || e.desde > hasta) continue
      const ini = e.desde < desde ? 1 : Number(e.desde.slice(8, 10))
      const fin = e.hasta > hasta ? dias : Number(e.hasta.slice(8, 10))
      for (let d = ini; d <= fin; d++) cubiertos.add(d)
    }
    return cubiertos.size === 0 ? null : cubiertos.size >= dias ? 'completo' : 'parcial'
  })
}
