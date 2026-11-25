/**
 * Productos del inventario en Supabase (supabase/inventario.sql): cargar, crear y casar las líneas
 * que lee la IA de una factura con su producto (por referencia; si no hay, por nombre).
 */
import { supabase } from './supabase'
import { buscarProducto, type Producto, type TipoExistencia } from './inventario.ts'
import type { Linea, LineaCompra, OcrLinea } from './types'

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export async function cargarProductos(ownerId: string): Promise<Producto[]> {
  const { data, error } = await supabase.from('productos').select('*').eq('owner_id', ownerId).order('nombre')
  return error ? [] : ((data as Producto[]) ?? [])
}

export async function crearProducto(
  ownerId: string,
  p: { referencia: string | null; nombre: string; tipo?: TipoExistencia; unidad?: string; precio_venta?: number | null },
): Promise<Producto> {
  const { data, error } = await supabase
    .from('productos')
    .insert({ owner_id: ownerId, referencia: p.referencia?.trim() || null, nombre: p.nombre.trim(), tipo: p.tipo ?? 'mercaderias', unidad: p.unidad ?? 'ud', precio_venta: p.precio_venta ?? null })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data as Producto
}

/**
 * Factura de compra: cada línea de existencias se casa con su producto y, si no existe, se crea.
 * Las que no son existencias (portes, servicios…) se guardan sin producto: no mueven stock.
 * Si no se pueden crear productos (permisos, falta inventario.sql), las líneas quedan sin producto.
 */
export async function vincularLineasCompra(ownerId: string, lineas: OcrLinea[]): Promise<LineaCompra[]> {
  const productos = await cargarProductos(ownerId)
  const out: LineaCompra[] = []
  for (const l of lineas) {
    const descripcion = (l.descripcion ?? '').trim() || l.referencia || 'Artículo'
    let producto_id: string | null = null
    if (l.es_existencia && Number(l.cantidad)) {
      let p = buscarProducto(productos, l.referencia, descripcion)
      if (!p) {
        try {
          p = await crearProducto(ownerId, { referencia: l.referencia, nombre: descripcion })
          productos.push(p)
        } catch {
          p = undefined
        }
      }
      producto_id = p?.id ?? null
    }
    out.push({ referencia: l.referencia || null, descripcion, cantidad: Number(l.cantidad) || 0, importe: r2(Number(l.importe) || 0), producto_id })
  }
  return out
}

/**
 * Factura emitida con otro programa: si sus líneas cuadran con la base, se guardan con su producto
 * (solo productos que ya existen) para que resten stock. Si no cuadran, null: se deja como está.
 */
export async function lineasVentaExterna(ownerId: string, lineas: OcrLinea[] | undefined, base: number, iva: number | null): Promise<Linea[] | null> {
  if (!lineas?.length || !lineas.some((l) => l.es_existencia) || iva === null) return null
  const suma = r2(lineas.reduce((s, l) => s + Number(l.importe || 0), 0))
  if (Math.abs(suma - base) > 0.05) return null
  const productos = await cargarProductos(ownerId)
  if (!productos.length) return null
  return lineas.map((l) => {
    const cantidad = Number(l.cantidad) || 1
    const p = l.es_existencia ? buscarProducto(productos, l.referencia, l.descripcion) : undefined
    return {
      concepto: (l.descripcion ?? '').trim() || l.referencia || 'Artículo',
      cantidad,
      precio: Math.round((Number(l.importe || 0) / cantidad) * 10000) / 10000,
      iva,
      ...(p ? { producto_id: p.id, referencia: p.referencia } : {}),
    }
  })
}
