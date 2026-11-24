import { createClient } from '@supabase/supabase-js'
import { tipoDocumento, verDocumento } from './visor'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const configured = Boolean(url && key)

export const supabase = createClient(url || 'http://localhost:54321', key || 'sin-configurar', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})

/**
 * Cliente aparte para el enlace de «nueva contraseña». Guarda la sesión solo en memoria:
 * el resto de la app no la ve y desaparece al cerrar la pestaña.
 */
export function clienteRecuperacion() {
  return createClient(url || 'http://localhost:54321', key || 'sin-configurar', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'nt-recuperacion' },
  })
}

export const BUCKET = 'documentos'

/** Mensaje legible a partir de un error de Supabase o de una función */
export async function errorMessage(err: unknown): Promise<string> {
  if (!err) return 'Error desconocido'
  const anyErr = err as { message?: string; context?: Response }
  if (anyErr.context && typeof anyErr.context.text === 'function') {
    const status = anyErr.context.status
    try {
      const texto = (await anyErr.context.text()).trim()
      let body: { error?: string; message?: string; msg?: string; code?: string } | null = null
      try {
        body = JSON.parse(texto)
      } catch {
        /* no es JSON */
      }
      if (body?.error) return body.error
      // Errores del propio Supabase (la función se cae, se queda sin tiempo…): se enseña el detalle
      const detalle = body?.message || body?.msg || body?.code || texto.slice(0, 200)
      if (detalle) return `Error del servidor (${status}): ${detalle}`
      if (status) return `Error del servidor (${status})`
    } catch {
      /* sin cuerpo */
    }
  }
  return anyErr.message || String(err)
}

export async function signedUrl(path: string, seconds = 600): Promise<string | null> {
  // Cuenta demo: sus documentos de ejemplo se publican con la web (public/demo-docs/), no están en Storage
  if (path.startsWith('demo-docs/')) return new URL(import.meta.env.BASE_URL + path, window.location.origin).href
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, seconds)
  return data?.signedUrl ?? null
}

/**
 * Abre un archivo privado en otra pestaña (la ventana se abre ya, para que Safari no la bloquee).
 * Si no se puede abrir otra pestaña (app de Mac, ventanas emergentes bloqueadas), se ve en el visor
 * de la app, que se cierra: nunca se navega fuera de la app (antes se quedaba el documento sin forma de volver).
 */
export async function abrirDocumento(path: string, nombre = path.split('/').pop() || 'Documento') {
  const w = window.open('', '_blank')
  const url = await signedUrl(path, 900)
  if (!url) {
    w?.close()
    return
  }
  if (w) w.location.href = url
  else verDocumento(url, nombre, tipoDocumento(path))
}

/** Llama a una Edge Function. Si la sesión ya no es válida, cierra sesión aquí y lo explica. */
export async function invocar<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, { body })
  if (error) {
    const status = (error as { context?: Response }).context?.status
    if (status === 401) {
      await supabase.auth.signOut({ scope: 'local' })
      throw new Error('Tu sesión ha caducado: vuelve a iniciar sesión')
    }
    throw new Error(await errorMessage(error))
  }
  return data as T
}
