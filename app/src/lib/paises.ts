/**
 * Países (códigos ISO 3166-1) y provincias de España.
 * En la BD el país se guarda como texto con su nombre en español («España», «Francia»…);
 * aquí se traduce a código para el desplegable y para escribirlo en el idioma de la factura.
 */

const CODIGOS =
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ ' +
  'CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR ' +
  'GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP ' +
  'KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT ' +
  'MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW ' +
  'SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG ' +
  'UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW'
export const CODIGOS_PAIS = CODIGOS.split(' ')

export const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '')

const nombres = new Map<string, Intl.DisplayNames>()
function nombreEn(idioma: string, codigo: string): string {
  let dn = nombres.get(idioma)
  if (!dn) {
    try {
      dn = new Intl.DisplayNames([idioma], { type: 'region' })
    } catch {
      return codigo
    }
    nombres.set(idioma, dn)
  }
  try {
    return dn.of(codigo) ?? codigo
  } catch {
    return codigo
  }
}

/** Nombre del país en español: lo que se guarda en la BD */
export const nombrePais = (codigo: string) => nombreEn('es', codigo)

// Nombre normalizado (en varios idiomas, y el código ISO de 2 y 3 letras más usados) → código
let indice: Map<string, string> | null = null
const EXTRA: Record<string, string> = {
  esp: 'ES', espana: 'ES', spain: 'ES', usa: 'US', eeuu: 'US', estadosunidos: 'US', unitedstates: 'US', uk: 'GB',
  inglaterra: 'GB', granbretana: 'GB', england: 'GB', holanda: 'NL', deu: 'DE', fra: 'FR', ita: 'IT', prt: 'PT',
  gbr: 'GB', schweiz: 'CH', suisse: 'CH', osterreich: 'AT', deutschland: 'DE', belgique: 'BE', vaticano: 'VA',
}
function indicePaises() {
  if (indice) return indice
  indice = new Map(Object.entries(EXTRA))
  for (const c of CODIGOS_PAIS) {
    indice.set(c.toLowerCase(), c)
    for (const idioma of ['es', 'en', 'fr', 'it', 'de', 'pt', 'ca']) {
      const n = norm(nombreEn(idioma, c))
      if (n && !indice.has(n)) indice.set(n, c)
    }
  }
  return indice
}

/** Código ISO a partir del texto guardado («España», «Spain», «ES»…); null si no se reconoce */
export function codigoPais(pais: string | null | undefined): string | null {
  if (!pais?.trim()) return null
  return indicePaises().get(norm(pais)) ?? null
}

/** Texto del país para un documento en ese idioma (si no se reconoce, tal cual) */
export function paisEnIdioma(pais: string | null | undefined, idioma: string): string {
  if (!pais?.trim()) return ''
  const c = codigoPais(pais)
  return c ? nombreEn(idioma, c) : pais.trim()
}

/** España si el país está vacío o es España */
export const esEspana = (pais: string | null | undefined) => !pais?.trim() || codigoPais(pais) === 'ES'

/** Lista para el desplegable, ordenada por nombre, con España y los vecinos arriba */
let lista: { codigo: string; nombre: string }[] | null = null
export const PAISES_ARRIBA = ['ES', 'PT', 'FR', 'IT', 'DE', 'GB', 'US', 'AD']
export function listaPaises() {
  if (!lista)
    lista = CODIGOS_PAIS.map((codigo) => ({ codigo, nombre: nombrePais(codigo) })).sort((a, b) =>
      a.nombre.localeCompare(b.nombre, 'es'),
    )
  return lista
}

/* ----------------------------------------------------- Provincias de España */

/** Por orden de código: las dos primeras cifras del código postal */
export const PROVINCIAS = [
  'Álava', 'Albacete', 'Alicante', 'Almería', 'Ávila', 'Badajoz', 'Illes Balears', 'Barcelona', 'Burgos', 'Cáceres',
  'Cádiz', 'Castellón', 'Ciudad Real', 'Córdoba', 'A Coruña', 'Cuenca', 'Girona', 'Granada', 'Guadalajara', 'Gipuzkoa',
  'Huelva', 'Huesca', 'Jaén', 'León', 'Lleida', 'La Rioja', 'Lugo', 'Madrid', 'Málaga', 'Murcia',
  'Navarra', 'Ourense', 'Asturias', 'Palencia', 'Las Palmas', 'Pontevedra', 'Salamanca', 'Santa Cruz de Tenerife', 'Cantabria', 'Segovia',
  'Sevilla', 'Soria', 'Tarragona', 'Teruel', 'Toledo', 'Valencia', 'Valladolid', 'Bizkaia', 'Zamora', 'Zaragoza',
  'Ceuta', 'Melilla',
]
export const PROVINCIAS_ORDENADAS = [...PROVINCIAS].sort((a, b) => a.localeCompare(b, 'es'))

const ALIAS_PROVINCIA: Record<string, string> = {
  araba: 'Álava', arabaalava: 'Álava', alavaaraba: 'Álava', alacant: 'Alicante', alicantealacant: 'Alicante',
  baleares: 'Illes Balears', islasbaleares: 'Illes Balears', balears: 'Illes Balears', castello: 'Castellón',
  castellondelaplana: 'Castellón', castellonsecastello: 'Castellón', coruna: 'A Coruña', lacoruna: 'A Coruña',
  gerona: 'Girona', guipuzcoa: 'Gipuzkoa', lerida: 'Lleida', orense: 'Ourense', vizcaya: 'Bizkaia',
  nafarroa: 'Navarra', comunidadforaldenavarra: 'Navarra', comunidaddemadrid: 'Madrid', regiondemurcia: 'Murcia',
  principadodeasturias: 'Asturias', tenerife: 'Santa Cruz de Tenerife', grancanaria: 'Las Palmas',
  valenciavalencia: 'Valencia', larioja: 'La Rioja', rioja: 'La Rioja',
}
const INDICE_PROVINCIA = new Map<string, string>(PROVINCIAS.map((p) => [norm(p), p]))

/** Nombre de la lista para lo que venga escrito («Vizcaya» → «Bizkaia»); null si no es una provincia */
export function provinciaDe(texto: string | null | undefined): string | null {
  if (!texto?.trim()) return null
  const n = norm(texto)
  return INDICE_PROVINCIA.get(n) ?? ALIAS_PROVINCIA[n] ?? null
}

/** Provincia por el código postal español (01–52) */
export function provinciaPorCp(cp: string | null | undefined): string | null {
  const m = /^\s*(\d{2})\d{3}\s*$/.exec(cp ?? '')
  if (!m) return null
  return PROVINCIAS[Number(m[1]) - 1] ?? null
}
