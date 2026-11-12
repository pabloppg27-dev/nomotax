import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Download, FileText, Save, Trash2 } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { errorMessage, supabase } from '../lib/supabase'
import { hoyISO, sumarDias } from '../lib/format'
import { calcularTotales, lineaVacia } from '../lib/totals'
import { ESTADOS_PRESUPUESTO } from '../lib/estados'
import type { ClienteSnapshot, Emisor, Linea, Quote, QuoteEstado } from '../lib/types'
import ContactPicker from '../components/ContactPicker'
import { snapshotDe } from '../components/ContactForm'
import DocShell from '../components/DocShell'
import LinesEditor from '../components/LinesEditor'
import TotalsBox from '../components/TotalsBox'
import { Badge, Button, Field, Input, Loading, Select, Textarea, confirmar, notify } from '../components/ui'

export default function PresupuestoEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { ownerId, owner } = useAuth()

  const [cargando, setCargando] = useState(Boolean(id))
  const [quote, setQuote] = useState<Quote | null>(null)
  const [contactId, setContactId] = useState<string | null>(null)
  const [cliente, setCliente] = useState<ClienteSnapshot>({})
  const [fecha, setFecha] = useState(hoyISO())
  const [validoHasta, setValidoHasta] = useState(sumarDias(hoyISO(), 30))
  const [lineas, setLineas] = useState<Linea[]>([lineaVacia()])
  const [irpf, setIrpf] = useState(0)
  const [notas, setNotas] = useState('')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (!id) return
    supabase
      .from('quotes')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          notify('No se ha encontrado el presupuesto', 'error')
          navigate('/presupuestos')
          return
        }
        const q = data as Quote
        setQuote(q)
        setContactId(q.contact_id)
        setCliente(q.cliente ?? {})
        setFecha(q.fecha)
        setValidoHasta(q.valido_hasta ?? '')
        setLineas(q.lineas?.length ? q.lineas : [lineaVacia()])
        setIrpf(Number(q.irpf_pct))
        setNotas(q.notas ?? '')
        setCargando(false)
      })
  }, [id, navigate])

  const totales = useMemo(() => calcularTotales(lineas, irpf), [lineas, irpf])
  const bloqueado = quote?.estado === 'facturado'

  if (cargando || !ownerId || !owner) return <Loading />

  const payload = () => ({
    owner_id: ownerId,
    contact_id: contactId,
    cliente,
    fecha,
    valido_hasta: validoHasta || null,
    lineas: lineas.filter((l) => l.concepto.trim() || l.precio),
    irpf_pct: irpf,
    base: totales.base,
    cuota_iva: totales.cuota_iva,
    cuota_irpf: totales.cuota_irpf,
    total: totales.total,
    notas: notas.trim() || null,
  })

  const validar = () => {
    if (!cliente.nombre) {
      notify('Elige un cliente', 'error')
      return false
    }
    if (!payload().lineas.length) {
      notify('Añade al menos un concepto', 'error')
      return false
    }
    return true
  }

  const guardar = async (): Promise<Quote | null> => {
    if (!validar()) return null
    setGuardando(true)
    const res = quote
      ? await supabase.from('quotes').update(payload()).eq('id', quote.id).select().single()
      : await supabase
          .from('quotes')
          .insert({ ...payload(), serie: owner.serie_presupuesto || 'P' })
          .select()
          .single()
    setGuardando(false)
    if (res.error) {
      notify(await errorMessage(res.error), 'error')
      return null
    }
    const q = res.data as Quote
    setQuote(q)
    notify(quote ? 'Presupuesto guardado' : `Presupuesto ${q.numero} creado`)
    if (!quote) navigate(`/presupuestos/${q.id}`, { replace: true })
    return q
  }

  const cambiarEstado = async (estado: QuoteEstado) => {
    if (!quote) return
    const { data, error } = await supabase.from('quotes').update({ estado }).eq('id', quote.id).select().single()
    if (error) return notify(await errorMessage(error), 'error')
    setQuote(data as Quote)
    notify(`Marcado como ${ESTADOS_PRESUPUESTO[estado].label.toLowerCase()}`)
  }

  const pdf = async () => {
    const q = bloqueado ? quote : await guardar()
    if (!q) return
    const { descargarPdf } = await import('../lib/pdf')
    await descargarPdf('presupuesto', q, owner as Emisor)
  }

  const facturar = async () => {
    const q = await guardar()
    if (!q) return
    const ok = await confirmar({
      titulo: 'Convertir en factura',
      texto: `Se creará un borrador de factura con los conceptos del presupuesto ${q.numero}. Podrás revisarlo antes de emitirlo.`,
      accion: 'Crear factura',
    })
    if (!ok) return
    const { data, error } = await supabase
      .from('invoices')
      .insert({
        owner_id: ownerId,
        contact_id: q.contact_id,
        quote_id: q.id,
        cliente: q.cliente,
        serie: owner.serie_factura || 'F',
        fecha: hoyISO(),
        vencimiento: sumarDias(hoyISO(), 30),
        lineas: q.lineas,
        irpf_pct: q.irpf_pct,
        base: q.base,
        cuota_iva: q.cuota_iva,
        cuota_irpf: q.cuota_irpf,
        total: q.total,
        notas: q.notas,
      })
      .select()
      .single()
    if (error) return notify(await errorMessage(error), 'error')
    await supabase.from('quotes').update({ estado: 'facturado', invoice_id: data.id }).eq('id', q.id)
    notify('Borrador de factura creado')
    navigate(`/facturas/${data.id}`)
  }

  const borrar = async () => {
    if (!quote) return navigate('/presupuestos')
    const ok = await confirmar({
      titulo: 'Eliminar presupuesto',
      texto: `¿Eliminar el presupuesto ${quote.numero}? No se puede deshacer.`,
      accion: 'Eliminar',
      peligro: true,
    })
    if (!ok) return
    const { error } = await supabase.from('quotes').delete().eq('id', quote.id)
    if (error) return notify(await errorMessage(error), 'error')
    notify('Presupuesto eliminado')
    navigate('/presupuestos')
  }

  const est = quote ? ESTADOS_PRESUPUESTO[quote.estado] : null

  return (
    <DocShell
      back="/presupuestos"
      backLabel="Presupuestos"
      title={quote ? `Presupuesto ${quote.numero}` : 'Nuevo presupuesto'}
      badge={est && <Badge tono={est.tono}>{est.label}</Badge>}
      aviso={
        bloqueado && quote?.invoice_id ? (
          <div className="mb-6 rounded-xl bg-lima/40 px-4 py-3 text-sm">
            Este presupuesto ya se ha convertido en factura.{' '}
            <Link to={`/facturas/${quote.invoice_id}`} className="font-medium underline">
              Ver la factura
            </Link>
          </div>
        ) : null
      }
      cliente={
        <ContactPicker
          ownerId={ownerId}
          contactId={contactId}
          cliente={cliente}
          disabled={bloqueado}
          onPick={(c) => {
            setContactId(c.id)
            setCliente(snapshotDe(c))
          }}
        />
      }
      fechas={
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fecha">
            <Input type="date" value={fecha} disabled={bloqueado} onChange={(e) => setFecha(e.target.value)} />
          </Field>
          <Field label="Válido hasta">
            <Input type="date" value={validoHasta} disabled={bloqueado} onChange={(e) => setValidoHasta(e.target.value)} />
          </Field>
          {quote && !bloqueado && (
            <Field label="Estado" className="col-span-2">
              <Select value={quote.estado} onChange={(e) => cambiarEstado(e.target.value as QuoteEstado)}>
                {(['borrador', 'enviado', 'aceptado', 'rechazado'] as QuoteEstado[]).map((s) => (
                  <option key={s} value={s}>
                    {ESTADOS_PRESUPUESTO[s].label}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>
      }
      lineas={<LinesEditor lineas={lineas} onChange={setLineas} disabled={bloqueado} />}
      notas={
        <Textarea
          placeholder="Condiciones, plazos de entrega, forma de pago…"
          value={notas}
          disabled={bloqueado}
          onChange={(e) => setNotas(e.target.value)}
        />
      }
      totales={<TotalsBox totales={totales} irpfPct={irpf} onIrpf={setIrpf} disabled={bloqueado} />}
      acciones={
        <>
          {!bloqueado && (
            <Button icon={<Save className="size-4" />} loading={guardando} onClick={guardar}>
              {quote ? 'Guardar cambios' : 'Crear presupuesto'}
            </Button>
          )}
          <Button variant="secondary" icon={<Download className="size-4" />} onClick={pdf}>
            Descargar PDF
          </Button>
          {!bloqueado && (
            <Button variant="accent" icon={<FileText className="size-4" />} onClick={facturar}>
              Convertir en factura
            </Button>
          )}
          {!bloqueado && (
            <Button variant="ghost" icon={<Trash2 className="size-4" />} onClick={borrar} className="text-rojo">
              {quote ? 'Eliminar' : 'Descartar'}
            </Button>
          )}
        </>
      }
    />
  )
}
