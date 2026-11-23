import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarDays, Mic, Plus, RefreshCw } from 'lucide-react'
import { sincronizar } from '../lib/agenda'
import * as db from '../lib/datos'
import Dictar from '../components/Dictar'
import FilaReunion from '../components/FilaReunion'
import ReunionDetalle, { type BorradorReunion } from '../components/ReunionDetalle'
import { Boton, Vacio } from '../components/ui'
import { useStore } from '../lib/store'

export default function Reuniones() {
  const { reuniones, clientes, recargar, cargando } = useStore()
  const [sync, setSync] = useState<string | null>(null)
  const [girando, setGirando] = useState(false)
  async function traer() {
    setGirando(true); setSync(null)
    try { const n = await sincronizar(reuniones, clientes, db); if (n) await recargar(); setSync(n ? `${n} reuniones traídas de Google Calendar` : null) }
    catch (e) { setSync((e as Error).message) } finally { setGirando(false) }
  }
  // Al entrar, trae lo nuevo de Google Calendar
  useEffect(() => { if (!cargando) void traer() }, [cargando]) // eslint-disable-line react-hooks/exhaustive-deps
  const ir = useNavigate()
  const [abierta, setAbierta] = useState<BorradorReunion | null>(null)
  const [dictando, setDictando] = useState(false)
  const ahora = Date.now()
  const fin = (r: { inicio: string; duracion: number }) => new Date(r.inicio).getTime() + r.duracion * 60000
  const proximas = reuniones.filter((r) => fin(r) >= ahora)
  const pasadas = reuniones.filter((r) => fin(r) < ahora).reverse()
  const [verPasadas, setVerPasadas] = useState(false)

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-2xl font-semibold">Reuniones</h1>
        <Boton variante="suave" onClick={traer} disabled={girando} aria-label="Sincronizar con Google Calendar"><RefreshCw size={16} className={girando ? 'animate-spin' : ''} /></Boton>
        <Boton variante="suave" onClick={() => ir('/calendario')}><CalendarDays size={16} /> Calendario</Boton>
        <Boton variante="suave" onClick={() => setAbierta({})}><Plus size={16} /> Nueva</Boton>
        <Boton variante="lima" onClick={() => setDictando(true)}><Mic size={16} /> Dictar</Boton>
      </div>
      {sync && <p className="mb-3 text-sm text-muted">{sync}</p>}
      <h2 className="mb-2 font-semibold">Próximas</h2>
      {proximas.length === 0 ? <Vacio>No tienes reuniones. Dicta algo como «Reunión con Xapa el jueves a las 11 para revisar el IVA».</Vacio>
        : <ul className="overflow-hidden rounded-xl border border-line">{proximas.map((r) => <FilaReunion key={r.id} r={r} onAbrir={() => setAbierta(r)} />)}</ul>}
      {pasadas.length > 0 && (
        <section className="mt-6">
          <button onClick={() => setVerPasadas(!verPasadas)} className="mb-2 font-semibold">Pasadas ({pasadas.length}) {verPasadas ? '▾' : '▸'}</button>
          {verPasadas && <ul className="overflow-hidden rounded-xl border border-line">{pasadas.map((r) => <FilaReunion key={r.id} r={r} onAbrir={() => setAbierta(r)} />)}</ul>}
        </section>
      )}
      {abierta && <ReunionDetalle reunion={abierta} onClose={() => setAbierta(null)} />}
      {dictando && <Dictar onClose={() => setDictando(false)} />}
    </>
  )
}
