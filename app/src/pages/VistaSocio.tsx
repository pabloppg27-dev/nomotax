import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Download, Info, Users } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { invocar, supabase } from '../lib/supabase'
import { eur, fecha, hoyISO, rangoPeriodo, textoPeriodo, type Periodo } from '../lib/format'
import { cargarDatosContables, descargar } from '../lib/datosContables'
import { calcularVistaSocio, variacion, type VistaSocio as Vista } from '../lib/vistaSocio'
import type { LineaInforme } from '../lib/contabilidad'
import MonthlyChart, { type Mes } from '../components/MonthlyChart'
import PeriodPicker from '../components/PeriodPicker'
import { Button, Card, Loading, cx, notify } from '../components/ui'

/** embebido: dentro de Configuración, como vista previa de lo que ven los socios */
export default function VistaSocio({ embebido = false }: { embebido?: boolean }) {
  const { ownerId, owner, puede, rol } = useAuth()
  const [periodo, setPeriodo] = useState<Periodo>({ anio: new Date().getFullYear(), trimestre: 0 })
  const [vista, setVista] = useState<Vista | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [descargando, setDescargando] = useState(false)

  // Nunca más allá de hoy: las amortizaciones y la tesorería son a la fecha
  const rango = rangoPeriodo(periodo)
  const hoy = hoyISO()
  const hasta = rango.hasta > hoy ? hoy : rango.hasta
  const desde = rango.desde > hasta ? hasta : rango.desde

  // Quien ya ve todos los documentos lo calcula aquí; el resto (socios, admins con menos permisos),
  // en el servidor, que solo devuelve los totales
  const calculaAqui = puede('ventas') && puede('gastos') && puede('nominas') && puede('contabilidad')

  useEffect(() => {
    if (!ownerId) return
    let vigente = true
    setVista(null)
    setError(null)
    ;(async () => {
      try {
        let v: Vista
        if (calculaAqui) {
          const [datos, t] = await Promise.all([
            cargarDatosContables(ownerId),
            supabase.from('trabajadores').select('id', { count: 'exact', head: true }).eq('owner_id', ownerId).eq('estado', 'alta'),
          ])
          v = calcularVistaSocio(datos, t.count ?? 0, desde, hasta)
        } else {
          v = await invocar<Vista>('vista-socio', { cuenta_id: ownerId, desde, hasta })
        }
        if (vigente) setVista(v)
      } catch (e) {
        if (vigente) setError((e as Error).message)
      }
    })()
    return () => {
      vigente = false
    }
  }, [ownerId, desde, hasta, calculaAqui])

  const meses = useMemo<Mes[]>(() => {
    const out: Mes[] = Array.from({ length: 12 }, () => ({ ingresos: 0, gastos: 0 }))
    for (const m of vista?.meses ?? []) out[Number(m.mes.slice(5, 7)) - 1] = { ingresos: m.ventas, gastos: m.gastos }
    return out
  }, [vista])

  const empresa = owner?.nombre_comercial || owner?.nombre || 'Empresa'

  const pdf = async () => {
    if (!vista) return
    setDescargando(true)
    try {
      const { informeSocio } = await import('../lib/informeSocio')
      descargar(await informeSocio(vista, empresa).arrayBuffer(), `${empresa} - Informe socios ${textoPeriodo(periodo).archivo}.pdf`, 'application/pdf')
    } catch (e) {
      notify(`No se ha podido generar el PDF: ${(e as Error).message}`, 'error')
    }
    setDescargando(false)
  }

  const c = vista?.cifras
  const anioAnt = vista?.anterior.desde.slice(0, 4)

  return (
    <>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        {embebido ? (
          <p className="text-[15px] text-muted">
            Así ven tus socios la empresa: del {fecha(desde)} al {fecha(hasta)}, comparado con el mismo periodo del año anterior. Importes sin IVA.
          </p>
        ) : (
          <div>
            <p className="text-sm text-muted">Vista de socio{rol && rol !== 'socio' ? ' · así lo ven tus socios' : ''}</p>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">{empresa}</h1>
            <p className="mt-1 text-[15px] text-muted">
              Del {fecha(desde)} al {fecha(hasta)} · comparado con el mismo periodo del año anterior. Importes sin IVA.
            </p>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <PeriodPicker value={periodo} onChange={setPeriodo} />
          <Button variant="secondary" icon={<Download className="size-4" />} onClick={pdf} loading={descargando} disabled={!vista}>
            Informe PDF
          </Button>
        </div>
      </div>

      {error ? (
        <Card className="p-6">
          <p className="font-medium">No se han podido calcular las cifras</p>
          <p className="mt-1 text-sm text-muted">{error}</p>
        </Card>
      ) : !vista || !c ? (
        <Loading />
      ) : (
        <div className="space-y-6">
          {/* Cifra principal + KPIs */}
          <div className="grid gap-4 lg:grid-cols-[1.2fr_2fr]">
            <div className="relative overflow-hidden rounded-2xl bg-ink p-6 text-white">
              <p className="text-sm text-white/60">Resultado</p>
              <p className={cx('num mt-2 text-5xl font-semibold tracking-tight', c.resultado < 0 && 'text-red-300')}>{eur(c.resultado)}</p>
              <p className="mt-3 text-sm text-white/60">
                {c.margen === null ? 'Sin ventas en el periodo' : `Margen ${(c.margen * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })}% sobre ventas`}
                {' · '}
                {anioAnt}: {eur(c.resultadoAnt)}
              </p>
              <div className="pointer-events-none absolute -bottom-16 -right-16 size-48 rounded-full bg-lima/15 blur-2xl" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Kpi label="Ventas" valor={c.ventas} anterior={c.ventasAnt} anio={anioAnt} />
              <Kpi label="Gastos" valor={c.gastos} anterior={c.gastosAnt} anio={anioAnt} menosEsMejor />
              <Kpi label="Dinero en bancos" valor={vista.liquidez.tesoreria} nota={`A ${fecha(vista.hasta)}`} />
              <Kpi label="Pendiente de cobro" valor={vista.liquidez.pendienteCobro} nota="Facturas emitidas sin cobrar" />
            </div>
          </div>

          <Card className="p-5 sm:p-6">
            <h2 className="font-semibold">Ventas y gastos por mes</h2>
            <p className="mb-4 text-sm text-muted">{hasta.slice(0, 4)} · según la contabilidad (gastos incluye personal y amortizaciones)</p>
            <MonthlyChart meses={meses} anio={Number(hasta.slice(0, 4))} series={[{ key: 'ingresos', label: 'Ventas', color: '#111110' }, { key: 'gastos', label: 'Gastos', color: '#b3e04d' }]} />
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="p-5 sm:p-6">
              <h2 className="font-semibold">Liquidez</h2>
              <p className="mb-4 text-sm text-muted">A {fecha(vista.hasta)}</p>
              <dl className="space-y-3">
                <Dato label="Dinero en bancos" valor={vista.liquidez.tesoreria} fuerte />
                <Dato label="Pendiente de cobrar a clientes" valor={vista.liquidez.pendienteCobro} />
                <Dato label="Pendiente de pagar a proveedores" valor={-vista.liquidez.pendientePago} />
                <Dato label="Hacienda, Seguridad Social y nóminas pendientes" valor={-vista.liquidez.administraciones} />
                {vista.liquidez.haciendaDeudora > 0 && <Dato label="Hacienda te debe (IVA, retenciones…)" valor={vista.liquidez.haciendaDeudora} />}
              </dl>
            </Card>
            <Card className="p-5 sm:p-6">
              <h2 className="flex items-center gap-2 font-semibold">
                <Users className="size-4" /> Plantilla
              </h2>
              <p className="mb-4 text-sm text-muted">Sin datos de ninguna persona en concreto</p>
              <dl className="space-y-3">
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-[15px]">Trabajadores de alta</dt>
                  <dd className="num text-lg font-semibold">{vista.plantilla.trabajadores}</dd>
                </div>
                <Dato label="Coste de personal del periodo" valor={vista.plantilla.costePersonal} fuerte />
                <div className="flex items-baseline justify-between gap-3 text-sm text-muted">
                  <dt>
                    Mismo periodo {anioAnt}: {eur(vista.plantilla.costePersonalAnt)}
                  </dt>
                  <dd>{variacion(vista.plantilla.costePersonal, vista.plantilla.costePersonalAnt)}</dd>
                </div>
              </dl>
            </Card>
          </div>

          <Card className="overflow-hidden">
            <div className="p-5 pb-3 sm:p-6 sm:pb-3">
              <h2 className="font-semibold">Cuenta de pérdidas y ganancias</h2>
              <p className="text-sm text-muted">Modelo PYMES</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[15px]">
                <thead>
                  <tr className="border-y border-line bg-paper text-left text-xs text-muted">
                    <th className="px-5 py-2 font-medium sm:px-6">Concepto</th>
                    <th className="px-3 py-2 text-right font-medium">Periodo</th>
                    <th className="px-3 py-2 text-right font-medium">{anioAnt}</th>
                    <th className="px-5 py-2 text-right font-medium sm:px-6">Variación</th>
                  </tr>
                </thead>
                <tbody>
                  {vista.pyg.map((l, i) => (
                    <tr key={i} className={cx('border-b border-line last:border-0', l.total && 'bg-lima/20 font-semibold')}>
                      <td className="px-5 py-2 sm:px-6">{l.nombre}</td>
                      <td className="num whitespace-nowrap px-3 py-2 text-right">{eur(l.importe)}</td>
                      <td className="num whitespace-nowrap px-3 py-2 text-right text-muted">{eur(l.anterior)}</td>
                      <td className="num whitespace-nowrap px-5 py-2 text-right text-muted sm:px-6">{variacion(l.importe, l.anterior)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="p-5 sm:p-6">
            <h2 className="font-semibold">Balance de situación</h2>
            <p className="mb-4 text-sm text-muted">A {fecha(vista.hasta)}</p>
            {!vista.balance.cuadra && (
              <p className="mb-4 flex items-start gap-2 rounded-xl bg-ambar/10 p-3 text-sm text-ambar">
                <Info className="mt-0.5 size-4 shrink-0" />
                El balance aún no cuadra: falta el asiento de apertura del ejercicio. Tu asesor lo completará.
              </p>
            )}
            <div className="grid gap-6 lg:grid-cols-2">
              <Bloque titulo="Activo" lineas={vista.balance.activo} total={vista.balance.totalActivo} />
              <Bloque titulo="Patrimonio neto y pasivo" lineas={vista.balance.pasivo} total={vista.balance.totalPasivo} />
            </div>
          </Card>

          <p className="text-xs text-muted">
            Cifras calculadas con la contabilidad de la empresa en NomoTax: facturas, gastos revisados, nóminas, asientos e inmovilizado registrados
            hasta hoy. Son orientativas hasta el cierre del ejercicio.
          </p>
        </div>
      )}
    </>
  )
}

function Kpi({ label, valor, anterior, anio, nota, menosEsMejor }: { label: string; valor: number; anterior?: number; anio?: string; nota?: ReactNode; menosEsMejor?: boolean }) {
  const v = anterior !== undefined ? variacion(valor, anterior) : null
  const sube = anterior !== undefined && anterior !== 0 && valor > anterior
  const bien = menosEsMejor ? !sube : sube
  return (
    <Card className="p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="num mt-1 text-xl font-semibold sm:text-2xl">{eur(valor)}</p>
      {v !== null ? (
        <p className="mt-1 text-xs text-muted">
          {v !== '—' && <span className={cx('font-medium', bien ? 'text-verde' : 'text-rojo')}>{v}</span>} {anio}: {eur(anterior)}
        </p>
      ) : (
        nota && <p className="mt-1 text-xs text-muted">{nota}</p>
      )}
    </Card>
  )
}

function Dato({ label, valor, fuerte }: { label: string; valor: number; fuerte?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[15px]">{label}</dt>
      <dd className={cx('num whitespace-nowrap', fuerte ? 'text-lg font-semibold' : 'font-medium', valor < 0 && 'text-rojo')}>{eur(valor)}</dd>
    </div>
  )
}

function Bloque({ titulo, lineas, total }: { titulo: string; lineas: LineaInforme[]; total: number }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-medium text-muted">{titulo}</h3>
      <div className="divide-y divide-line rounded-xl border border-line">
        {lineas.map((l, i) => (
          <div key={i} className={cx('flex justify-between gap-3 px-3 py-2', l.nivel === 0 ? 'font-medium' : 'pl-6 text-[15px] text-ink/80')}>
            <span>{l.nombre}</span>
            <span className="num whitespace-nowrap">{eur(l.importe)}</span>
          </div>
        ))}
        <div className="flex justify-between gap-3 bg-lima/30 px-3 py-2 font-semibold">
          <span>Total</span>
          <span className="num whitespace-nowrap">{eur(total)}</span>
        </div>
      </div>
    </div>
  )
}
