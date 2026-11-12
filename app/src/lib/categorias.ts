export const CATEGORIAS: { id: string; nombre: string }[] = [
  { id: 'compras', nombre: 'Compras y mercaderías' },
  { id: 'suministros', nombre: 'Suministros' },
  { id: 'alquiler', nombre: 'Alquiler' },
  { id: 'software', nombre: 'Software y suscripciones' },
  { id: 'material', nombre: 'Material y equipos' },
  { id: 'profesionales', nombre: 'Servicios profesionales' },
  { id: 'publicidad', nombre: 'Publicidad y marketing' },
  { id: 'viajes', nombre: 'Viajes y dietas' },
  { id: 'vehiculo', nombre: 'Vehículo y combustible' },
  { id: 'formacion', nombre: 'Formación' },
  { id: 'seguros', nombre: 'Seguros' },
  { id: 'bancos', nombre: 'Bancos y comisiones' },
  { id: 'tributos', nombre: 'Tributos y tasas' },
  { id: 'otros', nombre: 'Otros' },
]

export const nombreCategoria = (id: string) => CATEGORIAS.find((c) => c.id === id)?.nombre ?? 'Otros'
