/**
 * Roles y permisos de los usuarios de una empresa. Es el espejo en la app de las funciones SQL
 * puede() y mi_rol() de supabase/usuarios.sql: la base de datos es quien de verdad deja o no
 * ver cada cosa; aquí solo se decide qué pantallas y botones se enseñan.
 */
import type { Miembro, Modulo, Permiso, RolEnCuenta, RolMiembro } from './types'

export const MODULOS: { id: Modulo; nombre: string; detalle: string }[] = [
  { id: 'ventas', nombre: 'Facturas, presupuestos y clientes', detalle: 'Crear, emitir y cobrar facturas; presupuestos y fichas de clientes' },
  { id: 'gastos', nombre: 'Gastos', detalle: 'Subir y revisar facturas de gasto, también los tickets de los empleados' },
  { id: 'bancos', nombre: 'Bancos', detalle: 'Subir y ver los extractos bancarios' },
  { id: 'contabilidad', nombre: 'Contabilidad', detalle: 'Libros, pérdidas y ganancias y balance. Incluye ver facturas y gastos' },
  { id: 'impuestos', nombre: 'Impuestos', detalle: 'Declaraciones presentadas, notificaciones y documentos' },
  { id: 'laboral', nombre: 'Laboral', detalle: 'Altas y fichas de los trabajadores (incluye el salario del contrato)' },
  { id: 'nominas', nombre: 'Nóminas', detalle: 'Las nóminas de cada trabajador' },
  { id: 'usuarios', nombre: 'Usuarios', detalle: 'Dar acceso a otras personas y cambiar sus permisos' },
  { id: 'empresa', nombre: 'Datos de la empresa y plan', detalle: 'Datos fiscales, logo, series de facturación y plan de NomoTax' },
]

export const PERMISOS_ADMIN_DEFECTO: Record<Modulo, boolean> = {
  ventas: true,
  gastos: true,
  bancos: true,
  contabilidad: true,
  impuestos: true,
  laboral: true,
  nominas: true,
  usuarios: false,
  empresa: false,
}

export const ROLES: { id: RolMiembro; nombre: string; detalle: string }[] = [
  { id: 'admin', nombre: 'Administración', detalle: 'La gestión diaria. Eliges qué módulos ve.' },
  { id: 'socio', nombre: 'Socio', detalle: 'Vista de socio: cifras, pérdidas y ganancias, balance. No ve documentos sueltos.' },
  { id: 'comercial', nombre: 'Comercial', detalle: 'Presupuestos, facturas en borrador y clientes.' },
  { id: 'empleado', nombre: 'Empleado', detalle: 'Sube sus tickets y ve sus nóminas y documentos. Cualquier rol puede además vincularse a una ficha de trabajador.' },
]

export const NOMBRE_ROL: Record<RolEnCuenta, string> = {
  asesor: 'Asesor',
  titular: 'Titular',
  admin: 'Administración',
  socio: 'Socio',
  comercial: 'Comercial',
  empleado: 'Empleado',
}

/** Igual que la función SQL puede(cuenta, modulo) */
export function puedeRol(rol: RolEnCuenta | null, permisos: Miembro['permisos'] | null | undefined, p: Permiso): boolean {
  switch (rol) {
    case 'asesor':
    case 'titular':
      return true
    case 'admin':
      return p === 'asesor' || p === 'socio' || Boolean(permisos?.[p as Modulo])
    case 'socio':
      return p === 'asesor' || p === 'socio'
    case 'comercial':
      return p === 'ventas'
    default:
      return false
  }
}

/** Permisos que se guardan al cambiar un interruptor (la contabilidad arrastra ventas y gastos, como en el SQL) */
export function ajustarPermisos(p: Record<Modulo, boolean>): Record<Modulo, boolean> {
  return p.contabilidad ? { ...p, ventas: true, gastos: true } : p
}
