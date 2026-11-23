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
  return { ok: true, simulado: true, meet: datos.meet ? 'https://meet.google.com/demo-demo-demo' : '' }
}

export const agendar = (d: { titulo: string; descripcion: string; inicio: string; duracion: number; email?: string | null; nombre?: string; meet: boolean; forzar?: boolean }) =>
  llamar({ accion: 'crm_agendar', ...d })

export const cancelar = (evento_id: string) => llamar({ accion: 'crm_cancelar', evento_id })

/** fecha YYYY-MM-DD + hora HH:MM (hora de este ordenador, España) → ISO */
export const aISO = (fecha: string, hora: string) => new Date(`${fecha}T${hora}:00`).toISOString()
export const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
export const diaLocal = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
