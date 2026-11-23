import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Check, Copy, Minus, Plus, Trash2, X } from 'lucide-react'
import Documentos, { rutaBase } from '../components/Documentos'
import FilaTarea, { ordenar } from '../components/FilaTarea'
import TareaDetalle from '../components/TareaDetalle'
import SeccionReuniones from '../components/SeccionReuniones'
import { Boton, entrada, Vacio } from '../components/ui'
import * as db from '../lib/datos'
import { useStore } from '../lib/store'
import type { EstadoModelo, FilaImpuestos, Proyecto, Tarea } from '../lib/tipos'
import { NuevoProyecto } from './Proyectos'

export default function ProyectoPagina() {
  const { id } = useParams(); const ir = useNavigate()
  const { proyecto, cliente, tareas, recargar, cargando } = useStore()
  const p = proyecto(id)
  const [abierta, setAbierta] = useState<Partial<Tarea> | null>(null)
  const [duplicar, setDuplicar] = useState(false)
  if (!p) return cargando ? null : <Vacio>Proyecto no encontrado.</Vacio>
  const c = cliente(p.cliente_id)
  const ts = tareas.filter((t) => t.proyecto_id === p.id).sort((a, b) => Number(a.hecha) - Number(b.hecha) || ordenar(a, b))

  return (
    <>
      <Link to="/proyectos" className="mb-3 inline-flex items-center gap-1 text-sm text-muted"><ArrowLeft size={16} /> Proyectos</Link>
      <div className="mb-6 flex flex-wrap items-start gap-2">
        <div className="mr-auto min-w-0">
          <h1 className="text-2xl font-semibold">{p.nombre}</h1>
          {c && <Link to={`/clientes/${c.id}`} className="text-sm text-muted hover:underline">{c.nombre}</Link>}
        </div>
        {p.tipo === 'impuestos' && <Boton variante="suave" onClick={() => setDuplicar(true)}><Copy size={16} /> Duplicar</Boton>}
        <Boton variante="suave" onClick={async () => { await db.cambiarProyecto(p.id, { estado: p.estado === 'activo' ? 'terminado' : 'activo' }); await recargar() }}>
          {p.estado === 'activo' ? 'Terminar' : 'Reactivar'}
        </Boton>
        <Boton variante="peligro" onClick={async () => { if (confirm('¿Borrar el proyecto? Las tareas se quedan sin proyecto.')) { await db.borrarProyecto(p.id); await recargar(); ir('/proyectos') } }}><Trash2 size={16} /></Boton>
      </div>

      {p.tipo === 'impuestos' && <TablaImpuestos p={p} />}

      <div className={`grid gap-6 lg:grid-cols-2 ${p.tipo === 'impuestos' ? 'mt-8' : ''}`}>
        <section>
          <div className="mb-2 flex items-center"><h2 className="mr-auto font-semibold">Tareas</h2>
            <Boton variante="suave" onClick={() => setAbierta({ proyecto_id: p.id, cliente_id: p.cliente_id })}><Plus size={16} /> Tarea</Boton></div>
          {ts.length === 0 ? <Vacio>Sin tareas en este proyecto.</Vacio> : <ul className="overflow-hidden rounded-xl border border-line">{ts.map((t) => <FilaTarea key={t.id} t={t} sinProyecto onAbrir={() => setAbierta(t)} />)}</ul>}
        </section>
        <div className="space-y-6">
        <SeccionReuniones filtro={(r) => r.proyecto_id === p.id} nueva={{ proyecto_id: p.id, cliente_id: p.cliente_id }} />
        <section>
          <h2 className="mb-2 font-semibold">Documentos</h2>
          <Documentos clave={p.id + (c?.id ?? '')} recursivo destino={() => rutaBase(c?.nombre, p.nombre)} />
        </section>
        </div>
      </div>
      {abierta && <TareaDetalle tarea={abierta} onClose={() => setAbierta(null)} />}
      {duplicar && <NuevoProyecto base={p} onClose={() => setDuplicar(false)} />}
    </>
  )
}

const SIGUIENTE: Record<EstadoModelo, EstadoModelo> = { pendiente: 'hecho', hecho: 'na', na: 'pendiente' }

function TablaImpuestos({ p }: { p: Proyecto }) {
  const { cliente, clientes, recargar } = useStore()
  const [filas, setFilas] = useState<FilaImpuestos[]>([])
  const [soloPend, setSoloPend] = useState(false)
  const [anadir, setAnadir] = useState('')
  const [modelo, setModelo] = useState('')
  const cargar = useCallback(async () => setFilas(await db.filasImpuestos(p.id)), [p.id])
  useEffect(() => { void cargar() }, [cargar])

  const estado = (f: FilaImpuestos, m: string): EstadoModelo => f.estados[m] ?? 'pendiente'
  async function poner(f: FilaImpuestos, estados: Record<string, EstadoModelo>) {
    setFilas((x) => x.map((y) => (y.id === f.id ? { ...y, estados } : y)))
    await db.cambiarFila(f.id, { estados })
  }
  const total = filas.reduce((n, f) => n + p.modelos.filter((m) => estado(f, m) !== 'na').length, 0)
  const hechos = filas.reduce((n, f) => n + p.modelos.filter((m) => estado(f, m) === 'hecho').length, 0)
  const pendiente = (f: FilaImpuestos) => p.modelos.some((m) => estado(f, m) === 'pendiente')
  const visibles = filas.filter((f) => !soloPend || pendiente(f))
    .sort((a, b) => Number(pendiente(b)) - Number(pendiente(a)) || (cliente(a.cliente_id)?.nombre ?? '').localeCompare(cliente(b.cliente_id)?.nombre ?? '', 'es'))
  const fuera = clientes.filter((c) => !filas.some((f) => f.cliente_id === c.id))

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="min-w-40 flex-1">
          <div className="mb-1 flex justify-between text-sm"><span><b>{hechos}</b> de {total} hechos</span><span className="text-muted">{filas.filter(pendiente).length} clientes con pendientes</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-line"><div className="h-full bg-lima" style={{ width: `${total ? (hechos / total) * 100 : 0}%` }} /></div>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={soloPend} onChange={(e) => setSoloPend(e.target.checked)} /> Solo lo que falta</label>
      </div>
      <div className="overflow-x-auto rounded-xl border border-line bg-white">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-line bg-paper text-xs text-muted">
            <th className="sticky left-0 bg-paper px-3 py-2 text-left font-medium">Cliente</th>
            {p.modelos.map((m) => <th key={m} className="px-2 py-2 font-medium">{m}</th>)}
            <th className="w-8" />
          </tr></thead>
          <tbody>
            {visibles.map((f) => (
              <tr key={f.id} className="border-b border-line last:border-0">
                <td className="sticky left-0 max-w-44 truncate bg-white px-3 py-2">
                  <button title="Marcar todo hecho" onClick={() => poner(f, Object.fromEntries(p.modelos.map((m) => [m, estado(f, m) === 'na' ? 'na' : 'hecho'])))} className={`text-left hover:underline ${pendiente(f) ? '' : 'text-muted line-through'}`}>
                    {cliente(f.cliente_id)?.nombre ?? '—'}
                  </button>
                </td>
                {p.modelos.map((m) => {
                  const e = estado(f, m)
                  return (
                    <td key={m} className="px-2 py-1.5 text-center">
                      <button onClick={() => poner(f, { ...f.estados, [m]: SIGUIENTE[e] })} title={e === 'na' ? 'No aplica' : e}
                        className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${e === 'hecho' ? 'bg-lima' : e === 'na' ? 'text-line' : 'border border-line hover:border-ink'}`}>
                        {e === 'hecho' ? <Check size={16} /> : e === 'na' ? <Minus size={16} /> : null}
                      </button>
                    </td>
                  )
                })}
                <td className="pr-2"><button onClick={async () => { if (confirm('¿Quitar este cliente del proyecto?')) { await db.borrarFila(f.id); await cargar() } }} className="text-muted hover:text-rojo"><X size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">Clic en una casilla: vacío = pendiente → ✓ hecho → – no aplica. Clic en el nombre = todo hecho.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <select className={entrada + ' max-w-xs'} value={anadir} onChange={async (e) => {
          const id = e.target.value; setAnadir(''); if (!id) return
          await db.crearFila({ proyecto_id: p.id, cliente_id: id, estados: Object.fromEntries(p.modelos.map((m) => [m, 'pendiente'])) }); await cargar()
        }}>
          <option value="">+ Añadir cliente</option>
          {fuera.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <input className={entrada + ' w-36'} placeholder="+ Modelo" value={modelo} onChange={(e) => setModelo(e.target.value)}
          onKeyDown={async (e) => { if (e.key === 'Enter' && modelo.trim() && !p.modelos.includes(modelo.trim())) { await db.cambiarProyecto(p.id, { modelos: [...p.modelos, modelo.trim()] }); setModelo(''); await recargar() } }} />
      </div>
    </section>
  )
}
