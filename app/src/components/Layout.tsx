import { useEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { enDemo } from '../lib/demoFichaje'
import {
  Briefcase,
  FolderOpen,
  ClipboardList,
  FileText,
  LayoutDashboard,
  LogOut,
  Receipt,
  Users,
  ArrowLeft,
  IdCard,
  MessagesSquare,
  BookOpen,
  Landmark,
  LayoutGrid,
  X,
  PieChart,
  Wallet,
  Building2,
  Settings,
  CreditCard,
  type LucideIcon,
  Clock,
  ArrowLeftRight,
  Check,
  ChevronDown,
} from 'lucide-react'
import { useAuth, type Acceso } from '../lib/auth'
import { NOMBRE_ROL } from '../lib/permisos'
import { useConfig } from './Configuracion'
import type { Permiso, Profile, RolEnCuenta } from '../lib/types'
import { cx, notify } from './ui'
import { PlanLateral } from './Planes'
import { TARJETAS_ACTIVAS } from '../lib/config'
import { misTarjetas } from '../lib/tarjetas'

interface ItemNav {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
  /** Nombre corto para la barra de abajo del móvil */
  corto?: string
}

/** Mi espacio: lo personal de quien es trabajador (nóminas, documentos, ficha y tickets) */
const ESPACIO: ItemNav[] = [
  { to: '/mi-espacio/nominas', label: 'Mis nóminas', icon: Wallet, corto: 'Nóminas' },
  { to: '/mi-espacio/ficha', label: 'Mi ficha', icon: IdCard, corto: 'Ficha' },
  { to: '/mi-espacio/tickets', label: 'Tickets de gasto', icon: Receipt, corto: 'Tickets' },
  { to: '/mi-espacio/documentos', label: 'Mis documentos', icon: FolderOpen, corto: 'Documentos' },
]

/** Menú según lo que eres en la empresa que estás viendo */
function menu(rol: RolEnCuenta | null, puede: (p: Permiso) => boolean): ItemNav[] {
  if (rol === 'socio') return [{ to: '/socio', label: 'Vista de socio', icon: PieChart, corto: 'Socio' }]
  if (rol === 'empleado') return ESPACIO
  const items: (ItemNav & { si: boolean })[] = [
    { to: '/', label: 'Resumen', icon: LayoutDashboard, end: true, si: true },
    { to: '/gastos', label: 'Gastos', icon: Receipt, si: puede('gastos') },
    { to: '/facturas', label: 'Facturas', icon: FileText, si: puede('ventas') },
    { to: '/presupuestos', label: 'Presupuestos', icon: ClipboardList, corto: 'Presup.', si: puede('ventas') },
    { to: '/clientes', label: 'Clientes', icon: Users, si: puede('ventas') },
    { to: '/contabilidad', label: 'Contabilidad', icon: BookOpen, si: puede('contabilidad') },
    { to: '/impuestos', label: 'Impuestos', icon: Landmark, si: puede('impuestos') },
    { to: '/tarjetas', label: 'Tarjetas', icon: CreditCard, si: TARJETAS_ACTIVAS && puede('tarjetas') },
    { to: puede('laboral') ? '/laboral' : '/laboral/nominas', label: 'Laboral', icon: IdCard, si: puede('laboral') || puede('nominas') },
  ]
  return items.filter((i) => i.si)
}

/** Botón de la barra de abajo del móvil: zona de toque alta y texto legible en una línea */
const BOTON_ABAJO = 'flex min-w-0 flex-col items-center justify-center gap-0.5 pt-2 pb-1.5 text-center text-xs leading-tight'

/** Para que la guía rápida encuentre cada apartado del menú: nav-nominas, nav-ficha… */
const guiaDe = (to: string) => `nav-${to.split('/').pop() || 'inicio'}`

/** Nombre corto de una empresa */
const nombreDe = (p: Pick<Profile, 'nombre' | 'email'> & { nombre_comercial?: string | null }) => p.nombre_comercial || p.nombre || p.email || 'Empresa'

type OpcionCuenta = { id: string; nombre: string; rol?: string }

/** Inicial de la cuenta para su circulito */
const inicial = (s: string) => s.trim().charAt(0).toUpperCase() || '·'

/**
 * Las cuentas entre las que puede moverse esta persona: las suyas (la propia y las vinculadas:
 * autónomo + SL…), solo con su nombre, y luego las empresas en las que es miembro, con su rol.
 * null si no aplica (asesor, o quien solo tiene una cuenta sin más accesos).
 */
function useCuentas() {
  const { me, owner, accesos, propias, rol } = useAuth()
  if (!me || !owner || me.role === 'advisor') return null
  if (accesos.length === 0 && propias.length === 0) return null
  const propia = me.role !== 'member'
  const opciones: OpcionCuenta[] = [
    ...(propia ? [{ id: me.id, nombre: nombreDe(me) }] : []),
    ...propias.map((c) => ({ id: c.id, nombre: nombreDe(c) })),
    ...accesos
      .filter((a: Acceso) => !propias.some((c) => c.id === a.cuenta_id))
      .map((a: Acceso) => ({ id: a.cuenta_id, nombre: nombreDe(a.empresa), rol: NOMBRE_ROL[a.rol] })),
  ]
  return {
    opciones,
    actual: owner.id,
    nombre: nombreDe(owner),
    rol: rol && rol !== 'titular' ? NOMBRE_ROL[rol] : null,
    /** Hay a dónde cambiar */
    varias: opciones.length > 1,
  }
}

/** Escritorio: desplegable en la barra lateral para elegir qué empresa ver */
function SelectorEmpresa({ oscuro = false }: { oscuro?: boolean }) {
  const { setOwner } = useAuth()
  const navigate = useNavigate()
  const cuentas = useCuentas()
  if (!cuentas) return null
  if (!cuentas.varias)
    return (
      <div className={cx('flex items-center gap-2 rounded-xl px-3 py-2 text-sm', oscuro ? 'bg-white/5 text-white/80' : 'bg-paper')}>
        <Building2 className="size-4 shrink-0" />
        <span className="truncate">
          {cuentas.nombre}
          {cuentas.rol && <span className={oscuro ? 'text-white/50' : 'text-muted'}> · {cuentas.rol}</span>}
        </span>
      </div>
    )
  return (
    <label className={cx('flex items-center gap-2 rounded-xl px-3 py-2 text-sm', oscuro ? 'bg-white/5 text-white' : 'bg-paper text-ink')}>
      <Building2 className="size-4 shrink-0" />
      <span className="sr-only">Empresa</span>
      <select
        value={cuentas.actual}
        onChange={async (e) => {
          await setOwner(e.target.value)
          navigate('/')
        }}
        className={cx('min-w-0 flex-1 truncate bg-transparent outline-none', oscuro && '[&>option]:text-ink')}
      >
        {cuentas.opciones.map((o) => (
          <option key={o.id} value={o.id}>
            {o.nombre}
            {o.rol ? ` · ${o.rol}` : ''}
          </option>
        ))}
      </select>
    </label>
  )
}

function Logo({ dark = false }: { dark?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <img src="/logo.png" alt="" className="size-9" />
      <div className="leading-tight">
        <div className={cx('text-[15px] font-semibold tracking-tight', dark ? 'text-white' : 'text-ink')}>NomoTax</div>
        <div className={cx('text-[11px] uppercase tracking-[0.12em]', dark ? 'text-white/50' : 'text-muted')}>
          Área de clientes
        </div>
      </div>
    </div>
  )
}

export default function Layout() {
  const { me, owner, isAdvisor, viewingOther, setOwner, signOut, rol, puede, miembro, viendoComo, verComoTrabajador } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [mas, setMas] = useState(false)
  useEffect(() => setMas(false), [location.pathname])
  // Móvil: la cuenta en la que estás, siempre arriba; se cambia desde ahí o desde «Más»
  const cuentas = useCuentas()
  const [verCuentas, setVerCuentas] = useState(false)
  const [destello, setDestello] = useState(false)
  const cambiarCuenta = async (o: OpcionCuenta) => {
    setVerCuentas(false)
    if (!cuentas || o.id === cuentas.actual) return
    await setOwner(o.id)
    navigate('/')
    notify(`Ahora estás en ${o.nombre}`)
    setDestello(true)
    setTimeout(() => setDestello(false), 1400)
  }
  // «Mi tarjeta»: solo si la empresa le ha dado alguna tarjeta a esta persona
  const { ownerId } = useAuth()
  const [conTarjeta, setConTarjeta] = useState(false)
  useEffect(() => {
    if (!TARJETAS_ACTIVAS || !ownerId || !me) return setConTarjeta(false)
    misTarjetas(ownerId, me.id)
      .then((r) => setConTarjeta(r.tarjetas.length > 0))
      .catch(() => setConTarjeta(false))
  }, [ownerId, me, location.pathname])
  const FICHAR: ItemNav[] = (miembro?.fichaje && miembro?.trabajador_id) || enDemo() ? [{ to: '/fichar', label: 'Registro de jornada', icon: Clock, corto: 'Fichar' }] : []
  const NAV = [...(rol === 'empleado' ? FICHAR : []), ...menu(rol, puede), ...(conTarjeta ? [{ to: '/mi-tarjeta', label: 'Mi tarjeta', icon: CreditCard }] : [])]
  // Quien además es trabajador (admin, socio o comercial con ficha) tiene su bloque «Mi espacio» aparte
  const ESP = rol !== 'empleado' && miembro?.trabajador_id ? [...FICHAR, ...ESPACIO] : []
  /** En el móvil: 4 fijas abajo y el resto en «Más» */
  const FIJAS = NAV.slice(0, 4).map((n) => n.to)
  const enMas = !FIJAS.includes(location.pathname) && !FIJAS.filter((r) => r !== '/').some((r) => location.pathname.startsWith(r + '/'))
  const verAsesor = puede('asesor')
  // Configuración: perfil, plan, usuarios y vista de socio, en una ventana con las secciones a la izquierda
  const { abrir: abrirConfig, abierta: enConfig } = useConfig()

  const salirDeCuenta = async () => {
    await setOwner(null)
    navigate('/asesor')
  }

  const nombreCuenta = owner?.nombre || owner?.email || ''
  /** Lo que va en «Más» (además de Configuración) */
  const itemsMas: ItemNav[] = [
    ...NAV.filter((n) => !FIJAS.includes(n.to)),
    ...ESP.map((e) => ({ ...e, label: e.to.endsWith('tickets') ? 'Mis tickets' : e.label })),
    ...(verAsesor ? [{ to: '/mi-asesor', label: 'Mi asesor', icon: MessagesSquare }] : []),
    ...(isAdvisor ? [{ to: '/asesor', label: 'Panel asesor', icon: Briefcase }] : []),
  ]

  return (
    <div className="min-h-dvh lg:flex">
      {/* Barra lateral (escritorio) */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col overflow-y-auto overscroll-contain bg-ink px-4 py-6 text-white [scrollbar-color:rgb(255_255_255/0.2)_transparent] [scrollbar-width:thin] lg:flex">
        <div className="px-2">
          <NavLink to="/" aria-label="Ir al resumen" className="rounded-lg">
            <Logo dark />
          </NavLink>
        </div>

        <div className="mt-6">
          <SelectorEmpresa oscuro />
        </div>

        <nav className="mt-6 flex flex-col gap-1">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              data-guia={guiaDe(to)}
              className={({ isActive }) =>
                cx(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] transition-colors',
                  isActive ? 'bg-lima font-medium text-ink' : 'text-white/75 hover:bg-white/5 hover:text-white',
                )
              }
            >
              <Icon className="size-[18px]" />
              {label}
            </NavLink>
          ))}
          {ESP.length > 0 && (
            <>
              <p className="mt-5 px-3 pb-1 text-[11px] uppercase tracking-[0.12em] text-white/40">Mi espacio</p>
              {ESP.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  data-guia={guiaDe(to)}
                  className={({ isActive }) =>
                    cx(
                      'flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] transition-colors',
                      isActive ? 'bg-lima font-medium text-ink' : 'text-white/75 hover:bg-white/5 hover:text-white',
                    )
                  }
                >
                  <Icon className="size-[18px]" />
                  {label}
                </NavLink>
              ))}
            </>
          )}
        </nav>

        <div className="mt-auto flex flex-col gap-1 border-t border-white/10 pt-4">
          {puede('empresa') && <PlanLateral perfil={owner} />}
          {verAsesor && (
          <NavLink
            to="/mi-asesor"
            data-guia="nav-mi-asesor"
            className={({ isActive }) =>
              cx(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] transition-colors',
                isActive ? 'bg-white/10 text-white' : 'text-white/75 hover:bg-white/5 hover:text-white',
              )
            }
          >
            <MessagesSquare className="size-[18px]" />
            Mi asesor
          </NavLink>
          )}
          {isAdvisor && (
            <NavLink
              to="/asesor"
              className={({ isActive }) =>
                cx(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] transition-colors',
                  isActive ? 'bg-white/10 text-white' : 'text-white/75 hover:bg-white/5 hover:text-white',
                )
              }
            >
              <Briefcase className="size-[18px]" />
              Panel del asesor
            </NavLink>
          )}
          <button
            onClick={() => abrirConfig()}
            data-guia="nav-config"
            className={cx(
              'flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] transition-colors',
              enConfig ? 'bg-white/10 text-white' : 'text-white/75 hover:bg-white/5 hover:text-white',
            )}
          >
            <Settings className="size-[18px]" />
            Configuración
          </button>
          <button
            onClick={signOut}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] text-white/60 hover:bg-white/5 hover:text-white"
          >
            <LogOut className="size-[18px]" />
            Cerrar sesión
          </button>
          <div className="mt-2 truncate px-3 text-xs text-white/40">{me?.email}</div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Cabecera (móvil) */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-white/10 bg-ink px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 lg:hidden">
          {cuentas ? (
            <div className="flex min-w-0 items-center gap-2.5">
              <NavLink to="/" aria-label="Ir al resumen" className="shrink-0 rounded-lg">
                <img src="/logo.png" alt="" className="size-9" />
              </NavLink>
              <div className="min-w-0 leading-tight">
                <NavLink to="/" className="block text-[15px] font-semibold tracking-tight text-white">
                  NomoTax
                </NavLink>
                <button
                  type="button"
                  onClick={() => cuentas.varias && setVerCuentas(true)}
                  disabled={!cuentas.varias}
                  aria-label={cuentas.varias ? `Estás en ${cuentas.nombre}. Cambiar de cuenta` : `Estás en ${cuentas.nombre}`}
                  className={cx(
                    'mt-0.5 flex max-w-full items-center gap-1 rounded-full py-0.5 pl-0.5 pr-2 text-[12px] transition-colors duration-500',
                    destello ? 'bg-lima text-ink' : 'bg-white/10 text-white/85',
                    cuentas.varias && 'cursor-pointer active:bg-white/20',
                  )}
                >
                  <span className="grid size-4 shrink-0 place-items-center rounded-full bg-lima text-[9px] font-semibold text-ink">{inicial(cuentas.nombre)}</span>
                  <span className="truncate">
                    {cuentas.nombre}
                    {cuentas.rol && <span className="opacity-60"> · {cuentas.rol}</span>}
                  </span>
                  {cuentas.varias && <ChevronDown className="size-3 shrink-0 opacity-70" />}
                </button>
              </div>
            </div>
          ) : (
            <NavLink to="/" aria-label="Ir al resumen" className="rounded-lg">
              <Logo dark />
            </NavLink>
          )}
          <div className="flex shrink-0 items-center gap-1">
            {verAsesor && (
              <NavLink to="/mi-asesor" data-guia="nav-mi-asesor" className="rounded-full p-2 text-white/80 hover:bg-white/10" aria-label="Mi asesor">
                <MessagesSquare className="size-5" />
              </NavLink>
            )}
            {isAdvisor && (
              <NavLink to="/asesor" className="rounded-full p-2 text-white/80 hover:bg-white/10" aria-label="Panel del asesor">
                <Briefcase className="size-5" />
              </NavLink>
            )}
            <button onClick={() => abrirConfig()} data-guia="nav-config" className="rounded-full p-2 text-white/80 hover:bg-white/10" aria-label="Configuración">
              <Settings className="size-5" />
            </button>
          </div>
        </header>

        {viendoComo && (
          <div className="flex flex-wrap items-center justify-between gap-2 bg-ink px-4 py-2 text-sm text-white lg:px-10">
            <span>
              Estás viendo lo que ve <strong>{viendoComo.nombre}</strong> ({viendoComo.rol}) al entrar con su usuario
            </span>
            <button
              onClick={() => {
                const id = viendoComo.id
                // Primero salir de su vista (si no, Laboral aún no se puede ver y la app manda al inicio)
                flushSync(() => verComoTrabajador(null))
                navigate(`/laboral/trabajadores/${id}`)
              }}
              className="inline-flex items-center gap-1 font-medium text-lima underline-offset-2 hover:underline"
            >
              <ArrowLeft className="size-4" /> Volver a la ficha
            </button>
          </div>
        )}

        {viewingOther && (
          <div className="flex flex-wrap items-center justify-between gap-2 bg-lima px-4 py-2 text-sm text-ink lg:px-10">
            <span>
              Estás viendo la cuenta de <strong>{nombreCuenta}</strong>
            </span>
            <button onClick={salirDeCuenta} className="inline-flex items-center gap-1 font-medium underline-offset-2 hover:underline">
              <ArrowLeft className="size-4" /> Volver a mi panel
            </button>
          </div>
        )}

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-6 sm:px-6 lg:px-10 lg:pb-12 lg:pt-10">
          <Outlet />
        </main>

        {/* Navegación inferior (móvil): 4 fijas + «Más» */}
        <nav
          className={cx(
            'fixed inset-x-0 bottom-0 z-30 grid border-t border-line bg-white/95 shadow-[0_-4px_16px_rgb(17_17_16/0.05)] backdrop-blur safe-bottom lg:hidden',
            ['grid-cols-2', 'grid-cols-3', 'grid-cols-4', 'grid-cols-5'][Math.min(FIJAS.length, 4) - 1],
          )}
        >
          {NAV.filter((n) => FIJAS.includes(n.to)).map(({ to, label, corto, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              data-guia={guiaDe(to)}
              aria-label={label}
              className={({ isActive }) => cx(BOTON_ABAJO, isActive ? 'font-semibold text-ink' : 'text-ink/60')}
            >
              {({ isActive }) => (
                <>
                  <span className={cx('grid h-8 w-14 place-items-center rounded-full transition-colors', isActive && 'bg-lima')}>
                    <Icon className="size-5" />
                  </span>
                  <span className="w-full truncate px-0.5">{corto ?? label}</span>
                </>
              )}
            </NavLink>
          ))}
          <button onClick={() => setMas(true)} data-guia="nav-mas" className={cx(BOTON_ABAJO, enMas ? 'font-semibold text-ink' : 'text-ink/60')}>
            <span className={cx('grid h-8 w-14 place-items-center rounded-full transition-colors', enMas && 'bg-lima')}>
              <LayoutGrid className="size-5" />
            </span>
            <span className="w-full truncate px-0.5">Más</span>
          </button>
        </nav>

        {mas && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-ink/50 backdrop-blur-[2px]" onClick={() => setMas(false)} />
            <div className="absolute inset-x-0 bottom-0 max-h-[90dvh] overflow-y-auto overscroll-contain rounded-t-3xl bg-white px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl">
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
              <div className="mb-3 flex items-center justify-between px-1">
                <p className="font-semibold">Más opciones</p>
                <button onClick={() => setMas(false)} className="grid size-10 place-items-center rounded-full bg-paper" aria-label="Cerrar">
                  <X className="size-5" />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {itemsMas.map(({ to, label, icon: Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    className={({ isActive }) =>
                      cx('flex flex-col items-center gap-2 rounded-2xl px-2 py-4 text-center text-sm', isActive ? 'bg-lima font-medium' : 'bg-paper active:bg-ink/5')
                    }
                  >
                    <Icon className="size-6" />
                    {label}
                  </NavLink>
                ))}
                <button
                  onClick={() => {
                    setMas(false)
                    abrirConfig()
                  }}
                  className={cx('flex flex-col items-center gap-2 rounded-2xl px-2 py-4 text-center text-sm', enConfig ? 'bg-lima font-medium' : 'bg-paper active:bg-ink/5')}
                >
                  <Settings className="size-6" />
                  Configuración
                </button>
                {cuentas?.varias && (
                  <button
                    onClick={() => {
                      setMas(false)
                      setVerCuentas(true)
                    }}
                    // Rellena los huecos de la última fila (si solo queda uno, va en su propia fila)
                    className={cx(
                      'flex min-w-0 items-center gap-2.5 rounded-2xl bg-ink px-3 py-3 text-left text-white active:bg-ink-3',
                      (itemsMas.length + 1) % 3 === 1 ? 'col-span-2' : 'col-span-3',
                    )}
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-lima text-sm font-semibold text-ink">{inicial(cuentas.nombre)}</span>
                    <span className="min-w-0 flex-1 leading-tight">
                      <span className="block text-xs text-white/60">Estás en</span>
                      <span className="block truncate text-sm font-medium">{cuentas.nombre}</span>
                    </span>
                    <ArrowLeftRight className="size-5 shrink-0 text-lima" />
                  </button>
                )}
              </div>
              <button onClick={signOut} className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm text-muted active:bg-paper">
                <LogOut className="size-4" /> Cerrar sesión
              </button>
            </div>
          </div>
        )}

        {verCuentas && cuentas && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-ink/50 backdrop-blur-[2px]" onClick={() => setVerCuentas(false)} />
            <div
              role="dialog"
              aria-label="Cambiar de cuenta"
              className="absolute inset-x-0 bottom-0 max-h-[90dvh] overflow-y-auto overscroll-contain rounded-t-3xl bg-white px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl"
            >
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
              <div className="mb-3 flex items-center justify-between px-1">
                <p className="font-semibold">Cambiar de cuenta</p>
                <button onClick={() => setVerCuentas(false)} className="grid size-10 place-items-center rounded-full bg-paper" aria-label="Cerrar">
                  <X className="size-5" />
                </button>
              </div>
              <div className="flex flex-col gap-2">
                {cuentas.opciones.map((o) => {
                  const activa = o.id === cuentas.actual
                  return (
                    <button
                      key={o.id}
                      onClick={() => cambiarCuenta(o)}
                      aria-current={activa}
                      className={cx(
                        'flex items-center gap-3 rounded-2xl px-3 py-3 text-left',
                        activa ? 'border-2 border-ink' : 'border border-line active:bg-paper',
                      )}
                    >
                      <span className={cx('grid size-8 shrink-0 place-items-center rounded-full text-sm font-semibold text-ink', activa ? 'bg-lima' : 'bg-paper')}>
                        {inicial(o.nombre)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-medium">{o.nombre}</span>
                        {o.rol && <span className="block text-xs text-muted">{o.rol}</span>}
                      </span>
                      {activa && <Check className="size-5 shrink-0" />}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>

    </div>
  )
}
