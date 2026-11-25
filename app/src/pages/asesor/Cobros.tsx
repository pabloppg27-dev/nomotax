import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowRight, FileText, Sparkles } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { fecha } from '../../lib/format'
import { cuotaCliente, importe, proximoCobro } from '../../lib/planes'
import { diasHasta } from '../../lib/impuestos'
import type { Profile } from '../../lib/types'
import { EditorPlan, HistorialFacturacion } from '../../components/Planes'
import { Badge, Button, Card, Loading, Modal, PageHeader, cx } from '../../components/ui'

const nombreDe = (p: Profile) => p.nombre_comercial || p.nombre || p.email || 'Cliente'

export default function CobrosAsesor() {
  const [perfiles, setPerfiles] = useState<Profile[] | null>(null)
  const [editar, setEditar] = useState<Profile | null>(null)
  const [historial, setHistorial] = useState<Profile | null>(null)

  const cargar = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('*').eq('role', 'client').order('nombre')
    setPerfiles(((data as Profile[]) ?? []).filter((p) => !p.es_demo))
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const { conPlan, sinPlan, alMes, alAnio, proximos } = useMemo(() => {
    const todos = perfiles ?? []
    const conPlan = todos
      .filter((p) => cuotaCliente(p))
      .sort((a, b) => (proximoCobro(a) ?? '9999').localeCompare(proximoCobro(b) ?? '9999') || nombreDe(a).localeCompare(nombreDe(b)))
    // Ingresos recurrentes: lo anual se reparte entre 12 para comparar
    let alMes = 0
    for (const p of conPlan) {
      const c = cuotaCliente(p)!
      alMes += c.periodo === 'anual' ? c.cantidad / 12 + (c.laboral?.total ?? 0) : (c.totalMes ?? 0)
    }
    const proximos = conPlan.filter((p) => {
      const f = proximoCobro(p)
      return f && diasHasta(f) <= 7
    }).length
    return { conPlan, sinPlan: todos.filter((p) => !p.plan), alMes, alAnio: alMes * 12, proximos }
  }, [perfiles])

  if (!perfiles) return <Loading />

  return (
    <>
      <PageHeader title="Planes y cobros" subtitle="Qué paga cada cliente, cuándo se le cobra y las facturas que le ha emitido NomoTax." />

      <div className="mb-6 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Dato n={String(conPlan.length)} label="Clientes con plan" />
        <Dato n={importe(Math.round(alMes * 100) / 100)} label="Al mes (sin IVA)" />
        <Dato n={importe(Math.round(alAnio))} label="Al año (sin IVA)" />
        <Dato n={String(proximos)} label="Cobros en 7 días" />
      </div>

      <Card className="mb-6 overflow-hidden">
        <table className="w-full text-left text-[15px]">
          <thead className="hidden border-b border-line bg-paper text-xs uppercase tracking-wide text-muted md:table-header-group">
            <tr>
              <th className="px-4 py-3 font-medium">Cliente</th>
              <th className="px-4 py-3 font-medium">Plan</th>
              <th className="px-4 py-3 text-right font-medium">Cuota</th>
              <th className="px-4 py-3 font-medium">Próximo cobro</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {conPlan.map((p) => {
              const c = cuotaCliente(p)!
              const cobro = proximoCobro(p)
              const dias = cobro ? diasHasta(cobro) : null
              return (
                <tr
                  key={p.id}
                  onClick={() => setEditar(p)}
                  className="grid cursor-pointer grid-cols-[1fr_auto] gap-x-3 border-b border-line px-4 py-3 last:border-0 hover:bg-paper md:table-row md:p-0"
                >
                  <td className="min-w-0 md:px-4 md:py-3">
                    <p className="truncate font-medium">{nombreDe(p)}</p>
                    <p className="truncate text-sm text-muted">{p.email_facturacion || p.email}</p>
                  </td>
                  <td className="row-start-2 md:px-4 md:py-3">
                    <Badge tono="lima">{c.plan.nombre}</Badge>
                    {c.laboral && <span className="ml-2 text-sm text-muted">+ {c.laboral.texto}</span>}
                  </td>
                  <td className="num text-right md:px-4 md:py-3">
                    <span className="font-medium">{c.texto}</span>
                    {c.personalizado && <span className="block text-xs text-muted">personalizado</span>}
                    {c.laboral && c.totalMes !== null && <span className="block text-xs text-muted">{importe(c.totalMes)}/mes en total</span>}
                  </td>
                  <td className={cx('row-start-2 justify-self-end text-sm md:px-4 md:py-3', dias !== null && dias <= 7 ? 'font-medium text-ink' : 'text-muted')}>
                    {cobro ? `${fecha(cobro)}${dias === 0 ? ' · hoy' : dias !== null && dias <= 7 ? ` · en ${dias} día${dias === 1 ? '' : 's'}` : ''}` : 'Sin fecha'}
                  </td>
                  <td className="col-span-2 flex justify-end gap-2 pt-2 md:table-cell md:px-4 md:py-3 md:text-right">
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<FileText className="size-4" />}
                      onClick={(e) => {
                        e.stopPropagation()
                        setHistorial(p)
                      }}
                    >
                      Facturas
                    </Button>
                  </td>
                </tr>
              )
            })}
            {conPlan.length === 0 && (
              <tr>
                <td className="px-4 py-8 text-center text-sm text-muted" colSpan={5}>
                  Ningún cliente tiene plan todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {sinPlan.length > 0 && (
        <Card className="overflow-hidden">
          <div className="border-b border-line bg-ambar/10 px-4 py-3">
            <h2 className="font-semibold">Sin plan ({sinPlan.length})</h2>
            <p className="text-sm text-muted">Clientes a los que aún no se cobra nada desde la app.</p>
          </div>
          <ul className="divide-y divide-line">
            {sinPlan.map((p) => (
              <li key={p.id}>
                <button onClick={() => setEditar(p)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-paper">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{nombreDe(p)}</span>
                    <span className="block truncate text-sm text-muted">{p.email}</span>
                  </span>
                  <span className="inline-flex items-center gap-1 text-sm font-medium">
                    <Sparkles className="size-4" /> Asignar plan
                  </span>
                  <ArrowRight className="size-4 text-muted" />
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <EditorPlan perfil={editar} onClose={() => setEditar(null)} onGuardado={cargar} />
      <Modal open={Boolean(historial)} onClose={() => setHistorial(null)} title={historial ? `Facturas de NomoTax · ${nombreDe(historial)}` : ''} wide>
        {historial && <HistorialFacturacion perfil={historial} />}
      </Modal>
    </>
  )
}

function Dato({ n, label }: { n: string; label: string }) {
  return (
    <div className="rounded-2xl bg-white px-4 py-3 shadow-[0_0_0_1px_var(--color-line)]">
      <span className="num block text-xl font-semibold sm:text-2xl">{n}</span>
      <span className="text-sm text-muted">{label}</span>
    </div>
  )
}
