import { useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import type { AuthError, SupabaseClient } from '@supabase/supabase-js'
import { clienteRecuperacion, supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Button, Field, Input, Loading } from '../components/ui'
import PantallaAcceso from '../components/PantallaAcceso'

type Estado = 'formulario' | 'caducado' | 'hecho'

/**
 * Pantalla del enlace «Cambia tu contraseña» del correo (/nueva-contrasena?token_hash=…).
 * Abrir el enlace NO inicia sesión: el código se canjea solo al guardar, en un cliente que guarda
 * la sesión en memoria, se cambia la contraseña y se cierra la sesión en todos los dispositivos.
 */
export default function NuevaContrasena() {
  const [params] = useSearchParams()
  const tokenHash = params.get('token_hash')
  const { session, loading, signOut } = useAuth()
  const recuperacionRef = useRef<SupabaseClient | null>(null)
  const [estado, setEstado] = useState<Estado>('formulario')
  const [clave, setClave] = useState('')
  const [repetir, setRepetir] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Sin código en el enlace solo vale si ya hay sesión (correo con la plantilla antigua de Supabase)
  if (!tokenHash && loading) return <Loading />
  const sinEnlace = !tokenHash && !session

  const guardar = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (clave.length < 8) return setError('La contraseña debe tener al menos 8 caracteres.')
    if (clave !== repetir) return setError('Las contraseñas no coinciden.')
    setGuardando(true)
    try {
      let cliente: SupabaseClient = supabase
      if (tokenHash) {
        // Se crea al guardar (no al abrir la página) y se reutiliza en los reintentos
        const recuperacion = (recuperacionRef.current ??= clienteRecuperacion())
        cliente = recuperacion
        // Si un intento anterior falló (p. ej. contraseña repetida), el código ya está canjeado y se reutiliza la sesión
        const { data: actual } = await recuperacion.auth.getSession()
        if (!actual.session) {
          const { data, error } = await recuperacion.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' })
          if (error || !data.session) return setEstado('caducado')
        }
      }
      const { data: usuario } = await cliente.auth.getUser()
      const { error } = await cliente.auth.updateUser({ password: clave })
      if (error) {
        if (error.code === 'session_not_found' || error.code === 'session_expired') return setEstado('caducado')
        return setError(mensaje(error))
      }
      // Fuera de todos los dispositivos: se vuelve a entrar con la contraseña nueva
      const { error: errSalir } = await cliente.auth.signOut({ scope: 'global' })
      if (errSalir) await cliente.auth.signOut({ scope: 'local' })
      if (session && session.user.id === usuario.user?.id) await signOut()
      setClave('')
      setRepetir('')
      setEstado('hecho')
    } finally {
      setGuardando(false)
    }
  }

  if (estado === 'hecho') {
    return (
      <PantallaAcceso>
        <CheckCircle2 className="mb-4 size-9 text-verde" />
        <h2 className="text-2xl font-semibold tracking-tight">Contraseña cambiada</h2>
        <p className="mt-1 text-[15px] text-muted">
          Hemos cerrado la sesión en todos tus dispositivos. Entra con tu contraseña nueva.
        </p>
        <Link
          to="/login"
          replace
          className="mt-8 flex h-10 w-full items-center justify-center rounded-full bg-ink text-[15px] font-medium text-white transition-colors hover:bg-ink-3"
        >
          Iniciar sesión
        </Link>
      </PantallaAcceso>
    )
  }

  if (estado === 'caducado' || sinEnlace) {
    return (
      <PantallaAcceso>
        <AlertTriangle className="mb-4 size-9 text-ambar" />
        <h2 className="text-2xl font-semibold tracking-tight">El enlace ya no vale</h2>
        <p className="mt-1 text-[15px] text-muted">
          Ha caducado o ya se ha usado. Los enlaces para cambiar la contraseña duran 1 hora y sirven una sola vez.
        </p>
        <Link
          to="/login?recuperar=1"
          replace
          className="mt-8 flex h-10 w-full items-center justify-center rounded-full bg-ink text-[15px] font-medium text-white transition-colors hover:bg-ink-3"
        >
          Pedir un enlace nuevo
        </Link>
        <Link to="/login" replace className="mt-5 inline-block text-sm text-muted underline-offset-2 hover:text-ink hover:underline">
          Volver a iniciar sesión
        </Link>
      </PantallaAcceso>
    )
  }

  return (
    <PantallaAcceso>
      <h2 className="text-2xl font-semibold tracking-tight">Elige tu nueva contraseña</h2>
      <p className="mt-1 text-[15px] text-muted">
        Al guardarla cerraremos la sesión en todos tus dispositivos y tendrás que entrar de nuevo.
      </p>

      <form onSubmit={guardar} className="mt-8 space-y-4">
        <Field label="Nueva contraseña">
          <Input
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            placeholder="Mínimo 8 caracteres"
          />
        </Field>
        <Field label="Repítela">
          <Input
            type="password"
            autoComplete="new-password"
            required
            value={repetir}
            onChange={(e) => setRepetir(e.target.value)}
          />
        </Field>

        {error && <p className="rounded-lg bg-rojo/10 px-3 py-2 text-sm text-rojo">{error}</p>}

        <Button type="submit" className="w-full" loading={guardando}>
          Guardar contraseña
        </Button>
      </form>

      <Link to="/login" replace className="mt-5 inline-block text-sm text-muted underline-offset-2 hover:text-ink hover:underline">
        Volver a iniciar sesión
      </Link>
    </PantallaAcceso>
  )
}

function mensaje(error: AuthError) {
  if (error.code === 'same_password') return 'La contraseña nueva tiene que ser distinta de la anterior.'
  if (error.code === 'weak_password') return 'Esa contraseña es demasiado débil. Prueba con una más larga, con números y símbolos.'
  if (error.code === 'over_request_rate_limit') return 'Demasiados intentos. Espera un momento y vuelve a probar.'
  return 'No se ha podido cambiar la contraseña. Inténtalo de nuevo.'
}
