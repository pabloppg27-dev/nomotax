import { useCallback, useEffect, useState } from 'react'
import { Check, Percent, X } from 'lucide-react'
import { errorMessage, supabase } from '../lib/supabase'
import { fecha, num } from '../lib/format'
import { MESES } from '../lib/laboral'
import type { Trabajador } from '../lib/types'
import { Badge, Button, Card, Field, Input, Modal, Select, Textarea, notify } from './ui'

export type SolicitudIrpf = {
  id: string
  owner_id: string
  trabajador_id: string
  pct_actual: number | null
  pct_solicitado: number
  desde: string
  comentario: string | null
  estado: 'pendiente' | 'aplicada' | 'rechazada'
  respuesta: string | null
  resuelta_at: string | null
  created_at: string
}

/* Vista previa local: las solicitudes viven en memoria y las comparten las dos vistas */
let DEMO: SolicitudIrpf[] = []
const avisos = new Set<() => void>()
const avisar = () => avisos.forEach((f) => f())

const mesTexto = (aaaamm: string) => {
  const [a, m] = aaaamm.split('-').map(Number)
  return `${MESES[m - 1]} ${a}`
}

/** Este mes y los 5 siguientes */
function proximosMeses(): string[] {
  const d = new Date()
  return Array.from({ length: 6 }, (_, i) => {
    const f = new Date(d.getFullYear(), d.getMonth() + i, 1)
    return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}`
  })
}

const ESTADO = {
  pendiente: <Badge tono="ambar">Pendiente</Badge>,
  aplicada: <Badge tono="verde">Aplicada</Badge>,
  rechazada: <Badge tono="gris">Rechazada</Badge>,
}

function useSolicitudes(t: Trabajador, demo: boolean) {
  const [lista, setLista] = useState<SolicitudIrpf[]>([])
  const cargar = useCallback(async () => {
    if (demo) return setLista(DEMO.filter((s) => s.trabajador_id === t.id))
    const { data } = await supabase.from('solicitudes_irpf').select('*').eq('trabajador_id', t.id).order('created_at', { ascending: false })
    setLista((data as SolicitudIrpf[]) ?? [])
  }, [t.id, demo])
  useEffect(() => {
    cargar()
    if (!demo) return
    avisos.add(cargar)
    return () => void avisos.delete(cargar)
  }, [cargar, demo])
  return { lista, cargar }
}

/** Lo que ve el trabajador: botón para pedir más retención y sus solicitudes */
export function PedirCambioIrpf({ trabajador: t, demo = false }: { trabajador: Trabajador; demo?: boolean }) {
  const { lista, cargar } = useSolicitudes(t, demo)
  const actual = t.irpf_pct != null ? Number(t.irpf_pct) : null
  const meses = proximosMeses()
  const [abierto, setAbierto] = useState(false)
  const [pct, setPct] = useState('')
  const [desde, setDesde] = useState(meses[1])
  const [comentario, setComentario] = useState('')
  const [enviando, setEnviando] = useState(false)
  const pendiente = lista.some((s) => s.estado === 'pendiente')

  const abrir = () => {
    setPct(actual != null ? String(Math.ceil(actual + 1)) : '')
    setDesde(meses[1])
    setComentario('')
    setAbierto(true)
  }

  const enviar = async () => {
    const n = Number(pct.replace(',', '.'))
    if (!n || n > 47) return notify('Pon un porcentaje entre el actual y el 47%.', 'error')
    if (actual != null && n <= actual) return notify(`Tiene que ser mayor que tu retención actual (${num(actual)}%).`, 'error')
    setEnviando(true)
    const fila = { owner_id: t.owner_id, trabajador_id: t.id, pct_actual: actual, pct_solicitado: n, desde, comentario: comentario.trim() || null }
    if (demo) {
      DEMO = [{ ...fila, id: crypto.randomUUID(), estado: 'pendiente', respuesta: null, resuelta_at: null, created_at: new Date().toISOString() }, ...DEMO]
      avisar()
    } else {
      const { error } = await supabase.from('solicitudes_irpf').insert(fila)
      if (error) {
        setEnviando(false)
        return notify(await errorMessage(error), 'error')
      }
    }
    setEnviando(false)
    setAbierto(false)
    notify('Solicitud enviada a tu gestor')
    cargar()
  }

  return (
    <Card className="mt-4 max-w-2xl p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <Percent className="size-4" /> Retención de IRPF
          </h2>
          <p className="mt-1 text-sm text-muted">
            {actual != null ? <>Ahora se te retiene un <b className="num text-ink">{num(actual)}%</b>. </> : null}
            Si tienes otros ingresos o consideras que tu retención es insuficiente, puedes solicitar que se incremente.
          </p>
        </div>
        <Button variant="secondary" onClick={abrir} disabled={pendiente}>
          Solicitar más retención
        </Button>
      </div>

      {lista.length > 0 && (
        <ul className="mt-4 divide-y divide-line border-t border-line text-[15px]">
          {lista.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <span>
                <span className="num font-medium">{num(Number(s.pct_solicitado))}%</span>
                <span className="text-muted"> desde {mesTexto(s.desde)} · pedida el {fecha(s.created_at)}</span>
                {s.respuesta && <span className="block text-sm text-muted">{s.respuesta}</span>}
              </span>
              {ESTADO[s.estado]}
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={abierto}
        onClose={() => setAbierto(false)}
        title="Solicitar más retención de IRPF"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAbierto(false)}>Cancelar</Button>
            <Button onClick={enviar} loading={enviando}>Enviar al gestor</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nueva retención (%)" hint={actual != null ? `Actual: ${num(actual)}%. Solo se puede subir.` : undefined}>
              <Input inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} placeholder="20" />
            </Field>
            <Field label="A partir de la nómina de">
              <Select value={desde} onChange={(e) => setDesde(e.target.value)}>
                {meses.map((m) => (
                  <option key={m} value={m} className="capitalize">{mesTexto(m)}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Comentario (opcional)">
            <Textarea rows={3} value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Por ejemplo: tengo otros ingresos este año" />
          </Field>
          <p className="text-xs text-muted">
            Se aplica en las nóminas siguientes y se mantiene hasta final de año o hasta que pidas otro cambio (art. 88.5 del Reglamento del IRPF).
            Para bajar la retención por un cambio de situación familiar, avisa a la empresa para actualizar tu modelo 145.
          </p>
        </div>
      </Modal>
    </Card>
  )
}

/** Lo que ve el gestor en la ficha del trabajador: las solicitudes y los botones para resolverlas */
export function SolicitudesIrpfGestor({ trabajador: t, demo = false, onAplicada }: { trabajador: Trabajador; demo?: boolean; onAplicada?: () => void }) {
  const { lista, cargar } = useSolicitudes(t, demo)
  if (lista.length === 0) return null

  const resolver = async (s: SolicitudIrpf, estado: 'aplicada' | 'rechazada') => {
    const cambios = { estado, resuelta_at: new Date().toISOString() }
    if (demo) {
      DEMO = DEMO.map((x) => (x.id === s.id ? { ...x, ...cambios } : x))
      if (estado === 'aplicada') t.irpf_pct = s.pct_solicitado
      avisar()
    } else {
      const { error } = await supabase.from('solicitudes_irpf').update(cambios).eq('id', s.id)
      if (error) return notify(await errorMessage(error), 'error')
      if (estado === 'aplicada') {
        const r = await supabase.from('trabajadores').update({ irpf_pct: s.pct_solicitado }).eq('id', t.id)
        if (r.error) return notify(await errorMessage(r.error), 'error')
      }
    }
    notify(estado === 'aplicada' ? `Retención cambiada al ${num(Number(s.pct_solicitado))}%` : 'Solicitud rechazada')
    cargar()
    if (estado === 'aplicada') onAplicada?.()
  }

  return (
    <Card className="p-5 sm:p-6">
      <h2 className="mb-3 flex items-center gap-2 font-semibold">
        <Percent className="size-4" /> Solicitudes de retención de IRPF
      </h2>
      <ul className="divide-y divide-line text-[15px]">
        {lista.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p>
                <span className="num">{s.pct_actual != null ? `${num(Number(s.pct_actual))}%` : '—'}</span> →{' '}
                <span className="num font-semibold">{num(Number(s.pct_solicitado))}%</span>
                <span className="text-muted"> desde la nómina de {mesTexto(s.desde)}</span>
              </p>
              <p className="text-sm text-muted">Pedida el {fecha(s.created_at)}{s.comentario ? ` · «${s.comentario}»` : ''}</p>
            </div>
            {s.estado === 'pendiente' ? (
              <div className="flex gap-2">
                <Button size="sm" icon={<Check className="size-4" />} onClick={() => resolver(s, 'aplicada')}>Aplicada</Button>
                <Button size="sm" variant="ghost" icon={<X className="size-4" />} onClick={() => resolver(s, 'rechazada')}>Rechazar</Button>
              </div>
            ) : (
              ESTADO[s.estado]
            )}
          </li>
        ))}
      </ul>
    </Card>
  )
}
