import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { Miembro, Permiso, Profile, RolEnCuenta } from './types'
import { puedeRol } from './permisos'

const OWNER_KEY = 'nt-cuenta-activa'

/** Empresa a la que alguien tiene acceso como miembro (admin, socio, comercial o empleado) */
export interface Acceso extends Miembro {
  empresa: Pick<Profile, 'id' | 'nombre' | 'email'> & { nombre_comercial?: string | null }
}

interface AuthState {
  session: Session | null
  loading: boolean
  /** Perfil de quien ha iniciado sesión */
  me: Profile | null
  isAdvisor: boolean
  /** Cuenta que se está viendo (la propia, la de un cliente si eres asesor, o una empresa de la que eres miembro) */
  owner: Profile | null
  ownerId: string | null
  /** El asesor está viendo la cuenta de un cliente */
  viewingOther: boolean
  /** Empresas en las que eres miembro */
  accesos: Acceso[]
  /** Tu acceso en la empresa que estás viendo (si entras como miembro) */
  miembro: Acceso | null
  /** Qué eres en la empresa que estás viendo */
  rol: RolEnCuenta | null
  /** ¿Puedes usar ese módulo en la empresa que estás viendo? */
  puede: (p: Permiso) => boolean
  /** Usuario «member» al que ya no le queda ninguna empresa */
  sinAcceso: boolean
  setOwner: (id: string | null) => Promise<void>
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthState | null>(null)

async function loadProfile(id: string): Promise<Profile | null> {
  const { data } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle()
  return (data as Profile) ?? null
}

/** Accesos activos del usuario. Si la tabla aún no existe (falta supabase/usuarios.sql), ninguno. */
async function loadAccesos(userId: string): Promise<Acceso[]> {
  const { data, error } = await supabase.from('miembros').select('*').eq('user_id', userId).eq('activo', true)
  if (error || !data?.length) return []
  const ids = (data as Miembro[]).map((m) => m.cuenta_id)
  const { data: empresas } = await supabase.from('profiles').select('id, nombre, nombre_comercial, email').in('id', ids)
  const porId = new Map(((empresas as Acceso['empresa'][]) ?? []).map((e) => [e.id, e]))
  return (data as Miembro[])
    .map((m) => ({ ...m, empresa: porId.get(m.cuenta_id) ?? { id: m.cuenta_id, nombre: null, email: null } }))
    .sort((a, b) => (a.empresa.nombre ?? '').localeCompare(b.empresa.nombre ?? ''))
}

function readStoredOwner(): string | null {
  try {
    return localStorage.getItem(OWNER_KEY)
  } catch {
    return null
  }
}

function storeOwner(id: string | null) {
  try {
    if (id) localStorage.setItem(OWNER_KEY, id)
    else localStorage.removeItem(OWNER_KEY)
  } catch {
    /* almacenamiento no disponible */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [me, setMe] = useState<Profile | null>(null)
  const [other, setOther] = useState<Profile | null>(null)
  const [accesos, setAccesos] = useState<Acceso[]>([])
  const [loading, setLoading] = useState(true)

  const hydrate = useCallback(async (s: Session | null) => {
    setSession(s)
    if (!s) {
      setMe(null)
      setOther(null)
      setAccesos([])
      setLoading(false)
      return
    }
    const profile = await loadProfile(s.user.id)
    setMe(profile)
    const lista = profile && profile.role !== 'advisor' ? await loadAccesos(profile.id) : []
    setAccesos(lista)
    const stored = readStoredOwner()
    if (profile?.role === 'advisor' && stored && stored !== profile.id) {
      setOther(await loadProfile(stored))
    } else if (stored && lista.some((a) => a.cuenta_id === stored)) {
      setOther(await loadProfile(stored))
    } else if (profile?.role === 'member' && lista.length) {
      // Quien no tiene empresa propia entra directamente en la primera a la que tiene acceso
      storeOwner(lista[0].cuenta_id)
      setOther(await loadProfile(lista[0].cuenta_id))
    } else {
      setOther(null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => hydrate(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        // Fuera del callback para no bloquear el cliente de auth
        setTimeout(() => hydrate(s), 0)
      } else if (event === 'TOKEN_REFRESHED') {
        setSession(s)
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [hydrate])

  const setOwner = useCallback(
    async (id: string | null) => {
      if (!me) return
      const propia = !id || id === me.id
      if (propia) {
        // Un «member» no tiene empresa propia: se queda en la primera a la que tiene acceso
        if (me.role === 'member' && accesos.length) {
          storeOwner(accesos[0].cuenta_id)
          setOther(await loadProfile(accesos[0].cuenta_id))
          return
        }
        storeOwner(null)
        setOther(null)
        return
      }
      if (me.role !== 'advisor' && !accesos.some((a) => a.cuenta_id === id)) return
      storeOwner(id)
      setOther(await loadProfile(id))
    },
    [me, accesos],
  )

  const refresh = useCallback(async () => {
    if (!session) return
    const profile = await loadProfile(session.user.id)
    setMe(profile)
    if (profile && profile.role !== 'advisor') setAccesos(await loadAccesos(profile.id))
    if (other) setOther(await loadProfile(other.id))
  }, [session, other])

  const signOut = useCallback(async () => {
    storeOwner(null)
    // Solo este dispositivo: no cerrar la sesión del móvil o de otras pestañas
    await supabase.auth.signOut({ scope: 'local' })
  }, [])

  const value = useMemo<AuthState>(() => {
    const owner = other ?? me
    const isAdvisor = me?.role === 'advisor'
    const miembro = other && !isAdvisor ? accesos.find((a) => a.cuenta_id === other.id) ?? null : null
    let rol: RolEnCuenta | null = null
    if (owner && me) {
      if (owner.id === me.id) rol = me.role === 'member' ? null : 'titular'
      else if (isAdvisor) rol = 'asesor'
      else rol = miembro?.rol ?? null
    }
    return {
      session,
      loading,
      me,
      isAdvisor,
      owner,
      ownerId: owner?.id ?? null,
      viewingOther: isAdvisor && Boolean(other),
      accesos,
      miembro,
      rol,
      puede: (p: Permiso) => puedeRol(rol, miembro?.permisos, p),
      sinAcceso: me?.role === 'member' && !other,
      setOwner,
      refresh,
      signOut,
    }
  }, [session, loading, me, other, accesos, setOwner, refresh, signOut])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth fuera de AuthProvider')
  return ctx
}
