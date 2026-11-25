/**
 * Régimen fiscal de cada cliente (profiles.fiscal, supabase/panel-asesor.sql).
 * Lo pone el asesor en Panel → Clientes. De momento es una ficha: los cálculos
 * propios de módulos, recargo de equivalencia, REBU… se irán añadiendo.
 */

export type Forma = 'autonomo' | 'sociedad' | 'comunidad' | 'otra'
export type MetodoIrpf = 'directa_simplificada' | 'directa_normal' | 'modulos'
export type TipoIs = 'general' | 'reducida' | 'micro' | 'nueva'
export type RegimenIva = 'recargo' | 'rebu' | 'simplificado' | 'caja' | 'reagp' | 'reav' | 'prorrata' | 'exento'

export interface Fiscal {
  forma?: Forma
  irpf?: MetodoIrpf
  is?: TipoIs
  /** Regímenes especiales de IVA (vacío = régimen general) */
  iva?: RegimenIva[]
  /** Inscrito en el ROI (operaciones intracomunitarias) */
  roi?: boolean
  /** Registro de devolución mensual */
  redeme?: boolean
  /** Suministro Inmediato de Información */
  sii?: boolean
}

export const FORMAS: Record<Forma, string> = {
  autonomo: 'Autónomo',
  sociedad: 'Sociedad (SL, SA…)',
  comunidad: 'Comunidad de bienes / sociedad civil',
  otra: 'Otra entidad',
}

export const METODOS_IRPF: Record<MetodoIrpf, string> = {
  directa_simplificada: 'Estimación directa simplificada',
  directa_normal: 'Estimación directa normal',
  modulos: 'Estimación objetiva (módulos)',
}

export const TIPOS_IS: Record<TipoIs, string> = {
  general: 'Tipo general',
  reducida: 'Empresa de reducida dimensión',
  micro: 'Microempresa (cifra de negocios menor de 1 M€)',
  nueva: 'Entidad de nueva creación',
}

export const REGIMENES_IVA: { id: RegimenIva; nombre: string; corto: string; detalle: string }[] = [
  { id: 'recargo', nombre: 'Recargo de equivalencia', corto: 'Recargo eq.', detalle: 'Comercio minorista: no presenta 303, el recargo lo cobra el proveedor' },
  { id: 'rebu', nombre: 'REBU', corto: 'REBU', detalle: 'Bienes usados, objetos de arte y antigüedades: IVA sobre el margen' },
  { id: 'simplificado', nombre: 'Régimen simplificado (módulos de IVA)', corto: 'IVA módulos', detalle: 'Cuota por módulos, normalmente junto a estimación objetiva' },
  { id: 'caja', nombre: 'Criterio de caja', corto: 'Caja', detalle: 'El IVA se devenga al cobrar y se deduce al pagar' },
  { id: 'reagp', nombre: 'Agricultura, ganadería y pesca (REAGP)', corto: 'REAGP', detalle: 'Compensación a tanto alzado en lugar de IVA' },
  { id: 'reav', nombre: 'Agencias de viajes (REAV)', corto: 'REAV', detalle: 'IVA sobre el margen de la agencia' },
  { id: 'prorrata', nombre: 'Prorrata', corto: 'Prorrata', detalle: 'Operaciones con y sin derecho a deducir' },
  { id: 'exento', nombre: 'Actividad exenta de IVA', corto: 'Exento', detalle: 'Art. 20 LIVA (sanidad, formación, seguros, alquiler de vivienda…)' },
]

/** Forma que se deduce del NIF si el asesor aún no la ha puesto: A/B sociedad, E/J comunidad, DNI/NIE autónomo */
export function formaPorNif(nif: string | null | undefined): Forma | undefined {
  const n = (nif ?? '').trim().toUpperCase().replace(/^ES/, '')
  if (!n) return undefined
  if (/^[0-9XYZKLM]/.test(n)) return 'autonomo'
  if (/^[AB]/.test(n)) return 'sociedad'
  if (/^[EJ]/.test(n)) return 'comunidad'
  return 'otra'
}

/** Etiquetas cortas para la lista de clientes: solo lo que se sale de lo normal */
export function etiquetasFiscal(f: Fiscal | null | undefined): string[] {
  if (!f) return []
  const out: string[] = []
  if (f.irpf === 'modulos') out.push('Módulos')
  if (f.irpf === 'directa_normal') out.push('ED normal')
  for (const r of REGIMENES_IVA) if (f.iva?.includes(r.id)) out.push(r.corto)
  if (f.roi) out.push('ROI')
  if (f.redeme) out.push('REDEME')
  if (f.sii) out.push('SII')
  return out
}
