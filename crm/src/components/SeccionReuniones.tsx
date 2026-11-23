import { useState } from 'react'
import { Plus } from 'lucide-react'
import FilaReunion from './FilaReunion'
import ReunionDetalle, { type BorradorReunion } from './ReunionDetalle'
import { Boton, Vacio } from './ui'
import { useStore } from '../lib/store'
import type { Reunion } from '../lib/tipos'

/** Reuniones de un cliente o de un proyecto (próximas primero, luego las pasadas) */
export default function SeccionReuniones({ filtro, nueva }: { filtro: (r: Reunion) => boolean; nueva: BorradorReunion }) {
  const { reuniones } = useStore()
  const [abierta, setAbierta] = useState<BorradorReunion | null>(null)
  const ahora = Date.now()
  const rs = reuniones.filter(filtro)
  const prox = rs.filter((r) => new Date(r.inicio).getTime() + r.duracion * 60000 >= ahora)
  const pas = rs.filter((r) => !prox.includes(r)).reverse()
  return (
    <section>
      <div className="mb-2 flex items-center"><h2 className="mr-auto font-semibold">Reuniones</h2>
        <Boton variante="suave" onClick={() => setAbierta(nueva)}><Plus size={16} /> Reunión</Boton></div>
      {rs.length === 0 ? <Vacio>Sin reuniones.</Vacio>
        : <ul className="overflow-hidden rounded-xl border border-line">{[...prox, ...pas].map((r) => <FilaReunion key={r.id} r={r} onAbrir={() => setAbierta(r)} />)}</ul>}
      {abierta && <ReunionDetalle reunion={abierta} onClose={() => setAbierta(null)} />}
    </section>
  )
}
