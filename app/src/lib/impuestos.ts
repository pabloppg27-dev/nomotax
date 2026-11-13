/** Impuestos presentados y archivo de documentos */

export type Resultado = 'ingresar' | 'devolver' | 'compensar' | 'cero' | 'informativa'

export interface Impuesto {
  id: string
  owner_id: string
  modelo: string
  anio: number
  periodo: string
  resultado: Resultado
  importe: number
  fecha_presentacion: string | null
  file_path: string | null
  notas: string | null
  created_at: string
}

export type TipoArchivo = 'notificacion' | 'requerimiento' | 'certificado' | 'escritura' | 'contrato' | 'otro'

export interface DocArchivo {
  id: string
  owner_id: string
  titulo: string
  tipo: TipoArchivo
  organismo: string | null
  fecha: string
  fecha_limite: string | null
  atendida: boolean
  file_path: string | null
  notas: string | null
  subido_por: string | null
  created_at: string
}

export const MODELOS: { id: string; nombre: string }[] = [
  { id: '303', nombre: 'IVA trimestral' },
  { id: '390', nombre: 'Resumen anual de IVA' },
  { id: '130', nombre: 'Pago fraccionado IRPF (autónomos)' },
  { id: '131', nombre: 'Pago fraccionado IRPF (módulos)' },
  { id: '111', nombre: 'Retenciones de trabajadores y profesionales' },
  { id: '190', nombre: 'Resumen anual de retenciones' },
  { id: '115', nombre: 'Retenciones de alquileres' },
  { id: '180', nombre: 'Resumen anual de alquileres' },
  { id: '123', nombre: 'Retenciones de capital mobiliario' },
  { id: '193', nombre: 'Resumen anual de capital mobiliario' },
  { id: '202', nombre: 'Pago fraccionado Impuesto de Sociedades' },
  { id: '200', nombre: 'Impuesto de Sociedades' },
  { id: '100', nombre: 'Declaración de la Renta' },
  { id: '347', nombre: 'Operaciones con terceros' },
  { id: '349', nombre: 'Operaciones intracomunitarias' },
  { id: '036', nombre: 'Censo (alta, modificación, baja)' },
  { id: 'CCAA', nombre: 'Cuentas anuales' },
  { id: 'otro', nombre: 'Otro' },
]

export const nombreModelo = (m: string) => MODELOS.find((x) => x.id === m)?.nombre ?? m

export const PERIODOS: { id: string; nombre: string }[] = [
  { id: '1T', nombre: '1er trimestre' },
  { id: '2T', nombre: '2º trimestre' },
  { id: '3T', nombre: '3er trimestre' },
  { id: '4T', nombre: '4º trimestre' },
  { id: '0A', nombre: 'Anual' },
  ...Array.from({ length: 12 }, (_, i) => {
    const m = String(i + 1).padStart(2, '0')
    return { id: m, nombre: ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'][i] }
  }),
]

export const nombrePeriodo = (p: string) => PERIODOS.find((x) => x.id === p)?.nombre ?? p
export const ordenPeriodo = (p: string) => ['1T', '2T', '3T', '4T'].includes(p) ? Number(p[0]) * 3 : p === '0A' ? 13 : Number(p)

export const RESULTADOS: Record<Resultado, { label: string; tono: 'rojo' | 'verde' | 'gris' | 'ambar' }> = {
  ingresar: { label: 'A ingresar', tono: 'rojo' },
  devolver: { label: 'A devolver', tono: 'verde' },
  compensar: { label: 'A compensar', tono: 'ambar' },
  cero: { label: 'Sin actividad / cero', tono: 'gris' },
  informativa: { label: 'Informativa', tono: 'gris' },
}

export const TIPOS_ARCHIVO: Record<TipoArchivo, string> = {
  notificacion: 'Notificación',
  requerimiento: 'Requerimiento',
  certificado: 'Certificado',
  escritura: 'Escritura',
  contrato: 'Contrato',
  otro: 'Otro',
}

/** Días naturales desde hoy hasta una fecha (negativo si ya pasó) */
export function diasHasta(iso: string): number {
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const f = new Date(iso + 'T00:00:00')
  return Math.round((f.getTime() - hoy.getTime()) / 86400000)
}

/** Notificaciones con plazo pendiente: las que hay que vigilar */
export const conPlazo = (lista: DocArchivo[]) =>
  lista.filter((d) => d.fecha_limite && !d.atendida).sort((a, b) => a.fecha_limite!.localeCompare(b.fecha_limite!))
