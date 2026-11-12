import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Copy, Plus, Search, Users } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { errorMessage, supabase } from '../lib/supabase'
import { eur, fecha } from '../lib/format'
import { ESTADOS_TRABAJADOR, diasHabilesHasta } from '../lib/laboral'
import type { EstadoTrabajador, Profile } from '../lib/types'
import { Badge, Button, Card, Empty, Field, Input, Loading, Modal, PageHeader, notify } from '../components/ui'

type Fila = Profile & { porRevisar: number; facturado: number; gastos: number; ultimo: string | null }
type LlamadaPend = { id: string; owner_id: string; tipo: 'llamame' | 'cita'; inicio: string | null; modalidad: string | null; telefono: string | null; tema: string | null; franja: string | null; meet_link: string | null; created_at: string }
type Pendiente = { id: string; owner_id: string; nombre: string; fecha_inicio: string; estado: EstadoTrabajador; created_at: string }

export default function Asesor() {
  const { me, setOwner } = useAuth()
  const navigate = useNavigate()
  const [filas, setFilas] = useState<Fila[] | null>(null)
  const [q, setQ] = useState('')
  const [alta, setAlta] = useState(false)
  const [pendientes, setPendientes] = useState<Pendiente[]>([])
  const [llamadas, setLlamadas] = useState<LlamadaPend[]>([])

  const cargar = useCallback(async () => {
    const anio = new Date().getFullYear()
    const [p, g, f, w, ll] = await Promise.all([
      supabase.from('profiles').select('*').eq('role', 'client').order('nombre'),
      supabase.from('expenses').select('owner_id, estado, base, fecha, created_at').gte('created_at', `${anio - 1}-01-01`),
      supabase.from('invoices').select('owner_id, estado, base, fecha, created_at').neq('estado', 'borrador').gte('fecha', `${anio}-01-01`),
      supabase
        .from('trabajadores')
        .select('id, owner_id, nombre, fecha_inicio, estado, created_at')
        .in('estado', ['solicitada', 'en_tramite'])
        .order('fecha_inicio'),
      supabase.from('llamadas').select('*').eq('estado', 'pendiente').order('created_at'),
    ])
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

  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase()
    return (filas ?? []).filter((c) => !t || [c.nombre, c.email, c.nif].some((v) => v?.toLowerCase().includes(t)))
  }, [filas, q])

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
                    <td className="min-w-0 md:px-4 md:py-3">
                      <p className="truncate font-medium">{c.nombre || 'Sin nombre'}</p>
                      <p className="truncate text-sm text-muted">{[c.nif, c.email].filter(Boolean).join(' · ')}</p>
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
    </>
  )
}

function AltaCliente({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [email, setEmail] = useState('')
  const [nombre, setNombre] = useState('')
  const [nif, setNif] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<{ email: string; password: string } | null>(null)

  const cerrar = () => {
    setEmail('')
    setNombre('')
    setNif('')
    setResultado(null)
    onClose()
  }

  const crear = async (e?: FormEvent) => {
    e?.preventDefault()
    setEnviando(true)
    const { data, error } = await supabase.functions.invoke('invitar-cliente', { body: { email, nombre, nif } })
    setEnviando(false)
    if (error) return notify(await errorMessage(error), 'error')
    setResultado({ email: data.email, password: data.password })
    onCreated()
  }

  const mensaje = resultado
    ? `Hola${nombre ? ` ${nombre.split(' ')[0]}` : ''}, ya tienes acceso al área de clientes de NomoTax.\n\n` +
      `Entra en ${window.location.origin}\nUsuario: ${resultado.email}\nContraseña provisional: ${resultado.password}\n\n` +
      'Al entrar, cámbiala en «Mi perfil».'
    : ''

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
              Crear acceso
            </Button>
          </>
        )
      }
    >
      {resultado ? (
        <div className="space-y-3">
          <p className="text-[15px]">
            Envíale este mensaje a tu cliente. <strong>La contraseña solo se muestra ahora.</strong>
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
          <button type="submit" hidden />
        </form>
      )}
    </Modal>
  )
}
