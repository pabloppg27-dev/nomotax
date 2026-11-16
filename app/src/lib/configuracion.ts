/** Secciones de la ventana de Configuración (menú a la izquierda, contenido a la derecha). Se irán añadiendo más. */
import { CreditCard, Mail, PieChart, Receipt, UserRound, UsersRound, type LucideIcon } from 'lucide-react'
import type { Permiso, RolEnCuenta } from './types'

export type IdSeccion = 'perfil' | 'envio' | 'plan' | 'facturacion' | 'usuarios' | 'socio'

export interface SeccionConfig {
  id: IdSeccion
  to: string
  icon: LucideIcon
  /** Bloque del menú izquierdo de la ventana */
  grupo: 'Tu cuenta' | 'Empresa'
  /** null = la ve todo el mundo */
  permiso: Permiso | null
  label: (o: { viewingOther: boolean; rol: RolEnCuenta | null; puede: (p: Permiso) => boolean }) => string
  detalle: (o: { viewingOther: boolean; rol: RolEnCuenta | null; puede: (p: Permiso) => boolean }) => string
}

const esMiembroSinEmpresa = (rol: RolEnCuenta | null, puede: (p: Permiso) => boolean) =>
  rol !== null && rol !== 'titular' && rol !== 'asesor' && !puede('empresa')

export const SECCIONES_CONFIG: SeccionConfig[] = [
  {
    id: 'perfil',
    // La dirección de siempre: la usan los correos de bienvenida y el de «He olvidado la contraseña»
    to: '/perfil',
    icon: UserRound,
    grupo: 'Tu cuenta',
    permiso: null,
    label: ({ viewingOther, rol, puede }) => (viewingOther ? 'Perfil del cliente' : esMiembroSinEmpresa(rol, puede) ? 'Mi perfil' : 'Perfil'),
    detalle: ({ rol, puede }) =>
      esMiembroSinEmpresa(rol, puede) ? 'Tu nombre, tu contraseña y tus accesos' : 'Datos fiscales, logo, facturación y contraseña',
  },
  {
    id: 'envio',
    to: '/configuracion/envio',
    icon: Mail,
    grupo: 'Empresa',
    permiso: 'empresa',
    label: () => 'Envío de facturas',
    detalle: () => 'El correo con el que mandas tus facturas a tus clientes y a dónde llegan las respuestas',
  },
  {
    id: 'plan',
    to: '/configuracion/plan',
    icon: CreditCard,
    grupo: 'Empresa',
    permiso: 'empresa',
    label: () => 'Plan',
    detalle: ({ viewingOther }) => (viewingOther ? 'Plan del cliente, cobro y todos los planes' : 'Tu plan de NomoTax y todos los planes'),
  },
  {
    id: 'facturacion',
    to: '/configuracion/facturacion',
    icon: Receipt,
    grupo: 'Empresa',
    permiso: 'empresa',
    label: () => 'Facturación',
    detalle: ({ viewingOther }) =>
      viewingOther ? 'Las facturas de NomoTax a este cliente y a qué email le llegan' : 'Las facturas de NomoTax y a qué email te llegan',
  },
  {
    id: 'usuarios',
    to: '/configuracion/usuarios',
    icon: UsersRound,
    grupo: 'Empresa',
    permiso: 'usuarios',
    label: () => 'Usuarios',
    detalle: () => 'Quién entra en la cuenta y qué ve cada uno',
  },
  {
    id: 'socio',
    to: '/configuracion/socio',
    icon: PieChart,
    grupo: 'Empresa',
    permiso: 'socio',
    label: () => 'Vista de socio',
    detalle: () => 'Así ven tus socios la empresa',
  },
]

/** Las secciones que puede ver cada uno (el socio ya tiene su vista como página principal) */
export function seccionesVisibles(rol: RolEnCuenta | null, puede: (p: Permiso) => boolean): SeccionConfig[] {
  return SECCIONES_CONFIG.filter((s) => (s.permiso === null || puede(s.permiso)) && !(s.id === 'socio' && rol === 'socio'))
}
