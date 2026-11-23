import { Check, Link2 } from 'lucide-react'
import * as db from '../lib/datos'
import { corta, vencida } from '../lib/fechas'
import { useStore } from '../lib/store'
import type { Tarea } from '../lib/tipos'
import { Punto } from './ui'

export default function FilaTarea({ t, onAbrir, sinProyecto }: { t: Tarea; onAbrir: () => void; sinProyecto?: boolean }) {
  const { cliente, proyecto, recargar } = useStore()
  const c = cliente(t.cliente_id); const p = sinProyecto ? undefined : proyecto(t.proyecto_id)
  async function marcar(e: React.MouseEvent) {
    e.stopPropagation()
    await db.cambiarTarea(t.id, { hecha: !t.hecha, hecha_at: t.hecha ? null : new Date().toISOString() }); await recargar()
  }
  return (
    <li onClick={onAbrir} className="flex cursor-pointer items-center gap-3 border-b border-line bg-white px-3 py-3 last:border-0 hover:bg-paper">
      <button onClick={marcar} aria-label="Hecha" className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${t.hecha ? 'border-ink bg-ink text-white' : 'border-muted'}`}>
        {t.hecha && <Check size={12} />}
      </button>
      <Punto p={t.prioridad} />
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm ${t.hecha ? 'text-muted line-through' : ''}`}>{t.titulo}</p>
        {(c || p) && <p className="truncate text-xs text-muted">{[c?.nombre, p?.nombre].filter(Boolean).join(' · ')}</p>}
      </div>
      {t.enlaces?.length > 0 && <Link2 size={14} className="shrink-0 text-muted" />}
      {t.fecha && <span className={`shrink-0 text-xs ${vencida(t.fecha) && !t.hecha ? 'font-semibold text-rojo' : 'text-muted'}`}>{corta(t.fecha)}</span>}
    </li>
  )
}

/** Orden: prioridad, luego fecha (sin fecha al final), luego creación */
const PESO = { alta: 0, media: 1, baja: 2 }
export const ordenar = (a: Tarea, b: Tarea) =>
  PESO[a.prioridad] - PESO[b.prioridad] || (a.fecha ?? '9999').localeCompare(b.fecha ?? '9999') || a.created_at.localeCompare(b.created_at)
