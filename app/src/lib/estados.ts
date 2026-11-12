import type { CausaRectificacion, Invoice, InvoiceEstado, QuoteEstado } from './types'

export const ESTADOS_PRESUPUESTO: Record<QuoteEstado, { label: string; tono: 'gris' | 'lima' | 'verde' | 'ambar' | 'rojo' | 'negro' }> = {
  borrador: { label: 'Borrador', tono: 'gris' },
  enviado: { label: 'Enviado', tono: 'ambar' },
  aceptado: { label: 'Aceptado', tono: 'verde' },
  rechazado: { label: 'Rechazado', tono: 'rojo' },
  facturado: { label: 'Facturado', tono: 'negro' },
}

export const ESTADOS_FACTURA: Record<InvoiceEstado, { label: string; tono: 'gris' | 'lima' | 'verde' | 'ambar' | 'rojo' | 'negro' }> = {
  borrador: { label: 'Borrador', tono: 'gris' },
  emitida: { label: 'Pendiente de cobro', tono: 'ambar' },
  cobrada: { label: 'Cobrada', tono: 'verde' },
}

export function vencida(estado: InvoiceEstado, vencimiento: string | null, hoy: string): boolean {
  return estado === 'emitida' && Boolean(vencimiento) && (vencimiento as string) < hoy
}

/** Etiqueta del estado (las rectificativas se abonan en vez de cobrarse) */
export function estadoFactura(f: Pick<Invoice, 'estado' | 'tipo' | 'vencimiento'>, hoy: string) {
  if (vencida(f.estado, f.vencimiento, hoy) && f.tipo !== 'rectificativa') return { label: 'Vencida', tono: 'rojo' as const }
  if (f.tipo === 'rectificativa') {
    if (f.estado === 'emitida') return { label: 'Pendiente de abono', tono: 'ambar' as const }
    if (f.estado === 'cobrada') return { label: 'Abonada', tono: 'verde' as const }
  }
  return ESTADOS_FACTURA[f.estado]
}

/** Causas de rectificación (códigos de Verifactu / SII) */
export const CAUSAS_RECTIFICACION: { id: CausaRectificacion; nombre: string }[] = [
  { id: 'R1', nombre: 'Error fundado en derecho, devolución, descuento o anulación (art. 80 Uno, Dos y Seis LIVA)' },
  { id: 'R2', nombre: 'Concurso de acreedores del cliente (art. 80 Tres LIVA)' },
  { id: 'R3', nombre: 'Crédito incobrable (art. 80 Cuatro LIVA)' },
  { id: 'R4', nombre: 'Otras causas (p. ej. errores en los datos de la factura)' },
]

type Tono = 'gris' | 'lima' | 'verde' | 'ambar' | 'rojo' | 'negro'
export type InfoFactura = { label: string; tono: Tono; pendiente: number; anulada: boolean; vencida: boolean }
type FacturaMin = Pick<Invoice, 'id' | 'tipo' | 'estado' | 'total' | 'vencimiento' | 'rectifica_id'>

/**
 * Estado real de cada factura teniendo en cuenta sus rectificativas:
 * - una factura sin cobrar anulada del todo por rectificativas → «Anulada» (y su rectificativa → «Aplicada»)
 * - si la rectificativa solo corrige una parte, queda pendiente la diferencia
 * `pendiente` es lo que falta por cobrar (solo en facturas ordinarias).
 */
export function analizarFacturas(lista: FacturaMin[], hoy: string): Map<string, InfoFactura> {
  const porId = new Map(lista.map((f) => [f.id, f]))
  const rect = new Map<string, number>()
  for (const f of lista) {
    if (f.tipo === 'rectificativa' && f.rectifica_id && f.estado !== 'borrador') {
      rect.set(f.rectifica_id, (rect.get(f.rectifica_id) ?? 0) + Number(f.total))
    }
  }
  const info = new Map<string, InfoFactura>()
  for (const f of lista) {
    const base = estadoFactura(f, hoy)
    if (f.estado === 'borrador') {
      info.set(f.id, { ...base, pendiente: 0, anulada: false, vencida: false })
      continue
    }
    if (f.tipo !== 'rectificativa') {
      const corregido = rect.get(f.id)
      const resto = Math.round((Number(f.total) + (corregido ?? 0)) * 100) / 100
      if (corregido !== undefined && Math.abs(resto) < 0.01) {
        info.set(f.id, { label: 'Anulada', tono: 'gris', pendiente: 0, anulada: true, vencida: false })
        continue
      }
      const pendiente = f.estado === 'emitida' ? Math.max(0, resto) : 0
      const venc = pendiente > 0 && vencida(f.estado, f.vencimiento, hoy)
      info.set(f.id, { ...base, pendiente, anulada: false, vencida: venc })
      continue
    }
    // Rectificativa: si la factura original no se había cobrado, se descuenta de ella (no hay nada que devolver)
    const original = f.rectifica_id ? porId.get(f.rectifica_id) : undefined
    if (original && original.estado === 'emitida') {
      info.set(f.id, { label: 'Aplicada', tono: 'gris', pendiente: 0, anulada: false, vencida: false })
    } else {
      info.set(f.id, { ...base, pendiente: 0, anulada: false, vencida: false })
    }
  }
  return info
}
