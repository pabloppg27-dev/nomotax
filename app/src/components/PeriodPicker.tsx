import type { Periodo } from '../lib/format'
import { Select, cx } from './ui'

export default function PeriodPicker({ value, onChange }: { value: Periodo; onChange: (p: Periodo) => void }) {
  const actual = new Date().getFullYear()
  const anios = [actual + 1, actual, actual - 1, actual - 2, actual - 3].filter((a) => a <= actual || value.anio === a)
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        aria-label="Año"
        className="!h-9 w-24 !text-sm"
        value={value.anio}
        onChange={(e) => onChange({ ...value, anio: Number(e.target.value) })}
      >
        {anios.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </Select>
      <div className="flex rounded-full bg-ink/5 p-0.5">
        {([0, 1, 2, 3, 4] as const).map((t) => (
          <button
            key={t}
            onClick={() => onChange({ ...value, trimestre: t })}
            className={cx(
              'rounded-full px-3 py-1.5 text-sm transition-colors',
              value.trimestre === t ? 'bg-ink text-white' : 'text-ink/70 hover:text-ink',
            )}
          >
            {t === 0 ? 'Año' : `${t}T`}
          </button>
        ))}
      </div>
    </div>
  )
}
