import { useStore } from '../lib/store'
import { PRIORIDADES, type Prioridad } from '../lib/tipos'
import { entrada, NOMBRE_PRIORIDAD } from './ui'

export function SelCliente({ value, onChange }: { value?: string | null; onChange: (v: string | null) => void }) {
  const { clientes } = useStore()
  return (
    <select className={entrada} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">— Sin cliente —</option>
      {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}{c.origen === 'externo' ? ' · externo' : ''}</option>)}
    </select>
  )
}
export function SelProyecto({ value, onChange }: { value?: string | null; onChange: (v: string | null) => void }) {
  const { proyectos } = useStore()
  return (
    <select className={entrada} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">— Sin proyecto —</option>
      {proyectos.filter((p) => p.estado === 'activo' || p.id === value).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
    </select>
  )
}
export function SelPrioridad({ value, onChange }: { value: Prioridad; onChange: (v: Prioridad) => void }) {
  return (
    <div className="flex gap-2">
      {PRIORIDADES.map((p) => (
        <button key={p} type="button" onClick={() => onChange(p)}
          className={`flex-1 rounded-lg border px-3 py-2 text-sm ${value === p ? 'border-ink bg-ink text-white' : 'border-line bg-white'}`}>
          {NOMBRE_PRIORIDAD[p]}
        </button>
      ))}
    </div>
  )
}
