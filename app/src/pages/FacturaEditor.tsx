import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CheckCircle2, Copy, Download, Save, Send, Trash2, Undo2 } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { errorMessage, supabase } from '../lib/supabase'
import { fechaLarga, hoyISO, sumarDias } from '../lib/format'
import { calcularTotales, lineaVacia } from '../lib/totals'
import { ESTADOS_FACTURA, vencida } from '../lib/estados'
import { MODO_PRUEBAS_FACTURAS } from '../lib/config'
import type { ClienteSnapshot, Emisor, Invoice, Linea } from '../lib/types'
import ContactPicker from '../components/ContactPicker'
import { snapshotDe } from '../components/ContactForm'
import DocShell from '../components/DocShell'
import LinesEditor from '../components/LinesEditor'
import TotalsBox from '../components/TotalsBox'
import { Badge, Button, Field, Input, Loading, Textarea, confirmar, notify } from '../components/ui'

export default function FacturaEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { ownerId, owner, isAdvisor } = useAuth()

  const [cargando, setCargando] = useState(Boolean(id))
  const [factura, setFactura] = useState<Invoice | null>(null)
  const [contactId, setContactId] = useState<string | null>(null)
  const [cliente, setCliente] = useState<ClienteSnapshot>({})
  const [fecha, setFecha] = useState(hoyISO())
  const [vencimiento, setVencimiento] = useState(sumarDias(hoyISO(), 30))
  const [lineas, setLineas] = useState<Linea[]>([lineaVacia()])
  const [irpf, setIrpf] = useState(0)
  const [notas, setNotas] = useState('')
  const [guardando, setGuardando] = useState(false)

  const aplicar = (f: Invoice) => {
    setFactura(f)
    setContactId(f.contact_id)
    setCliente(f.cliente ?? {})
    setFecha(f.fecha)
    setVencimiento(f.vencimiento ?? '')
    setLineas(f.lineas?.length ? f.lineas : [lineaVacia()])
    setIrpf(Number(f.irpf_pct))
    setNotas(f.notas ?? '')
  }

  useEffect(() => {
    if (!id) return
    setCargando(true)
    supabase
      .from('invoices')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          notify('No se ha encontrado la factura', 'error')
          navigate('/facturas')
          return
        }
        if ((data as Invoice).origen === 'externa') {
          navigate(`/facturas?ver=${data.id}`, { replace: true })
          return
        }
        aplicar(data as Invoice)
        setCargando(false)
      })
  }, [id, navigate])

  const totales = useMemo(() => calcularTotales(lineas, irpf), [lineas, irpf])
  const bloqueada = Boolean(factura && factura.estado !== 'borrador')

  if (cargando || !ownerId || !owner) return <Loading />

  const faltanDatosPropios = !owner.nombre || !owner.nif || !owner.direccion

  const payload = () => ({
    owner_id: ownerId,
    contact_id: contactId,
    cliente,
    fecha,
    vencimiento: vencimiento || null,
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

  const guardar = async (extra: Record<string, unknown> = {}): Promise<Invoice | null> => {
    if (!validar()) return null
    setGuardando(true)
    const res = factura
      ? await supabase
          .from('invoices')
          .update({ ...payload(), ...extra })
          .eq('id', factura.id)
          .select()
          .single()
      : await supabase
          .from('invoices')
          .insert({ ...payload(), serie: owner.serie_factura || 'F', ...extra })
          .select()
          .single()
    setGuardando(false)
    if (res.error) {
      notify(await errorMessage(res.error), 'error')
      return null
    }
    const f = res.data as Invoice
    aplicar(f)
    if (!factura) navigate(`/facturas/${f.id}`, { replace: true })
    return f
  }

  const guardarBorrador = async () => {
    const f = await guardar()
    if (f) notify('Borrador guardado')
  }

  const emitir = async () => {
    if (!validar()) return
    if (faltanDatosPropios) {
      notify('Completa tu nombre, NIF y dirección en «Mi perfil» antes de emitir', 'error')
      return
    }
    if (!cliente.nif) {
      const seguir = await confirmar({
        titulo: 'Falta el NIF del cliente',
        texto: 'Una factura completa debe llevar el NIF del destinatario. ¿Quieres emitirla igualmente?',
        accion: 'Emitir sin NIF',
      })
      if (!seguir) return
    }
    const ok = await confirmar({
      titulo: 'Emitir factura',
      texto:
        `Se le asignará el siguiente número de la serie ${factura?.serie ?? owner.serie_factura} con fecha ${fechaLarga(fecha)}. ` +
        'Una vez emitida no se puede modificar ni borrar.' +
        (MODO_PRUEBAS_FACTURAS ? ' (Modo pruebas: el PDF saldrá marcado como documento de pruebas.)' : ''),
      accion: 'Emitir',
    })
    if (!ok) return
    const f = await guardar({ estado: 'emitida' })
    if (f) notify(`Factura ${f.numero} emitida`)
  }

  const cambiarEstado = async (estado: 'emitida' | 'cobrada') => {
    if (!factura) return
    const { data, error } = await supabase.from('invoices').update({ estado }).eq('id', factura.id).select().single()
    if (error) return notify(await errorMessage(error), 'error')
    aplicar(data as Invoice)
    notify(estado === 'cobrada' ? 'Marcada como cobrada' : 'Marcada como pendiente de cobro')
  }

  const toggleContabilizado = async () => {
    if (!factura) return
    const { data, error } = await supabase
      .from('invoices')
      .update({ contabilizado: !factura.contabilizado })
      .eq('id', factura.id)
      .select()
      .single()
    if (error) return notify(await errorMessage(error), 'error')
    aplicar(data as Invoice)
  }

  const pdf = async () => {
    const f = bloqueada ? factura : await guardar()
    if (!f) return
    const { descargarPdf } = await import('../lib/pdf')
    await descargarPdf('factura', f, (f.emisor as Emisor) ?? (owner as Emisor))
  }

  const duplicar = async () => {
    if (!factura) return
    const { data, error } = await supabase
      .from('invoices')
      .insert({
        owner_id: ownerId,
        contact_id: factura.contact_id,
        cliente: factura.cliente,
        serie: factura.serie,
        fecha: hoyISO(),
        vencimiento: sumarDias(hoyISO(), 30),
        lineas: factura.lineas,
        irpf_pct: factura.irpf_pct,
        base: factura.base,
        cuota_iva: factura.cuota_iva,
        cuota_irpf: factura.cuota_irpf,
        total: factura.total,
        notas: factura.notas,
      })
      .select()
      .single()
    if (error) return notify(await errorMessage(error), 'error')
    notify('Copia creada como borrador')
    navigate(`/facturas/${data.id}`)
  }

  const borrar = async () => {
    if (!factura) return navigate('/facturas')
    const ok = await confirmar({
      titulo: 'Eliminar borrador',
      texto: '¿Eliminar este borrador de factura? No se puede deshacer.',
      accion: 'Eliminar',
      peligro: true,
    })
    if (!ok) return
    const { error } = await supabase.from('invoices').delete().eq('id', factura.id)
    if (error) return notify(await errorMessage(error), 'error')
    notify('Borrador eliminado')
    navigate('/facturas')
  }

  const est = factura ? ESTADOS_FACTURA[factura.estado] : null
  const esVencida = factura ? vencida(factura.estado, factura.vencimiento, hoyISO()) : false

  return (
    <DocShell
      back="/facturas"
      backLabel="Facturas"
      title={factura?.numero ? `Factura ${factura.numero}` : factura ? 'Borrador de factura' : 'Nueva factura'}
      badge={
        <>
          {est && <Badge tono={esVencida ? 'rojo' : est.tono}>{esVencida ? 'Vencida' : est.label}</Badge>}
          {factura?.contabilizado && <Badge tono="verde">Contabilizada</Badge>}
        </>
      }
      aviso={
        <>
          {!bloqueada && faltanDatosPropios && (
            <div className="mb-6 rounded-xl bg-ambar/10 px-4 py-3 text-sm text-ambar">
              Para emitir facturas necesitas completar tus datos fiscales (nombre, NIF y dirección) en{' '}
              <Link to="/perfil" className="font-medium underline">
                Mi perfil
              </Link>
              .
            </div>
          )}
          {MODO_PRUEBAS_FACTURAS && (
            <div className="mb-6 rounded-xl bg-ink/5 px-4 py-3 text-sm text-ink/75">
              <strong>Modo pruebas.</strong> La emisión de facturas todavía no está conectada a Verifactu: los PDF salen
              marcados como documento de pruebas.
            </div>
          )}
          {factura?.quote_id && (
            <p className="-mt-3 mb-6 text-sm text-muted">
              Creada a partir de un{' '}
              <Link to={`/presupuestos/${factura.quote_id}`} className="underline">
                presupuesto
              </Link>
              .
            </p>
          )}
        </>
      }
      cliente={
        <ContactPicker
          ownerId={ownerId}
          contactId={contactId}
          cliente={cliente}
          disabled={bloqueada}
          onPick={(c) => {
            setContactId(c.id)
            setCliente(snapshotDe(c))
          }}
        />
      }
      fechas={
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fecha de factura">
            <Input type="date" value={fecha} disabled={bloqueada} onChange={(e) => setFecha(e.target.value)} />
          </Field>
          <Field label="Vencimiento">
            <Input type="date" value={vencimiento} disabled={bloqueada} onChange={(e) => setVencimiento(e.target.value)} />
          </Field>
          <p className="col-span-2 text-sm text-muted">
            Serie <strong className="text-ink">{factura?.serie ?? owner.serie_factura}</strong>
            {factura?.numero ? ` · Nº ${factura.numero}` : ' · el número se asigna al emitir'}
          </p>
        </div>
      }
      lineas={<LinesEditor lineas={lineas} onChange={setLineas} disabled={bloqueada} />}
      notas={
        <Textarea
          placeholder="Texto que aparecerá en la factura (opcional)"
          value={notas}
          disabled={bloqueada}
          onChange={(e) => setNotas(e.target.value)}
        />
      }
      totales={<TotalsBox totales={totales} irpfPct={irpf} onIrpf={setIrpf} disabled={bloqueada} />}
      acciones={
        bloqueada && factura ? (
          <>
            <Button icon={<Download className="size-4" />} onClick={pdf}>
              Descargar PDF
            </Button>
            {factura.estado === 'emitida' ? (
              <Button variant="accent" icon={<CheckCircle2 className="size-4" />} onClick={() => cambiarEstado('cobrada')}>
                Marcar como cobrada
              </Button>
            ) : (
              <Button variant="secondary" icon={<Undo2 className="size-4" />} onClick={() => cambiarEstado('emitida')}>
                Marcar como pendiente de cobro
              </Button>
            )}
            <Button variant="ghost" icon={<Copy className="size-4" />} onClick={duplicar}>
              Duplicar como borrador
            </Button>
            {isAdvisor && (
              <label className="mt-2 flex items-center gap-2 px-1 text-sm">
                <input type="checkbox" className="size-4 accent-ink" checked={factura.contabilizado} onChange={toggleContabilizado} />
                Contabilizada por el asesor
              </label>
            )}
          </>
        ) : (
          <>
            <Button variant="accent" icon={<Send className="size-4" />} onClick={emitir} disabled={guardando}>
              Emitir factura
            </Button>
            <Button icon={<Save className="size-4" />} loading={guardando} onClick={guardarBorrador}>
              Guardar borrador
            </Button>
            <Button variant="secondary" icon={<Download className="size-4" />} onClick={pdf}>
              Vista previa en PDF
            </Button>
            <Button variant="ghost" icon={<Trash2 className="size-4" />} onClick={borrar} className="text-rojo">
              {factura ? 'Eliminar borrador' : 'Descartar'}
            </Button>
          </>
        )
      }
    />
  )
}
