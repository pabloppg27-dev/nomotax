import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { CalendarClock, CheckCircle2, Loader2, Mail, MessageCircle, Phone, PhoneCall, Send, Video } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { errorMessage, supabase } from '../lib/supabase'
import { ASESOR, cargarHuecos, enlaceEmail, enlaceWhatsapp, enviarAlMotor, mensajeError } from '../lib/asesor'
import { Badge, Button, Card, Field, Input, Loading, Select, Textarea, cx, notify } from '../components/ui'
import { TIPOS_PETICION, type Peticion, type TipoPeticion } from '../lib/bandeja'
import { fecha } from '../lib/format'

type Llamada = {
  id: string
  tipo: 'llamame' | 'cita'
  inicio: string | null
  modalidad: 'meet' | 'telefono' | null
  tema: string | null
  meet_link: string | null
  estado: 'pendiente' | 'hecha'
  created_at: string
}

const fDiaClave = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' })
const fDiaSemana = new Intl.DateTimeFormat('es-ES', { weekday: 'short' })
const fDiaNum = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' })
const fHora = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false })
const fLargo = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

export function AsesorCard({ compacta = false, onAgendar }: { compacta?: boolean; onAgendar?: () => void }) {
  const { owner } = useAuth()
  const saludo = `Hola ${ASESOR.corto}, soy ${owner?.nombre ?? ''}. `
  const mail = enlaceEmail(`Consulta de ${owner?.nombre ?? 'un cliente'}`, `Hola ${ASESOR.corto},\n\n`)
  return (
    <div className={cx('flex items-center gap-4', compacta ? '' : 'flex-col text-center sm:flex-row sm:text-left')}>
      {/* Foto del asesor: pequeña en el Resumen, grande dentro de «Mi asesor» */}
      {compacta ? (
        <img src={ASESOR.foto} alt={ASESOR.nombre} className="size-16 shrink-0 self-start rounded-2xl object-cover ring-2 ring-lima" />
      ) : (
        <img src={ASESOR.foto} alt={ASESOR.nombre} className="size-28 shrink-0 rounded-2xl object-cover ring-2 ring-lima sm:size-32" />
      )}
      <div className="min-w-0 flex-1">
        {compacta && <p className="text-[11px] uppercase tracking-[0.12em] text-muted">Mi asesor</p>}
        <p className={cx('font-semibold tracking-tight', compacta ? 'text-[17px]' : 'text-2xl')}>{ASESOR.nombre}</p>
        <a href={mail} className="mt-0.5 inline-block text-sm font-medium text-ink underline-offset-2 hover:underline">
          {ASESOR.email}
        </a>
        <a href={`tel:${ASESOR.telefono}`} className="num block text-sm font-medium text-ink underline-offset-2 hover:underline">
          {ASESOR.telefonoVisible}
        </a>
        <div className={cx('mt-3 flex flex-wrap gap-2', !compacta && 'justify-center sm:justify-start')}>
          <a href={enlaceWhatsapp(saludo)} target="_blank" rel="noreferrer">
            <Button size={compacta ? 'sm' : 'md'} variant="accent" icon={<MessageCircle className="size-4" />}>
              WhatsApp
            </Button>
          </a>
          <a href={`tel:${ASESOR.telefono}`}>
            <Button size={compacta ? 'sm' : 'md'} variant="secondary" icon={<Phone className="size-4" />}>
              Llamar
            </Button>
          </a>
          <a href={mail}>
            <Button size={compacta ? 'sm' : 'md'} variant="secondary" icon={<Mail className="size-4" />}>
              Email
            </Button>
          </a>
          {onAgendar && (
            <Button size={compacta ? 'sm' : 'md'} variant="secondary" icon={<CalendarClock className="size-4" />} onClick={onAgendar}>
              Agendar una llamada
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function MiAsesor() {
  const { owner, ownerId, viewingOther } = useAuth()
  const [modo, setModo] = useState<'llamame' | 'cita'>('cita')
  const [llamadas, setLlamadas] = useState<Llamada[] | null>(null)
  const agendaRef = useRef<HTMLDivElement>(null)

  const cargarLlamadas = useCallback(async () => {
    if (!ownerId) return
    const { data } = await supabase.from('llamadas').select('*').eq('owner_id', ownerId).order('created_at', { ascending: false }).limit(10)
    setLlamadas((data as Llamada[]) ?? [])
  }, [ownerId])

  useEffect(() => {
    cargarLlamadas()
  }, [cargarLlamadas])

  if (!owner || !ownerId) return <Loading />

  const proximas = (llamadas ?? []).filter(
    (l) => l.estado === 'pendiente' && (l.tipo === 'llamame' || (l.inicio && new Date(l.inicio) > new Date(Date.now() - 3600000))),
  )

  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight sm:text-[28px]">Mi asesor</h1>

      <Card className="relative mb-6 overflow-hidden p-6 sm:p-8">
        <AsesorCard onAgendar={() => agendaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })} />
      </Card>

      {proximas.length > 0 && (
        <Card className="mb-6 p-5 sm:p-6">
          <h2 className="mb-3 font-semibold">Tus llamadas pendientes</h2>
          <ul className="divide-y divide-line text-[15px]">
            {proximas.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                {l.tipo === 'cita' ? (
                  l.modalidad === 'meet' ? <Video className="size-4 text-muted" /> : <Phone className="size-4 text-muted" />
                ) : (
                  <PhoneCall className="size-4 text-muted" />
                )}
                <span className="flex-1 first-letter:uppercase">
                  {l.tipo === 'cita' && l.inicio ? fLargo.format(new Date(l.inicio)) : 'Te llamaremos en cuanto podamos'}
                </span>
                {l.meet_link && (
                  <a href={l.meet_link} target="_blank" rel="noreferrer" className="text-sm font-medium underline">
                    Enlace de Google Meet
                  </a>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <PedirAlgo />

      <div ref={agendaRef} className="scroll-mt-6">
        <Card className="p-5 sm:p-6">
          <h2 className="font-semibold">Agendar una llamada</h2>
          {viewingOther ? (
            <p className="mt-2 text-sm text-muted">Estás viendo la cuenta de un cliente: la agenda la usa el propio cliente.</p>
          ) : (
            <>
              <div className="mt-4 inline-flex rounded-full bg-ink/5 p-1">
                {(
                  [
                    ['cita', 'Elegir día y hora'],
                    ['llamame', 'Llámame cuando puedas'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => setModo(id)}
                    className={cx('rounded-full px-4 py-2 text-sm transition-colors', modo === id ? 'bg-ink text-white' : 'text-ink/70 hover:text-ink')}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="mt-5">
                {modo === 'cita' ? <ElegirHora onHecho={cargarLlamadas} /> : <Llamame onHecho={cargarLlamadas} />}
              </div>
            </>
          )}
        </Card>
      </div>
    </>
  )
}

/** Peticiones al asesor (supabase/panel-asesor.sql): le llegan a su Bandeja */
function PedirAlgo() {
  const { ownerId, viewingOther } = useAuth()
  const [tipo, setTipo] = useState<TipoPeticion>('consulta')
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [lista, setLista] = useState<Peticion[] | null>(null)

  const cargar = useCallback(async () => {
    if (!ownerId) return
    const { data, error } = await supabase.from('peticiones').select('*').eq('owner_id', ownerId).order('created_at', { ascending: false }).limit(8)
    setLista(error ? null : ((data as Peticion[]) ?? []))
  }, [ownerId])

  useEffect(() => {
    cargar()
  }, [cargar])

  // Sin la tabla (falta panel-asesor.sql) no se enseña
  if (lista === null || !ownerId) return null

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    if (tipo !== 'renta' && !texto.trim()) return notify('Cuéntanos qué necesitas', 'error')
    setEnviando(true)
    const { error } = await supabase.from('peticiones').insert({ owner_id: ownerId, tipo, texto: texto.trim() || null })
    setEnviando(false)
    if (error) return notify(await errorMessage(error), 'error')
    setTexto('')
    notify('Enviado a tu asesor')
    cargar()
  }

  return (
    <Card className="mb-6 p-5 sm:p-6">
      <h2 className="font-semibold">Pedir algo a tu asesor</h2>
      {viewingOther ? (
        <p className="mt-1 text-sm text-muted">Lo que pida este cliente te llega a la Bandeja del panel.</p>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted">La declaración de la renta, un certificado, una duda… Le llega al momento y aquí verás cuándo está hecho.</p>
          <form onSubmit={enviar} className="mt-4 grid max-w-xl grid-cols-[minmax(0,1fr)] gap-4">
            <Field label="¿Qué necesitas?">
              <Select value={tipo} onChange={(e) => setTipo(e.target.value as TipoPeticion)}>
                {Object.entries(TIPOS_PETICION).map(([id, nombre]) => (
                  <option key={id} value={id}>
                    {nombre}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={tipo === 'renta' ? 'Algo que debamos saber (opcional)' : 'Cuéntanos'}>
              <Textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder={tipo === 'renta' ? 'Ej.: este año he vendido un piso' : tipo === 'certificado' ? 'Ej.: certificado de estar al corriente con Hacienda' : 'Escribe aquí'}
              />
            </Field>
            <div>
              <Button type="submit" variant="accent" icon={<Send className="size-4" />} loading={enviando}>
                Enviar a mi asesor
              </Button>
            </div>
          </form>
        </>
      )}
      {lista.length > 0 && (
        <ul className="mt-5 divide-y divide-line border-t border-line text-[15px]">
          {lista.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{TIPOS_PETICION[p.tipo] ?? p.tipo}</span>
                {p.texto && <span className="block truncate text-sm text-muted">{p.texto}</span>}
              </span>
              <span className="text-sm text-muted">{fecha(p.created_at.slice(0, 10))}</span>
              <Badge tono={p.estado === 'hecha' ? 'verde' : 'ambar'}>{p.estado === 'hecha' ? 'Hecho' : 'Pendiente'}</Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function datosCliente(owner: { nombre: string | null; email: string | null }) {
  return { nombre: owner.nombre || owner.email || '', empresa: owner.nombre || '', email: owner.email || '' }
}

function Llamame({ onHecho }: { onHecho: () => void }) {
  const { owner, ownerId } = useAuth()
  const [telefono, setTelefono] = useState(owner?.telefono ?? '')
  const [franja, setFranja] = useState('Cuando puedas')
  const [tema, setTema] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [hecho, setHecho] = useState(false)

  if (!owner || !ownerId) return null

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    if (telefono.replace(/\D/g, '').length < 6) return notify('Pon un teléfono para que podamos llamarte', 'error')
    setEnviando(true)
    try {
      const r = await enviarAlMotor({ accion: 'llamame', ...datosCliente(owner), telefono, franja, tema })
      if (!r.ok) throw new Error(mensajeError(r.error))
      const { error } = await supabase
        .from('llamadas')
        .insert({ owner_id: ownerId, tipo: 'llamame', telefono, franja, tema: tema.trim() || null })
      if (error) throw new Error(await errorMessage(error))
      setHecho(true)
      onHecho()
    } catch (err) {
      notify((err as Error).message, 'error')
    }
    setEnviando(false)
  }

  if (hecho) {
    return (
      <Hecho titulo="¡Hecho! Te llamaremos en cuanto podamos." texto={`Al ${telefono}. Si es urgente, escríbenos por WhatsApp.`} />
    )
  }

  return (
    <form onSubmit={enviar} className="grid max-w-xl grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2">
      <Field label="Teléfono">
        <Input type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
      </Field>
      <Field label="Mejor momento">
        <Select value={franja} onChange={(e) => setFranja(e.target.value)}>
          <option>Cuando puedas</option>
          <option>Por la mañana</option>
          <option>Por la tarde</option>
        </Select>
      </Field>
      <Field label="¿De qué quieres hablar?" className="sm:col-span-2">
        <Textarea value={tema} onChange={(e) => setTema(e.target.value)} placeholder="Ej.: dudas con el IVA del trimestre" />
      </Field>
      <div className="sm:col-span-2">
        <Button type="submit" variant="accent" icon={<PhoneCall className="size-4" />} loading={enviando}>
          Pedir que me llamen
        </Button>
      </div>
    </form>
  )
}

function ElegirHora({ onHecho }: { onHecho: () => void }) {
  const { owner, ownerId } = useAuth()
  const [huecos, setHuecos] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dia, setDia] = useState<string | null>(null)
  const [hora, setHora] = useState<string | null>(null)
  const [modalidad, setModalidad] = useState<'meet' | 'telefono'>('telefono')
  const [telefono, setTelefono] = useState(owner?.telefono ?? '')
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [hecho, setHecho] = useState<{ inicio: string; meet?: string } | null>(null)

  const cargar = useCallback(() => {
    setError(null)
    setHuecos(null)
    cargarHuecos()
      .then((r) => setHuecos(r.huecos))
      .catch(() => setError('No se ha podido cargar la agenda. Inténtalo en un momento o escríbenos por WhatsApp.'))
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const porDia = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const h of huecos ?? []) {
      const k = fDiaClave.format(new Date(h))
      m.set(k, [...(m.get(k) ?? []), h])
    }
    return m
  }, [huecos])

  useEffect(() => {
    if (!dia && porDia.size) setDia([...porDia.keys()][0])
  }, [porDia, dia])

  if (!owner || !ownerId) return null
  if (error)
    return (
      <div className="text-sm">
        <p className="text-rojo">{error}</p>
        <Button size="sm" variant="secondary" className="mt-3" onClick={cargar}>
          Reintentar
        </Button>
      </div>
    )
  if (!huecos)
    return (
      <p className="flex items-center gap-2 text-sm text-muted">
        <Loader2 className="size-4 animate-spin" /> Cargando la agenda…
      </p>
    )
  if (hecho) {
    return (
      <Hecho
        titulo={`Cita confirmada: ${fLargo.format(new Date(hecho.inicio))}`}
        texto={
          modalidad === 'meet'
            ? 'Te hemos enviado la invitación con el enlace de Google Meet a tu email.'
            : `Te llamaremos al ${telefono}. Te hemos enviado la invitación a tu email.`
        }
        enlace={hecho.meet}
      />
    )
  }

  const confirmar = async (e: FormEvent) => {
    e.preventDefault()
    if (!hora) return notify('Elige una hora', 'error')
    if (telefono.replace(/\D/g, '').length < 6) return notify('Pon un teléfono de contacto', 'error')
    setEnviando(true)
    try {
      const r = await enviarAlMotor({
        accion: 'reservar',
        origen: 'clientes',
        inicio: hora,
        tipo: modalidad,
        ...datosCliente(owner),
        telefono,
        motivo,
        idioma: 'es',
        zona: Intl.DateTimeFormat().resolvedOptions().timeZone,
      })
      if (!r.ok) {
        if (r.error === 'ocupado') {
          setHora(null)
          cargar()
        }
        throw new Error(mensajeError(r.error))
      }
      await supabase.from('llamadas').insert({
        owner_id: ownerId,
        tipo: 'cita',
        inicio: r.inicio ?? hora,
        modalidad,
        telefono,
        tema: motivo.trim() || null,
        meet_link: r.meet || null,
      })
      setHecho({ inicio: r.inicio ?? hora, meet: r.meet })
      onHecho()
    } catch (err) {
      notify((err as Error).message, 'error')
    }
    setEnviando(false)
  }

  const dias = [...porDia.keys()]
  if (!dias.length) return <p className="text-sm text-muted">No quedan huecos libres en las próximas semanas. Escríbenos por WhatsApp.</p>

  return (
    <form onSubmit={confirmar} className="min-w-0 space-y-5">
      <div>
        <p className="mb-2 text-[13px] font-medium text-ink/80">Día</p>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {dias.map((k) => {
            const d = new Date(porDia.get(k)![0])
            return (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setDia(k)
                  setHora(null)
                }}
                className={cx(
                  'flex min-w-16 flex-col items-center rounded-xl border px-3 py-2 text-sm transition-colors',
                  dia === k ? 'border-ink bg-ink text-white' : 'border-line bg-white hover:border-ink/40',
                )}
              >
                <span className={cx('text-xs capitalize', dia === k ? 'text-white/70' : 'text-muted')}>{fDiaSemana.format(d)}</span>
                <span className="font-medium">{fDiaNum.format(d)}</span>
              </button>
            )
          })}
        </div>
      </div>

      {dia && (
        <div>
          <p className="mb-2 text-[13px] font-medium text-ink/80">Hora</p>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
            {(porDia.get(dia) ?? []).map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => setHora(h)}
                className={cx(
                  'rounded-lg border py-2 text-sm tabular-nums transition-colors',
                  hora === h ? 'border-ink bg-lima font-medium text-ink' : 'border-line bg-white hover:border-ink/40',
                )}
              >
                {fHora.format(new Date(h))}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">Horas en tu zona horaria · llamadas de 30 minutos.</p>
        </div>
      )}

      {hora && (
        <div className="grid max-w-xl grid-cols-[minmax(0,1fr)] gap-4 border-t border-line pt-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <p className="mb-2 text-[13px] font-medium text-ink/80">¿Cómo prefieres hablar?</p>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['telefono', 'Que me llamen al teléfono', Phone],
                  ['meet', 'Videollamada (Google Meet)', Video],
                ] as const
              ).map(([id, label, Icono]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setModalidad(id)}
                  className={cx(
                    'inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition-colors',
                    modalidad === id ? 'border-ink bg-ink text-white' : 'border-line hover:border-ink/40',
                  )}
                >
                  <Icono className="size-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>
          <Field label="Teléfono de contacto">
            <Input type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
          </Field>
          <Field label="Motivo (opcional)" className="sm:col-span-2">
            <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: revisar la declaración del trimestre" />
          </Field>
          <div className="sm:col-span-2">
            <Button type="submit" variant="accent" className="!h-auto w-full !whitespace-normal py-3 text-left sm:w-auto" icon={<CalendarClock className="size-4 shrink-0" />} loading={enviando}>
              Confirmar cita · {fLargo.format(new Date(hora))}
            </Button>
          </div>
        </div>
      )}
    </form>
  )
}

function Hecho({ titulo, texto, enlace }: { titulo: string; texto: string; enlace?: string }) {
  return (
    <div className="flex gap-3 rounded-xl bg-lima/35 p-4">
      <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-verde" />
      <div>
        <p className="font-medium first-letter:uppercase">{titulo}</p>
        <p className="mt-1 text-sm text-ink/75">{texto}</p>
        {enlace && (
          <a href={enlace} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-medium underline">
            Abrir Google Meet
          </a>
        )}
      </div>
    </div>
  )
}
