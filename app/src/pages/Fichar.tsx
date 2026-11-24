import { useCallback, useEffect, useState } from 'react'
import { Clock, Coffee, LogIn, LogOut, Play, Pencil } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { errorMessage, supabase } from '../lib/supabase'
import { fecha } from '../lib/format'
import { NOMBRE_TIPO, duracion, estadoActual, hora, resumenDias, type Fichaje, type TipoFichaje } from '../lib/fichaje'
import { enDemo, fichajesDemo } from '../lib/demoFichaje'
import { avisarGuia, useGuia } from '../lib/guia'
import { Badge, Button, Card, Field, Input, Loading, Modal, Select, Textarea, notify } from '../components/ui'

/** Página del trabajador: fichar entrada, pausas y salida, y ver su registro */
export default function Fichar() {
  const { ownerId, miembro, viendoComo } = useAuth()
  const local = enDemo()
  // Cuenta demo con «Ver lo que ve X»: el fichaje se simula (no se guarda nada)
  const demo = local || Boolean(viendoComo)
  const trabajadorId = local ? 'd1' : miembro?.trabajador_id && miembro.trabajador_id !== 'demo' ? miembro.trabajador_id : null
  const [fs, setFs] = useState<Fichaje[] | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [, setTick] = useState(0)
  const [corregir, setCorregir] = useState(false)
  // Guía rápida: lo que se ficha durante la guía es de prueba y no sale de esta pantalla
  const { simulando } = useGuia()
  const [sim, setSim] = useState<Fichaje[]>([])
  useEffect(() => {
    if (!simulando) setSim([])
  }, [simulando])

  const cargar = useCallback(async () => {
    if (local) return setFs((x) => x ?? fichajesDemo().filter((f) => f.trabajador_id === 'd1'))
    if (!ownerId || !trabajadorId) return setFs([])
    const desde = new Date(Date.now() - 62 * 86400000).toISOString()
    const { data } = await supabase.from('fichajes').select('*').eq('trabajador_id', trabajadorId).gte('momento', desde).order('momento')
    // «Ver lo que ve X»: su registro real; si la demo no tiene fichajes cargados, uno de ejemplo
    if (viendoComo && !data?.length) return setFs((x) => x ?? fichajesDemo().filter((f) => f.trabajador_id === 'd1'))
    setFs((x) => (viendoComo && x?.length ? x : (data as Fichaje[]) ?? []))
  }, [ownerId, trabajadorId, local, viendoComo])

  useEffect(() => {
    cargar()
    const t = setInterval(() => setTick((n) => n + 1), 30000)
    return () => clearInterval(t)
  }, [cargar])

  if (!fs) return <Loading />

  if (!demo && (!trabajadorId || !miembro?.fichaje)) {
    return (
      <Card className="p-5 sm:p-6">
        <p className="text-sm text-muted">La empresa aún no te ha activado el fichaje. Pídeselo a administración.</p>
      </Card>
    )
  }

  const hoyDia = new Date().toLocaleDateString('sv-SE')
  // En la guía se empieza el día «fuera», para poder probar «Fichar entrada»
  const ver = simulando ? [...fs.filter((f) => new Date(f.momento).toLocaleDateString('sv-SE') !== hoyDia), ...sim] : fs
  const estado = estadoActual(ver)
  const dias = resumenDias(ver)
  const hoy = dias.find((d) => d.dia === hoyDia)
  const pendientes = ver.filter((f) => f.estado === 'pendiente')

  const fichar = async (tipo: TipoFichaje) => {
    if (simulando) {
      const ahora = new Date().toISOString()
      setSim((x) => [
        ...x,
        { id: `guia-${Date.now()}`, owner_id: ownerId ?? 'guia', trabajador_id: trabajadorId ?? 'guia', tipo, momento: ahora, origen: 'app', estado: 'valido', motivo: null, anula_id: null, registrado_por: null, revisado_por: null, revisado_at: null, created_at: ahora },
      ])
      notify(`${NOMBRE_TIPO[tipo]} a las ${hora(ahora)} · era una prueba, no se ha guardado`)
      return avisarGuia('fichado')
    }
    if (demo) {
      const ahora = new Date().toISOString()
      setFs((x) => [...(x ?? []), { ...x![0], id: `n${Date.now()}`, tipo, momento: ahora, origen: 'app', estado: 'valido', motivo: null, anula_id: null }])
      return notify(`${NOMBRE_TIPO[tipo]} registrada a las ${hora(ahora)} (demo)`)
    }
    setEnviando(true)
    const { error } = await supabase.rpc('fichar', { p_cuenta: ownerId, p_tipo: tipo })
    setEnviando(false)
    if (error) return notify(await errorMessage(error), 'error')
    notify(`${NOMBRE_TIPO[tipo]} registrada a las ${hora(new Date().toISOString())}`)
    cargar()
  }

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">Registro de jornada</h1>
        {local && <p className="mb-2 inline-block rounded-xl bg-lima/40 px-3 py-1 text-sm">Modo demo: así lo ve Laura, una trabajadora</p>}
        <p className="mt-1 text-[15px] text-muted">Pulsa al empezar y al acabar. La hora la pone el servidor.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr] lg:items-start">
        <Card className="p-5 text-center sm:p-6" guia="fichar-estado">
          <Badge tono={estado === 'dentro' ? 'verde' : estado === 'pausa' ? 'ambar' : 'gris'}>
            {estado === 'dentro' ? 'Trabajando' : estado === 'pausa' ? 'En pausa' : 'Fuera'}
          </Badge>
          <p className="num mt-3 text-4xl font-semibold">{duracion(hoy?.trabajadoMin ?? 0)}</p>
          <p className="text-sm text-muted">trabajado hoy{hoy?.entrada ? ` · entrada ${hora(hoy.entrada)}` : ''}</p>

          <div className="mt-6 grid gap-2" data-guia="fichar-boton">
            {estado === 'fuera' && (
              <Button className="h-14 text-lg" loading={enviando} icon={<LogIn className="size-5" />} onClick={() => fichar('entrada')}>
                Fichar entrada
              </Button>
            )}
            {estado === 'dentro' && (
              <>
                <Button className="h-14 text-lg" loading={enviando} icon={<LogOut className="size-5" />} onClick={() => fichar('salida')}>
                  Fichar salida
                </Button>
                <Button variant="secondary" disabled={enviando} icon={<Coffee className="size-4" />} onClick={() => fichar('pausa')}>
                  Empezar pausa
                </Button>
              </>
            )}
            {estado === 'pausa' && (
              <>
                <Button className="h-14 text-lg" loading={enviando} icon={<Play className="size-5" />} onClick={() => fichar('reanudar')}>
                  Volver de la pausa
                </Button>
                <Button variant="secondary" disabled={enviando} icon={<LogOut className="size-4" />} onClick={() => fichar('salida')}>
                  Fichar salida
                </Button>
              </>
            )}
          </div>
          <button onClick={() => setCorregir(true)} className="mt-4 inline-flex items-center gap-1.5 text-sm text-muted underline hover:text-ink">
            <Pencil className="size-3.5" /> Se me olvidó fichar
          </button>
          {pendientes.length > 0 && <p className="mt-2 text-xs text-muted">{pendientes.length} corrección(es) pendiente(s) de aprobar</p>}
        </Card>

        <Card className="divide-y divide-line">
          <h2 className="flex items-center gap-2 px-4 py-3 font-semibold sm:px-5">
            <Clock className="size-4" /> Mis últimos días
          </h2>
          {dias.length === 0 ? (
            <p className="px-4 py-4 text-sm text-muted sm:px-5">Todavía no has fichado.</p>
          ) : (
            dias.slice(0, 31).map((d) => (
              <div key={d.dia} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                <div className="min-w-0">
                  <p className="font-medium">{fecha(d.dia)}</p>
                  <p className="num text-sm text-muted">
                    {d.entrada ? hora(d.entrada) : '—'} – {d.salida ? hora(d.salida) : d.abierto ? 'abierto' : '—'}
                    {d.pausaMin >= 1 ? ` · pausa ${duracion(d.pausaMin)}` : ''}
                  </p>
                </div>
                <p className="num font-medium">{duracion(d.trabajadoMin)}</p>
              </div>
            ))
          )}
        </Card>
      </div>

      <ModalCorreccion
        open={corregir}
        onClose={() => setCorregir(false)}
        cuenta={ownerId!}
        trabajadorId={trabajadorId!}
        fichajes={fs}
        onHecho={() => {
          setCorregir(false)
          cargar()
        }}
      />
    </>
  )
}

/** Corrección: añade un fichaje olvidado o sustituye uno (el original se conserva). La usan trabajador y admin. */
export function ModalCorreccion({
  open,
  onClose,
  cuenta,
  trabajadorId,
  fichajes,
  onHecho,
  admin = false,
}: {
  open: boolean
  onClose: () => void
  cuenta: string
  trabajadorId: string
  fichajes: Fichaje[]
  onHecho: () => void
  admin?: boolean
}) {
  const ahora = new Date()
  const [tipo, setTipo] = useState<TipoFichaje>('salida')
  const [dia, setDia] = useState(ahora.toLocaleDateString('sv-SE'))
  const [h, setH] = useState('')
  const [motivo, setMotivo] = useState('')
  const [anula, setAnula] = useState('')
  const [enviando, setEnviando] = useState(false)

  const delDia = fichajes.filter((f) => f.estado === 'valido' && new Date(f.momento).toLocaleDateString('sv-SE') === dia)

  const enviar = async () => {
    if (!h) return notify('Pon la hora', 'error')
    if (!motivo.trim()) return notify('Pon el motivo', 'error')
    if (enDemo()) {
      notify('Modo demo: no se guarda nada')
      return onHecho()
    }
    setEnviando(true)
    const { error } = await supabase.rpc('corregir_fichaje', {
      p_cuenta: cuenta,
      p_trabajador: trabajadorId,
      p_tipo: tipo,
      p_momento: new Date(`${dia}T${h}:00`).toISOString(),
      p_motivo: motivo.trim(),
      p_anula: anula || null,
    })
    setEnviando(false)
    if (error) return notify(await errorMessage(error), 'error')
    notify(admin ? 'Corrección registrada' : 'Corrección enviada: la verá administración')
    setMotivo('')
    setH('')
    setAnula('')
    onHecho()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={admin ? 'Corregir fichaje' : 'Pedir una corrección'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={enviando} onClick={enviar}>
            {admin ? 'Registrar' : 'Enviar'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <p className="text-sm text-muted">
          El registro no se borra ni se edita: la corrección queda guardada con su motivo{admin ? '' : ' y la tiene que aprobar la empresa'}.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Día">
            <Input type="date" value={dia} max={ahora.toLocaleDateString('sv-SE')} onChange={(e) => setDia(e.target.value)} />
          </Field>
          <Field label="Hora">
            <Input type="time" value={h} onChange={(e) => setH(e.target.value)} />
          </Field>
        </div>
        <Field label="Qué fichaje">
          <Select value={tipo} onChange={(e) => setTipo(e.target.value as TipoFichaje)}>
            {(Object.keys(NOMBRE_TIPO) as TipoFichaje[]).map((t) => (
              <option key={t} value={t}>
                {NOMBRE_TIPO[t]}
              </option>
            ))}
          </Select>
        </Field>
        {delDia.length > 0 && (
          <Field label="¿Sustituye a uno que está mal?" hint="El original no se borra: queda marcado como corregido.">
            <Select value={anula} onChange={(e) => setAnula(e.target.value)}>
              <option value="">No, es uno que faltaba</option>
              {delDia.map((f) => (
                <option key={f.id} value={f.id}>
                  {NOMBRE_TIPO[f.tipo]} {hora(f.momento)}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Motivo">
          <Textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: olvidé fichar la salida" />
        </Field>
      </div>
    </Modal>
  )
}
