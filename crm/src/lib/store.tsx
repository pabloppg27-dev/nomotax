import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import * as db from './datos'
import { MODO, supabase } from './supabase'
import type { Cliente, Proyecto, Tarea } from './tipos'

interface Store {
  clientes: Cliente[]
  proyectos: Proyecto[]
  tareas: Tarea[]
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
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const recargar = useCallback(async () => {
    try {
      if (MODO === 'real' && !(await supabase.auth.getSession()).data.session) throw new Error('sin-sesion')
      const [c, p, t] = await Promise.all([db.clientes(), db.proyectos(), db.tareas()])
      setClientes(c); setProyectos(p); setTareas(t); setError(null)
    } catch (e) {
      setError((e as Error).message ?? String(e))
    } finally { setCargando(false) }
  }, [])
  useEffect(() => { void recargar() }, [recargar])

  const cliente = (id?: string | null) => (id ? clientes.find((c) => c.id === id) : undefined)
  const proyecto = (id?: string | null) => (id ? proyectos.find((p) => p.id === id) : undefined)
  return <Ctx.Provider value={{ clientes, proyectos, tareas, cargando, error, recargar, cliente, proyecto }}>{children}</Ctx.Provider>
}
export function useStore() {
  const s = useContext(Ctx); if (!s) throw new Error('Sin StoreProvider'); return s
}
