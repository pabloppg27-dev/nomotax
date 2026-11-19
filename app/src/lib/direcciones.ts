/**
 * Autocompletado de direcciones.
 * Con VITE_GOOGLE_MAPS_KEY usa Google Places (API de Maps JavaScript, «Places API (New)»).
 * Sin clave cae a Photon (OpenStreetMap, gratis y sin clave) para poder probar en local.
 * La clave de Google es pública por diseño: se limita en Google Cloud a los dominios de la app.
 */
import { esEspana, nombrePais, provinciaDe, provinciaPorCp } from './paises'

export interface Sugerencia {
  id: string
  principal: string
  secundario: string
  /** Solo Photon: los datos ya vienen en la sugerencia */
  datos?: DireccionPartes
}

export interface DireccionPartes {
  direccion: string
  cp: string
  ciudad: string
  provincia: string
  pais: string
}

const CLAVE = import.meta.env.VITE_GOOGLE_MAPS_KEY as string | undefined
export const PROVEEDOR: 'google' | 'osm' = CLAVE ? 'google' : 'osm'

/* ------------------------------------------------------------------ Google */

/* eslint-disable @typescript-eslint/no-explicit-any */
let cargaGoogle: Promise<any> | null = null
function places(): Promise<any> {
  if (cargaGoogle) return cargaGoogle
  cargaGoogle = new Promise((ok, mal) => {
    const w = window as any
    if (w.google?.maps?.importLibrary) return ok(w.google.maps.importLibrary('places'))
    const nombre = '__nomotaxMaps'
    w[nombre] = () => ok(w.google.maps.importLibrary('places'))
    const s = document.createElement('script')
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(CLAVE!)}&v=weekly&loading=async&language=es&callback=${nombre}`
    s.async = true
    s.onerror = () => {
      cargaGoogle = null
      mal(new Error('No se pudo cargar Google Maps'))
    }
    document.head.appendChild(s)
  })
  return cargaGoogle
}

/** Una sesión = escribir + elegir: Google cobra la sesión entera como una sola búsqueda */
let sesion: any = null
const predicciones = new Map<string, any>()

async function sugerenciasGoogle(texto: string, soloEspana: boolean): Promise<Sugerencia[]> {
  const lib = await places()
  sesion ??= new lib.AutocompleteSessionToken()
  const { suggestions } = await lib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
    input: texto,
    sessionToken: sesion,
    language: 'es',
    region: 'es',
    ...(soloEspana ? { includedRegionCodes: ['es'] } : {}),
  })
  predicciones.clear()
  return (suggestions as any[])
    .map((s) => s.placePrediction)
    .filter(Boolean)
    .map((p: any) => {
      predicciones.set(p.placeId, p)
      return {
        id: p.placeId as string,
        principal: (p.mainText?.text ?? p.text?.text ?? '') as string,
        secundario: (p.secondaryText?.text ?? '') as string,
      }
    })
}

// Países donde el número va delante de la calle
const NUMERO_DELANTE = new Set(['US', 'GB', 'IE', 'CA', 'AU', 'NZ', 'FR', 'BE', 'LU', 'ZA', 'IN', 'PH'])

async function detalleGoogle(id: string): Promise<DireccionPartes | null> {
  const p = predicciones.get(id)
  if (!p) return null
  const lugar = p.toPlace()
  await lugar.fetchFields({ fields: ['addressComponents'] })
  sesion = null // la sesión termina al pedir el detalle
  const comp = (lugar.addressComponents ?? []) as { longText: string; shortText: string; types: string[] }[]
  const de = (tipo: string, corto = false) => {
    const c = comp.find((x) => x.types.includes(tipo))
    return c ? (corto ? c.shortText : c.longText) : ''
  }
  const pais = de('country', true).toUpperCase()
  const calle = de('route')
  const numero = de('street_number')
  const piso = de('subpremise')
  let direccion = calle
    ? numero
      ? NUMERO_DELANTE.has(pais)
        ? `${numero} ${calle}`
        : pais === 'ES'
          ? `${calle}, ${numero}`
          : `${calle} ${numero}`
      : calle
    : de('premise') || p.mainText?.text || ''
  if (piso) direccion += `, ${piso}`
  return partes({
    direccion,
    cp: de('postal_code'),
    ciudad: de('locality') || de('postal_town') || de('administrative_area_level_3') || de('administrative_area_level_2'),
    // España: la provincia es el nivel 2 (y se corrige por el CP); Italia: nivel 2 (sigla); resto: estado o región
    provincia:
      pais === 'IT'
        ? de('administrative_area_level_2', true)
        : pais === 'ES'
          ? de('administrative_area_level_2')
          : de('administrative_area_level_1') || de('administrative_area_level_2'),
    provinciaNivel1: de('administrative_area_level_1'),
    codigoPais: pais,
  })
}

/* ------------------------------------------------------------------ Photon */

async function sugerenciasOsm(texto: string, soloEspana: boolean, senal: AbortSignal): Promise<Sugerencia[]> {
  // Sesgo hacia el centro de España
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(texto)}&limit=8&lat=40.4&lon=-3.7&layer=house&layer=street`
  const r = await fetch(url, { signal: senal })
  if (!r.ok) throw new Error('Sin respuesta del buscador de direcciones')
  const j = (await r.json()) as { features: { properties: Record<string, string> }[] }
  return j.features
    .map((f) => f.properties)
    .filter((p) => !soloEspana || p.countrycode === 'ES')
    .map((p, i) => {
      const cc = (p.countrycode ?? '').toUpperCase()
      const calle = p.street || (p.type === 'street' ? p.name : '') || p.name || ''
      const numero = p.housenumber ?? ''
      const direccion = numero ? (NUMERO_DELANTE.has(cc) ? `${numero} ${calle}` : cc === 'ES' ? `${calle}, ${numero}` : `${calle} ${numero}`) : calle
      const datos = partes({
        direccion,
        cp: p.postcode ?? '',
        ciudad: p.city || p.town || p.village || p.district || '',
        provincia: (cc === 'ES' ? p.county || p.state : p.state || p.county) || '',
        provinciaNivel1: p.state ?? '',
        codigoPais: cc,
      })
      return {
        id: `${p.osm_type}${p.osm_id}-${i}`,
        principal: direccion,
        secundario: [datos.cp, datos.ciudad, datos.pais].filter(Boolean).join(', '),
        datos,
      }
    })
    .filter((s) => s.principal)
}

/* ------------------------------------------------------------------ Común */

function partes(d: {
  direccion: string
  cp: string
  ciudad: string
  provincia: string
  provinciaNivel1: string
  codigoPais: string
}): DireccionPartes {
  const pais = d.codigoPais ? nombrePais(d.codigoPais) : ''
  let provincia = d.provincia
  if (d.codigoPais === 'ES' || (!d.codigoPais && esEspana(pais)))
    provincia = provinciaPorCp(d.cp) ?? provinciaDe(d.provincia) ?? provinciaDe(d.provinciaNivel1) ?? d.provincia
  return { direccion: d.direccion.trim(), cp: d.cp, ciudad: d.ciudad, provincia, pais }
}

export async function buscarDirecciones(texto: string, soloEspana: boolean, senal: AbortSignal): Promise<Sugerencia[]> {
  if (texto.trim().length < 3) return []
  return PROVEEDOR === 'google' ? sugerenciasGoogle(texto, soloEspana) : sugerenciasOsm(texto, soloEspana, senal)
}

export async function detalleDireccion(s: Sugerencia): Promise<DireccionPartes | null> {
  if (s.datos) return s.datos
  return PROVEEDOR === 'google' ? detalleGoogle(s.id) : null
}

/** Una línea con todo, para campos de dirección de una sola casilla */
export function direccionEnLinea(d: DireccionPartes): string {
  const lugar = [d.cp, d.ciudad].filter(Boolean).join(' ')
  const prov = d.provincia && d.provincia !== d.ciudad ? d.provincia : ''
  return [d.direccion, lugar, prov, esEspana(d.pais) ? '' : d.pais].filter(Boolean).join(', ')
}
