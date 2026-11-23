// Reuniones ↔ Google Calendar. Publicado: función crm-dictado (secreto CRM_AGENDA_SECRETO) → Apps Script.
// Local: /api/agenda (CRM_AGENDA_SECRETO en .env.local). Sin clave: se simula (modo demo).
import { MODO, supabase } from './supabase'

export interface Agendado { ok: boolean; evento_id?: string; evento_url?: string; meet?: string; error?: string; simulado?: boolean }

async function llamar(datos: Record<string, unknown>): Promise<Agendado> {
  if (MODO === 'real') {
    const { data, error } = await supabase.functions.invoke('crm-dictado', { body: datos })
    if (error) throw error
    return data as Agendado
  }
  const r = await fetch('/api/agenda', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos) }).catch(() => null)
  if (r?.ok) return r.json()
  const err = r ? await r.json().catch(() => ({})) : {}
  if (r && err.error !== 'sin-clave') throw new Error(err.error ?? 'Error con Google Calendar')
  if (datos.accion === 'crm_listar') return { ok: true, simulado: true, eventos: [] } as Agendado
  return { ok: true, simulado: true, meet: datos.meet ? 'https://meet.google.com/demo-demo-demo' : '' }
}

export const agendar = (d: { titulo: string; descripcion: string; inicio: string; duracion: number; email?: string | null; nombre?: string; meet: boolean; forzar?: boolean }) =>
  llamar({ accion: 'crm_agendar', ...d })

export interface EventoGoogle { evento_id: string; titulo: string; descripcion: string; inicio: string; duracion: number; emails: string[]; meet: string; evento_url: string }
export const listar = () => llamar({ accion: 'crm_listar' }) as Promise<Agendado & { eventos?: EventoGoogle[] }>

export const cancelar = (evento_id: string) => llamar({ accion: 'crm_cancelar', evento_id })

/** fecha YYYY-MM-DD + hora HH:MM (hora de este ordenador, España) → ISO */
export const aISO = (fecha: string, hora: string) => new Date(`${fecha}T${hora}:00`).toISOString()
export const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
export const diaLocal = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

/** Trae las reuniones de Google Calendar al CRM: crea las nuevas y actualiza hora/título/Meet de las que ya están.
 *  El cliente se asocia por el email del invitado. Devuelve cuántas ha creado o cambiado. */
let enCurso: Promise<number> | null = null // evita dos sincronizaciones a la vez (duplicados)
export function sincronizar(...a: Parameters<typeof sincronizarYa>) {
  return (enCurso ??= sincronizarYa(...a).finally(() => { enCurso = null }))
}
async function sincronizarYa(
  reuniones: { id: string; evento_id?: string | null; inicio: string; duracion: number; titulo: string; meet_url?: string | null }[],
  clientes: { id: string; email?: string | null }[],
  db: { crearReunion: (r: Record<string, unknown>) => Promise<unknown>; cambiarReunion: (id: string, c: Record<string, unknown>) => Promise<void> },
) {
  const r = await listar()
  if (!r.ok) throw new Error(r.error === 'no-autorizado' ? 'Google Calendar no acepta la clave (CRM_SECRETO)' : r.error ?? 'No se ha podido leer Google Calendar')
  const porEvento = new Map(reuniones.filter((x) => x.evento_id).map((x) => [x.evento_id!, x]))
  const porEmail = new Map(clientes.filter((c) => c.email).map((c) => [c.email!.toLowerCase(), c.id]))
  let n = 0
  for (const e of r.eventos ?? []) {
    const ya = porEvento.get(e.evento_id)
    if (ya) {
      if (ya.inicio !== e.inicio && new Date(ya.inicio).getTime() !== new Date(e.inicio).getTime() || ya.duracion !== e.duracion || ya.titulo !== e.titulo || (ya.meet_url || '') !== e.meet) {
        await db.cambiarReunion(ya.id, { inicio: e.inicio, duracion: e.duracion, titulo: e.titulo, meet_url: e.meet || null }); n++
      }
      continue
    }
    const cliente_id = e.emails.map((m) => porEmail.get(m)).find(Boolean) ?? null
    await db.crearReunion({ titulo: e.titulo, descripcion: e.descripcion || null, inicio: e.inicio, duracion: e.duracion, cliente_id,
      email: e.emails[0] ?? null, meet: !!e.meet, meet_url: e.meet || null, evento_id: e.evento_id, evento_url: e.evento_url || null })
    n++
  }
  return n
}
