/**
 * Vista de socio: cifras de la empresa para socios e inversores.
 * Lo calcula la Edge Function vista-socio (supabase/functions/vista-socio) con los datos completos,
 * y al navegador solo llegan TOTALES: ninguna factura suelta, ninguna nómina de nadie.
 * Quien ya tiene acceso a todo (titular, asesor) lo calcula en el propio navegador con esta misma función.
 */
import { balanceSituacion, entre, generarAsientos, perdidasYGanancias, type DatosContables, type LineaInforme } from './contabilidad.ts'
import type { Nomina } from './types.ts'

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export interface LineaComparada extends LineaInforme {
  anterior: number
}

export interface MesSocio {
  /** YYYY-MM */
  mes: string
  ventas: number
  gastos: number
  resultado: number
}

export interface VistaSocio {
  desde: string
  hasta: string
  anterior: { desde: string; hasta: string }
  cifras: {
    ventas: number
    gastos: number
    resultado: number
    /** resultado / ventas (null si no hay ventas) */
    margen: number | null
    ventasAnt: number
    gastosAnt: number
    resultadoAnt: number
  }
  /** Del 1 de enero al mes de «hasta» */
  meses: MesSocio[]
  pyg: LineaComparada[]
  balance: { activo: LineaInforme[]; pasivo: LineaInforme[]; totalActivo: number; totalPasivo: number; cuadra: boolean }
  liquidez: {
    tesoreria: number
    pendienteCobro: number
    pendientePago: number
    /** Hacienda, Seguridad Social y nóminas pendientes de pagar */
    administraciones: number
    /** Hacienda deudora (IVA soportado, retenciones…) */
    haciendaDeudora: number
  }
  plantilla: { trabajadores: number; costePersonal: number; costePersonalAnt: number }
  /** Fecha y hora del cálculo */
  calculado: string
}

/** Las nóminas, en un total por mes: no queda ni el nombre ni el sueldo de nadie */
export function agregarNominas(nominas: Pick<Nomina, 'anio' | 'mes' | 'estado' | 'bruto' | 'neto' | 'irpf' | 'ss_trabajador' | 'ss_empresa' | 'coste_total'>[]) {
  const porMes = new Map<string, DatosContables['nominas'][number]>()
  for (const n of nominas) {
    if (n.estado !== 'publicada') continue
    const clave = `${n.anio}-${n.mes}`
    const a = porMes.get(clave) ?? ({
      id: clave,
      owner_id: '',
      trabajador_id: null,
      anio: n.anio,
      mes: n.mes,
      tipo: 'mensual',
      estado: 'publicada',
      file_path: '',
      nombre_leido: null,
      dni_leido: null,
      bruto: 0,
      neto: 0,
      irpf: 0,
      irpf_pct: null,
      ss_trabajador: 0,
      ss_empresa: 0,
      variables: 0,
      coste_total: 0,
      conceptos: null,
      ocr: null,
      publicada_at: null,
      created_at: '',
      trabajador_nombre: 'plantilla',
    } as DatosContables['nominas'][number])
    a.bruto = r2(Number(a.bruto) + Number(n.bruto))
    a.neto = r2(Number(a.neto) + Number(n.neto))
    a.irpf = r2(Number(a.irpf) + Number(n.irpf))
    a.ss_trabajador = r2(Number(a.ss_trabajador) + Number(n.ss_trabajador))
    a.ss_empresa = r2(Number(a.ss_empresa) + Number(n.ss_empresa))
    a.coste_total = r2(Number(a.coste_total) + Number(n.coste_total))
    porMes.set(clave, a)
  }
  return [...porMes.values()]
}

/** Variación en % frente al año anterior: «+12,5 %» (o «—» si antes era cero) */
export function variacion(act: number, ant: number): string {
  if (!ant) return '—'
  const v = ((act - ant) / Math.abs(ant)) * 100
  return `${v > 0 ? '+' : ''}${v.toLocaleString('es-ES', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} %`
}

/** La misma fecha un año antes (YYYY-MM-DD) */
function unAnioAntes(iso: string): string {
  const anio = Number(iso.slice(0, 4)) - 1
  const resto = iso.slice(4)
  // 29 de febrero → 28 si el año anterior no es bisiesto
  if (resto === '-02-29' && !(anio % 4 === 0 && (anio % 100 !== 0 || anio % 400 === 0))) return `${anio}-02-28`
  return `${anio}${resto}`
}

function finDeMes(anio: number, mes: number): string {
  return new Date(Date.UTC(anio, mes, 0)).toISOString().slice(0, 10)
}

const linea = (l: LineaInforme[], nombre: string) => l.find((x) => x.nombre === nombre)?.importe ?? 0

function cifrasDe(asientos: ReturnType<typeof generarAsientos>['asientos']) {
  const pyg = perdidasYGanancias(asientos)
  const ventas = pyg.lineas.find((l) => l.codigo === '1')?.importe ?? 0
  const gastos = -pyg.lineas.filter((l) => ['4', '6', '7', '8'].includes(l.codigo)).reduce((s, l) => s + l.importe, 0)
  const personal = -(pyg.lineas.find((l) => l.codigo === '6')?.importe ?? 0)
  return { pyg, ventas: r2(ventas), gastos: r2(gastos), resultado: pyg.resultado, personal: r2(personal) }
}

export function calcularVistaSocio(datos: DatosContables, trabajadores: number, desde: string, hasta: string): VistaSocio {
  const { asientos } = generarAsientos({ ...datos, hasta })
  const anterior = { desde: unAnioAntes(desde), hasta: unAnioAntes(hasta) }

  const act = cifrasDe(entre(asientos, desde, hasta))
  const ant = cifrasDe(entre(asientos, anterior.desde, anterior.hasta))

  const anio = Number(hasta.slice(0, 4))
  const ultimoMes = Number(hasta.slice(5, 7))
  const meses: MesSocio[] = []
  for (let m = 1; m <= ultimoMes; m++) {
    const mm = String(m).padStart(2, '0')
    const c = cifrasDe(entre(asientos, `${anio}-${mm}-01`, m === ultimoMes ? hasta : finDeMes(anio, m)))
    meses.push({ mes: `${anio}-${mm}`, ventas: c.ventas, gastos: c.gastos, resultado: c.resultado })
  }

  const bal = balanceSituacion(entre(asientos, `${anio}-01-01`, hasta))

  return {
    desde,
    hasta,
    anterior,
    cifras: {
      ventas: act.ventas,
      gastos: act.gastos,
      resultado: act.resultado,
      margen: act.ventas ? r2((act.resultado / act.ventas) * 100) / 100 : null,
      ventasAnt: ant.ventas,
      gastosAnt: ant.gastos,
      resultadoAnt: ant.resultado,
    },
    meses,
    pyg: act.pyg.lineas.map((l, i) => ({ ...l, anterior: ant.pyg.lineas[i]?.importe ?? 0 })),
    balance: {
      activo: bal.activo,
      pasivo: bal.pasivo,
      totalActivo: bal.totalActivo,
      totalPasivo: bal.totalPasivo,
      cuadra: Math.abs(bal.diferencia) < 0.01,
    },
    liquidez: {
      tesoreria: linea(bal.activo, 'Efectivo y otros activos líquidos'),
      pendienteCobro: linea(bal.activo, 'Clientes y deudores comerciales'),
      pendientePago: linea(bal.pasivo, 'Proveedores y acreedores comerciales'),
      administraciones: linea(bal.pasivo, 'Hacienda Pública, Seguridad Social y personal'),
      haciendaDeudora: linea(bal.activo, 'Hacienda Pública deudora'),
    },
    plantilla: { trabajadores, costePersonal: act.personal, costePersonalAnt: ant.personal },
    calculado: new Date().toISOString(),
  }
}
