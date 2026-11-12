import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Button, Field, Input } from '../components/ui'

type Modo = 'entrar' | 'recuperar'

export default function Login() {
  const { session, loading } = useAuth()
  const [modo, setModo] = useState<Modo>('entrar')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  if (!loading && session) return <Navigate to="/" replace />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setAviso(null)
    setEnviando(true)
    if (modo === 'entrar') {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (error) {
        setError(
          error.message.toLowerCase().includes('invalid')
            ? 'Email o contraseña incorrectos.'
            : 'No se ha podido iniciar sesión. Inténtalo de nuevo.',
        )
      }
    } else {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/perfil?nueva-clave=1`,
      })
      if (error) setError('No se ha podido enviar el email. Escríbenos y te ayudamos.')
      else setAviso('Si el email está dado de alta, recibirás un enlace para crear una contraseña nueva.')
    }
    setEnviando(false)
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-ink p-12 text-white lg:flex">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="" className="size-11" />
          <span className="text-lg font-semibold tracking-tight">NomoTax</span>
        </div>
        <div className="relative z-10 max-w-md">
          <p className="mb-4 text-xs uppercase tracking-[0.14em] text-lima">Área de clientes</p>
          <h1 className="font-display text-[44px] leading-[1.08] tracking-tight">
            Tu contabilidad, <span className="text-lima">al día</span> y en un solo sitio.
          </h1>
          <p className="mt-5 text-[17px] leading-relaxed text-white/65">
            Sube tus gastos con una foto, crea presupuestos y facturas, y consulta cómo va tu negocio cada trimestre.
          </p>
        </div>
        <p className="relative z-10 text-sm text-white/40">© {new Date().getFullYear()} NomoTax · Asesoría fiscal</p>
        <div className="pointer-events-none absolute -bottom-40 -right-40 size-[480px] rounded-full bg-lima/10 blur-3xl" />
      </div>

      <div className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <img src="/logo.png" alt="" className="size-10" />
            <div>
              <div className="font-semibold">NomoTax</div>
              <div className="text-xs uppercase tracking-[0.12em] text-muted">Área de clientes</div>
            </div>
          </div>

          <h2 className="text-2xl font-semibold tracking-tight">
            {modo === 'entrar' ? 'Inicia sesión' : 'Recupera tu contraseña'}
          </h2>
          <p className="mt-1 text-[15px] text-muted">
            {modo === 'entrar'
              ? 'Entra con el email y la contraseña que te dio tu asesor.'
              : 'Te enviaremos un enlace para crear una contraseña nueva.'}
          </p>

          <form onSubmit={submit} className="mt-8 space-y-4">
            <Field label="Email">
              <Input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@empresa.com"
              />
            </Field>
            {modo === 'entrar' && (
              <Field label="Contraseña">
                <Input
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
            )}

            {error && <p className="rounded-lg bg-rojo/10 px-3 py-2 text-sm text-rojo">{error}</p>}
            {aviso && <p className="rounded-lg bg-verde/10 px-3 py-2 text-sm text-verde">{aviso}</p>}

            <Button type="submit" className="w-full" loading={enviando}>
              {modo === 'entrar' ? 'Entrar' : 'Enviar enlace'}
            </Button>
          </form>

          <button
            type="button"
            onClick={() => {
              setModo(modo === 'entrar' ? 'recuperar' : 'entrar')
              setError(null)
              setAviso(null)
            }}
            className="mt-5 text-sm text-muted underline-offset-2 hover:text-ink hover:underline"
          >
            {modo === 'entrar' ? '¿Has olvidado la contraseña?' : 'Volver a iniciar sesión'}
          </button>

          <p className="mt-10 text-sm text-muted">
            ¿Aún no eres cliente?{' '}
            <a href="https://nomotax.io/contacto" className="font-medium text-ink underline-offset-2 hover:underline">
              Habla con nosotros
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
