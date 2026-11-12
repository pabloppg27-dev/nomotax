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
