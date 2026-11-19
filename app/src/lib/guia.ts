/**
 * Guía rápida del empleado (primer inicio de sesión). Aquí solo el estado compartido:
 * - simulando: mientras dura la guía, fichar y pedir más retención no se guardan (se simulan en memoria).
 * - avisarGuia(): las pantallas avisan de lo que ha hecho la persona para que la guía avance.
 * La guía en sí está en components/GuiaEmpleado.tsx.
 */
import { createContext, useContext } from 'react'

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
