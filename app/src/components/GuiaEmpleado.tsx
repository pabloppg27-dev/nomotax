/**
 * Guía rápida del empleado: sale sola la primera vez que entra (y se puede repetir desde «Guía rápida»).
 * Va por las pantallas de verdad y resalta lo que hay que tocar. Lo que se pulsa durante la guía
 * (fichar, pedir más retención) es una simulación: Fichar.tsx y SolicitudIrpf.tsx no guardan nada
 * mientras `simulando` está activo y avisan con avisarGuia() para que la guía avance.
 * Vista: localStorage + user_metadata.guia_empleado (así no vuelve a salir en otro dispositivo).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Hand } from 'lucide-react'
import { useAuth, verComoDev } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { enDemo } from '../lib/demoFichaje'
import { GuiaCtx, escucharGuia, type EventoGuia } from '../lib/guia'
import { cx } from './ui'

interface Paso {
  id: string
  /** Pantalla en la que ocurre */
  ruta?: string
  /** data-guia de lo que se resalta: el primero que esté visible (menú lateral en escritorio, barra de abajo en el móvil…) */
  objetivo?: string[]
  titulo: string
  texto: ReactNode
  /** La persona tiene que pulsar lo resaltado; la guía sigue cuando llega este aviso */
  esperar?: EventoGuia
  /** Hay una ventana abierta: sin fondo oscuro, solo un aviso arriba */
  flotante?: boolean
  /** Tarjeta en el centro, sin resaltar nada */
  centro?: boolean
  boton?: string
}

function crearPasos(nombre: string, fichaje: boolean, ficha: boolean): Paso[] {
  const p: Paso[] = [
    {
      id: 'hola',
      centro: true,
      titulo: `Hola${nombre ? `, ${nombre}` : ''} 👋`,
      texto: 'Te enseño la app en 30 segundos. Lo que pulses ahora es de prueba: no se guarda nada.',
      boton: 'Empezar',
    },
  ]
  if (fichaje)
    p.push(
      {
        id: 'fichar',
        ruta: '/fichar',
        objetivo: ['fichar-boton'],
        titulo: 'Ficha cada día',
        texto: 'Al empezar a trabajar, pulsa «Fichar entrada». Pruébalo ahora.',
        esperar: 'fichado',
      },
      {
        id: 'fichado',
        ruta: '/fichar',
        objetivo: ['fichar-estado'],
        titulo: '¡Así de fácil!',
        texto: 'Al acabar, pulsa «Fichar salida». Si un día se te olvida, toca «Se me olvidó fichar».',
      },
    )
  p.push({
    id: 'nominas',
    ruta: '/mi-espacio/nominas',
    objetivo: ['nav-nominas', 'mis-nominas'],
    titulo: 'Tus nóminas',
    texto: 'Cada mes la tienes aquí: lo que cobras, el IRPF y el PDF.',
  })
  if (ficha)
    p.push(
      {
        id: 'ficha',
        ruta: '/mi-espacio/ficha',
        objetivo: ['nav-ficha', 'ficha-contrato'],
        titulo: 'Tu ficha',
        texto: 'Tu contrato, vacaciones, salario y el % de IRPF que se te retiene.',
      },
      {
        id: 'irpf',
        ruta: '/mi-espacio/ficha',
        objetivo: ['irpf-boton'],
        titulo: '¿Tienes otros ingresos?',
        texto: 'Otro trabajo, un alquiler, facturas como autónomo… Pide aquí más retención y no te llevarás un susto en la renta. Pruébalo.',
        esperar: 'irpf-abierto',
      },
      {
        id: 'irpf-enviar',
        ruta: '/mi-espacio/ficha',
        flotante: true,
        titulo: 'Elige el % y pulsa «Enviar al gestor»',
        texto: 'Es una prueba: no le llega a nadie.',
        esperar: 'irpf-enviada',
      },
      {
        id: 'irpf-hecho',
        ruta: '/mi-espacio/ficha',
        objetivo: ['irpf-tarjeta'],
        titulo: 'Solicitud enviada',
        texto: 'Tu gestor la aplica en las próximas nóminas. Aquí verás si está pendiente o aplicada.',
      },
    )
  p.push(
    {
      id: 'tickets',
      ruta: '/mi-espacio/tickets',
      objetivo: ['nav-tickets', 'subir-ticket'],
      titulo: 'Tickets de gasto',
      texto: '¿Has pagado algo para la empresa? Haz una foto al ticket aquí y administración lo revisa.',
    },
    {
      id: 'fin',
      centro: true,
      titulo: '¡Listo! 🎉',
      texto: 'Ya sabes lo básico. Si quieres repasarlo, tienes la «Guía rápida» en el menú.',
      boton: 'Empezar a usar',
    },
  )
  return p
}

const clave = (id: string) => `nt-guia-empleado:${id}`

function yaVista(userId: string, meta: Record<string, unknown> | undefined): boolean {
  try {
    if (localStorage.getItem(clave(userId))) return true
  } catch {
    /* almacenamiento no disponible */
  }
  return Boolean(meta?.guia_empleado)
}

export function GuiaProvider({ children }: { children: ReactNode }) {
  const { session, me, rol, miembro } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const disponible = rol === 'empleado'
  const [activa, setActiva] = useState(false)
  const [i, setI] = useState(0)

  const nombre = (me?.nombre ?? '').trim().split(/\s+/)[0] ?? ''
  const conFichaje = Boolean((miembro?.fichaje && miembro?.trabajador_id) || enDemo())
  const conFicha = Boolean(miembro?.trabajador_id)
  const pasos = useMemo(() => crearPasos(nombre, conFichaje, conFicha), [nombre, conFichaje, conFicha])
  const paso = activa ? pasos[Math.min(i, pasos.length - 1)] : null

  // Primera vez que entra como empleado: arranca sola
  const comprobada = useRef(false)
  useEffect(() => {
    if (!disponible || !me || comprobada.current) return
    comprobada.current = true
    if (!yaVista(me.id, session?.user.user_metadata)) {
      setI(0)
      setActiva(true)
    }
  }, [disponible, me, session])

  const terminar = useCallback(() => {
    setActiva(false)
    if (!me) return
    try {
      localStorage.setItem(clave(me.id), '1')
    } catch {
      /* almacenamiento no disponible */
    }
    // En la cuenta, para que no salga otra vez en el móvil. No en la vista previa de local (es la cuenta del titular).
    if (!verComoDev() && !session?.user.user_metadata?.guia_empleado)
      supabase.auth.updateUser({ data: { guia_empleado: new Date().toISOString() } }).then(
        () => {},
        () => {},
      )
  }, [me, session])

  const siguiente = useCallback(() => {
    if (i + 1 >= pasos.length) terminar()
    else setI(i + 1)
  }, [i, pasos.length, terminar])

  // Cada paso, en su pantalla
  useEffect(() => {
    if (paso?.ruta && pathname !== paso.ruta) navigate(paso.ruta)
  }, [paso, pathname, navigate])

  // Lo que hace la persona (fichar, abrir y enviar la solicitud) hace avanzar la guía
  useEffect(() => {
    if (!activa) return
    return escucharGuia((e) => setI((n) => (pasos[n]?.esperar === e ? n + 1 : n)))
  }, [activa, pasos])

  const abrir = useCallback(() => {
    setI(0)
    setActiva(true)
  }, [])

  const valor = useMemo(() => ({ simulando: activa, abrir, disponible }), [activa, abrir, disponible])

  return (
    <GuiaCtx.Provider value={valor}>
      {children}
      {paso && <Capa key={paso.id} paso={paso} n={i} total={pasos.length} onSiguiente={siguiente} onSaltar={terminar} />}
    </GuiaCtx.Provider>
  )
}

/** El primero de esos data-guia que esté a la vista */
function encontrar(ids: string[]): HTMLElement | null {
  for (const id of ids)
    for (const el of document.querySelectorAll<HTMLElement>(`[data-guia="${id}"]`)) {
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) return el
    }
  return null
}

type Hueco = { x: number; y: number; w: number; h: number }
const MARGEN = 8

/** Sigue la posición de lo resaltado (la pantalla carga, se hace scroll, gira el móvil…) */
function useHueco(ids: string[] | undefined) {
  const [hueco, setHueco] = useState<Hueco | null>(null)
  const [perdido, setPerdido] = useState(false)
  useEffect(() => {
    if (!ids) return
    let raf = 0
    let ultimo = ''
    let colocado = false
    const t0 = performance.now()
    const mirar = () => {
      const el = encontrar(ids)
      if (el) {
        if (!colocado) {
          colocado = true
          const r = el.getBoundingClientRect()
          if (r.top < 64 || r.bottom > window.innerHeight - 90) el.scrollIntoView({ block: 'center', behavior: 'smooth' })
        }
        const r = el.getBoundingClientRect()
        const k = `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)}`
        if (k !== ultimo) {
          ultimo = k
          setHueco({ x: r.left - MARGEN, y: r.top - MARGEN, w: r.width + MARGEN * 2, h: r.height + MARGEN * 2 })
          setPerdido(false)
        }
      } else if (ultimo !== 'x' && performance.now() - t0 > 1500) {
        // No aparece (p. ej. aún no tiene ficha): la guía sigue con la tarjeta en el centro
        ultimo = 'x'
        setHueco(null)
        setPerdido(true)
      }
      raf = requestAnimationFrame(mirar)
    }
    raf = requestAnimationFrame(mirar)
    return () => cancelAnimationFrame(raf)
  }, [ids])
  return { hueco, perdido }
}

function Capa({ paso, n, total, onSiguiente, onSaltar }: { paso: Paso; n: number; total: number; onSiguiente: () => void; onSaltar: () => void }) {
  const { hueco, perdido } = useHueco(paso.objetivo)
  const boton = useRef<HTMLButtonElement>(null)
  const [, setTam] = useState(0)

  useEffect(() => {
    const r = () => setTam((x) => x + 1)
    window.addEventListener('resize', r)
    return () => window.removeEventListener('resize', r)
  }, [])

  useEffect(() => {
    if (paso.flotante) return
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onSaltar()
    document.addEventListener('keydown', k)
    return () => document.removeEventListener('keydown', k)
  }, [paso.flotante, onSaltar])

  const enCentro = paso.centro || perdido
  const esperando = Boolean(paso.esperar) && !perdido
  useEffect(() => {
    if (!esperando) boton.current?.focus({ preventScroll: true })
  }, [esperando, hueco === null])

  // Aún buscando lo que hay que resaltar: no tapar nada
  if (!enCentro && !paso.flotante && !hueco) return null

  const tarjeta = (
    <Tarjeta
      paso={paso}
      n={n}
      total={total}
      esperando={esperando}
      boton={boton}
      onSiguiente={onSiguiente}
      onSaltar={onSaltar}
    />
  )

  // Con la ventana de pedir retención abierta: solo un aviso arriba, por encima de ella
  if (paso.flotante)
    return (
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[70] flex justify-center px-3">
        <div className="pointer-events-auto w-full max-w-sm">{tarjeta}</div>
      </div>
    )

  const vw = window.innerWidth
  const vh = window.innerHeight
  const ancho = Math.min(340, vw - 24)
  let pos: CSSProperties
  if (enCentro || !hueco) {
    pos = { left: (vw - ancho) / 2, top: '50%', transform: 'translateY(-50%)' }
  } else {
    const izq = Math.min(Math.max(12, hueco.x + hueco.w / 2 - ancho / 2), vw - ancho - 12)
    const arriba = hueco.y
    const abajo = vh - (hueco.y + hueco.h)
    if (vw >= 1024 && hueco.x + hueco.w < 300) {
      // Menú lateral (escritorio): a la derecha del apartado
      pos = { left: hueco.x + hueco.w + 14, top: Math.min(Math.max(12, hueco.y + hueco.h / 2 - 70), vh - 240) }
    } else if (abajo >= 200 && abajo >= arriba) pos = { left: izq, top: hueco.y + hueco.h + 12 }
    else if (arriba >= 200) pos = { left: izq, bottom: vh - hueco.y + 12 }
    else pos = { left: izq, bottom: 84 } // lo resaltado ocupa casi toda la pantalla
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-[55]" role="dialog" aria-modal="true" aria-label={paso.titulo}>
      {hueco && !enCentro ? (
        <>
          {/* Fuera del hueco no se puede tocar nada */}
          <div className="pointer-events-auto absolute inset-x-0 top-0" style={{ height: Math.max(0, hueco.y) }} />
          <div className="pointer-events-auto absolute inset-x-0 bottom-0" style={{ top: hueco.y + hueco.h }} />
          <div className="pointer-events-auto absolute left-0" style={{ top: hueco.y, height: hueco.h, width: Math.max(0, hueco.x) }} />
          <div className="pointer-events-auto absolute right-0" style={{ top: hueco.y, height: hueco.h, left: hueco.x + hueco.w }} />
          {/* Si solo es para mirar, tampoco dentro */}
          {!esperando && <div className="pointer-events-auto absolute" style={{ left: hueco.x, top: hueco.y, width: hueco.w, height: hueco.h }} />}
          <div
            className="absolute rounded-2xl ring-2 ring-lima transition-all duration-300 ease-out"
            style={{ left: hueco.x, top: hueco.y, width: hueco.w, height: hueco.h, boxShadow: '0 0 0 9999px rgb(17 17 16 / 0.62)' }}
          >
            {esperando && <div className="guia-pulso absolute inset-0 rounded-2xl" />}
          </div>
        </>
      ) : (
        <div className="pointer-events-auto absolute inset-0 bg-ink/60 backdrop-blur-[2px]" />
      )}
      <div className="pointer-events-auto absolute" style={{ ...pos, width: ancho }}>
        {tarjeta}
      </div>
    </div>
  )
}

function Tarjeta({
  paso,
  n,
  total,
  esperando,
  boton,
  onSiguiente,
  onSaltar,
}: {
  paso: Paso
  n: number
  total: number
  esperando: boolean
  boton: RefObject<HTMLButtonElement | null>
  onSiguiente: () => void
  onSaltar: () => void
}) {
  const primero = n === 0
  const ultimo = n === total - 1
  return (
    <div className="guia-entra rounded-2xl bg-white p-4 text-ink shadow-2xl ring-1 ring-ink/5 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-1" aria-label={`Paso ${n + 1} de ${total}`}>
          {Array.from({ length: total }, (_, k) => (
            <span key={k} className={cx('h-1.5 rounded-full transition-all', k === n ? 'w-5 bg-ink' : k < n ? 'w-1.5 bg-ink/40' : 'w-1.5 bg-line')} />
          ))}
        </div>
        {!primero && !ultimo && (
          <button onClick={onSaltar} className="text-xs text-muted hover:text-ink">
            Saltar guía
          </button>
        )}
      </div>
      <p className="mt-3 text-[17px] font-semibold leading-snug">{paso.titulo}</p>
      <p className="mt-1 text-[15px] leading-relaxed text-muted">{paso.texto}</p>

      {esperando ? (
        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-lima px-3 py-1.5 text-xs font-medium">
            <Hand className="size-3.5" /> {paso.flotante ? 'Tu turno' : 'Pulsa lo marcado'}
          </span>
          <button onClick={onSiguiente} className="text-xs text-muted underline hover:text-ink">
            Saltar este paso
          </button>
        </div>
      ) : (
        <div className="mt-4 flex items-center justify-end gap-2">
          {primero && (
            <button onClick={onSaltar} className="rounded-full px-4 py-2 text-sm text-muted hover:bg-ink/5 hover:text-ink">
              Ahora no
            </button>
          )}
          <button
            ref={boton}
            onClick={onSiguiente}
            className="rounded-full bg-ink px-5 py-2 text-sm font-medium text-lima outline-none hover:bg-ink-2 focus-visible:ring-2 focus-visible:ring-lima focus-visible:ring-offset-2"
          >
            {paso.boton ?? 'Siguiente'}
          </button>
        </div>
      )}
    </div>
  )
}
