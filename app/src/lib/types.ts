export type Role = 'client' | 'advisor' | 'member'

/* ------------------------------------------------ Usuarios de la empresa (supabase/usuarios.sql) */

export type RolMiembro = 'admin' | 'socio' | 'comercial' | 'empleado'
/** Lo que eres en la empresa que estás viendo */
export type RolEnCuenta = 'asesor' | 'titular' | RolMiembro

export type Modulo = 'ventas' | 'gastos' | 'bancos' | 'contabilidad' | 'impuestos' | 'laboral' | 'nominas' | 'usuarios' | 'empresa' | 'tarjetas'
/** Además de los módulos: Mi asesor y la Vista de socio */
export type Permiso = Modulo | 'asesor' | 'socio'

export interface Miembro {
  id: string
  cuenta_id: string
  user_id: string
  email: string
  nombre: string | null
  rol: RolMiembro
  permisos: Partial<Record<Modulo, boolean>>
  trabajador_id: string | null
  activo: boolean
  invitado_por: string | null
  created_at: string
  updated_at: string
}

export interface Profile {
  id: string
  email: string | null
  role: Role
  nombre: string | null
  /** Marca con la que factura un autónomo; en el PDF va encima del nombre legal */
  nombre_comercial?: string | null
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
  serie_rectificativa: string
  pie_factura: string | null
  /** #RRGGBB para la franja y el total del PDF; null = lima NomoTax */
  color_marca?: string | null
  bienvenida_enviada_at?: string | null
  /** Plan contratado (supabase/planes.sql): empresa_base, autonomo_plus… */
  plan?: string | null
  /** Modalidad de pago del plan (supabase/planes-cobro.sql) */
  plan_periodo?: 'mensual' | 'anual' | null
  /** Fecha del próximo cobro (YYYY-MM-DD) que pone el asesor */
  plan_proximo_cobro?: string | null
  /** Precio personalizado sin IVA, en €/mes o €/año según plan_periodo; null = tarifa */
  plan_precio?: number | null
  /** Nóminas que gestionamos al mes (supabase/planes-laboral.sql) */
  plan_nominas?: number | null
  /** Precio personalizado por nómina y mes sin IVA; null = tarifa (25/18/12€) */
  plan_nomina_precio?: number | null
  /** Email al que enviamos las facturas de NomoTax (supabase/facturacion-automatica.sql); vacío = el de la cuenta */
  email_facturacion?: string | null
  /** Envío de facturas (supabase/envio-facturas.sql): a dónde van las respuestas; vacío = email de la cuenta */
  email_respuesta?: string | null
  /** Plantilla del correo; vacío = la de por defecto (src/lib/correoFactura.ts) */
  correo_asunto?: string | null
  correo_mensaje?: string | null
  /** Copia oculta de cada envío al email de respuestas */
  correo_copia?: boolean | null
  /** Diseño de los correos (supabase/plantillas-diseno.sql): fondo de la cabecera y botón; vacío = negro */
  color_cabecera?: string | null
  color_boton?: string | null
  /** Plantillas de los demás correos (supabase/correo-empresa.sql); vacío = la de por defecto (src/lib/plantillasCorreo.ts) */
  acceso_asunto?: string | null
  acceso_mensaje?: string | null
  nomina_asunto?: string | null
  nomina_mensaje?: string | null
  presupuesto_asunto?: string | null
  presupuesto_mensaje?: string | null
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
  /** Último envío por email (supabase/envio-presupuestos.sql) */
  enviado_at?: string | null
  enviado_a?: string | null
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
  tipo: 'ordinaria' | 'rectificativa'
  fecha_cobro: string | null
  moneda?: string | null
  importe_original?: number | null
  tipo_cambio?: number | null
  fecha_cambio?: string | null
  rectifica_id: string | null
  rectifica_numero: string | null
  rectifica_fecha: string | null
  causa_rectificacion: CausaRectificacion | null
  motivo_rectificacion: string | null
  /** Último envío por email al cliente (supabase/envio-facturas.sql) */
  enviada_at?: string | null
  enviada_a?: string | null
}

export type CausaRectificacion = 'R1' | 'R2' | 'R3' | 'R4'

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
  pagado: boolean
  fecha_pago: string | null
  cuenta: string | null
  naturaleza: 'gasto' | 'inversion'
  moneda?: string | null
  importe_original?: number | null
  tipo_cambio?: number | null
  fecha_cambio?: string | null
  revision: 'pendiente' | 'gasto' | 'inmovilizado' | null
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
  naturaleza?: 'gasto' | 'inversion'
  tipo_inmovilizado?: string | null
  /** Si la factura venía en otra moneda: cambio del BCE aplicado e importes originales */
  divisa?: import('./divisas').Divisa
}

/* ------------------------------------------------------------- Laboral */

export interface PerfilLaboral {
  owner_id: string
  convenio_nombre: string | null
  convenio_codigo: string | null
  periodo_prueba: string | null
  pagas_convenio: number
  horas_semana_convenio: number
  notas: string | null
}

export interface CentroTrabajo {
  id: string
  owner_id: string
  nombre: string
  direccion: string | null
  cp: string | null
  ciudad: string | null
  provincia: string | null
  ccc: string | null
}

export interface CategoriaConvenio {
  id: string
  owner_id: string
  nombre: string
  grupo_cotizacion: number | null
  salario_min_mensual: number | null
  orden: number
}

export type EstadoTrabajador = 'solicitada' | 'en_tramite' | 'alta' | 'baja'

export interface Trabajador {
  id: string
  owner_id: string
  estado: EstadoTrabajador
  nombre: string
  dni: string
  dni_caducidad: string | null
  nss: string | null
  nss_tramitar: boolean
  fecha_nacimiento: string | null
  domicilio: string | null
  telefono: string | null
  iban: string | null
  nivel_estudios: string | null
  fecha_inicio: string
  centro_id: string | null
  puesto: string | null
  tipo_contrato: string
  fecha_fin: string | null
  motivo_temporal: string | null
  sustituye_a: string | null
  jornada: 'completa' | 'parcial'
  horas_semana: number | null
  horario: string | null
  teletrabajo: boolean
  salario_bruto_mensual: number
  pagas: 12 | 14
  observaciones: string | null
  categoria_id: string | null
  notas_asesor: string | null
  fecha_baja: string | null
  created_at: string
  updated_at: string
}

export type TipoDocTrabajador = 'dni' | 'contrato' | 'alta_ss' | 'teletrabajo' | 'modelo_145' | 'certificado_retenciones' | 'otro'

export interface DocTrabajador {
  id: string
  owner_id: string
  trabajador_id: string
  tipo: TipoDocTrabajador
  nombre: string | null
  path: string
  /** Año al que se refiere (certificado de retenciones) */
  anio?: number | null
  subido_por: string | null
  created_at: string
}

export interface Nomina {
  id: string
  owner_id: string
  trabajador_id: string | null
  anio: number
  mes: number
  tipo: 'mensual' | 'extra' | 'finiquito' | 'atrasos' | 'otro'
  estado: 'borrador' | 'publicada'
  file_path: string
  nombre_leido: string | null
  dni_leido: string | null
  bruto: number
  neto: number
  irpf: number
  irpf_pct: number | null
  ss_trabajador: number
  ss_empresa: number
  variables: number
  coste_total: number
  conceptos: { concepto: string; importe: number }[] | null
  ocr: NominaOcr | null
  publicada_at: string | null
  created_at: string
}

export interface NominaOcr {
  es_nomina: boolean
  trabajador: { nombre: string | null; dni: string | null; nss: string | null }
  empresa: string | null
  periodo_mes: number | null
  periodo_anio: number | null
  tipo: Nomina['tipo']
  total_devengado: number | null
  total_deducciones: number | null
  liquido: number | null
  irpf_importe: number | null
  irpf_pct: number | null
  ss_trabajador: number | null
  ss_empresa: number | null
  variables: number | null
  conceptos_variables: { concepto: string | null; importe: number }[]
  notas: string | null
}
