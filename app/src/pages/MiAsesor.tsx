import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { CalendarClock, CheckCircle2, Loader2, Mail, MessageCircle, Phone, PhoneCall, Video } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { errorMessage, supabase } from '../lib/supabase'
import { ASESOR, cargarHuecos, enlaceEmail, enlaceWhatsapp, enviarAlMotor, mensajeError } from '../lib/asesor'
import { Button, Card, Field, Input, Loading, Select, Textarea, cx, notify } from '../components/ui'

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
      <img
        src={ASESOR.foto}
        alt={ASESOR.nombre}
        className={cx('shrink-0 rounded-2xl object-cover ring-2 ring-lima', compacta ? 'size-16' : 'size-28 sm:size-32')}
      />
      <div className="min-w-0 flex-1">
        <p className={cx('uppercase tracking-[0.12em] text-muted', compacta ? 'text-[11px]' : 'text-xs')}>Tu asesor</p>
        <p className={cx('font-semibold tracking-tight', compacta ? 'text-[17px]' : 'text-2xl')}>{ASESOR.nombre}</p>
        <p className="text-sm text-muted">{ASESOR.cargo}</p>
        <a href={mail} className="mt-0.5 inline-block text-sm font-medium text-ink underline-offset-2 hover:underline">
          {ASESOR.email}
        </a>
        <div className={cx('mt-3 flex flex-wrap gap-2', !compacta && 'justify-center sm:justify-start')}>
          <a href={enlaceWhatsapp(saludo)} target="_blank" rel="noreferrer">
            <Button size={compacta ? 'sm' : 'md'} variant="accent" icon={<MessageCircle className="size-4" />}>
              WhatsApp
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
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">Mi asesor</h1>
        <p className="mt-1 text-[15px] text-muted">Habla con tu asesor cuando lo necesites.</p>
      </div>

      <Card className="relative mb-6 overflow-hidden p-6 sm:p-8">
        <AsesorCard onAgendar={() => agendaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })} />
        <p className="mx-auto mt-5 max-w-xl text-center text-[15px] text-ink/75 sm:mx-0 sm:text-left">
          Escríbeme por WhatsApp para dudas rápidas, mándame un email si quieres adjuntar documentos, o reserva una llamada: elige un hueco en mi agenda o pídeme que te llame en cuanto pueda.
        </p>
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
    <form onSubmit={enviar} className="grid max-w-xl gap-4 sm:grid-cols-2">
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
    <form onSubmit={confirmar} className="space-y-5">
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
        <div className="grid max-w-xl gap-4 border-t border-line pt-5 sm:grid-cols-2">
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
            <Button type="submit" variant="accent" icon={<CalendarClock className="size-4" />} loading={enviando}>
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
