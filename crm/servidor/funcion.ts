// CRM NomoTax · función crm-dictado (Supabase). NO editar index.ts: se genera con
// `node scripts/empaquetar.mjs` a partir de este archivo + servidor/pensar.ts.
// Entrada (POST JSON): { texto, hoy, clientes, proyectos }. Secreto: ANTHROPIC_API_KEY. Solo el asesor.
import Anthropic from 'npm:@anthropic-ai/sdk@^1.8.0'
import { createClient } from 'npm:@supabase/supabase-js@^2.119.0'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

function clavePublica(req: Request): string {
  const k = req.headers.get('apikey') ?? Deno.env.get('SUPABASE_ANON_KEY')
  if (k) return k
  const raw = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? ''
  try { const o = JSON.parse(raw); return typeof o === 'string' ? o : o.default ?? Object.values(o)[0] } catch { return raw }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const auth = req.headers.get('Authorization')
  if (!auth) return json({ error: 'Falta la sesión' }, 401)
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, clavePublica(req), { global: { headers: { Authorization: auth } } })
  const { data: esAsesor } = await supabase.rpc('is_advisor')
  if (!esAsesor) return json({ error: 'Solo para el asesor' }, 403)
  const b = await req.json().catch(() => null) as EntradaDictado | null
  if (!b?.texto?.trim()) return json({ error: 'No hay texto' }, 400)
  try {
    return json(await pensar(new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') }), b))
  } catch (e) {
    return json({ error: (e as Error).message }, 502)
  }
})
