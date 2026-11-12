import {
  forwardRef,
  useEffect,
  useState,
  useSyncExternalStore,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, AlertCircle, X, Loader2 } from 'lucide-react'

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

/* ------------------------------------------------------------------ Botones */

type Variant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger'

const variants: Record<Variant, string> = {
  primary: 'bg-ink text-white hover:bg-ink-3 disabled:bg-ink/40',
  accent: 'bg-lima text-ink hover:bg-lima-dark disabled:opacity-50',
  secondary: 'bg-white text-ink border border-line hover:border-ink/30 disabled:opacity-50',
  ghost: 'text-ink hover:bg-ink/5 disabled:opacity-40',
  danger: 'bg-white text-rojo border border-rojo/30 hover:bg-rojo/5 disabled:opacity-50',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: 'sm' | 'md'
  loading?: boolean
  icon?: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-full font-medium transition-colors cursor-pointer disabled:cursor-not-allowed whitespace-nowrap',
        size === 'sm' ? 'h-8 px-3 text-sm' : 'h-10 px-4 text-[15px]',
        variants[variant],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  )
})

/* ---------------------------------------------------------- Campos de form */

const fieldBase =
  'w-full rounded-lg border border-line bg-white px-3 text-[15px] text-ink placeholder:text-muted/70 outline-none transition focus:border-ink focus:ring-2 focus:ring-lima/60 disabled:bg-paper disabled:text-muted'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest },
  ref,
) {
  return <input ref={ref} className={cx(fieldBase, 'h-10', className)} {...rest} />
})

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...rest },
  ref,
) {
  return (
    <select ref={ref} className={cx(fieldBase, 'h-10 pr-8', className)} {...rest}>
      {children}
    </select>
  )
})

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...rest }, ref) {
    return <textarea ref={ref} className={cx(fieldBase, 'py-2 min-h-20', className)} {...rest} />
  },
)

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string
  hint?: string
  children: ReactNode
  className?: string
}) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1 block text-[13px] font-medium text-ink/80">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  )
}

/* ------------------------------------------------------------ Contenedores */

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('rounded-2xl border border-line bg-white', className)}>{children}</div>
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">{title}</h1>
        {subtitle && <p className="mt-1 text-[15px] text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function Empty({
  icon,
  title,
  text,
  action,
}: {
  icon?: ReactNode
  title: string
  text?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      {icon && <div className="mb-3 grid size-12 place-items-center rounded-full bg-lima/40 text-ink">{icon}</div>}
      <p className="font-medium">{title}</p>
      {text && <p className="mt-1 max-w-sm text-sm text-muted">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx('size-5 animate-spin text-muted', className)} />
}

export function Loading() {
  return (
    <div className="grid place-items-center py-20">
      <Spinner />
    </div>
  )
}

/* ------------------------------------------------------------------ Badges */

const tonos = {
  gris: 'bg-ink/5 text-ink/70',
  lima: 'bg-lima text-ink',
  verde: 'bg-verde/10 text-verde',
  ambar: 'bg-ambar/10 text-ambar',
  rojo: 'bg-rojo/10 text-rojo',
  negro: 'bg-ink text-white',
}

export function Badge({ tono = 'gris', children }: { tono?: keyof typeof tonos; children: ReactNode }) {
  return (
    <span className={cx('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', tonos[tono])}>
      {children}
    </span>
  )
}

/* ------------------------------------------------------------------- Modal */

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-ink/50 backdrop-blur-[2px]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx(
          'relative flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl',
          wide ? 'sm:max-w-5xl' : 'sm:max-w-lg',
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded-full p-1.5 text-muted hover:bg-ink/5" aria-label="Cerrar">
            <X className="size-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-5">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

/* ------------------------------------------------------------------ Avisos */

type Toast = { id: number; tipo: 'ok' | 'error'; texto: string }
let toasts: Toast[] = []
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function notify(texto: string, tipo: 'ok' | 'error' = 'ok') {
  const id = Date.now() + Math.random()
  toasts = [...toasts, { id, tipo, texto }]
  emit()
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id)
    emit()
  }, tipo === 'error' ? 6000 : 3500)
}

export function ToastHost() {
  const list = useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => toasts,
  )
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6">
      {list.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto flex max-w-md items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-sm text-white shadow-lg"
        >
          {t.tipo === 'ok' ? (
            <CheckCircle2 className="size-4 shrink-0 text-lima" />
          ) : (
            <AlertCircle className="size-4 shrink-0 text-red-400" />
          )}
          {t.texto}
        </div>
      ))}
    </div>,
    document.body,
  )
}

/* -------------------------------------------------------------- Confirmar */

type ConfirmReq = { titulo: string; texto: string; accion: string; peligro?: boolean; resolve: (v: boolean) => void }
let confirmReq: ConfirmReq | null = null
const confirmListeners = new Set<() => void>()

export function confirmar(opts: { titulo: string; texto: string; accion?: string; peligro?: boolean }) {
  return new Promise<boolean>((resolve) => {
    confirmReq = { accion: 'Confirmar', ...opts, resolve }
    confirmListeners.forEach((l) => l())
  })
}

export function ConfirmHost() {
  const [, force] = useState(0)
  useEffect(() => {
    const l = () => force((n) => n + 1)
    confirmListeners.add(l)
    return () => {
      confirmListeners.delete(l)
    }
  }, [])
  const req = confirmReq
  const close = (v: boolean) => {
    req?.resolve(v)
    confirmReq = null
    force((n) => n + 1)
  }
  return (
    <Modal
      open={Boolean(req)}
      onClose={() => close(false)}
      title={req?.titulo ?? ''}
      footer={
        <>
          <Button variant="secondary" onClick={() => close(false)}>
            Cancelar
          </Button>
          <Button variant={req?.peligro ? 'danger' : 'primary'} onClick={() => close(true)}>
            {req?.accion}
          </Button>
        </>
      }
    >
      <p className="text-[15px] text-ink/80">{req?.texto}</p>
    </Modal>
  )
}
