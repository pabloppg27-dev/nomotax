import { useState } from 'react'
import { eur, MESES_CORTOS } from '../lib/format'
import { cx } from './ui'

export type Mes = Record<string, number>

export interface Serie {
  key: string
  label: string
  color: string
}

const C_INGRESOS = '#111110' // tinta NomoTax
const C_GASTOS = '#b3e04d' // lima oscuro NomoTax

const SERIES_DEFECTO: Serie[] = [
  { key: 'ingresos', label: 'Ingresos', color: C_INGRESOS },
  { key: 'gastos', label: 'Gastos', color: C_GASTOS },
]

function escala(max: number) {
  if (max <= 0) return { top: 1000, ticks: [0, 500, 1000] }
  const bruto = max / 4
  const pot = 10 ** Math.floor(Math.log10(bruto))
  const paso = [1, 2, 2.5, 5, 10].map((m) => m * pot).find((p) => p >= bruto) ?? bruto
  const top = Math.ceil(max / paso) * paso
  const ticks: number[] = []
  for (let v = 0; v <= top + 1e-6; v += paso) ticks.push(v)
  return { top, ticks }
}

const compacto = new Intl.NumberFormat('es-ES', { notation: 'compact', maximumFractionDigits: 1 })
const completo = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 })

export default function MonthlyChart({
  meses,
  anio,
  series = SERIES_DEFECTO,
  total = { label: 'Resultado', modo: 'resta' },
  apilado = false,
}: {
  meses: Mes[]
  anio: number
  series?: Serie[]
  total?: { label: string; modo: 'resta' | 'suma' }
  /** Barras apiladas (para sumas, p. ej. coste = salario + SS) */
  apilado?: boolean
}) {
  const [activo, setActivo] = useState<number | null>(null)
  const [tabla, setTabla] = useState(false)
  const [a, b] = series
  const valorTotal = (m: Mes) =>
    total.modo === 'resta' ? (m[a.key] ?? 0) - (m[b?.key] ?? 0) : series.reduce((s, x) => s + (m[x.key] ?? 0), 0)
  const max = Math.max(...meses.map((m) => (apilado ? valorTotal(m) : Math.max(...series.map((x) => m[x.key] ?? 0)))), 0)
  const { top, ticks } = escala(max)
  const fmtTick = (v: number) => (top >= 10000 ? compacto.format(v) : completo.format(v))
  const H = 200

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4 text-sm text-ink/75">
          {series.map((x) => (
            <span key={x.key} className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm" style={{ background: x.color }} /> {x.label}
            </span>
          ))}
        </div>
        <button onClick={() => setTabla(!tabla)} className="text-sm text-muted underline-offset-2 hover:text-ink hover:underline">
          {tabla ? 'Ver gráfico' : 'Ver tabla'}
        </button>
      </div>

      {tabla ? (
        <div className="overflow-x-auto">
          <table className="num w-full min-w-[420px] text-right text-sm">
            <thead className="text-xs uppercase tracking-wide text-muted">
              <tr className="border-b border-line">
                <th className="py-2 text-left font-medium">Mes</th>
                {series.map((x) => (
                  <th key={x.key} className="py-2 font-medium">
                    {x.label}
                  </th>
                ))}
                <th className="py-2 font-medium">{total.label}</th>
              </tr>
            </thead>
            <tbody>
              {meses.map((m, i) => (
                <tr key={i} className="border-b border-line last:border-0">
                  <td className="py-1.5 text-left capitalize">
                    {MESES_CORTOS[i]} {anio}
                  </td>
                  {series.map((x) => (
                    <td key={x.key} className="py-1.5">
                      {eur(m[x.key] ?? 0)}
                    </td>
                  ))}
                  <td className="py-1.5 font-medium">{eur(valorTotal(m))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative flex">
          {/* Eje Y */}
          <div className="relative mr-2 w-10 shrink-0 text-right text-[11px] text-muted" style={{ height: H }}>
            {ticks.map((t) => (
              <span key={t} className="num absolute right-0 leading-none" style={{ bottom: `${(t / top) * 100}%`, transform: 'translateY(50%)' }}>
                {fmtTick(t)}
              </span>
            ))}
          </div>

          <div className="relative flex-1">
            {/* Rejilla */}
            <div className="pointer-events-none absolute inset-x-0 top-0" style={{ height: H }}>
              {ticks.map((t) => (
                <div key={t} className="absolute inset-x-0 h-px bg-line" style={{ bottom: `${(t / top) * 100}%` }} />
              ))}
            </div>

            {/* Columnas */}
            <div className="relative grid grid-cols-12" style={{ height: H }}>
              {meses.map((m, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={`${MESES_CORTOS[i]}: ${series.map((x) => `${x.label} ${eur(m[x.key] ?? 0)}`).join(', ')}`}
                  onPointerEnter={() => setActivo(i)}
                  onPointerLeave={() => setActivo(null)}
                  onFocus={() => setActivo(i)}
                  onBlur={() => setActivo(null)}
                  onClick={() => setActivo(activo === i ? null : i)}
                  className={cx('relative flex h-full items-end justify-center gap-[2px] rounded-md outline-none', activo === i && 'bg-ink/[0.04]')}
                >
                  {apilado ? (
                    <span
                      className="flex w-[min(60%,22px)] flex-col-reverse gap-[2px] transition-opacity"
                      style={{ height: `${(valorTotal(m) / top) * 100}%`, opacity: activo === null || activo === i ? 1 : 0.45 }}
                    >
                      {series.map((x, j) => (
                        <span
                          key={x.key}
                          className={cx('block w-full', j === series.length - 1 && 'rounded-t-[4px]')}
                          style={{ flexGrow: m[x.key] ?? 0, flexBasis: 0, background: x.color, minHeight: (m[x.key] ?? 0) > 0 ? 2 : 0 }}
                        />
                      ))}
                    </span>
                  ) : (
                    series.map((x) => (
                      <span
                        key={x.key}
                        className="block w-[min(40%,14px)] rounded-t-[4px] transition-opacity"
                        style={{
                          height: `${((m[x.key] ?? 0) / top) * 100}%`,
                          minHeight: (m[x.key] ?? 0) > 0 ? 2 : 0,
                          background: x.color,
                          opacity: activo === null || activo === i ? 1 : 0.45,
                        }}
                      />
                    ))
                  )}
                </button>
              ))}
            </div>

            {/* Meses */}
            <div className="mt-2 grid grid-cols-12 text-center text-[11px] capitalize text-muted">
              {MESES_CORTOS.map((m, i) => (
                <span key={m} className={cx(activo === i && 'font-medium text-ink')}>
                  <span className="sm:hidden">{m[0]}</span>
                  <span className="hidden sm:inline">{m}</span>
                </span>
              ))}
            </div>

            {/* Tooltip */}
            {activo !== null && (
              <div
                className="pointer-events-none absolute top-2 z-10 w-44 rounded-xl border border-line bg-white p-3 text-sm shadow-lg"
                style={{
                  left: `${((activo + 0.5) / 12) * 100}%`,
                  transform: `translateX(${activo > 8 ? '-100%' : activo < 3 ? '0' : '-50%'})`,
                }}
              >
                <p className="mb-1.5 text-xs capitalize text-muted">
                  {MESES_CORTOS[activo]} {anio}
                </p>
                {series.map((x) => (
                  <Fila key={x.key} color={x.color} label={x.label} valor={meses[activo][x.key] ?? 0} />
                ))}
                <div className="mt-1.5 flex justify-between border-t border-line pt-1.5">
                  <span className="text-muted">{total.label}</span>
                  <strong className="num">{eur(valorTotal(meses[activo]))}</strong>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Fila({ color, label, valor }: { color: string; label: string; valor: number }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="inline-flex items-center gap-1.5 text-muted">
        <span className="h-0.5 w-3 rounded" style={{ background: color }} />
        {label}
      </span>
      <strong className="num">{eur(valor)}</strong>
    </div>
  )
}
