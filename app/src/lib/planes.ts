// Planes de NomoTax: los mismos que en nomotax.io/asesoria-fiscal-mercantil-laboral
// Si cambian en la web, cambiarlos aquí también.

export type Familia = 'empresa' | 'autonomo'
export type PlanId = 'empresa_base' | 'empresa_smart' | 'empresa_max' | 'autonomo_core' | 'autonomo_plus' | 'autonomo_pro'

export interface Plan {
  id: PlanId
  familia: Familia
  nombre: string
  precio: number
  desde?: boolean
  desc: string
}

export const PLANES: Plan[] = [
  { id: 'empresa_base', familia: 'empresa', nombre: 'Empresa Base', precio: 99, desc: 'Para sociedades nuevas o con una operativa sencilla.' },
  { id: 'empresa_smart', familia: 'empresa', nombre: 'Empresa Smart', precio: 149, desc: 'Para sociedades en crecimiento y con una operativa más activa.' },
  { id: 'empresa_max', familia: 'empresa', nombre: 'Empresa Max', precio: 249, desde: true, desc: 'Para sociedades con mayor volumen, estructuras complejas y necesidades avanzadas.' },
  { id: 'autonomo_core', familia: 'autonomo', nombre: 'Autónomo Core', precio: 39, desc: 'Para autónomos con poca facturación y necesidades básicas.' },
  { id: 'autonomo_plus', familia: 'autonomo', nombre: 'Autónomo Plus', precio: 59, desc: 'Para autónomos con actividad regular y que necesitan más cobertura.' },
  { id: 'autonomo_pro', familia: 'autonomo', nombre: 'Autónomo Pro', precio: 89, desc: 'Para autónomos con mayor volumen, operaciones especiales o situaciones complejas.' },
]

/** true = incluido, false = no incluido, texto = tal cual */
type Celda = boolean | string

export const COMPARATIVA: Record<Familia, { fila: string; valores: [Celda, Celda, Celda] }[]> = {
  empresa: [
    { fila: 'Facturas mensuales', valores: ['Hasta 50', 'Hasta 150', '+150'] },
    { fila: 'Contabilidad e impuestos periódicos', valores: [true, true, true] },
    { fila: 'Impuesto sobre Sociedades + cuentas anuales', valores: [true, true, true] },
    { fila: 'Programa de facturación', valores: [true, true, true] },
    { fila: 'Asesoramiento fiscal', valores: ['Básico', true, '✓✓'] },
    { fila: 'Atención', valores: ['Chat y email', 'Prioritaria', 'Directa'] },
    { fila: 'Estudios fiscales', valores: [false, '1/año', '3/año'] },
    { fila: 'Estructuras complejas / holdings', valores: [false, false, true] },
  ],
  autonomo: [
    { fila: 'Facturas mensuales', valores: ['Hasta 25', 'Hasta 50', '+50'] },
    { fila: 'Contabilidad e impuestos', valores: [true, true, true] },
    { fila: 'Impuestos periódicos y anuales', valores: [true, true, true] },
    { fila: 'Programa de facturación', valores: [true, true, true] },
    { fila: 'Asesoramiento fiscal', valores: ['Básico', true, '✓✓'] },
    { fila: 'Atención', valores: ['Email', 'Chat + email', 'Prioritaria'] },
    { fila: 'Alta de autónomo', valores: ['39€', true, true] },
    { fila: 'Declaración de la Renta', valores: ['39€', true, true] },
    { fila: 'Estudio fiscal', valores: [false, false, true] },
    { fila: 'Operaciones / situaciones especiales', valores: [false, false, true] },
  ],
}

export const planPorId = (id: string | null | undefined) => PLANES.find((p) => p.id === id) ?? null


// ------------------------------------------------------------ Suscripción del cliente

export type Periodo = 'mensual' | 'anual'

interface DatosPlan {
  plan?: string | null
  plan_periodo?: Periodo | null
  plan_proximo_cobro?: string | null
  plan_precio?: number | string | null
}

/** 149 → "149€" · 1788.5 → "1.788,50€" */
export function importe(n: number): string {
  const entero = Number.isInteger(n)
  return `${n.toLocaleString('es-ES', { minimumFractionDigits: entero ? 0 : 2, maximumFractionDigits: 2, useGrouping: 'always' as unknown as boolean })}€`
}

/** Lo que paga este cliente: precio personalizado o de tarifa, en su modalidad */
export function cuotaCliente(d: DatosPlan) {
  const plan = planPorId(d.plan)
  if (!plan) return null
  const periodo: Periodo = d.plan_periodo === 'anual' ? 'anual' : 'mensual'
  const personalizado = d.plan_precio !== null && d.plan_precio !== undefined && d.plan_precio !== ''
  const cantidad = personalizado ? Number(d.plan_precio) : periodo === 'anual' ? plan.precio * 12 : plan.precio
  return {
    plan,
    periodo,
    personalizado,
    cantidad,
    texto: `${!personalizado && plan.desde ? 'Desde ' : ''}${importe(cantidad)}/${periodo === 'anual' ? 'año' : 'mes'}`,
  }
}

/**
 * Próximo cobro: la fecha que puso el asesor; si ya ha pasado, se adelanta
 * un mes (o un año) cada vez hasta llegar a hoy o después.
 */
export function proximoCobro(d: DatosPlan, hoy = new Date()): string | null {
  if (!d.plan_proximo_cobro) return null
  const [y, m, dia] = d.plan_proximo_cobro.slice(0, 10).split('-').map(Number)
  const paso = d.plan_periodo === 'anual' ? 12 : 1
  const hoyISO = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`
  for (let k = 0; k < 600; k += paso) {
    const total = m - 1 + k
    const anio = y + Math.floor(total / 12)
    const mes = total % 12
    const ultimo = new Date(anio, mes + 1, 0).getDate()
    const iso = `${anio}-${String(mes + 1).padStart(2, '0')}-${String(Math.min(dia, ultimo)).padStart(2, '0')}`
    if (iso >= hoyISO) return iso
  }
  return null
}
