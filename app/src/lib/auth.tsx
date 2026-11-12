import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { Profile } from './types'

const OWNER_KEY = 'nt-cuenta-activa'

interface AuthState {
  session: Session | null
  loading: boolean
  /** Perfil de quien ha iniciado sesión */
  me: Profile | null
  isAdvisor: boolean
  /** Cuenta que se está viendo (la propia, o la de un cliente si eres asesor) */
  owner: Profile | null
  ownerId: string | null
  viewingOther: boolean
  setOwner: (id: string | null) => Promise<void>
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthState | null>(null)

async function loadProfile(id: string): Promise<Profile | null> {
  const { data } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle()
  return (data as Profile) ?? null
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
  const [loading, setLoading] = useState(true)

  const hydrate = useCallback(async (s: Session | null) => {
    setSession(s)
    if (!s) {
      setMe(null)
      setOther(null)
      setLoading(false)
      return
    }
    const profile = await loadProfile(s.user.id)
    setMe(profile)
    const stored = readStoredOwner()
    if (profile?.role === 'advisor' && stored && stored !== profile.id) {
      setOther(await loadProfile(stored))
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
      if (!me || me.role !== 'advisor' || !id || id === me.id) {
        storeOwner(null)
        setOther(null)
        return
      }
      storeOwner(id)
      setOther(await loadProfile(id))
    },
    [me],
  )

  const refresh = useCallback(async () => {
    if (!session) return
    const profile = await loadProfile(session.user.id)
    setMe(profile)
    if (other) setOther(await loadProfile(other.id))
  }, [session, other])

  const signOut = useCallback(async () => {
    storeOwner(null)
    await supabase.auth.signOut()
  }, [])

  const value = useMemo<AuthState>(() => {
    const owner = other ?? me
    return {
      session,
      loading,
      me,
      isAdvisor: me?.role === 'advisor',
      owner,
      ownerId: owner?.id ?? null,
      viewingOther: Boolean(other),
      setOwner,
      refresh,
      signOut,
    }
  }, [session, loading, me, other, setOwner, refresh, signOut])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth fuera de AuthProvider')
  return ctx
}
