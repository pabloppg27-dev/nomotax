/**
 * Prueba del informe semanal de jornada, de los festivos y del saldo de vacaciones, sin Supabase.
 *   node test-data/probar-informe-jornada.ts
 */
import assert from 'node:assert/strict'
import { comunidadDe, festivosDe } from '../src/lib/festivos.ts'
import { diasLaborables, saldoVacaciones, textoFechas, type Ausencia } from '../src/lib/ausencias.ts'
import { duracionCorta, informeSemana, lunesAnterior, textoSemana } from '../src/lib/informeJornada.ts'
import type { Fichaje } from '../src/lib/fichaje.ts'

let n = 0
const ok = (cond: unknown, msg: string) => {
  assert.ok(cond, msg)
  n++
  console.log(`✓ ${msg}`)
}

// ---------------------------------------------------------------- Festivos
const cat = festivosDe(comunidadDe('Barcelona'), [{ fecha: '2026-10-06', nombre: 'Fiesta mayor de Cerdanyola' }])
ok(comunidadDe('Barcelona') === 'CT' && comunidadDe('Vizcaya') === 'PV', 'provincia → comunidad (también «Vizcaya»)')
ok(cat.get('2026-09-11') === 'Fiesta Nacional de Cataluña' && cat.get('2026-12-26') === 'San Esteban', 'Cataluña 2026: Diada y Sant Esteve')
ok(!cat.has('2026-04-02'), 'Cataluña 2026: Jueves Santo NO es festivo')
ok(cat.get('2026-10-06') === 'Fiesta mayor de Cerdanyola', 'se suma el festivo local de la empresa')
const mad = festivosDe(comunidadDe('Madrid'))
ok(mad.has('2026-05-02') && mad.has('2026-04-02') && !mad.has('2026-09-11'), 'Madrid 2026: 2 de mayo y Jueves Santo, sin Diada')
const nadie = festivosDe(null)
ok(nadie.has('2026-12-25') && nadie.has('2026-01-06') && !nadie.has('2026-09-11') && !nadie.has('2026-04-02'), 'sin provincia: solo las fiestas de todas las comunidades')
ok(festivosDe(comunidadDe('Sevilla')).has('2027-03-01'), 'Andalucía 2027: Día de Andalucía (1 de marzo)')

// ---------------------------------------------------------------- Días laborables y saldo
ok(diasLaborables('2026-12-21', '2026-12-31', cat).length === 8, 'del 21 al 31 de diciembre en Cataluña: 8 días laborables (sin Navidad ni el finde)')
const t = { fecha_inicio: '2026-01-01', vacaciones_dias: 23 }
const aus = (p: Partial<Ausencia>): Ausencia => ({
  id: String(Math.random()), owner_id: 'o', trabajador_id: 'w', tipo: 'vacaciones', subtipo: null, desde: '2026-08-03', hasta: '2026-08-14',
  motivo: null, archivo_path: null, estado: 'aprobada', respuesta: null, solicitado_por: null, revisado_por: null, revisado_at: null,
  asesor_visto: false, created_at: '2026-01-01', ...p,
})
const s = saldoVacaciones(t, [aus({}), aus({ desde: '2026-12-21', hasta: '2026-12-31', estado: 'pendiente' }), aus({ desde: '2026-07-01', hasta: '2026-07-03', estado: 'rechazada' })], 2026, cat, '2026-11-28')
ok(s.derecho === 23 && s.aprobados === 10 && s.disfrutados === 10 && s.pendientes === 8 && s.quedan === 5, `saldo: 23 − 10 aprobados − 8 pendientes = 5 (${JSON.stringify(s)})`)
const sp = saldoVacaciones({ fecha_inicio: '2026-09-04', vacaciones_dias: 22 }, [], 2026, cat, '2026-11-28')
ok(sp.proporcional && sp.derecho === 7, `entró el 4/9: le tocan 7 días proporcionales (${sp.derecho})`)
ok(saldoVacaciones({ fecha_inicio: '2025-01-01' }, [], 2026, cat, '2026-11-28').sinDato, 'sin días en la ficha: mínimo legal y aviso')
const cruza = saldoVacaciones(t, [aus({ desde: '2026-12-28', hasta: '2027-01-08' })], 2027, cat, '2026-11-28')
ok(cruza.aprobados === 4, `vacaciones que cruzan de año: en 2027 cuentan solo las de 2027 (${cruza.aprobados})`)
ok(textoFechas({ desde: '2026-12-21', hasta: '2026-12-31' }) === 'del 21 al 31 de diciembre', 'texto: del 21 al 31 de diciembre')
ok(textoFechas({ desde: '2026-11-16', hasta: null }) === 'desde el 16 de noviembre', 'texto de una baja abierta')

// ---------------------------------------------------------------- Informe semanal
ok(lunesAnterior('2026-11-30') === '2026-11-23' && lunesAnterior('2026-12-02') === '2026-11-23', 'el lunes 30/11 (y el miércoles 2/12) informan de la semana del 23')
ok(textoSemana('2026-11-23') === 'del lunes 23 al domingo 29 de noviembre', 'texto de la semana')
ok(textoSemana('2026-11-30') === 'del lunes 30 de noviembre al domingo 6 de diciembre', 'texto de una semana que cambia de mes')

let k = 0
const f = (dia: string, hhmm: string, tipo: Fichaje['tipo'], extra: Partial<Fichaje> = {}): Fichaje => ({
  // Hora de Madrid en invierno = UTC+1
  id: `f${++k}`, owner_id: 'o', trabajador_id: 'pau', tipo, momento: new Date(`${dia}T${hhmm}:00+01:00`).toISOString(), origen: 'app', estado: 'valido',
  motivo: null, anula_id: null, registrado_por: null, revisado_por: null, revisado_at: null, created_at: '', ...extra,
})
const fichajes: Fichaje[] = [
  // Lunes 23: 9:02–17:34 con 30 min de pausa
  f('2026-11-23', '09:02', 'entrada'), f('2026-11-23', '13:30', 'pausa'), f('2026-11-23', '14:00', 'reanudar'), f('2026-11-23', '17:34', 'salida'),
  // Martes 24: nada
  // Miércoles 25: entró y no salió
  f('2026-11-25', '09:00', 'entrada'),
  // Jueves 26: 8:58–17:31 con pausa
  f('2026-11-26', '08:58', 'entrada'), f('2026-11-26', '13:30', 'pausa'), f('2026-11-26', '14:00', 'reanudar'), f('2026-11-26', '17:31', 'salida'),
  // Viernes 27: vacaciones (no ficha)
]
const trab = { id: 'pau', nombre: 'Pau Raset Valls', fecha_inicio: '2026-09-04', jornada: 'completa', horas_semana: 40 }
const vac = [aus({ trabajador_id: 'pau', desde: '2026-11-27', hasta: '2026-11-27' })]
const inf = informeSemana({ trabajador: trab, fichajes, ausencias: vac, festivos: cat, lunes: '2026-11-23' })
const est = Object.fromEntries(inf.dias.map((d) => [d.etiqueta, d.estado]))
ok(inf.dias.length === 5, `solo de lunes a viernes si no fichó el finde (${inf.dias.map((d) => d.etiqueta).join(', ')})`)
ok(est['Lun 23'] === 'ok' && est['Mar 24'] === 'falta' && est['Mié 25'] === 'salida' && est['Jue 26'] === 'ok' && est['Vie 27'] === 'ausencia', `estados: ${JSON.stringify(est)}`)
ok(inf.dias[0].fichadoMin === 482, `lunes: 8 h 02 (${duracionCorta(inf.dias[0].fichadoMin)})`)
ok(inf.dias[2].fichadoMin === 0, 'miércoles sin salida: no se inventan horas')
ok(inf.esperadoMin === 32 * 60, `le tocan 32 h: el viernes de vacaciones no cuenta (${duracionCorta(inf.esperadoMin)})`)
ok(inf.estado === 'incompleto' && inf.sinFichar === 1 && inf.sinSalida === 1, 'incompleto: 1 día sin fichar y 1 sin salida')
ok(inf.diasAusencia.vacaciones === 1, '1 día de vacaciones en la semana')

// Pide la corrección del martes: ya no se le marca como «sin fichar»
const conCorr = [...fichajes, f('2026-11-24', '09:00', 'entrada', { origen: 'correccion', estado: 'pendiente', motivo: 'Olvidé fichar' })]
const inf2 = informeSemana({ trabajador: trab, fichajes: conCorr, ausencias: vac, festivos: cat, lunes: '2026-11-23' })
ok(inf2.dias[1].estado === 'correccion' && inf2.sinFichar === 0, 'con la corrección pedida, el martes sale como «corrección enviada»')

// Festivo, baja y semana completa
const semanaDiada = informeSemana({
  trabajador: trab, ausencias: [aus({ trabajador_id: 'pau', tipo: 'baja', desde: '2026-09-07', hasta: null })], festivos: cat, lunes: '2026-09-07',
  fichajes: [],
})
ok(semanaDiada.dias.every((d) => d.estado === 'festivo' || d.estado === 'ausencia') && semanaDiada.estado === 'completo', 'semana de baja (con la Diada): nada que fichar, sin avisos')
ok(semanaDiada.dias.find((d) => d.dia === '2026-09-11')?.estado === 'festivo', 'el 11 de septiembre sale como festivo')

const llena = ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27'].flatMap((d) => [f(d, '09:00', 'entrada'), f(d, '17:00', 'salida')])
const ok40 = informeSemana({ trabajador: trab, fichajes: llena, ausencias: [], festivos: cat, lunes: '2026-11-23' })
ok(ok40.estado === 'completo' && ok40.fichadoMin === 40 * 60, 'semana de 40 h: completo')
const corta = llena.filter((x) => !(x.tipo === 'salida' && x.momento.startsWith('2026-11-27'))).concat(f('2026-11-27', '14:00', 'salida'))
ok(informeSemana({ trabajador: trab, fichajes: corta, ausencias: [], festivos: cat, lunes: '2026-11-23' }).estado === 'de_menos', 'todo fichado pero 3 h menos: «de menos»')
ok(informeSemana({ trabajador: { ...trab, fecha_inicio: '2026-11-26' }, fichajes: [], ausencias: [], festivos: cat, lunes: '2026-11-23' }).esperadoMin === 16 * 60, 'entra el jueves: solo cuentan jueves y viernes')
ok(informeSemana({ trabajador: { ...trab, jornada: 'parcial', horas_semana: 20 }, fichajes: [], ausencias: [], festivos: cat, lunes: '2026-11-23' }).esperadoMin === 20 * 60, 'jornada parcial de 20 h')

// Sábado fichado: sale en el informe y suma
const sab = informeSemana({ trabajador: trab, fichajes: [...llena, f('2026-11-28', '10:00', 'entrada'), f('2026-11-28', '12:00', 'salida')], ausencias: [], festivos: cat, lunes: '2026-11-23' })
ok(sab.dias.length === 6 && sab.fichadoMin === 42 * 60, 'el sábado fichado sale y suma 2 h')

console.log(`\n${n} comprobaciones OK`)
