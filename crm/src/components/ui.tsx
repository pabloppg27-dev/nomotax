import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import type { Prioridad } from '../lib/tipos'

export function Modal({ titulo, onClose, children, ancho = 'max-w-lg' }: { titulo: string; onClose: () => void; children: ReactNode; ancho?: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`flex max-h-[92vh] w-full ${ancho} flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl`}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="font-semibold">{titulo}</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-muted hover:bg-paper" aria-label="Cerrar"><X size={20} /></button>
        </div>
        <div className="overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  )
}

export function Campo({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return <label className="block"><span className="mb-1 block text-xs font-medium text-muted">{etiqueta}</span>{children}</label>
}

export const entrada = 'w-full rounded-lg border border-line bg-white px-3 py-2 outline-none focus:border-ink'

export function Boton({ children, variante = 'negro', className = '', ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variante?: 'negro' | 'lima' | 'suave' | 'peligro' }) {
  const v = {
    negro: 'bg-ink text-white hover:bg-black',
    lima: 'bg-lima text-ink hover:brightness-95',
    suave: 'bg-white border border-line hover:bg-paper',
    peligro: 'text-rojo hover:bg-red-50',
  }[variante]
  return <button {...p} className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 ${v} ${className}`}>{children}</button>
}

export const COLOR_PRIORIDAD: Record<Prioridad, string> = { alta: 'bg-rojo', media: 'bg-ambar', baja: 'bg-muted' }
export const NOMBRE_PRIORIDAD: Record<Prioridad, string> = { alta: 'Alta', media: 'Media', baja: 'Baja' }

export function Punto({ p }: { p: Prioridad }) {
  return <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${COLOR_PRIORIDAD[p]}`} />
}

export function Vacio({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">{children}</p>
}
