// Factura mensual de NomoTax a cada cliente según su plan.
// Lo usa la Edge Function facturar-planes (empaquetada con scripts/empaquetar-facturar.mjs).
// Sin dependencias del navegador.

import { cuotaCliente } from './planes'
import type { Linea } from './types'

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

export const IVA_NOMOTAX = 21
export const IRPF_NOMOTAX = 15

interface PerfilFacturable {
  plan?: string | null
  plan_periodo?: 'mensual' | 'anual' | null
  plan_proximo_cobro?: string | null
  plan_precio?: number | string | null
  plan_nominas?: number | null
  plan_nomina_precio?: number | string | null
}

const partes = (iso: string) => iso.slice(0, 10).split('-').map(Number) as [number, number, number]
const ultimoDia = (anio: number, mes1: number) => new Date(anio, mes1, 0).getDate()

/** «diciembre 26» */
const mesCorto = (anio: number, mes1: number) => `${MESES[mes1 - 1]} ${String(anio).slice(2)}`

/**
 * Si a este cliente le toca factura el día `hoy` (YYYY-MM-DD), devuelve sus líneas.
 * - Mensual: plan + laboral cada mes, el mismo día que su fecha de cobro.
 * - Anual: el plan una vez al año (en el aniversario) y el laboral cada mes.
 */
export function facturaDelDia(p: PerfilFacturable, hoy: string): { lineas: Linea[]; resumen: string } | null {
  const cuota = cuotaCliente(p)
  if (!cuota || !p.plan_proximo_cobro) return null
  const inicio = p.plan_proximo_cobro.slice(0, 10)
  if (hoy < inicio) return null

  const [yI, mI, dI] = partes(inicio)
  const [y, m, d] = partes(hoy)
  // ¿Hoy es «su día» del mes? (31 → último día en meses cortos)
  if (d !== Math.min(dI, ultimoDia(y, m))) return null
  const mesesDesdeInicio = (y - yI) * 12 + (m - mI)
  const tocaPlan = cuota.periodo === 'mensual' || mesesDesdeInicio % 12 === 0

  const lineas: Linea[] = []
  if (tocaPlan) {
    let titulo: string
    if (cuota.periodo === 'anual') {
      const fin = new Date(y, m - 1 + 11, 1)
      titulo = `${cuota.plan.nombre} · anualidad ${MESES_CORTOS[m - 1]} ${String(y).slice(2)} – ${MESES_CORTOS[fin.getMonth()]} ${String(fin.getFullYear()).slice(2)}`
    } else {
      titulo = `${cuota.plan.nombre} · ${mesCorto(y, m)}`
    }
    lineas.push({ concepto: `Plan ${titulo}\nAsesoría fiscal y contable`, cantidad: 1, precio: cuota.cantidad, iva: IVA_NOMOTAX })
  }
  if (cuota.laboral) {
    lineas.push({
      concepto: `Gestión laboral · ${mesCorto(y, m)}\nNóminas y seguros sociales`,
      cantidad: cuota.laboral.nominas,
      precio: cuota.laboral.precio,
      iva: IVA_NOMOTAX,
    })
  }
  if (!lineas.length) return null
  const resumen = [tocaPlan ? 'Asesoría fiscal y contable' : null, cuota.laboral ? 'gestión laboral' : null].filter(Boolean).join(' y ')
  return { lineas, resumen: `${resumen.charAt(0).toUpperCase()}${resumen.slice(1)} · ${mesCorto(y, m)}` }
}
