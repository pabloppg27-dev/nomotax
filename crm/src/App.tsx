import { useEffect, useState } from 'react'
import { NavLink, Route, Routes } from 'react-router-dom'
import { CalendarDays, CheckSquare, FolderKanban, Mic, Users, Video } from 'lucide-react'
import Dictar from './components/Dictar'
import { MODO } from './lib/supabase'
import { useStore } from './lib/store'
import Tareas from './pages/Tareas'
import Calendario from './pages/Calendario'
import Reuniones from './pages/Reuniones'
import Clientes from './pages/Clientes'
import ClienteFicha from './pages/ClienteFicha'
import Proyectos from './pages/Proyectos'
import ProyectoPagina from './pages/Proyecto'
import Acceso from './pages/Acceso'

const MENU = [
  { a: '/', t: 'Tareas', i: CheckSquare },
  { a: '/proyectos', t: 'Proyectos', i: FolderKanban },
  { a: '/clientes', t: 'Clientes', i: Users },
  { a: '/reuniones', t: 'Reuniones', i: Video },
  { a: '/calendario', t: 'Calendario', i: CalendarDays },
]

export default function App() {
  const { error, cargando } = useStore()
  const [dictando, setDictando] = useState(false)
  // Atajo: ⌘K / Ctrl+K para dictar
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setDictando(true) } }
    window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f)
  }, [])

  if (MODO === 'real' && !cargando && error) return <Acceso error={error} />

  return (
    <div className="min-h-dvh md:flex">
      <aside className="hidden w-56 shrink-0 flex-col bg-ink p-4 text-white md:flex">
        <div className="mb-7 flex items-center gap-2.5 px-1">
          <img src="/logo.png" alt="" className="size-9 rounded-[10px] ring-1 ring-white/15" />
          <div className="leading-tight">
            <div className="text-[16px] font-bold tracking-tight">NomoTax</div>
            <div className="text-[10px] uppercase tracking-[0.14em] text-white/45">CRM</div>
          </div>
        </div>
        <nav className="space-y-1">
          {MENU.map(({ a, t, i: I }) => (
            <NavLink key={a} to={a} end={a === '/'} className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${isActive ? 'bg-white/10 text-lima' : 'text-white/80 hover:bg-white/5'}`}>
              <I size={18} /> {t}
            </NavLink>
          ))}
        </nav>
        <button onClick={() => setDictando(true)} className="mt-6 flex items-center justify-center gap-2 rounded-lg bg-lima px-3 py-2.5 text-sm font-semibold text-ink">
          <Mic size={18} /> Dictar <span className="text-xs font-normal opacity-60">⌘K</span>
        </button>
        {MODO === 'demo' && <p className="mt-auto px-2 text-xs text-white/40">Modo demo · datos solo en este navegador</p>}
      </aside>

      {/* Móvil: cabecera con el logo */}
      <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-line bg-paper/90 px-4 pb-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] backdrop-blur md:hidden">
        <img src="/logo.png" alt="" className="size-7" />
        <span className="text-[15px] font-bold tracking-tight">NomoTax</span>
        <span className="text-[10px] uppercase tracking-[0.14em] text-muted">CRM</span>
      </header>

      <main className="min-w-0 flex-1 px-4 pb-[calc(8rem+env(safe-area-inset-bottom))] pt-4 md:px-8 md:pb-10 md:pt-8">
        <div className="mx-auto max-w-5xl">
          <Routes>
            <Route path="/" element={<Tareas />} />
            <Route path="/proyectos" element={<Proyectos />} />
            <Route path="/proyectos/:id" element={<ProyectoPagina />} />
            <Route path="/clientes" element={<Clientes />} />
            <Route path="/clientes/:id" element={<ClienteFicha />} />
            <Route path="/reuniones" element={<Reuniones />} />
            <Route path="/calendario" element={<Calendario />} />
          </Routes>
        </div>
      </main>

      {/* Móvil: barra inferior + botón de dictar */}
      <button onClick={() => setDictando(true)} aria-label="Dictar"
        className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-lima text-ink shadow-lg md:hidden">
        <Mic size={24} />
      </button>
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
        {MENU.map(({ a, t, i: I }) => (
          <NavLink key={a} to={a} end={a === '/'} className={({ isActive }) => `flex flex-col items-center gap-0.5 py-2 text-[11px] ${isActive ? 'text-ink font-semibold' : 'text-muted'}`}>
            <I size={20} /> {t}
          </NavLink>
        ))}
      </nav>

      {dictando && <Dictar onClose={() => setDictando(false)} />}
    </div>
  )
}
