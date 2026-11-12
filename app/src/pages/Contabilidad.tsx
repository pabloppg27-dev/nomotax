import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Plus, Search, Trash2 } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { errorMessage, supabase } from '../lib/supabase'
import { eur, fecha, rangoPeriodo, trimestreActual, type Periodo } from '../lib/format'
import {
  CUENTAS,
  TIPOS_INMOVILIZADO,
  balanceSituacion,
  cuadroAmortizacion,
  entre,
  generarAsientos,
  libroMayor,
  nombreCuenta,
  perdidasYGanancias,
  sumasYSaldos,
  type Apunte,
  type AsientoManual,
  type DatosContables,
  type LineaInforme,
} from '../lib/contabilidad.ts'
import { XLSX, cargarDatosContables, descargar } from '../lib/datosContables.ts'
import NumInput from '../components/NumInput'
import PeriodPicker from '../components/PeriodPicker'
import { Badge, Button, Card, Empty, Field, Input, Loading, Modal, Select, confirmar, cx, notify } from '../components/ui'

type Vista = 'resumen' | 'diario' | 'mayor' | 'sumas' | 'pyg' | 'balance' | 'inmovilizado' | 'manuales'

const VISTAS: { id: Vista; label: string }[] = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'diario', label: 'Libro diario' },
  { id: 'mayor', label: 'Libro mayor' },
  { id: 'sumas', label: 'Sumas y saldos' },
  { id: 'pyg', label: 'Pérdidas y ganancias' },
  { id: 'balance', label: 'Balance' },
  { id: 'inmovilizado', label: 'Inmovilizado' },
  { id: 'manuales', label: 'Apertura y asientos manuales' },
]

export default function Contabilidad() {
  const { ownerId, owner, isAdvisor } = useAuth()
  const navigate = useNavigate()
  const [datos, setDatos] = useState<DatosContables | null>(null)
  const [periodo, setPeriodo] = useState<Periodo>({ anio: trimestreActual().anio, trimestre: 0 })
  const [vista, setVista] = useState<Vista>('resumen')
  const [exportando, setExportando] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    if (!ownerId) return
    setDatos(await cargarDatosContables(ownerId))
  }, [ownerId])

  useEffect(() => {
    cargar()
  }, [cargar])

  // En directo: cualquier cambio en facturas, gastos, nóminas, asientos o inmovilizado recalcula todo
  useEffect(() => {
    if (!ownerId) return
    let t: ReturnType<typeof setTimeout> | undefined
    const canal = supabase.channel(`conta-${ownerId}`)
    for (const tabla of ['invoices', 'expenses', 'nominas', 'asientos_manuales', 'inmovilizados'])
      canal.on('postgres_changes', { event: '*', schema: 'public', table: tabla, filter: `owner_id=eq.${ownerId}` }, () => {
        clearTimeout(t)
        t = setTimeout(cargar, 400)
      })
    canal.subscribe()
    return () => {
      clearTimeout(t)
      supabase.removeChannel(canal)
    }
  }, [ownerId, cargar])

  // Al volver a la pestaña, se recalcula (por si hay documentos nuevos)
  useEffect(() => {
    const f = () => document.visibilityState === 'visible' && cargar()
    document.addEventListener('visibilitychange', f)
    return () => document.removeEventListener('visibilitychange', f)
  }, [cargar])

  const { desde, hasta } = rangoPeriodo(periodo)
  const calc = useMemo(() => {
    if (!datos) return null
    const { asientos, nombres } = generarAsientos({ ...datos, hasta })
    const delPeriodo = entre(asientos, desde, hasta)
    const delEjercicio = entre(asientos, `${periodo.anio}-01-01`, hasta)
    return { asientos, nombres, delPeriodo, delEjercicio }
  }, [datos, desde, hasta, periodo.anio])

  if (!ownerId || !owner) return <Loading />

  const exportar = async (formato: 'excel' | 'a3' | 'sage' | 'holded') => {
    if (!calc || !datos) return
    setExportando(formato)
    try {
      const ex = await import('../lib/exportar.ts')
      const cliente = owner.nombre || 'Cliente'
      const sufijo = periodo.trimestre ? `${periodo.anio}-${periodo.trimestre}T` : `${periodo.anio}`
      if (formato === 'excel') {
        const buf = await ex.libroExcel({ cliente, ejercicio: periodo.anio, desde, hasta, asientos: calc.asientos, nombres: calc.nombres, inmovilizados: datos.inmovilizados })
        descargar(buf, `${cliente} - Contabilidad ${sufijo}.xlsx`, XLSX)
      } else if (formato === 'sage') {
        descargar(ex.asientosSage(calc.delPeriodo, calc.nombres), `${cliente} - Asientos Sage ${sufijo}.csv`, 'text/csv;charset=utf-8')
      } else if (formato === 'a3') {
        descargar(await ex.asientosA3(calc.delPeriodo, calc.nombres), `${cliente} - Asientos A3 ${sufijo}.xlsx`, XLSX)
      } else {
        descargar(await ex.asientosHolded(calc.delPeriodo, calc.nombres), `${cliente} - Asientos Holded ${sufijo}.xlsx`, XLSX)
      }
    } catch (e) {
      notify(`No se ha podido exportar: ${(e as Error).message}`, 'error')
    }
    setExportando(null)
  }

  const porRevisar = (datos?.gastos ?? []).filter((g) => g.revision === 'pendiente').length

  return (
    <>
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">Contabilidad</h1>
          <p className="mt-1 text-[15px] text-muted">Se calcula sola con tus facturas, gastos y nóminas. Siempre al día.</p>
        </div>
        <PeriodPicker value={periodo} onChange={setPeriodo} />
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        <Button variant="accent" icon={<FileSpreadsheet className="size-4" />} loading={exportando === 'excel'} onClick={() => exportar('excel')}>
          Descargar Excel
        </Button>
        {(['a3', 'sage', 'holded'] as const).map((f) => (
          <Button key={f} variant="secondary" size="md" icon={<Download className="size-4" />} loading={exportando === f} onClick={() => exportar(f)}>
            {f === 'a3' ? 'A3' : f === 'sage' ? 'Sage' : 'Holded'}
          </Button>
        ))}
      </div>

      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-line">
        {VISTAS.map((v) => (
          <button
            key={v.id}
            onClick={() => setVista(v.id)}
            className={cx(
              '-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-[15px] transition-colors',
              vista === v.id ? 'border-ink font-medium text-ink' : 'border-transparent text-muted hover:text-ink',
            )}
          >
            {v.label}
          </button>
        ))}
      </div>

      {!calc || !datos ? (
        <Loading />
      ) : (
        <>
          {porRevisar > 0 && (
            <button
              onClick={() => navigate('/gastos')}
              className="mb-5 flex w-full items-center gap-2 rounded-xl bg-ambar/10 px-4 py-3 text-left text-sm text-ambar"
            >
              <AlertTriangle className="size-4 shrink-0" />
              {porRevisar} gasto{porRevisar > 1 ? 's parecen' : ' parece'} una inversión (posible amortización) y {porRevisar > 1 ? 'están' : 'está'} pendiente
              {porRevisar > 1 ? 's' : ''} de revisión por el asesor.
            </button>
          )}
          {vista === 'resumen' && <Resumen calc={calc} />}
          {vista === 'diario' && <Diario calc={calc} />}
          {vista === 'mayor' && <Mayor calc={calc} />}
          {vista === 'sumas' && <Sumas calc={calc} />}
          {vista === 'pyg' && <Informe lineas={perdidasYGanancias(calc.delPeriodo).lineas} titulo="Cuenta de pérdidas y ganancias" sub={`Del ${fecha(desde)} al ${fecha(hasta)} · modelo PYMES`} />}
          {vista === 'balance' && <Balance calc={calc} hasta={hasta} />}
          {vista === 'inmovilizado' && <InmovilizadoVista datos={datos} hasta={hasta} />}
          {vista === 'manuales' && <Manuales datos={datos} ownerId={ownerId} editable={isAdvisor} anio={periodo.anio} onChanged={cargar} />}
        </>
      )}
    </>
  )
}

type Calc = {
  asientos: ReturnType<typeof generarAsientos>['asientos']
  nombres: Record<string, string>
  delPeriodo: ReturnType<typeof generarAsientos>['asientos']
  delEjercicio: ReturnType<typeof generarAsientos>['asientos']
}

function Cifra({ label, valor, nota, tono }: { label: string; valor: number; nota?: ReactNode; tono?: 'ok' | 'mal' }) {
  return (
    <Card className="p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className={cx('num mt-1 text-xl font-semibold', tono === 'mal' && 'text-rojo')}>{eur(valor)}</p>
      {nota && <p className="mt-1 text-xs text-muted">{nota}</p>}
    </Card>
  )
}

function saldoDe(asientos: Calc['asientos'], prefijo: string) {
  let s = 0
  for (const a of asientos) for (const p of a.apuntes) if (p.cuenta.startsWith(prefijo)) s += p.debe - p.haber
  return Math.round(s * 100) / 100
}

function Resumen({ calc }: { calc: Calc }) {
  const pyg = perdidasYGanancias(calc.delPeriodo)
  const bal = balanceSituacion(calc.delEjercicio)
  const ss = sumasYSaldos(calc.delPeriodo, calc.nombres)
  const ingresos = pyg.lineas.find((l) => l.codigo === '1')?.importe ?? 0
  const gastos = pyg.lineas.filter((l) => ['4', '6', '7', '8'].includes(l.codigo)).reduce((s, l) => s + l.importe, 0)
  const iva = -(saldoDe(calc.delPeriodo, '477') + saldoDe(calc.delPeriodo, '472'))
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <Estado ok={ss.cuadra} texto={ss.cuadra ? 'Sumas y saldos cuadran (debe = haber)' : 'Sumas y saldos no cuadran'} />
        <Estado
          ok={Math.abs(bal.diferencia) < 0.01}
          texto={Math.abs(bal.diferencia) < 0.01 ? 'El balance cuadra (activo = pasivo)' : `El balance no cuadra por ${eur(bal.diferencia)}: falta la apertura`}
        />
        <Badge tono="gris">{calc.delPeriodo.length} asientos en el periodo</Badge>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Cifra label="Resultado del periodo" valor={pyg.resultado} tono={pyg.resultado < 0 ? 'mal' : 'ok'} />
        <Cifra label="Ingresos (cifra de negocios)" valor={ingresos} />
        <Cifra label="Gastos de explotación" valor={gastos} />
        <Cifra label="Bancos (saldo a fin de periodo)" valor={saldoDe(calc.delEjercicio, '57')} nota="Con la apertura y los cobros y pagos registrados" />
        <Cifra label="Clientes pendientes de cobro" valor={saldoDe(calc.delEjercicio, '43')} />
        <Cifra label="IVA del periodo (repercutido − soportado)" valor={iva} nota={iva >= 0 ? 'A ingresar' : 'A compensar'} />
      </div>
    </div>
  )
}

function Estado({ ok, texto }: { ok: boolean; texto: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm', ok ? 'bg-verde/10 text-verde' : 'bg-ambar/10 text-ambar')}>
      {ok ? <CheckCircle2 className="size-4" /> : <AlertTriangle className="size-4" />}
      {texto}
    </span>
  )
}

function Buscador({ q, setQ, placeholder }: { q: string; setQ: (s: string) => void; placeholder: string }) {
  return (
    <div className="relative mb-4 max-w-sm">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} className="!h-9 pl-9 !text-sm" />
    </div>
  )
}

function Diario({ calc }: { calc: Calc }) {
  const [q, setQ] = useState('')
  const t = q.trim().toLowerCase()
  const lista = calc.delPeriodo.filter((a) => !t || a.concepto.toLowerCase().includes(t) || a.apuntes.some((p) => p.cuenta.startsWith(t)))
  if (!calc.delPeriodo.length) return <Card><Empty title="No hay asientos en este periodo" /></Card>
  return (
    <>
      <Buscador q={q} setQ={setQ} placeholder="Buscar por concepto o cuenta" />
      <Card className="overflow-x-auto">
        <table className="num w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-line bg-paper text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-3 py-2.5 font-medium">Nº</th>
              <th className="px-3 py-2.5 font-medium">Fecha</th>
              <th className="px-3 py-2.5 font-medium">Cuenta</th>
              <th className="px-3 py-2.5 font-medium">Concepto / nombre de la cuenta</th>
              <th className="px-3 py-2.5 text-right font-medium">Debe</th>
              <th className="px-3 py-2.5 text-right font-medium">Haber</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((a) => (
              <FilasAsiento key={`${a.fecha}-${a.n}`} a={a} nombres={calc.nombres} />
            ))}
          </tbody>
        </table>
      </Card>
    </>
  )
}

function FilasAsiento({ a, nombres }: { a: Calc['asientos'][number]; nombres: Record<string, string> }) {
  return (
    <>
      <tr className="border-t border-line bg-paper/60">
        <td className="px-3 pb-1 pt-3 font-semibold">{a.n}</td>
        <td className="px-3 pb-1 pt-3">{fecha(a.fecha)}</td>
        <td />
        <td className="px-3 pb-1 pt-3 font-medium" colSpan={3}>
          {a.concepto}
        </td>
      </tr>
      {a.apuntes.map((p, i) => (
        <tr key={i}>
          <td />
          <td />
          <td className="px-3 py-1 text-ink/80">{p.cuenta}</td>
          <td className={cx('px-3 py-1 text-ink/70', p.haber > 0 && !p.debe && 'pl-8')}>{nombreCuenta(p.cuenta, nombres)}</td>
          <td className="px-3 py-1 text-right">{p.debe ? eur(p.debe) : ''}</td>
          <td className="px-3 py-1 text-right">{p.haber ? eur(p.haber) : ''}</td>
        </tr>
      ))}
    </>
  )
}

function Mayor({ calc }: { calc: Calc }) {
  const cuentas = sumasYSaldos(calc.delPeriodo, calc.nombres).lineas
  const [cuenta, setCuenta] = useState(cuentas[0]?.cuenta ?? '')
  const lineas = cuenta ? libroMayor(calc.delPeriodo, cuenta) : []
  if (!cuentas.length) return <Card><Empty title="No hay movimientos en este periodo" /></Card>
  const tot = lineas.reduce((s, l) => ({ d: s.d + l.debe, h: s.h + l.haber }), { d: 0, h: 0 })
  return (
    <>
      <Field label="Cuenta" className="mb-4 max-w-xl">
        <Select value={cuenta} onChange={(e) => setCuenta(e.target.value)}>
          {cuentas.map((c) => (
            <option key={c.cuenta} value={c.cuenta}>
              {c.cuenta} · {c.nombre}
            </option>
          ))}
        </Select>
      </Field>
      <Card className="overflow-x-auto">
        <table className="num w-full min-w-[680px] text-left text-sm">
          <thead className="border-b border-line bg-paper text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-3 py-2.5 font-medium">Fecha</th>
              <th className="px-3 py-2.5 font-medium">Nº</th>
              <th className="px-3 py-2.5 font-medium">Concepto</th>
              <th className="px-3 py-2.5 text-right font-medium">Debe</th>
              <th className="px-3 py-2.5 text-right font-medium">Haber</th>
              <th className="px-3 py-2.5 text-right font-medium">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {lineas.map((l, i) => (
              <tr key={i} className="border-b border-line last:border-0">
                <td className="px-3 py-2">{fecha(l.fecha)}</td>
                <td className="px-3 py-2 text-muted">{l.n}</td>
                <td className="px-3 py-2">{l.concepto}</td>
                <td className="px-3 py-2 text-right">{l.debe ? eur(l.debe) : ''}</td>
                <td className="px-3 py-2 text-right">{l.haber ? eur(l.haber) : ''}</td>
                <td className="px-3 py-2 text-right font-medium">{eur(l.saldo)}</td>
              </tr>
            ))}
            <tr className="bg-lima/30 font-semibold">
              <td className="px-3 py-2.5" colSpan={3}>
                Total {cuenta}
              </td>
              <td className="px-3 py-2.5 text-right">{eur(tot.d)}</td>
              <td className="px-3 py-2.5 text-right">{eur(tot.h)}</td>
              <td className="px-3 py-2.5 text-right">{eur(tot.d - tot.h)}</td>
            </tr>
          </tbody>
        </table>
      </Card>
    </>
  )
}

function Sumas({ calc }: { calc: Calc }) {
  const [nivel, setNivel] = useState<1 | 3 | 4 | 8>(8)
  const [soloSaldo, setSoloSaldo] = useState(false)
  const [q, setQ] = useState('')
  const ss = sumasYSaldos(calc.delPeriodo, calc.nombres, nivel)
  const grupos = nivel === 1 ? [] : sumasYSaldos(calc.delPeriodo, calc.nombres, 1).lineas
  const t = q.trim().toLowerCase()
  const filtrar = (l: (typeof ss.lineas)[number]) =>
    (!soloSaldo || l.saldoDeudor || l.saldoAcreedor) && (!t || l.cuenta.startsWith(t) || l.nombre.toLowerCase().includes(t))
  if (!ss.lineas.length) return <Card><Empty title="No hay movimientos en este periodo" /></Card>

  const fila = (l: (typeof ss.lineas)[number], grupo = false) => (
    <tr key={(grupo ? 'g' : '') + l.cuenta} className={cx('border-b border-line', grupo && 'bg-paper font-semibold')}>
      <td className="px-3 py-2">{l.cuenta}</td>
      <td className="px-3 py-2">{grupo ? `Grupo ${l.cuenta} · ${l.nombre}` : l.nombre}</td>
      <td className="px-3 py-2 text-right">{eur(l.debe)}</td>
      <td className="px-3 py-2 text-right">{eur(l.haber)}</td>
      <td className="px-3 py-2 text-right">{l.saldoDeudor ? eur(l.saldoDeudor) : ''}</td>
      <td className="px-3 py-2 text-right">{l.saldoAcreedor ? eur(l.saldoAcreedor) : ''}</td>
    </tr>
  )

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="Nivel de detalle">
          <Select value={nivel} onChange={(e) => setNivel(Number(e.target.value) as 1 | 3 | 4 | 8)} className="w-52">
            <option value={1}>Grupos (1 dígito)</option>
            <option value={3}>Cuentas (3 dígitos)</option>
            <option value={4}>Subgrupos (4 dígitos)</option>
            <option value={8}>Subcuentas (8 dígitos)</option>
          </Select>
        </Field>
        <div className="min-w-56 flex-1">
          <Buscador q={q} setQ={setQ} placeholder="Buscar cuenta o nombre" />
        </div>
        <label className="mb-6 flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-ink" checked={soloSaldo} onChange={(e) => setSoloSaldo(e.target.checked)} />
          Solo cuentas con saldo
        </label>
        <div className="mb-5">
          <Estado ok={ss.cuadra} texto={ss.cuadra ? 'Cuadra: debe = haber' : `Descuadre: ${eur(ss.totales.debe - ss.totales.haber)}`} />
        </div>
      </div>
      <Card className="overflow-x-auto">
        <table className="num w-full min-w-[820px] text-left text-sm">
          <thead className="border-b border-line bg-ink text-xs uppercase tracking-wide text-white">
            <tr>
              <th className="px-3 py-2.5 font-medium">Cuenta</th>
              <th className="px-3 py-2.5 font-medium">Nombre</th>
              <th className="px-3 py-2.5 text-right font-medium">Sumas debe</th>
              <th className="px-3 py-2.5 text-right font-medium">Sumas haber</th>
              <th className="px-3 py-2.5 text-right font-medium">Saldo deudor</th>
              <th className="px-3 py-2.5 text-right font-medium">Saldo acreedor</th>
            </tr>
          </thead>
          <tbody>
            {nivel === 1
              ? ss.lineas.filter(filtrar).map((l) => fila(l, true))
              : grupos.flatMap((g) => {
                  const hijas = ss.lineas.filter((l) => l.cuenta.startsWith(g.cuenta)).filter(filtrar)
                  return hijas.length ? [fila(g, true), ...hijas.map((l) => fila(l))] : []
                })}
            <tr className="bg-lima/40 font-semibold">
              <td className="px-3 py-2.5" colSpan={2}>
                Totales
              </td>
              <td className="px-3 py-2.5 text-right">{eur(ss.totales.debe)}</td>
              <td className="px-3 py-2.5 text-right">{eur(ss.totales.haber)}</td>
              <td className="px-3 py-2.5 text-right">{eur(ss.totales.saldoDeudor)}</td>
              <td className="px-3 py-2.5 text-right">{eur(ss.totales.saldoAcreedor)}</td>
            </tr>
          </tbody>
        </table>
      </Card>
    </>
  )
}

function Informe({ lineas, titulo, sub }: { lineas: LineaInforme[]; titulo: string; sub: string }) {
  return (
    <Card className="max-w-3xl overflow-hidden">
      <div className="border-b border-line px-5 py-4">
        <h2 className="font-semibold">{titulo}</h2>
        <p className="text-sm text-muted">{sub}</p>
      </div>
      <table className="num w-full text-[15px]">
        <tbody>
          {lineas.map((l, i) => (
            <tr key={i} className={cx('border-b border-line last:border-0', l.total && 'bg-paper font-semibold', l.codigo === 'D' && '!bg-lima/40')}>
              <td className="w-12 px-4 py-2.5 text-sm text-muted">{l.codigo}</td>
              <td className={cx('py-2.5', !l.total && 'pl-3')}>{l.nombre}</td>
              <td className={cx('px-5 py-2.5 text-right', l.importe < 0 && 'text-rojo')}>{eur(l.importe)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}

function Balance({ calc, hasta }: { calc: Calc; hasta: string }) {
  const b = balanceSituacion(calc.delEjercicio)
  return (
    <div className="space-y-4">
      {Math.abs(b.diferencia) >= 0.01 && (
        <div className="flex gap-2 rounded-xl bg-ambar/10 px-4 py-3 text-sm text-ambar">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          El balance no cuadra por {eur(b.diferencia)}. Normalmente es porque falta el asiento de apertura (saldos a 1 de enero de bancos, capital,
          préstamos…). Se añade en «Apertura y asientos manuales».
        </div>
      )}
      <div className="grid gap-5 xl:grid-cols-2">
        <Informe lineas={[{ codigo: '', nombre: 'TOTAL ACTIVO', importe: b.totalActivo, nivel: 0, total: true }, ...b.activo]} titulo="Activo" sub={`A ${fecha(hasta)}`} />
        <Informe
          lineas={[{ codigo: '', nombre: 'TOTAL PATRIMONIO NETO Y PASIVO', importe: b.totalPasivo, nivel: 0, total: true }, ...b.pasivo]}
          titulo="Patrimonio neto y pasivo"
          sub={`A ${fecha(hasta)}`}
        />
      </div>
    </div>
  )
}

function InmovilizadoVista({ datos, hasta }: { datos: DatosContables; hasta: string }) {
  const [abierto, setAbierto] = useState<string | null>(null)
  if (!datos.inmovilizados.length)
    return (
      <Card>
        <Empty title="Todavía no hay inmovilizado" text="Cuando el asesor marque un gasto como inversión, aparecerá aquí con su cuadro de amortización." />
      </Card>
    )
  return (
    <Card className="overflow-x-auto">
      <table className="num w-full min-w-[760px] text-left text-sm">
        <thead className="border-b border-line bg-paper text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="px-3 py-2.5 font-medium">Bien</th>
            <th className="px-3 py-2.5 font-medium">Tipo</th>
            <th className="px-3 py-2.5 font-medium">Alta</th>
            <th className="px-3 py-2.5 text-right font-medium">Coef.</th>
            <th className="px-3 py-2.5 text-right font-medium">Valor</th>
            <th className="px-3 py-2.5 text-right font-medium">Amortizado</th>
            <th className="px-3 py-2.5 text-right font-medium">Valor neto</th>
          </tr>
        </thead>
        <tbody>
          {datos.inmovilizados.map((i) => {
            const cuadro = cuadroAmortizacion(i)
            const hastaHoy = cuadroAmortizacion(i, hasta)
            const acum = hastaHoy.at(-1)?.acumulado ?? 0
            return (
              <Fragment key={i.id}>
                <tr className="cursor-pointer border-b border-line hover:bg-paper" onClick={() => setAbierto(abierto === i.id ? null : i.id)}>
                  <td className="px-3 py-2.5 font-medium">{i.nombre}</td>
                  <td className="px-3 py-2.5 text-muted">{TIPOS_INMOVILIZADO.find((t) => t.id === i.tipo)?.nombre ?? i.tipo}</td>
                  <td className="px-3 py-2.5">{fecha(i.fecha_inicio)}</td>
                  <td className="px-3 py-2.5 text-right">{Number(i.coeficiente)} %</td>
                  <td className="px-3 py-2.5 text-right">{eur(i.valor)}</td>
                  <td className="px-3 py-2.5 text-right">{eur(acum)}</td>
                  <td className="px-3 py-2.5 text-right font-medium">{eur(Number(i.valor) - acum)}</td>
                </tr>
                {abierto === i.id && (
                  <tr className="border-b border-line bg-paper/60">
                    <td colSpan={7} className="px-6 py-3">
                      <p className="mb-2 text-xs uppercase tracking-wide text-muted">Cuadro de amortización</p>
                      <div className="grid grid-cols-4 gap-x-6 gap-y-1 text-sm sm:grid-cols-8">
                        {cuadro.map((c) => (
                          <span key={c.anio}>
                            <strong>{c.anio}</strong> {eur(c.cuota)}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </Card>
  )
}

function Manuales({ datos, ownerId, editable, anio, onChanged }: { datos: DatosContables; ownerId: string; editable: boolean; anio: number; onChanged: () => void }) {
  const [editando, setEditando] = useState<Partial<AsientoManual> | null>(null)
  const lista = [...datos.manuales].sort((a, b) => a.fecha.localeCompare(b.fecha))

  const borrar = async (m: AsientoManual) => {
    const ok = await confirmar({ titulo: 'Eliminar asiento', texto: `¿Eliminar «${m.concepto}»?`, accion: 'Eliminar', peligro: true })
    if (!ok) return
    const { error } = await supabase.from('asientos_manuales').delete().eq('id', m.id)
    if (error) return notify(await errorMessage(error), 'error')
    onChanged()
  }

  return (
    <>
      {editable && (
        <div className="mb-4 flex flex-wrap gap-2">
          <Button
            icon={<Plus className="size-4" />}
            onClick={() =>
              setEditando({
                tipo: 'apertura',
                fecha: `${anio}-01-01`,
                concepto: `Asiento de apertura ${anio}`,
                lineas: [
                  { cuenta: '572', debe: 0, haber: 0 },
                  { cuenta: '100', debe: 0, haber: 0 },
                ],
              })
            }
          >
            Asiento de apertura
          </Button>
          <Button
            variant="secondary"
            icon={<Plus className="size-4" />}
            onClick={() => setEditando({ tipo: 'manual', fecha: `${anio}-12-31`, concepto: '', lineas: [{ cuenta: '', debe: 0, haber: 0 }, { cuenta: '', debe: 0, haber: 0 }] })}
          >
            Asiento manual
          </Button>
        </div>
      )}
      {!lista.length ? (
        <Card>
          <Empty
            title="Sin asientos manuales"
            text="Aquí van la apertura (saldos a 1 de enero) y cualquier asiento que no venga de un documento: préstamos, capital, ajustes de cierre…"
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {lista.map((m) => (
            <Card key={m.id} className="p-4">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge tono={m.tipo === 'apertura' ? 'lima' : 'gris'}>{m.tipo === 'apertura' ? 'Apertura' : 'Manual'}</Badge>
                <span className="font-medium">{m.concepto}</span>
                <span className="text-sm text-muted">{fecha(m.fecha)}</span>
                {editable && (
                  <span className="ml-auto flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setEditando(m)}>
                      Editar
                    </Button>
                    <button className="rounded-full p-1.5 text-muted hover:bg-rojo/10 hover:text-rojo" onClick={() => borrar(m)} aria-label="Eliminar">
                      <Trash2 className="size-4" />
                    </button>
                  </span>
                )}
              </div>
              <table className="num w-full text-sm">
                <tbody>
                  {m.lineas.map((l, i) => (
                    <tr key={i}>
                      <td className="w-24 py-0.5 text-ink/80">{l.cuenta}</td>
                      <td className="py-0.5 text-ink/70">{nombreCuenta(l.cuenta.padEnd(8, '0'))}</td>
                      <td className="w-32 py-0.5 text-right">{Number(l.debe) ? eur(l.debe) : ''}</td>
                      <td className="w-32 py-0.5 text-right">{Number(l.haber) ? eur(l.haber) : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          ))}
        </div>
      )}
      {editando && <EditorAsiento inicial={editando} ownerId={ownerId} onClose={() => setEditando(null)} onSaved={onChanged} />}
    </>
  )
}

function EditorAsiento({ inicial, ownerId, onClose, onSaved }: { inicial: Partial<AsientoManual>; ownerId: string; onClose: () => void; onSaved: () => void }) {
  const [a, setA] = useState(inicial)
  const [guardando, setGuardando] = useState(false)
  const lineas = (a.lineas ?? []) as Apunte[]
  const td = lineas.reduce((s, l) => s + (Number(l.debe) || 0), 0)
  const th = lineas.reduce((s, l) => s + (Number(l.haber) || 0), 0)
  const cuadra = Math.abs(td - th) < 0.01 && td > 0
  const setLinea = (i: number, p: Partial<Apunte>) => setA({ ...a, lineas: lineas.map((l, j) => (j === i ? { ...l, ...p } : l)) })

  const guardar = async () => {
    if (!a.concepto?.trim()) return notify('Pon un concepto', 'error')
    if (!cuadra) return notify('El asiento no cuadra: el debe tiene que ser igual al haber', 'error')
    setGuardando(true)
    const fila = {
      owner_id: ownerId,
      tipo: a.tipo ?? 'manual',
      fecha: a.fecha,
      concepto: a.concepto.trim(),
      lineas: lineas.filter((l) => l.cuenta.trim() && (Number(l.debe) || Number(l.haber))).map((l) => ({ cuenta: l.cuenta.trim(), debe: Number(l.debe) || 0, haber: Number(l.haber) || 0 })),
    }
    const res = a.id ? await supabase.from('asientos_manuales').update(fila).eq('id', a.id) : await supabase.from('asientos_manuales').insert(fila)
    setGuardando(false)
    if (res.error) return notify(await errorMessage(res.error), 'error')
    notify('Asiento guardado')
    onSaved()
    onClose()
  }

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={a.tipo === 'apertura' ? 'Asiento de apertura' : 'Asiento manual'}
      footer={
        <>
          <span className={cx('mr-auto text-sm', cuadra ? 'text-verde' : 'text-ambar')}>
            Debe {eur(td)} · Haber {eur(th)} {cuadra ? '· cuadra' : '· no cuadra'}
          </span>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={guardar} loading={guardando}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="mb-4 grid gap-3 sm:grid-cols-[160px_1fr]">
        <Field label="Fecha">
          <Input type="date" value={a.fecha ?? ''} onChange={(e) => setA({ ...a, fecha: e.target.value })} />
        </Field>
        <Field label="Concepto">
          <Input value={a.concepto ?? ''} onChange={(e) => setA({ ...a, concepto: e.target.value })} />
        </Field>
      </div>
      <datalist id="cuentas-pgc">
        {Object.entries(CUENTAS).map(([c, n]) => (
          <option key={c} value={c}>
            {n}
          </option>
        ))}
      </datalist>
      <div className="space-y-2">
        <div className="grid grid-cols-[1fr_130px_130px_36px] gap-2 text-xs font-medium uppercase tracking-wide text-muted">
          <span>Cuenta</span>
          <span className="text-right">Debe</span>
          <span className="text-right">Haber</span>
          <span />
        </div>
        {lineas.map((l, i) => (
          <div key={i} className="grid grid-cols-[1fr_130px_130px_36px] items-center gap-2">
            <div>
              <Input list="cuentas-pgc" value={l.cuenta} onChange={(e) => setLinea(i, { cuenta: e.target.value.replace(/\D/g, '') })} placeholder="Ej.: 572" />
              {l.cuenta && <span className="mt-0.5 block text-xs text-muted">{nombreCuenta(l.cuenta.padEnd(8, '0'))}</span>}
            </div>
            <NumInput className="text-right" value={Number(l.debe) || 0} onValue={(n) => setLinea(i, { debe: n })} />
            <NumInput className="text-right" value={Number(l.haber) || 0} onValue={(n) => setLinea(i, { haber: n })} />
            <button
              className="grid size-9 place-items-center rounded-full text-muted hover:bg-rojo/10 hover:text-rojo"
              onClick={() => setA({ ...a, lineas: lineas.filter((_, j) => j !== i) })}
              aria-label="Quitar línea"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
        <Button size="sm" variant="ghost" icon={<Plus className="size-4" />} onClick={() => setA({ ...a, lineas: [...lineas, { cuenta: '', debe: 0, haber: 0 }] })}>
          Añadir línea
        </Button>
      </div>
    </Modal>
  )
}
