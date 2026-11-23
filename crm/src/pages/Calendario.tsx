import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Plus, Video } from 'lucide-react'
import TareaDetalle from '../components/TareaDetalle'
import ReunionDetalle, { type BorradorReunion } from '../components/ReunionDetalle'
import { diaLocal, hora } from '../lib/agenda'
import { COLOR_PRIORIDAD } from '../components/ui'
import { hoy, iso } from '../lib/fechas'
import { useStore } from '../lib/store'
import type { Reunion, Tarea } from '../lib/tipos'

type Vista = 'mes' | 'semana' | 'dia'
const VISTAS: { v: Vista; t: string }[] = [{ v: 'mes', t: 'Mes' }, { v: 'semana', t: 'Semana' }, { v: 'dia', t: 'Día' }]

const fecha = (k: string) => new Date(k + 'T12:00')
const sumar = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const lunesDe = (d: Date) => sumar(d, -((d.getDay() + 6) % 7))
const finde = (d: Date) => d.getDay() === 0 || d.getDay() === 6
/** Día laborable más cercano hacia delante (o hacia atrás si dir = -1) */
const laborable = (d: Date, dir = 1) => { let x = d; while (finde(x)) x = sumar(x, dir); return x }

export default function Calendario() {
  const { tareas, reuniones } = useStore()
  const [q] = useSearchParams(); const marcado = q.get('dia') // «Ver en calendario» desde una reunión
  const [vista, setVista] = useState<Vista>(() => (localStorage.getItem('crm-vista-cal') as Vista) || 'mes')
  const [ref, setRef] = useState(() => (marcado ? fecha(marcado) : fecha(hoy())))
  useEffect(() => { if (marcado) setRef(fecha(marcado)) }, [marcado])
  useEffect(() => localStorage.setItem('crm-vista-cal', vista), [vista])
  const [abierta, setAbierta] = useState<Partial<Tarea> | null>(null)
  const [reunion, setReunion] = useState<BorradorReunion | null>(null)

  const reunionesDia = new Map<string, Reunion[]>()
  for (const r of reuniones) { const k = diaLocal(r.inicio); reunionesDia.set(k, [...(reunionesDia.get(k) ?? []), r]) }
  const tareasDia = new Map<string, Tarea[]>()
  for (const t of tareas) if (t.fecha) tareasDia.set(t.fecha, [...(tareasDia.get(t.fecha) ?? []), t])
  const rs = (k: string) => (reunionesDia.get(k) ?? []).sort((a, b) => a.inicio.localeCompare(b.inicio))
  const ts = (k: string) => (tareasDia.get(k) ?? []).sort((a, b) => Number(a.hecha) - Number(b.hecha))

  function mover(n: number) {
    if (vista === 'mes') setRef(new Date(ref.getFullYear(), ref.getMonth() + n, 1, 12))
    else if (vista === 'semana') setRef(sumar(lunesDe(ref), 7 * n))
    else setRef(laborable(sumar(ref, n), n))
  }
  const titulo = vista === 'mes' ? ref.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
    : vista === 'semana' ? `${lunesDe(ref).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} – ${sumar(lunesDe(ref), 4).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}`
      : ref.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
  const irDia = (k: string) => { setRef(fecha(k)); setVista('dia') }
  const manana = laborable(sumar(fecha(hoy()), 1))

  const chipReunion = (r: Reunion, largo = false) => (
    <button key={r.id} onClick={(e) => { e.stopPropagation(); setReunion(r) }}
      className="flex w-full items-center gap-1 truncate rounded bg-lima/60 px-1 text-left text-[11px] font-medium">
      <span className="shrink-0">{hora(r.inicio)}</span>
      <span className={`${largo ? '' : 'hidden sm:inline'} truncate`}>{r.titulo}</span>
    </button>
  )
  const chipTarea = (t: Tarea, largo = false) => (
    <button key={t.id} onClick={(e) => { e.stopPropagation(); setAbierta(t) }}
      className={`flex w-full items-center gap-1 truncate rounded px-1 text-left text-[11px] ${t.hecha ? 'text-muted line-through' : 'bg-paper'}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${COLOR_PRIORIDAD[t.prioridad]}`} />
      <span className={`${largo ? '' : 'hidden sm:inline'} truncate`}>{t.titulo}</span>
    </button>
  )
  const boton = 'rounded-lg border border-line bg-white'

  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <h1 className="mr-auto truncate text-xl font-semibold capitalize sm:text-2xl">{titulo}</h1>
        <button onClick={() => mover(-1)} className={`${boton} p-2`} aria-label="Anterior"><ChevronLeft size={18} /></button>
        <button onClick={() => mover(1)} className={`${boton} p-2`} aria-label="Siguiente"><ChevronRight size={18} /></button>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-line bg-white p-0.5">
          {VISTAS.map(({ v, t }) => (
            <button key={v} onClick={() => setVista(v)} className={`rounded-md px-3 py-1 text-sm ${vista === v ? 'bg-ink text-white' : ''}`}>{t}</button>
          ))}
        </div>
        <button onClick={() => setRef(fecha(hoy()))} className={`${boton} px-3 py-1.5 text-sm`}>Hoy</button>
        <button onClick={() => { setRef(manana); setVista('dia') }} className={`${boton} px-3 py-1.5 text-sm`}>{manana.getDay() === 1 && fecha(hoy()).getDay() !== 0 ? 'Lunes' : 'Mañana'}</button>
      </div>

      {vista === 'mes' && (() => {
        const ini = lunesDe(new Date(ref.getFullYear(), ref.getMonth(), 1, 12))
        const dias = Array.from({ length: 42 }, (_, i) => sumar(ini, i))
        return (
          <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-line bg-line">
            {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d) => <div key={d} className="bg-paper py-1 text-center text-xs text-muted">{d}</div>)}
            {dias.map((d) => {
              const k = iso(d)
              return (
                <div key={k} onClick={() => setAbierta({ fecha: k })} className={`min-h-16 cursor-pointer bg-white p-1 sm:min-h-24 ${d.getMonth() !== ref.getMonth() ? 'opacity-40' : ''} ${k === marcado ? 'ring-2 ring-inset ring-ink' : ''}`}>
                  <button onClick={(e) => { e.stopPropagation(); irDia(k) }} className={`mb-1 inline-block rounded-full px-1.5 text-xs ${k === hoy() ? 'bg-ink text-lima' : 'text-muted hover:bg-paper'}`}>{d.getDate()}</button>
                  <div className="space-y-0.5">{rs(k).map((r) => chipReunion(r))}{ts(k).map((t) => chipTarea(t))}</div>
                </div>
              )
            })}
          </div>
        )
      })()}

      {vista === 'semana' && (
        <div className="grid grid-cols-5 gap-px overflow-hidden rounded-xl border border-line bg-line">
          {Array.from({ length: 5 }, (_, i) => sumar(lunesDe(ref), i)).map((d) => {
            const k = iso(d)
            return (
              <div key={k} onClick={() => setAbierta({ fecha: k })} className={`min-h-64 min-w-0 cursor-pointer bg-white p-1.5 ${k === marcado ? 'ring-2 ring-inset ring-ink' : ''}`}>
                <button onClick={(e) => { e.stopPropagation(); irDia(k) }} className="mb-2 flex w-full flex-col items-center">
                  <span className="text-[11px] uppercase text-muted">{d.toLocaleDateString('es-ES', { weekday: 'short' })}</span>
                  <span className={`rounded-full px-2 text-sm font-semibold ${k === hoy() ? 'bg-ink text-lima' : ''}`}>{d.getDate()}</span>
                </button>
                <div className="space-y-1">{rs(k).map((r) => chipReunion(r, true))}{ts(k).map((t) => chipTarea(t, true))}</div>
              </div>
            )
          })}
        </div>
      )}

      {vista === 'dia' && (() => {
        const k = iso(ref); const reus = rs(k); const tars = ts(k)
        return (
          <div className="space-y-5">
            <section>
              <div className="mb-2 flex items-center"><h2 className="mr-auto font-semibold">Reuniones</h2>
                <button onClick={() => setReunion({ fecha: k })} className={`${boton} flex items-center gap-1 px-3 py-1.5 text-sm`}><Plus size={14} /> Reunión</button></div>
              {reus.length === 0 ? <p className="rounded-xl border border-dashed border-line p-4 text-center text-sm text-muted">Sin reuniones.</p> : (
                <ul className="overflow-hidden rounded-xl border border-line bg-white">
                  {reus.map((r) => (
                    <li key={r.id} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-0">
                      <span className="w-12 shrink-0 font-semibold">{hora(r.inicio)}</span>
                      <button onClick={() => setReunion(r)} className="min-w-0 flex-1 text-left">
                        <p className="truncate font-medium">{r.titulo}</p><p className="text-xs text-muted">{r.duracion} min</p>
                      </button>
                      {r.meet_url && <a href={r.meet_url} target="_blank" rel="noreferrer" className="flex shrink-0 items-center gap-1 rounded-lg bg-lima px-3 py-1.5 text-xs font-semibold"><Video size={14} /> Meet</a>}
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section>
              <div className="mb-2 flex items-center"><h2 className="mr-auto font-semibold">Tareas</h2>
                <button onClick={() => setAbierta({ fecha: k })} className={`${boton} flex items-center gap-1 px-3 py-1.5 text-sm`}><Plus size={14} /> Tarea</button></div>
              {tars.length === 0 ? <p className="rounded-xl border border-dashed border-line p-4 text-center text-sm text-muted">Sin tareas.</p>
                : <div className="space-y-1 rounded-xl border border-line bg-white p-2">{tars.map((t) => <div key={t.id} className="text-sm">{chipTarea(t, true)}</div>)}</div>}
            </section>
          </div>
        )
      })()}

      {vista !== 'dia' && <p className="mt-2 flex items-center gap-2 text-xs text-muted"><span className="inline-block h-2.5 w-4 rounded bg-lima/60" /> Reuniones · los puntos de color son tareas · toca un día para verlo entero</p>}
      {reunion && <ReunionDetalle reunion={reunion} onClose={() => setReunion(null)} />}
      {abierta && <TareaDetalle tarea={abierta} onClose={() => setAbierta(null)} />}
    </>
  )
}
