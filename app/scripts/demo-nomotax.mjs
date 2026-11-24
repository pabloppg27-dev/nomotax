// Genera la cuenta de demostración «NomoTax Demo, S.L.» (datos inventados, 2026 hasta noviembre):
//   supabase/carga-demo-nomotax.sql   → pegar en Supabase → SQL Editor
//   test-data/demo-extractos/*.csv    → extractos del banco, para subirlos en Contabilidad → Bancos
// Todo sale de los mismos datos: el IVA de los 303, las retenciones de los 111/115 y el saldo del banco cuadran.
// En la app, la ficha de cada trabajador tiene «Ver lo que ve X»: Pau (puesto «Comercial») entra como comercial; el resto, como empleado.
// Uso: node scripts/demo-nomotax.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const APP = join(dirname(fileURLToPath(import.meta.url)), '..')
const HOY = '2026-11-24'
const r2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100

// ------------------------------------------------------------------ utilidades
let semilla = 20261124
const azar = () => ((semilla = (semilla * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
const entre = (a, b) => a + Math.floor(azar() * (b - a + 1))
const pad = (n, l = 2) => String(n).padStart(l, '0')
const fechaDe = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`
const diasMes = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate()
const sumarDias = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10)
/** Día laborable (si cae en fin de semana, el lunes siguiente) */
const laborable = (iso) => {
  const d = new Date(iso + 'T12:00:00Z').getUTCDay()
  return d === 6 ? sumarDias(iso, 2) : d === 0 ? sumarDias(iso, 1) : iso
}
/** Último día laborable del mes */
const ultimoLaborable = (y, m) => {
  let iso = fechaDe(y, m, diasMes(y, m))
  while ([0, 6].includes(new Date(iso + 'T12:00:00Z').getUTCDay())) iso = sumarDias(iso, -1)
  return iso
}
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const q = (s) => (s === null || s === undefined ? 'null' : `'${String(s).replace(/'/g, "''")}'`)
const j = (o) => `${q(JSON.stringify(o))}::jsonb`
const trimestre = (iso) => Math.ceil(Number(iso.slice(5, 7)) / 3)

// DNI / CIF / NSS / IBAN inventados pero con dígitos de control válidos
const dni = (n) => `${pad(n, 8)}${'TRWAGMYFPDXBNJZSQVHLCKE'[n % 23]}`
const cif = (letra, prov, num) => {
  const d = `${pad(prov)}${pad(num, 5)}`
  let a = 0, b = 0
  for (let i = 0; i < 7; i++) {
    const x = Number(d[i])
    if (i % 2) a += x
    else b += String(x * 2).split('').reduce((s, c) => s + Number(c), 0)
  }
  return `${letra}${d}${(10 - ((a + b) % 10)) % 10}`
}
const nss = (prov, num) => `${pad(prov)}${pad(num, 8)}${pad(Number(BigInt(prov) * 100000000n + BigInt(num)) % 97)}`
const iban = (bban) => {
  const n = BigInt(bban + '142800') // ES = 14 28, + 00
  return `ES${pad(Number(98n - (n % 97n)))}${bban}`
}

// ------------------------------------------------------------------ empresa
const EMPRESA = {
  nombre: 'NomoTax Demo, S.L.',
  nif: cif('B', 8, 91726),
  direccion: 'Passeig de Gràcia 55, 4.º 2.ª',
  cp: '08007',
  ciudad: 'Barcelona',
  provincia: 'Barcelona',
  pais: 'España',
  telefono: '930 000 555',
  iban: 'ES9121000418450200051332', // IBAN de ejemplo de la documentación bancaria
  pie_factura: 'NomoTax Demo, S.L. · Inscrita en el Registro Mercantil de Barcelona · Empresa de demostración: datos ficticios.',
}

// ------------------------------------------------------------------ clientes
const CLIENTES = [
  { k: 'hotel', nombre: 'Grupo Hotelero Mediterráneo, S.L.', nif: cif('B', 7, 31842), email: 'administracion@ghmediterraneo.example', direccion: 'Avinguda Jaume III 12', cp: '07012', ciudad: 'Palma', provincia: 'Illes Balears', pais: 'España', dias: [8, 15] },
  { k: 'logistica', nombre: 'Logística Ebro Norte, S.A.', nif: cif('A', 50, 66210), email: 'cuentas@ebronorte.example', direccion: 'Polígono Plaza, calle Bari 33', cp: '50197', ciudad: 'Zaragoza', provincia: 'Zaragoza', pais: 'España', dias: [25, 32] },
  { k: 'clinicas', nombre: 'Clínicas Dentales Sonrisa, S.L.', nif: cif('B', 46, 20573), email: 'facturas@clinicasonrisa.example', direccion: 'Carrer de Colón 48', cp: '46004', ciudad: 'València', provincia: 'Valencia', pais: 'España', dias: [5, 12] },
  { k: 'bodegas', nombre: 'Bodegas Alt Penedès, S.L.', nif: cif('B', 8, 47719), email: 'admin@altpenedes.example', direccion: 'Carretera de Sant Sadurní km 4', cp: '08720', ciudad: 'Vilafranca del Penedès', provincia: 'Barcelona', pais: 'España', dias: [15, 28] },
  { k: 'costa', nombre: 'Costa Brava Homes, S.L.', nif: cif('B', 17, 58034), email: 'hola@costabravahomes.example', direccion: 'Passeig del Mar 21', cp: '17250', ciudad: "Platja d'Aro", provincia: 'Girona', pais: 'España', dias: [10, 20] },
  { k: 'agora', nombre: 'Ágora Pagos Fintech, S.L.', nif: cif('B', 28, 93361), email: 'finance@agorapagos.example', direccion: 'Calle de Serrano 90', cp: '28006', ciudad: 'Madrid', provincia: 'Madrid', pais: 'España', dias: [6, 10] },
  { k: 'moda', nombre: 'Moda Sostenible Verde, S.L.', nif: cif('B', 48, 11506), email: 'pagos@modaverde.example', direccion: 'Alameda de Recalde 27', cp: '48009', ciudad: 'Bilbao', provincia: 'Bizkaia', pais: 'España', dias: [12, 25] },
  { k: 'berlin', nombre: 'Berliner Datenwerk GmbH', nif: 'DE298765431', email: 'accounting@datenwerk.example', direccion: 'Torstraße 140', cp: '10119', ciudad: 'Berlin', provincia: null, pais: 'Alemania', dias: [14, 21], intra: true },
  { k: 'coast', nombre: 'Coastline Ventures LLC', nif: '87-1234567', email: 'ap@coastlineventures.example', direccion: '500 Brickell Ave, Suite 1200', cp: 'FL 33131', ciudad: 'Miami', provincia: null, pais: 'Estados Unidos', dias: [20, 30], fuera: true },
  { k: 'academia', nombre: 'Academia Formación Digital, S.L.', nif: cif('B', 41, 70288), email: 'admin@formaciondigital.example', direccion: 'Avenida de la Constitución 14', cp: '41001', ciudad: 'Sevilla', provincia: 'Sevilla', pais: 'España', dias: [20, 35] },
]
const C = Object.fromEntries(CLIENTES.map((c, i) => [c.k, { ...c, v: `c${i + 1}` }]))

// ------------------------------------------------------------------ facturas emitidas
const facturas = []
const factura = (k, fecha, lineas, extra = {}) => {
  const c = C[k]
  const iva = c.intra || c.fuera ? 0 : 21
  const ls = lineas.map(([concepto, precio, cantidad = 1]) => ({ concepto, cantidad, precio, iva }))
  const base = r2(ls.reduce((s, l) => s + l.precio * l.cantidad, 0))
  const cuota = r2((base * iva) / 100)
  const total = r2(base + cuota)
  const cobro = extra.sinCobrar ? null : laborable(sumarDias(fecha, entre(c.dias[0], c.dias[1])))
  const cobrada = cobro && cobro <= HOY
  facturas.push({
    k, fecha, lineas: ls, base, cuota, total,
    vencimiento: sumarDias(fecha, 30),
    estado: cobrada ? 'cobrada' : 'emitida',
    fecha_cobro: cobrada ? cobro : null,
    notas: c.intra
      ? 'Reverse charge: VAT to be accounted for by the recipient (Art. 196 Directive 2006/112/EC). Inversión del sujeto pasivo.'
      : c.fuera ? 'Operación no sujeta a IVA (art. 69.Uno.1.º LIVA).' : null,
  })
}
// Cuotas mensuales (se facturan el primer día laborable del mes)
for (let m = 1; m <= 11; m++) {
  const f = laborable(fechaDe(2026, m, 1 + (m === 1 ? 1 : 0)))
  factura('hotel', f, [[`Mantenimiento evolutivo de la plataforma de reservas · ${MESES[m - 1]} 2026\nSoporte 24/7, mejoras y hosting gestionado`, 9500]])
  factura('logistica', f, [[`Soporte y desarrollo de la app de gestión de flotas · ${MESES[m - 1]} 2026`, 7200]])
  factura('agora', f, [[`Equipo dedicado de desarrollo · ${MESES[m - 1]} 2026\n2 perfiles senior a tiempo completo`, 6500]])
  factura('clinicas', f, [[`Mantenimiento web, CRM de pacientes y cita online · ${MESES[m - 1]} 2026`, 2400]])
  if (m >= 4) factura('berlin', f, [[`Software development services · ${MONTHS[m - 1]} 2026\nDedicated backend team (data pipelines)`, 5000]])
}
// Proyectos
const P = [
  ['moda', '2026-01-19', [['Auditoría UX del ecommerce\nAnálisis heurístico, test con 8 usuarios e informe de mejoras', 6200]]],
  ['bodegas', '2026-02-09', [['Tienda online y club de vinos · Fase 1: diseño\nUX, identidad digital y prototipo navegable', 14500]]],
  ['academia', '2026-02-16', [['Plataforma e-learning (LMS)\nLicencia anual y personalización de la marca', 11500]]],
  ['costa', '2026-03-04', [['Portal inmobiliario con buscador por mapa\nDesarrollo y puesta en producción', 18900]]],
  ['coast', '2026-03-16', [['MVP development · Milestone 1\nDiscovery, architecture and first release', 24000]]],
  ['academia', '2026-03-23', [['Formación al equipo docente', 150, 12]]],
  ['bodegas', '2026-04-13', [['Tienda online y club de vinos · Fase 2: desarrollo\nCatálogo, suscripciones y pasarela de pago', 22000]]],
  ['clinicas', '2026-04-20', [['Nueva web corporativa multiclínica\nDiseño, desarrollo y migración de contenidos', 8900]]],
  ['hotel', '2026-05-11', [['Integración de pasarela de pago y channel manager', 16800]]],
  ['costa', '2026-05-18', [['Integración con portales inmobiliarios\nPublicación automática y sincronización de leads', 7400]]],
  ['bodegas', '2026-06-08', [['Tienda online y club de vinos · Fase 3: lanzamiento\nSEO, analítica y formación', 9800]]],
  ['coast', '2026-06-15', [['MVP development · Milestone 2\nPayments, onboarding and admin panel', 24000]]],
  ['moda', '2026-07-06', [['Rediseño del proceso de compra (checkout)', 15800]]],
  ['logistica', '2026-07-20', [['Cuadro de mando BI de flotas\nModelo de datos, KPI e informes automáticos', 12600]]],
  ['agora', '2026-08-03', [['Desarrollo del módulo KYC/AML\nVerificación de identidad y alertas de blanqueo', 21500]]],
  ['coast', '2026-09-07', [['MVP development · Milestone 3\nPublic launch and hand-over', 18000]]],
  ['costa', '2026-09-14', [['Campaña de SEO técnico (3 meses)', 1200, 3]]],
  ['moda', '2026-10-05', [['App móvil de fidelización · anticipo 40%\nSegún presupuesto aceptado', 19600]]],
  ['hotel', '2026-10-19', [['Auditoría de seguridad y rendimiento\nPentest externo y plan de mejoras', 5400]]],
  ['moda', '2026-11-16', [['App móvil de fidelización · entrega intermedia 30%', 14700]]],
]
for (const [k, f, l] of P) factura(k, f, l)
// Una vencida y sin cobrar (para enseñar el aviso)
factura('academia', '2026-09-21', [['Módulo de evaluaciones y certificados para el LMS', 6900]], { sinCobrar: true })
facturas.sort((a, b) => a.fecha.localeCompare(b.fecha))

// ------------------------------------------------------------------ gastos
const gastos = []
let numProv = 1000
const gasto = (g) => {
  if (g.fecha > HOY) return // nada en el futuro: los de final de noviembre aún no han llegado
  const base = r2(g.base)
  const iva_pct = g.iva ?? 21
  const cuota_iva = r2((base * iva_pct) / 100)
  const irpf_pct = g.irpf ?? 0
  const cuota_irpf = r2((base * irpf_pct) / 100)
  const total = r2(base + cuota_iva)
  gastos.push({
    fecha: g.fecha, proveedor: g.proveedor, proveedor_nif: g.nif ?? null, numero: g.numero ?? `${g.serie ?? 'F'}-${++numProv}`,
    concepto: g.concepto, categoria: g.categoria, base, iva_pct, cuota_iva, irpf_pct: irpf_pct || null, cuota_irpf, total,
    fecha_pago: g.pago ?? g.fecha, inmo: g.inmo ?? null,
  })
}
const PROV = {
  alquiler: { proveedor: 'Inversiones Diagonal 2010, S.L.', nif: cif('B', 8, 62291) },
  luz: { proveedor: 'Energía Clara Comercializadora, S.L.', nif: cif('B', 28, 40917) },
  tel: { proveedor: 'Telecom Barcelona Empresas, S.A.', nif: cif('A', 8, 15528) },
  diseno: { proveedor: 'Laura Méndez Ruiz (diseño UX freelance)', nif: dni(47120583) },
  abogados: { proveedor: 'Serra & Associats Advocats, S.L.P.', nif: cif('B', 8, 80344) },
  kodigo: { proveedor: 'Kódigo Studio, S.L.', nif: cif('B', 46, 33190) },
  limpieza: { proveedor: 'Netejes Eixample, S.L.', nif: cif('B', 8, 25576) },
}
for (let m = 1; m <= 11; m++) {
  const mes = MESES[m - 1]
  const d1 = laborable(fechaDe(2026, m, 1))
  gasto({ ...PROV.alquiler, fecha: d1, concepto: `Alquiler de la oficina · ${mes}`, categoria: 'alquiler', base: 3200, irpf: 19, numero: `ALQ-2026-${pad(m)}` })
  gasto({ ...PROV.luz, fecha: laborable(fechaDe(2026, m, 6)), concepto: `Electricidad oficina · ${mes}`, categoria: 'suministros', base: 260 + entre(0, 140) + entre(0, 99) / 100 })
  gasto({ ...PROV.tel, fecha: laborable(fechaDe(2026, m, 9)), concepto: `Fibra 1 Gb y 6 líneas móviles · ${mes}`, categoria: 'suministros', base: 189.5 })
  gasto({ ...PROV.limpieza, fecha: ultimoLaborable(2026, m), concepto: `Limpieza de la oficina · ${mes}`, categoria: 'otros', base: 420 })
  gasto({ proveedor: 'Amazon Web Services EMEA SARL', fecha: laborable(fechaDe(2026, m, 3)), concepto: `Servidores y bases de datos (AWS) · ${mes}`, categoria: 'software', base: 1650 + m * 70 + entre(0, 180), iva: 0, serie: 'EUINES26' })
  gasto({ proveedor: 'Google Cloud EMEA Ltd', fecha: laborable(fechaDe(2026, m, 2)), concepto: `Google Workspace (12 usuarios) · ${mes}`, categoria: 'software', base: 168, iva: 0, serie: 'GWS' })
  gasto({ proveedor: 'Figma, Inc. · GitHub, Inc. · Slack Technologies', fecha: laborable(fechaDe(2026, m, 5)), concepto: `Licencias de diseño y desarrollo · ${mes}`, categoria: 'software', base: 412, iva: 0, serie: 'SAAS' })
  gasto({ proveedor: 'Google Ireland Ltd (Google Ads)', fecha: ultimoLaborable(2026, m), concepto: `Campañas de Google Ads · ${mes}`, categoria: 'publicidad', base: 1200 + entre(0, 900), iva: 0, serie: 'ADS' })
  gasto({ proveedor: 'LinkedIn Ireland Unlimited Company', fecha: ultimoLaborable(2026, m), concepto: `Publicidad en LinkedIn · ${mes}`, categoria: 'publicidad', base: 600 + entre(0, 400), iva: 0, serie: 'LI' })
  gasto({ proveedor: 'CaixaBank, S.A.', fecha: ultimoLaborable(2026, m), concepto: `Comisiones de mantenimiento y transferencias · ${mes}`, categoria: 'bancos', base: 38 + entre(0, 20), iva: 0, serie: 'COM' })
  if (m <= 10) gasto({ ...PROV.diseno, fecha: ultimoLaborable(2026, m), concepto: `Diseño de interfaces · ${mes}`, categoria: 'profesionales', base: 2500, irpf: 15, numero: `LM-${pad(m)}/26`, pago: laborable(sumarDias(ultimoLaborable(2026, m), 5)) })
  if (m % 3 === 0) gasto({ ...PROV.abogados, fecha: ultimoLaborable(2026, m), concepto: `Asesoramiento jurídico (contratos y protección de datos) · ${trimestre(fechaDe(2026, m, 1))}T`, categoria: 'profesionales', base: 1450, irpf: 15 })
}
// Subcontratación y puntuales
gasto({ ...PROV.kodigo, fecha: '2026-03-27', concepto: 'Subcontratación desarrollo móvil · MVP Coastline (hito 1)', categoria: 'profesionales', base: 8500 })
gasto({ ...PROV.kodigo, fecha: '2026-06-26', concepto: 'Subcontratación desarrollo móvil · MVP Coastline (hito 2)', categoria: 'profesionales', base: 8500 })
gasto({ ...PROV.kodigo, fecha: '2026-10-23', concepto: 'Subcontratación desarrollo app de fidelización', categoria: 'profesionales', base: 9800 })
gasto({ proveedor: 'Mutua de Seguros Profesionales', nif: cif('G', 28, 11873), fecha: '2026-01-12', concepto: 'Seguro de responsabilidad civil profesional 2026', categoria: 'seguros', base: 1850, iva: 0 })
gasto({ proveedor: 'Mutua de Seguros Profesionales', nif: cif('G', 28, 11873), fecha: '2026-03-02', concepto: 'Seguro multirriesgo de la oficina 2026', categoria: 'seguros', base: 640, iva: 0 })
gasto({ proveedor: 'Fira de Barcelona', nif: cif('Q', 8, 73004), fecha: '2026-05-04', concepto: 'Stand en feria tecnológica (4YFN)', categoria: 'publicidad', base: 4500 })
gasto({ proveedor: 'Imprenta Gràfiques Gràcia, S.L.', nif: cif('B', 8, 39951), fecha: '2026-04-27', concepto: 'Material para la feria: roll-ups y tarjetas', categoria: 'publicidad', base: 685 })
gasto({ proveedor: 'Formación Cloud Academy, S.L.', nif: cif('B', 28, 51262), fecha: '2026-02-23', concepto: 'Certificación AWS Solutions Architect (3 personas)', categoria: 'formacion', base: 1200 })
gasto({ proveedor: 'Ajuntament de Barcelona', nif: 'P0801900B', fecha: '2026-06-15', concepto: 'Tasa de recogida de residuos comerciales', categoria: 'tributos', base: 318, iva: 0 })
gasto({ proveedor: 'Tienda de informática PcBox Gràcia', nif: cif('B', 8, 70415), fecha: '2026-02-04', concepto: '2 monitores 27" para puestos nuevos', categoria: 'material', base: 578 })
gasto({ proveedor: 'Notaría Rius i Planas', nif: dni(38411927), fecha: '2026-03-18', concepto: 'Elevación a público de acuerdos sociales', categoria: 'profesionales', base: 310 })
const VIAJES = [
  ['2026-01-27', 'Renfe Viajeros, S.M.E., S.A.', 'Tren Barcelona–Zaragoza ida y vuelta (2 personas) · reunión Ebro Norte', 186.2, 10],
  ['2026-02-18', 'Vueling Airlines, S.A.', 'Vuelos Barcelona–Palma · kick-off Grupo Hotelero', 248.6, 10],
  ['2026-02-18', 'Hotel Born Palma', 'Alojamiento 2 noches (2 personas)', 312, 10],
  ['2026-03-11', 'Renfe Viajeros, S.M.E., S.A.', 'Tren Barcelona–Madrid · reunión Ágora Pagos', 174.4, 10],
  ['2026-04-22', 'Restaurant Can Culleretes', 'Comida con cliente (Bodegas Alt Penedès)', 128.5, 10],
  ['2026-05-06', 'Lufthansa', 'Vuelos Barcelona–Berlín · onboarding Datenwerk', 386.9, 0],
  ['2026-05-06', 'Hotel Mitte Berlin', 'Alojamiento 3 noches', 465, 0],
  ['2026-06-17', 'Iberia L.A.E., S.A.', 'Vuelo Barcelona–Miami · entrega hito 2 Coastline', 1240, 0],
  ['2026-07-09', 'Renfe Viajeros, S.M.E., S.A.', 'Tren Barcelona–Bilbao · revisión checkout Moda Verde', 212.8, 10],
  ['2026-09-24', 'Restaurant 7 Portes', 'Comida de equipo (cierre de trimestre)', 342, 10],
  ['2026-10-14', 'Vueling Airlines, S.A.', 'Vuelos Barcelona–Sevilla · Academia Formación Digital', 156.3, 10],
  ['2026-11-12', 'Taxi y VTC (varios)', 'Desplazamientos a clientes · noviembre', 96.4, 10],
]
for (const [fecha, proveedor, concepto, base, iva] of VIAJES) gasto({ proveedor, fecha, concepto, categoria: 'viajes', base, iva, serie: 'T' })

// Inversiones → inmovilizado (con su amortización)
const INVERSIONES = [
  { fecha: '2026-01-15', proveedor: 'Apple Distribution International', concepto: '6 portátiles MacBook Pro 14"', base: 17394, tipo: 'equipos_informaticos', cuenta: '217', amort: '2817', coef: 25 },
  { fecha: '2026-02-10', proveedor: 'Mobiliario de Oficina Actiu Barcelona, S.L.', nif: cif('B', 8, 44120), concepto: 'Mesas, sillas ergonómicas y armarios para 12 puestos', base: 8640, tipo: 'mobiliario', cuenta: '216', amort: '2816', coef: 10 },
  { fecha: '2026-03-03', proveedor: 'Reformas Integrals Eixample, S.L.', nif: cif('B', 8, 57836), concepto: 'Reforma de la oficina: tabiquería, iluminación y climatización', base: 24500, tipo: 'instalaciones', cuenta: '215', amort: '2815', coef: 10 },
  { fecha: '2026-04-01', proveedor: 'Software ERP a medida · Kódigo Studio, S.L.', nif: cif('B', 46, 33190), concepto: 'Licencia perpetua del ERP interno (gestión de proyectos y horas)', base: 12000, tipo: 'aplicaciones', cuenta: '206', amort: '2806', coef: 33 },
  { fecha: '2026-05-12', proveedor: 'Sistemas y Redes Mediterráneo, S.L.', nif: cif('B', 8, 66702), concepto: 'Servidor local, cortafuegos y red wifi de la oficina', base: 7800, tipo: 'equipos_informaticos', cuenta: '217', amort: '2817', coef: 25 },
  { fecha: '2026-09-08', proveedor: 'Audiovisuales Pro BCN, S.L.', nif: cif('B', 8, 19055), concepto: 'Sala de reuniones: pantalla 85", cámara y sistema de videoconferencia', base: 5400, tipo: 'otro', cuenta: '219', amort: '2819', coef: 10 },
]
for (const i of INVERSIONES) gasto({ ...i, categoria: 'material', inmo: i })
gastos.sort((a, b) => a.fecha.localeCompare(b.fecha))

// ------------------------------------------------------------------ trabajadores y nóminas
const TRAB = [
  { v: 't1', nombre: 'Marta Soler Vidal', dni: dni(46812937), nss: nss(8, 51239876), nac: '1986-05-14', domicilio: 'Carrer de Provença 214, 3.º 1.ª, 08036 Barcelona', telefono: '600 100 201', estudios: 'Máster universitario', inicio: '2021-09-01', puesto: 'Directora de proyectos', bruto: 4200, irpf: 22, clas: 'Área 2 · Grupo A · Nivel 1 (Jefa de proyecto)', iban: iban('21000813610123456789') },
  { v: 't2', nombre: 'Javier Ortega Prats', dni: dni(38955120), nss: nss(8, 44718203), nac: '1990-11-02', domicilio: 'Carrer de Verdi 31, 2.º, 08012 Barcelona', telefono: '600 100 202', estudios: 'Grado universitario', inicio: '2022-09-15', puesto: 'Desarrollador sénior', bruto: 3600, irpf: 19, clas: 'Área 3 · Grupo B · Nivel 1 (Analista programador)', iban: iban('00810200250001234567') },
  { v: 't3', nombre: 'Lucía Fernández Gil', dni: dni(53318764), nss: nss(28, 60224417), nac: '1995-03-27', domicilio: 'Avinguda de Mistral 18, 5.º 3.ª, 08015 Barcelona', telefono: '600 100 203', estudios: 'Grado universitario', inicio: '2024-02-01', puesto: 'Desarrolladora full stack', bruto: 2900, irpf: 16, clas: 'Área 3 · Grupo C · Nivel 1 (Programadora)', iban: iban('01825322110201502220') },
  { v: 't4', nombre: 'Pau Ribas Comas', dni: dni(47790311), nss: nss(17, 30958162), nac: '1997-08-09', domicilio: 'Carrer del Torrent de l’Olla 77, 08012 Barcelona', telefono: '600 100 204', estudios: 'Grado universitario', inicio: '2025-01-13', puesto: 'Comercial · cuentas clave', bruto: 2700, irpf: 15, clas: 'Área 3 · Grupo B · Nivel 2 (Técnico comercial)', comision: true, iban: iban('21000418450200051398') },
  { v: 't5', nombre: 'Sara El Amrani Torres', dni: dni(49127705), nss: nss(8, 72510334), nac: '1999-12-03', domicilio: 'Carrer de Sants 120, 1.º 4.ª, 08014 Barcelona', telefono: '600 100 205', estudios: 'Grado universitario', inicio: '2026-04-06', puesto: 'Administración y RR. HH.', bruto: 2200, irpf: 12, clas: 'Área 4 · Grupo C · Nivel 1 (Técnica administrativa)', iban: iban('00490001502110001234') },
]
const SS_TRAB = 6.5 // contingencias comunes 4,70 + desempleo 1,55 + FP 0,10 + MEI 0,15
const SS_EMP = 32.15 // contingencias comunes 23,60 + desempleo 5,50 + FOGASA 0,20 + FP 0,60 + AT/EP 1,50 + MEI 0,75
const nominas = []
for (const t of TRAB) {
  const ini = t.inicio
  for (let m = 1; m <= 10; m++) {
    const finMes = fechaDe(2026, m, diasMes(2026, m))
    if (ini > finMes) continue
    const empieza = ini.startsWith(`2026-${pad(m)}`) ? Number(ini.slice(8, 10)) : 1
    const factor = (30 - Math.min(empieza, 30) + 1) / 30
    const fijo = r2(t.bruto * factor)
    // Comercial: comisiones por ventas del mes anterior (cotizan enteras en el mes, no se prorratean)
    const comision = t.comision ? 250 + entre(0, 12) * 50 : 0
    nominas.push(nomina(t, m, 'mensual', r2(fijo + comision), r2(fijo * 14 / 12 + comision), comision))
    if (m === 6) {
      // Paga extra de verano: proporcional a lo trabajado en el semestre (la Seguridad Social ya va prorrateada)
      const desde = ini > '2026-01-01' ? ini : '2026-01-01'
      const dias = (Date.parse('2026-06-30') - Date.parse(desde)) / 864e5 + 1
      nominas.push(nomina(t, 6, 'extra', r2(t.bruto * Math.min(1, dias / 181)), 0))
    }
  }
}
function nomina(t, mes, tipo, bruto, baseSS, comision = 0) {
  const irpf = r2((bruto * t.irpf) / 100)
  const ss_trabajador = r2((baseSS * SS_TRAB) / 100)
  const ss_empresa = r2((baseSS * SS_EMP) / 100)
  const neto = r2(bruto - irpf - ss_trabajador)
  const conceptos = tipo === 'extra'
    ? [{ concepto: 'Paga extraordinaria de verano', importe: bruto }]
    : [
        { concepto: 'Salario base', importe: r2((bruto - comision) * 0.82) },
        { concepto: 'Plus de convenio', importe: r2(bruto - comision - r2((bruto - comision) * 0.82)) },
        ...(comision ? [{ concepto: 'Comisiones por ventas', importe: comision }] : []),
        { concepto: `Retención IRPF (${t.irpf}%)`, importe: -irpf },
        { concepto: `Seguridad Social trabajador (${String(SS_TRAB).replace('.', ',')}%)`, importe: -ss_trabajador },
      ]
  return { t, anio: 2026, mes, tipo, bruto, irpf, irpf_pct: t.irpf, ss_trabajador, ss_empresa, neto, variables: comision, coste_total: r2(bruto + ss_empresa), conceptos }
}

// ------------------------------------------------------------------ impuestos (calculados con los datos)
const porT = (lista, campoFecha, f) => [1, 2, 3, 4].map((tr) => r2(lista.filter((x) => trimestre(x[campoFecha]) === tr).reduce((s, x) => s + f(x), 0)))
const repercutido = porT(facturas, 'fecha', (x) => x.cuota)
const soportado = porT(gastos, 'fecha', (x) => x.cuota_iva)
const nomT = (tr) => nominas.filter((n) => Math.ceil(n.mes / 3) === tr)
const ret111 = [1, 2, 3, 4].map((tr) => r2(nomT(tr).reduce((s, n) => s + n.irpf, 0) + gastos.filter((g) => trimestre(g.fecha) === tr && g.categoria !== 'alquiler').reduce((s, g) => s + g.cuota_irpf, 0)))
const ret115 = porT(gastos.filter((g) => g.categoria === 'alquiler'), 'fecha', (x) => x.cuota_irpf)
const PRES = { 1: '2026-04-17', 2: '2026-07-16', 3: '2026-10-16' }
const ANTERIOR = { iva4T: 18400, ret4T: 9850, ret115_4T: 1824, ss12: 6930, is2025: 41250 } // deudas del 31/12/2025, pagadas en 2026
const PAGO_202 = r2(ANTERIOR.is2025 * 0.18)
const impuestos = []
for (const tr of [1, 2, 3]) {
  impuestos.push({ modelo: '303', anio: 2026, periodo: `${tr}T`, resultado: 'ingresar', importe: r2(repercutido[tr - 1] - soportado[tr - 1]), fecha: PRES[tr], notas: `IVA repercutido ${repercutido[tr - 1]}€ · soportado deducible ${soportado[tr - 1]}€` })
  impuestos.push({ modelo: '111', anio: 2026, periodo: `${tr}T`, resultado: 'ingresar', importe: ret111[tr - 1], fecha: PRES[tr], notas: 'Retenciones de nóminas y de profesionales' })
  impuestos.push({ modelo: '115', anio: 2026, periodo: `${tr}T`, resultado: 'ingresar', importe: ret115[tr - 1], fecha: PRES[tr], notas: 'Retención del alquiler de la oficina (19%)' })
}
impuestos.push({ modelo: '303', anio: 2026, periodo: '4T', resultado: 'ingresar', importe: r2(repercutido[3] - soportado[3]), fecha: null, notas: 'Estimación con los datos hasta noviembre. Plazo: del 1 al 30 de enero de 2027.' })
impuestos.push({ modelo: '111', anio: 2026, periodo: '4T', resultado: 'ingresar', importe: ret111[3], fecha: null, notas: 'Estimación con los datos hasta noviembre. Plazo: del 1 al 20 de enero de 2027.' })
impuestos.push({ modelo: '115', anio: 2026, periodo: '4T', resultado: 'ingresar', importe: ret115[3] + 608, fecha: null, notas: 'Estimación (incluye el alquiler de diciembre). Plazo: del 1 al 20 de enero de 2027.' })
impuestos.push({ modelo: '202', anio: 2026, periodo: '04', resultado: 'ingresar', importe: PAGO_202, fecha: '2026-04-17', notas: '1.er pago fraccionado: 18% de la cuota del Impuesto de Sociedades 2025' })
impuestos.push({ modelo: '202', anio: 2026, periodo: '10', resultado: 'ingresar', importe: PAGO_202, fecha: '2026-10-16', notas: '2.º pago fraccionado' })
impuestos.push({ modelo: '202', anio: 2026, periodo: '12', resultado: 'ingresar', importe: PAGO_202, fecha: null, notas: '3.er pago fraccionado. Plazo: del 1 al 22 de diciembre.' })
impuestos.push({ modelo: '303', anio: 2025, periodo: '4T', resultado: 'ingresar', importe: ANTERIOR.iva4T, fecha: '2026-01-20', notas: null })
impuestos.push({ modelo: '111', anio: 2025, periodo: '4T', resultado: 'ingresar', importe: ANTERIOR.ret4T, fecha: '2026-01-20', notas: null })
impuestos.push({ modelo: '115', anio: 2025, periodo: '4T', resultado: 'ingresar', importe: ANTERIOR.ret115_4T, fecha: '2026-01-20', notas: null })
impuestos.push({ modelo: '390', anio: 2025, periodo: '0A', resultado: 'informativa', importe: 0, fecha: '2026-01-26', notas: 'Resumen anual de IVA 2025' })
impuestos.push({ modelo: '190', anio: 2025, periodo: '0A', resultado: 'informativa', importe: 0, fecha: '2026-01-26', notas: null })
impuestos.push({ modelo: '180', anio: 2025, periodo: '0A', resultado: 'informativa', importe: 0, fecha: '2026-01-26', notas: null })
impuestos.push({ modelo: '347', anio: 2025, periodo: '0A', resultado: 'informativa', importe: 0, fecha: '2026-02-24', notas: '9 clientes y 6 proveedores de más de 3.005,06€' })
impuestos.push({ modelo: '349', anio: 2026, periodo: '3T', resultado: 'informativa', importe: 0, fecha: '2026-10-16', notas: 'Servicios a Berliner Datenwerk GmbH' })
impuestos.push({ modelo: 'CCAA', anio: 2025, periodo: '0A', resultado: 'informativa', importe: 0, fecha: '2026-07-24', notas: 'Cuentas anuales 2025 depositadas en el Registro Mercantil' })
impuestos.push({ modelo: '200', anio: 2025, periodo: '0A', resultado: 'ingresar', importe: ANTERIOR.is2025, fecha: '2026-07-20', notas: 'Impuesto de Sociedades 2025: base imponible 165.000€ al 25%' })

// ------------------------------------------------------------------ banco (movimientos y asientos de pago)
const mov = [] // { fecha, concepto, importe }
const asientos = [] // asientos manuales: pagos de impuestos y Seguridad Social
const SALDO_INICIAL = 168000
const pagosApertura = [
  ['2026-01-20', 'AEAT · Modelo 303 4T 2025', [['4750', ANTERIOR.iva4T]]],
  ['2026-01-20', 'AEAT · Modelo 111 4T 2025', [['4751', ANTERIOR.ret4T]]],
  ['2026-01-20', 'AEAT · Modelo 115 4T 2025', [['4751', ANTERIOR.ret115_4T]]],
  ['2026-01-30', 'TGSS · Seguros sociales diciembre 2025', [['476', ANTERIOR.ss12]]],
  ['2026-07-20', 'AEAT · Modelo 200 Impuesto de Sociedades 2025', [['4752', ANTERIOR.is2025]]],
]
const pago = (fecha, concepto, debe) => {
  const total = r2(debe.reduce((s, [, x]) => s + x, 0))
  asientos.push({ fecha, concepto: `Pago ${concepto}`, lineas: [...debe.map(([cuenta, x]) => ({ cuenta, debe: x, haber: 0 })), { cuenta: '572', debe: 0, haber: total }] })
  mov.push({ fecha, concepto, importe: -total })
}
for (const [f, c, d] of pagosApertura) pago(f, c, d)
for (const tr of [1, 2, 3]) {
  const f = PRES[tr]
  // 303: se cancelan el IVA repercutido y el soportado del trimestre; la diferencia sale del banco
  const res = r2(repercutido[tr - 1] - soportado[tr - 1])
  asientos.push({ fecha: f, concepto: `Liquidación y pago modelo 303 ${tr}T 2026`, lineas: [
    { cuenta: '477', debe: repercutido[tr - 1], haber: 0 },
    { cuenta: '472', debe: 0, haber: soportado[tr - 1] },
    { cuenta: '572', debe: 0, haber: res },
  ] })
  mov.push({ fecha: f, concepto: `AEAT · Modelo 303 ${tr}T 2026`, importe: -res })
  pago(f, `AEAT · Modelo 111 ${tr}T 2026`, [['4751', ret111[tr - 1]]])
  pago(f, `AEAT · Modelo 115 ${tr}T 2026`, [['4751', ret115[tr - 1]]])
}
pago('2026-04-17', 'AEAT · Modelo 202 1.er pago fraccionado 2026', [['473', PAGO_202]])
pago('2026-10-16', 'AEAT · Modelo 202 2.º pago fraccionado 2026', [['473', PAGO_202]])
// Seguros sociales: los de cada mes se pagan el último día laborable del mes siguiente
for (let m = 1; m <= 9; m++) {
  const ss = r2(nominas.filter((n) => n.mes === m).reduce((s, n) => s + n.ss_trabajador + n.ss_empresa, 0))
  pago(ultimoLaborable(2026, m + 1), `TGSS · Seguros sociales ${MESES[m - 1]} 2026`, [['476', ss]])
}
for (const f of facturas) if (f.fecha_cobro) mov.push({ fecha: f.fecha_cobro, concepto: `Transferencia recibida · ${C[f.k].nombre}`, importe: f.total })
for (const g of gastos) {
  const t = r2(g.base + g.cuota_iva - g.cuota_irpf)
  const tipo = ['software', 'publicidad', 'bancos'].includes(g.categoria) ? 'Cargo tarjeta' : g.categoria === 'viajes' ? 'Compra tarjeta' : 'Transferencia emitida'
  mov.push({ fecha: g.fecha_pago, concepto: `${tipo} · ${g.proveedor}`, importe: -t })
}
for (let m = 1; m <= 10; m++) {
  const ns = nominas.filter((n) => n.mes === m)
  mov.push({ fecha: ultimoLaborable(2026, m), concepto: `Nóminas ${MESES[m - 1]} 2026${m === 6 ? ' y paga extra' : ''} (${new Set(ns.map((n) => n.t.v)).size} trabajadores)`, importe: -r2(ns.reduce((s, n) => s + n.neto, 0)) })
}
mov.sort((a, b) => a.fecha.localeCompare(b.fecha) || b.importe - a.importe)
let saldo = SALDO_INICIAL
for (const x of mov) x.saldo = saldo = r2(saldo + x.importe)
const minSaldo = Math.min(...mov.map((x) => x.saldo))

// ------------------------------------------------------------------ resumen por consola
const ventas = r2(facturas.reduce((s, f) => s + f.base, 0))
const gastosCorr = r2(gastos.filter((g) => !g.inmo).reduce((s, g) => s + g.base, 0))
const personal = r2(nominas.reduce((s, n) => s + n.coste_total, 0))
console.log(`Facturas: ${facturas.length} · ventas ${ventas}€ (sin IVA)`)
console.log(`Gastos: ${gastos.length} · ${gastosCorr}€ corrientes + ${r2(INVERSIONES.reduce((s, i) => s + i.base, 0))}€ en inmovilizado`)
console.log(`Nóminas: ${nominas.length} · coste empresa ${personal}€`)
console.log(`Resultado aprox. (sin amortizaciones): ${r2(ventas - gastosCorr - personal)}€`)
console.log(`Banco: saldo final ${saldo}€ · mínimo ${minSaldo}€ · ${mov.length} movimientos`)
console.log('303:', repercutido.map((x, i) => r2(x - soportado[i])), '· 111:', ret111, '· 115:', ret115)

// ------------------------------------------------------------------ SQL
const L = []
const out = (s = '') => L.push(s)
out(`-- =====================================================================
-- CUENTA DEMO: «NomoTax Demo, S.L.» (datos ficticios para enseñar a clientes)
-- Generado con: node scripts/demo-nomotax.mjs  (no editar a mano)
--
-- Crea la empresa demo (cliente demo@nomotax.io, sale en el panel del asesor) y la llena con 2026
-- hasta noviembre: ${facturas.length} facturas (${ventas.toLocaleString('es-ES')}€ sin IVA), ${gastos.length} gastos,
-- 6 inmovilizados con amortización, 5 trabajadores con ${nominas.length} nóminas, presupuestos,
-- impuestos (303, 111, 115, 202, 200, informativas), documentos y apertura.
--
-- Solo toca la cuenta demo (es_demo): ninguna otra cuenta cambia.
-- Se puede volver a ejecutar: vacía la demo y la vuelve a llenar.
--
-- Extractos del banco: después, sube los CSV de test-data/demo-extractos/
-- en Contabilidad → Bancos (CaixaBank).
-- =====================================================================

alter table public.profiles add column if not exists es_demo boolean not null default false;
alter table public.profiles add column if not exists nombre_comercial text;
alter table public.quotes add column if not exists enviado_at timestamptz;
alter table public.quotes add column if not exists enviado_a text;
alter table public.trabajadores add column if not exists irpf_pct numeric(5,2);
alter table public.trabajadores add column if not exists convenio text;
alter table public.trabajadores add column if not exists clasificacion text;
alter table public.trabajadores add column if not exists prueba_meses int;
alter table public.trabajadores add column if not exists vacaciones_dias int;
alter table public.trabajadores add column if not exists vacaciones_nota text;

do $$
declare
  o uuid;
  n int;
  x uuid;
  centro uuid;
  ${[...CLIENTES.map((c) => C[c.k].v), ...TRAB.map((t) => t.v)].map((v) => `${v} uuid;`).join(' ')}
  marca jsonb := '{"carga":"demo-nomotax"}';
  falta text := '';
begin
  -- Antes de nada: ¿están creadas las tablas que usa la demo?
  if to_regclass('public.inmovilizados') is null then falta := falta || ' contabilidad.sql'; end if;
  if to_regclass('public.asientos_manuales') is null then falta := falta || ' contabilidad.sql'; end if;
  if to_regclass('public.impuestos') is null then falta := falta || ' impuestos.sql'; end if;
  if to_regclass('public.archivo') is null then falta := falta || ' impuestos.sql'; end if;
  if to_regclass('public.trabajadores') is null then falta := falta || ' laboral.sql'; end if;
  if to_regclass('public.nominas') is null then falta := falta || ' laboral.sql'; end if;
  if to_regclass('public.centros_trabajo') is null then falta := falta || ' laboral.sql'; end if;
  if to_regclass('public.perfil_laboral') is null then falta := falta || ' laboral.sql'; end if;
  if to_regclass('public.categorias_convenio') is null then falta := falta || ' laboral.sql'; end if;
  if to_regclass('public.trabajador_documentos') is null then falta := falta || ' laboral.sql'; end if;
  if to_regclass('public.miembros') is null then falta := falta || ' usuarios.sql'; end if;
  if falta <> '' then
    raise exception 'Faltan tablas. Ejecuta antes en el SQL Editor estos archivos de app/supabase:%', (select string_agg(distinct x, ' ') from unnest(string_to_array(trim(falta), ' ')) x);
  end if;

  -- La empresa demo es una cuenta propia (demo@nomotax.io) que sale en el panel del asesor.
  -- Si ya existe (es_demo), se reutiliza; si no, se crea. No toca ninguna otra cuenta.
  select id into o from public.profiles where coalesce(es_demo, false) order by created_at limit 1;
  if o is null then
    o := 'de300000-0000-4000-8000-000000000001';
    if not exists (select 1 from auth.users where id = o) then
      insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new, email_change)
      values (o, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'demo@nomotax.io', '', now(),
        '{"provider":"email","providers":["email"]}', ${q(JSON.stringify({ nombre: EMPRESA.nombre }))}, now(), now(), '', '', '', '');
    end if;
    insert into public.profiles (id, email, nombre) values (o, 'demo@nomotax.io', ${q(EMPRESA.nombre)}) on conflict (id) do nothing;
    update public.profiles set es_demo = true where id = o;
  end if;
  if (select lower(coalesce(email, '')) = 'info@nomotax.io' or role <> 'client' from public.profiles where id = o) then
    raise exception 'La cuenta demo no puede ser la emisora de NomoTax ni la del asesor';
  end if;

  -- ---------------------------------------------------------- Borrar lo que había
  if to_regclass('public.envios_factura') is not null then
    execute 'delete from public.envios_factura where invoice_id in (select id from public.invoices where owner_id = $1)' using o;
  end if;
  if to_regclass('public.facturas_plan') is not null then
    execute 'delete from public.facturas_plan where invoice_id in (select id from public.invoices where owner_id = $1)' using o;
  end if;
  if to_regclass('public.fichajes') is not null then
    execute 'delete from public.fichajes where owner_id = $1' using o;
  end if;
  if to_regclass('public.solicitudes_irpf') is not null then
    execute 'delete from public.solicitudes_irpf where owner_id = $1' using o;
  end if;
  if to_regclass('public.tarjetas') is not null then
    execute 'update public.tarjetas set trabajador_id = null where trabajador_id in (select id from public.trabajadores where owner_id = $1)' using o;
  end if;
  update public.miembros set trabajador_id = null where cuenta_id = o and trabajador_id is not null;
  delete from public.nominas where owner_id = o;
  delete from public.trabajador_documentos where owner_id = o;
  delete from public.trabajadores where owner_id = o;
  delete from public.categorias_convenio where owner_id = o;
  delete from public.centros_trabajo where owner_id = o;
  delete from public.perfil_laboral where owner_id = o;
  delete from public.inmovilizados where owner_id = o;
  delete from public.asientos_manuales where owner_id = o;
  delete from public.invoices where owner_id = o and rectifica_id is not null;
  delete from public.invoices where owner_id = o;
  delete from public.quotes where owner_id = o;
  delete from public.expenses where owner_id = o;
  delete from public.contacts where owner_id = o;
  delete from public.impuestos where owner_id = o;
  if to_regclass('public.archivo') is not null then
    execute 'delete from public.archivo where owner_id = $1' using o;
  end if;
  if to_regclass('public.extractos_bancarios') is not null then
    execute 'delete from public.extractos_bancarios where owner_id = $1' using o;
  end if;

  -- ---------------------------------------------------------- Datos de la empresa
  update public.profiles set
    es_demo = true, nombre = ${q(EMPRESA.nombre)}, nombre_comercial = null, nif = ${q(EMPRESA.nif)},
    direccion = ${q(EMPRESA.direccion)}, cp = ${q(EMPRESA.cp)}, ciudad = ${q(EMPRESA.ciudad)}, provincia = ${q(EMPRESA.provincia)},
    pais = ${q(EMPRESA.pais)}, telefono = ${q(EMPRESA.telefono)}, iban = ${q(EMPRESA.iban)}, pie_factura = ${q(EMPRESA.pie_factura)},
    serie_factura = 'F', serie_presupuesto = 'P'
  where id = o;
`)
out('  -- ---------------------------------------------------------- Clientes')
for (const c of CLIENTES) {
  out(`  insert into public.contacts (owner_id, nombre, nif, email, direccion, cp, ciudad, provincia, pais, notas) values
    (o, ${q(c.nombre)}, ${q(c.nif)}, ${q(c.email)}, ${q(c.direccion)}, ${q(c.cp)}, ${q(c.ciudad)}, ${q(c.provincia)}, ${q(c.pais)}, 'Cliente ficticio (demo)')
    returning id into ${C[c.k].v};`)
}
const snap = (c) => ({ nombre: c.nombre, nif: c.nif, email: c.email, direccion: c.direccion, cp: c.cp, ciudad: c.ciudad, provincia: c.provincia, pais: c.pais })

out('\n  -- ---------------------------------------------------------- Presupuestos')
const PRESUP = [
  ['bodegas', '2026-01-20', 'aceptado', [['Tienda online y club de vinos · Fase 1: diseño', 14500], ['Fase 2: desarrollo', 22000], ['Fase 3: lanzamiento', 9800]]],
  ['academia', '2026-06-02', 'rechazado', [['Integración del LMS con Moodle y SSO', 7800]]],
  ['moda', '2026-09-15', 'aceptado', [['App móvil de fidelización (iOS y Android)\nPagos: 40% al inicio, 30% entrega intermedia, 30% final', 49000]]],
  ['costa', '2026-11-10', 'enviado', [['Mantenimiento y evolutivos 2027 (cuota mensual)', 2100, 12]]],
  ['hotel', '2026-11-18', 'enviado', [['App de check-in online para huéspedes\nDiseño, desarrollo e integración con el PMS', 32000]]],
  ['logistica', '2026-11-21', 'borrador', [['BI de flotas · Fase 2: predicción de rutas con IA', 28500]]],
]
for (const [k, fecha, estado, ls] of PRESUP) {
  const c = C[k]
  const lineas = ls.map(([concepto, precio, cantidad = 1]) => ({ concepto, cantidad, precio, iva: 21 }))
  const base = r2(lineas.reduce((s, l) => s + l.precio * l.cantidad, 0))
  const cuota = r2(base * 0.21)
  out(`  insert into public.quotes (owner_id, contact_id, cliente, serie, fecha, valido_hasta, lineas, base, cuota_iva, total, estado${estado === 'enviado' ? ', enviado_at, enviado_a' : ''}) values
    (o, ${c.v}, ${j(snap(c))}, 'P', '${fecha}', '${sumarDias(fecha, 30)}', ${j(lineas)}, ${base}, ${cuota}, ${r2(base + cuota)}, '${estado}'${estado === 'enviado' ? `, '${fecha} 10:30+01', ${q(c.email)}` : ''});`)
}

out('\n  -- ---------------------------------------------------------- Facturas emitidas (las numera la app: F2026-0001…)')
for (const f of facturas) {
  const c = C[f.k]
  out(`  insert into public.invoices (owner_id, contact_id, origen, cliente, serie, fecha, vencimiento, lineas, base, cuota_iva, total, estado, fecha_cobro, notas, ocr) values
    (o, ${c.v}, 'app', ${j(snap(c))}, 'F', '${f.fecha}', '${f.vencimiento}', ${j(f.lineas)}, ${f.base}, ${f.cuota}, ${f.total}, '${f.estado}', ${q(f.fecha_cobro)}, ${q(f.notas)}, marca);`)
}

out('\n  -- ---------------------------------------------------------- Gastos (revisados y pagados)')
for (const g of gastos) {
  const cols = `owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr`
  const vals = `o, '${g.fecha}', ${q(g.proveedor)}, ${q(g.proveedor_nif)}, ${q(g.numero)}, ${q(g.concepto)}, '${g.categoria}', ${g.base}, ${g.iva_pct}, ${g.cuota_iva}, ${g.irpf_pct ?? 'null'}, ${g.cuota_irpf}, ${g.total}, 'revisado', true, '${g.fecha_pago}', '${g.inmo ? 'inversion' : 'gasto'}', ${g.inmo ? "'inmovilizado'" : 'null'}, marca`
  if (!g.inmo) {
    out(`  insert into public.expenses (${cols}) values (${vals});`)
  } else {
    const i = g.inmo
    out(`  insert into public.expenses (${cols}) values (${vals}) returning id into x;`)
    out(`  insert into public.inmovilizados (owner_id, expense_id, nombre, tipo, cuenta, cuenta_amortizacion, valor, fecha_inicio, coeficiente) values
    (o, x, ${q(i.concepto)}, '${i.tipo}', '${i.cuenta}', '${i.amort}', ${i.base}, '${i.fecha}', ${i.coef});`)
  }
}

out(`
  -- ---------------------------------------------------------- Laboral
  insert into public.perfil_laboral (owner_id, convenio_nombre, convenio_codigo, periodo_prueba, pagas_convenio, horas_semana_convenio, notas)
  values (o, 'XVIII Convenio colectivo estatal de empresas de consultoría, tecnologías de la información y estudios de mercado', '99001355011983',
          '6 meses técnicos titulados, 2 meses resto', 14, 40, 'Empresa de demostración')
  on conflict (owner_id) do update set convenio_nombre = excluded.convenio_nombre, convenio_codigo = excluded.convenio_codigo,
    periodo_prueba = excluded.periodo_prueba, pagas_convenio = 14, horas_semana_convenio = 40, notas = excluded.notas;
  insert into public.centros_trabajo (owner_id, nombre, direccion, cp, ciudad, provincia, ccc)
  values (o, 'Oficina Barcelona', ${q(EMPRESA.direccion)}, ${q(EMPRESA.cp)}, 'Barcelona', 'Barcelona', '08123456789')
  returning id into centro;`)
for (const t of TRAB) {
  out(`  insert into public.trabajadores (owner_id, estado, nombre, dni, nss, fecha_nacimiento, domicilio, telefono, iban, nivel_estudios, fecha_inicio, centro_id, puesto,
      tipo_contrato, jornada, horas_semana, horario, teletrabajo, salario_bruto_mensual, pagas, irpf_pct, convenio, clasificacion, prueba_meses, vacaciones_dias, vacaciones_nota)
    values (o, 'alta', ${q(t.nombre)}, '${t.dni}', '${t.nss}', '${t.nac}', ${q(t.domicilio)}, '${t.telefono}', '${t.iban}', ${q(t.estudios)}, '${t.inicio}', centro, ${q(t.puesto)},
      'indefinido', 'completa', 40, 'L-J 9:00-18:00 · V 8:00-15:00', true, ${t.bruto}, 14, ${t.irpf}, 'Convenio TIC', ${q(t.clas)}, 6, 23, '23 días laborables + 24 y 31 de diciembre')
    returning id into ${t.v};`)
}
out('\n  -- Nóminas (sin PDF: al abrirlas, la app avisa de que son de ejemplo)')
for (const n of nominas) {
  out(`  insert into public.nominas (owner_id, trabajador_id, anio, mes, tipo, estado, file_path, nombre_leido, dni_leido, bruto, neto, irpf, irpf_pct, ss_trabajador, ss_empresa, variables, coste_total, conceptos, publicada_at, ocr) values
    (o, ${n.t.v}, ${n.anio}, ${n.mes}, '${n.tipo}', 'publicada', '', ${q(n.t.nombre)}, '${n.t.dni}', ${n.bruto}, ${n.neto}, ${n.irpf}, ${n.irpf_pct}, ${n.ss_trabajador}, ${n.ss_empresa}, ${n.variables}, ${n.coste_total}, ${j(n.conceptos)}, '${fechaDe(2026, n.mes, diasMes(2026, n.mes))} 18:00+01', marca);`)
}

out('\n  -- ---------------------------------------------------------- Impuestos')
for (const i of impuestos) {
  out(`  insert into public.impuestos (owner_id, modelo, anio, periodo, resultado, importe, fecha_presentacion, notas) values (o, '${i.modelo}', ${i.anio}, '${i.periodo}', '${i.resultado}', ${r2(i.importe)}, ${q(i.fecha)}, ${q(i.notas)});`)
}
out(`  insert into public.archivo (owner_id, titulo, tipo, organismo, fecha, fecha_limite, atendida, notas) values
    (o, 'Certificado de estar al corriente de obligaciones tributarias', 'certificado', 'AEAT', '2026-03-10', null, true, 'Pedido para el concurso del Ayuntamiento'),
    (o, 'Requerimiento de información: modelo 347 de 2025', 'requerimiento', 'AEAT', '2026-05-12', '2026-05-26', true, 'Contestado el 19/05 con el listado de operaciones'),
    (o, 'Certificado de estar al corriente con la Seguridad Social', 'certificado', 'TGSS', '2026-09-02', null, true, null),
    (o, 'Escritura de constitución de la sociedad', 'escritura', 'Notaría', '2019-06-14', null, true, null),
    (o, 'Contrato de alquiler de la oficina (Passeig de Gràcia)', 'contrato', null, '2024-12-20', null, true, 'Vence el 31/12/2029');`)

out(`
  -- ---------------------------------------------------------- Apertura y pagos (impuestos y Seguridad Social)
  insert into public.asientos_manuales (owner_id, tipo, fecha, concepto, lineas) values
    (o, 'apertura', '2026-01-01', 'Asiento de apertura del ejercicio 2026', ${j([
      { cuenta: '572', debe: SALDO_INICIAL, haber: 0 },
      { cuenta: '100', debe: 0, haber: 3000 },
      { cuenta: '112', debe: 0, haber: 600 },
      { cuenta: '113', debe: 0, haber: r2(SALDO_INICIAL - 3000 - 600 - ANTERIOR.iva4T - ANTERIOR.ret4T - ANTERIOR.ret115_4T - ANTERIOR.ss12 - ANTERIOR.is2025) },
      { cuenta: '4750', debe: 0, haber: ANTERIOR.iva4T },
      { cuenta: '4751', debe: 0, haber: r2(ANTERIOR.ret4T + ANTERIOR.ret115_4T) },
      { cuenta: '476', debe: 0, haber: ANTERIOR.ss12 },
      { cuenta: '4752', debe: 0, haber: ANTERIOR.is2025 },
    ])});`)
for (const a of asientos) out(`  insert into public.asientos_manuales (owner_id, tipo, fecha, concepto, lineas) values (o, 'manual', '${a.fecha}', ${q(a.concepto)}, ${j(a.lineas)});`)

out(`
  raise notice 'Cuenta demo lista: NomoTax Demo, S.L. (%)', o;
end $$;

-- Comprobación: una fila con la empresa demo y sus totales
select p.nombre, p.email, p.es_demo,
  (select count(*) from public.invoices i where i.owner_id = p.id) facturas,
  (select sum(base) from public.invoices i where i.owner_id = p.id) ventas_sin_iva,
  (select count(*) from public.expenses e where e.owner_id = p.id) gastos,
  (select count(*) from public.trabajadores t where t.owner_id = p.id) trabajadores,
  (select count(*) from public.nominas n where n.owner_id = p.id) nominas
from public.profiles p where p.es_demo;
`)
writeFileSync(join(APP, 'supabase/carga-demo-nomotax.sql'), L.join('\n'))

// ------------------------------------------------------------------ extractos CSV (uno por trimestre; el último hasta hoy)
const DIR = join(APP, 'test-data/demo-extractos')
mkdirSync(DIR, { recursive: true })
const eurCsv = (x) => x.toFixed(2).replace('.', ',')
const fmt = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
const tramos = [['2026-01-01', '2026-03-31', 'T1'], ['2026-04-01', '2026-06-30', 'T2'], ['2026-07-01', '2026-09-30', 'T3'], ['2026-10-01', HOY, 'T4 (hasta 24-11)']]
let anterior = SALDO_INICIAL
for (const [desde, hasta, nombre] of tramos) {
  const ms = mov.filter((x) => x.fecha >= desde && x.fecha <= hasta)
  const filas = [
    'Fecha;Fecha valor;Concepto;Importe (EUR);Saldo (EUR)',
    `${fmt(desde)};${fmt(desde)};Saldo anterior;;${eurCsv(anterior)}`,
    ...ms.map((x) => `${fmt(x.fecha)};${fmt(x.fecha)};${x.concepto.replace(/;/g, ',')};${eurCsv(x.importe)};${eurCsv(x.saldo)}`),
  ]
  if (ms.length) anterior = ms[ms.length - 1].saldo
  writeFileSync(join(DIR, `CaixaBank ES91 2100 0418 45 0200051332 - 2026 ${nombre}.csv`), '﻿' + filas.join('\r\n') + '\r\n')
}
console.log(`✓ supabase/carga-demo-nomotax.sql y ${tramos.length} extractos en test-data/demo-extractos/`)
