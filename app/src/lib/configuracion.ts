/** Secciones de la ventana de Configuración (menú a la izquierda, contenido a la derecha). Se irán añadiendo más. */
import { CreditCard, FileText, Landmark, Mail, PieChart, Receipt, UserRound, UsersRound, type LucideIcon } from 'lucide-react'
import type { Permiso, RolEnCuenta } from './types'

export type IdSeccion = 'perfil' | 'bancos' | 'correo' | 'plantillas' | 'plan' | 'facturacion' | 'usuarios' | 'socio'

/** Bloques del menú izquierdo, en este orden */
export const GRUPOS_CONFIG = ['Tu cuenta', 'Equipo', 'Comunicación', 'Suscripción'] as const
export type GrupoConfig = (typeof GRUPOS_CONFIG)[number]

export interface SeccionConfig {
  id: IdSeccion
  to: string
  icon: LucideIcon
  /** Bloque del menú izquierdo de la ventana */
  grupo: GrupoConfig
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
    id: 'bancos',
    to: '/configuracion/bancos',
    icon: Landmark,
    grupo: 'Tu cuenta',
    permiso: 'empresa',
    label: () => 'Cuentas bancarias',
    detalle: () => 'Tus cuentas en euros, dólares, libras… para cobrar las facturas',
  },
  {
    id: 'usuarios',
    to: '/configuracion/usuarios',
    icon: UsersRound,
    grupo: 'Equipo',
    permiso: 'usuarios',
    label: () => 'Usuarios',
    detalle: () => 'Quién entra en la cuenta y qué ve cada uno',
  },
  {
    id: 'socio',
    to: '/configuracion/socio',
    icon: PieChart,
    grupo: 'Equipo',
    permiso: 'socio',
    label: () => 'Vista de socio',
    detalle: () => 'Así ven tus socios la empresa',
  },
  {
    id: 'correo',
    to: '/configuracion/correo',
    icon: Mail,
    grupo: 'Comunicación',
    permiso: 'empresa',
    label: () => 'Correo',
    detalle: () => 'Conecta el correo de tu dominio para enviar facturas, accesos, nóminas y presupuestos desde él',
  },
  {
    id: 'plantillas',
    to: '/configuracion/plantillas',
    icon: FileText,
    grupo: 'Comunicación',
    permiso: 'empresa',
    label: () => 'Plantillas',
    detalle: () => 'El texto de los correos: facturas, accesos, nóminas y presupuestos',
  },
  {
    id: 'plan',
    to: '/configuracion/plan',
    icon: CreditCard,
    grupo: 'Suscripción',
    permiso: 'empresa',
    label: () => 'Plan',
    detalle: ({ viewingOther }) => (viewingOther ? 'Plan del cliente, cobro y todos los planes' : 'Tu plan de NomoTax y todos los planes'),
  },
  {
    id: 'facturacion',
    to: '/configuracion/facturacion',
    icon: Receipt,
    grupo: 'Suscripción',
    permiso: 'empresa',
    label: () => 'Facturación',
    detalle: ({ viewingOther }) =>
      viewingOther ? 'Las facturas de NomoTax a este cliente y a qué email le llegan' : 'Las facturas de NomoTax y a qué email te llegan',
  },
]

/** Las secciones que puede ver cada uno (el socio ya tiene su vista como página principal) */
export function seccionesVisibles(rol: RolEnCuenta | null, puede: (p: Permiso) => boolean): SeccionConfig[] {
  return SECCIONES_CONFIG.filter((s) => (s.permiso === null || puede(s.permiso)) && !(s.id === 'socio' && rol === 'socio'))
}
