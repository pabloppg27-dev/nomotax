import { Boxes, Plus, Trash2 } from 'lucide-react'
import { eur } from '../lib/format'
import type { Producto } from '../lib/inventario.ts'
import { crearProducto } from '../lib/productos'
import type { LineaCompra } from '../lib/types'
import NumInput from './NumInput'
import SelectBuscable from './SelectBuscable'
import { Button, Input, notify } from './ui'

const NUEVO = '__nuevo'

/**
 * Líneas de una factura de compra para el inventario: cada una con su producto (suma stock al confirmar
 * el gasto) o «No va al inventario» (portes, servicios…). El coste de cada unidad sale de repartir la
 * base de la factura entre sus líneas, así que los portes y descuentos generales quedan dentro del coste.
 */
export default function LineasCompra({
  ownerId,
  lineas,
  onChange,
  productos,
  onProducto,
  base,
}: {
  ownerId: string
  lineas: LineaCompra[]
  onChange: (l: LineaCompra[]) => void
  productos: Producto[]
  onProducto: (p: Producto) => void
  base: number
}) {
  const update = (i: number, patch: Partial<LineaCompra>) => onChange(lineas.map((l, j) => (j === i ? { ...l, ...patch } : l)))
  const suma = Math.round(lineas.reduce((s, l) => s + Number(l.importe || 0), 0) * 100) / 100
  const conProducto = lineas.filter((l) => l.producto_id).length

  const elegir = async (i: number, v: string) => {
    if (v !== NUEVO) return update(i, { producto_id: v || null })
    const l = lineas[i]
    try {
      const p = await crearProducto(ownerId, { referencia: l.referencia, nombre: l.descripcion || l.referencia || 'Artículo' })
      onProducto(p)
      update(i, { producto_id: p.id })
      notify(`Producto «${p.nombre}» creado`)
    } catch (e) {
      notify((e as Error).message.includes('productos_referencia_uq') ? 'Ya hay un producto con esa referencia' : (e as Error).message, 'error')
    }
  }

  const opciones = [
    { value: '', label: 'No va al inventario', detalle: 'portes, servicios…' },
    ...productos.filter((p) => p.activo).map((p) => ({ value: p.id, label: p.nombre, detalle: p.referencia ?? undefined })),
  ]

  return (
    <div className="rounded-xl border border-line p-4">
      <p className="mb-1 flex items-center gap-2 font-medium">
        <Boxes className="size-4" /> Inventario
      </p>
      <p className="mb-3 text-sm text-muted">
        {conProducto
          ? `${conProducto} línea${conProducto > 1 ? 's suman' : ' suma'} stock al confirmar el gasto.`
          : 'Elige el producto de cada línea para que sume stock.'}
      </p>

      <div className="space-y-3">
        {lineas.map((l, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_36px] gap-2 rounded-xl bg-paper p-2.5">
            <Input
              className="col-span-2"
              aria-label="Referencia"
              placeholder="Referencia"
              value={l.referencia ?? ''}
              onChange={(e) => update(i, { referencia: e.target.value || null })}
            />
            <button
              type="button"
              onClick={() => onChange(lineas.filter((_, j) => j !== i))}
              className="grid size-9 place-items-center self-center rounded-full text-muted hover:bg-rojo/10 hover:text-rojo"
              aria-label="Quitar línea"
            >
              <Trash2 className="size-4" />
            </button>
            <Input
              className="col-span-3"
              aria-label="Descripción"
              placeholder="Descripción"
              value={l.descripcion}
              onChange={(e) => update(i, { descripcion: e.target.value })}
            />
            <label className="text-xs text-muted">
              Cantidad
              <NumInput className="mt-1 text-right" value={l.cantidad} onValue={(n) => update(i, { cantidad: n })} />
            </label>
            <label className="col-span-2 text-xs text-muted">
              Importe sin IVA
              <NumInput className="mt-1 text-right" value={l.importe} onValue={(n) => update(i, { importe: n })} />
            </label>
            <div className="col-span-3">
              <SelectBuscable
                aria-label="Producto"
                value={l.producto_id ?? ''}
                onChange={(v) => elegir(i, v)}
                opciones={l.producto_id ? opciones : [...opciones, { value: NUEVO, label: `+ Crear producto «${l.descripcion || l.referencia || 'nuevo'}»` }]}
                buscarPlaceholder="Buscar por nombre o referencia…"
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          icon={<Plus className="size-4" />}
          onClick={() => onChange([...lineas, { referencia: null, descripcion: '', cantidad: 1, importe: 0, producto_id: null }])}
        >
          Añadir línea
        </Button>
        {lineas.length > 0 && Math.abs(suma - base) > 0.02 && (
          <span className="num text-xs text-muted">
            Las líneas suman {eur(suma)} y la base es {eur(base)}: el coste se reparte en proporción.
          </span>
        )}
      </div>
    </div>
  )
}
