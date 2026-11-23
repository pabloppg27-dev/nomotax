import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** demo = todo en este navegador (localStorage), sin tocar Supabase. real = tablas de crm.sql */
export const MODO: 'demo' | 'real' = import.meta.env.VITE_CRM_MODO === 'real' && url && key ? 'real' : 'demo'

export const supabase = createClient(url || 'http://localhost:54321', key || 'sin-configurar', {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'crm-nomotax' },
})
