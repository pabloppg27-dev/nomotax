import { useEffect, useState, type ReactNode } from 'react'
import { ArrowUpRight, CalendarClock, Check, CheckCircle2, ChevronRight, FileText, Minus, Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { eur, fechaLarga } from '../lib/format'
import {
  COMPARATIVA,
  PLANES,
  cuotaCliente,
  importe,
  planPorId,
  proximoCobro,
  type Familia,
  type Periodo,
  type Plan,
  type PlanId,
  tarifaNomina,
} from '../lib/planes'
import { abrirDocumento, errorMessage, supabase } from '../lib/supabase'
import type { Profile } from '../lib/types'
import NumInput from './NumInput'
import { Button, Field, Input, Modal, Select, cx, notify } from './ui'

type PerfilPlan = Pick<Profile, 'id' | 'nombre' | 'email' | 'plan' | 'plan_periodo' | 'plan_proximo_cobro' | 'plan_precio' | 'plan_nominas' | 'plan_nomina_precio'>

const fechaCorta = (iso: string) =>
  new Date(iso + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }).replace('.', '')

/** Tarjeta «Tu plan» de la barra lateral (fondo oscuro). Al pulsar lleva a Configuración → Plan. */
export function PlanLateral({ perfil }: { perfil: PerfilPlan | null }) {
  const navigate = useNavigate()
  const cuota = perfil ? cuotaCliente(perfil) : null
  if (!perfil || !cuota) return null
  const cobro = proximoCobro(perfil)
  return (
    <>
      <button
        onClick={() => navigate('/configuracion/plan')}
        className="mb-3 flex w-full items-center gap-3 rounded-xl bg-white/5 px-3 py-2.5 text-left transition-colors hover:bg-white/10"
      >
        <Sparkles className="size-[18px] shrink-0 text-lima" />
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] uppercase tracking-wider text-white/50">Tu plan · {cuota.periodo}</span>
          <span className="block truncate text-[15px] font-medium text-white">{cuota.plan.nombre}</span>
          {cobro && <span className="block truncate text-xs text-white/50">Próximo cobro: {fechaCorta(cobro)}</span>}
        </span>
        <ChevronRight className="size-4 shrink-0 text-white/40" />
      </button>
    </>
  )
}

/** Tarjeta «Tu plan» para Mi perfil (fondo claro) */
export function PlanTarjeta({
  perfil,
  titulo = 'Tu plan',
  editable = false,
  onGuardado,
  conComparador = true,
}: {
  perfil: PerfilPlan
  titulo?: string
  editable?: boolean
  onGuardado?: () => Promise<void> | void
  /** Botón «Ver y comparar planes» (no hace falta en Configuración → Plan, que ya los muestra) */
  conComparador?: boolean
}) {
  const [abierto, setAbierto] = useState(false)
  const [editando, setEditando] = useState(false)
  const cuota = cuotaCliente(perfil)
  const cobro = proximoCobro(perfil)
  return (
    <>
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-lima">
          <Sparkles className="size-5 text-ink" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-wider text-muted">{titulo}</p>
          {cuota ? (
            <>
              <p className="text-lg font-semibold leading-tight">{cuota.plan.nombre}</p>
              <p className="num text-sm text-muted">
                {cuota.texto} + IVA{cuota.personalizado && editable ? ' · precio personalizado' : ''}
              </p>
            </>
          ) : (
            <p className="text-[15px] text-muted">Sin plan asignado</p>
          )}
        </div>
      </div>
      {cuota?.laboral && (
        <div className="mt-4 space-y-1.5 rounded-xl border border-line p-3 text-sm">
          <div className="flex justify-between gap-3">
            <span className="text-muted">Plan {cuota.plan.nombre}</span>
            <span className="num">{cuota.texto}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-muted">Laboral · {cuota.laboral.texto}</span>
            <span className="num">{importe(cuota.laboral.total)}/mes</span>
          </div>
          {cuota.totalMes !== null && (
            <div className="flex justify-between gap-3 border-t border-line pt-1.5 font-semibold">
              <span>Total</span>
              <span className="num">{importe(cuota.totalMes)}/mes + IVA</span>
            </div>
          )}
        </div>
      )}
      {cuota && (
        <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-paper p-3 text-sm">
          <div>
            <dt className="text-xs text-muted">Modalidad</dt>
            <dd className="font-medium">{cuota.periodo === 'anual' ? 'Pago anual' : 'Pago mensual'}</dd>
          </div>
          <div>
            <dt className="flex items-center gap-1 text-xs text-muted">
              <CalendarClock className="size-3.5" /> Próximo cobro
            </dt>
            <dd className="font-medium">{cobro ? fechaLarga(cobro) : '—'}</dd>
          </div>
        </dl>
      )}
      {cuota && <p className="mt-3 text-sm text-muted">{cuota.plan.desc}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        {conComparador && (
          <Button variant="secondary" size="sm" onClick={() => setAbierto(true)}>
            Ver y comparar planes
          </Button>
        )}
        {editable && (
          <Button size="sm" onClick={() => setEditando(true)}>
            Editar plan y cobro
          </Button>
        )}
      </div>
      <ComparadorPlanes open={abierto} onClose={() => setAbierto(false)} planId={cuota?.plan.id ?? null} tuPrecio={cuota?.texto} />
      {editable && (
        <EditorPlan perfil={editando ? perfil : null} onClose={() => setEditando(false)} onGuardado={onGuardado ?? (() => {})} />
      )}
    </>
  )
}

/** Solo el asesor: plan, modalidad, próximo cobro y precio personalizado de un cliente */
export function EditorPlan({
  perfil,
  onClose,
  onGuardado,
}: {
  perfil: PerfilPlan | null
  onClose: () => void
  onGuardado: () => Promise<void> | void
}) {
  const [plan, setPlan] = useState('')
  const [periodo, setPeriodo] = useState<Periodo>('mensual')
  const [cobro, setCobro] = useState('')
  const [personalizado, setPersonalizado] = useState(false)
  const [precio, setPrecio] = useState(0)
  const [nominas, setNominas] = useState(0)
  const [nominaPers, setNominaPers] = useState(false)
  const [nominaPrecio, setNominaPrecio] = useState(0)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (!perfil) return
    setPlan(perfil.plan ?? '')
    setPeriodo(perfil.plan_periodo === 'anual' ? 'anual' : 'mensual')
    setCobro(perfil.plan_proximo_cobro ?? '')
    const p = perfil.plan_precio
    setPersonalizado(p !== null && p !== undefined)
    setPrecio(p !== null && p !== undefined ? Number(p) : 0)
    setNominas(Number(perfil.plan_nominas ?? 0))
    const np = perfil.plan_nomina_precio
    setNominaPers(np !== null && np !== undefined)
    setNominaPrecio(np !== null && np !== undefined ? Number(np) : 0)
  }, [perfil])


  const elegido = planPorId(plan)
  const tarifa = elegido ? (periodo === 'anual' ? elegido.precio * 12 : elegido.precio) : null
  const unidad = periodo === 'anual' ? '€/año' : '€/mes'
  const n = Math.max(0, Math.floor(nominas))
  const precioNomina = nominaPers ? nominaPrecio : tarifaNomina(n)
  const totalLaboral = n * precioNomina
  const base = personalizado ? precio : (tarifa ?? 0)

  const guardar = async () => {
    if (!perfil) return
    setGuardando(true)
    const { error } = await supabase
      .from('profiles')
      .update({
        plan: plan || null,
        plan_periodo: periodo,
        plan_proximo_cobro: plan && cobro ? cobro : null,
        plan_precio: plan && personalizado ? precio : null,
        plan_nominas: plan ? n : 0,
        plan_nomina_precio: plan && n && nominaPers ? nominaPrecio : null,
      })
      .eq('id', perfil.id)
    setGuardando(false)
    if (error) return notify(await errorMessage(error), 'error')
    await onGuardado()
    notify('Plan guardado')
    onClose()
  }

  return (
    <Modal
      open={!!perfil}
      onClose={onClose}
      title={`Plan de ${perfil?.nombre || perfil?.email || 'cliente'}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={guardar} loading={guardando}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Plan">
          <Select value={plan} onChange={(e) => setPlan(e.target.value)}>
            <OpcionesPlan />
          </Select>
        </Field>
        {plan && (
          <>
            <Field label="Modalidad de pago">
              <div className="inline-flex rounded-full bg-paper p-1">
                {(['mensual', 'anual'] as Periodo[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPeriodo(p)}
                    className={cx(
                      'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
                      periodo === p ? 'bg-ink text-white' : 'text-ink/70 hover:bg-ink/5',
                    )}
                  >
                    {p === 'mensual' ? 'Mensual' : 'Anual'}
                  </button>
                ))}
              </div>
            </Field>
            <Field
              label="Próximo cobro"
              hint="Cuando pase esta fecha, el cliente verá automáticamente la siguiente (un mes o un año después)."
            >
              <Input type="date" value={cobro} onChange={(e) => setCobro(e.target.value)} />
            </Field>
            <div className="rounded-xl border border-line p-3">
              <label className="flex items-center gap-2.5 text-[15px]">
                <input
                  type="checkbox"
                  className="size-4 accent-ink"
                  checked={personalizado}
                  onChange={(e) => {
                    setPersonalizado(e.target.checked)
                    if (e.target.checked && !precio && tarifa) setPrecio(tarifa)
                  }}
                />
                Precio personalizado
              </label>
              {personalizado ? (
                <div className="mt-3 flex items-center gap-2">
                  <NumInput value={precio} onValue={setPrecio} className="w-32" />
                  <span className="text-sm text-muted">{unidad} sin IVA</span>
                </div>
              ) : (
                <p className="mt-1 text-sm text-muted">
                  Precio de tarifa: {tarifa !== null ? `${elegido?.desde ? 'desde ' : ''}${importe(tarifa)}${unidad.replace('€', '')}` : '—'} sin IVA
                </p>
              )}
            </div>

            <div className="rounded-xl border border-line p-3">
              <p className="text-[15px] font-medium">Laboral</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <NumInput value={nominas} onValue={(v) => setNominas(Math.max(0, Math.floor(v)))} inputMode="numeric" className="w-20" />
                <span className="text-sm text-muted">nóminas al mes</span>
              </div>
              {n > 0 && (
                <>
                  <label className="mt-3 flex items-center gap-2.5 text-[15px]">
                    <input
                      type="checkbox"
                      className="size-4 accent-ink"
                      checked={nominaPers}
                      onChange={(e) => {
                        setNominaPers(e.target.checked)
                        if (e.target.checked && !nominaPrecio) setNominaPrecio(tarifaNomina(n))
                      }}
                    />
                    Precio personalizado por nómina
                  </label>
                  {nominaPers ? (
                    <div className="mt-2 flex items-center gap-2">
                      <NumInput value={nominaPrecio} onValue={setNominaPrecio} className="w-24" />
                      <span className="text-sm text-muted">€ por nómina y mes sin IVA</span>
                    </div>
                  ) : (
                    <p className="mt-1 text-sm text-muted">Tarifa: {importe(tarifaNomina(n))} por nómina (1 → 25€ · 2–9 → 18€ · 10+ → 12€)</p>
                  )}
                  <p className="num mt-2 text-sm">
                    Laboral: {n} × {importe(precioNomina)} = <strong>{importe(totalLaboral)}/mes</strong>
                  </p>
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl bg-paper px-3 py-2.5 text-[15px]">
              <span>Total que paga</span>
              <span className="num font-semibold">
                {periodo === 'mensual'
                  ? `${importe(base + totalLaboral)}/mes`
                  : `${importe(base)}/año${totalLaboral ? ` + ${importe(totalLaboral)}/mes` : ''}`}{' '}
                <span className="font-normal text-muted">+ IVA</span>
              </span>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}

export function OpcionesPlan() {
  return (
    <>
      <option value="">Sin plan</option>
      <optgroup label="Sociedades">
        {PLANES.filter((p) => p.familia === 'empresa').map((p) => (
          <option key={p.id} value={p.id}>
            {p.nombre}
          </option>
        ))}
      </optgroup>
      <optgroup label="Autónomos">
        {PLANES.filter((p) => p.familia === 'autonomo').map((p) => (
          <option key={p.id} value={p.id}>
            {p.nombre}
          </option>
        ))}
      </optgroup>
    </>
  )
}

/** Comparador de planes con el plan actual resaltado, en una ventana */
export function ComparadorPlanes({
  open,
  onClose,
  planId,
  tuPrecio,
}: {
  open: boolean
  onClose: () => void
  planId: string | null
  tuPrecio?: string
}) {
  return (
    <Modal open={open} onClose={onClose} title="Planes de NomoTax" wide>
      <TablaPlanes planId={planId} tuPrecio={tuPrecio} />
    </Modal>
  )
}

/** Todos los planes (sociedades y autónomos), la comparativa y el botón de solicitar cambio */
export function TablaPlanes({ planId, tuPrecio }: { planId: string | null; tuPrecio?: string }) {
  const { isAdvisor, rol } = useAuth()
  const actual = planPorId(planId)
  const [familia, setFamilia] = useState<Familia>(actual?.familia ?? 'empresa')
  const [enviando, setEnviando] = useState<PlanId | null>(null)
  const [solicitado, setSolicitado] = useState<PlanId | null>(null)
  const planes = PLANES.filter((p) => p.familia === familia)
  // El asesor ve el comparador del cliente, pero no envía solicitudes en su nombre.
  // La solicitud sale a nombre de quien la hace: solo el titular de la cuenta
  const puedeSolicitar = rol === 'titular'

  const solicitar = async (p: Plan) => {
    setEnviando(p.id)
    const { error } = await supabase.functions.invoke('solicitar-plan', { body: { plan: p.id } })
    setEnviando(null)
    if (error) return notify(await errorMessage(error), 'error')
    setSolicitado(p.id)
    notify(`Solicitud enviada: ${p.nombre}`)
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-full bg-paper p-1">
          {(['empresa', 'autonomo'] as Familia[]).map((f) => (
            <button
              key={f}
              onClick={() => setFamilia(f)}
              className={cx(
                'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
                familia === f ? 'bg-ink text-white' : 'text-ink/70 hover:bg-ink/5',
              )}
            >
              {f === 'empresa' ? 'Sociedades' : 'Autónomos'}
            </button>
          ))}
        </div>
        {solicitado ? (
          <p className="flex items-center gap-2 text-sm text-verde">
            <CheckCircle2 className="size-4 shrink-0" />
            Hemos recibido tu solicitud de {planPorId(solicitado)?.nombre}. Tu asesor te confirmará el cambio en breve.
          </p>
        ) : (
          <p className="text-sm text-muted">
            {puedeSolicitar
              ? 'Elige un plan y pulsa «Solicitar»: tu asesor te confirmará el cambio.'
              : isAdvisor
                ? 'El cliente puede solicitar el cambio desde aquí.'
                : 'El cambio de plan lo solicita el titular de la cuenta.'}
          </p>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {planes.map((p) => (
          <TarjetaPlan
            key={p.id}
            plan={p}
            actual={p.id === actual?.id}
            tuPrecio={p.id === actual?.id ? tuPrecio : undefined}
            accion={
              puedeSolicitar && p.id !== actual?.id ? (
                solicitado === p.id ? (
                  <span className="inline-flex h-8 items-center gap-1.5 text-sm font-medium text-verde">
                    <CheckCircle2 className="size-4" /> Solicitado
                  </span>
                ) : (
                  <Button
                    size="sm"
                    variant={actual && p.familia === actual.familia && p.precio > actual.precio ? 'primary' : 'secondary'}
                    icon={<ArrowUpRight className="size-4" />}
                    loading={enviando === p.id}
                    disabled={!!enviando || !!solicitado}
                    onClick={() => solicitar(p)}
                  >
                    {actual && p.familia === actual.familia && p.precio > actual.precio ? 'Solicitar upgrade' : 'Solicitar este plan'}
                  </Button>
                )
              ) : null
            }
          />
        ))}
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead>
            <tr className="border-b border-line">
              <th className="py-2.5 pr-3 font-medium text-muted" />
              {planes.map((p) => (
                <th key={p.id} className={cx('px-3 py-2.5 text-center font-semibold', p.id === actual?.id && 'rounded-t-xl bg-lima/40')}>
                  {p.nombre}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {COMPARATIVA[familia].map(({ fila, valores }) => (
              <tr key={fila} className="border-b border-line last:border-0">
                <td className="py-2.5 pr-3">{fila}</td>
                {valores.map((v, i) => (
                  <td key={i} className={cx('px-3 py-2.5 text-center', planes[i].id === actual?.id && 'bg-lima/40 font-medium')}>
                    {v === true ? (
                      <Check className="mx-auto size-4" />
                    ) : v === false ? (
                      <Minus className="mx-auto size-4 text-muted/60" />
                    ) : (
                      v
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-xs text-muted">Precios sin IVA.</p>
    </div>
  )
}

function TarjetaPlan({ plan, actual, tuPrecio, accion }: { plan: Plan; actual: boolean; tuPrecio?: string; accion?: ReactNode }) {
  return (
    <div className={cx('relative flex flex-col rounded-2xl border p-4', actual ? 'border-ink bg-lima/30' : 'border-line')}>
      {actual && (
        <span className="absolute -top-2.5 left-4 rounded-full bg-ink px-2.5 py-0.5 text-[11px] font-medium text-white">Tu plan</span>
      )}
      <p className="font-semibold">{plan.nombre}</p>
      <p className="mt-1">
        {plan.desde && <span className="text-sm text-muted">Desde </span>}
        <span className="num text-2xl font-semibold">{plan.precio}€</span>
        <span className="text-sm text-muted">/mes</span>
      </p>
      {tuPrecio && <p className="num mt-1 text-sm font-medium">Tu precio: {tuPrecio}</p>}
      <p className="mt-2 flex-1 text-sm text-muted">{plan.desc}</p>
      {accion && <div className="mt-4">{accion}</div>}
    </div>
  )
}

type Cobro = {
  id: string
  periodo: string
  enviada_at: string | null
  email: string | null
  expense: { numero: string | null; fecha: string | null; total: number; concepto: string | null; file_path: string | null } | null
}

/** Facturas que NomoTax ha emitido a este cliente (Configuración → Facturación) */
export function HistorialFacturacion({ perfil }: { perfil: PerfilPlan }) {
  const [cobros, setCobros] = useState<Cobro[] | null>(null)
  const cuota = cuotaCliente(perfil)
  const cobro = proximoCobro(perfil)

  useEffect(() => {
    supabase
      .from('facturas_plan')
      .select('id, periodo, enviada_at, email, expense:expenses(numero, fecha, total, concepto, file_path)')
      .eq('cliente_id', perfil.id)
      .order('periodo', { ascending: false })
      .then(({ data, error }) => setCobros(error ? [] : ((data ?? []) as unknown as Cobro[])))
  }, [perfil.id])

  const total = (cobros ?? []).reduce((s, c) => s + Number(c.expense?.total ?? 0), 0)

  return (
    <div>
      {cuota && cobro && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl bg-lima/30 px-3 py-2.5 text-sm">
          <span className="flex items-center gap-1.5">
            <CalendarClock className="size-4" /> Próximo cobro: <strong>{fechaLarga(cobro)}</strong>
          </span>
          {cuota.totalMes !== null && <span className="num">{importe(cuota.totalMes)} + IVA</span>}
        </div>
      )}
      {cobros === null ? (
        <p className="py-6 text-center text-sm text-muted">Cargando…</p>
      ) : cobros.length === 0 ? (
        <div className="py-8 text-center">
          <FileText className="mx-auto size-8 text-muted/50" />
          <p className="mt-2 text-[15px] font-medium">Aún no hay facturas</p>
          <p className="text-sm text-muted">Cada mes, el día de cobro, te enviaremos la factura por email y aparecerá aquí.</p>
        </div>
      ) : (
        <>
          <ul className="divide-y divide-line">
            {cobros.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">
                    {c.expense?.numero ?? 'Factura'} · {fechaLarga(c.expense?.fecha ?? c.periodo)}
                  </span>
                  <span className="block truncate text-sm text-muted">{c.expense?.concepto ?? ''}</span>
                  <span className={cx('block text-xs', c.enviada_at ? 'text-verde' : 'text-muted')}>
                    {c.enviada_at ? `Enviada a ${c.email}` : 'Disponible aquí (no se pudo enviar por email)'}
                  </span>
                </span>
                <span className="num font-semibold">{eur(Number(c.expense?.total ?? 0))}</span>
                {c.expense?.file_path && (
                  <Button variant="secondary" size="sm" icon={<FileText className="size-4" />} onClick={() => abrirDocumento(c.expense!.file_path!)}>
                    PDF
                  </Button>
                )}
              </li>
            ))}
          </ul>
          <p className="num mt-3 border-t border-line pt-3 text-right text-sm text-muted">
            {cobros.length} {cobros.length === 1 ? 'factura' : 'facturas'} · total facturado <strong className="text-ink">{eur(total)}</strong>
          </p>
        </>
      )}
    </div>
  )
}
