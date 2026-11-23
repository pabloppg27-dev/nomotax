import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Boton, Campo, entrada, Modal, Vacio } from '../components/ui'
import { SelCliente } from '../components/Selectores'
import * as db from '../lib/datos'
import { useStore } from '../lib/store'
import type { Proyecto } from '../lib/tipos'

export const MODELOS_HABITUALES = ['303', '111', '115', '349', '130', '123', '216', '390', '190', '180', '347', '200', '100', '720']

export default function Proyectos() {
  const { proyectos, tareas, cliente } = useStore()
  const [nuevo, setNuevo] = useState(false)
  const [verTerminados, setVerTerminados] = useState(false)
  const lista = proyectos.filter((p) => (p.estado === 'terminado') === verTerminados).sort((a, b) => b.created_at.localeCompare(a.created_at))
  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-2xl font-semibold">Proyectos</h1>
        <button onClick={() => setVerTerminados(!verTerminados)} className="text-sm text-muted underline">{verTerminados ? 'Ver activos' : 'Ver terminados'}</button>
        <Boton onClick={() => setNuevo(true)}><Plus size={16} /> Nuevo</Boton>
      </div>
      {lista.length === 0 ? <Vacio>No hay proyectos {verTerminados ? 'terminados' : 'activos'}.</Vacio> : (
        <div className="grid gap-3 sm:grid-cols-2">
          {lista.map((p) => {
            const ts = tareas.filter((t) => t.proyecto_id === p.id)
            return (
              <Link key={p.id} to={`/proyectos/${p.id}`} className="rounded-xl border border-line bg-white p-4 hover:border-ink">
                <p className="text-xs text-muted">{p.tipo === 'impuestos' ? 'Impuestos' : cliente(p.cliente_id)?.nombre ?? 'Proyecto'}</p>
                <p className="font-medium">{p.nombre}</p>
                <p className="mt-2 text-xs text-muted">{p.tipo === 'impuestos' ? `Modelos ${p.modelos.join(', ')}` : `${ts.filter((t) => !t.hecha).length} tareas pendientes · ${ts.filter((t) => t.hecha).length} hechas`}</p>
              </Link>
            )
          })}
        </div>
      )}
      {nuevo && <NuevoProyecto onClose={() => setNuevo(false)} />}
    </>
  )
}

export function NuevoProyecto({ onClose, base }: { onClose: () => void; base?: Proyecto }) {
  const { recargar, clientes } = useStore(); const ir = useNavigate()
  const [p, setP] = useState<Partial<Proyecto>>(base ? { nombre: base.nombre + ' (copia)', tipo: base.tipo, modelos: base.modelos } : { tipo: 'normal', modelos: ['303', '111'] })
  const [otro, setOtro] = useState('')
  const [elegidos, setElegidos] = useState<Set<string>>(new Set(base ? [] : clientes.filter((c) => c.origen === 'nomotax').map((c) => c.id)))
  const set = (x: Partial<Proyecto>) => setP((v) => ({ ...v, ...x }))
  const alternar = (m: string) => set({ modelos: p.modelos!.includes(m) ? p.modelos!.filter((x) => x !== m) : [...p.modelos!, m] })

  async function guardar() {
    const nuevo = await db.crearProyecto({ nombre: p.nombre!.trim(), tipo: p.tipo, cliente_id: p.tipo === 'normal' ? p.cliente_id ?? null : null, modelos: p.tipo === 'impuestos' ? p.modelos : [], estado: 'activo' })
    if (p.tipo === 'impuestos') {
      if (base) { // duplicar: mismos clientes y modelos, todo pendiente (lo que no aplicaba se mantiene)
        for (const f of await db.filasImpuestos(base.id))
          await db.crearFila({ proyecto_id: nuevo.id, cliente_id: f.cliente_id, estados: Object.fromEntries(Object.entries(f.estados).map(([k, v]) => [k, v === 'na' ? 'na' : 'pendiente'])) })
      } else for (const id of elegidos) await db.crearFila({ proyecto_id: nuevo.id, cliente_id: id, estados: Object.fromEntries(p.modelos!.map((m) => [m, 'pendiente'])) })
    }
    await recargar(); onClose(); ir(`/proyectos/${nuevo.id}`)
  }

  return (
    <Modal titulo={base ? 'Duplicar proyecto' : 'Nuevo proyecto'} onClose={onClose}>
      <div className="space-y-4">
        {!base && <div className="grid grid-cols-2 gap-2">
          {(['normal', 'impuestos'] as const).map((t) => (
            <button key={t} onClick={() => set({ tipo: t })} className={`rounded-lg border p-3 text-left text-sm ${p.tipo === t ? 'border-ink bg-ink text-white' : 'border-line'}`}>
              <b>{t === 'normal' ? 'Proyecto' : 'Impuestos'}</b><br /><span className="opacity-70">{t === 'normal' ? 'Tareas y documentos' : 'Clientes × modelos'}</span>
            </button>
          ))}
        </div>}
        <Campo etiqueta="Nombre"><input className={entrada} value={p.nombre ?? ''} onChange={(e) => set({ nombre: e.target.value })} placeholder={p.tipo === 'impuestos' ? '4T 2026 España' : 'Constitución LLC John Smith'} autoFocus /></Campo>
        {p.tipo === 'normal' && <Campo etiqueta="Cliente"><SelCliente value={p.cliente_id} onChange={(cliente_id) => set({ cliente_id })} /></Campo>}
        {p.tipo === 'impuestos' && !base && <>
          <div>
            <span className="mb-1 block text-xs font-medium text-muted">Modelos</span>
            <div className="flex flex-wrap gap-1.5">
              {[...new Set([...MODELOS_HABITUALES, ...p.modelos!])].map((m) => (
                <button key={m} onClick={() => alternar(m)} className={`rounded-full border px-3 py-1 text-sm ${p.modelos!.includes(m) ? 'border-ink bg-ink text-white' : 'border-line'}`}>{m}</button>
              ))}
              <input className="w-20 rounded-full border border-line px-3 py-1 text-sm" placeholder="Otro" value={otro} onChange={(e) => setOtro(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && otro.trim()) { alternar(otro.trim()); setOtro('') } }} />
            </div>
          </div>
          <div>
            <span className="mb-1 flex text-xs font-medium text-muted">Clientes ({elegidos.size})
              <button className="ml-auto underline" onClick={() => setElegidos(new Set(elegidos.size ? [] : clientes.map((c) => c.id)))}>{elegidos.size ? 'Ninguno' : 'Todos'}</button></span>
            <ul className="max-h-56 overflow-y-auto rounded-lg border border-line">
              {clientes.map((c) => (
                <li key={c.id}><label className="flex items-center gap-2 px-3 py-2 text-sm">
                  <input type="checkbox" checked={elegidos.has(c.id)} onChange={() => { const s = new Set(elegidos); if (s.has(c.id)) s.delete(c.id); else s.add(c.id); setElegidos(s) }} />
                  {c.nombre}{c.origen === 'externo' && <span className="text-xs text-muted">externo</span>}
                </label></li>
              ))}
            </ul>
          </div>
        </>}
        {base && <p className="text-sm text-muted">Se copian los mismos clientes y modelos, todo en pendiente.</p>}
        <div className="flex justify-end border-t border-line pt-4"><Boton onClick={guardar} disabled={!p.nombre?.trim()}>Crear</Boton></div>
      </div>
    </Modal>
  )
}
