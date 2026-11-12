import { eur, num } from '../lib/format'
import { TIPOS_IRPF, type Totales } from '../lib/totals'
import { Select } from './ui'

export default function TotalsBox({
  totales,
  irpfPct,
  onIrpf,
  disabled,
}: {
  totales: Totales
  irpfPct: number
  onIrpf: (n: number) => void
  disabled?: boolean
}) {
  return (
    <div className="space-y-2 text-[15px]">
      <Row label="Base imponible" value={eur(totales.base)} />
      {totales.desglose.map((d) => (
        <Row key={d.tipo} label={`IVA ${num(d.tipo)} %`} hint={totales.desglose.length > 1 ? `sobre ${eur(d.base)}` : undefined} value={eur(d.cuota)} />
      ))}
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-ink/75">
          Retención IRPF
          <Select
            aria-label="Retención IRPF"
            className="!h-8 w-24 !text-sm"
            value={irpfPct}
            disabled={disabled}
            onChange={(e) => onIrpf(Number(e.target.value))}
          >
            {TIPOS_IRPF.map((t) => (
              <option key={t} value={t}>
                {t} %
              </option>
            ))}
          </Select>
        </span>
        <span className="num">{totales.cuota_irpf ? `−${eur(totales.cuota_irpf)}` : eur(0)}</span>
      </div>
      <div className="mt-3 flex items-center justify-between rounded-xl bg-ink px-4 py-3 text-white">
        <span className="font-medium">Total</span>
        <span className="num text-xl font-semibold text-lima">{eur(totales.total)}</span>
      </div>
    </div>
  )
}

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-ink/75">
        {label} {hint && <span className="text-xs text-muted">{hint}</span>}
      </span>
      <span className="num">{value}</span>
    </div>
  )
}
