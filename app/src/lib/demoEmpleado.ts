/**
 * Datos de ejemplo para ver «Mi espacio» como empleado en local (npm run dev con ?verComo=empleado).
 * Nada de esto llega a producción: solo se usa si import.meta.env.DEV y no hay trabajador vinculado.
 * Nómina española típica: 2.200€ brutos al mes con pagas prorrateadas, SS del trabajador 6,50%
 * (contingencias comunes 4,70 + desempleo 1,55 + formación 0,10 + MEI 0,15) e IRPF del 12%.
 */
import type { Nomina, Trabajador } from './types'

const redondea = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

function nomina(mes: number, variables = 0): Nomina {
  const base = 2200
  const bruto = redondea(base + variables)
  const ss = redondea(bruto * 0.065)
  const irpf = redondea(bruto * 0.12)
  const ssEmpresa = redondea(bruto * 0.3215) // 23,60 + 5,50 + 0,20 + 0,60 + 0,75 + AT/EP 1,50
  return {
    id: `demo-${mes}`,
    owner_id: 'demo',
    trabajador_id: 'demo',
    anio: 2026,
    mes,
    tipo: 'mensual',
    estado: 'publicada',
    file_path: '',
    nombre_leido: null,
    dni_leido: null,
    bruto,
    neto: redondea(bruto - ss - irpf),
    irpf,
    irpf_pct: 12,
    ss_trabajador: ss,
    ss_empresa: ssEmpresa,
    variables,
    coste_total: redondea(bruto + ssEmpresa),
    conceptos: variables ? [{ concepto: 'Horas extra', importe: variables }] : null,
    ocr: null,
    publicada_at: null,
    created_at: `2026-${String(mes).padStart(2, '0')}-28`,
  }
}

/** Enero a octubre de 2026 publicadas; en marzo y junio hay variables (horas extra y comisión) */
export const NOMINAS_DEMO: Nomina[] = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((m) => nomina(m, m === 3 ? 120 : m === 6 ? 250 : 0))

export const FICHA_DEMO = {
  puesto: 'Técnico administrativo',
  fecha_inicio: '2024-03-04',
  jornada: 'completa',
  horas_semana: null,
  salario_bruto_mensual: 2200,
  pagas: 12,
} as unknown as Trabajador

export const DOCS_DEMO = [
  { id: 'd5', tipo: 'certificado_retenciones', nombre: null, path: '', created_at: '2026-01-30T10:00:00Z', anio: 2025 },
  { id: 'd6', tipo: 'certificado_retenciones', nombre: null, path: '', created_at: '2025-01-31T10:00:00Z', anio: 2024 },
  { id: 'd1', tipo: 'contrato', nombre: null, path: '', created_at: '2024-03-01T10:00:00Z' },
  { id: 'd2', tipo: 'alta_ss', nombre: null, path: '', created_at: '2024-03-04T10:00:00Z' },
  { id: 'd3', tipo: 'modelo_145', nombre: null, path: '', created_at: '2024-03-04T10:05:00Z' },
  { id: 'd4', tipo: 'dni', nombre: null, path: '', created_at: '2024-03-01T09:50:00Z' },
]
