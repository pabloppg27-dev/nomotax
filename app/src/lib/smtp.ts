/** Correo propio de cada empresa (Configuración → Correo): tipos y servidores más habituales. */

export interface SmtpEmpresa {
  owner_id: string
  proveedor: string
  host: string
  puerto: number
  seguridad: 'ssl' | 'starttls'
  usuario: string
  remitente_email: string
  remitente_nombre: string | null
  /** Solo es true si la prueba de conexión salió bien */
  activo: boolean
  verificado_at: string | null
  ultimo_error: string | null
  updated_at: string
}

export interface ProveedorSmtp {
  id: string
  nombre: string
  host: string
  puerto: number
  seguridad: 'ssl' | 'starttls'
  /** Aviso que ayuda a conectar con ese proveedor */
  ayuda?: string
}

export const PROVEEDORES_SMTP: ProveedorSmtp[] = [
  {
    id: 'google',
    nombre: 'Google Workspace / Gmail',
    host: 'smtp.gmail.com',
    puerto: 465,
    seguridad: 'ssl',
    ayuda: 'Google no deja usar tu contraseña normal: crea una «contraseña de aplicación» en tu cuenta de Google (Seguridad → Verificación en dos pasos) y pégala aquí.',
  },
  {
    id: 'microsoft',
    nombre: 'Microsoft 365 / Outlook',
    host: 'smtp.office365.com',
    puerto: 587,
    seguridad: 'starttls',
    ayuda: 'Tu administrador de Microsoft 365 tiene que activar «SMTP autenticado» para este buzón.',
  },
  { id: 'hostinger', nombre: 'Hostinger', host: 'smtp.hostinger.com', puerto: 465, seguridad: 'ssl' },
  { id: 'ionos', nombre: 'IONOS', host: 'smtp.ionos.es', puerto: 465, seguridad: 'ssl' },
  { id: 'zoho', nombre: 'Zoho Mail', host: 'smtp.zoho.eu', puerto: 465, seguridad: 'ssl' },
  { id: 'otro', nombre: 'Otro (a mano)', host: '', puerto: 465, seguridad: 'ssl', ayuda: 'Los datos del servidor de correo saliente (SMTP) te los da tu proveedor de correo o de hosting.' },
]

export const proveedorSmtp = (id: string | null | undefined): ProveedorSmtp =>
  PROVEEDORES_SMTP.find((p) => p.id === id) ?? (PROVEEDORES_SMTP[PROVEEDORES_SMTP.length - 1] as ProveedorSmtp)
