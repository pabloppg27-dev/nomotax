import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ClipboardList, Plus } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { eur, fecha } from '../lib/format'
import { ESTADOS_PRESUPUESTO } from '../lib/estados'
import type { Quote, QuoteEstado } from '../lib/types'
import { Badge, Button, Card, Empty, Loading, PageHeader, cx } from '../components/ui'

const FILTROS: { id: 'todos' | QuoteEstado; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'borrador', label: 'Borradores' },
  { id: 'enviado', label: 'Enviados' },
  { id: 'aceptado', label: 'Aceptados' },
  { id: 'facturado', label: 'Facturados' },
  { id: 'rechazado', label: 'Rechazados' },
]

export default function Presupuestos() {
  const { ownerId } = useAuth()
  const navigate = useNavigate()
  const [lista, setLista] = useState<Quote[] | null>(null)
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]['id']>('todos')

  useEffect(() => {
    if (!ownerId) return
    supabase
      .from('quotes')
      .select('*')
      .eq('owner_id', ownerId)
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
      .then(({ data }) => setLista((data as Quote[]) ?? []))
  }, [ownerId])

  const visibles = useMemo(() => (lista ?? []).filter((q) => filtro === 'todos' || q.estado === filtro), [lista, filtro])

  const pendiente = useMemo(
    () => (lista ?? []).filter((q) => q.estado === 'enviado' || q.estado === 'aceptado').reduce((s, q) => s + Number(q.base), 0),
    [lista],
  )

  const nuevo = (
    <Button icon={<Plus className="size-4" />} onClick={() => navigate('/presupuestos/nuevo')}>
      Nuevo presupuesto
    </Button>
  )

  return (
    <>
      <PageHeader
        title="Presupuestos"
        subtitle={
          lista?.length ? (
            <>
              En negociación o aceptados sin facturar: <strong className="num text-ink">{eur(pendiente)}</strong> (base)
            </>
          ) : (
            'Prepara presupuestos y conviértelos en factura con un clic.'
          )
        }
        actions={nuevo}
      />

      {lista === null ? (
        <Loading />
      ) : lista.length === 0 ? (
        <Card>
          <Empty
            icon={<ClipboardList className="size-5" />}
            title="Aún no has hecho ningún presupuesto"
            text="Crea tu primer presupuesto: cuando el cliente lo acepte, lo conviertes en factura sin volver a escribir nada."
            action={nuevo}
          />
        </Card>
      ) : (
        <>
          <div className="mb-4 flex gap-1 overflow-x-auto pb-1">
            {FILTROS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFiltro(f.id)}
                className={cx(
                  'whitespace-nowrap rounded-full px-3 py-1.5 text-sm transition-colors',
                  filtro === f.id ? 'bg-ink text-white' : 'text-ink/70 hover:bg-ink/5',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          <Card className="overflow-hidden">
            <table className="w-full text-left text-[15px]">
              <thead className="hidden border-b border-line bg-paper text-xs uppercase tracking-wide text-muted sm:table-header-group">
                <tr>
                  <th className="px-4 py-3 font-medium">Número</th>
                  <th className="px-4 py-3 font-medium">Fecha</th>
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((q) => {
                  const est = ESTADOS_PRESUPUESTO[q.estado]
                  return (
                    <tr
                      key={q.id}
                      onClick={() => navigate(`/presupuestos/${q.id}`)}
                      className="grid cursor-pointer grid-cols-[1fr_auto] gap-x-3 border-b border-line px-4 py-3 last:border-0 hover:bg-paper sm:table-row sm:p-0"
                    >
                      <td className="font-medium sm:px-4 sm:py-3">{q.numero}</td>
                      <td className="order-4 text-sm text-muted sm:order-none sm:px-4 sm:py-3 sm:text-[15px] sm:text-ink">{fecha(q.fecha)}</td>
                      <td className="order-3 col-span-2 truncate text-sm text-ink/80 sm:order-none sm:max-w-64 sm:px-4 sm:py-3 sm:text-[15px] sm:text-ink">
                        {q.cliente?.nombre || '—'}
                      </td>
                      <td className="order-5 justify-self-end sm:order-none sm:px-4 sm:py-3">
                        <Badge tono={est.tono}>{est.label}</Badge>
                      </td>
                      <td className="num order-2 text-right font-medium sm:order-none sm:px-4 sm:py-3">{eur(q.total)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {visibles.length === 0 && <p className="py-10 text-center text-sm text-muted">No hay presupuestos en este estado.</p>}
          </Card>
        </>
      )}
    </>
  )
}
