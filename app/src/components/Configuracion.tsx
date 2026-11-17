/**
 * Configuración: una ventana grande con las secciones a la izquierda (Perfil, Plan, Usuarios,
 * Vista de socio…) y su contenido a la derecha. Se abre desde el menú sin salir de la página.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { GRUPOS_CONFIG, seccionesVisibles, type IdSeccion } from '../lib/configuracion'
import { cuotaCliente } from '../lib/planes'
import Perfil from '../pages/Perfil'
import CorreoEnvio from './CorreoEnvio'
import Plantillas from './Plantillas'
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
  // En el móvil se ve una cosa u otra: la lista de secciones o la sección elegida (en el ordenador, las dos a la vez).
  // Si se llega con una sección concreta (un enlace del correo, «Tu plan»…), se abre directamente en ella.
  const [verSeccion, setVerSeccion] = useState(Boolean(inicial))
  const contenido = useRef<HTMLElement>(null)
  const elegir = (id: IdSeccion) => {
    setActiva(id)
    setVerSeccion(true)
    contenido.current?.scrollTo({ top: 0 })
  }

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
    : GRUPOS_CONFIG.map((g) => ({ titulo: g, items: filtradas.filter((s) => s.grupo === g) })).filter((g) => g.items.length)
  const actual = secciones.find((s) => s.id === activa) ?? secciones[0]

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-stretch justify-center sm:items-center sm:p-6">
      <div className="absolute inset-0 bg-ink/50 backdrop-blur-[2px]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Configuración"
        className="relative flex h-dvh w-full flex-col overflow-hidden shadow-2xl sm:h-[min(88dvh,860px)] sm:max-w-6xl sm:rounded-2xl"
      >
        {/* Cabecera blanca y una línea lima abajo. En el móvil, dentro de una sección, el título es «‹ Configuración» y vuelve a la lista */}
        <div className="shrink-0 border-b-2 border-lima bg-white text-ink">
          <div className="flex items-center justify-between gap-3 py-3 pl-3 pr-3 sm:py-3.5 sm:pl-6 sm:pr-4">
            {verSeccion ? (
              <button
                onClick={() => setVerSeccion(false)}
                className="-ml-0.5 flex items-center gap-1 rounded-full py-1 pl-1 pr-3 text-lg font-semibold tracking-tight transition-colors hover:bg-paper sm:hidden"
              >
                <ChevronLeft className="size-6" />
                Configuración
              </button>
            ) : null}
            <h2 className={cx('pl-2 text-lg font-semibold tracking-tight sm:pl-0', verSeccion && 'hidden sm:block')}>Configuración</h2>
            <button
              onClick={onClose}
              className="grid size-9 shrink-0 place-items-center rounded-full bg-paper text-ink transition-colors hover:bg-ink/10"
              aria-label="Cerrar"
            >
              <X className="size-[18px]" />
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col bg-white sm:flex-row">
          {/* Izquierda: buscador y secciones. En el móvil es la pantalla de inicio: tarjetas por grupos con icono, explicación y flecha */}
          <aside
            className={cx(
              'min-h-0 flex-1 overflow-y-auto overscroll-contain bg-paper sm:block sm:w-64 sm:flex-none sm:border-r sm:border-line sm:bg-paper/60',
              verSeccion && 'hidden',
            )}
          >
            <div className="px-4 pb-1 pt-4 sm:p-3">
              <label className="flex items-center gap-2 rounded-xl bg-white px-3 py-2.5 text-[15px] ring-1 ring-line focus-within:ring-ink/30 sm:py-2 sm:text-sm">
                <Search className="size-4 shrink-0 text-muted" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar en configuración" className="min-w-0 flex-1 bg-transparent outline-none" />
              </label>
            </div>

            {/* Quién eres (solo móvil): la cuenta con la que estás configurando */}
            {owner && !q && (
              <div className="mx-4 mt-3 flex items-center gap-3 rounded-2xl bg-ink p-4 text-white sm:hidden">
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-lima text-lg font-semibold text-ink">
                  {(owner.nombre_comercial || owner.nombre || owner.email || '?').trim().charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-semibold">{owner.nombre_comercial || owner.nombre || 'Mi cuenta'}</p>
                  {owner.email && <p className="truncate text-sm text-white/60">{owner.email}</p>}
                </div>
              </div>
            )}

            <nav className="space-y-5 px-4 pb-6 pt-3 sm:space-y-4 sm:px-3 sm:pb-4 sm:pt-0">
              {grupos.map((g) => (
                <section key={g.titulo}>
                  <p className="truncate px-2 pb-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-muted sm:pt-2">{g.titulo}</p>
                  <div className="divide-y divide-line overflow-hidden rounded-2xl bg-white ring-1 ring-line sm:space-y-0.5 sm:divide-y-0 sm:overflow-visible sm:rounded-none sm:bg-transparent sm:ring-0">
                    {g.items.map((s) => {
                      const Icon = s.icon
                      const sel = s.id === actual?.id
                      return (
                        <button
                          key={s.id}
                          onClick={() => elegir(s.id)}
                          aria-current={sel ? 'page' : undefined}
                          className={cx(
                            'flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors sm:gap-2.5 sm:rounded-xl sm:px-3 sm:py-2',
                            sel ? 'sm:bg-lima sm:font-medium sm:text-ink' : 'active:bg-paper sm:text-ink/75 sm:hover:bg-ink/[0.05] sm:hover:text-ink sm:active:bg-transparent',
                          )}
                        >
                          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-ink text-lima sm:size-auto sm:bg-transparent sm:text-current">
                            <Icon className="size-[18px] shrink-0" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[15px] font-medium sm:font-normal">{s.label(ctx)}</span>
                            <span className="line-clamp-1 text-[13px] text-muted sm:hidden">{s.detalle(ctx)}</span>
                          </span>
                          <ChevronRight className="size-4 shrink-0 text-muted/70 sm:hidden" />
                        </button>
                      )
                    })}
                  </div>
                </section>
              ))}
              {filtradas.length === 0 && <p className="px-2 py-2 text-sm text-muted">Nada con «{q}»</p>}
            </nav>
          </aside>

          {/* Derecha: la sección elegida */}
          <main ref={contenido} className={cx('min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:block sm:px-8 sm:py-6', !verSeccion && 'hidden')}>
            {actual && (
              <>
                <div className="mb-6 flex items-center gap-3 border-b border-line pb-5">
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-ink text-lima">
                    <actual.icon className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-xl font-semibold tracking-tight">{actual.label(ctx)}</h3>
                    <p className="text-sm text-muted">{actual.detalle(ctx)}</p>
                  </div>
                </div>
                {actual.id === 'perfil' && <Perfil />}
                {actual.id === 'correo' && <CorreoEnvio />}
                {actual.id === 'plantillas' && <Plantillas />}
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
