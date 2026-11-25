import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { FileText, FileUp, MailCheck, Plus } from 'lucide-react'
import { useAlCambiarSubidas, useSubidas } from '../lib/subidas'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { enPeriodo, eur, fecha, hoyISO, type Periodo } from '../lib/format'
import { analizarFacturas } from '../lib/estados'
import type { Invoice } from '../lib/types'
import { dinero } from '../lib/cuentasBancarias'
import IngresoExterno from '../components/IngresoExterno'
import PeriodPicker from '../components/PeriodPicker'
import UploadZone from '../components/UploadZone'
import { Badge, Button, Card, Empty, Loading, Modal, PageHeader, cx } from '../components/ui'

type Filtro = 'todas' | 'borrador' | 'pendientes' | 'cobrada' | 'externa'

const FILTROS: { id: Filtro; label: string }[] = [
  { id: 'todas', label: 'Todas' },
  { id: 'pendientes', label: 'Pendientes de cobro' },
  { id: 'cobrada', label: 'Cobradas' },
  { id: 'borrador', label: 'Borradores' },
  { id: 'externa', label: 'Subidas' },
]

export default function Facturas() {
  const { ownerId, rol, soloDe } = useAuth()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [lista, setLista] = useState<Invoice[] | null>(null)
  const [periodo, setPeriodo] = useState<Periodo>({ anio: new Date().getFullYear(), trimestre: 0 })
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const [subir, setSubir] = useState(false)
  const [externa, setExterna] = useState<Invoice | null>(null)
  const { encolar } = useSubidas()

  const cargar = useCallback(async () => {
    if (!ownerId) return [] as Invoice[]
    let q = supabase.from('invoices').select('*').eq('owner_id', ownerId)
    if (soloDe) q = q.eq('creado_por', soloDe) // comercial: solo las suyas
    const { data } = await q.order('fecha', { ascending: false }).order('created_at', { ascending: false })
    const l = (data as Invoice[]) ?? []
    setLista(l)
    return l
  }, [ownerId, soloDe])

  // ?ver=<id>: abre la factura subida (desde el panel de subidas o un enlace)
  const ver = params.get('ver')
  useEffect(() => {
    cargar().then((l) => {
      if (ver) {
        const f = l.find((x) => x.id === ver)
        if (f) setExterna(f)
        setParams({}, { replace: true })
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargar, ver])

  useAlCambiarSubidas(() => {
    cargar()
  })

  const info = useMemo(() => analizarFacturas(lista ?? [], hoyISO()), [lista])

  const visibles = useMemo(
    () =>
      (lista ?? []).filter((f) => {
        if (f.estado !== 'borrador' && !enPeriodo(f.fecha, periodo)) return false
        if (filtro === 'borrador') return f.estado === 'borrador'
        if (filtro === 'pendientes') return (info.get(f.id)?.pendiente ?? 0) > 0
        if (filtro === 'cobrada') return f.estado === 'cobrada'
        if (filtro === 'externa') return f.origen === 'externa'
        return true
      }),
    [lista, periodo, filtro, info],
  )

  const kpis = useMemo(() => {
    const emitidas = (lista ?? []).filter((f) => f.estado !== 'borrador' && enPeriodo(f.fecha, periodo))
    return {
      base: emitidas.reduce((s, f) => s + Number(f.base), 0),
      iva: emitidas.reduce((s, f) => s + Number(f.cuota_iva), 0),
      pendiente: (lista ?? []).reduce((s, f) => s + (info.get(f.id)?.pendiente ?? 0), 0),
    }
  }, [lista, periodo, info])

  // Se encolan y se procesan en segundo plano (panel flotante); la ventana se cierra enseguida
  const subirExternas = (files: File[]) => {
    if (!ownerId || !files.length) return
    encolar('factura', ownerId, files)
    setSubir(false)
  }

  const abrir = (f: Invoice) => (f.origen === 'externa' ? setExterna(f) : navigate(`/facturas/${f.id}`))

  if (!ownerId) return <Loading />

  const nueva = (
    <Button icon={<Plus className="size-4" />} onClick={() => navigate('/facturas/nueva')}>
      Nueva factura
    </Button>
  )

  return (
    <>
      <PageHeader
        title="Facturas"
        subtitle="Tus facturas emitidas: créalas aquí o sube las que hagas con otro programa."
        actions={
          <>
            {rol !== 'comercial' && (
              <Button variant="secondary" icon={<FileUp className="size-4" />} onClick={() => setSubir(true)}>
                Subir factura
              </Button>
            )}
            {nueva}
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-sm text-muted">Facturado (base)</p>
          <p className="num mt-1 text-xl font-semibold">{eur(kpis.base)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted">IVA repercutido</p>
          <p className="num mt-1 text-xl font-semibold">{eur(kpis.iva)}</p>
        </Card>
        <Card className="col-span-2 p-4 sm:col-span-1">
          <p className="text-sm text-muted">Pendiente de cobro</p>
          <p className="num mt-1 text-xl font-semibold">{eur(kpis.pendiente)}</p>
        </Card>
      </div>

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <PeriodPicker value={periodo} onChange={setPeriodo} />
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
      </div>

      <Card className="overflow-hidden">
        {lista === null ? (
          <Loading />
        ) : visibles.length === 0 ? (
          <Empty
            icon={<FileText className="size-5" />}
            title={lista.length ? 'No hay facturas con estos filtros' : 'Todavía no tienes facturas'}
            text={lista.length ? 'Cambia el periodo o el filtro.' : 'Crea tu primera factura o sube las que ya tengas.'}
            action={lista.length ? undefined : nueva}
          />
        ) : (
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
              {visibles.map((f) => {
                const est = info.get(f.id) ?? { label: f.estado, tono: 'gris' as const }
                return (
                  <tr
                    key={f.id}
                    onClick={() => abrir(f)}
                    className="grid cursor-pointer grid-cols-[1fr_auto] gap-x-3 border-b border-line px-4 py-3 last:border-0 hover:bg-paper sm:table-row sm:p-0"
                  >
                    <td className="font-medium sm:px-4 sm:py-3">
                      {f.numero || <span className="text-muted">Borrador</span>}
                      {f.origen === 'externa' && <span className="ml-2 text-xs font-normal text-muted">subida</span>}
                      {f.tipo === 'rectificativa' && <span className="ml-2 text-xs font-normal text-muted">rectificativa</span>}
                      {f.enviada_at && (
                        <span title={`Enviada el ${fecha(f.enviada_at)} a ${f.enviada_a ?? ''}`} className="ml-2 inline-flex align-[-2px] text-muted">
                          <MailCheck className="size-4" aria-label="Enviada por email" />
                        </span>
                      )}
                    </td>
                    <td className="order-4 text-sm text-muted sm:order-none sm:px-4 sm:py-3 sm:text-[15px] sm:text-ink">{fecha(f.fecha)}</td>
                    <td className="order-3 col-span-2 truncate text-sm text-ink/80 sm:order-none sm:max-w-64 sm:px-4 sm:py-3 sm:text-[15px] sm:text-ink">
                      {f.cliente?.nombre || '—'}
                    </td>
                    <td className="order-5 justify-self-end sm:order-none sm:px-4 sm:py-3">
                      <span className="inline-flex gap-1">
                        <Badge tono={est.tono}>{est.label}</Badge>
                        {f.contabilizado && <Badge tono="verde">Contab.</Badge>}
                      </span>
                    </td>
                    <td className="num order-2 text-right font-medium sm:order-none sm:px-4 sm:py-3">
                      {eur(f.total)}
                      {f.moneda && f.moneda !== 'EUR' && f.importe_original !== null && f.importe_original !== undefined && (
                        <span className="block text-xs font-normal text-muted">{dinero(f.importe_original, f.moneda)}</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Card>

      <Modal open={subir} onClose={() => setSubir(false)} title="Subir facturas emitidas">
        <UploadZone
          compacto
          onFiles={subirExternas}
          titulo="Arrastra aquí las facturas"
          texto="Para facturas que hayas hecho con otro programa. Puedes subir varias a la vez: se leen en segundo plano y puedes seguir trabajando."
        />
      </Modal>

      <IngresoExterno factura={externa} onClose={() => setExterna(null)} onChanged={cargar} />
    </>
  )
}
