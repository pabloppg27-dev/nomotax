/**
 * Motor contable (PGC PYMES). Convierte los documentos de la app en asientos y
 * calcula los libros e informes. No depende del navegador: lo usan igual la app
 * y la copia automática a las carpetas del asesor (scripts/sincronizar.ts).
 *
 * Todo se calcula al momento a partir de los documentos, así que cualquier cambio
 * (factura nueva, rectificativa, gasto revisado, nómina…) se refleja enseguida.
 */
import type { Expense, Invoice, Nomina } from './types.ts'
import { TIPOS_EXISTENCIA, aplicar, cierresEntre, movimientosStock, nombreCierre, valorPorTipo, ventasDeProductos, type DatosInventario, type EstadoProducto } from './inventario.ts'

/* --------------------------------------------------------------- Tipos */

export interface Apunte {
  cuenta: string
  debe: number
  haber: number
}

export interface Asiento {
  n: number
  fecha: string
  concepto: string
  origen: 'apertura' | 'factura' | 'cobro' | 'gasto' | 'pago' | 'nomina' | 'amortizacion' | 'existencias' | 'manual'
  documento?: string
  apuntes: Apunte[]
}

export interface AsientoManual {
  id: string
  owner_id: string
  tipo: 'apertura' | 'manual'
  fecha: string
  concepto: string
  lineas: Apunte[]
}

export interface Inmovilizado {
  id: string
  owner_id: string
  expense_id: string | null
  nombre: string
  tipo: string
  cuenta: string
  cuenta_amortizacion: string
  valor: number
  fecha_inicio: string
  coeficiente: number
  fecha_baja: string | null
}

export interface DatosContables {
  facturas: Invoice[]
  gastos: Expense[]
  nominas: (Nomina & { trabajador_nombre?: string | null })[]
  manuales: AsientoManual[]
  inmovilizados: Inmovilizado[]
  /** Productos, ajustes de stock y periodicidad de la variación de existencias (supabase/inventario.sql) */
  inventario?: DatosInventario
  /** Hasta qué fecha se calculan las amortizaciones (por defecto, hoy) */
  hasta?: string
}

/* ------------------------------------------------------ Plan de cuentas */

export const CUENTAS: Record<string, string> = {
  '100': 'Capital social',
  '112': 'Reserva legal',
  '113': 'Reservas voluntarias',
  '120': 'Remanente',
  '121': 'Resultados negativos de ejercicios anteriores',
  '129': 'Resultado del ejercicio',
  '170': 'Deudas a largo plazo con entidades de crédito',
  '206': 'Aplicaciones informáticas',
  '211': 'Construcciones',
  '213': 'Maquinaria',
  '214': 'Utillaje',
  '215': 'Otras instalaciones',
  '216': 'Mobiliario',
  '217': 'Equipos para procesos de información',
  '218': 'Elementos de transporte',
  '219': 'Otro inmovilizado material',
  '280': 'Amortización acumulada del inmovilizado intangible',
  '281': 'Amortización acumulada del inmovilizado material',
  '300': 'Mercaderías',
  '310': 'Materias primas',
  '325': 'Materiales diversos',
  '350': 'Productos terminados',
  '400': 'Proveedores',
  '410': 'Acreedores por prestaciones de servicios',
  '430': 'Clientes',
  '465': 'Remuneraciones pendientes de pago',
  '470': 'Hacienda Pública, deudora por diversos conceptos',
  '472': 'Hacienda Pública, IVA soportado',
  '473': 'Hacienda Pública, retenciones y pagos a cuenta',
  '475': 'Hacienda Pública, acreedora por conceptos fiscales',
  '4750': 'Hacienda Pública, acreedora por IVA',
  '4751': 'Hacienda Pública, acreedora por retenciones practicadas',
  '476': 'Organismos de la Seguridad Social, acreedores',
  '477': 'Hacienda Pública, IVA repercutido',
  '520': 'Deudas a corto plazo con entidades de crédito',
  '551': 'Cuenta corriente con socios y administradores',
  '570': 'Caja',
  '572': 'Bancos e instituciones de crédito',
  '600': 'Compras de mercaderías',
  '601': 'Compras de materias primas',
  '602': 'Compras de otros aprovisionamientos',
  '610': 'Variación de existencias de mercaderías',
  '611': 'Variación de existencias de materias primas',
  '612': 'Variación de existencias de otros aprovisionamientos',
  '621': 'Arrendamientos y cánones',
  '622': 'Reparaciones y conservación',
  '623': 'Servicios de profesionales independientes',
  '625': 'Primas de seguros',
  '626': 'Servicios bancarios y similares',
  '627': 'Publicidad, propaganda y relaciones públicas',
  '628': 'Suministros',
  '629': 'Otros servicios',
  '630': 'Impuesto sobre beneficios',
  '631': 'Otros tributos',
  '640': 'Sueldos y salarios',
  '642': 'Seguridad Social a cargo de la empresa',
  '662': 'Intereses de deudas',
  '669': 'Otros gastos financieros',
  '678': 'Gastos excepcionales',
  '680': 'Amortización del inmovilizado intangible',
  '681': 'Amortización del inmovilizado material',
  '700': 'Ventas de mercaderías',
  '701': 'Ventas de productos terminados',
  '705': 'Prestaciones de servicios',
  '712': 'Variación de existencias de productos terminados',
  '759': 'Ingresos por servicios diversos',
  '769': 'Otros ingresos financieros',
  '778': 'Ingresos excepcionales',
}

export const GRUPOS: Record<string, string> = {
  '1': 'Financiación básica',
  '2': 'Activo no corriente',
  '3': 'Existencias',
  '4': 'Acreedores y deudores',
  '5': 'Cuentas financieras',
  '6': 'Compras y gastos',
  '7': 'Ventas e ingresos',
}

/** Cuenta de gasto según la categoría del gasto */
export const CUENTA_CATEGORIA: Record<string, string> = {
  compras: '600',
  suministros: '628',
  alquiler: '621',
  software: '629',
  material: '629',
  profesionales: '623',
  publicidad: '627',
  viajes: '629',
  vehiculo: '628',
  formacion: '629',
  seguros: '625',
  bancos: '626',
  tributos: '631',
  otros: '629',
}

/** Tipos de inmovilizado con su coeficiente máximo orientativo (tabla del Impuesto sobre Sociedades) */
export const TIPOS_INMOVILIZADO: { id: string; nombre: string; cuenta: string; amortizacion: string; coeficiente: number }[] = [
  { id: 'equipos_informaticos', nombre: 'Equipos informáticos (ordenadores, móviles, tablets)', cuenta: '217', amortizacion: '2817', coeficiente: 25 },
  { id: 'aplicaciones', nombre: 'Aplicaciones informáticas (licencias)', cuenta: '206', amortizacion: '2806', coeficiente: 33 },
  { id: 'mobiliario', nombre: 'Mobiliario', cuenta: '216', amortizacion: '2816', coeficiente: 10 },
  { id: 'maquinaria', nombre: 'Maquinaria', cuenta: '213', amortizacion: '2813', coeficiente: 12 },
  { id: 'utillaje', nombre: 'Útiles y herramientas', cuenta: '214', amortizacion: '2814', coeficiente: 25 },
  { id: 'instalaciones', nombre: 'Instalaciones y reformas', cuenta: '215', amortizacion: '2815', coeficiente: 10 },
  { id: 'transporte', nombre: 'Elementos de transporte (vehículos)', cuenta: '218', amortizacion: '2818', coeficiente: 16 },
  { id: 'construcciones', nombre: 'Construcciones (locales, naves)', cuenta: '211', amortizacion: '2811', coeficiente: 3 },
  { id: 'otro', nombre: 'Otro inmovilizado material', cuenta: '219', amortizacion: '2819', coeficiente: 10 },
]

/** Umbral a partir del cual una inversión se revisa como posible inmovilizado */
export const UMBRAL_INMOVILIZADO = 300

/** Un gasto que parece una inversión de más de 300 € lo revisa el asesor (¿gasto o inmovilizado?) */
export function necesitaRevision(naturaleza: string | null | undefined, base: number | null | undefined): boolean {
  return naturaleza === 'inversion' && Number(base) > UMBRAL_INMOVILIZADO
}

const LARGO = 8

/** 430 + 3 → 43000003 · 4751 → 47510000 */
export function subcuenta(base: string, n = 0): string {
  const s = base.padEnd(LARGO, '0')
  if (!n) return s
  const num = String(n)
  return s.slice(0, LARGO - num.length) + num
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

/* ----------------------------------------------- Generación de asientos */

export interface ResultadoAsientos {
  asientos: Asiento[]
  /** Nombre de cada subcuenta (clientes, proveedores, etc.) */
  nombres: Record<string, string>
}

function finDeMes(anio: number, mes: number): string {
  const d = new Date(Date.UTC(anio, mes, 0))
  return d.toISOString().slice(0, 10)
}

function hoy(): string {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

export function generarAsientos(d: DatosContables): ResultadoAsientos {
  const nombres: Record<string, string> = {}
  const lista: Omit<Asiento, 'n'>[] = []
  const hasta = d.hasta ?? hoy()

  // Subcuentas de clientes (430) y acreedores (410), en orden de aparición
  const subClientes = new Map<string, string>()
  const subAcreedores = new Map<string, string>()
  const clienteDe = (f: Invoice) => {
    const clave = f.contact_id ?? (f.cliente?.nif || f.cliente?.nombre || 'sin-cliente').toString().toUpperCase()
    let c = subClientes.get(clave)
    if (!c) {
      c = subcuenta('430', subClientes.size + 1)
      subClientes.set(clave, c)
      nombres[c] = f.cliente?.nombre || 'Cliente sin nombre'
    }
    return c
  }
  const acreedorDe = (g: Expense) => {
    const clave = (g.proveedor_nif || g.proveedor || 'sin-proveedor').toUpperCase()
    let c = subAcreedores.get(clave)
    if (!c) {
      c = subcuenta(g.categoria === 'compras' ? '400' : '410', subAcreedores.size + 1)
      subAcreedores.set(clave, c)
      nombres[c] = g.proveedor || 'Proveedor sin nombre'
    }
    return c
  }

  const tipoProducto = new Map((d.inventario?.productos ?? []).map((p) => [p.id, p.tipo]))
  const facturas = [...d.facturas].filter((f) => f.estado !== 'borrador').sort((a, b) => (a.fecha + a.created_at).localeCompare(b.fecha + b.created_at))
  for (const f of facturas) {
    const cli = clienteDe(f)
    const base = Number(f.base)
    const iva = Number(f.cuota_iva)
    const irpf = Number(f.cuota_irpf)
    const total = Number(f.total)
    const apuntes: Apunte[] = [{ cuenta: cli, debe: total, haber: 0 }]
    if (irpf) apuntes.push({ cuenta: subcuenta('473'), debe: irpf, haber: 0 })
    // Las líneas con producto del inventario son venta de mercaderías (700) o de productos (701); el resto, servicios (705)
    let servicios = base
    for (const [tipo, importe] of ventasDeProductos(f, tipoProducto)) {
      apuntes.push({ cuenta: subcuenta(TIPOS_EXISTENCIA.find((t) => t.id === tipo)?.ventas ?? '700'), debe: 0, haber: importe })
      servicios = r2(servicios - importe)
    }
    apuntes.push({ cuenta: subcuenta('705'), debe: 0, haber: servicios })
    if (iva) apuntes.push({ cuenta: subcuenta('477'), debe: 0, haber: iva })
    lista.push({
      fecha: f.fecha,
      concepto: `${f.tipo === 'rectificativa' ? 'Rectificativa' : 'Factura'} ${f.numero ?? ''} · ${f.cliente?.nombre ?? ''}`.trim(),
      origen: 'factura',
      documento: f.numero ?? undefined,
      apuntes,
    })
    if (f.estado === 'cobrada' && total) {
      lista.push({
        fecha: f.fecha_cobro ?? f.fecha,
        concepto: `${total < 0 ? 'Abono' : 'Cobro'} ${f.numero ?? ''} · ${f.cliente?.nombre ?? ''}`.trim(),
        origen: 'cobro',
        documento: f.numero ?? undefined,
        apuntes: [
          { cuenta: subcuenta('572'), debe: total, haber: 0 },
          { cuenta: cli, debe: 0, haber: total },
        ],
      })
    }
  }

  const inmoPorGasto = new Map(d.inmovilizados.filter((i) => i.expense_id).map((i) => [i.expense_id as string, i]))
  const gastos = [...d.gastos].filter((g) => g.estado === 'revisado' && g.fecha).sort((a, b) => (a.fecha! + a.created_at).localeCompare(b.fecha! + b.created_at))
  for (const g of gastos) {
    const acr = acreedorDe(g)
    const base = Number(g.base)
    const iva = Number(g.cuota_iva)
    const irpf = Number(g.cuota_irpf)
    const aPagar = r2(base + iva - irpf)
    const inmo = g.revision === 'inmovilizado' ? inmoPorGasto.get(g.id) : undefined
    const cuentaGasto = inmo ? subcuenta(inmo.cuenta) : subcuenta(g.cuenta || CUENTA_CATEGORIA[g.categoria] || '629')
    const apuntes: Apunte[] = [{ cuenta: cuentaGasto, debe: base, haber: 0 }]
    if (iva) apuntes.push({ cuenta: subcuenta('472'), debe: iva, haber: 0 })
    apuntes.push({ cuenta: acr, debe: 0, haber: aPagar })
    if (irpf) apuntes.push({ cuenta: subcuenta('4751'), debe: 0, haber: irpf })
    lista.push({
      fecha: g.fecha!,
      concepto: `Factura recibida ${g.numero ?? ''} · ${g.proveedor ?? ''}`.replace(/\s+/g, ' ').trim(),
      origen: 'gasto',
      documento: g.numero ?? undefined,
      apuntes,
    })
    if (g.pagado !== false && aPagar) {
      lista.push({
        fecha: g.fecha_pago ?? g.fecha!,
        concepto: `Pago ${g.numero ?? ''} · ${g.proveedor ?? ''}`.replace(/\s+/g, ' ').trim(),
        origen: 'pago',
        documento: g.numero ?? undefined,
        apuntes: [
          { cuenta: acr, debe: aPagar, haber: 0 },
          { cuenta: subcuenta('572'), debe: 0, haber: aPagar },
        ],
      })
    }
  }

  for (const n of d.nominas.filter((x) => x.estado === 'publicada')) {
    const fecha = finDeMes(n.anio, n.mes)
    const quien = n.trabajador_nombre || n.nombre_leido || 'trabajador'
    const ssTotal = r2(Number(n.ss_trabajador) + Number(n.ss_empresa))
    const apuntes: Apunte[] = [{ cuenta: subcuenta('640'), debe: Number(n.bruto), haber: 0 }]
    if (Number(n.ss_empresa)) apuntes.push({ cuenta: subcuenta('642'), debe: Number(n.ss_empresa), haber: 0 })
    if (ssTotal) apuntes.push({ cuenta: subcuenta('476'), debe: 0, haber: ssTotal })
    if (Number(n.irpf)) apuntes.push({ cuenta: subcuenta('4751'), debe: 0, haber: Number(n.irpf) })
    apuntes.push({ cuenta: subcuenta('465'), debe: 0, haber: Number(n.neto) })
    lista.push({ fecha, concepto: `Nómina ${String(n.mes).padStart(2, '0')}/${n.anio} · ${quien}`, origen: 'nomina', apuntes })
    if (Number(n.neto)) {
      lista.push({
        fecha,
        concepto: `Pago nómina ${String(n.mes).padStart(2, '0')}/${n.anio} · ${quien}`,
        origen: 'pago',
        apuntes: [
          { cuenta: subcuenta('465'), debe: Number(n.neto), haber: 0 },
          { cuenta: subcuenta('572'), debe: 0, haber: Number(n.neto) },
        ],
      })
    }
  }

  for (const a of amortizaciones(d.inmovilizados, hasta)) lista.push(a)

  for (const m of d.manuales) {
    lista.push({
      fecha: m.fecha,
      concepto: m.concepto,
      origen: m.tipo === 'apertura' ? 'apertura' : 'manual',
      apuntes: (m.lineas ?? []).map((l) => ({ cuenta: l.cuenta.length < LARGO ? subcuenta(l.cuenta) : l.cuenta, debe: Number(l.debe) || 0, haber: Number(l.haber) || 0 })),
    })
  }

  if (d.inventario) for (const a of variacionesExistencias(d, hasta, lista)) lista.push(a)

  // Orden: fecha, con la apertura siempre primero y la variación de existencias al final del día; numeración por ejercicio
  const peso = (o: Asiento['origen']) => (o === 'apertura' ? 0 : o === 'amortizacion' ? 2 : o === 'existencias' ? 3 : 1)
  lista.sort((a, b) => a.fecha.localeCompare(b.fecha) || peso(a.origen) - peso(b.origen))
  let anio = ''
  let n = 0
  const asientos: Asiento[] = lista.map((a) => {
    if (a.fecha.slice(0, 4) !== anio) {
      anio = a.fecha.slice(0, 4)
      n = 0
    }
    n++
    return { ...a, n, apuntes: a.apuntes.filter((x) => x.debe || x.haber).map((x) => ({ ...x, debe: r2(x.debe), haber: r2(x.haber) })) }
  })
  return { asientos, nombres }
}

/**
 * Variación de existencias «al momento»: un asiento por cada documento que mueve stock (venta, compra
 * confirmada, ajuste o recuento) que lleva la 300 (310, 325, 350) al valor del inventario justo después,
 * contra la 610 (611, 612, 712). Una venta da de baja su coste; una compra lo da de alta, así que lo que
 * sigue en el almacén no resta en el PyG. Como se ajusta al saldo contable, también cuadra con la apertura.
 */
function variacionesAlMomento(d: DatosContables, hasta: string, previos: Omit<Asiento, 'n'>[]): Omit<Asiento, 'n'>[] {
  const inv = d.inventario!
  const movs = movimientosStock(d.gastos, d.facturas, inv.ajustes).filter((m) => m.fecha <= hasta)
  if (!movs.length) return []
  const tipoDe = new Map(inv.productos.map((p) => [p.id, p.tipo]))
  const cuentaDe = new Map<string, (typeof TIPOS_EXISTENCIA)[number]>(TIPOS_EXISTENCIA.map((t) => [t.id, t]))

  // Apuntes de las cuentas de existencias que ya hay (apertura, asientos manuales), por fecha
  const externos: { fecha: string; tipo: string; importe: number }[] = []
  for (const a of previos)
    for (const p of a.apuntes)
      for (const t of TIPOS_EXISTENCIA) if (p.cuenta.startsWith(t.cuenta)) externos.push({ fecha: a.fecha, tipo: t.id, importe: Number(p.debe) - Number(p.haber) })
  externos.sort((a, b) => a.fecha.localeCompare(b.fecha))
  let ix = 0

  const saldo = new Map<string, number>() // saldo contable de cada tipo
  const valor = new Map<string, number>() // valor del inventario de cada tipo
  const estado = new Map<string, EstadoProducto>()
  const out: Omit<Asiento, 'n'>[] = []

  for (let i = 0; i < movs.length; ) {
    // Un documento = los movimientos seguidos del mismo grupo (las líneas de una factura, el recuento de un día)
    const clave = movs[i].grupo
    const grupo: typeof movs = []
    while (i < movs.length && movs[i].grupo === clave) grupo.push(movs[i++])
    const { fecha, origen, documento } = grupo[0]

    while (ix < externos.length && externos[ix].fecha <= fecha) {
      const e = externos[ix++]
      saldo.set(e.tipo, r2((saldo.get(e.tipo) ?? 0) + e.importe))
    }
    for (const m of grupo) {
      const tipo = tipoDe.get(m.producto_id) ?? 'mercaderias'
      const antes = estado.get(m.producto_id) ?? { cantidad: 0, coste: 0, valor: 0 }
      const despues = aplicar(antes, m)
      estado.set(m.producto_id, despues)
      valor.set(tipo, r2((valor.get(tipo) ?? 0) + despues.valor - antes.valor))
    }

    const apuntes: Apunte[] = []
    for (const [tipo, v] of valor) {
      const dif = r2(v - (saldo.get(tipo) ?? 0))
      if (!dif) continue
      const t = cuentaDe.get(tipo)!
      const [debe, haber] = dif > 0 ? [subcuenta(t.cuenta), subcuenta(t.variacion)] : [subcuenta(t.variacion), subcuenta(t.cuenta)]
      apuntes.push({ cuenta: debe, debe: Math.abs(dif), haber: 0 }, { cuenta: haber, debe: 0, haber: Math.abs(dif) })
      saldo.set(tipo, v)
    }
    if (!apuntes.length) continue
    const entra = grupo.reduce((x, m) => x + m.cantidad, 0) > 0
    const que =
      origen === 'venta' ? (entra ? 'Devolución al almacén' : 'Coste de ventas') : origen === 'compra' ? (entra ? 'Entrada en almacén' : 'Devolución a proveedor') : 'Existencias'
    out.push({ fecha, concepto: `${que} · ${documento}`, origen: 'existencias', documento: origen === 'ajuste' ? undefined : documento.split(' · ')[0], apuntes })
  }
  return out
}

/**
 * Asiento de variación de existencias al cierre de cada periodo (mes, trimestre o año, según la cuenta):
 * da de baja lo que había en la 300 (o 310, 325, 350) contra la 610 (611, 612, 712) y da de alta
 * el valor del inventario a esa fecha (coste medio). Lo que había sale del saldo contable de la cuenta,
 * así que también recoge las existencias de la apertura. Solo periodos ya cerrados (hasta hoy) y desde
 * el primer movimiento de stock.
 */
function variacionesExistencias(d: DatosContables, hasta: string, previos: Omit<Asiento, 'n'>[]): Omit<Asiento, 'n'>[] {
  const inv = d.inventario!
  if (inv.periodo === 'no') return []
  if (inv.periodo === 'momento') return variacionesAlMomento(d, hasta, previos)
  const movs = movimientosStock(d.gastos, d.facturas, inv.ajustes)
  if (!movs.length) return []
  const tope = hasta < hoy() ? hasta : hoy()
  const out: Omit<Asiento, 'n'>[] = []
  // Saldo de cada cuenta de existencias con lo que ya hay (apertura, asientos manuales) y las variaciones anteriores
  const saldoPrevio = (prefijo: string, fecha: string) => {
    let s = 0
    for (const a of previos) {
      if (a.fecha > fecha) continue
      for (const p of a.apuntes) if (p.cuenta.startsWith(prefijo)) s += Number(p.debe) - Number(p.haber)
    }
    return r2(s)
  }
  const acumulado = new Map<string, number>()
  for (const cierre of cierresEntre(inv.periodo, movs[0].fecha, tope)) {
    const valores = valorPorTipo(movs, inv.productos, cierre)
    const apuntes: Apunte[] = []
    // Importe en negativo: se cambian el debe y el haber
    const par = (debe: string, haber: string, importe: number) => {
      if (!importe) return
      const [dd, hh, x] = importe > 0 ? [debe, haber, importe] : [haber, debe, -importe]
      apuntes.push({ cuenta: dd, debe: x, haber: 0 }, { cuenta: hh, debe: 0, haber: x })
    }
    for (const t of TIPOS_EXISTENCIA) {
      const anterior = r2(saldoPrevio(t.cuenta, cierre) + (acumulado.get(t.id) ?? 0))
      const nuevo = valores.get(t.id) ?? 0
      if (anterior === nuevo && !nuevo) continue
      par(subcuenta(t.variacion), subcuenta(t.cuenta), anterior) // baja de las existencias iniciales
      par(subcuenta(t.cuenta), subcuenta(t.variacion), nuevo) // alta de las existencias finales
      acumulado.set(t.id, r2((acumulado.get(t.id) ?? 0) + nuevo - anterior))
    }
    if (apuntes.length)
      out.push({ fecha: cierre, concepto: `Variación de existencias · ${nombreCierre(inv.periodo, cierre)}`, origen: 'existencias', apuntes })
  }
  return out
}

/** Cuotas de amortización mensuales (lineales, prorrateando el primer mes por días) */
export function amortizaciones(inmovilizados: Inmovilizado[], hasta: string): Omit<Asiento, 'n'>[] {
  const out: Omit<Asiento, 'n'>[] = []
  for (const i of inmovilizados) {
    const valor = Number(i.valor)
    const anual = (valor * Number(i.coeficiente)) / 100
    if (!anual) continue
    let acumulado = 0
    const inicio = new Date(i.fecha_inicio + 'T12:00:00Z')
    let anio = inicio.getUTCFullYear()
    let mes = inicio.getUTCMonth() + 1
    const limite = i.fecha_baja && i.fecha_baja < hasta ? i.fecha_baja : hasta
    for (let k = 0; k < 600; k++) {
      const fin = finDeMes(anio, mes)
      if (fin > limite) break
      const diasMes = Number(fin.slice(8, 10))
      const factor = k === 0 ? (diasMes - inicio.getUTCDate() + 1) / diasMes : 1
      let cuota = r2((anual / 12) * factor)
      if (acumulado + cuota > valor) cuota = r2(valor - acumulado)
      if (cuota <= 0) break
      acumulado = r2(acumulado + cuota)
      out.push({
        fecha: fin,
        concepto: `Amortización ${String(mes).padStart(2, '0')}/${anio} · ${i.nombre}`,
        origen: 'amortizacion',
        apuntes: [
          { cuenta: subcuenta(i.cuenta.startsWith('20') ? '680' : '681'), debe: cuota, haber: 0 },
          { cuenta: subcuenta(i.cuenta_amortizacion), debe: 0, haber: cuota },
        ],
      })
      mes++
      if (mes > 12) {
        mes = 1
        anio++
      }
    }
  }
  return out
}

/** Cuadro de amortización anual de un bien */
export function cuadroAmortizacion(i: Inmovilizado, hasta = '2100-12-31'): { anio: number; cuota: number; acumulado: number; pendiente: number }[] {
  const porAnio = new Map<number, number>()
  for (const a of amortizaciones([i], hasta)) {
    const y = Number(a.fecha.slice(0, 4))
    porAnio.set(y, r2((porAnio.get(y) ?? 0) + a.apuntes[0].debe))
  }
  let acumulado = 0
  return [...porAnio.entries()].map(([anio, cuota]) => {
    acumulado = r2(acumulado + cuota)
    return { anio, cuota, acumulado, pendiente: r2(Number(i.valor) - acumulado) }
  })
}

/* ------------------------------------------------------------- Informes */

export function nombreCuenta(cuenta: string, nombres: Record<string, string> = {}): string {
  if (nombres[cuenta]) return nombres[cuenta]
  for (const l of [4, 3, 2]) {
    const n = cuenta.length >= l ? CUENTAS[cuenta.slice(0, l)] : undefined
    if (n) return n
  }
  return GRUPOS[cuenta[0]] ?? 'Cuenta'
}

export function entre(asientos: Asiento[], desde: string, hasta: string): Asiento[] {
  return asientos.filter((a) => a.fecha >= desde && a.fecha <= hasta)
}

export interface LineaMayor {
  fecha: string
  n: number
  concepto: string
  debe: number
  haber: number
  saldo: number
}

export function libroMayor(asientos: Asiento[], cuenta: string): LineaMayor[] {
  let saldo = 0
  const out: LineaMayor[] = []
  for (const a of asientos) {
    for (const p of a.apuntes) {
      if (p.cuenta !== cuenta && !p.cuenta.startsWith(cuenta)) continue
      saldo = r2(saldo + p.debe - p.haber)
      out.push({ fecha: a.fecha, n: a.n, concepto: a.concepto, debe: p.debe, haber: p.haber, saldo })
    }
  }
  return out
}

export interface LineaSumas {
  cuenta: string
  nombre: string
  debe: number
  haber: number
  saldoDeudor: number
  saldoAcreedor: number
}

/** Balance de sumas y saldos. nivel: 1 (grupo), 2, 3, 4 dígitos o 8 (subcuenta) */
export function sumasYSaldos(asientos: Asiento[], nombres: Record<string, string>, nivel: 1 | 2 | 3 | 4 | 8 = 8): {
  lineas: LineaSumas[]
  totales: LineaSumas
  cuadra: boolean
} {
  const acc = new Map<string, { debe: number; haber: number }>()
  for (const a of asientos) {
    for (const p of a.apuntes) {
      const k = nivel === 8 ? p.cuenta : p.cuenta.slice(0, nivel)
      const v = acc.get(k) ?? { debe: 0, haber: 0 }
      v.debe = r2(v.debe + p.debe)
      v.haber = r2(v.haber + p.haber)
      acc.set(k, v)
    }
  }
  const lineas = [...acc.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([cuenta, v]) => {
      const s = r2(v.debe - v.haber)
      return {
        cuenta,
        nombre: nivel === 1 ? GRUPOS[cuenta] ?? `Grupo ${cuenta}` : nombreCuenta(cuenta, nombres),
        debe: v.debe,
        haber: v.haber,
        saldoDeudor: s > 0 ? s : 0,
        saldoAcreedor: s < 0 ? -s : 0,
      }
    })
  const t = lineas.reduce(
    (s, l) => ({ debe: s.debe + l.debe, haber: s.haber + l.haber, sd: s.sd + l.saldoDeudor, sa: s.sa + l.saldoAcreedor }),
    { debe: 0, haber: 0, sd: 0, sa: 0 },
  )
  const totales = { cuenta: '', nombre: 'Totales', debe: r2(t.debe), haber: r2(t.haber), saldoDeudor: r2(t.sd), saldoAcreedor: r2(t.sa) }
  return { lineas, totales, cuadra: Math.abs(totales.debe - totales.haber) < 0.01 }
}

/** Saldo (debe − haber) de las cuentas que empiezan por algún prefijo */
function saldo(asientos: Asiento[], prefijos: string[], excluir: string[] = []): number {
  let s = 0
  for (const a of asientos)
    for (const p of a.apuntes)
      if (prefijos.some((x) => p.cuenta.startsWith(x)) && !excluir.some((x) => p.cuenta.startsWith(x))) s += p.debe - p.haber
  return r2(s)
}

export interface LineaInforme {
  codigo: string
  nombre: string
  importe: number
  nivel: 0 | 1 | 2
  /** Línea de total (resultado) */
  total?: boolean
}

/** Cuenta de pérdidas y ganancias (modelo PYMES) del periodo */
export function perdidasYGanancias(asientos: Asiento[]): { lineas: LineaInforme[]; resultado: number } {
  const ing = (p: string[], ex: string[] = []) => -saldo(asientos, p, ex)
  const gas = (p: string[], ex: string[] = []) => -saldo(asientos, p, ex)
  const cifra = ing(['70'])
  const variacion = ing(['71'])
  const aprov = gas(['60', '61'])
  const otrosIng = ing(['75'])
  const personal = gas(['64'])
  const otrosGastos = gas(['62', '631', '634', '65'])
  const amort = gas(['68'])
  const excep = ing(['778']) + gas(['678'])
  const explotacion = r2(cifra + variacion + aprov + otrosIng + personal + otrosGastos + amort + excep)
  const ingFin = ing(['76'])
  const gasFin = gas(['66'])
  const financiero = r2(ingFin + gasFin)
  const antes = r2(explotacion + financiero)
  const impuesto = gas(['630'])
  const resultado = r2(antes + impuesto)
  return {
    resultado,
    lineas: [
      { codigo: '1', nombre: 'Importe neto de la cifra de negocios', importe: cifra, nivel: 1 },
      ...(variacion ? [{ codigo: '2', nombre: 'Variación de existencias de productos terminados y en curso', importe: variacion, nivel: 1 as const }] : []),
      { codigo: '4', nombre: 'Aprovisionamientos', importe: aprov, nivel: 1 },
      { codigo: '5', nombre: 'Otros ingresos de explotación', importe: otrosIng, nivel: 1 },
      { codigo: '6', nombre: 'Gastos de personal', importe: personal, nivel: 1 },
      { codigo: '7', nombre: 'Otros gastos de explotación', importe: otrosGastos, nivel: 1 },
      { codigo: '8', nombre: 'Amortización del inmovilizado', importe: amort, nivel: 1 },
      { codigo: '12', nombre: 'Resultados excepcionales', importe: r2(excep), nivel: 1 },
      { codigo: 'A', nombre: 'RESULTADO DE EXPLOTACIÓN', importe: explotacion, nivel: 0, total: true },
      { codigo: '13', nombre: 'Ingresos financieros', importe: ingFin, nivel: 1 },
      { codigo: '14', nombre: 'Gastos financieros', importe: gasFin, nivel: 1 },
      { codigo: 'B', nombre: 'RESULTADO FINANCIERO', importe: financiero, nivel: 0, total: true },
      { codigo: 'C', nombre: 'RESULTADO ANTES DE IMPUESTOS', importe: antes, nivel: 0, total: true },
      { codigo: '19', nombre: 'Impuesto sobre beneficios', importe: impuesto, nivel: 1 },
      { codigo: 'D', nombre: 'RESULTADO DEL EJERCICIO', importe: resultado, nivel: 0, total: true },
    ],
  }
}

/** Balance de situación (modelo PYMES) a una fecha, con los asientos del ejercicio hasta esa fecha */
export function balanceSituacion(asientos: Asiento[]): {
  activo: LineaInforme[]
  pasivo: LineaInforme[]
  totalActivo: number
  totalPasivo: number
  diferencia: number
} {
  const resultado = perdidasYGanancias(asientos).resultado
  const deudor = (p: string[], ex: string[] = []) => saldo(asientos, p, ex)
  const acreedor = (p: string[], ex: string[] = []) => -saldo(asientos, p, ex)

  const intangible = r2(deudor(['20']) + deudor(['280']))
  const material = r2(deudor(['21']) + deudor(['281']))
  const noCorriente = r2(intangible + material)
  const existencias = deudor(['3'], ['39'])
  const clientes = deudor(['43', '44'])
  const hpDeudora = r2(deudor(['470', '472', '473']))
  const tesoreria = deudor(['57'])
  const socios = Math.max(0, deudor(['551']))
  const corriente = r2(existencias + clientes + hpDeudora + tesoreria + socios)
  const totalActivo = r2(noCorriente + corriente)

  const capital = acreedor(['10'])
  const reservas = acreedor(['11'])
  const anteriores = acreedor(['12'], ['129'])
  const resultadoAnt = acreedor(['129'])
  const pn = r2(capital + reservas + anteriores + resultadoAnt + resultado)
  const lp = acreedor(['17'])
  const cpFin = r2(acreedor(['52']) + Math.max(0, acreedor(['551'])))
  const proveedores = acreedor(['40', '41'])
  const otrosAcr = r2(acreedor(['465', '475', '476', '477']))
  const pasivoCorriente = r2(cpFin + proveedores + otrosAcr)
  const totalPasivo = r2(pn + lp + pasivoCorriente)

  return {
    totalActivo,
    totalPasivo,
    diferencia: r2(totalActivo - totalPasivo),
    activo: [
      { codigo: 'A', nombre: 'ACTIVO NO CORRIENTE', importe: noCorriente, nivel: 0, total: true },
      { codigo: 'I', nombre: 'Inmovilizado intangible', importe: intangible, nivel: 1 },
      { codigo: 'II', nombre: 'Inmovilizado material', importe: material, nivel: 1 },
      { codigo: 'B', nombre: 'ACTIVO CORRIENTE', importe: corriente, nivel: 0, total: true },
      ...(existencias ? [{ codigo: 'II', nombre: 'Existencias', importe: existencias, nivel: 1 as const }] : []),
      { codigo: 'III', nombre: 'Clientes y deudores comerciales', importe: clientes, nivel: 1 },
      { codigo: 'III', nombre: 'Hacienda Pública deudora', importe: hpDeudora, nivel: 1 },
      { codigo: 'III', nombre: 'Socios y administradores', importe: socios, nivel: 1 },
      { codigo: 'VI', nombre: 'Efectivo y otros activos líquidos', importe: tesoreria, nivel: 1 },
    ],
    pasivo: [
      { codigo: 'A', nombre: 'PATRIMONIO NETO', importe: pn, nivel: 0, total: true },
      { codigo: 'I', nombre: 'Capital', importe: capital, nivel: 1 },
      { codigo: 'III', nombre: 'Reservas', importe: reservas, nivel: 1 },
      { codigo: 'V', nombre: 'Resultados de ejercicios anteriores', importe: r2(anteriores + resultadoAnt), nivel: 1 },
      { codigo: 'VII', nombre: 'Resultado del ejercicio', importe: resultado, nivel: 1 },
      { codigo: 'B', nombre: 'PASIVO NO CORRIENTE', importe: lp, nivel: 0, total: true },
      { codigo: 'II', nombre: 'Deudas a largo plazo', importe: lp, nivel: 1 },
      { codigo: 'C', nombre: 'PASIVO CORRIENTE', importe: pasivoCorriente, nivel: 0, total: true },
      { codigo: 'III', nombre: 'Deudas a corto plazo', importe: cpFin, nivel: 1 },
      { codigo: 'V', nombre: 'Proveedores y acreedores comerciales', importe: proveedores, nivel: 1 },
      { codigo: 'V', nombre: 'Hacienda Pública, Seguridad Social y personal', importe: otrosAcr, nivel: 1 },
    ],
  }
}
