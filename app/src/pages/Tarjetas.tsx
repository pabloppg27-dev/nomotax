import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowDownLeft, Banknote, CreditCard, Eye, EyeOff, FlaskConical, Pause, Play, Plus, RotateCcw, ShieldCheck, ShoppingBag, SlidersHorizontal, UserRound, XCircle } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { errorMessage, supabase } from '../lib/supabase'
import { eur, fecha } from '../lib/format'
import {
  activar,
  activarIntegrado,
  cambiarEstadoTarjeta,
  configurarTarjeta,
  cargarEstado,
  comprarDemo,
  completarAltaDemo,
  crearTarjeta,
  datosDemo,
  datosIngreso,
  enlaceAlta,
  esDemo,
  gastadoEsteMes,
  ingresarDemo,
  reiniciarDemo,
  STRIPE_PK,
  type ConfigTarjeta,
  type DatosIngreso,
  type EstadoTarjetas,
  type Movimiento,
  type Tarjeta,
} from '../lib/tarjetas'
import NumInput from '../components/NumInput'
import TarjetaVisual from '../components/TarjetaVisual'
import { Badge, Button, Card, Empty, Field, Input, Loading, Modal, PageHeader, Select, confirmar, cx, notify } from '../components/ui'

const AltaIntegrada = lazy(() => import('../components/AltaIntegrada'))

/** El alta va dentro de la app si hay clave publicable de Stripe; si no, en una página de Stripe */
const ALTA_INTEGRADA = Boolean(STRIPE_PK)

/** Trabajador de la empresa (ficha de Laboral) al que se le puede dar una tarjeta */
type Persona = { id: string; nombre: string }

export default function Tarjetas() {
  const { ownerId, owner } = useAuth()
  const [params, setParams] = useSearchParams()
  const [estado, setEstado] = useState<EstadoTarjetas | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [nueva, setNueva] = useState(false)
  const [ingreso, setIngreso] = useState(false)
  const [configDe, setConfigDe] = useState<Tarjeta | null>(null)
  const [trabajadores, setTrabajadores] = useState<Persona[]>([])
  const [compraDe, setCompraDe] = useState<Tarjeta | null>(null)

  const nombreEmpresa = owner?.nombre_comercial || owner?.nombre || owner?.email || 'Empresa'

  const cargar = useCallback(async () => {
    if (!ownerId) return
    try {
      setError(null)
      setEstado(await cargarEstado(ownerId, nombreEmpresa))
    } catch (e) {
      setError(await errorMessage(e))
    }
  }, [ownerId, nombreEmpresa])

  useEffect(() => {
    cargar()
  }, [cargar])

  // Trabajadores de alta, para poder asignarles una tarjeta
  useEffect(() => {
    if (!ownerId) return
    supabase
      .from('trabajadores')
      .select('id, nombre, estado')
      .eq('owner_id', ownerId)
      .neq('estado', 'baja')
      .order('nombre')
      .then(({ data }) => setTrabajadores(((data as Persona[] | null) ?? []).filter((t) => t.nombre)))
  }, [ownerId])

  // Al volver de Stripe después del alta
  useEffect(() => {
    const alta = params.get('alta')
    if (!alta) return
    if (alta === 'ok') notify('Hemos recibido tus datos. Stripe los revisa y en un momento podrás emitir tarjetas.')
    setParams({}, { replace: true })
    cargar()
  }, [params, setParams, cargar])

  if (!ownerId) return <Loading />

  /** Ejecuta una acción mostrando el estado de «trabajando» y los errores */
  async function hacer(id: string, fn: () => Promise<void>, ok?: string) {
    setOcupado(id)
    try {
      await fn()
      if (ok) notify(ok)
      await cargar()
    } catch (e) {
      notify(await errorMessage(e), 'error')
    } finally {
      setOcupado(null)
    }
  }

  async function empezarAlta(reintento: boolean) {
    await hacer('alta', async () => {
      if (ALTA_INTEGRADA && !esDemo) {
        // Solo se crea la cuenta; el formulario aparece en la propia pantalla
        if (!reintento) await activarIntegrado(ownerId!)
        return
      }
      const r = reintento ? await enlaceAlta(ownerId!) : await activar(ownerId!)
      if (r.url) window.location.href = r.url
    })
  }

  const cuenta = estado?.cuenta ?? null
  const lista = estado?.tarjetas ?? []
  const activas = lista.filter((t) => t.estado !== 'cancelada')
  const canceladas = lista.filter((t) => t.estado === 'cancelada')

  return (
    <>
      <PageHeader
        title="Tarjetas"
        subtitle="Emite tarjetas Visa para los gastos de tu empresa, con tu propio saldo y límites."
        actions={
          cuenta?.emision_activa && (
            <Button icon={<Plus className="size-4" />} onClick={() => setNueva(true)}>
              Nueva tarjeta
            </Button>
          )
        }
      />

      {esDemo && (
        <div className="mb-5 flex flex-col gap-2 rounded-xl bg-lima/40 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-start gap-2">
            <FlaskConical className="mt-0.5 size-4 shrink-0" />
            <span>
              <strong>Modo demostración.</strong> Todo es simulado en este navegador: no se conecta con Stripe ni mueve dinero.
            </span>
          </span>
          <button
            className="inline-flex items-center gap-1.5 self-start text-left font-medium underline-offset-2 hover:underline"
            onClick={async () => {
              if (await confirmar({ titulo: 'Empezar de cero', texto: 'Se borran las tarjetas, el saldo y los movimientos de la demostración.', accion: 'Borrar', peligro: true })) {
                reiniciarDemo(ownerId)
                cargar()
              }
            }}
          >
            <RotateCcw className="size-3.5" />
            Empezar de cero
          </button>
        </div>
      )}

      {error ? (
        <Card className="p-5 text-sm text-rojo">{error}</Card>
      ) : estado === null ? (
        <Loading />
      ) : !cuenta ? (
        <Presentacion nombre={nombreEmpresa} cargando={ocupado === 'alta'} onActivar={() => empezarAlta(false)} />
      ) : !cuenta.emision_activa ? (
        <AltaPendiente
          cuenta={cuenta}
          cargando={ocupado === 'alta' || ocupado === 'demo-alta'}
          onContinuar={() => (esDemo ? hacer('demo-alta', () => completarAltaDemo(ownerId), 'Alta completada (simulada)') : empezarAlta(true))}
          onComprobar={() => hacer('comprobar', async () => {}, undefined)}
          ownerId={ownerId}
          onSalirAlta={cargar}
        />
      ) : (
        <div className="space-y-8">
          <Saldo saldo={estado.saldo ?? 0} onIngresar={() => setIngreso(true)} />

          <section>
            <h2 className="mb-3 text-lg font-semibold">Tus tarjetas</h2>
            {activas.length === 0 ? (
              <Card>
                <Empty
                  icon={<CreditCard className="size-5" />}
                  title="Todavía no tienes tarjetas"
                  text="Crea la primera: puede ser virtual (al instante) o física, con un límite de gasto al mes."
                  action={<Button onClick={() => setNueva(true)}>Crear mi primera tarjeta</Button>}
                />
              </Card>
            ) : (
              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                {activas.map((t) => (
                  <TarjetaItem
                    key={t.id}
                    t={t}
                    movimientos={estado.movimientos}
                    ocupado={ocupado === t.id}
                    onEstado={(e) =>
                      hacer(t.id, () => cambiarEstadoTarjeta(ownerId, t.id, e), e === 'congelada' ? 'Tarjeta congelada' : 'Tarjeta activada')
                    }
                    onCancelar={async () => {
                      if (await confirmar({ titulo: 'Cancelar la tarjeta', texto: `La tarjeta «${t.alias}» terminada en ${t.ultimos4} dejará de funcionar y no se puede recuperar.`, accion: 'Cancelar tarjeta', peligro: true }))
                        hacer(t.id, () => cambiarEstadoTarjeta(ownerId, t.id, 'cancelada'), 'Tarjeta cancelada')
                    }}
                    onConfigurar={() => setConfigDe(t)}
                    onComprar={() => setCompraDe(t)}
                  />
                ))}
              </div>
            )}
            {canceladas.length > 0 && (
              <p className="mt-4 text-sm text-muted">
                {canceladas.length} tarjeta{canceladas.length > 1 ? 's' : ''} cancelada{canceladas.length > 1 ? 's' : ''}:{' '}
                {canceladas.map((t) => `${t.alias} ···${t.ultimos4}`).join(', ')}
              </p>
            )}
          </section>

          <Movimientos movimientos={estado.movimientos} tarjetas={lista} />
        </div>
      )}

      {nueva && (
        <NuevaTarjeta
          titular={nombreEmpresa}
          trabajadores={trabajadores}
          onClose={() => setNueva(false)}
          onCrear={async (d) => {
            await crearTarjeta(ownerId, { ...d, titular: nombreEmpresa })
            notify('Tarjeta creada')
            setNueva(false)
            await cargar()
          }}
        />
      )}
      {ingreso && <Ingreso ownerId={ownerId} nombreEmpresa={nombreEmpresa} onClose={() => setIngreso(false)} onIngresado={cargar} />}
      {configDe && (
        <ConfigurarTarjeta
          t={configDe}
          titular={nombreEmpresa}
          trabajadores={trabajadores}
          onClose={() => setConfigDe(null)}
          onGuardar={async (c) => {
            await configurarTarjeta(ownerId, configDe.id, c, nombreEmpresa)
            notify('Tarjeta actualizada')
            setConfigDe(null)
            await cargar()
          }}
        />
      )}
      {compraDe && (
        <CompraDemo
          t={compraDe}
          onClose={() => setCompraDe(null)}
          onComprar={async (importe, comercio) => {
            const m = await comprarDemo(ownerId, compraDe.id, importe, comercio)
            if (m.estado === 'aprobada') notify(`Compra aprobada: ${eur(importe)} en ${comercio}`)
            else notify(`Compra rechazada: ${m.motivo ?? 'sin motivo'}`, 'error')
            setCompraDe(null)
            await cargar()
          }}
        />
      )}
    </>
  )
}

/* ------------------------------------------------------------- Alta */

function Presentacion({ nombre, cargando, onActivar }: { nombre: string; cargando: boolean; onActivar: () => void }) {
  return (
    <Card className="overflow-hidden">
      <div className="grid gap-6 p-5 sm:p-8 md:grid-cols-2 md:items-center">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Tarjetas para los gastos de tu empresa</h2>
          <ul className="mt-4 space-y-3 text-[15px]">
            {[
              ['Tarjetas virtuales al instante', 'Para Google, Meta, suscripciones o compras online.'],
              ['Un límite de gasto por tarjeta', 'Fija cuánto se puede gastar al mes y congélala cuando quieras.'],
              ['Tu dinero es tuyo', 'Ingresas por transferencia en tu propia cuenta. NomoTax no custodia tus fondos: lo guarda Stripe, entidad regulada.'],
              ['Gastos a tu contabilidad', 'Cada compra queda registrada para que tu asesor la tenga a mano.'],
            ].map(([t, d]) => (
              <li key={t} className="flex gap-3">
                <ShieldCheck className="mt-0.5 size-5 shrink-0 text-verde" />
                <span>
                  <strong className="font-medium">{t}.</strong> <span className="text-muted">{d}</span>
                </span>
              </li>
            ))}
          </ul>
          <Button className="mt-6" loading={cargando} onClick={onActivar}>
            Activar tarjetas
          </Button>
          <p className="mt-2 text-xs text-muted">Te pediremos los datos de tu empresa y de su representante. Lo verifica Stripe, no NomoTax.</p>
        </div>
        <div className="grid place-items-center">
          <TarjetaVisual titular={nombre} alias="Ejemplo" ultimos4="4242" exp_mes={12} exp_anio={2029} />
        </div>
      </div>
    </Card>
  )
}

function AltaPendiente({
  cuenta,
  cargando,
  onContinuar,
  onComprobar,
  ownerId,
  onSalirAlta,
}: {
  cuenta: NonNullable<EstadoTarjetas['cuenta']>
  cargando: boolean
  onContinuar: () => void
  onComprobar: () => void
  ownerId: string
  onSalirAlta: () => void
}) {
  const restringida = cuenta.estado === 'restringida'
  // Alta hecha: Stripe ya no pide nada, solo falta que habilite la emisión de tarjetas
  const completa = !esDemo && cuenta.requisitos.length === 0 && !restringida
  const integrada = ALTA_INTEGRADA && !esDemo && !completa
  return (
    <Card className="p-5 sm:p-8">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-xl font-semibold tracking-tight">
          {completa ? 'Alta completada' : restringida ? 'Stripe necesita más datos' : 'Falta completar el alta'}
        </h2>
        <Badge tono={completa ? 'verde' : restringida ? 'rojo' : 'ambar'}>{completa ? 'En revisión' : restringida ? 'Restringida' : 'Pendiente'}</Badge>
      </div>
      {completa ? (
        <p className="mt-2 max-w-xl text-[15px] text-muted">
          Tu empresa ya está dada de alta en Stripe. Falta que Stripe habilite la emisión de tarjetas para NomoTax: en cuanto esté lista, aquí podrás crear tus tarjetas.
        </p>
      ) : (
        <p className="mt-2 max-w-xl text-[15px] text-muted">
          Para emitir tarjetas, Stripe tiene que verificar tu empresa y a su representante. Es un formulario corto y seguro de Stripe; tus datos no pasan por NomoTax.
        </p>
      )}
      {/* Con el alta integrada, el propio formulario de Stripe dice lo que falta */}
      {!integrada && cuenta.requisitos.length > 0 && (
        <ul className="mt-4 list-inside list-disc space-y-1 text-sm text-ink/80">
          {cuenta.requisitos.map((r) => (
            <li key={r}>{nombreRequisito(r)}</li>
          ))}
        </ul>
      )}
      {integrada && (
        <div className="mt-6">
          <Suspense fallback={<Loading />}>
            <AltaIntegrada ownerId={ownerId} onSalir={onSalirAlta} />
          </Suspense>
        </div>
      )}
      <div className={cx('mt-6 flex flex-wrap gap-2', (integrada || completa) && 'hidden')}>
        <Button loading={cargando} onClick={onContinuar}>
          {esDemo ? 'Completar el alta (simulado)' : 'Continuar el alta en Stripe'}
        </Button>
        {!esDemo && (
          <Button variant="secondary" onClick={onComprobar}>
            Ya lo he completado
          </Button>
        )}
      </div>
    </Card>
  )
}

/** Textos más claros para lo que pide Stripe (company.tax_id → «Identificador fiscal de la empresa»…) */
function nombreRequisito(r: string): string {
  const mapa: Record<string, string> = {
    'business_profile.url': 'Web de la empresa',
    'business_profile.mcc': 'Actividad de la empresa',
    'company.tax_id': 'NIF de la empresa',
    'company.name': 'Nombre de la empresa',
    'company.address.line1': 'Dirección de la empresa',
    'company.phone': 'Teléfono de la empresa',
    external_account: 'Cuenta bancaria',
    'representative.first_name': 'Nombre del representante',
    'representative.dob.day': 'Fecha de nacimiento del representante',
    'tos_acceptance.date': 'Aceptar las condiciones de Stripe',
  }
  return mapa[r] ?? r
}

/* ------------------------------------------------------------ Saldo */

function Saldo({ saldo, onIngresar }: { saldo: number; onIngresar: () => void }) {
  return (
    <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="text-[13px] font-medium text-muted">Saldo disponible para tus tarjetas</div>
        <div className="num mt-1 text-3xl font-semibold tracking-tight">{eur(saldo)}</div>
      </div>
      <Button variant="accent" icon={<Banknote className="size-4" />} onClick={onIngresar}>
        Ingresar dinero
      </Button>
    </Card>
  )
}

/* ------------------------------------------------------ Una tarjeta */

function TarjetaItem({
  t,
  movimientos,
  ocupado,
  onEstado,
  onCancelar,
  onConfigurar,
  onComprar,
}: {
  t: Tarjeta
  movimientos: Movimiento[]
  ocupado: boolean
  onEstado: (e: 'activa' | 'congelada') => void
  onCancelar: () => void
  onConfigurar: () => void
  onComprar: () => void
}) {
  const [ver, setVer] = useState(false)
  const gastado = gastadoEsteMes(t.id, movimientos)
  const pct = t.limite_mensual ? Math.min(100, (gastado / t.limite_mensual) * 100) : 0
  const demo = ver && esDemo ? datosDemo(t) : null
  return (
    <div className="flex flex-col gap-3">
      <TarjetaVisual titular={t.asignada_a || t.titular_nombre} alias={t.alias} ultimos4={t.ultimos4} exp_mes={t.exp_mes} exp_anio={t.exp_anio} estado={t.estado} tipo={t.tipo} numero={demo?.numero} cvv={demo?.cvv} />
      <div className="px-1">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate font-medium">{t.alias}</div>
            <div className="text-xs text-muted">
              {t.tipo === 'fisica' ? 'Física' : 'Virtual'} · creada el {fecha(t.created_at)}
            </div>
            <div className="mt-0.5 flex items-center gap-1 text-xs text-ink/80">
              <UserRound className="size-3.5" />
              {t.asignada_a ? t.asignada_a : 'Sin asignar (empresa)'}
            </div>
          </div>
          {esDemo && (
            <button className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink" onClick={() => setVer(!ver)}>
              {ver ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              {ver ? 'Ocultar' : 'Ver datos'}
            </button>
          )}
        </div>

        <div className="mt-3">
          <div className="flex justify-between text-xs text-muted">
            <span>Este mes: {eur(gastado)}</span>
            <span>{t.limite_mensual === null ? 'Sin límite al mes' : `Límite ${eur(t.limite_mensual)}/mes`}</span>
          </div>
          {t.limite_compra != null && <div className="mt-0.5 text-right text-xs text-muted">Máx. {eur(t.limite_compra)} por compra</div>}
          {t.limite_mensual !== null && (
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink/10">
              <div className={cx('h-full rounded-full', pct >= 90 ? 'bg-rojo' : 'bg-lima-dark')} style={{ width: `${pct}%` }} />
            </div>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {t.estado === 'activa' ? (
            <Button size="sm" variant="secondary" icon={<Pause className="size-3.5" />} loading={ocupado} onClick={() => onEstado('congelada')}>
              Congelar
            </Button>
          ) : (
            <Button size="sm" variant="secondary" icon={<Play className="size-3.5" />} loading={ocupado} onClick={() => onEstado('activa')}>
              Activar
            </Button>
          )}
          <Button size="sm" variant="secondary" icon={<SlidersHorizontal className="size-3.5" />} disabled={ocupado} onClick={onConfigurar}>
            Configurar
          </Button>
          {esDemo && (
            <Button size="sm" variant="secondary" icon={<ShoppingBag className="size-3.5" />} disabled={ocupado} onClick={onComprar}>
              Simular compra
            </Button>
          )}
          <Button size="sm" variant="danger" icon={<XCircle className="size-3.5" />} disabled={ocupado} onClick={onCancelar}>
            Cancelar
          </Button>
        </div>
      </div>
    </div>
  )
}

/* -------------------------------------------------------- Movimientos */

function Movimientos({ movimientos, tarjetas }: { movimientos: Movimiento[]; tarjetas: Tarjeta[] }) {
  const nombre = useMemo(() => new Map(tarjetas.map((t) => [t.id, `${t.alias} ···${t.ultimos4}`])), [tarjetas])
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold">Movimientos</h2>
      <Card>
        {movimientos.length === 0 ? (
          <Empty icon={<ArrowDownLeft className="size-5" />} title="Sin movimientos todavía" text="Aquí verás cada compra de tus tarjetas y cada ingreso." />
        ) : (
          <ul className="divide-y divide-line">
            {movimientos.map((m) => {
              const ingreso = m.importe < 0
              return (
                <li key={m.id} className="flex items-center gap-3 px-4 py-3">
                  <div className={cx('grid size-9 shrink-0 place-items-center rounded-full', ingreso ? 'bg-lima/50' : 'bg-ink/5')}>
                    {ingreso ? <ArrowDownLeft className="size-4" /> : <ShoppingBag className="size-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-medium">{m.comercio ?? 'Compra'}</div>
                    <div className="truncate text-xs text-muted">
                      {fecha(m.fecha)}
                      {m.tarjeta_id && nombre.get(m.tarjeta_id) ? ` · ${nombre.get(m.tarjeta_id)}` : ''}
                      {m.motivo ? ` · ${m.motivo}` : ''}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={cx('num text-[15px] font-medium', m.estado === 'rechazada' && 'text-muted line-through', ingreso && m.estado !== 'rechazada' && 'text-verde')}>
                      {ingreso ? '+' : '-'}
                      {eur(Math.abs(m.importe))}
                    </div>
                    {m.estado !== 'aprobada' && (
                      <Badge tono={m.estado === 'rechazada' ? 'rojo' : 'gris'}>{m.estado === 'rechazada' ? 'Rechazada' : m.estado === 'pendiente' ? 'Pendiente' : 'Reembolsada'}</Badge>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </section>
  )
}

/* ----------------------------------------------------------- Modales */

/** Para quién es la tarjeta y sus límites: lo comparten «Nueva tarjeta» y «Configurar» */
function CamposTarjeta({ c, setC, trabajadores }: { c: ConfigTarjeta; setC: (c: ConfigTarjeta) => void; trabajadores: Persona[] }) {
  // «otra» = una persona que no tiene ficha de trabajador (se escribe el nombre)
  const [otra, setOtra] = useState(Boolean(c.asignada_a && !c.trabajador_id))
  const valor = c.trabajador_id ?? (otra ? '__otra' : '')
  return (
    <>
      <Field label="Nombre de la tarjeta" hint="Para distinguirla: «Publicidad», «Viajes», «Software»…">
        <Input value={c.alias} maxLength={60} onChange={(e) => setC({ ...c, alias: e.target.value })} placeholder="Publicidad" />
      </Field>
      <Field label="¿Quién la usa?" hint={trabajadores.length ? 'Su nombre sale en la tarjeta y sus compras quedan a su nombre.' : 'Cuando des de alta trabajadores en Laboral, podrás elegirlos aquí.'}>
        <Select
          value={valor}
          onChange={(e) => {
            const v = e.target.value
            if (v === '') {
              setOtra(false)
              setC({ ...c, trabajador_id: null, asignada_a: null })
            } else if (v === '__otra') {
              setOtra(true)
              setC({ ...c, trabajador_id: null, asignada_a: '' })
            } else {
              setOtra(false)
              setC({ ...c, trabajador_id: v, asignada_a: trabajadores.find((t) => t.id === v)?.nombre ?? null })
            }
          }}
        >
          <option value="">La empresa (sin asignar)</option>
          {trabajadores.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nombre}
            </option>
          ))}
          <option value="__otra">Otra persona…</option>
        </Select>
      </Field>
      {otra && (
        <Field label="Nombre de la persona">
          <Input value={c.asignada_a ?? ''} maxLength={26} onChange={(e) => setC({ ...c, asignada_a: e.target.value })} placeholder="Nombre y apellido" />
        </Field>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Límite al mes (€)" hint="Vacío = sin límite.">
          <NumInput value={c.limite_mensual ?? 0} onValue={(n) => setC({ ...c, limite_mensual: n > 0 ? n : null })} />
        </Field>
        <Field label="Máximo por compra (€)" hint="Vacío = sin máximo.">
          <NumInput value={c.limite_compra ?? 0} onValue={(n) => setC({ ...c, limite_compra: n > 0 ? n : null })} />
        </Field>
      </div>
    </>
  )
}

/** Comprueba lo básico antes de mandar la tarjeta (nombre y, si es «otra persona», su nombre) */
function validar(c: ConfigTarjeta): string | null {
  if (!c.alias.trim()) return 'Ponle un nombre a la tarjeta'
  if (c.asignada_a !== null && !c.trabajador_id && !c.asignada_a.trim()) return 'Escribe el nombre de la persona'
  return null
}

const limpia = (c: ConfigTarjeta): ConfigTarjeta => ({ ...c, alias: c.alias.trim(), asignada_a: c.asignada_a?.trim() || null })

function NuevaTarjeta({
  titular,
  trabajadores,
  onClose,
  onCrear,
}: {
  titular: string
  trabajadores: Persona[]
  onClose: () => void
  onCrear: (d: ConfigTarjeta & { tipo: 'virtual' | 'fisica' }) => Promise<void>
}) {
  const [c, setC] = useState<ConfigTarjeta>({ alias: '', trabajador_id: null, asignada_a: null, limite_mensual: null, limite_compra: null })
  const [tipo, setTipo] = useState<'virtual' | 'fisica'>('virtual')
  const [trabajando, setTrabajando] = useState(false)

  async function crear() {
    const fallo = validar(c)
    if (fallo) return notify(fallo, 'error')
    setTrabajando(true)
    try {
      await onCrear({ ...limpia(c), tipo })
    } catch (e) {
      notify(await errorMessage(e), 'error')
      setTrabajando(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Nueva tarjeta"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={trabajando} onClick={crear}>
            Crear tarjeta
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid place-items-center">
          <TarjetaVisual titular={c.asignada_a || titular} alias={c.alias} ultimos4="0000" exp_mes={null} exp_anio={null} tipo={tipo} />
        </div>
        <CamposTarjeta c={c} setC={setC} trabajadores={trabajadores} />
        <Field label="Tipo" hint={tipo === 'fisica' ? 'La física llega por correo en unos días a la dirección de tu empresa.' : 'La virtual la tienes al instante.'}>
          <Select value={tipo} onChange={(e) => setTipo(e.target.value as 'virtual' | 'fisica')}>
            <option value="virtual">Virtual</option>
            <option value="fisica">Física</option>
          </Select>
        </Field>
      </div>
    </Modal>
  )
}

function ConfigurarTarjeta({
  t,
  titular,
  trabajadores,
  onClose,
  onGuardar,
}: {
  t: Tarjeta
  titular: string
  trabajadores: Persona[]
  onClose: () => void
  onGuardar: (c: ConfigTarjeta) => Promise<void>
}) {
  const [c, setC] = useState<ConfigTarjeta>({
    alias: t.alias,
    trabajador_id: t.trabajador_id ?? null,
    asignada_a: t.asignada_a ?? null,
    limite_mensual: t.limite_mensual,
    limite_compra: t.limite_compra ?? null,
  })
  const [trabajando, setTrabajando] = useState(false)
  return (
    <Modal
      open
      onClose={onClose}
      title={`Configurar «${t.alias}»`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            loading={trabajando}
            onClick={async () => {
              const fallo = validar(c)
              if (fallo) return notify(fallo, 'error')
              setTrabajando(true)
              try {
                await onGuardar(limpia(c))
              } catch (e) {
                notify(await errorMessage(e), 'error')
                setTrabajando(false)
              }
            }}
          >
            Guardar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid place-items-center">
          <TarjetaVisual titular={c.asignada_a || titular} alias={c.alias} ultimos4={t.ultimos4} exp_mes={t.exp_mes} exp_anio={t.exp_anio} tipo={t.tipo} estado={t.estado} />
        </div>
        <CamposTarjeta c={c} setC={setC} trabajadores={trabajadores} />
        {t.tipo === 'fisica' && <p className="text-xs text-muted">En una tarjeta física ya impresa, cambiar la persona no cambia el nombre grabado: para eso, cancélala y crea una nueva.</p>}
      </div>
    </Modal>
  )
}

function Ingreso({ ownerId, nombreEmpresa, onClose, onIngresado }: { ownerId: string; nombreEmpresa: string; onClose: () => void; onIngresado: () => Promise<void> }) {
  const [datos, setDatos] = useState<DatosIngreso | null>(null)
  const [fallo, setFallo] = useState<string | null>(null)
  const [importe, setImporte] = useState(500)
  const [trabajando, setTrabajando] = useState(false)

  useEffect(() => {
    datosIngreso(ownerId, nombreEmpresa)
      .then(setDatos)
      .catch(async (e) => setFallo(await errorMessage(e)))
  }, [ownerId, nombreEmpresa])

  const fila = (k: string, v?: string) =>
    v ? (
      <div className="flex justify-between gap-4 py-2 text-[15px]">
        <span className="text-muted">{k}</span>
        <span className="num select-all break-all text-right font-medium">{v}</span>
      </div>
    ) : null

  return (
    <Modal open onClose={onClose} title="Ingresar dinero">
      <p className="text-[15px] text-muted">Haz una transferencia desde el banco de tu empresa a esta cuenta. El saldo aparece en cuanto llega.</p>
      {fallo ? (
        <p className="mt-4 rounded-lg bg-rojo/10 px-3 py-2 text-sm text-rojo">{fallo}</p>
      ) : !datos ? (
        <Loading />
      ) : (
        <div className="mt-3 divide-y divide-line rounded-xl border border-line px-4">
          {fila('Titular', datos.titular)}
          {fila('IBAN', datos.iban)}
          {fila('BIC', datos.bic)}
          {fila('Banco', datos.banco)}
          {fila('Concepto', datos.referencia)}
        </div>
      )}
      {esDemo && (
        <div className="mt-5 rounded-xl bg-lima/30 p-4">
          <p className="mb-2 text-sm font-medium">Demostración: simular que ha llegado una transferencia</p>
          <div className="flex gap-2">
            <NumInput value={importe} onValue={setImporte} className="flex-1" />
            <Button
              loading={trabajando}
              onClick={async () => {
                if (importe <= 0) return
                setTrabajando(true)
                await ingresarDemo(ownerId, importe)
                await onIngresado()
                notify(`Ingreso de ${eur(importe)} recibido`)
                onClose()
              }}
            >
              Ingresar
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

function CompraDemo({ t, onClose, onComprar }: { t: Tarjeta; onClose: () => void; onComprar: (importe: number, comercio: string) => Promise<void> }) {
  const [importe, setImporte] = useState(25)
  const [comercio, setComercio] = useState('Google Ads')
  const [trabajando, setTrabajando] = useState(false)
  return (
    <Modal
      open
      onClose={onClose}
      title="Simular una compra"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            loading={trabajando}
            onClick={async () => {
              if (importe <= 0) return
              setTrabajando(true)
              await onComprar(importe, comercio.trim() || 'Comercio')
            }}
          >
            Pagar con la tarjeta
          </Button>
        </>
      }
    >
      <p className="mb-4 text-sm text-muted">
        Prueba cómo responde la tarjeta «{t.alias}»: se aprueba o se rechaza según su estado, su límite y el saldo, igual que en real.
      </p>
      <div className="space-y-4">
        <Field label="Comercio">
          <Input value={comercio} onChange={(e) => setComercio(e.target.value)} />
        </Field>
        <Field label="Importe (€)">
          <NumInput value={importe} onValue={setImporte} />
        </Field>
      </div>
    </Modal>
  )
}
