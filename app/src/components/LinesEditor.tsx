import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useAuth } from '../lib/auth'
import type { Producto } from '../lib/inventario.ts'
import { cargarProductos } from '../lib/productos'
import SelectBuscable from './SelectBuscable'
import { eur } from '../lib/format'
import { TIPOS_IVA, importeLinea, lineaVacia } from '../lib/totals'
import type { Linea } from '../lib/types'
import NumInput from './NumInput'
import { Button, Select, Textarea } from './ui'

export default function LinesEditor({
  lineas,
  onChange,
  disabled,
}: {
  lineas: Linea[]
  onChange: (l: Linea[]) => void
  disabled?: boolean
}) {
  const { ownerId } = useAuth()
  // Productos del inventario: si la empresa tiene, cada línea puede ir ligada a uno (resta stock al emitir)
  const [productos, setProductos] = useState<Producto[]>([])
  useEffect(() => {
    if (ownerId) cargarProductos(ownerId).then(setProductos)
  }, [ownerId])
  const conInventario = productos.length > 0 || lineas.some((l) => l.producto_id)
  const opciones = [
    { value: '', label: 'Sin producto', detalle: 'servicio, no mueve stock' },
    ...productos.filter((p) => p.activo || lineas.some((l) => l.producto_id === p.id)).map((p) => ({ value: p.id, label: p.nombre, detalle: p.referencia ?? undefined })),
  ]
  const elegirProducto = (i: number, id: string) => {
    const p = productos.find((x) => x.id === id)
    const l = lineas[i]
    if (!p) return update(i, { producto_id: null, referencia: null })
    update(i, {
      producto_id: p.id,
      referencia: p.referencia,
      concepto: l.concepto.trim() ? l.concepto : p.nombre,
      precio: Number(l.precio) ? l.precio : Number(p.precio_venta ?? 0),
      iva: p.iva !== null && p.iva !== undefined ? Number(p.iva) : l.iva,
    })
  }

  const update = (i: number, patch: Partial<Linea>) => onChange(lineas.map((l, j) => (j === i ? { ...l, ...patch } : l)))
  const remove = (i: number) => onChange(lineas.filter((_, j) => j !== i))

  return (
    <div>
      {/* Cabeceras con el mismo margen interior que las casillas, para que cada una quede encima de la suya */}
      <div className="hidden grid-cols-[1fr_80px_120px_96px_110px_36px] gap-2 pb-2 text-xs font-medium uppercase tracking-wide text-muted md:grid">
        <span className="px-3">Concepto</span>
        <span className="px-3 text-right">Cant.</span>
        <span className="px-3 text-right">Precio</span>
        <span className="px-3">IVA</span>
        <span className="text-right">Importe</span>
        <span />
      </div>

      <div className="space-y-3 md:space-y-2">
        {lineas.map((l, i) => (
          <div
            key={i}
            className="grid grid-cols-[1fr_1fr_1fr] gap-2 rounded-xl border border-line p-3 md:grid-cols-[1fr_80px_120px_96px_110px_36px] md:items-center md:border-0 md:p-0"
          >
            {conInventario && (
              <div className="col-span-3 md:col-span-6">
                <SelectBuscable
                  aria-label="Producto del inventario"
                  value={l.producto_id ?? ''}
                  disabled={disabled}
                  onChange={(v) => elegirProducto(i, v)}
                  opciones={opciones}
                  placeholder="Sin producto"
                  buscarPlaceholder="Buscar producto o referencia…"
                />
              </div>
            )}
            <Concepto
              value={l.concepto}
              disabled={disabled}
              onChange={(v) => update(i, { concepto: v })}
            />
            <NumInput
              aria-label="Cantidad"
              className="text-right"
              value={l.cantidad}
              disabled={disabled}
              onValue={(n) => update(i, { cantidad: n })}
            />
            <NumInput
              aria-label="Precio unitario"
              className="text-right"
              value={l.precio}
              disabled={disabled}
              onValue={(n) => update(i, { precio: n })}
            />
            <Select
              aria-label="IVA"
              value={l.iva}
              disabled={disabled}
              onChange={(e) => update(i, { iva: Number(e.target.value) })}
            >
              {TIPOS_IVA.map((t) => (
                <option key={t} value={t}>
                  {t}%
                </option>
              ))}
            </Select>
            <div className="num col-span-2 flex items-center text-[15px] font-medium md:col-span-1 md:justify-end">
              <span className="mr-auto text-sm font-normal text-muted md:hidden">Importe</span>
              {eur(importeLinea(l))}
            </div>
            <button
              type="button"
              onClick={() => remove(i)}
              disabled={disabled || lineas.length === 1}
              className="grid size-9 place-items-center justify-self-end rounded-full text-muted hover:bg-rojo/10 hover:text-rojo disabled:invisible"
              aria-label="Quitar línea"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
      </div>

      {!disabled && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-3"
          icon={<Plus className="size-4" />}
          onClick={() => onChange([...lineas, { ...lineaVacia(), iva: lineas.at(-1)?.iva ?? 21 }])}
        >
          Añadir línea
        </Button>
      )}
    </div>
  )
}

/** Concepto de la línea: la primera línea sale en negrita en el PDF; con Intro se añade el detalle, en gris. */
function Concepto({ value, disabled, onChange }: { value: string; disabled?: boolean; onChange: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight + 2}px`
  }, [value])
  return (
    <Textarea
      ref={ref}
      rows={1}
      className="col-span-3 resize-none overflow-hidden leading-snug md:col-span-1"
      style={{ minHeight: '2.5rem' }}
      placeholder="Concepto (Intro para añadir detalle)"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}
