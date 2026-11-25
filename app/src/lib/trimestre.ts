/**
 * Trimestre (panel del asesor): qué modelos le tocan a cada empresa en un trimestre y cuánto salen,
 * a partir de sus facturas, gastos revisados, nóminas publicadas, su régimen fiscal (profiles.fiscal)
 * y lo ya presentado (tabla impuestos). Son estimaciones para preparar la presentación, no la declaración.
 *   Pruebas: node test-data/probar-trimestre.ts
 */
import type { Expense, Invoice, Nomina, Profile } from './types.ts'
import type { Impuesto, Resultado } from './impuestos.ts'
import { formaPorNif, type Fiscal, type Forma } from './regimenFiscal.ts'
import { codigoPais } from './paises.ts'

export type FacturaT = Pick<Invoice, 'fecha' | 'estado' | 'base' | 'cuota_iva' | 'cuota_irpf' | 'total' | 'cliente' | 'fecha_cobro'>
export type GastoT = Pick<
  Expense,
  'fecha' | 'estado' | 'base' | 'cuota_iva' | 'cuota_irpf' | 'total' | 'categoria' | 'proveedor' | 'proveedor_nif' | 'revision' | 'pagado' | 'fecha_pago'
>
export type NominaT = Pick<Nomina, 'anio' | 'mes' | 'estado' | 'irpf' | 'bruto' | 'ss_empresa' | 'coste_total'>
export type PresentadoT = Pick<Impuesto, 'id' | 'modelo' | 'anio' | 'periodo' | 'resultado' | 'importe' | 'fecha_presentacion' | 'file_path'>

export interface DatosEmpresa {
  perfil: Pick<Profile, 'id' | 'nombre' | 'nif'> & { fiscal?: Fiscal | null }
  /** Del año del trimestre (las borradores se ignoran) */
  facturas: FacturaT[]
  /** Del año del trimestre; solo cuentan los revisados (los pendientes salen como aviso) */
  gastos: GastoT[]
  nominas: NominaT[]
  presentados: PresentadoT[]
  /** Trabajadores de alta ahora mismo */
  trabajadores: number
}

export type EstadoModelo = 'pendiente' | 'presentado' | 'manual' | 'no_obligado' | 'recordatorio'
export type Trimestre = 1 | 2 | 3 | 4

export interface ModeloCalc {
  modelo: string
  nombre: string
  anio: number
  periodo: string
  estado: EstadoModelo
  /** Importe estimado (positivo); null si no se puede calcular */
  importe: number | null
  /** Resultado que sale con lo calculado */
  resultado: Resultado | null
  desglose: { texto: string; importe: number }[]
  notas: string[]
  plazo: string
  /** Ya presentado (tiene fecha de presentación) */
  presentado?: PresentadoT
  /** Preparado en Impuestos pero sin fecha: «pendiente de presentar» */
  preparado?: PresentadoT
}

export interface ResultadoEmpresa {
  forma: Forma
  modelos: ModeloCalc[]
  avisos: string[]
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
/** 1.234,56 (punto de miles siempre, como eur() de format.ts) */
const fmt = (n: number) => {
  const [e, d] = Math.abs(n).toFixed(2).split('.')
  return `${n < 0 ? '-' : ''}${e.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}${d === '00' ? '' : `,${d}`}`
}
const suma = <T,>(xs: T[], f: (x: T) => number) => r2(xs.reduce((s, x) => s + (Number(f(x)) || 0), 0))
const mesDe = (iso: string | null | undefined) => (iso ? Number(iso.slice(5, 7)) : 0)
const anioDe = (iso: string | null | undefined) => (iso ? Number(iso.slice(0, 4)) : 0)

/** Estados de la UE (código de país ISO; Grecia usa EL en el NIF-IVA) */
export const UE = new Set(['AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'FI', 'FR', 'GR', 'EL', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK'])

/** País de un NIF con prefijo de país (FR123…, DE123…); null si es un NIF español o no lo lleva */
export function paisDeNif(nif: string | null | undefined): string | null {
  const n = (nif ?? '').replace(/[\s.-]/g, '').toUpperCase()
  const m = /^([A-Z]{2})[0-9A-Z]{5,}$/.exec(n)
  if (!m || m[1] === 'ES') return null
  // Un NIF español no empieza por dos letras salvo casos raros (p. ej. NIE): solo se toma como país si es un código conocido
  return UE.has(m[1]) || ['GB', 'US', 'CH', 'NO', 'XI'].includes(m[1]) ? m[1] : null
}

const clienteUE = (f: FacturaT) => {
  const c = codigoPais(f.cliente?.pais ?? null) ?? paisDeNif(f.cliente?.nif)
  return Boolean(c && c !== 'ES' && UE.has(c))
}
const clienteExtranjero = (f: FacturaT) => {
  const c = codigoPais(f.cliente?.pais ?? null) ?? paisDeNif(f.cliente?.nif)
  return Boolean(c && c !== 'ES')
}
const proveedorUE = (g: GastoT) => {
  const c = paisDeNif(g.proveedor_nif)
  return Boolean(c && UE.has(c))
}

export const NOMBRES_MODELO: Record<string, string> = {
  '303': 'IVA',
  '130': 'Pago fraccionado IRPF',
  '131': 'Pago fraccionado IRPF (módulos)',
  '111': 'Retenciones de trabajo y profesionales',
  '115': 'Retenciones de alquileres',
  '349': 'Operaciones intracomunitarias',
  '202': 'Pago fraccionado de Sociedades',
  '390': 'Resumen anual de IVA',
  '190': 'Resumen anual de retenciones',
  '180': 'Resumen anual de alquileres',
  '347': 'Operaciones con terceros',
}

/** Fecha límite de cada modelo (AAAA-MM-DD) */
export function plazoDe(modelo: string, anio: number, periodo: string): string {
  if (periodo === '0A') return modelo === '347' ? `${anio + 1}-02-28` : modelo === '390' ? `${anio + 1}-01-30` : `${anio + 1}-01-31`
  if (periodo === '1P') return `${anio}-04-20`
  if (periodo === '2P') return `${anio}-10-20`
  if (periodo === '3P') return `${anio}-12-20`
  const t = Number(periodo[0])
  if (t === 4) return modelo === '303' ? `${anio + 1}-01-30` : `${anio + 1}-01-20`
  return `${anio}-${String(t * 3 + 1).padStart(2, '0')}-20`
}

export function modelosDelTrimestre(d: DatosEmpresa, anio: number, t: Trimestre): ResultadoEmpresa {
  const fiscal: Fiscal = d.perfil.fiscal ?? {}
  const forma: Forma = fiscal.forma ?? formaPorNif(d.perfil.nif) ?? 'sociedad'
  const iva = new Set(fiscal.iva ?? [])
  const periodo = `${t}T`
  const mesIni = (t - 1) * 3 + 1
  const mesFin = t * 3
  const enT = (iso: string | null | undefined) => anioDe(iso) === anio && mesDe(iso) >= mesIni && mesDe(iso) <= mesFin
  const hastaT = (iso: string | null | undefined) => anioDe(iso) === anio && mesDe(iso) <= mesFin
  const delAnio = (iso: string | null | undefined) => anioDe(iso) === anio

  const facturas = d.facturas.filter((f) => f.estado !== 'borrador')
  const revisados = d.gastos.filter((g) => g.estado === 'revisado')
  const nominas = d.nominas.filter((n) => n.estado === 'publicada' && n.anio === anio)

  const fT = facturas.filter((f) => enT(f.fecha))
  const gT = revisados.filter((g) => enT(g.fecha))
  const modelos: ModeloCalc[] = []
  const avisos: string[] = []

  // Un registro de Impuestos sin fecha de presentación es uno preparado, aún «pendiente de presentar»
  const registro = (modelo: string, per: string) => d.presentados.find((p) => p.modelo === modelo && p.anio === anio && p.periodo === per)
  const nuevo = (modelo: string, per: string, m: Partial<ModeloCalc>): ModeloCalc => {
    const p = registro(modelo, per)
    const base: ModeloCalc = {
      modelo,
      nombre: NOMBRES_MODELO[modelo] ?? modelo,
      anio,
      periodo: per,
      estado: 'pendiente',
      importe: null,
      resultado: null,
      desglose: [],
      notas: [],
      plazo: plazoDe(modelo, anio, per),
      ...m,
    }
    if (p?.fecha_presentacion) {
      base.presentado = p
      base.estado = 'presentado'
    } else if (p) {
      base.preparado = p
    }
    return base
  }
  const conResultado = (importe: number, negativo: Resultado = 'compensar'): Pick<ModeloCalc, 'importe' | 'resultado'> => ({
    importe: Math.abs(r2(importe)),
    resultado: Math.abs(importe) < 0.005 ? 'cero' : importe > 0 ? 'ingresar' : negativo,
  })

  // ---------------------------------------------------------------- 303 IVA
  const sin303 = iva.has('recargo') ? 'recargo' : iva.has('exento') ? 'exento' : null
  const manual303 = ['rebu', 'prorrata', 'simplificado', 'reagp', 'reav'].filter((r) => iva.has(r as never))
  if (sin303) {
    modelos.push(
      nuevo('303', periodo, {
        estado: 'no_obligado',
        notas: [
          sin303 === 'recargo'
            ? 'Recargo de equivalencia: no presenta 303, salvo adquisiciones intracomunitarias o inversión del sujeto pasivo.'
            : 'Actividad exenta: no presenta 303 si todas sus operaciones están exentas.',
        ],
      }),
    )
  } else {
    const caja = iva.has('caja')
    const fIva = caja ? facturas.filter((f) => f.estado === 'cobrada' && enT(f.fecha_cobro ?? f.fecha)) : fT
    const gIva = caja ? revisados.filter((g) => g.pagado !== false && enT(g.fecha_pago ?? g.fecha)) : gT
    const rep = suma(fIva, (f) => f.cuota_iva)
    const sop = suma(gIva, (g) => g.cuota_iva)
    const notas: string[] = []
    if (caja) notas.push('Criterio de caja: cuenta el IVA de lo cobrado y pagado en el trimestre.')
    if (manual303.length) notas.push(`Régimen especial (${manual303.map((r) => r.toUpperCase()).join(', ')}): este importe es el del régimen general, solo de referencia.`)
    if (!fT.length && !gT.length) notas.push('Sin actividad en el trimestre: se presenta sin actividad.')
    const intraCompras = gT.filter(proveedorUE)
    if (intraCompras.length) notas.push(`Hay ${intraCompras.length} compra${intraCompras.length === 1 ? '' : 's'} a proveedores de la UE: revisa si llevan autorrepercusión (adquisición intracomunitaria o inversión del sujeto pasivo).`)
    modelos.push(
      nuevo('303', periodo, {
        estado: manual303.length ? 'manual' : 'pendiente',
        ...conResultado(rep - sop, t === 4 ? 'devolver' : 'compensar'),
        desglose: [
          { texto: `IVA repercutido (${fIva.length} factura${fIva.length === 1 ? '' : 's'})`, importe: rep },
          { texto: `IVA soportado (${gIva.length} gasto${gIva.length === 1 ? '' : 's'})`, importe: -sop },
        ],
        notas,
      }),
    )
  }

  // ------------------------------------------------------- 130 / 131 IRPF
  if (forma === 'autonomo' || forma === 'comunidad') {
    if (fiscal.irpf === 'modulos') {
      modelos.push(nuevo('131', periodo, { estado: 'manual', notas: ['Estimación objetiva: el pago sale de los módulos de su actividad, a calcular a mano.'] }))
    } else {
      const fAc = facturas.filter((f) => hastaT(f.fecha))
      const ingresos = suma(fAc, (f) => f.base)
      const gastosAc = suma(
        revisados.filter((g) => hastaT(g.fecha) && g.revision !== 'inmovilizado'),
        (g) => g.base,
      )
      const personal = suma(
        nominas.filter((n) => n.mes <= mesFin),
        (n) => Number(n.coste_total) || Number(n.bruto) + Number(n.ss_empresa),
      )
      let rendimiento = r2(ingresos - gastosAc - personal)
      const desglose = [
        { texto: 'Ingresos del año hasta el trimestre', importe: ingresos },
        { texto: 'Gastos deducibles', importe: -gastosAc },
      ]
      if (personal) desglose.push({ texto: 'Nóminas (bruto + SS empresa)', importe: -personal })
      if (fiscal.irpf !== 'directa_normal' && rendimiento > 0) {
        const dificil = r2(Math.min(rendimiento * 0.05, 2000))
        desglose.push({ texto: 'Gastos de difícil justificación (5%, máx. 2.000€)', importe: -dificil })
        rendimiento = r2(rendimiento - dificil)
      }
      const pago = r2(Math.max(0, rendimiento) * 0.2)
      const retenciones = suma(fAc, (f) => f.cuota_irpf)
      const anteriores = d.presentados.filter(
        (p) => p.modelo === '130' && p.anio === anio && p.fecha_presentacion && ['1T', '2T', '3T'].includes(p.periodo) && Number(p.periodo[0]) < t,
      )
      const pagado = suma(
        anteriores.filter((p) => p.resultado === 'ingresar'),
        (p) => p.importe,
      )
      desglose.push({ texto: `20% del rendimiento (${fmt(rendimiento)}€)`, importe: pago })
      desglose.push({ texto: 'Retenciones de sus facturas', importe: -retenciones })
      if (pagado) desglose.push({ texto: 'Pagos del 130 de trimestres anteriores', importe: -pagado })
      const neto = r2(pago - retenciones - pagado)
      const notas = ['No incluye amortizaciones ni la cuota de autónomos si no está subida como gasto.']
      const faltan = [1, 2, 3].filter((k) => k < t && !anteriores.some((p) => p.periodo === `${k}T`))
      if (faltan.length) notas.push(`No consta el 130 del ${faltan.map((k) => `${k}T`).join(', ')}: si se presentó, márcalo para descontarlo.`)
      const conRet = suma(
        fAc.filter((f) => Number(f.cuota_irpf) > 0),
        (f) => f.base,
      )
      const exento = ingresos > 0 && conRet / ingresos >= 0.7
      if (exento) notas.unshift(`El ${Math.round((conRet / ingresos) * 100)}% de lo facturado lleva retención: probablemente no está obligado (la norma mira el año anterior).`)
      if (neto < 0) notas.push(`Sale negativo (${fmt(neto)}€): se presenta a cero.`)
      modelos.push(
        nuevo('130', periodo, {
          estado: exento ? 'no_obligado' : 'pendiente',
          importe: Math.max(0, neto),
          resultado: neto > 0 ? 'ingresar' : 'cero',
          desglose,
          notas,
        }),
      )
    }
  }

  // ------------------------------------------------------------ 111 y 115
  const nT = nominas.filter((n) => n.mes >= mesIni && n.mes <= mesFin)
  const irpfNominas = suma(nT, (n) => n.irpf)
  const profesionales = gT.filter((g) => Number(g.cuota_irpf) > 0 && g.categoria !== 'alquiler')
  const retProf = suma(profesionales, (g) => g.cuota_irpf)
  if (irpfNominas || retProf || d.trabajadores > 0) {
    const notas: string[] = []
    if (d.trabajadores > 0) {
      const sin = [] as number[]
      for (let m = mesIni; m <= mesFin; m++) if (!nT.some((n) => n.mes === m)) sin.push(m)
      if (sin.length) notas.push(`Tiene ${d.trabajadores} trabajador${d.trabajadores === 1 ? '' : 'es'} y no hay nóminas publicadas de ${sin.map((m) => MESES[m - 1]).join(', ')}.`)
    }
    const borradores = d.nominas.filter((n) => n.estado === 'borrador' && n.anio === anio && n.mes >= mesIni && n.mes <= mesFin).length
    if (borradores) notas.push(`${borradores} nómina${borradores === 1 ? '' : 's'} del trimestre sin publicar: no cuentan.`)
    modelos.push(
      nuevo('111', periodo, {
        ...conResultado(irpfNominas + retProf),
        desglose: [
          { texto: `IRPF de nóminas (${nT.length})`, importe: irpfNominas },
          { texto: `Retenciones a profesionales (${profesionales.length})`, importe: retProf },
        ],
        notas,
      }),
    )
  }
  const alquileres = gT.filter((g) => g.categoria === 'alquiler')
  const conRetAlq = alquileres.filter((g) => Number(g.cuota_irpf) > 0)
  if (conRetAlq.length) {
    modelos.push(
      nuevo('115', periodo, {
        ...conResultado(suma(conRetAlq, (g) => g.cuota_irpf)),
        desglose: conRetAlq.map((g) => ({ texto: `${g.proveedor ?? 'Arrendador'} · ${g.fecha ?? ''}`, importe: Number(g.cuota_irpf) })),
      }),
    )
  } else if (alquileres.length) {
    avisos.push('Paga alquiler sin retención: revisa si el arrendador está exento o si es vivienda.')
  }

  // ------------------------------------------------------------------- 349
  const ventasUE = fT.filter(clienteUE)
  const comprasUE = gT.filter(proveedorUE)
  if (ventasUE.length || comprasUE.length) {
    const notas: string[] = []
    if (!fiscal.roi) notas.push('No consta inscrito en el ROI: márcalo en su régimen fiscal si lo está.')
    const conIva = ventasUE.filter((f) => Number(f.cuota_iva) > 0)
    if (conIva.length) notas.push(`${conIva.length} factura${conIva.length === 1 ? '' : 's'} a clientes de la UE con IVA: revisa si el cliente es empresa (NIF-IVA válido).`)
    modelos.push(
      nuevo('349', periodo, {
        importe: r2(suma(ventasUE, (f) => f.base) + suma(comprasUE, (g) => g.base)),
        resultado: 'informativa',
        desglose: [
          { texto: `Entregas y servicios a la UE (${ventasUE.length})`, importe: suma(ventasUE, (f) => f.base) },
          { texto: `Adquisiciones a la UE (${comprasUE.length})`, importe: suma(comprasUE, (g) => g.base) },
        ],
        notas,
      }),
    )
  }

  // ------------------------------------------------------------------- 202
  if (forma === 'sociedad') {
    const p202 = t === 1 ? '1P' : t === 3 ? '2P' : t === 4 ? '3P' : null
    if (p202) {
      modelos.push(
        nuevo('202', p202, {
          estado: 'recordatorio',
          notas: ['Depende de la cuota del último Impuesto de Sociedades: solo si salió a pagar, o por la base del periodo si factura más de 6 M€.'],
        }),
      )
    }
  }

  // --------------------------------------------------- Anuales (con el 4T)
  if (t === 4) {
    const fA = facturas.filter((f) => delAnio(f.fecha))
    const gA = revisados.filter((g) => delAnio(g.fecha))
    if (!sin303) {
      const rep = suma(fA, (f) => f.cuota_iva)
      const sop = suma(gA, (g) => g.cuota_iva)
      modelos.push(
        nuevo('390', '0A', {
          importe: r2(rep - sop),
          resultado: 'informativa',
          desglose: [
            { texto: 'IVA repercutido del año', importe: rep },
            { texto: 'IVA soportado del año', importe: -sop },
          ],
        }),
      )
    }
    const irpfAnual = suma(nominas, (n) => n.irpf) + suma(gA.filter((g) => Number(g.cuota_irpf) > 0 && g.categoria !== 'alquiler'), (g) => g.cuota_irpf)
    if (irpfAnual > 0) modelos.push(nuevo('190', '0A', { importe: r2(irpfAnual), resultado: 'informativa', desglose: [{ texto: 'Retenciones del año (111)', importe: r2(irpfAnual) }] }))
    const alqAnual = suma(gA.filter((g) => g.categoria === 'alquiler' && Number(g.cuota_irpf) > 0), (g) => g.cuota_irpf)
    if (alqAnual > 0) modelos.push(nuevo('180', '0A', { importe: alqAnual, resultado: 'informativa', desglose: [{ texto: 'Retenciones de alquileres del año (115)', importe: alqAnual }] }))

    // 347: terceros españoles por encima de 3.005,06€ en el año (total con IVA), sin operaciones con retención ni de la UE
    const terceros = new Map<string, { nombre: string; total: number; tipo: 'cliente' | 'proveedor' }>()
    const add = (clave: string, nombre: string, total: number, tipo: 'cliente' | 'proveedor') => {
      const k = `${tipo}:${clave}`
      const x = terceros.get(k) ?? { nombre, total: 0, tipo }
      x.total = r2(x.total + total)
      terceros.set(k, x)
    }
    for (const f of fA) {
      if (Number(f.cuota_irpf) > 0 || clienteExtranjero(f)) continue
      const nombre = f.cliente?.nombre || 'Cliente'
      add((f.cliente?.nif || nombre).toUpperCase(), nombre, Number(f.total), 'cliente')
    }
    for (const g of gA) {
      if (Number(g.cuota_irpf) > 0 || paisDeNif(g.proveedor_nif) || !g.proveedor_nif) continue
      add(g.proveedor_nif.toUpperCase(), g.proveedor || g.proveedor_nif, Number(g.total), 'proveedor')
    }
    const pasan = [...terceros.values()].filter((x) => Math.abs(x.total) > 3005.06).sort((a, b) => b.total - a.total)
    if (pasan.length) {
      modelos.push(
        nuevo('347', '0A', {
          importe: suma(pasan, (x) => x.total),
          resultado: 'informativa',
          desglose: pasan.map((x) => ({ texto: `${x.nombre} (${x.tipo})`, importe: x.total })),
          notas: ['Los gastos sin NIF del proveedor no se pueden agrupar y no están en la lista.'],
        }),
      )
    }
  }

  // ------------------------------------------------------------- Avisos
  const pendientes = d.gastos.filter((g) => g.estado === 'pendiente' && (!g.fecha || hastaT(g.fecha))).length
  if (pendientes) avisos.unshift(`${pendientes} gasto${pendientes === 1 ? '' : 's'} sin revisar: no cuentan hasta que los revises.`)
  if (!d.perfil.fiscal) avisos.push(`Sin régimen fiscal: se supone ${forma === 'autonomo' ? 'autónomo en estimación directa' : forma === 'sociedad' ? 'sociedad' : 'otra entidad'} y régimen general.`)

  return { forma, modelos, avisos }
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** Trimestre que toca presentar hoy: el último cerrado hasta que pasa su plazo; luego, el que está en curso */
export function trimestreAPresentar(hoy = new Date()): { anio: number; t: Trimestre } {
  const y = hoy.getFullYear()
  const iso = `${y}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`
  if (iso <= `${y}-01-30`) return { anio: y - 1, t: 4 }
  if (iso <= `${y}-04-20`) return { anio: y, t: 1 }
  if (iso <= `${y}-07-20`) return { anio: y, t: 2 }
  if (iso <= `${y}-10-20`) return { anio: y, t: 3 }
  return { anio: y, t: 4 }
}
