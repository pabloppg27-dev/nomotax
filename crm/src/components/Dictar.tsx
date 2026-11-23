import { useEffect, useRef, useState } from 'react'
import { Check, Keyboard, Loader2, Mic, Square, Undo2, UserPlus } from 'lucide-react'
import * as db from '../lib/datos'
import { escuchar, hayVoz, interpretar } from '../lib/dictado'
import { corta } from '../lib/fechas'
import { useStore } from '../lib/store'
import type { Cliente, Tarea } from '../lib/tipos'
import TareaDetalle from './TareaDetalle'
import { Boton, entrada, Modal, NOMBRE_PRIORIDAD, Punto } from './ui'

/** Dictas → Claude piensa, redacta y asocia → se guarda solo. Puedes editar o deshacer. */
export default function Dictar({ onClose, contexto }: { onClose: () => void; contexto?: Partial<Tarea> }) {
  const { clientes, proyectos, recargar, cliente, proyecto } = useStore()
  const [texto, setTexto] = useState('')
  const [oyendo, setOyendo] = useState(false)
  const [pensando, setPensando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hecho, setHecho] = useState<{ tareas: Tarea[]; clientes: Cliente[]; resumen: string; sinClaude?: boolean } | null>(null)
  const [editar, setEditar] = useState<Tarea | null>(null)
  const parar = useRef<(() => void) | null>(null)
  const textoRef = useRef('')
  const area = useRef<HTMLTextAreaElement>(null)
  const [teclado, setTeclado] = useState(false) // dictar con el micro del teclado (iPhone)

  /** Sin micro del navegador (o falla): se dicta con el micro del teclado */
  function usarTeclado() { setOyendo(false); setTeclado(true); area.current?.focus() }
  const errorVoz = (m: string) => { if (/not-allowed|service-not-allowed|audio-capture|permiso/.test(m)) usarTeclado(); else { setError(m); setOyendo(false) } }

  function empezar() {
    setError(null); setHecho(null); setTexto(''); textoRef.current = ''
    if (!hayVoz()) return usarTeclado()
    parar.current = escuchar((t) => { setTexto(t); textoRef.current = t }, () => setOyendo(false), errorVoz)
    setOyendo(true)
  }
  /** Vuelve a escuchar y añade lo nuevo detrás de lo que ya hay (sin borrar lo editado) */
  function seguir() {
    setError(null)
    if (!hayVoz()) return usarTeclado()
    const previo = textoRef.current.trim()
    parar.current = escuchar((t) => { const v = previo ? `${previo} ${t}` : t; setTexto(v); textoRef.current = v },
      () => setOyendo(false), errorVoz)
    setOyendo(true)
  }
  // En iPhone/iPad se abre el teclado (su micro es lo más fiable); en el ordenador, el micro del CRM.
  useEffect(() => { if (esMovilApple()) usarTeclado(); else empezar(); return () => parar.current?.() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function procesar(t = textoRef.current) {
    parar.current?.(); setOyendo(false)
    if (!t.trim() || pensando) return
    setPensando(true); setError(null)
    try {
      const r = await interpretar(t, clientes, proyectos)
      const nuevos: Cliente[] = []
      for (const c of r.clientes_nuevos) nuevos.push(await db.crearCliente(c))
      const idNuevo = (n: string | null) => (n ? nuevos.find((c) => c.nombre.toLowerCase() === n.toLowerCase())?.id ?? null : null)
      const tareas: Tarea[] = []
      for (const x of r.tareas) {
        const proyecto_id = x.proyecto_id ?? contexto?.proyecto_id ?? null
        const cliente_id = x.cliente_id ?? idNuevo(x.cliente_nuevo) ?? contexto?.cliente_id ?? proyectos.find((p) => p.id === proyecto_id)?.cliente_id ?? null
        tareas.push(await db.crearTarea({ titulo: x.titulo, descripcion: x.detalle, prioridad: x.prioridad, cliente_id, proyecto_id, fecha: x.fecha }))
      }
      await recargar()
      setHecho({ tareas, clientes: nuevos, resumen: r.resumen, sinClaude: r.sinClaude })
    } catch (e) { setError((e as Error).message) } finally { setPensando(false) }
  }

  async function deshacer() {
    if (!hecho) return
    for (const t of hecho.tareas) await db.borrarTarea(t.id)
    for (const c of hecho.clientes) await db.borrarCliente(c.id)
    await recargar(); setHecho(null)
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
          <p className="text-xs text-muted">Toca una tarea para cambiar algo.</p>
          <div className="flex gap-2 border-t border-line pt-4">
            <Boton variante="peligro" onClick={deshacer}><Undo2 size={16} /> Deshacer</Boton>
            <Boton variante="suave" className="ml-auto" onClick={empezar}><Mic size={16} /> Dictar otra</Boton>
            <Boton onClick={onClose}>Cerrar</Boton>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <button onClick={oyendo ? () => { parar.current?.(); setOyendo(false) } : seguir} disabled={pensando}
              className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full ${oyendo ? 'animate-pulse bg-rojo text-white' : 'bg-lima text-ink'}`}>
              {oyendo ? <Square size={20} /> : <Mic size={24} />}
            </button>
            <p className="text-sm text-muted">
              {teclado && !oyendo && !pensando && !texto ? <span className="flex items-center gap-1.5"><Keyboard size={16} className="shrink-0" /> Pulsa el micrófono 🎤 del teclado y habla. Luego «Crear».</span> : pensando ? 'Claude está organizándolo…' : oyendo ? 'Te escucho. Pulsa el botón rojo para parar.' : texto ? 'Revisa o corrige el texto y pulsa «Crear». El micro añade más.' : 'Pulsa para hablar, o escríbelo abajo.'}
            </p>
          </div>
          <textarea ref={area} rows={4} className={entrada} value={texto} onChange={(e) => { setTexto(e.target.value); textoRef.current = e.target.value }}
            placeholder="Ej.: Oye, agéndame una llamada con Diego Fernández para arreglar lo de su Airwallex, a ser posible esta semana…"
            onKeyDown={(e) => e.key === 'Enter' && (e.metaKey || e.ctrlKey) && procesar()} />
          {error && <p className="text-sm text-rojo">{error}</p>}
          <Boton className="w-full" onClick={() => procesar()} disabled={!texto.trim() || pensando}>
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
