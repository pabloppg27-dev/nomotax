// Correos de ejemplo del registro de jornada con el código real (src/lib/correoJornada.ts):
//   node scripts/empaquetar-facturar.mjs jornada --muestra
// Datos inventados (semana del 23 al 29 de noviembre de 2026, equipo de Nova Hiring).
import { writeFileSync } from 'node:fs'
import { informeSemana } from '../src/lib/informeJornada'
import { comunidadDe, festivosDe } from '../src/lib/festivos'
import type { Fichaje } from '../src/lib/fichaje'
import type { Ausencia } from '../src/lib/ausencias'
import { htmlAviso, htmlInformeEquipo, htmlInformeTrabajador } from '../src/lib/correoJornada'

const lunes = '2026-11-23'
const festivos = festivosDe(comunidadDe('Barcelona'))
let k = 0
const f = (t: string, dia: string, hhmm: string, tipo: Fichaje['tipo'], extra: Partial<Fichaje> = {}): Fichaje => ({
  id: `f${++k}`, owner_id: 'o', trabajador_id: t, tipo, momento: new Date(`${dia}T${hhmm}:00+01:00`).toISOString(), origen: 'app', estado: 'valido',
  motivo: null, anula_id: null, registrado_por: null, revisado_por: null, revisado_at: null, created_at: '', ...extra,
})
const jornada = (t: string, dias: string[], ent = '09:00', sal = '17:30') =>
  dias.flatMap((d) => [f(t, d, ent, 'entrada'), f(t, d, '13:30', 'pausa'), f(t, d, '14:00', 'reanudar'), f(t, d, sal, 'salida')])
const semana = ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27']
const aus = (p: Partial<Ausencia>): Ausencia => ({
  id: String(++k), owner_id: 'o', trabajador_id: 'x', tipo: 'vacaciones', subtipo: null, desde: lunes, hasta: lunes, motivo: null, archivo_path: null,
  estado: 'aprobada', respuesta: null, solicitado_por: null, revisado_por: null, revisado_at: null, asesor_visto: false, created_at: '', ...p,
})

const fichajes: Fichaje[] = [
  ...jornada('adria', semana, '08:55', '17:37'),
  ...jornada('nico', semana.slice(0, 4), '09:10', '17:25'),
  // Pau: lunes y jueves bien, martes nada, miércoles sin salida, viernes de vacaciones
  ...jornada('pau', ['2026-11-23'], '09:02', '17:34'),
  f('pau', '2026-11-25', '09:00', 'entrada'),
  ...jornada('pau', ['2026-11-26'], '08:58', '17:31'),
  // Roger: jueves sin salida, ya pidió la corrección
  ...jornada('roger', ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-27']),
  f('roger', '2026-11-26', '09:05', 'entrada'),
  f('roger', '2026-11-26', '18:00', 'salida', { origen: 'correccion', estado: 'pendiente', motivo: 'Olvidé fichar al salir' }),
]
const ausencias = [aus({ trabajador_id: 'pau', desde: '2026-11-27', hasta: '2026-11-27' }), aus({ trabajador_id: 'nico', desde: '2026-11-27', hasta: '2026-11-27', tipo: 'permiso', subtipo: 'mudanza' })]
const equipo = [
  { id: 'adria', nombre: 'Adrià Calvet' },
  { id: 'nico', nombre: 'Nico Paniello' },
  { id: 'pau', nombre: 'Pau Raset Valls' },
  { id: 'roger', nombre: 'Roger Franch' },
].map((t) => informeSemana({ trabajador: { ...t, fecha_inicio: '2026-01-01', jornada: 'completa', horas_semana: 40 }, fichajes, ausencias, festivos, lunes }))

const empresa = 'Nova Hiring, S.L.'
const out = 'test-data'
writeFileSync(`${out}/Muestra correo jornada - trabajador incompleto.html`, htmlInformeTrabajador({ empresa, inf: equipo[2] }))
writeFileSync(`${out}/Muestra correo jornada - trabajador completo.html`, htmlInformeTrabajador({ empresa, inf: equipo[0] }))
writeFileSync(`${out}/Muestra correo jornada - trabajador con permiso.html`, htmlInformeTrabajador({ empresa, inf: equipo[1] }))
writeFileSync(
  `${out}/Muestra correo jornada - propietario.html`,
  htmlInformeEquipo({
    empresa, para: 'Marc Fortuny', lunes, informes: equipo, sinFichaje: [],
    correcciones: [{ nombre: 'Roger Franch', texto: 'salida del jueves, 26 de noviembre a las 18:00', motivo: 'Olvidé fichar al salir' }],
    ausencias: [{ nombre: 'Pau Raset Valls', texto: 'vacaciones del 21 al 31 de diciembre de 2026', motivo: 'Navidad en familia' }],
  }),
)
writeFileSync(
  `${out}/Muestra correo jornada - aviso vacaciones.html`,
  htmlAviso({
    empresa, etiqueta: 'AUSENCIAS', titulo: 'Pau Raset Valls pide vacaciones',
    parrafo: 'Pau ha pedido vacaciones del 21 al 31 de diciembre de 2026. Apruébalo o recházalo en NomoTax: le avisaremos por correo.',
    detalle: [['Tipo', 'Vacaciones'], ['Fechas', 'Del 21 al 31 de diciembre de 2026'], ['Días laborables', '8'], ['Comentario', 'Navidad en familia']],
    boton: { href: 'https://clientes.nomotax.io/laboral/ausencias', texto: 'Revisar la solicitud' },
    pie: 'Te llega porque llevas Laboral en Nova Hiring, S.L. · NomoTax',
  }),
)
writeFileSync(
  `${out}/Muestra correo jornada - vacaciones aprobadas (trabajador).html`,
  htmlAviso({
    empresa, etiqueta: 'AUSENCIAS', titulo: 'Marc ha aprobado tus vacaciones',
    parrafo: 'Pau, Marc Fortuny lo ha aprobado: del 21 al 31 de diciembre de 2026 no tienes que fichar. ¡Que las disfrutes!',
    detalle: [['Tipo', 'Vacaciones'], ['Fechas', 'Del 21 al 31 de diciembre de 2026'], ['Días laborables', '8'], ['Comentario', 'Navidad en familia']],
    boton: { href: 'https://clientes.nomotax.io/mi-espacio/ausencias', texto: 'Ver mis ausencias' },
    pie: 'Nova Hiring, S.L. te avisa con NomoTax',
  }),
)
writeFileSync(
  `${out}/Muestra correo jornada - vacaciones aprobadas (propietario).html`,
  htmlAviso({
    empresa, etiqueta: 'AUSENCIAS', titulo: 'Vacaciones de Pau Raset Valls aprobadas',
    parrafo: 'Marc Fortuny ha aprobado las vacaciones de Pau Raset Valls del 21 al 31 de diciembre de 2026. Pau ya lo sabe: le hemos avisado por correo.',
    detalle: [['Tipo', 'Vacaciones'], ['Fechas', 'Del 21 al 31 de diciembre de 2026'], ['Días laborables', '8'], ['Comentario', 'Navidad en familia']],
    boton: { href: 'https://clientes.nomotax.io/laboral/ausencias', texto: 'Ver en Laboral' },
    pie: 'Te llega porque llevas Laboral en Nova Hiring, S.L. · NomoTax',
  }),
)
console.log('✓ test-data/Muestra correo jornada - (trabajador incompleto | trabajador completo | propietario | aviso vacaciones).html')
for (const i of equipo) console.log(`  ${i.nombre}: ${i.estado} · ${i.fichadoMin} de ${i.esperadoMin} min · sin fichar ${i.sinFichar} · sin salida ${i.sinSalida} · correcciones ${i.correcciones}`)
