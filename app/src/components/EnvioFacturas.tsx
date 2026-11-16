/**
 * Configuración → Envío de facturas: plantilla del correo (asunto y mensaje con {variables}),
 * a dónde llegan las respuestas y vista previa con el logo y el color de marca.
 * Las facturas salen desde invoice@nomotax.io con el nombre de la empresa (función enviar-factura).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { RotateCcw, Save } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { errorMessage, signedUrl, supabase } from '../lib/supabase'
import { hoyISO, sumarDias } from '../lib/format'
import { VARIABLES_CORREO, correoDeFactura, htmlCorreoFactura, plantillaPorDefecto } from '../lib/correoFactura'
import type { Profile } from '../lib/types'
import { Button, Card, Field, Input, Textarea, notify } from './ui'

/** Remitente de las facturas (debe coincidir con FACTURAS_FROM de la función enviar-factura) */
export const REMITENTE_FACTURAS = 'invoice@nomotax.io'

export const nombreEmpresa = (p: Pick<Profile, 'nombre' | 'nombre_comercial' | 'email'> | null | undefined) =>
  p?.nombre_comercial?.trim() || p?.nombre?.trim() || p?.email || 'Tu empresa'

/** URL temporal del logo, para las vistas previas */
export function useLogoUrl(path: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let vivo = true
    if (path) signedUrl(path, 3600).then((u) => vivo && setUrl(u))
    else setUrl(null)
    return () => {
      vivo = false
    }
  }, [path])
  return url
}

/** El correo tal y como le llega al cliente: remitente, responder a, asunto y cuerpo */
export function VistaPreviaCorreo({ de, responder, para, asunto, html }: { de: string; responder: string; para?: string; asunto: string; html: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-white">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-b border-line bg-paper/60 px-4 py-3 text-[13px]">
        <dt className="text-muted">De</dt>
        <dd className="min-w-0 truncate">{de}</dd>
        {para !== undefined && (
          <>
            <dt className="text-muted">Para</dt>
            <dd className="min-w-0 truncate">{para || '—'}</dd>
          </>
        )}
        <dt className="text-muted">Responder a</dt>
        <dd className="min-w-0 truncate font-medium">{responder}</dd>
        <dt className="text-muted">Asunto</dt>
        <dd className="min-w-0 truncate font-medium">{asunto}</dd>
      </dl>
      <iframe title="Vista previa del correo" srcDoc={html} sandbox="" className="block h-[560px] w-full bg-[#f5f5f2]" />
    </div>
  )
}

export default function EnvioFacturas() {
  const { owner, refresh } = useAuth()
  const def = plantillaPorDefecto('es')
  const [respuesta, setRespuesta] = useState('')
  const [copia, setCopia] = useState(false)
  const [asunto, setAsunto] = useState(def.asunto)
  const [mensaje, setMensaje] = useState(def.mensaje)
  const [guardando, setGuardando] = useState(false)
  const ultimoCampo = useRef<'asunto' | 'mensaje'>('mensaje')
  const refAsunto = useRef<HTMLInputElement>(null)
  const refMensaje = useRef<HTMLTextAreaElement>(null)
  const logo = useLogoUrl(owner?.logo_path)

  const inicial = useMemo(
    () => ({
      respuesta: owner?.email_respuesta ?? '',
      copia: Boolean(owner?.correo_copia),
      asunto: owner?.correo_asunto?.trim() || def.asunto,
      mensaje: owner?.correo_mensaje?.trim() || def.mensaje,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [owner?.email_respuesta, owner?.correo_copia, owner?.correo_asunto, owner?.correo_mensaje],
  )
  useEffect(() => {
    setRespuesta(inicial.respuesta)
    setCopia(inicial.copia)
    setAsunto(inicial.asunto)
    setMensaje(inicial.mensaje)
  }, [inicial])

  if (!owner) return null
  // Hasta que se ejecute supabase/envio-facturas.sql las columnas no existen
  const activo = 'correo_mensaje' in owner
  const empresa = nombreEmpresa(owner)
  const responderA = respuesta.trim() || owner.email || '—'
  const cambiado =
    respuesta.trim().toLowerCase() !== inicial.respuesta || copia !== inicial.copia || asunto !== inicial.asunto || mensaje !== inicial.mensaje

  const ejemplo = {
    cliente: 'Laura García',
    numero: `${owner.serie_factura || 'F'}${new Date().getFullYear()}-0001`,
    fecha: hoyISO(),
    vencimiento: sumarDias(hoyISO(), 30),
    total: 1210,
    empresa,
    pais: 'España',
    lineas: [
      { concepto: 'Diseño de la web corporativa\nMaquetación, textos y puesta en marcha', cantidad: 1, precio: 800, iva: 21 },
      { concepto: 'Mantenimiento mensual', cantidad: 2, precio: 100, iva: 21 },
    ],
    irpf_pct: 0,
  }
  const listo = correoDeFactura({ asunto, mensaje }, ejemplo)
  const html = htmlCorreoFactura(listo.mensaje, ejemplo, {
    empresa,
    color: owner.color_marca,
    logo,
    respuesta: responderA,
    telefono: owner.telefono,
    iban: owner.iban,
  })

  const insertar = (v: string) => {
    const token = `{${v}}`
    const campo = ultimoCampo.current
    const el = campo === 'asunto' ? refAsunto.current : refMensaje.current
    const valor = campo === 'asunto' ? asunto : mensaje
    const ini = el?.selectionStart ?? valor.length
    const fin = el?.selectionEnd ?? valor.length
    const nuevo = valor.slice(0, ini) + token + valor.slice(fin)
    if (campo === 'asunto') setAsunto(nuevo)
    else setMensaje(nuevo)
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(ini + token.length, ini + token.length)
    })
  }

  const guardar = async () => {
    const r = respuesta.trim().toLowerCase()
    if (r && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r)) return notify('Pon un email válido para las respuestas', 'error')
    if (!asunto.trim()) return notify('El asunto no puede quedar vacío', 'error')
    if (!mensaje.trim()) return notify('El mensaje no puede quedar vacío', 'error')
    setGuardando(true)
    const { error } = await supabase
      .from('profiles')
      .update({
        email_respuesta: r || null,
        correo_copia: copia,
        // Si es el texto de por defecto se guarda vacío: así le llegan las mejoras que hagamos
        correo_asunto: asunto.trim() === def.asunto ? null : asunto.trim(),
        correo_mensaje: mensaje.trim() === def.mensaje ? null : mensaje.trim(),
      })
      .eq('id', owner.id)
    setGuardando(false)
    if (error) return notify(await errorMessage(error), 'error')
    await refresh()
    notify('Plantilla guardada')
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-6">
        {!activo && (
          <div className="rounded-xl bg-ambar/10 px-4 py-3 text-sm text-ambar">
            Falta activar el envío de facturas en la base de datos (supabase/envio-facturas.sql). Hasta entonces no se puede guardar.
          </div>
        )}
        <Card className="space-y-4 p-5">
          <div>
            <h4 className="font-semibold">Remitente y respuestas</h4>
            <p className="mt-1 text-sm text-muted">
              Tus facturas salen desde <strong className="text-ink">{REMITENTE_FACTURAS}</strong> con tu nombre («{empresa} vía NomoTax»). Cuando tu
              cliente responda, la respuesta te llega a ti, no a NomoTax.
            </p>
          </div>
          <Field label="Las respuestas llegan a" hint={`Si lo dejas vacío, al email de la cuenta (${owner.email ?? '—'}).`}>
            <Input type="email" value={respuesta} onChange={(e) => setRespuesta(e.target.value)} placeholder={owner.email ?? 'facturacion@tuempresa.com'} />
          </Field>
          <label className="flex items-start gap-2.5 text-sm">
            <input type="checkbox" className="mt-0.5 size-4 accent-ink" checked={copia} onChange={(e) => setCopia(e.target.checked)} />
            <span>
              Recibir una copia oculta de cada factura que envíe
              <span className="block text-xs text-muted">Llega al email de respuestas.</span>
            </span>
          </label>
        </Card>

        <Card className="space-y-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h4 className="font-semibold">Plantilla del correo</h4>
              <p className="mt-1 text-sm text-muted">Al enviar cada factura puedes retocar el texto antes de mandarlo.</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              icon={<RotateCcw className="size-3.5" />}
              onClick={() => {
                setAsunto(def.asunto)
                setMensaje(def.mensaje)
              }}
              disabled={asunto === def.asunto && mensaje === def.mensaje}
            >
              Por defecto
            </Button>
          </div>
          <Field label="Asunto">
            <Input ref={refAsunto} value={asunto} maxLength={200} onFocus={() => (ultimoCampo.current = 'asunto')} onChange={(e) => setAsunto(e.target.value)} />
          </Field>
          <Field label="Mensaje">
            <Textarea
              ref={refMensaje}
              rows={11}
              maxLength={5000}
              value={mensaje}
              onFocus={() => (ultimoCampo.current = 'mensaje')}
              onChange={(e) => setMensaje(e.target.value)}
            />
          </Field>
          <div>
            <p className="mb-2 text-[13px] font-medium text-ink/80">Insertar dato de la factura</p>
            <div className="flex flex-wrap gap-1.5">
              {VARIABLES_CORREO.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  title={v.detalle}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => insertar(v.id)}
                  className="rounded-full bg-paper px-2.5 py-1 font-mono text-xs text-ink ring-1 ring-line hover:bg-lima/40"
                >
                  {`{${v.id}}`}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">
              A los clientes de fuera de España se les envía en inglés, igual que el PDF. El logo y el color son los de tu Perfil.
            </p>
          </div>
        </Card>

        <div className="flex justify-end">
          <Button variant="accent" icon={<Save className="size-4" />} onClick={guardar} loading={guardando} disabled={!cambiado || !activo}>
            Guardar
          </Button>
        </div>
      </div>

      <div className="lg:sticky lg:top-0 lg:self-start">
        <p className="mb-2 text-[13px] font-medium text-ink/80">Vista previa (con datos de ejemplo)</p>
        <VistaPreviaCorreo de={`${empresa} vía NomoTax <${REMITENTE_FACTURAS}>`} responder={responderA} asunto={listo.asunto} html={html} />
      </div>
    </div>
  )
}
