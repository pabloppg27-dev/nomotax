import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const configured = Boolean(url && key)

export const supabase = createClient(url || 'http://localhost:54321', key || 'sin-configurar', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})

export const BUCKET = 'documentos'

/** Mensaje legible a partir de un error de Supabase o de una función */
export async function errorMessage(err: unknown): Promise<string> {
  if (!err) return 'Error desconocido'
  const anyErr = err as { message?: string; context?: Response }
  if (anyErr.context && typeof anyErr.context.json === 'function') {
    try {
      const body = await anyErr.context.json()
      if (body?.error) return body.error
    } catch {
      /* sin cuerpo */
    }
  }
  return anyErr.message || String(err)
}

export async function signedUrl(path: string, seconds = 600): Promise<string | null> {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, seconds)
  return data?.signedUrl ?? null
}

/** Abre un archivo privado en otra pestaña (la ventana se abre ya, para que Safari no la bloquee) */
export async function abrirDocumento(path: string) {
  const w = window.open('', '_blank')
  const url = await signedUrl(path, 300)
  if (!url) {
    w?.close()
    return
  }
  if (w) w.location.href = url
  else window.location.href = url
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
