import { useState } from 'react'
import { CalendarRange, ChevronDown } from 'lucide-react'
import { fecha, rangoPeriodo, type Periodo } from '../lib/format'
import { Button, Field, Input, Modal, Select, cx, notify } from './ui'

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

const ORDINAL = ['1.er', '2.º', '3.er', '4.º']
const MESES_TRIM = ['ene–mar', 'abr–jun', 'jul–sep', 'oct–dic']

const pastilla = (activa: boolean) =>
  cx('whitespace-nowrap rounded-full px-3 py-1.5 text-sm transition-colors', activa ? 'bg-ink text-white' : 'text-ink/70 hover:text-ink')

/** 01/02/2026 → 01/02/26 (para el botón) */
const corta = (iso: string) => fecha(iso).replace(/\/\d{2}(\d{2})$/, '/$1')

/**
 * Selector de periodo: año + Año / Trimestre / Mes / Fechas a medida.
 * Siempre devuelve un Periodo; rangoPeriodo() da las fechas desde/hasta.
 */
export default function PeriodPicker({ value, onChange }: { value: Periodo; onChange: (p: Periodo) => void }) {
  const [fechas, setFechas] = useState(false)
  const actual = new Date().getFullYear()
  const anios = [actual + 1, actual, actual - 1, actual - 2, actual - 3].filter((a) => a <= actual || value.anio === a)
  const aMedida = Boolean(value.desde && value.hasta)
  const mes = aMedida ? undefined : value.mes
  const trimestre = aMedida || mes ? 0 : value.trimestre

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!aMedida && (
        <Select
          aria-label="Año"
          className="!h-9 w-24 !text-sm"
          value={value.anio}
          onChange={(e) => onChange({ anio: Number(e.target.value), trimestre: value.trimestre, mes })}
        >
          {anios.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </Select>
      )}

      <div className="flex flex-wrap rounded-full bg-ink/5 p-0.5">
        <button type="button" onClick={() => onChange({ anio: value.anio, trimestre: 0 })} className={pastilla(!aMedida && !mes && value.trimestre === 0)}>
          Año
        </button>

        {/* Trimestre y Mes: el desplegable nativo va encima, invisible, para que en el móvil salga la lista del sistema */}
        <label className={cx('relative flex cursor-pointer items-center gap-1', pastilla(trimestre > 0))}>
          {trimestre ? `${ORDINAL[trimestre - 1]} trimestre` : 'Trimestre'}
          <ChevronDown className="size-3.5 opacity-70" />
          <select
            aria-label="Trimestre"
            className="absolute inset-0 w-full cursor-pointer opacity-0"
            value={trimestre || ''}
            onChange={(e) => onChange({ anio: value.anio, trimestre: Number(e.target.value) as 1 | 2 | 3 | 4 })}
          >
            <option value="" disabled>
              Elige un trimestre
            </option>
            {([1, 2, 3, 4] as const).map((t) => (
              <option key={t} value={t}>
                {ORDINAL[t - 1]} trimestre · {MESES_TRIM[t - 1]} {value.anio}
              </option>
            ))}
          </select>
        </label>

        <label className={cx('relative flex cursor-pointer items-center gap-1', pastilla(Boolean(mes)))}>
          {mes ? MESES[mes - 1] : 'Mes'}
          <ChevronDown className="size-3.5 opacity-70" />
          <select
            aria-label="Mes"
            className="absolute inset-0 w-full cursor-pointer opacity-0"
            value={mes ?? ''}
            onChange={(e) => onChange({ anio: value.anio, trimestre: 0, mes: Number(e.target.value) })}
          >
            <option value="" disabled>
              Elige un mes
            </option>
            {MESES.map((m, i) => (
              <option key={m} value={i + 1}>
                {m} {value.anio}
              </option>
            ))}
          </select>
        </label>

        <button type="button" onClick={() => setFechas(true)} className={cx('flex items-center gap-1.5', pastilla(aMedida))}>
          <CalendarRange className="size-3.5" />
          {aMedida ? `${corta(value.desde!)} – ${corta(value.hasta!)}` : 'Fechas'}
        </button>
      </div>

      {fechas && (
        <ElegirFechas
          inicial={rangoPeriodo(value)}
          onClose={() => setFechas(false)}
          onElegir={(desde, hasta) => onChange({ anio: Number(hasta.slice(0, 4)), trimestre: 0, desde, hasta })}
        />
      )}
    </div>
  )
}

function ElegirFechas({ inicial, onClose, onElegir }: { inicial: { desde: string; hasta: string }; onClose: () => void; onElegir: (desde: string, hasta: string) => void }) {
  const [desde, setDesde] = useState(inicial.desde)
  const [hasta, setHasta] = useState(inicial.hasta)
  const aplicar = () => {
    if (!desde || !hasta) return notify('Elige las dos fechas', 'error')
    if (hasta < desde) return notify('La fecha de inicio no puede ser posterior a la de fin', 'error')
    onElegir(desde, hasta)
    onClose()
  }
  return (
    <Modal
      open
      onClose={onClose}
      title="Elegir fechas"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={aplicar}>Ver este periodo</Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Desde">
          <Input type="date" value={desde} max={hasta || undefined} onChange={(e) => setDesde(e.target.value)} />
        </Field>
        <Field label="Hasta">
          <Input type="date" value={hasta} min={desde || undefined} onChange={(e) => setHasta(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}
