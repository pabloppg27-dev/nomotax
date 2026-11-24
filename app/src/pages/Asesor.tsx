import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Building2, CheckCircle2, Copy, Link2, Plus, Search, Send, Sparkles, Users } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { errorMessage, supabase } from '../lib/supabase'
import { eur, fecha } from '../lib/format'
import { ESTADOS_TRABAJADOR, diasHabilesHasta } from '../lib/laboral'
import type { EstadoTrabajador, Profile } from '../lib/types'
import { Badge, Button, Card, Empty, Field, Input, Loading, Modal, PageHeader, Select, notify } from '../components/ui'
import { cuotaCliente, importe, proximoCobro } from '../lib/planes'
import { EditorPlan, OpcionesPlan } from '../components/Planes'
import { GUIA_APP } from '../lib/plantillasCorreo'

type Fila = Profile & { porRevisar: number; facturado: number; gastos: number; ultimo: string | null }
type LlamadaPend = { id: string; owner_id: string; tipo: 'llamame' | 'cita'; inicio: string | null; modalidad: string | null; telefono: string | null; tema: string | null; franja: string | null; meet_link: string | null; created_at: string }
type Amortizable = { id: string; owner_id: string; proveedor: string | null; concepto: string | null; base: number; fecha: string | null }
type Pendiente = { id: string; owner_id: string; nombre: string; fecha_inicio: string; estado: EstadoTrabajador; created_at: string }

export default function Asesor() {
  const { me, setOwner } = useAuth()
  const navigate = useNavigate()
  const [filas, setFilas] = useState<Fila[] | null>(null)
  const [q, setQ] = useState('')
  const [alta, setAlta] = useState(false)
  const [reenviar, setReenviar] = useState<Fila | null>(null)
  const [otraCuenta, setOtraCuenta] = useState<Fila | null>(null)
  const [editarPlan, setEditarPlan] = useState<Fila | null>(null)
  const [pendientes, setPendientes] = useState<Pendiente[]>([])
  const [llamadas, setLlamadas] = useState<LlamadaPend[]>([])
  const [amortizables, setAmortizables] = useState<Amortizable[]>([])

  const cargar = useCallback(async () => {
    const anio = new Date().getFullYear()
    const [p, g, f, w, ll, am] = await Promise.all([
      supabase.from('profiles').select('*').eq('role', 'client').order('nombre'),
      supabase.from('expenses').select('owner_id, estado, base, fecha, created_at').gte('created_at', `${anio - 1}-01-01`),
      supabase.from('invoices').select('owner_id, estado, base, fecha, created_at').neq('estado', 'borrador').gte('fecha', `${anio}-01-01`),
      supabase
        .from('trabajadores')
        .select('id, owner_id, nombre, fecha_inicio, estado, created_at')
        .in('estado', ['solicitada', 'en_tramite'])
        .order('fecha_inicio'),
      supabase.from('llamadas').select('*').eq('estado', 'pendiente').order('created_at'),
      supabase.from('expenses').select('id, owner_id, proveedor, concepto, base, fecha').eq('revision', 'pendiente').order('fecha'),
    ])
    setAmortizables((am.data as Amortizable[]) ?? [])
    setLlamadas((ll.data as LlamadaPend[]) ?? [])
    setPendientes((w.data as Pendiente[]) ?? [])
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

  const abrirAlta = async (pend: Pendiente) => {
    await setOwner(pend.owner_id)
    navigate(`/laboral/trabajadores/${pend.id}`)
  }

  const marcarHecha = async (id: string) => {
    const { error } = await supabase.from('llamadas').update({ estado: 'hecha' }).eq('id', id)
    if (error) return notify(await errorMessage(error), 'error')
    setLlamadas((ls) => ls.filter((l) => l.id !== id))
    notify('Llamada marcada como hecha')
  }

  const nombreCliente = (id: string) => {
    if (id === me?.id) return me.nombre || me.email || 'Tú'
    const c = filas?.find((x) => x.id === id)
    return c?.nombre || c?.email || 'Cliente'
  }

  return (
    <>
      <PageHeader
        title="Panel del asesor"
        subtitle={`Hola${me?.nombre ? `, ${me.nombre.split(' ')[0]}` : ''}. Estos son tus clientes en el área privada.`}
        actions={
          <Button icon={<Plus className="size-4" />} onClick={() => setAlta(true)}>
            Dar de alta cliente
          </Button>
        }
      />

      {llamadas.length > 0 && (
        <Card className="mb-6 overflow-hidden">
          <div className="border-b border-line bg-lima/30 px-4 py-3">
            <h2 className="font-semibold">Llamadas pendientes ({llamadas.length})</h2>
          </div>
          <ul className="divide-y divide-line">
            {llamadas.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{nombreCliente(l.owner_id)}</span>
                  <span className="block truncate text-sm text-muted">
                    {l.tipo === 'cita' && l.inicio
                      ? `Cita ${new Date(l.inicio).toLocaleString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · ${l.modalidad === 'meet' ? 'Google Meet' : 'llamarle'}`
                      : `Pide que le llames · ${l.franja ?? 'cuando puedas'}`}
                    {l.tema ? ` · ${l.tema}` : ''}
                  </span>
                </span>
                {l.telefono && (
                  <a href={`tel:${l.telefono.replace(/\s/g, '')}`} className="num text-sm font-medium underline">
                    {l.telefono}
                  </a>
                )}
                {l.meet_link && (
                  <a href={l.meet_link} target="_blank" rel="noreferrer" className="text-sm underline">
                    Meet
                  </a>
                )}
                <Button size="sm" variant="secondary" onClick={() => marcarHecha(l.id)}>
                  Hecha
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {amortizables.length > 0 && (
        <Card className="mb-6 overflow-hidden">
          <div className="border-b border-line bg-ambar/10 px-4 py-3">
            <h2 className="font-semibold">Posibles amortizaciones por revisar ({amortizables.length})</h2>
            <p className="text-sm text-muted">Compras de más de 300 € que parecen inversión. Decide si son gasto o inmovilizado.</p>
          </div>
          <ul className="divide-y divide-line">
            {amortizables.map((a) => (
              <li key={a.id}>
                <button
                  onClick={async () => {
                    await setOwner(a.owner_id)
                    navigate(`/gastos?revisar=${a.id}`)
                  }}
                  className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left hover:bg-paper"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{a.concepto || a.proveedor || 'Gasto'}</span>
                    <span className="block truncate text-sm text-muted">
                      {nombreCliente(a.owner_id)} · {a.proveedor ?? ''} · {fecha(a.fecha)}
                    </span>
                  </span>
                  <span className="num font-medium">{eur(a.base)}</span>
                  <ArrowRight className="size-4 text-muted" />
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {pendientes.length > 0 && (
        <Card className="mb-6 overflow-hidden">
          <div className="border-b border-line bg-lima/30 px-4 py-3">
            <h2 className="font-semibold">Altas pendientes ({pendientes.length})</h2>
          </div>
          <ul className="divide-y divide-line">
            {pendientes.map((pend) => {
              const dias = diasHabilesHasta(pend.fecha_inicio)
              const est = ESTADOS_TRABAJADOR[pend.estado]
              return (
                <li key={pend.id}>
                  <button onClick={() => abrirAlta(pend)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left hover:bg-paper">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{pend.nombre}</span>
                      <span className="block truncate text-sm text-muted">{nombreCliente(pend.owner_id)}</span>
                    </span>
                    <span className={`text-sm ${dias < 3 ? 'font-medium text-rojo' : 'text-muted'}`}>
                      Empieza el {fecha(pend.fecha_inicio)}
                      {dias < 3 ? ` · ${dias <= 0 ? '¡ya!' : `${dias} día${dias === 1 ? '' : 's'} hábil${dias === 1 ? '' : 'es'}`}` : ''}
                    </span>
                    <Badge tono={est.tono}>{est.label}</Badge>
                    <ArrowRight className="size-4 text-muted" />
                  </button>
                </li>
              )
            })}
          </ul>
        </Card>
      )}

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
                    onClick={() => entrar(c.id)}
                    className="grid cursor-pointer grid-cols-[1fr_auto] gap-x-3 border-b border-line px-4 py-3 last:border-0 hover:bg-paper md:table-row md:p-0"
                  >
                    <td className={`min-w-0 md:px-4 md:py-3 ${c.titular_id ? 'md:pl-10' : ''}`}>
                      <p className="flex min-w-0 items-center gap-2">
                        {c.titular_id && <Link2 className="size-4 shrink-0 text-muted" />}
                        <span className="truncate font-medium">{c.nombre || 'Sin nombre'}</span>
                        {cuotaCliente(c) && <Badge tono="lima">{cuotaCliente(c)!.plan.nombre}</Badge>}
                      </p>
                      <p className="truncate text-sm text-muted">{[c.nif, c.email].filter(Boolean).join(' · ')}</p>
                      <p className="flex flex-wrap items-center gap-x-2 text-xs">
                        {c.bienvenida_enviada_at && (
                          <span className="text-verde">Bienvenida enviada el {fecha(c.bienvenida_enviada_at.slice(0, 10))}</span>
                        )}
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

      <AltaCliente open={alta} onClose={() => setAlta(false)} onCreated={cargar} />
      <ReenviarAcceso cliente={reenviar} onClose={() => setReenviar(null)} onDone={cargar} />
      <OtraCuenta titular={otraCuenta} onClose={() => setOtraCuenta(null)} onCreated={cargar} />
      <EditorPlan perfil={editarPlan} onClose={() => setEditarPlan(null)} onGuardado={cargar} />
    </>
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
    `Hola${nombre.trim() ? ` ${nombre.trim()}` : ''}, ya tienes acceso al área de clientes de NomoTax.\n\n` +
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
