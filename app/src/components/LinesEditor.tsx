import { Plus, Trash2 } from 'lucide-react'
import { eur } from '../lib/format'
import { TIPOS_IVA, importeLinea, lineaVacia } from '../lib/totals'
import type { Linea } from '../lib/types'
import NumInput from './NumInput'
import { Button, Input, Select } from './ui'

export default function LinesEditor({
  lineas,
  onChange,
  disabled,
}: {
  lineas: Linea[]
  onChange: (l: Linea[]) => void
  disabled?: boolean
}) {
  const update = (i: number, patch: Partial<Linea>) => onChange(lineas.map((l, j) => (j === i ? { ...l, ...patch } : l)))
  const remove = (i: number) => onChange(lineas.filter((_, j) => j !== i))

  return (
    <div>
      <div className="hidden grid-cols-[1fr_80px_120px_96px_110px_36px] gap-2 px-1 pb-2 text-xs font-medium uppercase tracking-wide text-muted md:grid">
        <span>Concepto</span>
        <span className="text-right">Cant.</span>
        <span className="text-right">Precio</span>
        <span>IVA</span>
        <span className="text-right">Importe</span>
        <span />
      </div>

      <div className="space-y-3 md:space-y-2">
        {lineas.map((l, i) => (
          <div
            key={i}
            className="grid grid-cols-[1fr_1fr_1fr] gap-2 rounded-xl border border-line p-3 md:grid-cols-[1fr_80px_120px_96px_110px_36px] md:items-center md:border-0 md:p-0"
          >
            <Input
              className="col-span-3 md:col-span-1"
              placeholder="Descripción del servicio o producto"
              value={l.concepto}
              disabled={disabled}
              onChange={(e) => update(i, { concepto: e.target.value })}
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
                  {t} %
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
