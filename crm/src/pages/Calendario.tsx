import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import TareaDetalle from '../components/TareaDetalle'
import ReunionDetalle from '../components/ReunionDetalle'
import { diaLocal, hora } from '../lib/agenda'
import { COLOR_PRIORIDAD } from '../components/ui'
import { hoy, iso } from '../lib/fechas'
import { useStore } from '../lib/store'
import type { Reunion, Tarea } from '../lib/tipos'

export default function Calendario() {
  const { tareas, reuniones } = useStore()
  const [q] = useSearchParams(); const marcado = q.get('dia') // «Ver en calendario» desde una reunión
  const [mes, setMes] = useState(() => { const d = marcado ? new Date(marcado + 'T12:00') : new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  useEffect(() => { if (marcado) { const d = new Date(marcado + 'T12:00'); setMes(new Date(d.getFullYear(), d.getMonth(), 1)) } }, [marcado])
  const [abierta, setAbierta] = useState<Partial<Tarea> | null>(null)
  const [reunion, setReunion] = useState<Reunion | null>(null)
  const reunionesDia = new Map<string, Reunion[]>()
  for (const r of reuniones) { const k = diaLocal(r.inicio); reunionesDia.set(k, [...(reunionesDia.get(k) ?? []), r]) }
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
            <div key={k} onClick={() => setAbierta({ fecha: k })} className={`min-h-16 cursor-pointer bg-white p-1 sm:min-h-24 ${d.getMonth() !== mes.getMonth() ? 'opacity-40' : ''} ${k === marcado ? 'ring-2 ring-inset ring-ink' : ''}`}>
              <span className={`mb-1 inline-block rounded-full px-1.5 text-xs ${k === hoy() ? 'bg-ink text-lima' : 'text-muted'}`}>{d.getDate()}</span>
              <div className="space-y-0.5">
                {(reunionesDia.get(k) ?? []).map((r) => (
                  <button key={r.id} onClick={(e) => { e.stopPropagation(); setReunion(r) }}
                    className="flex w-full items-center gap-1 truncate rounded bg-lima/60 px-1 text-left text-[11px] font-medium">
                    <span className="shrink-0">{hora(r.inicio)}</span>
                    <span className="hidden truncate sm:inline">{r.titulo}</span>
                  </button>
                ))}
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
      <p className="mt-2 flex items-center gap-2 text-xs text-muted"><span className="inline-block h-2.5 w-4 rounded bg-lima/60" /> Reuniones · los puntos de color son tareas</p>
      {reunion && <ReunionDetalle reunion={reunion} onClose={() => setReunion(null)} />}
      {abierta && <TareaDetalle tarea={abierta} onClose={() => setAbierta(null)} />}
    </>
  )
}
