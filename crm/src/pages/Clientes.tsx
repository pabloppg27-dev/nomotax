import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Search } from 'lucide-react'
import { Boton, Campo, entrada, Modal, Vacio } from '../components/ui'
import * as db from '../lib/datos'
import { useStore } from '../lib/store'
import type { Cliente } from '../lib/tipos'

export default function Clientes() {
  const { clientes, tareas, proyectos } = useStore()
  const [q, setQ] = useState('')
  const [filtro, setFiltro] = useState<'todos' | 'nomotax' | 'externo'>('todos')
  const [nuevo, setNuevo] = useState(false)
  const n = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
  const lista = clientes.filter((c) => (filtro === 'todos' || c.origen === filtro) && n(`${c.nombre} ${c.nif ?? ''} ${c.email ?? ''}`).includes(n(q)))

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-2xl font-semibold">Clientes</h1>
        <Boton onClick={() => setNuevo(true)}><Plus size={16} /> Cliente externo</Boton>
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-0 flex-1">
          <Search size={16} className="absolute left-3 top-3 text-muted" />
          <input className={entrada + ' pl-9'} placeholder="Buscar" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex rounded-lg border border-line bg-white p-0.5 text-sm">
          {(['todos', 'nomotax', 'externo'] as const).map((f) => (
            <button key={f} onClick={() => setFiltro(f)} className={`rounded-md px-3 py-1.5 ${filtro === f ? 'bg-ink text-white' : ''}`}>
              {{ todos: 'Todos', nomotax: 'NomoTax', externo: 'Externos' }[f]}
            </button>
          ))}
        </div>
      </div>
      {lista.length === 0 ? <Vacio>No hay clientes.</Vacio> : (
        <ul className="overflow-hidden rounded-xl border border-line bg-white">
          {lista.map((c) => {
            const pend = tareas.filter((t) => t.cliente_id === c.id && !t.hecha).length
            const proy = proyectos.filter((p) => p.cliente_id === c.id && p.estado === 'activo').length
            return (
              <li key={c.id} className="border-b border-line last:border-0">
                <Link to={`/clientes/${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-paper">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{c.nombre}</p>
                    <p className="truncate text-xs text-muted">{[c.tipo, c.pais, c.nif, c.email].filter(Boolean).join(' · ') || '—'}</p>
                  </div>
                  {c.origen === 'externo' && <span className="shrink-0 rounded-full bg-paper px-2 py-0.5 text-[11px] text-muted">Externo</span>}
                  <span className="shrink-0 text-right text-xs text-muted">{pend} tareas{proy ? ` · ${proy} proy.` : ''}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
      {nuevo && <FormCliente onClose={() => setNuevo(false)} />}
    </>
  )
}

export function FormCliente({ cliente, onClose }: { cliente?: Cliente; onClose: () => void }) {
  const { recargar } = useStore()
  const [c, setC] = useState<Partial<Cliente>>(cliente ?? {})
  const set = (x: Partial<Cliente>) => setC((v) => ({ ...v, ...x }))
  async function guardar() {
    const { nombre, tipo, pais, nif, email, telefono, notas } = c
    const datos = { nombre: nombre?.trim(), tipo, pais, nif, email, telefono, notas }
    if (cliente) await db.guardarCliente(cliente, datos); else await db.crearCliente(datos)
    await recargar(); onClose()
  }
  const t = (k: keyof Cliente, etiqueta: string, ph = '') => (
    <Campo etiqueta={etiqueta}><input className={entrada} placeholder={ph} value={(c[k] as string) ?? ''} onChange={(e) => set({ [k]: e.target.value })} /></Campo>
  )
  return (
    <Modal titulo={cliente ? 'Editar cliente' : 'Nuevo cliente externo'} onClose={onClose}>
      <div className="space-y-4">
        {t('nombre', 'Nombre o razón social')}
        <div className="grid grid-cols-2 gap-4">{t('tipo', 'Tipo', 'LLC, SL, autónomo…')}{t('pais', 'País')}</div>
        <div className="grid grid-cols-2 gap-4">{t('nif', 'NIF / EIN')}{t('telefono', 'Teléfono')}</div>
        {t('email', 'Email')}
        <Campo etiqueta="Notas"><textarea rows={3} className={entrada} value={c.notas ?? ''} onChange={(e) => set({ notas: e.target.value })} /></Campo>
        <div className="flex justify-end border-t border-line pt-4"><Boton onClick={guardar} disabled={!c.nombre?.trim()}>Guardar</Boton></div>
      </div>
    </Modal>
  )
}
