import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import * as db from './datos'
import { MODO, supabase } from './supabase'
import type { Cliente, Proyecto, Reunion, Tarea } from './tipos'

interface Store {
  clientes: Cliente[]
  proyectos: Proyecto[]
  tareas: Tarea[]
  reuniones: Reunion[]
  cargando: boolean
  error: string | null
  recargar: () => Promise<void>
  cliente: (id?: string | null) => Cliente | undefined
  proyecto: (id?: string | null) => Proyecto | undefined
}
const Ctx = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [proyectos, setProyectos] = useState<Proyecto[]>([])
  const [tareas, setTareas] = useState<Tarea[]>([])
  const [reuniones, setReuniones] = useState<Reunion[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const recargar = useCallback(async () => {
    try {
      if (MODO === 'real' && !(await supabase.auth.getSession()).data.session) throw new Error('sin-sesion')
      const [c, p, t] = await Promise.all([db.clientes(), db.proyectos(), db.tareas()])
      // Reuniones aparte: si aún no se ha ejecutado reuniones.sql, el resto del CRM sigue funcionando
      const rs = await db.reuniones().catch(() => [] as Reunion[])
      // Cliente sin email guardado: el de su última reunión con invitado
      const ultimo = new Map<string, string>()
      for (const r of rs) if (r.cliente_id && r.email) ultimo.set(r.cliente_id, r.email)
      setClientes(c.map((x) => (x.email || !ultimo.has(x.id) ? x : { ...x, email: ultimo.get(x.id), emailDeReunion: true })))
      setProyectos(p); setTareas(t); setReuniones(rs); setError(null)
    } catch (e) {
      setError((e as Error).message ?? String(e))
    } finally { setCargando(false) }
  }, [])
  useEffect(() => { void recargar() }, [recargar])

  const cliente = (id?: string | null) => (id ? clientes.find((c) => c.id === id) : undefined)
  const proyecto = (id?: string | null) => (id ? proyectos.find((p) => p.id === id) : undefined)
  return <Ctx.Provider value={{ clientes, proyectos, tareas, reuniones, cargando, error, recargar, cliente, proyecto }}>{children}</Ctx.Provider>
}
export function useStore() {
  const s = useContext(Ctx); if (!s) throw new Error('Sin StoreProvider'); return s
}
