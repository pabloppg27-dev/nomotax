import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Building2, CheckCircle2, Copy, Link2, Plus, Scale, Search, Send, Sparkles, Users, X, type LucideIcon } from 'lucide-react'
import { useAuth } from '../../lib/auth'
import { errorMessage, supabase } from '../../lib/supabase'
import { eur, fecha } from '../../lib/format'
import type { Profile } from '../../lib/types'
import { etiquetasFiscal } from '../../lib/regimenFiscal'
import { EditorFiscal } from '../../components/RegimenFiscal'
import { Badge, Button, Card, Empty, Field, Input, Loading, Modal, PageHeader, Select, notify } from '../../components/ui'
import { cuotaCliente, importe, proximoCobro } from '../../lib/planes'
import { EditorPlan, OpcionesPlan } from '../../components/Planes'
import { GUIA_APP } from '../../lib/plantillasCorreo'

type Fila = Profile & { porRevisar: number; facturado: number; gastos: number; ultimo: string | null }

export default function ClientesAsesor() {
  const { setOwner } = useAuth()
  const navigate = useNavigate()
  const [filas, setFilas] = useState<Fila[] | null>(null)
  const [q, setQ] = useState('')
  const [alta, setAlta] = useState(false)
  const [reenviar, setReenviar] = useState<Fila | null>(null)
  const [otraCuenta, setOtraCuenta] = useState<Fila | null>(null)
  const [editarPlan, setEditarPlan] = useState<Fila | null>(null)
  const [editarFiscal, setEditarFiscal] = useState<Fila | null>(null)
  // Móvil: al tocar un cliente, menú con botones grandes (en el ordenador, la fila entra directamente)
  const [acciones, setAcciones] = useState<Fila | null>(null)

  const cargar = useCallback(async () => {
    const anio = new Date().getFullYear()
    const [p, g, f] = await Promise.all([
      supabase.from('profiles').select('*').eq('role', 'client').order('nombre'),
      supabase.from('expenses').select('owner_id, estado, base, fecha, created_at').gte('created_at', `${anio - 1}-01-01`),
      supabase.from('invoices').select('owner_id, estado, base, fecha, created_at').neq('estado', 'borrador').gte('fecha', `${anio}-01-01`),
    ])
    const gastos = (g.data ?? []) as { owner_id: string; estado: string; base: number; fecha: string | null; created_at: string }[]
    const facturas = (f.data ?? []) as { owner_id: string; base: number; created_at: string }[]
    setFilas(
      ((p.data as Profile[]) ?? []).map((perfil) => {
        const gs = gastos.filter((x) => x.owner_id === perfil.id)
        const fs = facturas.filter((x) => x.owner_id === perfil.id)
        const fechas = [...gs.map((x) => x.created_at), ...fs.map((x) => x.created_at)].sort()
        return {
          ...perfil,
          porRevisar: gs.filter((x) => x.estado === 'pendiente').length,
          gastos: gs.filter((x) => x.fecha?.startsWith(String(anio))).reduce((s, x) => s + Number(x.base), 0),
          facturado: fs.reduce((s, x) => s + Number(x.base), 0),
          ultimo: fechas.at(-1) ?? null,
        }
      }),
    )
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  // Cada cliente seguido de sus cuentas vinculadas (supabase/cuentas-titular.sql: su SL, su actividad de autónomo…)
  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase()
    const todas = filas ?? []
    const titularDe = (c: Fila) => (c.titular_id ? todas.find((x) => x.id === c.titular_id) : undefined)
    const encaja = (c: Fila) => !t || [c.nombre, c.email, c.nif, titularDe(c)?.nombre].some((v) => v?.toLowerCase().includes(t))
    const principales = todas.filter((c) => !c.titular_id || !titularDe(c))
    return principales.flatMap((c) => [c, ...todas.filter((x) => x.titular_id === c.id)]).filter(encaja)
  }, [filas, q])

  const nombreTitular = (c: Fila) => {
    const t = filas?.find((x) => x.id === c.titular_id)
    return t?.nombre || t?.email || 'su titular'
  }

  const entrar = async (id: string) => {
    await setOwner(id)
    navigate('/')
  }

  return (
    <>
      <PageHeader
        title="Clientes"
        subtitle="Entra en la cuenta de un cliente para trabajar en ella. Desde aquí le das de alta, le pones plan y su régimen fiscal."
        actions={
          <Button icon={<Plus className="size-4" />} onClick={() => setAlta(true)}>
            Dar de alta cliente
          </Button>
        }
      />

      {filas === null ? (
        <Loading />
      ) : filas.length === 0 ? (
        <Card>
          <Empty
            icon={<Users className="size-5" />}
            title="Aún no hay clientes dados de alta"
            text="Da de alta a tu primer cliente: recibirás una contraseña provisional para enviársela."
            action={
              <Button icon={<Plus className="size-4" />} onClick={() => setAlta(true)}>
                Dar de alta cliente
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <div className="relative mb-4 max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input placeholder="Buscar cliente" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
          </div>
          <Card className="overflow-hidden">
            <table className="w-full text-left text-[15px]">
              <thead className="hidden border-b border-line bg-paper text-xs uppercase tracking-wide text-muted md:table-header-group">
                <tr>
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 text-right font-medium">Facturado {new Date().getFullYear()}</th>
                  <th className="px-4 py-3 text-right font-medium">Gastos {new Date().getFullYear()}</th>
                  <th className="px-4 py-3 font-medium">Por revisar</th>
                  <th className="px-4 py-3 font-medium">Última actividad</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {visibles.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => (window.matchMedia('(min-width: 768px)').matches ? entrar(c.id) : setAcciones(c))}
                    className="grid cursor-pointer grid-cols-[1fr_auto] gap-x-3 border-b border-line px-4 py-3 last:border-0 hover:bg-paper md:table-row md:p-0"
                  >
                    <td className={`min-w-0 md:px-4 md:py-3 ${c.titular_id ? 'md:pl-10' : ''}`}>
                      <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                        {c.titular_id && <Link2 className="size-4 shrink-0 text-muted" />}
                        <span className="truncate font-medium">{c.nombre || 'Sin nombre'}</span>
                        {cuotaCliente(c) && <Badge tono="lima">{cuotaCliente(c)!.plan.nombre}</Badge>}
                        {etiquetasFiscal(c.fiscal).map((e) => (
                          <Badge key={e} tono="negro">
                            {e}
                          </Badge>
                        ))}
                      </p>
                      <p className="truncate text-sm text-muted">{[c.nif, c.email].filter(Boolean).join(' · ')}</p>
                      <p className="flex flex-wrap items-center gap-x-2 text-xs">
                        {c.bienvenida_enviada_at && (
                          <span className="text-verde">Bienvenida enviada el {fecha(c.bienvenida_enviada_at.slice(0, 10))}</span>
                        )}
                        <span className="hidden md:contents">
                        {c.titular_id ? (
                          <span className="text-muted">Cuenta de {nombreTitular(c)}: entra con su email</span>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                setReenviar(c)
                              }}
                              className="inline-flex items-center gap-1 text-muted underline-offset-2 hover:text-ink hover:underline"
                            >
                              <Send className="size-3" /> Reenviar acceso
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                setOtraCuenta(c)
                              }}
                              className="inline-flex items-center gap-1 text-muted underline-offset-2 hover:text-ink hover:underline"
                            >
                              <Building2 className="size-3" /> Otra empresa o actividad
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setEditarPlan(c)
                          }}
                          className="inline-flex items-center gap-1 text-muted underline-offset-2 hover:text-ink hover:underline"
                        >
                          <Sparkles className="size-3" /> {c.plan ? 'Editar plan' : 'Asignar plan'}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setEditarFiscal(c)
                          }}
                          className="inline-flex items-center gap-1 text-muted underline-offset-2 hover:text-ink hover:underline"
                        >
                          <Scale className="size-3" /> Régimen fiscal
                        </button>
                        </span>
                        {cuotaCliente(c) && (
                          <span className="num text-muted">
                            {cuotaCliente(c)!.texto}
                            {cuotaCliente(c)!.personalizado ? ' (personalizado)' : ''}
                            {cuotaCliente(c)!.laboral ? ` + ${cuotaCliente(c)!.laboral!.texto}` : ''}
                            {cuotaCliente(c)!.laboral && cuotaCliente(c)!.totalMes !== null ? ` = ${importe(cuotaCliente(c)!.totalMes!)}/mes` : ''}
                            {proximoCobro(c) ? ` · cobro ${fecha(proximoCobro(c))}` : ''}
                          </span>
                        )}
                      </p>
                    </td>
                    <td className="num text-right md:px-4 md:py-3">
                      <span className="mr-1 text-xs text-muted md:hidden">Facturado</span>
                      {eur(c.facturado)}
                    </td>
                    <td className="num hidden text-right md:table-cell md:px-4 md:py-3">{eur(c.gastos)}</td>
                    <td className="md:px-4 md:py-3">
                      {c.porRevisar > 0 ? <Badge tono="lima">{c.porRevisar} gastos</Badge> : <span className="text-sm text-muted">—</span>}
                    </td>
                    <td className="justify-self-end text-sm text-muted md:px-4 md:py-3">{c.ultimo ? fecha(c.ultimo) : 'Sin actividad'}</td>
                    <td className="hidden text-right md:table-cell md:px-4 md:py-3">
                      <span className="inline-flex items-center gap-1 text-sm font-medium">
                        Entrar <ArrowRight className="size-4" />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {acciones && (
        <AccionesCliente
          c={acciones}
          titular={acciones.titular_id ? nombreTitular(acciones) : null}
          onClose={() => setAcciones(null)}
          onEntrar={() => entrar(acciones.id)}
          onReenviar={() => setReenviar(acciones)}
          onOtra={() => setOtraCuenta(acciones)}
          onPlan={() => setEditarPlan(acciones)}
          onFiscal={() => setEditarFiscal(acciones)}
        />
      )}

      <AltaCliente open={alta} onClose={() => setAlta(false)} onCreated={cargar} />
      <ReenviarAcceso cliente={reenviar} onClose={() => setReenviar(null)} onDone={cargar} />
      <OtraCuenta titular={otraCuenta} onClose={() => setOtraCuenta(null)} onCreated={cargar} />
      <EditorPlan perfil={editarPlan} onClose={() => setEditarPlan(null)} onGuardado={cargar} />
      <EditorFiscal perfil={editarFiscal} onClose={() => setEditarFiscal(null)} onGuardado={cargar} />
    </>
  )
}

/** Móvil: lo que se puede hacer con un cliente, en botones grandes y separados */
function AccionesCliente({
  c,
  titular,
  onClose,
  onEntrar,
  onReenviar,
  onOtra,
  onPlan,
  onFiscal,
}: {
  c: Fila
  titular: string | null
  onClose: () => void
  onEntrar: () => void
  onReenviar: () => void
  onOtra: () => void
  onPlan: () => void
  onFiscal: () => void
}) {
  const hacer = (f: () => void) => () => {
    onClose()
    f()
  }
  const opciones: { icon: LucideIcon; label: string; detalle: string; accion: () => void; si: boolean }[] = [
    { icon: Send, label: 'Reenviar acceso', detalle: 'Nueva contraseña provisional por email', accion: onReenviar, si: !titular },
    { icon: Building2, label: 'Otra empresa o actividad', detalle: 'Su SL, su actividad de autónomo…', accion: onOtra, si: !titular },
    { icon: Sparkles, label: c.plan ? 'Editar plan' : 'Asignar plan', detalle: cuotaCliente(c)?.texto ?? 'Sin plan todavía', accion: onPlan, si: true },
    { icon: Scale, label: 'Régimen fiscal', detalle: etiquetasFiscal(c.fiscal).join(' · ') || (c.fiscal ? 'Régimen general' : 'Sin indicar'), accion: onFiscal, si: true },
  ]
  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <div className="absolute inset-0 bg-ink/50 backdrop-blur-[2px]" onClick={onClose} />
      <div
        role="dialog"
        aria-label={`Acciones de ${c.nombre ?? 'cliente'}`}
        className="absolute inset-x-0 bottom-0 max-h-[90dvh] overflow-y-auto overscroll-contain rounded-t-3xl bg-white px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
        <div className="mb-4 flex items-start gap-3 px-1">
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-semibold">{c.nombre || 'Sin nombre'}</p>
            <p className="truncate text-sm text-muted">{[c.nif, c.email].filter(Boolean).join(' · ')}</p>
            {titular && <p className="text-sm text-muted">Cuenta de {titular}</p>}
          </div>
          <button onClick={onClose} className="grid size-10 shrink-0 place-items-center rounded-full bg-paper" aria-label="Cerrar">
            <X className="size-5" />
          </button>
        </div>
        <button onClick={hacer(onEntrar)} className="mb-3 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-ink text-[16px] font-medium text-white active:bg-ink-3">
          Entrar en su cuenta <ArrowRight className="size-5" />
        </button>
        <div className="flex flex-col gap-2">
          {opciones
            .filter((o) => o.si)
            .map(({ icon: Icon, label, detalle, accion }) => (
              <button key={label} onClick={hacer(accion)} className="flex min-h-16 w-full items-center gap-3 rounded-2xl border border-line px-4 py-3 text-left active:bg-paper">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-paper">
                  <Icon className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[16px] font-medium">{label}</span>
                  <span className="block truncate text-sm text-muted">{detalle}</span>
                </span>
              </button>
            ))}
        </div>
      </div>
    </div>
  )
}

function AltaCliente({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [email, setEmail] = useState('')
  const [nombre, setNombre] = useState('')
  const [nif, setNif] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<Acceso | null>(null)
  const [bienvenida, setBienvenida] = useState(true)
  const [plan, setPlan] = useState('')

  const cerrar = () => {
    setEmail('')
    setNombre('')
    setNif('')
    setPlan('')
    setResultado(null)
    setBienvenida(true)
    onClose()
  }

  const crear = async (e?: FormEvent) => {
    e?.preventDefault()
    setEnviando(true)
    const { data, error } = await supabase.functions.invoke('invitar-cliente', { body: { email, nombre, nif, bienvenida } })
    setEnviando(false)
    if (error) return notify(await errorMessage(error), 'error')
    if (plan && data?.id) {
      const { error: ePlan } = await supabase.from('profiles').update({ plan }).eq('id', data.id)
      if (ePlan) notify(`Cliente creado, pero sin plan: ${await errorMessage(ePlan)}`, 'error')
    }
    setResultado({ email: data.email, password: data.password, bienvenida: data.bienvenida ?? 'no' })
    onCreated()
  }

  return (
    <Modal
      open={open}
      onClose={cerrar}
      title={resultado ? 'Cliente dado de alta' : 'Dar de alta cliente'}
      footer={
        resultado ? (
          <Button onClick={cerrar}>Hecho</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={cerrar}>
              Cancelar
            </Button>
            <Button onClick={() => crear()} loading={enviando} disabled={!email}>
              {bienvenida ? 'Crear y enviar bienvenida' : 'Crear sin enviar correo'}
            </Button>
          </>
        )
      }
    >
      {resultado ? (
        <MensajeAcceso
          resultado={resultado}
          nombre={nombre}
          aviso="El cliente está creado, pero el correo de bienvenida no se ha podido enviar. Mándale este mensaje tú."
        />
      ) : (
        <form onSubmit={crear} className="space-y-4">
          <Field label="Email del cliente">
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          </Field>
          <Field label="Nombre o razón social">
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </Field>
          <Field label="NIF / CIF">
            <Input value={nif} onChange={(e) => setNif(e.target.value)} />
          </Field>
          <Field label="Plan">
            <Select value={plan} onChange={(e) => setPlan(e.target.value)}>
              <OpcionesPlan />
            </Select>
          </Field>
          <label className="flex items-start gap-2.5 rounded-xl border border-line p-3 text-[15px]">
            <input type="checkbox" className="mt-1 size-4 accent-ink" checked={bienvenida} onChange={(e) => setBienvenida(e.target.checked)} />
            <span>
              Enviar correo de bienvenida{email ? ` a ${email}` : ''}
              <span className="block text-sm text-muted">Desde info@nomotax.io, con sus accesos y los primeros pasos. Te llega una copia.</span>
            </span>
          </label>
          <button type="submit" hidden />
        </form>
      )}
    </Modal>
  )
}

type Acceso = { email: string; password: string; bienvenida: 'no' | 'enviada' | 'error' }

/**
 * Otra empresa o actividad del mismo cliente (autónomo + SL, varias SL…): una cuenta con sus propios datos,
 * facturas y contabilidad, a la que entra con SU email y cambia desde el selector de arriba.
 * Sin email ni contraseña propios (supabase/cuentas-titular.sql, función invitar-cliente con { titular }).
 */
function OtraCuenta({ titular, onClose, onCreated }: { titular: Profile | null; onClose: () => void; onCreated: () => void }) {
  const [nombre, setNombre] = useState('')
  const [nif, setNif] = useState('')
  const [plan, setPlan] = useState('')
  const [enviando, setEnviando] = useState(false)

  const cerrar = () => {
    setNombre('')
    setNif('')
    setPlan('')
    onClose()
  }

  const crear = async (e?: FormEvent) => {
    e?.preventDefault()
    if (!titular) return
    setEnviando(true)
    const { data, error } = await supabase.functions.invoke('invitar-cliente', { body: { titular: titular.id, nombre, nif } })
    if (error) {
      setEnviando(false)
      return notify(await errorMessage(error), 'error')
    }
    if (!data?.vinculada) {
      setEnviando(false)
      return notify('La función invitar-cliente no está actualizada: publica la versión con «titular».', 'error')
    }
    if (plan) {
      const { error: ePlan } = await supabase.from('profiles').update({ plan }).eq('id', data.id)
      if (ePlan) notify(`Cuenta creada, pero sin plan: ${await errorMessage(ePlan)}`, 'error')
    }
    setEnviando(false)
    notify(`${nombre} creada. ${titular.nombre || titular.email} ya la ve en su selector de cuentas.`)
    onCreated()
    cerrar()
  }

  const quien = titular?.nombre || titular?.email || 'el cliente'
  return (
    <Modal
      open={Boolean(titular)}
      onClose={cerrar}
      title="Otra empresa o actividad"
      footer={
        <>
          <Button variant="secondary" onClick={cerrar}>
            Cancelar
          </Button>
          <Button onClick={() => crear()} loading={enviando} disabled={!nombre.trim()}>
            Crear cuenta
          </Button>
        </>
      }
    >
      <form onSubmit={crear} className="space-y-4">
        <p className="text-[15px] text-muted">
          Una cuenta más para <strong className="text-ink">{quien}</strong>, con sus propios datos, facturas y contabilidad. Entra con su
          email de siempre{titular?.email ? ` (${titular.email})` : ''} y cambia de cuenta desde el selector de arriba. No hace falta otro email.
        </p>
        <Field label="Nombre o razón social">
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Strobo Films, S.L.U." autoFocus />
        </Field>
        <Field label="NIF / CIF" hint="Si aún no lo tiene (sociedad en constitución), déjalo vacío y ponlo después en su perfil.">
          <Input value={nif} onChange={(e) => setNif(e.target.value)} />
        </Field>
        <Field label="Plan">
          <Select value={plan} onChange={(e) => setPlan(e.target.value)}>
            <OpcionesPlan />
          </Select>
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}

function MensajeAcceso({ resultado, nombre, aviso }: { resultado: Acceso; nombre: string; aviso: string }) {
  const mensaje =
    `Hola${nombre.trim() ? ` ${nombre.trim()}` : ''}, ya tienes acceso a NomoTax Business Hub.\n\n` +
    `Entra en ${window.location.origin}\nUsuario: ${resultado.email}\nContraseña provisional: ${resultado.password}\n\n` +
    'Al entrar, cámbiala en «Mi perfil».\n\n' +
    `Tenla como app en tu móvil u ordenador: ${GUIA_APP}`

  return (
    <div className="space-y-3">
      {resultado.bienvenida === 'enviada' ? (
        <p className="flex gap-2 rounded-xl bg-verde/10 px-3 py-2.5 text-[15px] text-verde">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          Correo de bienvenida enviado a {resultado.email} desde info@nomotax.io (te llega una copia).
        </p>
      ) : resultado.bienvenida === 'error' ? (
        <p className="rounded-xl bg-ambar/10 px-3 py-2.5 text-[15px] text-ambar">{aviso}</p>
      ) : null}
      <p className="text-[15px]">
        {resultado.bienvenida === 'enviada' ? 'Por si quieres mandárselo también por WhatsApp:' : 'Envíale este mensaje a tu cliente.'}{' '}
        <strong>La contraseña solo se muestra ahora.</strong>
      </p>
      <pre className="whitespace-pre-wrap rounded-xl bg-paper p-4 text-sm">{mensaje}</pre>
      <Button
        variant="secondary"
        size="sm"
        icon={<Copy className="size-4" />}
        onClick={async () => {
          await navigator.clipboard.writeText(mensaje)
          notify('Mensaje copiado')
        }}
      >
        Copiar mensaje
      </Button>
    </div>
  )
}

function ReenviarAcceso({ cliente, onClose, onDone }: { cliente: Profile | null; onClose: () => void; onDone: () => void }) {
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<Acceso | null>(null)

  const cerrar = () => {
    setResultado(null)
    onClose()
  }

  const reenviar = async () => {
    if (!cliente) return
    setEnviando(true)
    const { data, error } = await supabase.functions.invoke('invitar-cliente', { body: { reenviar: cliente.id } })
    setEnviando(false)
    if (error) return notify(await errorMessage(error), 'error')
    if (!data?.password) return notify('La función de Supabase no está actualizada: falta publicar la versión con «reenviar».', 'error')
    setResultado({ email: data.email, password: data.password, bienvenida: data.bienvenida ?? 'error' })
    onDone()
  }

  const nombre = cliente?.nombre || cliente?.email || 'este cliente'

  return (
    <Modal
      open={!!cliente}
      onClose={cerrar}
      title={resultado ? 'Acceso reenviado' : 'Reenviar acceso'}
      footer={
        resultado ? (
          <Button onClick={cerrar}>Hecho</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={cerrar}>
              Cancelar
            </Button>
            <Button onClick={reenviar} loading={enviando} icon={<Send className="size-4" />}>
              Reenviar acceso
            </Button>
          </>
        )
      }
    >
      {resultado ? (
        <MensajeAcceso
          resultado={resultado}
          nombre={cliente?.nombre ?? ''}
          aviso="La contraseña nueva ya está activa, pero el correo no se ha podido enviar. Mándale este mensaje tú."
        />
      ) : (
        <div className="space-y-3 text-[15px]">
          <p>
            Se creará una <strong>contraseña provisional nueva</strong> para <strong>{nombre}</strong> y se le enviará el correo de
            bienvenida a {cliente?.email} desde info@nomotax.io. Te llega una copia.
          </p>
          <p className="text-muted">Su contraseña actual dejará de funcionar.</p>
        </div>
      )}
    </Modal>
  )
}
