/**
 * Tarjetas de empresa (Stripe Connect + Issuing).
 * Dos modos (ver TARJETAS_MODO en config.ts):
 *  · real: llama a la Edge Function «tarjetas» de Supabase, que habla con Stripe.
 *  · demo: lo simula todo en el navegador (localStorage) para probar el flujo sin Stripe ni claves.
 * La pantalla usa solo las funciones de aquí, así que no sabe en qué modo está.
 */
import { invocar } from './supabase'
import { TARJETAS_MODO } from './config'

export type EstadoCuenta = 'pendiente' | 'activa' | 'restringida'
export type EstadoTarjeta = 'activa' | 'congelada' | 'cancelada'
export type EstadoMov = 'aprobada' | 'rechazada' | 'pendiente' | 'reembolsada'

export interface CuentaStripe {
  owner_id: string
  stripe_account_id: string
  estado: EstadoCuenta
  emision_activa: boolean
  requisitos: string[]
}

export interface Tarjeta {
  id: string
  alias: string
  titular_nombre: string
  tipo: 'virtual' | 'fisica'
  ultimos4: string
  marca: string
  exp_mes: number | null
  exp_anio: number | null
  estado: EstadoTarjeta
  limite_mensual: number | null
  created_at: string
}

export interface Movimiento {
  id: string
  tarjeta_id: string | null
  importe: number
  moneda: string
  comercio: string | null
  categoria: string | null
  estado: EstadoMov
  motivo: string | null
  fecha: string
}

export interface EstadoTarjetas {
  cuenta: CuentaStripe | null
  /** Saldo disponible en euros (null si todavía no hay cuenta) */
  saldo: number | null
  tarjetas: Tarjeta[]
  movimientos: Movimiento[]
}

export interface DatosIngreso {
  iban?: string
  bic?: string
  titular?: string
  banco?: string
  referencia?: string
}

export const esDemo = TARJETAS_MODO === 'demo'

/* ------------------------------------------------------------------ real */

async function llamar<T>(accion: string, ownerId: string, extra: Record<string, unknown> = {}): Promise<T> {
  return invocar<T>('cards', { accion, owner_id: ownerId, ...extra })
}

/* ------------------------------------------------------------------ demo */

interface Demo extends EstadoTarjetas {
  iban: string
}

const clave = (ownerId: string) => `nt-tarjetas-demo-${ownerId}`

function leerDemo(ownerId: string): Demo {
  try {
    const raw = localStorage.getItem(clave(ownerId))
    if (raw) return JSON.parse(raw) as Demo
  } catch {
    /* sin almacenamiento */
  }
  return { cuenta: null, saldo: null, tarjetas: [], movimientos: [], iban: ibanDemo() }
}

function guardarDemo(ownerId: string, d: Demo) {
  try {
    localStorage.setItem(clave(ownerId), JSON.stringify(d))
  } catch {
    /* sin almacenamiento */
  }
}

const aleatorio = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('')
const ibanDemo = () => `ES91 2100 ${aleatorio(4)} ${aleatorio(2)}${aleatorio(2)} ${aleatorio(4)} ${aleatorio(4)}`
const idDemo = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`)

/** Para dejar el tiempo de «hablar con Stripe» y que se vea el estado de carga */
const espera = (ms = 350) => new Promise((r) => setTimeout(r, ms))

/** Número, CVV y caducidad de ejemplo de una tarjeta de la demo (nunca son reales) */
export function datosDemo(t: Tarjeta): { numero: string; cvv: string } {
  return { numero: `4000 0072 4000 ${t.ultimos4}`, cvv: String(100 + (Number(t.ultimos4) % 900)) }
}

/* ------------------------------------------------------------- interfaz */

export async function cargarEstado(ownerId: string, nombreEmpresa: string): Promise<EstadoTarjetas> {
  if (!esDemo) return llamar<EstadoTarjetas>('estado', ownerId)
  await espera(150)
  void nombreEmpresa
  return leerDemo(ownerId)
}

/** Empieza el alta. Devuelve la dirección de Stripe a la que mandar al cliente (en la demo, no hay) */
export async function activar(ownerId: string): Promise<{ url: string | null }> {
  if (!esDemo) return llamar<{ url: string }>('activar', ownerId)
  await espera()
  const d = leerDemo(ownerId)
  if (!d.cuenta) {
    d.cuenta = { owner_id: ownerId, stripe_account_id: `acct_demo_${aleatorio(8)}`, estado: 'pendiente', emision_activa: false, requisitos: ['Datos de la empresa', 'Representante legal', 'Cuenta bancaria'] }
    guardarDemo(ownerId, d)
  }
  return { url: null }
}

/** Clave publicable de Stripe (no es secreta). Sin ella el alta cae al modo de página de Stripe. */
export const STRIPE_PK = (import.meta.env.VITE_STRIPE_PK as string | undefined) ?? ''

/** Alta integrada: crea la cuenta (si falta) sin enlace externo */
export async function activarIntegrado(ownerId: string): Promise<void> {
  await llamar('activar', ownerId, { sin_enlace: true })
}

/** Alta integrada: clave de un solo uso para el formulario de Stripe dentro de la app */
export async function sesionAlta(ownerId: string): Promise<string> {
  const r = await llamar<{ client_secret: string }>('sesion', ownerId)
  return r.client_secret
}

export async function enlaceAlta(ownerId: string): Promise<{ url: string | null }> {
  if (!esDemo) return llamar<{ url: string }>('enlace', ownerId)
  return { url: null }
}

/** Solo demo: da por completado el alta, como haría Stripe al terminar el formulario */
export async function completarAltaDemo(ownerId: string): Promise<void> {
  await espera()
  const d = leerDemo(ownerId)
  if (d.cuenta) d.cuenta = { ...d.cuenta, estado: 'activa', emision_activa: true, requisitos: [] }
  d.saldo = d.saldo ?? 0
  guardarDemo(ownerId, d)
}

export async function crearTarjeta(ownerId: string, datos: { alias: string; tipo: 'virtual' | 'fisica'; limite_mensual: number | null; titular: string }): Promise<Tarjeta> {
  if (!esDemo) {
    const r = await llamar<{ tarjeta: Tarjeta }>('crear_tarjeta', ownerId, datos)
    return r.tarjeta
  }
  await espera()
  const d = leerDemo(ownerId)
  if (!d.cuenta?.emision_activa) throw new Error('Falta completar el alta para poder emitir tarjetas')
  const hoy = new Date()
  const t: Tarjeta = {
    id: idDemo(),
    alias: datos.alias,
    titular_nombre: datos.titular.slice(0, 26),
    tipo: datos.tipo,
    ultimos4: aleatorio(4),
    marca: 'Visa',
    exp_mes: hoy.getMonth() + 1,
    exp_anio: hoy.getFullYear() + 3,
    estado: 'activa',
    limite_mensual: datos.limite_mensual,
    created_at: hoy.toISOString(),
  }
  d.tarjetas = [t, ...d.tarjetas]
  guardarDemo(ownerId, d)
  return t
}

export async function cambiarEstadoTarjeta(ownerId: string, tarjetaId: string, estado: EstadoTarjeta): Promise<void> {
  if (!esDemo) {
    await llamar('estado_tarjeta', ownerId, { tarjeta_id: tarjetaId, estado })
    return
  }
  await espera(200)
  const d = leerDemo(ownerId)
  d.tarjetas = d.tarjetas.map((t) => (t.id === tarjetaId ? { ...t, estado } : t))
  guardarDemo(ownerId, d)
}

export async function cambiarLimite(ownerId: string, tarjetaId: string, limite: number | null): Promise<void> {
  if (!esDemo) {
    await llamar('limite', ownerId, { tarjeta_id: tarjetaId, limite_mensual: limite })
    return
  }
  await espera(200)
  const d = leerDemo(ownerId)
  d.tarjetas = d.tarjetas.map((t) => (t.id === tarjetaId ? { ...t, limite_mensual: limite } : t))
  guardarDemo(ownerId, d)
}

/** Datos para ingresar saldo por transferencia (IBAN de la cuenta de la empresa) */
export async function datosIngreso(ownerId: string, nombreEmpresa: string): Promise<DatosIngreso> {
  if (!esDemo) {
    const r = await llamar<{ instrucciones: Record<string, any> }>('fondos', ownerId)
    const i = r.instrucciones
    const a = i?.financial_addresses?.[0]?.iban ?? i?.iban ?? {}
    return { iban: a.iban, bic: a.bic, titular: a.account_holder_name, banco: a.bank_name, referencia: i?.reference }
  }
  await espera(200)
  const d = leerDemo(ownerId)
  return { iban: d.iban, bic: 'NOMOESXXX', titular: nombreEmpresa, banco: 'Cuenta de demostración (no es real)', referencia: 'Tarjetas NomoTax' }
}

/** Solo demo: simula que ha llegado una transferencia al IBAN */
export async function ingresarDemo(ownerId: string, importe: number): Promise<void> {
  await espera(200)
  const d = leerDemo(ownerId)
  d.saldo = Math.round(((d.saldo ?? 0) + importe) * 100) / 100
  d.movimientos = [{ id: idDemo(), tarjeta_id: null, importe: -importe, moneda: 'EUR', comercio: 'Ingreso por transferencia', categoria: 'ingreso', estado: 'aprobada', motivo: null, fecha: new Date().toISOString() }, ...d.movimientos]
  guardarDemo(ownerId, d)
}

/** Solo demo: simula una compra con la tarjeta (se aprueba o se rechaza como lo haría Stripe) */
export async function comprarDemo(ownerId: string, tarjetaId: string, importe: number, comercio: string): Promise<Movimiento> {
  await espera(250)
  const d = leerDemo(ownerId)
  const t = d.tarjetas.find((x) => x.id === tarjetaId)
  if (!t) throw new Error('Tarjeta no encontrada')
  const mes = new Date().toISOString().slice(0, 7)
  const gastadoMes = d.movimientos.filter((m) => m.tarjeta_id === t.id && m.estado === 'aprobada' && m.fecha.slice(0, 7) === mes && m.importe > 0).reduce((s, m) => s + m.importe, 0)
  let estado: EstadoMov = 'aprobada'
  let motivo: string | null = null
  if (t.estado === 'congelada') [estado, motivo] = ['rechazada', 'Tarjeta congelada']
  else if (t.estado === 'cancelada') [estado, motivo] = ['rechazada', 'Tarjeta cancelada']
  else if ((d.saldo ?? 0) < importe) [estado, motivo] = ['rechazada', 'Saldo insuficiente']
  else if (t.limite_mensual !== null && gastadoMes + importe > t.limite_mensual) [estado, motivo] = ['rechazada', 'Supera el límite mensual']
  const mov: Movimiento = { id: idDemo(), tarjeta_id: t.id, importe, moneda: 'EUR', comercio, categoria: null, estado, motivo, fecha: new Date().toISOString() }
  if (estado === 'aprobada') d.saldo = Math.round(((d.saldo ?? 0) - importe) * 100) / 100
  d.movimientos = [mov, ...d.movimientos]
  guardarDemo(ownerId, d)
  return mov
}

/** Solo demo: borra todo para volver a probar desde cero */
export function reiniciarDemo(ownerId: string) {
  try {
    localStorage.removeItem(clave(ownerId))
  } catch {
    /* nada */
  }
}

/** Importe gastado este mes con una tarjeta (para la barra del límite) */
export function gastadoEsteMes(tarjetaId: string, movimientos: Movimiento[]): number {
  const mes = new Date().toISOString().slice(0, 7)
  return movimientos.filter((m) => m.tarjeta_id === tarjetaId && m.estado === 'aprobada' && m.importe > 0 && m.fecha.slice(0, 7) === mes).reduce((s, m) => s + m.importe, 0)
}
