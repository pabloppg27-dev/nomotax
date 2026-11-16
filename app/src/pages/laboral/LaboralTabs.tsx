import { NavLink } from 'react-router-dom'
import type { ReactNode } from 'react'
import { cx } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { cuotaLaboral, importe } from '../../lib/planes'

const TABS = [
  { to: '/laboral', label: 'Trabajadores', end: true },
  { to: '/laboral/nominas', label: 'Nóminas' },
  { to: '/laboral/empresa', label: 'Empresa' },
]

export default function LaboralTabs({ actions, subtitle }: { actions?: ReactNode; subtitle?: ReactNode }) {
  const { owner } = useAuth()
  const tarifa = owner ? cuotaLaboral(owner) : null
  return (
    <div className="mb-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">Laboral</h1>
          {subtitle && <p className="mt-1 text-[15px] text-muted">{subtitle}</p>}
          {tarifa && (
            <p className="num mt-2 inline-block rounded-xl bg-lima/40 px-3 py-1 text-sm leading-snug">
              Tu tarifa laboral: {tarifa.texto} = <strong className="whitespace-nowrap">{importe(tarifa.total)}/mes + IVA</strong>
            </p>
          )}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      <div className="mt-5 flex gap-1 border-b border-line">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              cx(
                '-mb-px border-b-2 px-3 py-2 text-[15px] transition-colors',
                isActive ? 'border-ink font-medium text-ink' : 'border-transparent text-muted hover:text-ink',
              )
            }
          >
            {t.label}
          </NavLink>
        ))}
      </div>
    </div>
  )
}
