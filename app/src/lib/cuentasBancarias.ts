/**
 * Cuentas bancarias de la empresa en varias monedas (supabase/cuentas-bancarias.sql) y factura en otra moneda.
 *
 * - Las cuentas viven en profiles.cuentas_bancarias (Configuración → «Cuentas bancarias»).
 *   La cuenta en euros por defecto se copia también en profiles.iban (correos, facturación automática…).
 * - En la factura se teclea en euros. Si sale en otra moneda (USD, GBP…), cada precio se convierte al
 *   cambio del BCE del día de la factura; la contabilidad sigue en euros con los importes tecleados.
 * - invoices.cuentas_cobro guarda una copia de las cuentas elegidas para esa factura.
 *
 * Sin nada del navegador: lo usan también las funciones del servidor (enviar-factura).
 */
import { calcularTotales } from './totals'
import { codigoPais } from './paises'
import { idiomaDePais } from './idiomaFactura'
import { eur, round2 } from './format'
import type { Idioma } from './idiomaFactura'
import type { Emisor, Linea } from './types'

export interface CuentaBancaria {
  id: string
  /** Código ISO de la moneda: EUR, USD, GBP… */
  moneda: string
  /** Nombre para reconocerla: «BBVA», «Wise USD»… (no sale en la factura) */
  alias: string
  banco?: string | null
  /** Titular, si no es el nombre fiscal de la empresa */
  titular?: string | null
  iban?: string | null
  /** Número de cuenta local (EE. UU., Reino Unido, Australia, Canadá…) */
  numero?: string | null
  /** Routing number (EE. UU.), sort code (Reino Unido), BSB (Australia)… */
  codigo_local?: string | null
  swift?: string | null
  direccion_banco?: string | null
  /** La que se pone por defecto en las facturas de esa moneda */
  predeterminada?: boolean
}

/* ------------------------------------------------------------ Monedas */

export interface InfoMoneda {
  codigo: string
  nombre: string
  /** Cómo se identifica la cuenta en ese país */
  formato: 'iban' | 'local'
  /** Nombre del código bancario local (si lo hay) */
  local?: string
  /** Placeholder del código local */
  ejemploLocal?: string
}

/** Las que publica el BCE (las únicas que se pueden convertir al día) */
export const MONEDAS: InfoMoneda[] = [
  { codigo: 'EUR', nombre: 'Euro', formato: 'iban' },
  { codigo: 'USD', nombre: 'Dólar estadounidense', formato: 'local', local: 'Routing number (ACH)', ejemploLocal: '026073150' },
  { codigo: 'GBP', nombre: 'Libra esterlina', formato: 'local', local: 'Sort code', ejemploLocal: '23-14-70' },
  { codigo: 'CHF', nombre: 'Franco suizo', formato: 'iban' },
  { codigo: 'CAD', nombre: 'Dólar canadiense', formato: 'local', local: 'Institution + transit', ejemploLocal: '621-16001' },
  { codigo: 'AUD', nombre: 'Dólar australiano', formato: 'local', local: 'BSB', ejemploLocal: '802-985' },
  { codigo: 'NZD', nombre: 'Dólar neozelandés', formato: 'local' },
  { codigo: 'MXN', nombre: 'Peso mexicano', formato: 'local', local: 'CLABE', ejemploLocal: '002010077777777771' },
  { codigo: 'BRL', nombre: 'Real brasileño', formato: 'local' },
  { codigo: 'JPY', nombre: 'Yen japonés', formato: 'local' },
  { codigo: 'SEK', nombre: 'Corona sueca', formato: 'iban' },
  { codigo: 'NOK', nombre: 'Corona noruega', formato: 'iban' },
  { codigo: 'DKK', nombre: 'Corona danesa', formato: 'iban' },
  { codigo: 'PLN', nombre: 'Esloti polaco', formato: 'iban' },
  { codigo: 'CZK', nombre: 'Corona checa', formato: 'iban' },
  { codigo: 'HUF', nombre: 'Forinto húngaro', formato: 'iban' },
  { codigo: 'RON', nombre: 'Leu rumano', formato: 'iban' },
  { codigo: 'SGD', nombre: 'Dólar de Singapur', formato: 'local' },
  { codigo: 'HKD', nombre: 'Dólar de Hong Kong', formato: 'local' },
  { codigo: 'CNY', nombre: 'Yuan chino', formato: 'local' },
  { codigo: 'INR', nombre: 'Rupia india', formato: 'local', local: 'IFSC', ejemploLocal: 'HDFC0000001' },
  { codigo: 'ZAR', nombre: 'Rand sudafricano', formato: 'local' },
  { codigo: 'ILS', nombre: 'Séquel israelí', formato: 'iban' },
  { codigo: 'TRY', nombre: 'Lira turca', formato: 'iban' },
]

export const infoMoneda = (codigo: string | null | undefined): InfoMoneda =>
  MONEDAS.find((m) => m.codigo === (codigo ?? '').toUpperCase()) ?? { codigo: (codigo ?? 'EUR').toUpperCase(), nombre: codigo ?? '', formato: 'iban' }

export const esEur = (moneda: string | null | undefined) => !moneda || moneda.toUpperCase() === 'EUR'

/** Moneda local del país del cliente (por su nombre guardado: «Estados Unidos», «Reino Unido»…). EUR en la zona euro o si no se sabe */
const MONEDA_PAIS: Record<string, string> = {
  US: 'USD', PR: 'USD', GB: 'GBP', JE: 'GBP', GG: 'GBP', IM: 'GBP', CH: 'CHF', LI: 'CHF', CA: 'CAD', AU: 'AUD',
  NZ: 'NZD', MX: 'MXN', BR: 'BRL', JP: 'JPY', SE: 'SEK', NO: 'NOK', DK: 'DKK', PL: 'PLN', CZ: 'CZK', HU: 'HUF',
  RO: 'RON', SG: 'SGD', HK: 'HKD', CN: 'CNY', IN: 'INR', ZA: 'ZAR', IL: 'ILS', TR: 'TRY',
}
export function monedaDePais(pais: string | null | undefined): string {
  const c = codigoPais(pais)
  return (c && MONEDA_PAIS[c]) || 'EUR'
}

/** 1.234,56€ en euros; 1.234,56 USD en cualquier otra moneda */
export function dinero(n: number | null | undefined, moneda: string | null | undefined = 'EUR'): string {
  const e = eur(n)
  return esEur(moneda) ? e : `${e.slice(0, -1)} ${moneda!.toUpperCase()}`
}

/* ------------------------------------------------------------ Cuentas de la empresa */

/** Las cuentas de la empresa; si aún no las ha configurado, su «IBAN para cobros» como cuenta en euros */
export function cuentasDe(perfil: { cuentas_bancarias?: CuentaBancaria[] | null; iban?: string | null } | null | undefined): CuentaBancaria[] {
  const lista = Array.isArray(perfil?.cuentas_bancarias) ? perfil!.cuentas_bancarias! : []
  if (lista.length) return lista
  const iban = perfil?.iban?.trim()
  return iban ? [{ id: 'iban-perfil', moneda: 'EUR', alias: 'Cuenta principal', iban, predeterminada: true }] : []
}

/** La predeterminada de esa moneda, o la primera que haya */
export function cuentaPorDefecto(cuentas: CuentaBancaria[], moneda: string): CuentaBancaria | null {
  const deMoneda = cuentas.filter((c) => c.moneda === moneda.toUpperCase())
  return deMoneda.find((c) => c.predeterminada) ?? deMoneda[0] ?? null
}

/** Monedas en las que la empresa tiene alguna cuenta */
export const monedasConCuenta = (cuentas: CuentaBancaria[]) => [...new Set(cuentas.map((c) => c.moneda))]

/**
 * Lo que se propone al elegir cliente: si la empresa tiene cuenta en la moneda de su país (dólares a EE. UU.,
 * libras a Reino Unido…), la factura sale en esa moneda con esa cuenta y además la de euros. Si no, en euros.
 */
export function cobroPropuesto(cuentas: CuentaBancaria[], paisCliente: string | null | undefined) {
  const local = monedaDePais(paisCliente)
  const cuentaLocal = esEur(local) ? null : cuentaPorDefecto(cuentas, local)
  const cuentaEur = cuentaPorDefecto(cuentas, 'EUR')
  return cuentaLocal
    ? { moneda: local, cuentaLocal: cuentaLocal.id, cuentaEur: cuentaEur?.id ?? null }
    : { moneda: 'EUR', cuentaLocal: null, cuentaEur: cuentaEur?.id ?? null }
}

/** Cómo se ve la cuenta en una lista: «BBVA · ES12 ···· 3456» */
export function resumenCuenta(c: CuentaBancaria): string {
  const id = c.iban?.replace(/\s+/g, '') || c.numero?.replace(/\s+/g, '') || ''
  const cola = id ? `···· ${id.slice(-4)}` : ''
  return [c.alias || c.banco || c.moneda, cola].filter(Boolean).join(' · ')
}

export const ibanBonito = (iban: string) =>
  iban.toUpperCase().replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim()

/* ------------------------------------------------------------ Textos para la factura */

const ETIQUETAS: Record<Idioma, { numero: string; banco: string; titular: string; direccion: string }> = {
  es: { numero: 'Nº de cuenta', banco: 'Banco', titular: 'Titular', direccion: 'Dirección del banco' },
  en: { numero: 'Account number', banco: 'Bank', titular: 'Beneficiary', direccion: 'Bank address' },
  it: { numero: 'Numero di conto', banco: 'Banca', titular: 'Beneficiario', direccion: 'Indirizzo della banca' },
  fr: { numero: 'N° de compte', banco: 'Banque', titular: 'Bénéficiaire', direccion: 'Adresse de la banque' },
  de: { numero: 'Kontonummer', banco: 'Bank', titular: 'Begünstigter', direccion: 'Adresse der Bank' },
  pt: { numero: 'Número da conta', banco: 'Banco', titular: 'Beneficiário', direccion: 'Morada do banco' },
}

/**
 * Datos de la cuenta para la factura, en pares [etiqueta, valor]: los que hacen falta para pagar
 * (IBAN o número, código local y SWIFT) y los demás (banco, dirección, titular)
 */
export function datosCuenta(c: CuentaBancaria, idioma: Idioma): { principales: [string, string][]; otros: [string, string][] } {
  const E = ETIQUETAS[idioma]
  const m = infoMoneda(c.moneda)
  const principales: [string, string][] = []
  const otros: [string, string][] = []
  if (c.iban?.trim()) principales.push(['IBAN', ibanBonito(c.iban)])
  if (c.numero?.trim()) principales.push([E.numero, c.numero.trim()])
  if (c.codigo_local?.trim()) principales.push([m.local ?? 'Code', c.codigo_local.trim()])
  if (c.swift?.trim()) principales.push(['SWIFT/BIC', c.swift.trim().toUpperCase()])
  if (c.banco?.trim()) otros.push([E.banco, c.banco.trim()])
  if (c.direccion_banco?.trim()) otros.push([E.direccion, c.direccion_banco.trim()])
  if (c.titular?.trim()) otros.push([E.titular, c.titular.trim()])
  return { principales, otros }
}

/** En una línea, para el correo: «IBAN ES12 3456 … · SWIFT/BIC BBVAESMM» */
export const textoCuenta = (c: CuentaBancaria, idioma: Idioma) =>
  datosCuenta(c, idioma)
    .principales.map(([k, v]) => `${k} ${v}`)
    .join(' · ')

/* ------------------------------------------------------------ Factura en otra moneda */

type ConCobro = {
  moneda?: string | null
  tipo_cambio?: number | null
  cuentas_cobro?: CuentaBancaria[] | null
  lineas: Linea[]
  irpf_pct: number | string
}

/** Precios pasados a la moneda de la factura (redondeados a céntimos) */
export const lineasEnMoneda = (lineas: Linea[], tasa: number): Linea[] =>
  lineas.map((l) => ({ ...l, precio: round2(Number(l.precio) * tasa) }))

/**
 * Importes tal como salen en la factura: en su moneda si no es en euros (con el cambio guardado),
 * o en euros. Los totales salen de las líneas ya convertidas, para que la factura cuadre en esa moneda.
 */
export function importesFactura(d: ConCobro) {
  const moneda = (d.moneda || 'EUR').toUpperCase()
  const tasa = Number(d.tipo_cambio) || 0
  const convertir = !esEur(moneda) && tasa > 0
  const lineas = convertir ? lineasEnMoneda(d.lineas ?? [], tasa) : d.lineas ?? []
  const totales = calcularTotales(lineas, Number(d.irpf_pct))
  return { moneda: convertir ? moneda : 'EUR', tasa: convertir ? tasa : 1, convertida: convertir, lineas, totales }
}

/** Cuentas que salen en la factura: las elegidas o, en las de antes, el IBAN del emisor */
export function cuentasDeFactura(d: { cuentas_cobro?: CuentaBancaria[] | null }, emisor: Emisor | null | undefined): CuentaBancaria[] {
  if (Array.isArray(d.cuentas_cobro) && d.cuentas_cobro.length) return d.cuentas_cobro
  const iban = emisor?.iban?.trim()
  return iban ? [{ id: 'iban-emisor', moneda: 'EUR', alias: '', iban }] : []
}

/** Copia de las cuentas elegidas para guardarla en la factura (la de su moneda primero) */
export function copiaCuentas(cuentas: CuentaBancaria[], ids: (string | null)[]): CuentaBancaria[] {
  return ids
    .filter((id): id is string => Boolean(id))
    .map((id) => cuentas.find((c) => c.id === id))
    .filter((c): c is CuentaBancaria => Boolean(c))
    .map(({ predeterminada: _p, ...c }) => c)
}

/**
 * Lo que necesita el correo de la factura: importes en su moneda y cómo pagar
 * (todas las cuentas elegidas en una línea) y si el PDF lleva QR SEPA.
 */
export function cobroParaCorreo(
  inv: ConCobro & { cliente?: { pais?: string | null } | null },
  emisor: Emisor | null | undefined,
): { moneda: string; total: number; lineas: Linea[]; pago: string | null; qr: boolean } {
  const imp = importesFactura(inv)
  const cuentas = cuentasDeFactura(inv, emisor)
  // El correo va en español o en inglés (el PDF, en el idioma del cliente)
  const lengua: Idioma = idiomaDePais(inv.cliente?.pais) === 'es' ? 'es' : 'en'
  const textos = cuentas
    .map((c) => {
      const t = textoCuenta(c, lengua)
      return t && cuentas.length > 1 ? `${t} (${c.moneda})` : t
    })
    .filter(Boolean)
  return {
    moneda: imp.moneda,
    total: imp.totales.total,
    lineas: imp.lineas,
    pago: textos.length ? textos.join(lengua === 'es' ? ' o ' : ' or ') : null,
    qr: esEur(imp.moneda) && cuentas.some((c) => esEur(c.moneda) && Boolean(c.iban?.trim())),
  }
}
