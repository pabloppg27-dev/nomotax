import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react'
import Documentos from '../components/Documentos'
import FilaTarea, { ordenar } from '../components/FilaTarea'
import TareaDetalle from '../components/TareaDetalle'
import { Boton, entrada, Vacio } from '../components/ui'
import * as db from '../lib/datos'
import { useStore } from '../lib/store'
import type { Tarea } from '../lib/tipos'
import { FormCliente } from './Clientes'

export default function ClienteFicha() {
  const { id } = useParams(); const ir = useNavigate()
  const { cliente, tareas, proyectos, recargar, cargando } = useStore()
  const c = cliente(id)
  const [editar, setEditar] = useState(false)
  const [abierta, setAbierta] = useState<Partial<Tarea> | null>(null)
  const [notas, setNotas] = useState('')
  useEffect(() => setNotas(c?.notas ?? ''), [c?.id, c?.notas])
  if (!c) return cargando ? null : <Vacio>Cliente no encontrado.</Vacio>

  const ts = tareas.filter((t) => t.cliente_id === c.id).sort(ordenar)
  const ps = proyectos.filter((p) => p.cliente_id === c.id)
  return (
    <>
      <Link to="/clientes" className="mb-3 inline-flex items-center gap-1 text-sm text-muted"><ArrowLeft size={16} /> Clientes</Link>
      <div className="mb-6 flex flex-wrap items-start gap-3">
        <div className="mr-auto min-w-0">
          <h1 className="text-2xl font-semibold">{c.nombre}</h1>
          <p className="text-sm text-muted">{[c.origen === 'nomotax' ? 'Cliente NomoTax' : 'Externo', c.tipo, c.pais, c.nif, c.email, c.telefono].filter(Boolean).join(' · ')}</p>
        </div>
        {c.origen === 'externo' && <>
          <Boton variante="suave" onClick={() => setEditar(true)}><Pencil size={16} /> Editar</Boton>
          <Boton variante="peligro" onClick={async () => { if (confirm('¿Borrar este cliente del CRM?')) { await db.borrarCliente(c.id); await recargar(); ir('/clientes') } }}><Trash2 size={16} /></Boton>
        </>}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <div className="mb-2 flex items-center"><h2 className="mr-auto font-semibold">Tareas</h2>
            <Boton variante="suave" onClick={() => setAbierta({ cliente_id: c.id })}><Plus size={16} /> Tarea</Boton></div>
          {ts.length === 0 ? <Vacio>Sin tareas.</Vacio> : <ul className="overflow-hidden rounded-xl border border-line">{ts.map((t) => <FilaTarea key={t.id} t={t} onAbrir={() => setAbierta(t)} />)}</ul>}
        </section>
        <div className="space-y-6">
          <section>
            <h2 className="mb-2 font-semibold">Proyectos</h2>
            {ps.length === 0 ? <Vacio>Sin proyectos.</Vacio> : (
              <ul className="overflow-hidden rounded-xl border border-line bg-white">
                {ps.map((p) => <li key={p.id} className="border-b border-line last:border-0"><Link to={`/proyectos/${p.id}`} className="block px-4 py-3 text-sm hover:bg-paper">{p.nombre} {p.estado === 'terminado' && <span className="text-muted">· terminado</span>}</Link></li>)}
              </ul>
            )}
          </section>
          <section>
            <h2 className="mb-2 font-semibold">Notas</h2>
            <textarea rows={4} className={entrada} value={notas} onChange={(e) => setNotas(e.target.value)}
              onBlur={async () => { if (notas !== (c.notas ?? '')) { await db.guardarCliente(c, { notas }); await recargar() } }} placeholder="Lo que quieras recordar de este cliente" />
          </section>
          <section>
            <h2 className="mb-2 font-semibold">Documentos</h2>
            <p className="mb-2 text-xs text-muted">Todos los del cliente: generales, de sus proyectos y de sus tareas.</p>
            <Documentos clave={c.id} recursivo destino={() => [c.nombre, '_General']} ver={[c.nombre]} />
          </section>
        </div>
      </div>
      {editar && <FormCliente cliente={c} onClose={() => setEditar(false)} />}
      {abierta && <TareaDetalle tarea={abierta} onClose={() => setAbierta(null)} />}
    </>
  )
}
