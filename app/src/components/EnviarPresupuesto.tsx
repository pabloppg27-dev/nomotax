/** Ventana «Enviar por email» del presupuesto: destinatario, asunto y mensaje (plantilla de presupuestos) y vista previa. */
import { useEffect, useMemo, useState } from 'react'
import { Send } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { invocar, supabase } from '../lib/supabase'
import { fecha as fmtFecha } from '../lib/format'
import { correoDePresupuesto, htmlCorreoPlantilla, lenguaCorreo, variablesPresupuesto } from '../lib/plantillasCorreo'
import type { Quote, QuoteEstado } from '../lib/types'
import { VistaPreviaCorreo, nombreEmpresa, useLogoUrl, useRemitente } from './CorreoComun'
import { Button, Field, Input, Modal, Textarea, notify } from './ui'

const EMAIL = /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/
const lista = (s: string) =>
  s
    .split(/[,;\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)

export default function EnviarPresupuesto({
  presupuesto,
  onClose,
  onEnviado,
}: {
  presupuesto: Quote
  onClose: () => void
  onEnviado: (r: { enviado_at: string; enviado_a: string; estado: QuoteEstado }) => void
}) {
  const { owner } = useAuth()
  const empresa = nombreEmpresa(owner)
  const remitente = useRemitente()
  const vars = useMemo(() => variablesPresupuesto(presupuesto, empresa), [presupuesto, empresa])
  const inicial = useMemo(
    () => correoDePresupuesto({ asunto: owner?.presupuesto_asunto, mensaje: owner?.presupuesto_mensaje }, vars, presupuesto.cliente?.pais),
    [owner?.presupuesto_asunto, owner?.presupuesto_mensaje, vars, presupuesto.cliente?.pais],
  )
  const [para, setPara] = useState(presupuesto.cliente?.email ?? '')
  const [cc, setCc] = useState('')
  const [conCc, setConCc] = useState(false)
  const [asunto, setAsunto] = useState(inicial.asunto)
  const [mensaje, setMensaje] = useState(inicial.mensaje)
  const [enviando, setEnviando] = useState(false)
  const logo = useLogoUrl(owner?.logo_path || null)

  // El email actual de la ficha del cliente (puede haber cambiado desde que se hizo el presupuesto)
  useEffect(() => {
    if (!presupuesto.contact_id) return
    supabase
      .from('contacts')
      .select('email')
      .eq('id', presupuesto.contact_id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.email) setPara((p) => p || data.email)
      })
  }, [presupuesto.contact_id])

  if (!owner) return null
  const responder = owner.email_respuesta || (remitente.propio ? remitente.direccion : owner.email) || '—'
  const html = htmlCorreoPlantilla('presupuesto', mensaje, vars, {
    empresa,
    color: owner.color_marca,
    cabecera: owner.color_cabecera,
    logo,
    respuesta: responder,
    telefono: owner.telefono,
    lengua: lenguaCorreo(presupuesto.cliente?.pais),
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
      // El logo va ya reducido y en JPEG (la función no lo procesa)
      const { logoParaEnvio } = await import('../lib/pdf')
      const logoEnvio = await logoParaEnvio(owner.logo_path)
      const r = await invocar<{ enviado_at: string; enviado_a: string; estado: QuoteEstado }>('enviar-factura', {
        quote_id: presupuesto.id,
        para: destinatarios,
        cc: copias,
        asunto: asunto.trim(),
        mensaje: mensaje.trim(),
        logo: logoEnvio,
      })
      // Función antigua (sin presupuestos): respondería «Falta la factura»
      if (!r?.enviado_at) throw new Error('Falta actualizar la función enviar-factura en Supabase')
      notify(`Presupuesto ${presupuesto.numero} enviado a ${r.enviado_a}`)
      onEnviado({ enviado_at: r.enviado_at, enviado_a: r.enviado_a, estado: r.estado ?? presupuesto.estado })
      onClose()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      notify(msg === 'Falta la factura' ? 'Falta actualizar la función enviar-factura en Supabase' : msg, 'error')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={`Enviar presupuesto ${presupuesto.numero ?? ''}`}
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
          {presupuesto.enviado_at && (
            <div className="rounded-xl bg-ambar/10 px-4 py-3 text-sm text-ambar">
              Ya se envió el {fmtFecha(presupuesto.enviado_at)} a {presupuesto.enviado_a}. Si lo envías otra vez, le llegará de nuevo.
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
          <Field label="Mensaje" hint="El PDF del presupuesto va adjunto.">
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
