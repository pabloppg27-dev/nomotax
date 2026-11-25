/**
 * Inventario (existencias por referencia). Como el motor contable, no guarda saldos:
 * el stock se calcula al momento a partir de los documentos.
 *   + compras: líneas con producto de las facturas de compra revisadas (expenses.lineas)
 *   − ventas: líneas con producto de las facturas emitidas (invoices.lineas)
 *   ± ajustes: stock inicial, recuentos, mermas (stock_ajustes)
 * Valoración a coste medio ponderado (PGC). No depende del navegador: lo usan la app,
 * el motor contable (asiento de variación de existencias) y la copia a las carpetas del asesor.
 */
import type { Expense, Invoice } from './types.ts'

export type TipoExistencia = 'mercaderias' | 'materias_primas' | 'otros_aprovisionamientos' | 'productos_terminados'
export type PeriodoExistencias = 'momento' | 'mensual' | 'trimestral' | 'anual' | 'no'

/** Cuentas de cada tipo de existencia (PGC PYMES): existencias, variación, compras y ventas */
export const TIPOS_EXISTENCIA: { id: TipoExistencia; nombre: string; cuenta: string; variacion: string; compras: string | null; ventas: string }[] = [
  { id: 'mercaderias', nombre: 'Mercaderías', cuenta: '300', variacion: '610', compras: '600', ventas: '700' },
  { id: 'materias_primas', nombre: 'Materias primas', cuenta: '310', variacion: '611', compras: '601', ventas: '700' },
  { id: 'otros_aprovisionamientos', nombre: 'Otros aprovisionamientos (envases, embalajes, repuestos…)', cuenta: '325', variacion: '612', compras: '602', ventas: '700' },
  { id: 'productos_terminados', nombre: 'Productos terminados', cuenta: '350', variacion: '712', compras: null, ventas: '701' },
]

export const PERIODOS_EXISTENCIAS: { id: PeriodoExistencias; nombre: string }[] = [
  { id: 'momento', nombre: 'Al momento' },
  { id: 'mensual', nombre: 'Cada mes' },
  { id: 'trimestral', nombre: 'Cada trimestre' },
  { id: 'anual', nombre: 'Al cierre del año' },
  { id: 'no', nombre: 'No contabilizar' },
]

export interface Producto {
  id: string
  owner_id: string
  referencia: string | null
  nombre: string
  tipo: TipoExistencia
  unidad: string
  precio_venta: number | null
  /** IVA de venta en % (supabase/inventario-precios.sql); si falta, 21 */
  iva?: number | null
  activo: boolean
  created_at: string
}

export type MotivoAjuste = 'inicial' | 'recuento' | 'merma' | 'ajuste'

export interface StockAjuste {
  id: string
  owner_id: string
  producto_id: string
  fecha: string
  cantidad: number
  coste_unitario: number | null
  motivo: MotivoAjuste
  notas: string | null
  created_at: string
}

export const MOTIVOS_AJUSTE: { id: MotivoAjuste; nombre: string }[] = [
  { id: 'inicial', nombre: 'Stock inicial' },
  { id: 'recuento', nombre: 'Recuento' },
  { id: 'merma', nombre: 'Merma o rotura' },
  { id: 'ajuste', nombre: 'Otro ajuste' },
]

export interface DatosInventario {
  productos: Producto[]
  ajustes: StockAjuste[]
  periodo: PeriodoExistencias
  /** false si aún no se ha ejecutado supabase/inventario.sql (no se enseña la pestaña) */
  disponible?: boolean
}

export interface Movimiento {
  producto_id: string
  fecha: string
  /** + entra, − sale */
  cantidad: number
  /** Coste unitario en euros de una entrada (compra, stock inicial); null = sale o entra a coste medio */
  coste: number | null
  origen: 'compra' | 'venta' | 'ajuste'
  motivo?: MotivoAjuste
  /** Número de la factura, proveedor o cliente */
  documento: string
  /** Proveedor (compras) o cliente (ventas) */
  tercero?: string
  /** Ventas: base de la línea en euros (negativa en devoluciones) */
  importe?: number
  /** Para ordenar los del mismo día: entradas con coste primero */
  orden: string
  /** Movimientos que van en el mismo asiento «al momento»: las líneas de una factura, los ajustes del mismo día y motivo */
  grupo: string
}

export interface EstadoProducto {
  cantidad: number
  /** Coste medio ponderado */
  coste: number
  /** Valor de las existencias (las unidades en negativo no restan valor) */
  valor: number
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const r3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000
const r4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000

/** Base de una línea de factura emitida (cantidad × precio − descuento) */
function importeVenta(l: { cantidad: number; precio: number; descuento?: number }): number {
  return Number(l.cantidad || 0) * Number(l.precio || 0) * (1 - Number(l.descuento || 0) / 100)
}

/** Parte de la base de una factura emitida que es venta de productos, por tipo de existencia (para la 700/701) */
export function ventasDeProductos(f: Invoice, tipoDe: Map<string, TipoExistencia>): Map<TipoExistencia, number> {
  const out = new Map<TipoExistencia, number>()
  const lineas = f.lineas ?? []
  const total = lineas.reduce((s, l) => s + importeVenta(l), 0)
  if (!total) return out
  // En euros: la base de la factura ya está convertida; las líneas pueden ir en otra moneda
  const factor = Number(f.base) / total
  for (const l of lineas) {
    if (!l.producto_id) continue
    const tipo = tipoDe.get(l.producto_id) ?? 'mercaderias'
    out.set(tipo, (out.get(tipo) ?? 0) + importeVenta(l) * factor)
  }
  for (const [k, v] of out) out.set(k, r2(v))
  return out
}

/** Todos los movimientos de stock, en orden */
export function movimientosStock(gastos: Expense[], facturas: Invoice[], ajustes: StockAjuste[]): Movimiento[] {
  const out: Movimiento[] = []

  for (const g of gastos) {
    if (g.estado !== 'revisado' || !g.fecha || !g.lineas?.length) continue
    // Coste en euros: la base de la factura (ya en euros, con descuentos) repartida entre sus líneas
    const suma = g.lineas.reduce((s, l) => s + Number(l.importe || 0), 0)
    const factor = suma ? Number(g.base) / suma : 1
    for (const l of g.lineas) {
      const cantidad = Number(l.cantidad)
      if (!l.producto_id || !cantidad) continue
      out.push({
        producto_id: l.producto_id,
        fecha: g.fecha,
        cantidad,
        coste: (Number(l.importe || 0) * factor) / cantidad,
        origen: 'compra',
        documento: [g.numero, g.proveedor].filter(Boolean).join(' · ') || 'Factura de compra',
        tercero: g.proveedor ?? undefined,
        orden: `${g.fecha}1${g.created_at}`,
        grupo: `g${g.id}`,
      })
    }
  }

  for (const f of facturas) {
    if (f.estado === 'borrador') continue
    const suma = (f.lineas ?? []).reduce((s, l) => s + importeVenta(l), 0)
    const factor = suma ? Number(f.base) / suma : 1
    for (const l of f.lineas ?? []) {
      const cantidad = Math.abs(Number(l.cantidad || 0))
      if (!l.producto_id || !cantidad) continue
      // Rectificativa o abono (importe negativo): vuelven las unidades
      const signo = importeVenta(l) < 0 || Number(l.cantidad) < 0 ? -1 : 1
      out.push({
        producto_id: l.producto_id,
        fecha: f.fecha,
        cantidad: -cantidad * signo,
        coste: null,
        origen: 'venta',
        documento: [f.numero, f.cliente?.nombre].filter(Boolean).join(' · ') || 'Factura',
        tercero: f.cliente?.nombre ?? undefined,
        importe: r2(importeVenta(l) * factor),
        orden: `${f.fecha}2${f.created_at}`,
        grupo: `f${f.id}`,
      })
    }
  }

  for (const a of ajustes) {
    const cantidad = Number(a.cantidad)
    if (!cantidad) continue
    const conCoste = cantidad > 0 && a.coste_unitario !== null && a.coste_unitario !== undefined
    out.push({
      producto_id: a.producto_id,
      fecha: a.fecha,
      cantidad,
      coste: conCoste ? Number(a.coste_unitario) : null,
      origen: 'ajuste',
      motivo: a.motivo,
      documento: MOTIVOS_AJUSTE.find((m) => m.id === a.motivo)?.nombre ?? 'Ajuste',
      // El stock inicial va antes que todo lo del día; los recuentos, después
      orden: `${a.fecha}${a.motivo === 'inicial' ? 0 : 3}${a.created_at}`,
      grupo: `a${a.fecha}${a.motivo}`,
    })
  }

  return out.sort((a, b) => a.orden.localeCompare(b.orden))
}

/** Aplica un movimiento al estado del producto (coste medio ponderado) */
export function aplicar(e: EstadoProducto, m: Movimiento): EstadoProducto {
  let { cantidad, coste } = e
  if (m.coste !== null) {
    // Entrada (o devolución a proveedor) a su coste: recalcula el coste medio
    const base = Math.max(cantidad, 0)
    const nueva = base + m.cantidad
    coste = nueva > 0 ? (base * coste + m.cantidad * m.coste) / nueva : m.coste
    cantidad = cantidad + m.cantidad
  } else {
    cantidad = cantidad + m.cantidad
  }
  cantidad = r3(cantidad)
  coste = r4(coste)
  return { cantidad, coste, valor: r2(Math.max(cantidad, 0) * coste) }
}

/** Stock de cada producto a una fecha (incluida) */
export function stockA(movs: Movimiento[], fecha: string): Map<string, EstadoProducto> {
  const st = new Map<string, EstadoProducto>()
  for (const m of movs) {
    if (m.fecha > fecha) break
    st.set(m.producto_id, aplicar(st.get(m.producto_id) ?? { cantidad: 0, coste: 0, valor: 0 }, m))
  }
  return st
}

/** Valor de las existencias por tipo a una fecha */
export function valorPorTipo(movs: Movimiento[], productos: Producto[], fecha: string): Map<TipoExistencia, number> {
  const tipoDe = new Map(productos.map((p) => [p.id, p.tipo]))
  const out = new Map<TipoExistencia, number>()
  for (const [id, e] of stockA(movs, fecha)) {
    const tipo = tipoDe.get(id) ?? 'mercaderias'
    out.set(tipo, r2((out.get(tipo) ?? 0) + e.valor))
  }
  return out
}

function finDeMes(anio: number, mes: number): string {
  return new Date(Date.UTC(anio, mes, 0)).toISOString().slice(0, 10)
}

/** Fechas de cierre (fin de mes, trimestre o año) entre dos fechas, ambas incluidas */
export function cierresEntre(periodo: PeriodoExistencias, desde: string, hasta: string): string[] {
  if (periodo === 'no' || periodo === 'momento' || desde > hasta) return []
  const paso = periodo === 'mensual' ? 1 : periodo === 'trimestral' ? 3 : 12
  const out: string[] = []
  let anio = Number(desde.slice(0, 4))
  let mes = Number(desde.slice(5, 7))
  mes = Math.ceil(mes / paso) * paso
  for (;;) {
    const f = finDeMes(anio, mes)
    if (f > hasta) break
    if (f >= desde) out.push(f)
    mes += paso
    if (mes > 12) {
      mes -= 12
      anio++
    }
  }
  return out
}

/** Nombre del periodo que cierra en una fecha: «marzo 2026», «1T 2026», «2026» */
export function nombreCierre(periodo: PeriodoExistencias, fecha: string): string {
  const anio = fecha.slice(0, 4)
  const mes = Number(fecha.slice(5, 7))
  if (periodo === 'anual') return anio
  if (periodo === 'trimestral') return `${Math.ceil(mes / 3)}T ${anio}`
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
  return `${meses[mes - 1]} ${anio}`
}

/** Normaliza una referencia o un nombre para compararlos («AB-12 » = «ab12») */
export function claveProducto(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

/** Busca el producto de una línea: primero por referencia, si no por nombre */
export function buscarProducto(productos: Producto[], referencia: string | null | undefined, nombre: string | null | undefined): Producto | undefined {
  const ref = claveProducto(referencia)
  if (ref) {
    const p = productos.find((x) => claveProducto(x.referencia) === ref)
    if (p) return p
  }
  const nom = claveProducto(nombre)
  if (!nom) return undefined
  return productos.find((x) => !ref || !x.referencia ? claveProducto(x.nombre) === nom : false)
}

/* ------------------------------------------------- Informe de un producto */

export interface VentaProducto {
  fecha: string
  documento: string
  cliente: string
  cantidad: number
  importe: number
  /** Coste de lo vendido (unidades × coste medio en ese momento) */
  coste: number
}

export interface CompraProducto {
  fecha: string
  documento: string
  proveedor: string
  cantidad: number
  coste: number
}

export interface InformeProducto {
  estado: EstadoProducto
  /** Stock al final de cada mes de los últimos 12 (el último, a la fecha de corte) */
  serie: { mes: string; cantidad: number; valor: number }[]
  ventas: VentaProducto[]
  compras: CompraProducto[]
  /** Último coste de compra por unidad */
  ultimoCoste: number | null
}

/** Stock, ventas con su coste y compras de un producto hasta una fecha */
export function informeProducto(movs: Movimiento[], productoId: string, corte: string): InformeProducto {
  const propios = movs.filter((m) => m.producto_id === productoId && m.fecha <= corte)
  // Meses: los 12 que acaban en el de la fecha de corte
  const meses: string[] = []
  let anio = Number(corte.slice(0, 4))
  let mes = Number(corte.slice(5, 7))
  for (let i = 0; i < 12; i++) {
    meses.unshift(`${anio}-${String(mes).padStart(2, '0')}`)
    if (--mes === 0) {
      mes = 12
      anio--
    }
  }
  const ventas: VentaProducto[] = []
  const compras: CompraProducto[] = []
  let estado: EstadoProducto = { cantidad: 0, coste: 0, valor: 0 }
  const finDe = new Map<string, EstadoProducto>()
  for (const m of propios) {
    if (m.origen === 'venta') {
      ventas.push({
        fecha: m.fecha,
        documento: m.documento.split(' · ')[0],
        cliente: m.tercero ?? 'Sin cliente',
        cantidad: -m.cantidad,
        importe: m.importe ?? 0,
        coste: r2(-m.cantidad * estado.coste),
      })
    } else if (m.origen === 'compra' && m.coste !== null) {
      compras.push({ fecha: m.fecha, documento: m.documento.split(' · ')[0], proveedor: m.tercero ?? 'Sin proveedor', cantidad: m.cantidad, coste: r4(m.coste) })
    }
    estado = aplicar(estado, m)
    finDe.set(m.fecha.slice(0, 7), estado)
  }
  // Stock a final de cada mes: el último estado conocido hasta ese mes
  const serie: InformeProducto['serie'] = []
  let ultimo: EstadoProducto = { cantidad: 0, coste: 0, valor: 0 }
  for (const m of propios) if (m.fecha.slice(0, 7) < meses[0]) ultimo = finDe.get(m.fecha.slice(0, 7)) ?? ultimo
  for (const mm of meses) {
    ultimo = finDe.get(mm) ?? ultimo
    serie.push({ mes: mm, cantidad: ultimo.cantidad, valor: ultimo.valor })
  }
  return { estado, serie, ventas, compras, ultimoCoste: compras.at(-1)?.coste ?? null }
}

/** Margen sobre el precio de venta: (precio − coste) / precio */
export function margen(precio: number | null | undefined, coste: number): { euros: number; pct: number } | null {
  const p = Number(precio)
  if (!p) return null
  return { euros: r2(p - coste), pct: Math.round(((p - coste) / p) * 1000) / 10 }
}
