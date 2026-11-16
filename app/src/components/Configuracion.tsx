/**
 * Configuración: una ventana grande con las secciones a la izquierda (Perfil, Plan, Usuarios,
 * Vista de socio…) y su contenido a la derecha. Se abre desde el menú sin salir de la página.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Search, X } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { seccionesVisibles, type IdSeccion } from '../lib/configuracion'
import { cuotaCliente } from '../lib/planes'
import Perfil from '../pages/Perfil'
import Usuarios from '../pages/Usuarios'
import VistaSocio from '../pages/VistaSocio'
import { HistorialFacturacion, PlanTarjeta, TablaPlanes } from './Planes'
import { errorMessage, supabase } from '../lib/supabase'
import { Button, Card, Field, Input, cx, notify } from './ui'

interface ConfigState {
  /** Abre la ventana (en esa sección, o en la primera) */
  abrir: (seccion?: IdSeccion, opciones?: { nuevaClave?: boolean }) => void
  cerrar: () => void
  abierta: boolean
  /** Viene del correo de «He olvidado la contraseña»: se resalta el cambio de contraseña */
  nuevaClave: boolean
}

const Ctx = createContext<ConfigState | null>(null)

export function useConfig(): ConfigState {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useConfig fuera de ConfigProvider')
  return ctx
}

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [abierta, setAbierta] = useState(false)
  const [seccion, setSeccion] = useState<IdSeccion | null>(null)
  const [nuevaClave, setNuevaClave] = useState(false)

  const abrir = useCallback((s?: IdSeccion, o?: { nuevaClave?: boolean }) => {
    setSeccion(s ?? null)
    setNuevaClave(Boolean(o?.nuevaClave))
    setAbierta(true)
  }, [])
  const cerrar = useCallback(() => {
    setAbierta(false)
    setNuevaClave(false)
  }, [])

  const value = useMemo(() => ({ abrir, cerrar, abierta, nuevaClave }), [abrir, cerrar, abierta, nuevaClave])
  return (
    <Ctx.Provider value={value}>
      {children}
      {abierta && <VentanaConfig inicial={seccion} onClose={cerrar} />}
    </Ctx.Provider>
  )
}

function VentanaConfig({ inicial, onClose }: { inicial: IdSeccion | null; onClose: () => void }) {
  const { rol, puede, viewingOther, owner } = useAuth()
  const ctx = { viewingOther, rol, puede }
  const secciones = seccionesVisibles(rol, puede)
  const [activa, setActiva] = useState<IdSeccion>(inicial && secciones.some((s) => s.id === inicial) ? inicial : secciones[0]?.id ?? 'perfil')
  const [q, setQ] = useState('')

  // Escape cierra (salvo que haya otra ventana encima, como «Dar acceso»), y la página de detrás no se mueve
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (document.querySelectorAll('[role="dialog"]').length > 1) return
      onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  const filtro = q.trim().toLowerCase()
  const filtradas = secciones.filter((s) => !filtro || `${s.label(ctx)} ${s.detalle(ctx)}`.toLowerCase().includes(filtro))
  const grupos = viewingOther
    ? [{ titulo: owner?.nombre || 'Cliente', items: filtradas }]
    : (['Tu cuenta', 'Empresa'] as const).map((g) => ({ titulo: g, items: filtradas.filter((s) => s.grupo === g) })).filter((g) => g.items.length)
  const actual = secciones.find((s) => s.id === activa) ?? secciones[0]

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-stretch justify-center sm:items-center sm:p-6">
      <div className="absolute inset-0 bg-ink/50 backdrop-blur-[2px]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Configuración"
        className="relative flex h-dvh w-full flex-col overflow-hidden bg-white shadow-2xl sm:h-[min(88dvh,860px)] sm:max-w-6xl sm:rounded-2xl"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line py-2 pl-5 pr-2 sm:py-3 sm:pl-6 sm:pr-3">
          <h2 className="min-w-0 truncate text-lg font-semibold">
            Configuración
            {viewingOther && owner?.nombre && <span className="font-normal text-muted"> · {owner.nombre}</span>}
          </h2>
          <button onClick={onClose} className="grid size-11 shrink-0 place-items-center rounded-full bg-paper text-ink hover:bg-ink/10" aria-label="Cerrar">
            <X className="size-5" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          {/* Izquierda: buscador y secciones (en el móvil, una fila arriba) */}
          <aside className="shrink-0 border-b border-line bg-paper/60 sm:w-64 sm:overflow-y-auto sm:border-b-0 sm:border-r">
            <div className="hidden p-3 sm:block">
              <label className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm ring-1 ring-line focus-within:ring-ink/30">
                <Search className="size-4 shrink-0 text-muted" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar" className="min-w-0 flex-1 bg-transparent outline-none" />
              </label>
            </div>
            <nav className="flex gap-1 overflow-x-auto px-3 py-2 sm:block sm:space-y-4 sm:px-3 sm:pb-4 sm:pt-0">
              {grupos.map((g) => (
                <div key={g.titulo} className="contents sm:block">
                  <p className="hidden truncate px-2 pb-1 pt-2 text-xs font-medium text-muted sm:block">{g.titulo}</p>
                  {g.items.map((s) => {
                    const Icon = s.icon
                    return (
                      <button
                        key={s.id}
                        onClick={() => setActiva(s.id)}
                        className={cx(
                          'flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lg px-2.5 py-2 text-left text-[15px] transition-colors sm:w-full',
                          s.id === actual?.id ? 'bg-ink/[0.07] font-medium text-ink' : 'text-ink/80 hover:bg-ink/[0.04]',
                        )}
                      >
                        <Icon className="size-[18px] shrink-0" />
                        <span className="truncate">{s.label(ctx)}</span>
                      </button>
                    )
                  })}
                </div>
              ))}
              {filtradas.length === 0 && <p className="px-2 py-2 text-sm text-muted">Nada con «{q}»</p>}
            </nav>
          </aside>

          {/* Derecha: la sección elegida */}
          <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-8 sm:py-6">
            {actual && (
              <>
                <h3 className="text-xl font-semibold tracking-tight">{actual.label(ctx)}</h3>
                <p className="mb-5 text-sm text-muted">{actual.detalle(ctx)}</p>
                {actual.id === 'perfil' && <Perfil />}
                {actual.id === 'plan' && <SeccionPlan />}
                {actual.id === 'facturacion' && <SeccionFacturacion />}
                {actual.id === 'usuarios' && <Usuarios embebido />}
                {actual.id === 'socio' && <VistaSocio embebido />}
              </>
            )}
          </main>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function SeccionPlan() {
  const { owner, isAdvisor, viewingOther, refresh } = useAuth()
  if (!owner) return null
  const cuota = cuotaCliente(owner)
  return (
    <div className="space-y-6">
      <Card className="p-5">
        <PlanTarjeta
          perfil={owner}
          titulo={viewingOther ? 'Plan del cliente' : 'Tu plan'}
          editable={isAdvisor && viewingOther}
          onGuardado={refresh}
          conComparador={false}
        />
      </Card>
      <div>
        <h4 className="mb-4 font-semibold">Todos los planes</h4>
        <TablaPlanes planId={cuota?.plan.id ?? null} tuPrecio={cuota?.texto} />
      </div>
    </div>
  )
}

function SeccionFacturacion() {
  const { owner, refresh } = useAuth()
  const [email, setEmail] = useState(owner?.email_facturacion ?? '')
  const [guardando, setGuardando] = useState(false)
  useEffect(() => setEmail(owner?.email_facturacion ?? ''), [owner?.email_facturacion])
  if (!owner) return null
  const columna = 'email_facturacion' in owner
  const cambiado = email.trim().toLowerCase() !== (owner.email_facturacion ?? '')

  const guardar = async () => {
    const valor = email.trim().toLowerCase()
    if (valor && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor)) return notify('Pon un email válido', 'error')
    setGuardando(true)
    const { error } = await supabase.from('profiles').update({ email_facturacion: valor || null }).eq('id', owner.id)
    setGuardando(false)
    if (error) return notify(await errorMessage(error), 'error')
    await refresh()
    notify('Email de facturación guardado')
  }

  return (
    <div className="space-y-6">
      {columna && (
        <Card className="p-5">
          <Field label="Email para recibir las facturas de NomoTax" hint={`Si lo dejas vacío, se envían a ${owner.email ?? 'el email de la cuenta'}.`}>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={owner.email ?? ''} />
              <Button variant="secondary" onClick={guardar} loading={guardando} disabled={!cambiado}>
                Guardar
              </Button>
            </div>
          </Field>
        </Card>
      )}
      <Card className="p-5">
        <h4 className="mb-4 font-semibold">Facturas de NomoTax</h4>
        <HistorialFacturacion perfil={owner} />
      </Card>
    </div>
  )
}
