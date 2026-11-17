import { cx } from './ui'
import type { EstadoTarjeta } from '../lib/tarjetas'

/**
 * La tarjeta con el diseño de NomoTax: negro #111110, lima #CDF564 y el logo.
 * Es la misma en la pantalla de Tarjetas y (más adelante) la que se mandará a Stripe como diseño de la tarjeta física.
 */
export default function TarjetaVisual({
  titular,
  alias,
  ultimos4,
  exp_mes,
  exp_anio,
  estado = 'activa',
  tipo = 'virtual',
  numero,
  cvv,
  className,
}: {
  titular: string
  alias?: string
  ultimos4: string
  exp_mes: number | null
  exp_anio: number | null
  estado?: EstadoTarjeta
  tipo?: 'virtual' | 'fisica'
  /** Si se pasa, se enseña el número completo (solo en la demo) */
  numero?: string
  cvv?: string
  className?: string
}) {
  const caduca = exp_mes && exp_anio ? `${String(exp_mes).padStart(2, '0')}/${String(exp_anio).slice(-2)}` : '--/--'
  const apagada = estado !== 'activa'
  return (
    <div
      className={cx(
        'relative aspect-[1.586/1] w-full max-w-[360px] select-none overflow-hidden rounded-2xl bg-ink p-5 text-white shadow-lg ring-1 ring-white/10',
        estado === 'cancelada' && 'opacity-60 grayscale',
        className,
      )}
      aria-label={`Tarjeta ${alias ?? ''} terminada en ${ultimos4}`}
    >
      {/* Formas lima de fondo */}
      <div className="pointer-events-none absolute -right-10 -top-12 size-44 rounded-full bg-lima/90" />
      <div className="pointer-events-none absolute -right-2 top-16 size-24 rounded-full bg-lima/25" />
      <div className="pointer-events-none absolute -bottom-16 -left-10 size-40 rounded-full bg-white/[0.05]" />

      <div className="relative flex h-full flex-col justify-between">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="" className="size-8 rounded-md" />
            <span className="text-[15px] font-semibold tracking-tight">NomoTax</span>
          </div>
          <span className="rounded-full bg-ink px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-lima">
            {tipo === 'fisica' ? 'Física' : 'Virtual'}
          </span>
        </div>

        <div>
          {/* Chip */}
          <div className="mb-2 h-6 w-9 rounded-md bg-gradient-to-br from-lima to-lima-dark opacity-90" />
          <div className="num font-mono text-[17px] tracking-[0.14em] sm:text-lg">
            {numero ?? `•••• •••• •••• ${ultimos4}`}
          </div>
        </div>

        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-[11px] uppercase tracking-[0.08em] text-white/60">{titular}</div>
            <div className="num text-xs text-white/80">
              Caduca {caduca}
              {cvv && <span className="ml-3">CVV {cvv}</span>}
            </div>
          </div>
          <span className="font-sans text-xl font-bold italic tracking-tight text-white">VISA</span>
        </div>
      </div>

      {apagada && (
        <div className="absolute inset-0 grid place-items-center bg-ink/70 backdrop-blur-[1px]">
          <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-ink">
            {estado === 'congelada' ? 'Congelada' : 'Cancelada'}
          </span>
        </div>
      )}
    </div>
  )
}
