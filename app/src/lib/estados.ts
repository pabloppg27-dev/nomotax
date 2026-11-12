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
