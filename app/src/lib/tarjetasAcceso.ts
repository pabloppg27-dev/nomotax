import { useAuth } from './auth'
import { TARJETAS_ACTIVAS, TARJETAS_PARA_CLIENTES } from './config'

/**
 * ¿Se puede usar ya el apartado completo de tarjetas en la empresa que se está viendo?
 * Mientras las claves de Stripe sean de prueba, solo el asesor en su propia cuenta; con
 * VITE_TARJETAS_CLIENTES=1, todas las empresas. (Gestionarlas pide además el permiso «tarjetas».)
 */
export function useTarjetasDisponibles(): boolean {
  const { isAdvisor, viewingOther } = useAuth()
  return TARJETAS_ACTIVAS && (TARJETAS_PARA_CLIENTES || (isAdvisor && !viewingOther))
}
