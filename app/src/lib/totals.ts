import { round2 } from './format'
import type { Linea } from './types'

export const TIPOS_IVA = [21, 10, 4, 0]
export const TIPOS_IRPF = [0, 7, 15, 19]

export interface Totales {
  base: number
  cuota_iva: number
  cuota_irpf: number
  total: number
  desglose: { tipo: number; base: number; cuota: number }[]
}

export function importeLinea(l: Linea): number {
  const bruto = Number(l.cantidad || 0) * Number(l.precio || 0)
  return round2(bruto * (1 - Number(l.descuento || 0) / 100))
}

export function calcularTotales(lineas: Linea[], irpfPct: number): Totales {
  const porTipo = new Map<number, number>()
  for (const l of lineas) {
    const tipo = Number(l.iva || 0)
    porTipo.set(tipo, round2((porTipo.get(tipo) ?? 0) + importeLinea(l)))
  }
  const desglose = [...porTipo.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([tipo, base]) => ({ tipo, base, cuota: round2((base * tipo) / 100) }))
  const base = round2(desglose.reduce((s, d) => s + d.base, 0))
  const cuota_iva = round2(desglose.reduce((s, d) => s + d.cuota, 0))
  const cuota_irpf = round2((base * Number(irpfPct || 0)) / 100)
  return { base, cuota_iva, cuota_irpf, total: round2(base + cuota_iva - cuota_irpf), desglose }
}

export const lineaVacia = (): Linea => ({ concepto: '', cantidad: 1, precio: 0, iva: 21 })
