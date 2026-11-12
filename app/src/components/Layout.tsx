import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  Briefcase,
  ClipboardList,
  FileText,
  LayoutDashboard,
  LogOut,
  Receipt,
  UserRound,
  Users,
  ArrowLeft,
  IdCard,
  Headset,
} from 'lucide-react'
import { useAuth } from '../lib/auth'
import { cx } from './ui'

const NAV = [
  { to: '/', label: 'Resumen', icon: LayoutDashboard, end: true },
  { to: '/gastos', label: 'Gastos', icon: Receipt },
  { to: '/facturas', label: 'Facturas', icon: FileText },
  { to: '/presupuestos', label: 'Presupuestos', icon: ClipboardList },
  { to: '/clientes', label: 'Clientes', icon: Users },
  { to: '/laboral', label: 'Laboral', icon: IdCard },
]

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
  const { me, owner, isAdvisor, viewingOther, setOwner, signOut } = useAuth()
  const navigate = useNavigate()

  const salirDeCuenta = async () => {
    await setOwner(null)
    navigate('/asesor')
  }

  const nombreCuenta = owner?.nombre || owner?.email || ''

  return (
    <div className="min-h-dvh lg:flex">
      {/* Barra lateral (escritorio) */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col bg-ink px-4 py-6 text-white lg:flex">
        <div className="px-2">
          <Logo dark />
        </div>

        <nav className="mt-8 flex flex-col gap-1">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
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
        </nav>

        <div className="mt-auto flex flex-col gap-1 border-t border-white/10 pt-4">
          <NavLink
            to="/mi-asesor"
            className={({ isActive }) =>
              cx(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] transition-colors',
                isActive ? 'bg-white/10 text-white' : 'text-white/75 hover:bg-white/5 hover:text-white',
              )
            }
          >
            <img src="/pablo-asesor.jpg" alt="" className="size-[22px] rounded-full object-cover ring-1 ring-lima" />
            Mi asesor
          </NavLink>
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
          <NavLink
            to="/perfil"
            className={({ isActive }) =>
              cx(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] transition-colors',
                isActive ? 'bg-white/10 text-white' : 'text-white/75 hover:bg-white/5 hover:text-white',
              )
            }
          >
            <UserRound className="size-[18px]" />
            <span className="truncate">{viewingOther ? 'Perfil del cliente' : 'Mi perfil'}</span>
          </NavLink>
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
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/10 bg-ink px-4 py-3 lg:hidden">
          <Logo dark />
          <div className="flex items-center gap-1">
            <NavLink to="/mi-asesor" className="rounded-full p-2 text-white/80 hover:bg-white/10" aria-label="Mi asesor">
              <Headset className="size-5" />
            </NavLink>
            {isAdvisor && (
              <NavLink to="/asesor" className="rounded-full p-2 text-white/80 hover:bg-white/10" aria-label="Panel del asesor">
                <Briefcase className="size-5" />
              </NavLink>
            )}
            <NavLink to="/perfil" className="rounded-full p-2 text-white/80 hover:bg-white/10" aria-label="Perfil">
              <UserRound className="size-5" />
            </NavLink>
          </div>
        </header>

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

        {/* Navegación inferior (móvil) */}
        <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 border-t border-line bg-white/95 backdrop-blur safe-bottom lg:hidden">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cx('flex flex-col items-center gap-1 py-2 text-[10.5px]', isActive ? 'text-ink font-medium' : 'text-muted')
              }
            >
              {({ isActive }) => (
                <>
                  <span className={cx('grid h-7 w-11 place-items-center rounded-full', isActive && 'bg-lima')}>
                    <Icon className="size-[18px]" />
                  </span>
                  {label === 'Presupuestos' ? 'Presup.' : label}
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  )
}
