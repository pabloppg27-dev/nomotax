import { Video } from 'lucide-react'
import { corta } from '../lib/fechas'
import { diaLocal, hora } from '../lib/agenda'
import { useStore } from '../lib/store'
import type { Reunion } from '../lib/tipos'

export default function FilaReunion({ r, onAbrir }: { r: Reunion; onAbrir: () => void }) {
  const { cliente, proyecto } = useStore()
  const c = cliente(r.cliente_id); const p = proyecto(r.proyecto_id)
  const pasada = new Date(r.inicio).getTime() + r.duracion * 60000 < Date.now()
  return (
    <li className={`flex items-center gap-3 border-b border-line bg-white px-4 py-3 last:border-0 ${pasada ? 'opacity-60' : ''}`}>
      <button onClick={onAbrir} className="min-w-0 flex-1 text-left">
        <p className="truncate font-medium">{r.titulo}</p>
        <p className="flex flex-wrap gap-x-3 text-xs text-muted">
          <span className="capitalize">{corta(diaLocal(r.inicio))} · {hora(r.inicio)} · {r.duracion} min</span>
          {c && <span>👤 {c.nombre}</span>}{p && <span>📁 {p.nombre}</span>}
        </p>
      </button>
      {r.meet_url && !pasada && (
        <a href={r.meet_url} target="_blank" rel="noreferrer" className="flex shrink-0 items-center gap-1 rounded-lg bg-lima px-3 py-1.5 text-xs font-semibold text-ink">
          <Video size={14} /> Meet
        </a>
      )}
    </li>
  )
}

export const ordenarReuniones = (a: Reunion, b: Reunion) => a.inicio.localeCompare(b.inicio)
