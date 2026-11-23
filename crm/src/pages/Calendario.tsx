import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import TareaDetalle from '../components/TareaDetalle'
import { COLOR_PRIORIDAD } from '../components/ui'
import { hoy, iso } from '../lib/fechas'
import { useStore } from '../lib/store'
import type { Tarea } from '../lib/tipos'

export default function Calendario() {
  const { tareas } = useStore()
  const [mes, setMes] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [abierta, setAbierta] = useState<Partial<Tarea> | null>(null)
  const inicio = new Date(mes); inicio.setDate(1 - ((mes.getDay() + 6) % 7)) // lunes
  const dias = Array.from({ length: 42 }, (_, i) => { const d = new Date(inicio); d.setDate(d.getDate() + i); return d })
  const porDia = new Map<string, Tarea[]>()
  for (const t of tareas) if (t.fecha) porDia.set(t.fecha, [...(porDia.get(t.fecha) ?? []), t])
  const mover = (n: number) => setMes(new Date(mes.getFullYear(), mes.getMonth() + n, 1))

  return (
    <>
      <div className="mb-5 flex items-center gap-2">
        <h1 className="mr-auto text-2xl font-semibold capitalize">{mes.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}</h1>
        <button onClick={() => mover(-1)} className="rounded-lg border border-line bg-white p-2"><ChevronLeft size={18} /></button>
        <button onClick={() => { const d = new Date(); setMes(new Date(d.getFullYear(), d.getMonth(), 1)) }} className="rounded-lg border border-line bg-white px-3 py-1.5 text-sm">Hoy</button>
        <button onClick={() => mover(1)} className="rounded-lg border border-line bg-white p-2"><ChevronRight size={18} /></button>
      </div>
      <div className="grid grid-cols-7 overflow-hidden rounded-xl border border-line bg-line gap-px">
        {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d) => <div key={d} className="bg-paper py-1 text-center text-xs text-muted">{d}</div>)}
        {dias.map((d) => {
          const k = iso(d); const ts = (porDia.get(k) ?? []).sort((a, b) => Number(a.hecha) - Number(b.hecha))
          return (
            <div key={k} onClick={() => setAbierta({ fecha: k })} className={`min-h-16 cursor-pointer bg-white p-1 sm:min-h-24 ${d.getMonth() !== mes.getMonth() ? 'opacity-40' : ''}`}>
              <span className={`mb-1 inline-block rounded-full px-1.5 text-xs ${k === hoy() ? 'bg-ink text-lima' : 'text-muted'}`}>{d.getDate()}</span>
              <div className="space-y-0.5">
                {ts.map((t) => (
                  <button key={t.id} onClick={(e) => { e.stopPropagation(); setAbierta(t) }}
                    className={`flex w-full items-center gap-1 truncate rounded px-1 text-left text-[11px] ${t.hecha ? 'text-muted line-through' : 'bg-paper'}`}>
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${COLOR_PRIORIDAD[t.prioridad]}`} />
                    <span className="hidden truncate sm:inline">{t.titulo}</span>
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
      {abierta && <TareaDetalle tarea={abierta} onClose={() => setAbierta(null)} />}
    </>
  )
}
