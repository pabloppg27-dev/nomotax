/**
 * Festivos que cuenta la app: nacionales y autonómicos del BOE (festivosDatos.ts) según la provincia del
 * centro de trabajo (o de la empresa), más los locales que pone cada empresa (tabla festivos_empresa).
 * Lo usan las vacaciones (días laborables) y el informe semanal de jornada.
 */
import { ANIOS_FESTIVOS, COMUNIDAD_DE_PROVINCIA, COMUNIDADES, FESTIVOS, type Comunidad } from './festivosDatos.ts'
import { provinciaDe } from './paises.ts'

export { COMUNIDADES, ANIOS_FESTIVOS, type Comunidad }

export interface FestivoLocal {
  id?: string
  fecha: string
  nombre: string
}

/** Comunidad autónoma de una provincia escrita de cualquier forma («Vizcaya», «Barcelona»…) */
export function comunidadDe(provincia: string | null | undefined): Comunidad | null {
  const p = provinciaDe(provincia)
  return p ? (COMUNIDAD_DE_PROVINCIA[p] ?? null) : null
}

/** Las fiestas que están en todas las comunidades (si no se sabe dónde trabaja) */
let comunes: [string, string][] | null = null
function festivosComunes(): [string, string][] {
  if (comunes) return comunes
  const listas = Object.values(FESTIVOS)
  comunes = listas[0].filter(([f]) => listas.every((l) => l.some(([g]) => g === f)))
  return comunes
}

/** fecha (AAAA-MM-DD) → nombre de la fiesta. Locales al final: si coinciden, manda el nombre local. */
export function festivosDe(comunidad: Comunidad | null, locales: FestivoLocal[] = []): Map<string, string> {
  const m = new Map<string, string>(comunidad ? FESTIVOS[comunidad] : festivosComunes())
  for (const l of locales) m.set(l.fecha, l.nombre)
  return m
}

/** ¿Tenemos el calendario oficial de ese año? (si no, solo cuentan los locales) */
export const hayCalendario = (anio: number) => ANIOS_FESTIVOS.includes(anio)

/** Provincia donde trabaja: la de su centro de trabajo; si no tiene, la de la empresa */
export function provinciaDeTrabajo(
  centroId: string | null | undefined,
  centros: { id: string; provincia: string | null; cp?: string | null }[],
  empresa: { provincia: string | null } | null | undefined,
): string | null {
  const c = centroId ? centros.find((x) => x.id === centroId) : null
  return c?.provincia || (centros.length === 1 ? centros[0].provincia : null) || empresa?.provincia || null
}
