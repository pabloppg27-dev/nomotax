import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertCircle, ArrowRight, CalendarClock, ClipboardList, FileText, Plus, Receipt } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { enPeriodo, eur, hoyISO, proximoPlazoTrimestral, trimestreActual, type Periodo } from '../lib/format'
import { nombreCategoria } from '../lib/categorias'
import { vencida } from '../lib/estados'
import type { Expense, Invoice, Quote } from '../lib/types'
import MonthlyChart, { type Mes } from '../components/MonthlyChart'
import { AsesorCard } from './MiAsesor'
import PeriodPicker from '../components/PeriodPicker'
import { Button, Card, Loading, cx } from '../components/ui'

type Datos = { facturas: Invoice[]; gastos: Expense[]; presupuestos: Quote[] }

export default function Resumen() {
  const { ownerId, owner, viewingOther } = useAuth()
  const navigate = useNavigate()
  const [periodo, setPeriodo] = useState<Periodo>(trimestreActual())
  const [datos, setDatos] = useState<Datos | null>(null)

  useEffect(() => {
    if (!ownerId) return
    setDatos(null)
    const desde = `${periodo.anio}-01-01`
    const hasta = `${periodo.anio}-12-31`
    Promise.all([
      supabase.from('invoices').select('*').eq('owner_id', ownerId).neq('estado', 'borrador'),
      supabase.from('expenses').select('*').eq('owner_id', ownerId).or(`and(fecha.gte.${desde},fecha.lte.${hasta}),estado.eq.pendiente`),
      supabase.from('quotes').select('*').eq('owner_id', ownerId).in('estado', ['enviado', 'aceptado']),
    ]).then(([f, g, p]) =>
      setDatos({
        facturas: (f.data as Invoice[]) ?? [],
        gastos: (g.data as Expense[]) ?? [],
        presupuestos: (p.data as Quote[]) ?? [],
      }),
    )
  }, [ownerId, periodo.anio])

  const calc = useMemo(() => {
    if (!datos) return null
    const fPer = datos.facturas.filter((f) => enPeriodo(f.fecha, periodo))
    const gPer = datos.gastos.filter((g) => g.fecha && enPeriodo(g.fecha, periodo))
    const ingresos = fPer.reduce((s, f) => s + Number(f.base), 0)
    const gastos = gPer.reduce((s, g) => s + Number(g.base), 0)
    const ivaRep = fPer.reduce((s, f) => s + Number(f.cuota_iva), 0)
    const ivaSop = gPer.reduce((s, g) => s + Number(g.cuota_iva), 0)
    const retenciones = fPer.reduce((s, f) => s + Number(f.cuota_irpf), 0)

    const meses: Mes[] = Array.from({ length: 12 }, () => ({ ingresos: 0, gastos: 0 }))
    for (const f of datos.facturas) {
      if (f.fecha.startsWith(String(periodo.anio))) meses[Number(f.fecha.slice(5, 7)) - 1].ingresos += Number(f.base)
    }
    for (const g of datos.gastos) {
      if (g.fecha?.startsWith(String(periodo.anio))) meses[Number(g.fecha.slice(5, 7)) - 1].gastos += Number(g.base)
    }

    const porCat = new Map<string, number>()
    for (const g of gPer) porCat.set(g.categoria, (porCat.get(g.categoria) ?? 0) + Number(g.base))
    const categorias = [...porCat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)

    const hoy = hoyISO()
    const pendienteCobro = datos.facturas.filter((f) => f.estado === 'emitida')
    const vencidas = pendienteCobro.filter((f) => vencida(f.estado, f.vencimiento, hoy))
    return {
      ingresos,
      gastos,
      resultado: ingresos - gastos,
      ivaRep,
      ivaSop,
      iva: ivaRep - ivaSop,
      retenciones,
      meses,
      categorias,
      pendienteCobro: pendienteCobro.reduce((s, f) => s + Number(f.total), 0),
      nPendienteCobro: pendienteCobro.length,
      vencidas: vencidas.length,
      porRevisar: datos.gastos.filter((g) => g.estado === 'pendiente').length,
      presupuestosAbiertos: datos.presupuestos.reduce((s, q) => s + Number(q.base), 0),
      nPresupuestos: datos.presupuestos.length,
    }
  }, [datos, periodo])

  const plazo = proximoPlazoTrimestral()
  const diasPlazo = Math.ceil((plazo.fecha.getTime() - Date.now()) / 86400000)
  const nombrePeriodo = periodo.trimestre === 0 ? `el año ${periodo.anio}` : `el ${periodo.trimestre}T de ${periodo.anio}`
  const delPeriodo = periodo.trimestre === 0 ? `del año ${periodo.anio}` : `del ${periodo.trimestre}T de ${periodo.anio}`
  const saludo = owner?.nombre?.split(' ')[0]

  return (
    <>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">
            {viewingOther ? owner?.nombre || 'Resumen' : saludo ? `Hola, ${saludo}` : 'Resumen'}
          </h1>
          <p className="mt-1 text-[15px] text-muted">Así va tu negocio en {nombrePeriodo}. Importes sin IVA.</p>
        </div>
        <PeriodPicker value={periodo} onChange={setPeriodo} />
      </div>

      {!calc ? (
        <Loading />
      ) : (
        <div className="space-y-6">
          {/* Cifra principal + KPIs */}
          <div className="grid gap-4 lg:grid-cols-[1.2fr_2fr]">
            <div className="relative overflow-hidden rounded-2xl bg-ink p-6 text-white">
              <p className="text-sm text-white/60">Resultado</p>
              <p className={cx('num mt-2 text-5xl font-semibold tracking-tight', calc.resultado < 0 && 'text-red-300')}>{eur(calc.resultado)}</p>
              <p className="mt-3 text-sm text-white/60">Ingresos menos gastos {delPeriodo}.</p>
              <div className="pointer-events-none absolute -bottom-16 -right-16 size-48 rounded-full bg-lima/15 blur-2xl" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Kpi label="Ingresos" valor={eur(calc.ingresos)} />
              <Kpi label="Gastos" valor={eur(calc.gastos)} />
              <Kpi
                label={calc.iva >= 0 ? 'IVA a ingresar (estimado)' : 'IVA a compensar (estimado)'}
                valor={eur(Math.abs(calc.iva))}
                nota={`Repercutido ${eur(calc.ivaRep)} − soportado ${eur(calc.ivaSop)}`}
              />
              <Kpi label="Retenciones que te han practicado" valor={eur(calc.retenciones)} nota="IRPF de tus facturas" />
            </div>
          </div>

          {/* Avisos */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Aviso
              icon={<CalendarClock className="size-4" />}
              titulo={`Próximo plazo: ${plazo.fecha.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}`}
              texto={`Declaraciones del ${plazo.trimestre} · ${diasPlazo === 1 ? 'queda 1 día' : `quedan ${diasPlazo} días`}`}
              destacado={diasPlazo <= 15}
            />
            <Aviso
              icon={<Receipt className="size-4" />}
              titulo={calc.porRevisar ? `${calc.porRevisar} gasto${calc.porRevisar > 1 ? 's' : ''} por revisar` : 'Gastos al día'}
              texto={calc.porRevisar ? 'Confirma los datos leídos para que cuenten.' : 'No tienes gastos pendientes de revisar.'}
              to="/gastos"
              destacado={calc.porRevisar > 0}
            />
            <Aviso
              icon={calc.vencidas ? <AlertCircle className="size-4" /> : <FileText className="size-4" />}
              titulo={`${eur(calc.pendienteCobro)} pendiente de cobro`}
              texto={
                calc.vencidas
                  ? `${calc.vencidas} factura${calc.vencidas > 1 ? 's' : ''} vencida${calc.vencidas > 1 ? 's' : ''}`
                  : `${calc.nPendienteCobro} factura${calc.nPendienteCobro === 1 ? '' : 's'} sin cobrar`
              }
              to="/facturas"
              alerta={calc.vencidas > 0}
            />
            <Aviso
              icon={<ClipboardList className="size-4" />}
              titulo={`${eur(calc.presupuestosAbiertos)} en presupuestos`}
              texto={`${calc.nPresupuestos} enviado${calc.nPresupuestos === 1 ? '' : 's'} o aceptado${calc.nPresupuestos === 1 ? '' : 's'} sin facturar`}
              to="/presupuestos"
            />
          </div>

          {/* Gráfico mensual */}
          <Card className="p-5 sm:p-6">
            <h2 className="font-semibold">Ingresos y gastos por mes</h2>
            <p className="mb-4 text-sm text-muted">{periodo.anio} · base imponible</p>
            <MonthlyChart meses={calc.meses} anio={periodo.anio} />
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="p-5 sm:p-6">
              <h2 className="font-semibold">En qué se va el dinero</h2>
              <p className="mb-4 text-sm text-muted">Gastos por categoría en {nombrePeriodo}</p>
              {calc.categorias.length === 0 ? (
                <p className="py-6 text-sm text-muted">Aún no hay gastos en este periodo.</p>
              ) : (
                <div className="space-y-3">
                  {calc.categorias.map(([cat, valor]) => (
                    <div key={cat}>
                      <div className="mb-1 flex justify-between text-sm">
                        <span>{nombreCategoria(cat)}</span>
                        <span className="num font-medium">{eur(valor)}</span>
                      </div>
                      <div className="h-2 rounded-full bg-ink/[0.06]">
                        <div className="h-2 rounded-full bg-ink" style={{ width: `${(valor / calc.categorias[0][1]) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card className="flex flex-col p-5 sm:p-6">
              <div className="mb-5 border-b border-line pb-5">
                <AsesorCard compacta onAgendar={() => navigate('/mi-asesor')} />
              </div>
              <h2 className="font-semibold">Acciones rápidas</h2>
              <p className="mb-4 text-sm text-muted">Lo que más vas a usar.</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button variant="accent" icon={<Receipt className="size-4" />} onClick={() => navigate('/gastos')}>
                  Subir un gasto
                </Button>
                <Button icon={<Plus className="size-4" />} onClick={() => navigate('/facturas/nueva')}>
                  Nueva factura
                </Button>
                <Button variant="secondary" icon={<ClipboardList className="size-4" />} onClick={() => navigate('/presupuestos/nuevo')}>
                  Nuevo presupuesto
                </Button>
                <Button variant="secondary" icon={<Plus className="size-4" />} onClick={() => navigate('/clientes')}>
                  Añadir cliente
                </Button>
              </div>
              <p className="mt-auto pt-6 text-xs text-muted">
                Las cifras son orientativas y se calculan con lo que has registrado aquí. Tu asesor revisa los importes
                definitivos antes de cada declaración.
              </p>
            </Card>
          </div>
        </div>
      )}
    </>
  )
}

function Kpi({ label, valor, nota }: { label: string; valor: string; nota?: string }) {
  return (
    <Card className="p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="num mt-1 text-xl font-semibold sm:text-2xl">{valor}</p>
      {nota && <p className="mt-1 text-xs text-muted">{nota}</p>}
    </Card>
  )
}

function Aviso({
  icon,
  titulo,
  texto,
  to,
  destacado,
  alerta,
}: {
  icon: ReactNode
  titulo: string
  texto: string
  to?: string
  destacado?: boolean
  alerta?: boolean
}) {
  const cuerpo = (
    <div
      className={cx(
        'flex h-full gap-3 rounded-2xl border p-4 transition-colors',
        alerta ? 'border-rojo/20 bg-rojo/5' : destacado ? 'border-lima bg-lima/30' : 'border-line bg-white',
        to && 'hover:border-ink/30',
      )}
    >
      <span className={cx('mt-0.5 grid size-7 shrink-0 place-items-center rounded-full', alerta ? 'bg-rojo/10 text-rojo' : 'bg-ink text-lima')}>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="num font-medium">{titulo}</p>
        <p className="text-sm text-muted">{texto}</p>
      </div>
      {to && <ArrowRight className="mt-1 size-4 shrink-0 text-muted" />}
    </div>
  )
  return to ? <Link to={to}>{cuerpo}</Link> : cuerpo
}
