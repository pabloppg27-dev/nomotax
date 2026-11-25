export type Prioridad = 'alta' | 'media' | 'baja'
export const PRIORIDADES: Prioridad[] = ['alta', 'media', 'baja']

export interface Cliente {
  id: string
  origen: 'nomotax' | 'externo'
  nombre: string
  tipo?: string | null
  pais?: string | null
  nif?: string | null
  email?: string | null
  /** el email no está en la ficha: se ha sacado de su última reunión */
  emailDeReunion?: boolean
  telefono?: string | null
  notas?: string | null
}

export interface Proyecto {
  id: string
  nombre: string
  tipo: 'normal' | 'impuestos'
  cliente_id?: string | null
  estado: 'activo' | 'terminado'
  modelos: string[]
  notas?: string | null
  created_at: string
}

export type EstadoModelo = 'pendiente' | 'hecho' | 'na'
export interface FilaImpuestos {
  id: string
  proyecto_id: string
  cliente_id: string
  estados: Record<string, EstadoModelo>
}

export interface Enlace { titulo: string; url: string }

export interface Tarea {
  id: string
  titulo: string
  descripcion?: string | null
  prioridad: Prioridad
  cliente_id?: string | null
  proyecto_id?: string | null
  fecha?: string | null
  enlaces: Enlace[]
  hecha: boolean
  hecha_at?: string | null
  created_at: string
}

export interface Reunion {
  id: string
  titulo: string
  descripcion?: string | null
  cliente_id?: string | null
  proyecto_id?: string | null
  inicio: string // ISO
  duracion: number // minutos
  email?: string | null
  meet: boolean
  meet_url?: string | null
  evento_id?: string | null
  evento_url?: string | null
  notas?: string | null
  created_at: string
}
