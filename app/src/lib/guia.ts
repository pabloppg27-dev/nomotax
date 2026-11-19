/**
 * Guía rápida del empleado (primer inicio de sesión). Aquí solo el estado compartido:
 * - simulando: mientras dura la guía, fichar y pedir más retención no se guardan (se simulan en memoria).
 * - avisarGuia(): las pantallas avisan de lo que ha hecho la persona para que la guía avance.
 * La guía en sí está en components/GuiaEmpleado.tsx.
 */
import { createContext, useContext } from 'react'
import type { RolEnCuenta } from './types'

export type EventoGuia = 'fichado' | 'irpf-abierto' | 'irpf-enviada'

export interface GuiaState {
  /** La guía está en marcha: lo que se pulse es de prueba */
  simulando: boolean
  /** Volver a ver la guía */
  abrir: () => void
  /** ¿A esta persona le toca la guía? (empleados) */
  disponible: boolean
}

export const GuiaCtx = createContext<GuiaState>({ simulando: false, abrir: () => {}, disponible: false })

export const useGuia = () => useContext(GuiaCtx)

const oyentes = new Set<(e: EventoGuia) => void>()

export function avisarGuia(e: EventoGuia) {
  oyentes.forEach((f) => f(e))
}

export function escucharGuia(f: (e: EventoGuia) => void) {
  oyentes.add(f)
  return () => void oyentes.delete(f)
}

export type TipoGuia = 'empleado' | 'comercial' | 'gestion'

/** Qué guía le toca a cada uno. El asesor, dentro de la cuenta de un cliente, la del titular (para enseñársela);
 *  en su propia cuenta, ninguna (salvo en la vista previa de local con ?verComo=) */
export function tipoGuia(rol: RolEnCuenta | null, isAdvisor: boolean, vistaPrevia: boolean): TipoGuia | null {
  if (isAdvisor && !vistaPrevia) return rol === 'asesor' ? 'gestion' : null
  if (rol === 'empleado') return 'empleado'
  if (rol === 'comercial') return 'comercial'
  if (rol === 'titular' || rol === 'admin') return 'gestion'
  return null
}

/** Configuración → «Guía rápida» (la ventana de Configuración está fuera del proveedor de la guía) */
export const EVENTO_ABRIR_GUIA = 'nt-abrir-guia'
export const abrirGuia = () => window.dispatchEvent(new Event(EVENTO_ABRIR_GUIA))
