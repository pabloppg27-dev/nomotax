export type Role = 'client' | 'advisor'

export interface Profile {
  id: string
  email: string | null
  role: Role
  nombre: string | null
  nif: string | null
  direccion: string | null
  cp: string | null
  ciudad: string | null
  provincia: string | null
  pais: string | null
  telefono: string | null
  iban: string | null
  logo_path: string | null
  serie_factura: string
  serie_presupuesto: string
  pie_factura: string | null
  created_at: string
}

export interface Contact {
  id: string
  owner_id: string
  nombre: string
  nif: string | null
  email: string | null
  telefono: string | null
  direccion: string | null
  cp: string | null
  ciudad: string | null
  provincia: string | null
  pais: string | null
  notas: string | null
  created_at: string
}

/** Copia de los datos del cliente guardada en cada factura/presupuesto */
export interface ClienteSnapshot {
  nombre?: string | null
  nif?: string | null
  email?: string | null
  direccion?: string | null
  cp?: string | null
  ciudad?: string | null
  provincia?: string | null
  pais?: string | null
}

export interface Linea {
  concepto: string
  cantidad: number
  precio: number
  iva: number
  descuento?: number
}

interface DocBase {
  id: string
  owner_id: string
  contact_id: string | null
  cliente: ClienteSnapshot
  serie: string
  num: number | null
  numero: string | null
  fecha: string
  lineas: Linea[]
  base: number
  cuota_iva: number
  irpf_pct: number
  cuota_irpf: number
  total: number
  notas: string | null
  created_at: string
  updated_at: string
}

export type QuoteEstado = 'borrador' | 'enviado' | 'aceptado' | 'rechazado' | 'facturado'

export interface Quote extends DocBase {
  valido_hasta: string | null
  estado: QuoteEstado
  invoice_id: string | null
}

export type InvoiceEstado = 'borrador' | 'emitida' | 'cobrada'

export interface Emisor extends ClienteSnapshot {
  telefono?: string | null
  iban?: string | null
  logo_path?: string | null
  pie_factura?: string | null
}

export interface Invoice extends DocBase {
  quote_id: string | null
  origen: 'app' | 'externa'
  emisor: Emisor | null
  vencimiento: string | null
  estado: InvoiceEstado
  file_path: string | null
  ocr: OcrResult | null
  contabilizado: boolean
  emitida_at: string | null
}

export interface Expense {
  id: string
  owner_id: string
  fecha: string | null
  proveedor: string | null
  proveedor_nif: string | null
  numero: string | null
  concepto: string | null
  categoria: string
  base: number
  iva_pct: number | null
  cuota_iva: number
  irpf_pct: number | null
  cuota_irpf: number
  total: number
  estado: 'pendiente' | 'revisado'
  file_path: string | null
  ocr: OcrResult | null
  contabilizado: boolean
  created_at: string
  updated_at: string
}

/** Lo que devuelve la función ocr-factura */
export interface OcrResult {
  es_factura: boolean
  tipo_documento: 'factura' | 'factura_simplificada' | 'rectificativa' | 'otro'
  emisor: { nombre: string | null; nif: string | null; direccion: string | null }
  receptor: { nombre: string | null; nif: string | null; direccion: string | null }
  numero: string | null
  fecha: string | null
  vencimiento: string | null
  concepto: string | null
  desglose_iva: { base: number; tipo: number; cuota: number }[]
  base_total: number | null
  cuota_iva_total: number | null
  irpf_pct: number | null
  cuota_irpf: number | null
  total: number | null
  moneda: string | null
  categoria: string
  notas: string | null
}
