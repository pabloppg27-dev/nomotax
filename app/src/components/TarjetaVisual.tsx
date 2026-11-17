import { cx } from './ui'
import type { EstadoTarjeta } from '../lib/tarjetas'

/**
 * La tarjeta con el diseño de NomoTax: negro #111110, lima #CDF564 y el logo.
 * Todo se mide en «cqw» (porcentaje del ancho de la propia tarjeta), así se ve igual en el móvil que en el ordenador.
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
    <div className={cx('@container mx-auto w-full max-w-[380px] md:mx-0', className)}>
      <div
        className={cx(
          'relative aspect-[1.586/1] w-full select-none overflow-hidden rounded-[4.5cqw] bg-ink text-white shadow-lg ring-1 ring-white/10',
          estado === 'cancelada' && 'opacity-60 grayscale',
        )}
        aria-label={`Tarjeta ${alias ?? ''} terminada en ${ultimos4}`}
      >
        {/* Formas lima: en la esquina derecha, sin tapar los textos */}
        <div className="pointer-events-none absolute -right-[14%] -top-[30%] aspect-square w-[52%] rounded-full bg-lima" />
        <div className="pointer-events-none absolute -right-[6%] top-[22%] aspect-square w-[26%] rounded-full bg-lima/25" />

        <div className="relative flex h-full flex-col justify-between p-[6cqw]">
          <div className="flex items-center justify-between gap-[2cqw]">
            <div className="flex min-w-0 items-center gap-[2.5cqw]">
              <img src="/logo.png" alt="" className="size-[9cqw] shrink-0 rounded-[1.8cqw]" />
              <span className="truncate text-[4.6cqw] font-semibold tracking-tight">NomoTax</span>
            </div>
            <span className="shrink-0 rounded-full bg-ink px-[2.6cqw] py-[0.8cqw] text-[2.7cqw] font-semibold uppercase tracking-[0.12em] text-lima">
              {tipo === 'fisica' ? 'Física' : 'Virtual'}
            </span>
          </div>

          <div>
            {/* Chip */}
            <div className="mb-[3cqw] h-[7.5cqw] w-[11cqw] rounded-[1.6cqw] bg-gradient-to-br from-lima to-lima-dark" />
            <div className="num whitespace-nowrap font-mono text-[5.4cqw] tracking-[0.06em]">
              {numero ?? `•••• •••• •••• ${ultimos4}`}
            </div>
          </div>

          <div className="flex items-end justify-between gap-[3cqw]">
            <div className="min-w-0">
              <div className="truncate text-[3.3cqw] font-medium uppercase tracking-[0.08em] text-white/75">{titular}</div>
              <div className="num mt-[0.6cqw] whitespace-nowrap text-[3.3cqw] text-white/85">
                Caduca {caduca}
                {cvv && <span className="ml-[3cqw]">CVV {cvv}</span>}
              </div>
            </div>
            <span className="shrink-0 text-[6.4cqw] font-bold italic leading-none tracking-tight text-white">VISA</span>
          </div>
        </div>

        {apagada && (
          <div className="absolute inset-0 grid place-items-center bg-ink/70 backdrop-blur-[1px]">
            <span className="rounded-full bg-white px-[3.5cqw] py-[1.2cqw] text-[3.4cqw] font-semibold uppercase tracking-[0.12em] text-ink">
              {estado === 'congelada' ? 'Congelada' : 'Cancelada'}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
