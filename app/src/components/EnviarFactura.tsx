/** Ventana «Enviar por email»: destinatario, asunto y mensaje (de la plantilla) y vista previa. */
import { useEffect, useMemo, useState } from 'react'
import { Send } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { invocar, supabase } from '../lib/supabase'
import { fecha as fmtFecha } from '../lib/format'
import { correoDeFactura, htmlCorreoFactura, type DatosFacturaCorreo } from '../lib/correoFactura'
import { cobroParaCorreo } from '../lib/cuentasBancarias'
import type { Emisor, Invoice } from '../lib/types'
import { VistaPreviaCorreo, nombreEmpresa, useLogoUrl, useRemitente } from './CorreoComun'
import { Button, Field, Input, Modal, Textarea, notify } from './ui'

const EMAIL = /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/
const lista = (s: string) =>
  s
    .split(/[,;\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)

export default function EnviarFactura({
  factura,
  onClose,
  onEnviada,
}: {
  factura: Invoice
  onClose: () => void
  onEnviada: (r: { enviada_at: string; enviada_a: string }) => void
}) {
  const { owner, configCorreo } = useCorreoEmpresa()
  const empresa = nombreEmpresa(owner)
  const remitente = useRemitente()
  // Factura en otra moneda (USD, GBP…): el correo da los importes en esa moneda y las cuentas elegidas
  const cobro = useMemo(() => cobroParaCorreo(factura, (factura.emisor as Emisor | null) ?? owner), [factura, owner])
  const enEuros = cobro.moneda === 'EUR'
  const datos: DatosFacturaCorreo = useMemo(
    () => ({
      cliente: factura.cliente?.nombre ?? null,
      numero: factura.numero ?? '',
      fecha: factura.fecha,
      vencimiento: factura.vencimiento,
      total: enEuros ? Number(factura.total) : cobro.total,
      empresa,
      pais: factura.cliente?.pais ?? null,
      lineas: enEuros ? factura.lineas : cobro.lineas,
      irpf_pct: Number(factura.irpf_pct),
      moneda: cobro.moneda,
    }),
    [factura, empresa, cobro, enEuros],
  )
  const inicial = useMemo(() => correoDeFactura(configCorreo, datos), [configCorreo, datos])
  const [para, setPara] = useState(factura.cliente?.email ?? '')
  const [cc, setCc] = useState('')
  const [conCc, setConCc] = useState(false)
  const [asunto, setAsunto] = useState(inicial.asunto)
  const [mensaje, setMensaje] = useState(inicial.mensaje)
  const [enviando, setEnviando] = useState(false)
  const logo = useLogoUrl(((factura.emisor as Emisor | null)?.logo_path ?? owner?.logo_path) || null)

  // El email actual de la ficha del cliente (puede haber cambiado desde que se hizo la factura)
  useEffect(() => {
    if (!factura.contact_id) return
    supabase
      .from('contacts')
      .select('email')
      .eq('id', factura.contact_id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.email) setPara((p) => p || data.email)
      })
  }, [factura.contact_id])

  if (!owner) return null
  const responder = owner.email_respuesta || (remitente.propio ? remitente.direccion : owner.email) || '—'
  const html = htmlCorreoFactura(mensaje, datos, {
    empresa,
    color: owner.color_marca,
    cabecera: owner.color_cabecera,
    logo,
    respuesta: responder,
    telefono: (factura.emisor as Emisor | null)?.telefono ?? owner.telefono,
    iban: cobro.pago,
    qr: cobro.qr,
    rectificativa: factura.tipo === 'rectificativa',
  })

  const enviar = async () => {
    const destinatarios = lista(para)
    const copias = conCc ? lista(cc) : []
    if (!destinatarios.length) return notify('Pon el email del cliente', 'error')
    const malo = [...destinatarios, ...copias].find((e) => !EMAIL.test(e))
    if (malo) return notify(`«${malo}» no es un email válido`, 'error')
    if (destinatarios.length + copias.length > 5) return notify('Como máximo 5 destinatarios', 'error')
    if (!asunto.trim() || !mensaje.trim()) return notify('Escribe el asunto y el mensaje', 'error')
    setEnviando(true)
    try {
      // El logo va ya reducido y en JPEG: así la función no tiene que procesarlo (se quedaba sin CPU)
      const { logoParaEnvio } = await import('../lib/pdf')
      const logoEnvio = await logoParaEnvio((factura.emisor as Emisor | null)?.logo_path ?? owner.logo_path)
      const r = await invocar<{ enviada_at: string; enviada_a: string; remitente?: string }>('enviar-factura', {
        invoice_id: factura.id,
        para: destinatarios,
        cc: copias,
        asunto: asunto.trim(),
        mensaje: mensaje.trim(),
        logo: logoEnvio,
      })
      notify(`Factura ${factura.numero} enviada a ${r.enviada_a}`)
      if (r.remitente && r.remitente !== remitente.direccion) console.warn(`Enviada desde ${r.remitente}: el servidor no dejó usar ${remitente.direccion}`)
      onEnviada({ enviada_at: r.enviada_at, enviada_a: r.enviada_a })
      onClose()
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'error')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={`Enviar factura ${factura.numero ?? ''}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="accent" icon={<Send className="size-4" />} loading={enviando} onClick={enviar}>
            Enviar
          </Button>
        </>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          {factura.enviada_at && (
            <div className="rounded-xl bg-ambar/10 px-4 py-3 text-sm text-ambar">
              Ya se envió el {fmtFecha(factura.enviada_at)} a {factura.enviada_a}. Si la envías otra vez, le llegará de nuevo.
            </div>
          )}
          <Field label="Para" hint="Varios emails separados por comas.">
            <Input type="text" inputMode="email" value={para} onChange={(e) => setPara(e.target.value)} placeholder="cliente@empresa.com" autoFocus={!para} />
          </Field>
          {conCc ? (
            <Field label="CC">
              <Input type="text" inputMode="email" value={cc} onChange={(e) => setCc(e.target.value)} placeholder="otra@empresa.com" autoFocus />
            </Field>
          ) : (
            <button type="button" className="-mt-2 text-sm font-medium underline" onClick={() => setConCc(true)}>
              Añadir CC
            </button>
          )}
          <Field label="Asunto">
            <Input value={asunto} maxLength={200} onChange={(e) => setAsunto(e.target.value)} />
          </Field>
          <Field label="Mensaje" hint="El PDF de la factura va adjunto.">
            <Textarea rows={10} maxLength={5000} value={mensaje} onChange={(e) => setMensaje(e.target.value)} />
          </Field>
          <p className="text-sm text-muted">
            {remitente.propio ? <>Sale desde <strong className="text-ink">{remitente.direccion}</strong>.</> : <>Sale desde {remitente.direccion} con tu nombre.</>} Si tu cliente responde, le llega a <strong className="text-ink">{responder}</strong>.
            {owner.correo_copia && ' Recibirás una copia oculta.'}
          </p>
        </div>
        <div>
          <p className="mb-2 text-[13px] font-medium text-ink/80">Así le llegará</p>
          <VistaPreviaCorreo de={remitente.de} para={lista(para).join(', ')} responder={responder} asunto={asunto} html={html} />
        </div>
      </div>
    </Modal>
  )
}

/** Perfil de la empresa y su plantilla de correo */
function useCorreoEmpresa() {
  const { owner } = useAuth()
  const configCorreo = useMemo(() => ({ asunto: owner?.correo_asunto, mensaje: owner?.correo_mensaje }), [owner?.correo_asunto, owner?.correo_mensaje])
  return { owner, configCorreo }
}
