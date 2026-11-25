// Acceso a datos: mismo interfaz en modo demo (localStorage) y real (Supabase).
import { MODO, supabase } from './supabase'
import type { Cliente, FilaImpuestos, Proyecto, Reunion, Tarea } from './tipos'

type Tabla = 'crm_clientes' | 'crm_proyectos' | 'crm_impuestos' | 'crm_tareas' | 'crm_reuniones'
type Fila = { id: string } & Record<string, unknown>

const uid = () => crypto.randomUUID()
const hoyISO = () => new Date().toISOString()

// ---------- demo ----------
const CLAVE = 'crm-demo-v1'
type Demo = Record<Tabla, Fila[]> & { nomotax: Cliente[] }

function semilla(): Demo {
  const nomotax: Cliente[] = [
    { id: uid(), origen: 'nomotax', nombre: 'Nova Hiring SL', tipo: 'SL', pais: 'España' },
    { id: uid(), origen: 'nomotax', nombre: 'Vilasans SL', tipo: 'SL', pais: 'España' },
    { id: uid(), origen: 'nomotax', nombre: 'Xapa SL', tipo: 'SL', pais: 'España' },
    { id: uid(), origen: 'nomotax', nombre: 'Pau Raset', tipo: 'Autónomo', pais: 'España' },
  ]
  const ext: Fila = { id: uid(), profile_id: null, nombre: 'John Smith LLC', tipo: 'LLC', pais: 'Estados Unidos', created_at: hoyISO() }
  const proy: Fila = { id: uid(), nombre: '4T 2026 España', tipo: 'impuestos', estado: 'activo', modelos: ['303', '111', '115', '349'], created_at: hoyISO() }
  const filas = nomotax.map((c, i) => ({
    id: uid(), proyecto_id: proy.id, cliente_id: c.id, created_at: hoyISO(),
    estados: { '303': i === 0 ? 'hecho' : 'pendiente', '111': 'pendiente', '115': i > 1 ? 'na' : 'pendiente', '349': 'na' },
  }))
  const proy2: Fila = { id: uid(), nombre: 'Constitución LLC John Smith', tipo: 'normal', cliente_id: ext.id, estado: 'activo', modelos: [], created_at: hoyISO() }
  const t = (titulo: string, prioridad: string, extra: Record<string, unknown> = {}): Fila =>
    ({ id: uid(), titulo, prioridad, enlaces: [], hecha: false, created_at: hoyISO(), ...extra })
  const en = (d: number) => { const f = new Date(); f.setDate(f.getDate() + d); return f.toISOString().slice(0, 10) }
  return {
    nomotax,
    crm_clientes: [ext],
    crm_proyectos: [proy, proy2],
    crm_impuestos: filas,
    crm_reuniones: [],
    crm_tareas: [
      t('Presentar 303 de Vilasans', 'alta', { cliente_id: nomotax[1].id, proyecto_id: proy.id, fecha: en(2) }),
      t('Pedir EIN al IRS', 'alta', { cliente_id: ext.id, proyecto_id: proy2.id, fecha: en(5), descripcion: 'Formulario SS-4 por fax.' }),
      t('Revisar nóminas de noviembre', 'media', { cliente_id: nomotax[0].id }),
      t('Actualizar web con precios 2027', 'baja'),
    ],
  }
}
function leer(): Demo {
  const raw = localStorage.getItem(CLAVE)
  if (raw) { const d = JSON.parse(raw); d.crm_reuniones ??= []; return d }
  const d = semilla(); localStorage.setItem(CLAVE, JSON.stringify(d)); return d
}
const guardar = (d: Demo) => localStorage.setItem(CLAVE, JSON.stringify(d))

// ---------- genérico ----------
async function listar<T>(tabla: Tabla): Promise<T[]> {
  if (MODO === 'demo') return leer()[tabla] as unknown as T[]
  const { data, error } = await supabase.from(tabla).select('*').order('created_at')
  if (error) throw error
  return data as T[]
}
async function crear<T>(tabla: Tabla, fila: Record<string, unknown>): Promise<T> {
  if (MODO === 'demo') {
    const d = leer(); const n = { id: uid(), created_at: hoyISO(), ...fila } as Fila
    d[tabla].push(n); guardar(d); return n as unknown as T
  }
  const { data, error } = await supabase.from(tabla).insert(fila).select().single()
  if (error) throw error
  return data as T
}
async function cambiar(tabla: Tabla, id: string, cambios: Record<string, unknown>) {
  if (MODO === 'demo') {
    const d = leer(); d[tabla] = d[tabla].map((f) => (f.id === id ? { ...f, ...cambios } : f)); guardar(d); return
  }
  const { error } = await supabase.from(tabla).update(cambios).eq('id', id)
  if (error) throw error
}
async function borrar(tabla: Tabla, id: string) {
  if (MODO === 'demo') {
    const d = leer(); d[tabla] = d[tabla].filter((f) => f.id !== id)
    if (tabla === 'crm_proyectos') {
      d.crm_impuestos = d.crm_impuestos.filter((f) => f.proyecto_id !== id)
      d.crm_tareas = d.crm_tareas.map((t) => (t.proyecto_id === id ? { ...t, proyecto_id: null } : t))
      d.crm_reuniones = d.crm_reuniones.map((t) => (t.proyecto_id === id ? { ...t, proyecto_id: null } : t))
    }
    guardar(d); return
  }
  const { error } = await supabase.from(tabla).delete().eq('id', id)
  if (error) throw error
}

// ---------- clientes ----------
/** Clientes de NomoTax (profiles) + externos, con las notas propias encima */
export async function clientes(): Promise<Cliente[]> {
  const propios = await listar<Fila>('crm_clientes')
  let nomotax: Cliente[]
  if (MODO === 'demo') nomotax = leer().nomotax
  else {
    const { data, error } = await supabase.from('profiles')
      .select('id, nombre, nombre_comercial, nif, email, telefono, pais').eq('role', 'client')
    if (error) throw error
    nomotax = (data ?? []).map((p): Cliente => ({
      id: p.id, origen: 'nomotax', nombre: p.nombre_comercial || p.nombre || p.email || 'Sin nombre',
      nif: p.nif, email: p.email, telefono: p.telefono, pais: p.pais,
    }))
  }
  const ficha = new Map(propios.filter((f) => f.profile_id).map((f) => [f.profile_id as string, f]))
  // Email de un cliente NomoTax: el que se haya guardado en el CRM y, si no, el de su perfil
  // (las cuentas técnicas @sin-acceso no tienen buzón real).
  const emailReal = (e?: string | null) => (e && !/@sin-acceso\.nomotax\.io$/i.test(e) ? e : null)
  const lista: Cliente[] = nomotax.map((c) => {
    const f = ficha.get(c.id)
    return { ...c, notas: (f?.notas as string) ?? null, email: emailReal(f?.email as string) ?? emailReal(c.email) }
  })
  for (const f of propios) if (!f.profile_id) lista.push({ ...(f as unknown as Cliente), origen: 'externo' })
  return lista.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}
export const crearCliente = (c: Partial<Cliente>) => {
  const { origen: _o, id: _i, ...resto } = c
  if (resto.email) resto.email = resto.email.trim().toLowerCase()
  return crear<Cliente>('crm_clientes', resto).then((n) => ({ ...n, origen: 'externo' as const }))
}
export async function guardarCliente(c: Cliente, cambios: Partial<Cliente>) {
  if (c.origen === 'externo') return cambiar('crm_clientes', c.id, cambios)
  // Cliente de NomoTax: aquí solo se guardan las notas y el email (el resto viene de su perfil)
  const propios: Partial<Cliente> = {}
  if ('notas' in cambios) propios.notas = cambios.notas
  if ('email' in cambios) propios.email = cambios.email
  const f = (await listar<Fila>('crm_clientes')).find((p) => p.profile_id === c.id)
  if (f) return cambiar('crm_clientes', f.id, propios)
  await crear('crm_clientes', { profile_id: c.id, nombre: c.nombre, ...propios })
}

/** Recuerda el email de un cliente al usarlo (reunión, reserva…). Solo si aún no tenía uno. */
export async function recordarEmail(c: Cliente | undefined, email?: string | null) {
  const e = email?.trim().toLowerCase()
  if (!c || !e || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) || (c.email && !c.emailDeReunion)) return false
  await guardarCliente(c, { email: e })
  return true
}
export const borrarCliente = (id: string) => borrar('crm_clientes', id)

// ---------- proyectos ----------
export const proyectos = () => listar<Proyecto>('crm_proyectos')
export const crearProyecto = (p: Partial<Proyecto>) => crear<Proyecto>('crm_proyectos', p)
export const cambiarProyecto = (id: string, c: Partial<Proyecto>) => cambiar('crm_proyectos', id, c)
export const borrarProyecto = (id: string) => borrar('crm_proyectos', id)

export const filasImpuestos = async (proyectoId: string) =>
  (await listar<FilaImpuestos>('crm_impuestos')).filter((f) => f.proyecto_id === proyectoId)
export const crearFila = (f: Partial<FilaImpuestos>) => crear<FilaImpuestos>('crm_impuestos', f)
export const cambiarFila = (id: string, c: Partial<FilaImpuestos>) => cambiar('crm_impuestos', id, c)
export const borrarFila = (id: string) => borrar('crm_impuestos', id)

// ---------- tareas ----------
export const tareas = () => listar<Tarea>('crm_tareas')
export const crearTarea = (t: Partial<Tarea>) => crear<Tarea>('crm_tareas', { enlaces: [], hecha: false, prioridad: 'media', ...t })
export const cambiarTarea = (id: string, c: Partial<Tarea>) => cambiar('crm_tareas', id, c)
export const borrarTarea = (id: string) => borrar('crm_tareas', id)

// ---------- reuniones ----------
export const reuniones = async () => (await listar<Reunion>('crm_reuniones')).sort((a, b) => a.inicio.localeCompare(b.inicio))
export const crearReunion = (r: Partial<Reunion>) => crear<Reunion>('crm_reuniones', { duracion: 60, meet: true, ...r })
export const cambiarReunion = (id: string, c: Partial<Reunion>) => cambiar('crm_reuniones', id, c)
export const borrarReunion = (id: string) => borrar('crm_reuniones', id)
