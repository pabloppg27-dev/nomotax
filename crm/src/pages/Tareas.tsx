import { useState } from 'react'
import { ChevronDown, Flame, Plus } from 'lucide-react'
import FilaTarea, { ordenar } from '../components/FilaTarea'
import TareaDetalle from '../components/TareaDetalle'
import { SelCliente } from '../components/Selectores'
import { Boton, NOMBRE_PRIORIDAD, Punto, Vacio } from '../components/ui'
import { useStore } from '../lib/store'
import { hoy } from '../lib/fechas'
import { PRIORIDADES, type Tarea } from '../lib/tipos'

export default function Tareas() {
  const { tareas, cargando } = useStore()
  const [abierta, setAbierta] = useState<Partial<Tarea> | null>(null)
  const [cliente, setCliente] = useState<string | null>(null)
  const [verHechas, setVerHechas] = useState(false)
  const lista = tareas.filter((t) => !cliente || t.cliente_id === cliente).sort(ordenar)
  const pendientes = lista.filter((t) => !t.hecha)
  // «Hoy sí o sí»: con fecha de hoy (o atrasadas). Solo aparece si hay alguna.
  const deHoy = pendientes.filter((t) => t.fecha && t.fecha <= hoy())
  const resto = pendientes.filter((t) => !deHoy.includes(t))
  const hechas = lista.filter((t) => t.hecha).sort((a, b) => (b.hecha_at ?? '').localeCompare(a.hecha_at ?? ''))

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-2xl font-semibold">Tareas</h1>
        <div className="w-full sm:w-56"><SelCliente value={cliente} onChange={setCliente} /></div>
        <Boton onClick={() => setAbierta({ cliente_id: cliente })}><Plus size={16} /> Nueva</Boton>
      </div>
      {cargando ? null : pendientes.length === 0 ? <Vacio>Nada pendiente. Pulsa «Dictar» para crear una tarea.</Vacio> : (
        <div className="space-y-6">
          {deHoy.length > 0 && (
            <section className="rounded-2xl bg-ink p-3 text-white">
              <h2 className="mb-2 flex items-center gap-2 px-1 text-sm font-semibold"><Flame size={16} className="text-lima" /> Hoy sí o sí <span className="font-normal text-white/50">{deHoy.length}</span></h2>
              <ul className="overflow-hidden rounded-xl text-ink">{deHoy.map((t) => <FilaTarea key={t.id} t={t} onAbrir={() => setAbierta(t)} />)}</ul>
            </section>
          )}
          {PRIORIDADES.map((p) => {
            const g = resto.filter((t) => t.prioridad === p)
            if (!g.length) return null
            return (
              <section key={p}>
                <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Punto p={p} /> Prioridad {NOMBRE_PRIORIDAD[p].toLowerCase()} <span className="font-normal text-muted">{g.length}</span></h2>
                <ul className="overflow-hidden rounded-xl border border-line">{g.map((t) => <FilaTarea key={t.id} t={t} onAbrir={() => setAbierta(t)} />)}</ul>
              </section>
            )
          })}
        </div>
      )}
      {hechas.length > 0 && (
        <section className="mt-8">
          <button onClick={() => setVerHechas(!verHechas)} className="mb-2 flex items-center gap-1 text-sm text-muted">
            <ChevronDown size={16} className={verHechas ? '' : '-rotate-90'} /> Hechas ({hechas.length})
          </button>
          {verHechas && <ul className="overflow-hidden rounded-xl border border-line">{hechas.map((t) => <FilaTarea key={t.id} t={t} onAbrir={() => setAbierta(t)} />)}</ul>}
        </section>
      )}
      {abierta && <TareaDetalle tarea={abierta} onClose={() => setAbierta(null)} />}
    </>
  )
}
