import type { OcrResult } from './types'

/**
 * Conversión a euros con el tipo de cambio oficial del Banco Central Europeo
 * del día de la factura (si ese día no hay publicación —fin de semana o festivo—,
 * el último publicado antes). Fuente: api.frankfurter.dev (datos del BCE).
 */
export interface Divisa {
  moneda: string // código ISO de la factura (USD, GBP, AUD…)
  tasa: number // 1 EUR = tasa moneda
  fecha_cambio: string // fecha del cambio del BCE aplicado
  originales: { base: number | null; cuota_iva: number | null; cuota_irpf: number | null; total: number | null }
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const cache = new Map<string, { tasa: number; fecha: string }>()

export const esEuro = (moneda: string | null | undefined) => !moneda || moneda.trim().toUpperCase() === 'EUR' || moneda.trim() === '€'

export async function cambioBCE(moneda: string, fecha: string | null): Promise<{ tasa: number; fecha: string }> {
  const m = moneda.trim().toUpperCase()
  const hoy = new Date().toISOString().slice(0, 10)
  const dia = fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) && fecha <= hoy ? fecha : 'latest'
  const clave = `${m}|${dia}`
  const enCache = cache.get(clave)
  if (enCache) return enCache
  let res: Response
  try {
    res = await fetch(`https://api.frankfurter.dev/v1/${dia}?base=EUR&symbols=${encodeURIComponent(m)}`)
  } catch {
    throw new Error('No se ha podido consultar el cambio del BCE (sin conexión)')
  }
  const json = res.ok ? ((await res.json()) as { date: string; rates: Record<string, number> }) : null
  const tasa = json?.rates?.[m]
  if (!tasa) throw new Error(`El BCE no publica cambio para ${m}`)
  const out = { tasa, fecha: json!.date }
  cache.set(clave, out)
  return out
}

const conv = (n: number | null, tasa: number) => (n === null || n === undefined ? n : r2(Number(n) / tasa))

/** Pasa a euros todos los importes leídos; guarda los originales y el cambio en `divisa` */
export async function aEuros(o: OcrResult, fecha = o.fecha): Promise<OcrResult> {
  const original = o.divisa?.originales
  const moneda = o.divisa?.moneda ?? o.moneda
  if (esEuro(moneda)) return o
  // Si ya estaba convertida (p. ej. cambia la fecha), se parte de los importes originales
  const base = original ? { ...o, ...deshacer(o) } : o
  const { tasa, fecha: fecha_cambio } = await cambioBCE(moneda!, fecha)
  return {
    ...base,
    moneda: 'EUR',
    desglose_iva: base.desglose_iva.map((d) => ({ ...d, base: r2(d.base / tasa), cuota: r2(d.cuota / tasa) })),
    base_total: conv(base.base_total, tasa),
    cuota_iva_total: conv(base.cuota_iva_total, tasa),
    cuota_irpf: conv(base.cuota_irpf, tasa),
    total: conv(base.total, tasa),
    divisa: {
      moneda: moneda!.trim().toUpperCase(),
      tasa,
      fecha_cambio,
      originales: { base: base.base_total, cuota_iva: base.cuota_iva_total, cuota_irpf: base.cuota_irpf, total: base.total },
    },
  }
}

/** Vuelve a los importes en la moneda original (para recalcular con otra fecha) */
function deshacer(o: OcrResult): Partial<OcrResult> {
  const d = o.divisa!
  return {
    moneda: d.moneda,
    desglose_iva: o.desglose_iva.map((x) => ({ ...x, base: r2(x.base * d.tasa), cuota: r2(x.cuota * d.tasa) })),
    base_total: d.originales.base,
    cuota_iva_total: d.originales.cuota_iva,
    cuota_irpf: d.originales.cuota_irpf,
    total: d.originales.total,
    divisa: undefined,
  }
}

/** Columnas que se guardan en el gasto o la factura */
export const columnasDivisa = (o: OcrResult | null) =>
  o?.divisa
    ? { moneda: o.divisa.moneda, importe_original: o.divisa.originales.total, tipo_cambio: o.divisa.tasa, fecha_cambio: o.divisa.fecha_cambio }
    : { moneda: 'EUR', importe_original: null, tipo_cambio: null, fecha_cambio: null }

/** 1.234,56 USD */
export function importeMoneda(n: number | null | undefined, moneda: string) {
  const v = Number(n ?? 0)
  const [e, f] = Math.abs(v).toFixed(2).split('.')
  return `${v < 0 ? '-' : ''}${e.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${f} ${moneda}`
}
