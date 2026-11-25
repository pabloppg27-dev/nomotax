// CRM NomoTax · función crm-dictado (Supabase). NO editar index.ts: se genera con
// `node scripts/empaquetar.mjs` a partir de este archivo + servidor/pensar.ts.
// Entrada (POST JSON): { texto, hoy, clientes, proyectos }. Secretos: ANTHROPIC_API_KEY, OPENAI_API_KEY, CRM_AGENDA_SECRETO. Solo el asesor.
// { accion: 'transcribir', audio (base64), tipo, clientes, proyectos } → { texto } (voz → texto con OpenAI; { comprobar: true } solo mira si hay clave).
// { accion: 'crm_agendar' | 'crm_cancelar', … } → crea/borra la reunión en Google Calendar (Apps Script).
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
  const b = await req.json().catch(() => null) as (EntradaDictado & { accion?: string }) | null
  if (b?.accion === 'crm_agendar' || b?.accion === 'crm_cancelar' || b?.accion === 'crm_listar') {
    try { return json(await agenda(Deno.env.get('CRM_AGENDA_SECRETO') ?? '', b as unknown as Record<string, unknown>)) }
    catch (e) { return json({ ok: false, error: (e as Error).message }, 502) }
  }
  if (b?.accion === 'transcribir') {
    const clave = Deno.env.get('OPENAI_API_KEY') ?? ''
    if (!clave) return json({ error: 'sin-clave' }, 503)
    if ((b as { comprobar?: boolean }).comprobar) return json({ ok: true })
    try { return json(await transcribir(clave, b as unknown as EntradaTranscripcion)) }
    catch (e) { return json({ error: (e as Error).message }, 502) }
  }
  if (!b?.texto?.trim()) return json({ error: 'No hay texto' }, 400)
  try {
    return json(await pensar(new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') }), b))
  } catch (e) {
    return json({ error: (e as Error).message }, 502)
  }
})
