import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { Boton, Campo, entrada } from '../components/ui'

/** Inicio de sesión (modo real): mismo usuario de asesor que en clientes.nomotax.io */
export default function Acceso({ error }: { error: string }) {
  const { recargar } = useStore()
  const [email, setEmail] = useState(''); const [clave, setClave] = useState(''); const [msg, setMsg] = useState<string | null>(null)
  async function entrar(e: React.FormEvent) {
    e.preventDefault(); setMsg(null)
    const { error: er } = await supabase.auth.signInWithPassword({ email, password: clave })
    if (er) setMsg(er.message); else await recargar()
  }
  return (
    <form onSubmit={entrar} className="mx-auto mt-24 max-w-sm space-y-4 rounded-2xl bg-white p-6 shadow">
      <div className="flex items-center gap-2.5"><img src="/logo.png" alt="" className="size-9" /><div className="leading-tight"><div className="font-bold tracking-tight">NomoTax</div><div className="text-[10px] uppercase tracking-[0.14em] text-muted">CRM</div></div></div>
      <p className="text-sm text-muted">Entra con tu usuario de asesor del área de clientes.</p>
      <Campo etiqueta="Email"><input className={entrada} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" /></Campo>
      <Campo etiqueta="Contraseña"><input className={entrada} type="password" value={clave} onChange={(e) => setClave(e.target.value)} autoComplete="current-password" /></Campo>
      {(msg || error !== 'sin-sesion') && <p className="text-sm text-rojo">{msg ?? error}</p>}
      <Boton className="w-full">Entrar</Boton>
    </form>
  )
}
