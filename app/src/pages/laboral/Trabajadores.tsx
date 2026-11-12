import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, UserPlus } from 'lucide-react'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import { eur, fecha } from '../../lib/format'
import { ESTADOS_TRABAJADOR, nombreContrato } from '../../lib/laboral'
import type { EstadoTrabajador, Nomina, Trabajador } from '../../lib/types'
import { Badge, Button, Card, Empty, Input, Loading, cx } from '../../components/ui'
import LaboralTabs from './LaboralTabs'

const FILTROS: { id: 'activos' | EstadoTrabajador | 'todos'; label: string }[] = [
  { id: 'activos', label: 'Activos y en trámite' },
  { id: 'solicitada', label: 'Solicitadas' },
  { id: 'alta', label: 'De alta' },
  { id: 'baja', label: 'De baja' },
  { id: 'todos', label: 'Todos' },
]

export default function Trabajadores() {
  const { ownerId } = useAuth()
  const navigate = useNavigate()
  const [lista, setLista] = useState<Trabajador[] | null>(null)
  const [costes, setCostes] = useState<Record<string, number>>({})
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]['id']>('activos')
  const [q, setQ] = useState('')

  useEffect(() => {
    if (!ownerId) return
    Promise.all([
      supabase.from('trabajadores').select('*').eq('owner_id', ownerId).order('nombre'),
      supabase
        .from('nominas')
        .select('trabajador_id, anio, mes, coste_total')
        .eq('owner_id', ownerId)
        .eq('estado', 'publicada')
        .order('anio', { ascending: false })
        .order('mes', { ascending: false }),
    ]).then(([t, n]) => {
      setLista((t.data as Trabajador[]) ?? [])
      // Coste del último mes con nómina de cada trabajador
      const ultimo: Record<string, { k: number; coste: number }> = {}
      for (const r of (n.data as Pick<Nomina, 'trabajador_id' | 'anio' | 'mes' | 'coste_total'>[]) ?? []) {
        if (!r.trabajador_id) continue
        const k = r.anio * 100 + r.mes
        const u = ultimo[r.trabajador_id]
        if (!u || k > u.k) ultimo[r.trabajador_id] = { k, coste: Number(r.coste_total) }
        else if (k === u.k) u.coste += Number(r.coste_total)
      }
      setCostes(Object.fromEntries(Object.entries(ultimo).map(([id, v]) => [id, v.coste])))
    })
  }, [ownerId])

  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase()
    return (lista ?? []).filter((w) => {
      if (filtro === 'activos' && w.estado === 'baja') return false
      if (filtro !== 'activos' && filtro !== 'todos' && w.estado !== filtro) return false
      return !t || [w.nombre, w.dni, w.puesto].some((v) => v?.toLowerCase().includes(t))
    })
  }, [lista, filtro, q])

  const nueva = (
    <Button variant="accent" icon={<UserPlus className="size-4" />} onClick={() => navigate('/laboral/alta')}>
      Nueva alta
    </Button>
  )

  return (
    <>
      <LaboralTabs subtitle="Pide altas, consulta a tus trabajadores y lo que te cuestan." actions={nueva} />

      {lista === null ? (
        <Loading />
      ) : lista.length === 0 ? (
        <Card>
          <Empty
            icon={<UserPlus className="size-5" />}
            title="Todavía no tienes trabajadores aquí"
            text="Pide el alta de un trabajador: rellenas sus datos en dos minutos y nosotros hacemos el resto."
            action={nueva}
          />
        </Card>
      ) : (
        <>
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex gap-1 overflow-x-auto pb-1">
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
            <div className="relative md:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <Input placeholder="Buscar" value={q} onChange={(e) => setQ(e.target.value)} className="!h-9 pl-9 !text-sm" />
            </div>
          </div>

          <Card className="overflow-hidden">
            <table className="w-full text-left text-[15px]">
              <thead className="hidden border-b border-line bg-paper text-xs uppercase tracking-wide text-muted md:table-header-group">
                <tr>
                  <th className="px-4 py-3 font-medium">Trabajador</th>
                  <th className="px-4 py-3 font-medium">Contrato</th>
                  <th className="px-4 py-3 font-medium">Inicio</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 text-right font-medium">Coste último mes</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((w) => {
                  const est = ESTADOS_TRABAJADOR[w.estado]
                  return (
                    <tr
                      key={w.id}
                      onClick={() => navigate(`/laboral/trabajadores/${w.id}`)}
                      className="grid cursor-pointer grid-cols-[1fr_auto] gap-x-3 border-b border-line px-4 py-3 last:border-0 hover:bg-paper md:table-row md:p-0"
                    >
                      <td className="min-w-0 md:px-4 md:py-3">
                        <p className="truncate font-medium">{w.nombre}</p>
                        <p className="truncate text-sm text-muted">{w.puesto || w.dni}</p>
                      </td>
                      <td className="order-3 text-sm text-muted md:order-none md:px-4 md:py-3 md:text-[15px] md:text-ink">
                        {nombreContrato(w.tipo_contrato)}
                        {w.jornada === 'parcial' && <span className="text-muted"> · {Number(w.horas_semana)} h</span>}
                      </td>
                      <td className="hidden md:table-cell md:px-4 md:py-3">{fecha(w.fecha_inicio)}</td>
                      <td className="order-2 justify-self-end md:order-none md:px-4 md:py-3">
                        <Badge tono={est.tono}>{est.label}</Badge>
                      </td>
                      <td className="num order-4 justify-self-end text-sm md:order-none md:px-4 md:py-3 md:text-right md:text-[15px]">
                        {costes[w.id] !== undefined ? eur(costes[w.id]) : <span className="text-muted">—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {visibles.length === 0 && <p className="py-10 text-center text-sm text-muted">Nadie en este filtro.</p>}
          </Card>
          <div className="mt-4 md:hidden">
            <Button className="w-full" variant="secondary" icon={<Plus className="size-4" />} onClick={() => navigate('/laboral/alta')}>
              Nueva alta
            </Button>
          </div>
        </>
      )}
    </>
  )
}
