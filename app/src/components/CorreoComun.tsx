/**
 * Piezas comunes de Configuración → Correo y Plantillas, y del envío de facturas:
 * vista previa del correo, logo, nombre de la empresa y el remitente real (SMTP propio o info@nomotax.io).
 */
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../lib/auth'
import { signedUrl, supabase } from '../lib/supabase'
import type { Profile } from '../lib/types'
import type { SmtpEmpresa } from '../lib/smtp'

/** Remitente de los correos cuando la empresa no ha conectado el suyo (el secreto FACTURAS_FROM de enviar-factura; Hostinger no deja enviar como el alias invoice@) */
export const REMITENTE_FACTURAS = 'info@nomotax.io'

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

/**
 * El SMTP propio de la empresa (smtp_empresas, sin la contraseña).
 * `cargando` mientras se lee; `config` null si no hay (o si falta ejecutar supabase/correo-empresa.sql: `sinTabla`).
 */
export function useSmtpEmpresa() {
  const { owner } = useAuth()
  const [config, setConfig] = useState<SmtpEmpresa | null>(null)
  const [cargando, setCargando] = useState(true)
  const [sinTabla, setSinTabla] = useState(false)
  const id = owner?.id

  const recargar = useCallback(async () => {
    if (!id) return
    const { data, error } = await supabase.from('smtp_empresas').select('*').eq('owner_id', id).maybeSingle()
    setSinTabla(Boolean(error))
    setConfig(error ? null : (data as SmtpEmpresa | null))
    setCargando(false)
  }, [id])

  useEffect(() => {
    setCargando(true)
    void recargar()
  }, [recargar])

  return { config, cargando, sinTabla, recargar }
}

/** Quién figura como remitente: el correo propio (si está conectado y activo) o info@nomotax.io «vía NomoTax» */
export function useRemitente(): { de: string; propio: boolean; direccion: string } {
  const { owner } = useAuth()
  const { config } = useSmtpEmpresa()
  const empresa = nombreEmpresa(owner)
  if (config?.activo) {
    const nombre = config.remitente_nombre?.trim() || empresa
    return { de: `${nombre} <${config.remitente_email}>`, propio: true, direccion: config.remitente_email }
  }
  return { de: `${empresa} vía NomoTax <${REMITENTE_FACTURAS}>`, propio: false, direccion: REMITENTE_FACTURAS }
}

/** El correo tal y como le llega al destinatario: remitente, responder a, asunto y cuerpo */
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
