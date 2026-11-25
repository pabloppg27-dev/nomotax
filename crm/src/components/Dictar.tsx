import { useEffect, useRef, useState } from 'react'
import { CalendarClock, Check, Keyboard, Loader2, Mic, Square, Undo2, UserPlus } from 'lucide-react'
import * as db from '../lib/datos'
import { escuchar, grabar, hayTranscripcion, hayVoz, interpretar, transcribir } from '../lib/dictado'
import { corta } from '../lib/fechas'
import { useStore } from '../lib/store'
import type { Cliente, Tarea } from '../lib/tipos'
import TareaDetalle from './TareaDetalle'
import ReunionDetalle, { type BorradorReunion } from './ReunionDetalle'
import { Boton, entrada, Modal, NOMBRE_PRIORIDAD, Punto } from './ui'

/** Dictas → Claude piensa, redacta y asocia → se guarda solo. Puedes editar o deshacer. */
export default function Dictar({ onClose, contexto }: { onClose: () => void; contexto?: Partial<Tarea> }) {
  const { clientes, proyectos, recargar, cliente, proyecto } = useStore()
  const [texto, setTexto] = useState('')
  const [oyendo, setOyendo] = useState(false)
  const [pensando, setPensando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hecho, setHecho] = useState<{ tareas: Tarea[]; clientes: Cliente[]; reuniones: (BorradorReunion & { enviada?: boolean })[]; resumen: string; sinClaude?: boolean } | null>(null)
  const [revisar, setRevisar] = useState<number | null>(null) // reunión dictada que se está revisando
  const [editar, setEditar] = useState<Tarea | null>(null)
  const parar = useRef<(() => void) | null>(null)
  const textoRef = useRef('')
  const area = useRef<HTMLTextAreaElement>(null)
  const [teclado, setTeclado] = useState(false) // dictar con el micro del teclado (iPhone)
  const [conOpenAI, setConOpenAI] = useState(false) // se graba y el texto llega al parar
  const [transcribiendo, setTranscribiendo] = useState(false)
  const grabacion = useRef<Promise<string> | null>(null) // transcripción en curso
  const soltar = useRef<(() => void) | null>(null) // apaga el micro sin transcribir (al cerrar)
  const sesion = useRef(0) // cambia al cerrar: lo que llegue tarde de una sesión anterior se descarta

  /** Sin micro del navegador (o falla): se dicta con el micro del teclado */
  function usarTeclado() { setOyendo(false); setTeclado(true); area.current?.focus() }
  const errorVoz = (m: string) => { if (/not-allowed|service-not-allowed|audio-capture|permiso/.test(m)) usarTeclado(); else { setError(m); setOyendo(false) } }

  function empezar() {
    setHecho(null); setTexto(''); textoRef.current = ''
    void arrancar('')
  }
  /** Vuelve a escuchar y añade lo nuevo detrás de lo que ya hay (sin borrar lo editado) */
  function seguir() { void arrancar(textoRef.current.trim()) }

  const poner = (v: string) => { setTexto(v); textoRef.current = v }
  async function arrancar(previo: string) {
    setError(null)
    const s = sesion.current
    const openai = await hayTranscripcion()
    if (s !== sesion.current) return
    if (openai) return grabarConOpenAI(previo)
    if (!hayVoz()) return usarTeclado()
    setConOpenAI(false)
    parar.current = escuchar((t) => poner(previo ? `${previo} ${t}` : t), () => setOyendo(false), errorVoz)
    setOyendo(true)
  }
  /** Graba; al parar, OpenAI lo pasa a texto (con los nombres de clientes y proyectos como vocabulario) */
  async function grabarConOpenAI(previo: string) {
    const s = sesion.current
    let fin: () => Promise<Blob>
    try { fin = await grabar() } catch (e) {
      const n = (e as Error).name
      return errorVoz(n === 'NotAllowedError' || n === 'SecurityError' ? 'not-allowed' : n === 'NotFoundError' ? 'audio-capture' : (e as Error).message)
    }
    if (s !== sesion.current) { void fin(); return }
    setConOpenAI(true); setOyendo(true)
    soltar.current = () => { void fin() }
    parar.current = () => {
      parar.current = null; soltar.current = null
      setOyendo(false); setTranscribiendo(true)
      grabacion.current = fin()
        .then((audio) => transcribir(audio, clientes, proyectos))
        .then((t) => { const v = [previo, t].filter(Boolean).join(' '); poner(v); return v })
        .catch((e) => { setError(`No he podido pasar la voz a texto: ${(e as Error).message}`); return textoRef.current })
        .finally(() => { setTranscribiendo(false); grabacion.current = null })
    }
  }
  // En iPhone/iPad se abre el teclado (su micro es lo más fiable); en el ordenador, el micro del CRM.
  useEffect(() => {
    if (esMovilApple()) usarTeclado(); else empezar()
    return () => { sesion.current++; if (soltar.current) soltar.current(); else parar.current?.() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function procesar(dado?: string) {
    parar.current?.(); setOyendo(false)
    const t = dado ?? (grabacion.current ? await grabacion.current : textoRef.current)
    if (!t.trim() || pensando) return
    setPensando(true); setError(null)
    try {
      const r = await interpretar(t, clientes, proyectos)
      const nuevos: Cliente[] = []
      for (const c of r.clientes_nuevos) {
        // Su email: el que haya dictado para él o el de la reunión que se le agenda
        const email = c.email ?? r.reuniones?.find((x) => x.email && x.cliente_nuevo?.toLowerCase() === c.nombre.toLowerCase())?.email ?? null
        nuevos.push(await db.crearCliente({ ...c, email }))
      }
      const idNuevo = (n: string | null) => (n ? nuevos.find((c) => c.nombre.toLowerCase() === n.toLowerCase())?.id ?? null : null)
      const tareas: Tarea[] = []
      for (const x of r.tareas) {
        const proyecto_id = x.proyecto_id ?? contexto?.proyecto_id ?? null
        const cliente_id = x.cliente_id ?? idNuevo(x.cliente_nuevo) ?? contexto?.cliente_id ?? proyectos.find((p) => p.id === proyecto_id)?.cliente_id ?? null
        tareas.push(await db.crearTarea({ titulo: x.titulo, descripcion: x.detalle, prioridad: x.prioridad, cliente_id, proyecto_id, fecha: x.fecha }))
      }
      const reuniones: BorradorReunion[] = (r.reuniones ?? []).map((x) => {
        const proyecto_id = x.proyecto_id ?? contexto?.proyecto_id ?? null
        const cliente_id = x.cliente_id ?? idNuevo(x.cliente_nuevo) ?? contexto?.cliente_id ?? proyectos.find((p) => p.id === proyecto_id)?.cliente_id ?? null
        return { titulo: x.titulo, descripcion: x.detalle, cliente_id, proyecto_id, fecha: x.fecha, hora: x.hora ?? '10:00', duracion: x.duracion, meet: x.meet, email: x.email ?? undefined }
      })
      await recargar()
      setHecho({ tareas, clientes: nuevos, reuniones, resumen: r.resumen, sinClaude: r.sinClaude })
      if (reuniones.length === 1 && !tareas.length) setRevisar(0) // una reunión sola: directo a confirmar
    } catch (e) { setError((e as Error).message) } finally { setPensando(false) }
  }

  async function deshacer() {
    if (!hecho) return
    for (const t of hecho.tareas) await db.borrarTarea(t.id)
    for (const c of hecho.clientes) await db.borrarCliente(c.id)
    await recargar(); setHecho(null)
  }

  if (hecho && revisar !== null) {
    const i = revisar
    return <ReunionDetalle reunion={hecho.reuniones[i]} onClose={() => setRevisar(null)}
      onGuardada={() => setHecho({ ...hecho, reuniones: hecho.reuniones.map((x, j) => (j === i ? { ...x, enviada: true } : x)) })} />
  }
  if (editar) return <TareaDetalle tarea={editar} onClose={() => { setEditar(null); onClose() }} />

  return (
    <Modal titulo={hecho ? 'Hecho' : 'Dictar'} onClose={onClose}>
      {hecho ? (
        <div className="space-y-4">
          <p className="flex items-center gap-2 text-sm font-medium"><Check size={18} className="rounded-full bg-lima p-0.5" /> {hecho.resumen}</p>
          {hecho.sinClaude && <p className="rounded-lg bg-paper p-3 text-xs text-muted">Sin Claude (falta la clave en local): se ha guardado tal cual. Mira cómo activarlo en el README.</p>}
          {hecho.clientes.map((c) => (
            <p key={c.id} className="flex items-center gap-2 rounded-lg border border-line p-3 text-sm"><UserPlus size={16} /> Cliente nuevo: <b>{c.nombre}</b> {c.tipo && <span className="text-muted">· {c.tipo}</span>}</p>
          ))}
          {hecho.reuniones.map((m, i) => {
            const c = cliente(m.cliente_id); const p = proyecto(m.proyecto_id)
            return (
              <div key={i} className={`rounded-xl border p-3 ${m.enviada ? 'border-line' : 'border-ink'}`}>
                <p className="flex items-center gap-2 font-medium"><CalendarClock size={16} /> {m.titulo}</p>
                <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted">
                  <span>📅 {corta(m.fecha)} · {m.hora} · {m.duracion} min</span>{c && <span>👤 {c.nombre}</span>}{p && <span>📁 {p.nombre}</span>}{m.meet && <span>🎥 Meet</span>}
                </p>
                {m.enviada ? <p className="mt-2 flex items-center gap-1 text-sm"><Check size={14} /> Agendada en Google Calendar</p>
                  : <Boton className="mt-2 w-full" onClick={() => setRevisar(i)}>Revisar y agendar</Boton>}
              </div>
            )
          })}
          <ul className="space-y-2">
            {hecho.tareas.map((t) => {
              const c = cliente(t.cliente_id); const p = proyecto(t.proyecto_id)
              return (
                <li key={t.id} onClick={() => setEditar(t)} className="cursor-pointer rounded-xl border border-line p-3 hover:border-ink">
                  <p className="flex items-center gap-2 font-medium"><Punto p={t.prioridad} /> {t.titulo}</p>
                  {t.descripcion && <p className="mt-1 whitespace-pre-line text-sm text-muted">{t.descripcion}</p>}
                  <p className="mt-2 flex flex-wrap gap-x-3 text-xs text-muted">
                    <span>Prioridad {NOMBRE_PRIORIDAD[t.prioridad].toLowerCase()}</span>
                    {c && <span>👤 {c.nombre}</span>}{p && <span>📁 {p.nombre}</span>}{t.fecha && <span>📅 {corta(t.fecha)}</span>}
                  </p>
                </li>
              )
            })}
          </ul>
          {hecho.tareas.length > 0 && <p className="text-xs text-muted">Toca una tarea para cambiar algo.</p>}
          <div className="flex gap-2 border-t border-line pt-4">
            <Boton variante="peligro" onClick={deshacer}><Undo2 size={16} /> Deshacer</Boton>
            <Boton variante="suave" className="ml-auto" onClick={empezar}><Mic size={16} /> Dictar otra</Boton>
            <Boton onClick={onClose}>Cerrar</Boton>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <button onClick={oyendo ? () => { parar.current?.(); setOyendo(false) } : seguir} disabled={pensando || transcribiendo}
              className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full ${oyendo ? 'animate-pulse bg-rojo text-white' : 'bg-lima text-ink'}`}>
              {oyendo ? <Square size={20} /> : <Mic size={24} />}
            </button>
            <p className="text-sm text-muted">
              {teclado && !oyendo && !pensando && !texto ? <span className="flex items-center gap-1.5"><Keyboard size={16} className="shrink-0" /> Pulsa el micrófono 🎤 del teclado y habla. Luego «Crear».</span> : pensando ? 'Claude está organizándolo…' : transcribiendo ? <span className="flex items-center gap-1.5"><Loader2 size={16} className="shrink-0 animate-spin" /> Pasando tu voz a texto…</span>
                : oyendo ? (conOpenAI ? 'Te escucho. Al terminar, pulsa el botón rojo (o «Crear») y aparecerá el texto.' : 'Te escucho. Pulsa el botón rojo para parar.') : texto ? 'Revisa o corrige el texto y pulsa «Crear». El micro añade más.' : 'Pulsa para hablar, o escríbelo abajo.'}
            </p>
          </div>
          <textarea ref={area} rows={4} className={entrada} value={texto} onChange={(e) => { setTexto(e.target.value); textoRef.current = e.target.value }}
            placeholder="Ej.: Oye, agéndame una llamada con Diego Fernández para arreglar lo de su Airwallex, a ser posible esta semana…"
            onKeyDown={(e) => e.key === 'Enter' && (e.metaKey || e.ctrlKey) && procesar()} />
          {error && <p className="text-sm text-rojo">{error}</p>}
          <Boton className="w-full" onClick={() => procesar()} disabled={(!texto.trim() && !(oyendo && conOpenAI)) || pensando || transcribiendo}>
            {pensando ? <><Loader2 size={16} className="animate-spin" /> Pensando…</> : 'Crear'}
          </Boton>
        </div>
      )}
    </Modal>
  )
}

function esMovilApple() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}
