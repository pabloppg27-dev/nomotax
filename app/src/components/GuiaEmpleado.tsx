/**
 * Guías rápidas: la del empleado y la de quien lleva la empresa (titular y administración).
 * Sale sola la primera vez que entra (y se puede repetir desde «Guía rápida»).
 * Va por las pantallas de verdad y resalta lo que hay que tocar. Lo que se pulsa durante la guía
 * (fichar, pedir más retención) es una simulación: Fichar.tsx y SolicitudIrpf.tsx no guardan nada
 * mientras `simulando` está activo y avisan con avisarGuia() para que la guía avance.
 * Vista: localStorage + user_metadata.guia_empleado / guia_gestion (así no vuelve a salir en otro dispositivo).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Hand } from 'lucide-react'
import { useAuth, verComoDev } from '../lib/auth'
import type { Permiso } from '../lib/types'
import { supabase } from '../lib/supabase'
import { enDemo } from '../lib/demoFichaje'
import { EVENTO_ABRIR_GUIA, GuiaCtx, escucharGuia, tipoGuia, type EventoGuia, type TipoGuia } from '../lib/guia'
import { cx } from './ui'
import { useConfig } from './Configuracion'

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
  /** La persona tiene que pulsar lo resaltado (un apartado del menú); la guía sigue al llegar a esa pantalla */
  esperarRuta?: string
  /** Hay una ventana abierta: sin fondo oscuro, solo un aviso arriba */
  flotante?: boolean
  /** Abre la ventana de Configuración mientras dura el paso */
  abrirConfig?: boolean
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
      texto: 'Ya sabes lo básico. Si quieres repasarlo, tienes la «Guía rápida» en Configuración.',
      boton: 'Empezar a usar',
    },
  )
  return p
}

/** Comercial: presupuestos, clientes y facturas en borrador */
function crearPasosComercial(nombre: string): Paso[] {
  return [
    {
      id: 'hola',
      centro: true,
      titulo: `Hola${nombre ? `, ${nombre}` : ''} 👋`,
      texto: 'Te enseño en 30 segundos dónde preparar tus presupuestos y facturas.',
      boton: 'Empezar',
    },
    {
      id: 'presupuestos',
      ruta: '/presupuestos',
      objetivo: ['nav-presupuestos', 'nav-mas'],
      titulo: 'Presupuestos',
      texto: 'Haz el presupuesto y envíaselo al cliente por email desde aquí, con el logo de la empresa.',
    },
    {
      id: 'clientes',
      ruta: '/clientes',
      objetivo: ['nav-clientes', 'nav-mas'],
      titulo: 'Clientes',
      texto: 'Guarda aquí los datos de cada cliente y no tendrás que escribirlos cada vez.',
    },
    {
      id: 'facturas',
      ruta: '/facturas',
      objetivo: ['nav-facturas', 'nav-mas'],
      titulo: 'Facturas',
      texto: 'Cuando el cliente acepte, prepara la factura en borrador. La revisa y la emite la empresa.',
    },
    {
      id: 'fin',
      ruta: '/',
      centro: true,
      titulo: '¡Listo! 🎉',
      texto: 'Ya sabes lo básico. Si quieres repasarlo, tienes la «Guía rápida» en Configuración.',
      boton: 'Empezar a usar',
    },
  ]
}

/** Quien lleva la empresa (titular o administración): recorre cada apartado (se va abriendo su página) y marca dónde está en el menú. Solo lo que puede usar. */
function crearPasosGestion(nombre: string, puede: (p: Permiso) => boolean): Paso[] {
  const p: Paso[] = [
    {
      id: 'hola',
      centro: true,
      titulo: `Hola${nombre ? `, ${nombre}` : ''} 👋`,
      texto: 'Te enseño en un minuto dónde está todo para llevar la empresa.',
      boton: 'Empezar',
    },
    {
      id: 'resumen',
      ruta: '/',
      objetivo: ['nav-inicio'],
      titulo: 'Resumen',
      texto: 'Cómo va el negocio: ventas, gastos, resultado y lo que toca pagar de impuestos.',
    },
  ]
  if (puede('gastos'))
    p.push({
      id: 'gastos',
      ruta: '/gastos',
      objetivo: ['nav-gastos', 'nav-mas'],
      titulo: 'Gastos',
      texto: 'Sube una foto o el PDF de tus facturas de proveedores y tickets: lo leemos solo y tú solo revisas. Aquí también llegan los tickets de los empleados para aprobar.',
    })
  if (puede('ventas'))
    p.push({
      id: 'facturas',
      ruta: '/facturas',
      objetivo: ['nav-facturas', 'nav-mas'],
      titulo: 'Facturas, presupuestos y clientes',
      texto: 'Crea tus facturas y envíalas por email. Si facturas con otro programa, súbelas aquí igualmente.',
    })
  if (puede('contabilidad')) {
    p.push({
      id: 'contabilidad',
      ruta: '/contabilidad',
      objetivo: ['nav-contabilidad', 'nav-mas'],
      titulo: 'Contabilidad',
      texto: 'Se hace sola con lo que subes: libros, pérdidas y ganancias y balance. No tienes que tocar nada.',
    })
    if (puede('bancos'))
      p.push({
        id: 'bancos',
        ruta: '/contabilidad',
        objetivo: ['subir-extracto', 'conta-bancos'],
        titulo: 'Solo te pedimos una cosa',
        texto: (
          <>
            <b className="text-ink">Sube cada mes los extractos del banco</b> con este botón, para que podamos hacer la conciliación bancaria. Los verás en la pestaña «Bancos».
          </>
        ),
      })
  }
  if (puede('impuestos'))
    p.push({
      id: 'impuestos',
      ruta: '/impuestos',
      objetivo: ['nav-impuestos', 'nav-mas'],
      titulo: 'Impuestos',
      texto: 'Las declaraciones que te presentamos y las notificaciones de Hacienda.',
    })
  if (puede('laboral') || puede('nominas'))
    p.push({
      id: 'laboral',
      ruta: puede('laboral') ? '/laboral' : '/laboral/nominas',
      objetivo: ['nav-laboral', 'nav-nominas', 'nav-mas'],
      titulo: 'Laboral',
      texto: 'Trabajadores, nóminas y registro de jornada. Aquí apruebas las correcciones de fichaje de tu equipo.',
    })
  if (puede('asesor'))
    p.push({
      id: 'asesor',
      ruta: '/mi-asesor',
      objetivo: ['nav-mi-asesor'],
      titulo: 'Mi asesor',
      texto: '¿Dudas? Escríbenos o reserva una llamada desde aquí.',
    })
  // Configuración: se abre la ventana y se cuenta qué hay, según lo que pueda tocar
  const config = [
    puede('empresa') && 'tus datos, el logo y los colores de marca',
    puede('empresa') && 'enviar facturas, nóminas y presupuestos desde el correo de tu dominio',
    puede('empresa') && 'editar las plantillas de esos correos',
    puede('usuarios') && 'dar acceso a tu socio (solo ve las cifras), administración o empleados',
  ].filter((x): x is string => Boolean(x))
  if (config.length)
    p.push({
      id: 'config',
      abrirConfig: true,
      objetivo: ['config-secciones'],
      titulo: 'Configuración',
      texto: (
        <>
          Aquí lo personalizas todo:
          <span className="mt-1.5 block space-y-1">
            {config.map((c) => (
              <span key={c} className="flex gap-2">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-lima-dark" />
                <span>{c.charAt(0).toUpperCase() + c.slice(1)}.</span>
              </span>
            ))}
          </span>
        </>
      ),
    })
  p.push({
    id: 'fin',
    ruta: '/',
    centro: true,
    titulo: '¡Listo! 🎉',
    texto: 'Ya sabes dónde está todo. Si quieres repasarlo, tienes la «Guía rápida» en Configuración.',
    boton: 'Empezar a usar',
  })
  return p
}

const clave = (tipo: TipoGuia, id: string) => `nt-guia-${tipo}:${id}`

function yaVista(tipo: TipoGuia, userId: string, meta: Record<string, unknown> | undefined): boolean {
  try {
    if (localStorage.getItem(clave(tipo, userId))) return true
  } catch {
    /* almacenamiento no disponible */
  }
  return Boolean(meta?.[`guia_${tipo}`])
}

export function GuiaProvider({ children }: { children: ReactNode }) {
  const { session, me, rol, miembro, isAdvisor, puede } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  // El asesor no: entra en las cuentas de los clientes como «asesor» y en la suya como titular
  const tipo = tipoGuia(rol, isAdvisor, Boolean(verComoDev()))
  const disponible = tipo !== null
  const [activa, setActiva] = useState(false)
  const [i, setI] = useState(0)

  const nombre = (me?.nombre ?? '').trim().split(/\s+/)[0] ?? ''
  const conFichaje = Boolean((miembro?.fichaje && miembro?.trabajador_id) || enDemo())
  const conFicha = Boolean(miembro?.trabajador_id)
  const pasos = useMemo(
    () =>
      tipo === 'gestion' ? crearPasosGestion(nombre, puede) : tipo === 'comercial' ? crearPasosComercial(nombre) : crearPasos(nombre, conFichaje, conFicha),
    // puede() cambia en cada render; los permisos ya van en miembro y rol
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tipo, nombre, conFichaje, conFicha, rol, miembro],
  )
  const paso = activa ? pasos[Math.min(i, pasos.length - 1)] : null

  // Primera vez que entra con ese perfil: arranca sola
  const comprobada = useRef('')
  useEffect(() => {
    if (!tipo || !me) return
    const k = `${me.id}:${tipo}`
    if (comprobada.current === k) return
    comprobada.current = k
    if (!yaVista(tipo, me.id, session?.user.user_metadata)) {
      setI(0)
      setActiva(true)
    }
  }, [tipo, me, session])

  const terminar = useCallback(() => {
    setActiva(false)
    if (!me || !tipo) return
    try {
      localStorage.setItem(clave(tipo, me.id), '1')
    } catch {
      /* almacenamiento no disponible */
    }
    // En la cuenta, para que no salga otra vez en el móvil. No en la vista previa de local (es la cuenta del titular).
    const campo = `guia_${tipo}`
    if (!verComoDev() && !session?.user.user_metadata?.[campo])
      supabase.auth.updateUser({ data: { [campo]: new Date().toISOString() } }).then(
        () => {},
        () => {},
      )
  }, [me, session, tipo])

  const siguiente = useCallback(() => {
    if (i + 1 >= pasos.length) terminar()
    else setI(i + 1)
  }, [i, pasos.length, terminar])

  // Cada paso, en su pantalla
  useEffect(() => {
    if (paso?.ruta && pathname !== paso.ruta) navigate(paso.ruta)
  }, [paso, pathname, navigate])

  // Configuración: la guía la abre en su paso y la cierra al pasar al siguiente (o al saltar la guía)
  const { abrir: abrirVentana, cerrar: cerrarVentana } = useConfig()
  const abiertaPorGuia = useRef(false)
  useEffect(() => {
    if (paso?.abrirConfig) {
      if (!abiertaPorGuia.current) abrirVentana()
      abiertaPorGuia.current = true
    } else if (abiertaPorGuia.current) {
      abiertaPorGuia.current = false
      cerrarVentana()
    }
  }, [paso, abrirVentana, cerrarVentana])

  // Pulsó el apartado del menú que tocaba
  useEffect(() => {
    if (paso?.esperarRuta && pathname.startsWith(paso.esperarRuta)) setI((n) => n + 1)
  }, [paso, pathname])

  // Lo que hace la persona (fichar, abrir y enviar la solicitud) hace avanzar la guía
  useEffect(() => {
    if (!activa) return
    return escucharGuia((e) => setI((n) => (pasos[n]?.esperar === e ? n + 1 : n)))
  }, [activa, pasos])

  const abrir = useCallback(() => {
    setI(0)
    setActiva(true)
  }, [])
  useEffect(() => {
    if (!tipo) return
    window.addEventListener(EVENTO_ABRIR_GUIA, abrir)
    return () => window.removeEventListener(EVENTO_ABRIR_GUIA, abrir)
  }, [tipo, abrir])

  const valor = useMemo(() => ({ simulando: activa && tipo === 'empleado', abrir, disponible }), [activa, tipo, abrir, disponible])

  return (
    <GuiaCtx.Provider value={valor}>
      {children}
      {paso && <Capa key={paso.id} paso={paso} n={i} total={pasos.length} onSiguiente={siguiente} onSaltar={terminar} />}
    </GuiaCtx.Provider>
  )
}

/** El primero de esos data-guia que esté a la vista */
function encontrar(ids: string[]): { el: HTMLElement; id: string } | null {
  for (const id of ids)
    for (const el of document.querySelectorAll<HTMLElement>(`[data-guia="${id}"]`)) {
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) return { el, id }
    }
  return null
}

type Hueco = { x: number; y: number; w: number; h: number }
const MARGEN = 8

/** Sigue la posición de lo resaltado (la pantalla carga, se hace scroll, gira el móvil…) */
function useHueco(ids: string[] | undefined) {
  const [hueco, setHueco] = useState<Hueco | null>(null)
  const [perdido, setPerdido] = useState(false)
  const [visto, setVisto] = useState('')
  useEffect(() => {
    if (!ids) return
    let raf = 0
    let ultimo = ''
    let colocado = false
    const t0 = performance.now()
    const mirar = () => {
      const hallado = encontrar(ids)
      if (hallado) {
        const { el, id } = hallado
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
          setVisto(id)
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
  return { hueco, perdido, enMas: visto === 'nav-mas' }
}

function Capa({ paso, n, total, onSiguiente, onSaltar }: { paso: Paso; n: number; total: number; onSiguiente: () => void; onSaltar: () => void }) {
  const { hueco, perdido, enMas } = useHueco(paso.objetivo)
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
  // En el móvil, lo que no cabe abajo está en «Más»: ahí no se puede pulsar para seguir
  const esperando = Boolean(paso.esperar || paso.esperarRuta) && !perdido && !enMas
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
      enMas={enMas}
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
    if (vw >= 1024 && hueco.w < 400 && vw - (hueco.x + hueco.w) > ancho + 28) {
      // Menú lateral o secciones de Configuración (escritorio): a la derecha
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
            style={{ left: hueco.x, top: hueco.y, width: hueco.w, height: hueco.h, boxShadow: '0 0 0 9999px rgb(17 17 16 / 0.5)' }}
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
  enMas,
  boton,
  onSiguiente,
  onSaltar,
}: {
  paso: Paso
  n: number
  total: number
  esperando: boolean
  enMas: boolean
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
      <p className="mt-1 text-[15px] leading-relaxed text-muted">
        {enMas && paso.esperarRuta ? String(paso.texto).replace(' Pulsa para entrar.', '') : paso.texto}
        {enMas && <> Lo tienes en «Más».</>}
      </p>

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
