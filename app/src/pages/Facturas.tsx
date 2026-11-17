import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AlertCircle, CheckCircle2, FileText, FileUp, Loader2, MailCheck, Plus } from 'lucide-react'
import { nuevoId } from '../lib/id'
import { useAuth } from '../lib/auth'
import { errorMessage, supabase } from '../lib/supabase'
import { enPeriodo, eur, fecha, hoyISO, type Periodo } from '../lib/format'
import { analizarFacturas } from '../lib/estados'
import { importesDe, leerFactura, prepararArchivo, subirDocumento } from '../lib/upload'
import { columnasDivisa } from '../lib/divisas'
import type { Invoice } from '../lib/types'
import IngresoExterno from '../components/IngresoExterno'
import PeriodPicker from '../components/PeriodPicker'
import UploadZone from '../components/UploadZone'
import { Badge, Button, Card, Empty, Loading, Modal, PageHeader, cx } from '../components/ui'

type Tarea = { key: string; nombre: string; estado: 'subiendo' | 'leyendo' | 'hecho' | 'error'; error?: string }
type Filtro = 'todas' | 'borrador' | 'pendientes' | 'cobrada' | 'externa'

const FILTROS: { id: Filtro; label: string }[] = [
  { id: 'todas', label: 'Todas' },
  { id: 'pendientes', label: 'Pendientes de cobro' },
  { id: 'cobrada', label: 'Cobradas' },
  { id: 'borrador', label: 'Borradores' },
  { id: 'externa', label: 'Subidas' },
]

export default function Facturas() {
  const { ownerId, rol } = useAuth()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [lista, setLista] = useState<Invoice[] | null>(null)
  const [periodo, setPeriodo] = useState<Periodo>({ anio: new Date().getFullYear(), trimestre: 0 })
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const [subir, setSubir] = useState(false)
  const [leyendo, setLeyendo] = useState(false)
  const [externa, setExterna] = useState<Invoice | null>(null)
  const [tareas, setTareas] = useState<Tarea[]>([])

  const cargar = useCallback(async () => {
    if (!ownerId) return [] as Invoice[]
    const { data } = await supabase
      .from('invoices')
      .select('*')
      .eq('owner_id', ownerId)
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
    const l = (data as Invoice[]) ?? []
    setLista(l)
    return l
  }, [ownerId])

  useEffect(() => {
    cargar().then((l) => {
      const ver = params.get('ver')
      if (ver) {
        const f = l.find((x) => x.id === ver)
        if (f) setExterna(f)
        setParams({}, { replace: true })
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargar])

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

  const actualizarTarea = (key: string, patch: Partial<Tarea>) =>
    setTareas((ts) => ts.map((t) => (t.key === key ? { ...t, ...patch } : t)))

  // Varias a la vez: se suben y leen de 3 en 3; con una sola se abre su ficha como siempre
  const subirExternas = async (files: File[]) => {
    if (!ownerId || !files.length) return
    const nuevas: Tarea[] = files.map((f) => ({ key: nuevoId(), nombre: f.name, estado: 'subiendo' }))
    setTareas(nuevas)
    setLeyendo(true)
    let ultima: Invoice | null = null
    let siguiente = 0
    const trabajador = async () => {
      while (siguiente < files.length) {
        const i = siguiente++
        const r = await subirUna(files[i], (patch) => actualizarTarea(nuevas[i].key, patch))
        if (r) ultima = r
      }
    }
    await Promise.all(Array.from({ length: Math.min(3, files.length) }, trabajador))
    await cargar()
    setLeyendo(false)
    if (files.length === 1 && ultima) {
      setSubir(false)
      setTareas([])
      setExterna(ultima)
    }
  }

  const subirUna = async (file: File, avisar: (p: Partial<Tarea>) => void): Promise<Invoice | null> => {
    if (!ownerId) return null
    try {
      const archivo = await prepararArchivo(file)
      const path = await subirDocumento(ownerId, 'facturas', archivo)
      avisar({ estado: 'leyendo' })
      let datos: Record<string, unknown> = {}
      let fallo: string | undefined
      try {
        const ocr = await leerFactura(path, 'emitida', ownerId)
        const imp = importesDe(ocr)
        datos = {
          numero: ocr.numero,
          fecha: ocr.fecha || hoyISO(),
          vencimiento: ocr.vencimiento,
          cliente: { nombre: ocr.receptor.nombre, nif: ocr.receptor.nif, direccion: ocr.receptor.direccion },
          base: imp.base,
          cuota_iva: imp.cuota_iva,
          cuota_irpf: imp.cuota_irpf,
          irpf_pct: imp.irpf_pct ?? 0,
          total: imp.total,
          lineas: [{ concepto: ocr.concepto || 'Según factura', cantidad: 1, precio: imp.base, iva: imp.iva_pct ?? 0 }],
          ...columnasDivisa(ocr),
          ocr,
        }
      } catch (e) {
        fallo = `Guardada, pero no se ha podido leer: ${(e as Error).message}`
      }
      const { data, error } = await supabase
        .from('invoices')
        .insert({ owner_id: ownerId, origen: 'externa', estado: 'emitida', file_path: path, ...datos })
        .select()
        .single()
      if (error) throw new Error(await errorMessage(error))
      avisar(fallo ? { estado: 'error', error: fallo } : { estado: 'hecho' })
      return data as Invoice
    } catch (e) {
      avisar({ estado: 'error', error: (e as Error).message })
      return null
    }
  }

  const cerrarSubida = () => {
    if (leyendo) return
    setSubir(false)
    setTareas([])
  }
  const hechas = tareas.filter((t) => t.estado === 'hecho').length
  const conError = tareas.filter((t) => t.estado === 'error').length

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
                    <td className="num order-2 text-right font-medium sm:order-none sm:px-4 sm:py-3">{eur(f.total)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Card>

      <Modal open={subir} onClose={cerrarSubida} title="Subir facturas emitidas">
        {tareas.length > 1 || (tareas.length === 1 && !leyendo) ? (
          <div>
            <p className="mb-3 text-sm text-muted">
              {leyendo
                ? `Leyendo ${tareas.length} facturas… ${hechas + conError} de ${tareas.length}. No cierres esta ventana.`
                : `${hechas} de ${tareas.length} facturas listas${conError ? ` · ${conError} con aviso` : ''}. Ya están en la lista.`}
            </p>
            <div className="max-h-[50dvh] divide-y divide-line overflow-y-auto rounded-xl ring-1 ring-line">
              {tareas.map((t) => (
                <div key={t.key} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                  {t.estado === 'hecho' ? (
                    <CheckCircle2 className="size-4 shrink-0 text-verde" />
                  ) : t.estado === 'error' ? (
                    <AlertCircle className="size-4 shrink-0 text-rojo" />
                  ) : (
                    <Loader2 className="size-4 shrink-0 animate-spin text-muted" />
                  )}
                  <span className="min-w-0 flex-1 truncate">{t.nombre}</span>
                  <span className={cx('shrink-0 text-right', t.estado === 'error' ? 'max-w-[55%] text-rojo' : 'text-muted')}>
                    {t.estado === 'subiendo' && 'Subiendo…'}
                    {t.estado === 'leyendo' && 'Leyendo…'}
                    {t.estado === 'hecho' && 'Lista'}
                    {t.estado === 'error' && t.error}
                  </span>
                </div>
              ))}
            </div>
            {!leyendo && (
              <div className="mt-4 flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setTareas([])}>
                  Subir más
                </Button>
                <Button onClick={cerrarSubida}>Hecho</Button>
              </div>
            )}
          </div>
        ) : leyendo ? (
          <div className="flex flex-col items-center py-10 text-center">
            <Loader2 className="size-6 animate-spin text-muted" />
            <p className="mt-3 font-medium">Leyendo la factura…</p>
            <p className="text-sm text-muted">Tarda unos segundos.</p>
          </div>
        ) : (
          <UploadZone
            compacto
            onFiles={subirExternas}
            titulo="Arrastra aquí las facturas"
            texto="Para facturas que hayas hecho con otro programa. Puedes subir varias a la vez: leemos el número, el cliente y los importes de cada una."
          />
        )}
      </Modal>

      <IngresoExterno factura={externa} onClose={() => setExterna(null)} onChanged={cargar} />
    </>
  )
}
