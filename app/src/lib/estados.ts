import type { InvoiceEstado, QuoteEstado } from './types'

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
