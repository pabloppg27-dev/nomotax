// Reuniones ↔ Google Calendar. Publicado: función crm-dictado (secreto CRM_AGENDA_SECRETO) → Apps Script.
// Local: /api/agenda (CRM_AGENDA_SECRETO en .env.local). Sin clave: se simula (modo demo).
import { MODO, supabase } from './supabase'
import type { Cliente, Reunion } from './tipos'

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

/** Datos de quien reservó desde la web o el área de clientes (vienen en la descripción del evento) */
export function datosReserva(descripcion: string) {
  const campo = (...k: string[]) => {
    for (const x of k) { const m = descripcion.match(new RegExp(`^${x}:\\s*(.+)$`, 'mi')); if (m && m[1].trim() !== '—') return m[1].trim() }
    return null
  }
  const nombre = campo('Nombre', 'Name'); const email = campo('Email')?.toLowerCase() ?? null
  if (!nombre || !email) return null
  return { nombre, email, telefono: campo('Teléfono', 'Phone'), empresa: campo('Empresa'), motivo: campo('Motivo', 'Topic'), servicio: campo('Servicio', 'Service') }
}

const sinTildes = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()

/** Trae las reuniones de Google Calendar al CRM: crea las nuevas y actualiza hora/título/Meet de las que ya están.
 *  El cliente se asocia por el email del invitado. Si reservó desde la web y no es cliente, se crea como
 *  cliente externo con su nombre, email y teléfono. El email queda guardado en la ficha del cliente.
 *  Devuelve cuántas ha creado o cambiado. */
let enCurso: Promise<number> | null = null // evita dos sincronizaciones a la vez (duplicados)
export function sincronizar(...a: Parameters<typeof sincronizarYa>) {
  return (enCurso ??= sincronizarYa(...a).finally(() => { enCurso = null }))
}
async function sincronizarYa(
  reuniones: Reunion[],
  todos: Cliente[],
  db: {
    crearReunion: (r: Record<string, unknown>) => Promise<unknown>
    cambiarReunion: (id: string, c: Record<string, unknown>) => Promise<void>
    crearCliente: (c: Partial<Cliente>) => Promise<Cliente>
    recordarEmail: (c: Cliente | undefined, email?: string | null) => Promise<boolean>
  },
) {
  const r = await listar()
  if (!r.ok) throw new Error(r.error === 'no-autorizado' ? 'Google Calendar no acepta la clave (CRM_SECRETO)' : r.error ?? 'No se ha podido leer Google Calendar')
  const clientes = [...todos] // aquí se añaden los que se creen
  const porEvento = new Map(reuniones.filter((x) => x.evento_id).map((x) => [x.evento_id!, x]))
  const porEmail = new Map<string, Cliente>()
  for (const c of clientes) if (c.email) porEmail.set(c.email.toLowerCase(), c)
  // Emails usados antes en reuniones ya asociadas a un cliente
  for (const x of reuniones) { const c = clientes.find((k) => k.id === x.cliente_id); if (c && x.email && !porEmail.has(x.email.toLowerCase())) porEmail.set(x.email.toLowerCase(), c) }
  const porNombre = (n?: string | null) => (n ? clientes.find((c) => sinTildes(c.nombre) === sinTildes(n)) : undefined)

  const hechos = new Set<string>() // clientes a los que ya se ha intentado guardar el email
  /** Cliente del evento: por email; si es una reserva, por nombre de empresa/persona o creándolo. */
  async function clienteDe(e: EventoGoogle): Promise<Cliente | undefined> {
    const ya = e.emails.map((m) => porEmail.get(m)).find(Boolean)
    if (ya) return ya
    const d = datosReserva(e.descripcion)
    if (!d) return undefined
    let c = porEmail.get(d.email) ?? porNombre(d.empresa) ?? porNombre(d.nombre)
    if (!c) {
      const notas = ['Reservó una llamada desde la web.', d.servicio && `Servicio: ${d.servicio}`, d.motivo && `Motivo: ${d.motivo}`].filter(Boolean).join('\n')
      c = await db.crearCliente({ nombre: d.empresa ? `${d.empresa} (${d.nombre})` : d.nombre, email: d.email, telefono: d.telefono, notas })
      clientes.push(c)
    } else if (!hechos.has(c.id)) { hechos.add(c.id); await db.recordarEmail(c, d.email) }
    porEmail.set(d.email, c)
    return c
  }

  let n = 0
  for (const e of r.eventos ?? []) {
    const ya = porEvento.get(e.evento_id)
    if (ya) {
      const cambios: Record<string, unknown> = {}
      if (ya.inicio !== e.inicio && new Date(ya.inicio).getTime() !== new Date(e.inicio).getTime() || ya.duracion !== e.duracion || ya.titulo !== e.titulo || (ya.meet_url || '') !== e.meet) {
        Object.assign(cambios, { inicio: e.inicio, duracion: e.duracion, titulo: e.titulo, meet_url: e.meet || null })
      }
      if (!ya.cliente_id) { const c = await clienteDe(e); if (c) cambios.cliente_id = c.id }
      if (!ya.email && e.emails[0]) cambios.email = e.emails[0]
      if (Object.keys(cambios).length) { await db.cambiarReunion(ya.id, cambios); n++ }
      continue
    }
    const c = await clienteDe(e)
    await db.crearReunion({ titulo: e.titulo, descripcion: e.descripcion || null, inicio: e.inicio, duracion: e.duracion, cliente_id: c?.id ?? null,
      email: e.emails[0] ?? null, meet: !!e.meet, meet_url: e.meet || null, evento_id: e.evento_id, evento_url: e.evento_url || null })
    n++
  }
  // Clientes con reuniones pero sin email en su ficha: se guarda
  // (el de su reunión más reciente; una vez por cliente)
  for (const x of [...reuniones].reverse()) {
    if (!x.cliente_id || !x.email || hechos.has(x.cliente_id)) continue
    hechos.add(x.cliente_id)
    await db.recordarEmail(clientes.find((c) => c.id === x.cliente_id), x.email).catch(() => false)
  }
  return n
}
