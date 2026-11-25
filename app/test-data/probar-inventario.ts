/**
 * Prueba del inventario y del asiento de variación de existencias, sin Supabase.
 *   node test-data/probar-inventario.ts
 */
import assert from 'node:assert/strict'
import { balanceSituacion, entre, generarAsientos, perdidasYGanancias, type AsientoManual } from '../src/lib/contabilidad.ts'
import { cierresEntre, informeProducto, margen, movimientosStock, stockA, type Producto, type StockAjuste } from '../src/lib/inventario.ts'
import type { Expense, Invoice } from '../src/lib/types.ts'

const O = 'owner'
const prod = (id: string, referencia: string, tipo: Producto['tipo'] = 'mercaderias'): Producto => ({
  id, owner_id: O, referencia, nombre: referencia, tipo, unidad: 'ud', precio_venta: null, activo: true, created_at: '2026-01-01',
})
const productos = [prod('A', 'REF-A'), prod('B', 'REF-B')]

const compra = (id: string, fecha: string, base: number, lineas: Expense['lineas']): Expense => ({
  id, owner_id: O, fecha, proveedor: 'Proveedor', proveedor_nif: 'B1', numero: id, concepto: 'Compra', categoria: 'compras',
  base, iva_pct: 21, cuota_iva: base * 0.21, irpf_pct: null, cuota_irpf: 0, total: base * 1.21, estado: 'revisado', file_path: null,
  ocr: null, contabilizado: false, created_at: fecha, updated_at: fecha, pagado: true, fecha_pago: fecha, cuenta: null,
  naturaleza: 'gasto', revision: null, lineas,
})
const venta = (id: string, fecha: string, lineas: Invoice['lineas'], tipo: Invoice['tipo'] = 'ordinaria'): Invoice => {
  const base = lineas.reduce((s, l) => s + l.cantidad * l.precio, 0)
  return {
    id, owner_id: O, contact_id: null, cliente: { nombre: 'Cliente', nif: 'X' } as Invoice['cliente'], serie: 'F', num: 1, numero: id, fecha, lineas,
    base, cuota_iva: base * 0.21, irpf_pct: 0, cuota_irpf: 0, total: base * 1.21, notas: null, created_at: fecha, updated_at: fecha,
    quote_id: null, origen: 'app', emisor: null, vencimiento: null, estado: 'emitida', file_path: null, ocr: null, contabilizado: false,
    emitida_at: fecha, tipo, fecha_cobro: null, rectifica_id: null, rectifica_numero: null, rectifica_fecha: null,
    causa_rectificacion: null, motivo_rectificacion: null,
  }
}

// Apertura: 3.000€ de mercaderías (sin detalle por referencia) y capital
const apertura: AsientoManual = {
  id: 'ap', owner_id: O, tipo: 'apertura', fecha: '2026-01-01', concepto: 'Apertura',
  lineas: [{ cuenta: '300', debe: 3000, haber: 0 }, { cuenta: '572', debe: 2000, haber: 0 }, { cuenta: '100', debe: 0, haber: 5000 }],
}
// Stock inicial por referencia que cuadra con la apertura: 100 A a 20€ + 50 B a 20€ = 3.000€
const ajustes: StockAjuste[] = [
  { id: 'i1', owner_id: O, producto_id: 'A', fecha: '2026-01-01', cantidad: 100, coste_unitario: 20, motivo: 'inicial', notas: null, created_at: '1' },
  { id: 'i2', owner_id: O, producto_id: 'B', fecha: '2026-01-01', cantidad: 50, coste_unitario: 20, motivo: 'inicial', notas: null, created_at: '2' },
  // Recuento de junio: faltan 5 unidades de B
  { id: 'r1', owner_id: O, producto_id: 'B', fecha: '2026-06-30', cantidad: -5, coste_unitario: null, motivo: 'recuento', notas: null, created_at: '3' },
]
// Compra en febrero: 100 A por 2.600€ más 100€ de portes (sin producto) → base 2.700; las líneas suman 2.700
// El coste de A sale de repartir la base: 2.600 × (2.700/2.700) / 100 = 26€
const gastos = [
  compra('C1', '2026-02-10', 2700, [
    { referencia: 'REF-A', descripcion: 'Artículo A', cantidad: 100, importe: 2600, producto_id: 'A' },
    { referencia: null, descripcion: 'Portes', cantidad: 1, importe: 100, producto_id: null },
  ]),
]
// Ventas: 150 A en abril (con 200€ de servicio en la misma factura); devolución de 10 A en mayo
const facturas = [
  venta('V1', '2026-04-15', [
    { concepto: 'A', cantidad: 150, precio: 40, iva: 21, producto_id: 'A' },
    { concepto: 'Montaje', cantidad: 1, precio: 200, iva: 21 },
  ]),
  venta('R1', '2026-05-02', [{ concepto: 'Devolución A', cantidad: -10, precio: 40, iva: 21, producto_id: 'A' }], 'rectificativa'),
]

// 1) Coste medio: 100 a 20 + 100 a 26 → 200 a 23
const movs = movimientosStock(gastos, facturas, ajustes)
const feb = stockA(movs, '2026-02-28').get('A')!
assert.equal(feb.cantidad, 200)
assert.equal(feb.coste, 23)
// Después de vender 150 y devolver 10: 60 A a 23 = 1.380; B: 45 a 20 = 900
const fin = stockA(movs, '2026-12-31')
assert.equal(fin.get('A')!.cantidad, 60)
assert.equal(fin.get('A')!.valor, 1380)
assert.equal(fin.get('B')!.valor, 900)

// 2) Cierres trimestrales
assert.deepEqual(cierresEntre('trimestral', '2026-01-01', '2026-11-25'), ['2026-03-31', '2026-06-30', '2026-09-30'])
assert.deepEqual(cierresEntre('anual', '2026-01-01', '2026-12-31'), ['2026-12-31'])
assert.deepEqual(cierresEntre('mensual', '2026-02-10', '2026-04-30'), ['2026-02-28', '2026-03-31', '2026-04-30'])

// 3) Asientos (año cerrado: hasta 31/12)
const datos = {
  facturas, gastos, nominas: [], manuales: [apertura], inmovilizados: [],
  inventario: { productos, ajustes, periodo: 'trimestral' as const },
  hasta: '2026-12-31',
}
const hoyReal = new Date().toISOString().slice(0, 10)
const { asientos } = generarAsientos(datos)
const variaciones = asientos.filter((a) => a.origen === 'existencias')
// Solo los trimestres ya cerrados a día de hoy
const esperados = cierresEntre('trimestral', '2026-01-01', hoyReal < '2026-12-31' ? hoyReal : '2026-12-31')
assert.deepEqual(variaciones.map((a) => a.fecha), esperados)

const saldo = (as: typeof asientos, pref: string) => Math.round(as.flatMap((a) => a.apuntes).filter((p) => p.cuenta.startsWith(pref)).reduce((s, p) => s + p.debe - p.haber, 0) * 100) / 100

// 1T: había 3.000 (apertura); a 31/3 hay 200 A a 23 + 50 B a 20 = 5.600
const t1 = variaciones[0]
assert.equal(saldo([t1], '610'), 3000 - 5600)
assert.equal(saldo(entre(asientos, '2026-01-01', '2026-03-31'), '300'), 5600)
// 2T: 60 A a 23 = 1.380 + 45 B a 20 = 900 → 2.280
assert.equal(saldo(entre(asientos, '2026-01-01', '2026-06-30'), '300'), 2280)

// 4) Ventas: lo del producto a la 700, el servicio a la 705
const v1 = asientos.find((a) => a.documento === 'V1')!
assert.equal(saldo([v1], '700'), -6000)
assert.equal(saldo([v1], '705'), -200)

// 5) PyG del primer semestre: coste de ventas = compras 2.700 + (3.000 − 2.280) = 3.420
const s1 = entre(asientos, '2026-01-01', '2026-06-30')
const pyg = perdidasYGanancias(s1)
assert.equal(pyg.lineas.find((l) => l.codigo === '4')!.importe, -3420)
// El balance cuadra y enseña las existencias
const bal = balanceSituacion(s1)
assert.equal(bal.activo.find((l) => l.nombre === 'Existencias')!.importe, 2280)
assert.equal(bal.diferencia, 0, "el balance cuadra")
const cuadra = Math.abs(s1.flatMap((a) => a.apuntes).reduce((s, p) => s + p.debe - p.haber, 0)) < 0.01
assert.ok(cuadra, 'los asientos cuadran')

// 6) Sin inventario el motor no cambia nada
const sin = generarAsientos({ ...datos, inventario: undefined })
assert.equal(sin.asientos.filter((a) => a.origen === 'existencias').length, 0)
// Periodo «no»: tampoco
assert.equal(generarAsientos({ ...datos, inventario: { ...datos.inventario, periodo: 'no' } }).asientos.filter((a) => a.origen === 'existencias').length, 0)

// 7) Al momento: un asiento por documento, siempre al día
const momento = generarAsientos({ ...datos, inventario: { ...datos.inventario, periodo: 'momento' } }).asientos
const ex = momento.filter((a) => a.origen === 'existencias')
// El stock inicial cuadra con la apertura: no hay asiento el 1/1
assert.ok(!ex.some((a) => a.fecha === '2026-01-01'), 'sin asiento si el stock inicial cuadra con la apertura')
const de = (doc: string) => ex.find((a) => a.concepto.includes(doc))!
assert.equal(saldo([de('C1')], '300'), 2600) // entra la compra: 100 A a 26
assert.equal(saldo([de('V1')], '300'), -3450) // sale el coste de la venta: 150 A a 23
assert.equal(saldo([de('V1')], '610'), 3450)
assert.equal(saldo([de('R1')], '300'), 230) // vuelven 10 A a 23
assert.equal(saldo([de('Recuento')], '300'), -100) // faltan 5 B a 20
// Cada día cuadra con el valor del inventario y el PyG del semestre da lo mismo que por trimestres
assert.equal(saldo(entre(momento, '2026-01-01', '2026-04-15'), '300'), 2150)
assert.equal(saldo(entre(momento, '2026-01-01', '2026-06-30'), '300'), 2280)
assert.equal(perdidasYGanancias(entre(momento, '2026-01-01', '2026-06-30')).lineas.find((l) => l.codigo === '4')!.importe, -3420)
assert.equal(balanceSituacion(entre(momento, '2026-01-01', '2026-06-30')).diferencia, 0)

// 8) Informe de un producto: ventas con su coste, compras, stock por meses y margen
const infA = informeProducto(movs, 'A', '2026-06-30')
assert.deepEqual(infA.ventas.map((v) => [v.documento, v.cliente, v.cantidad, v.importe, v.coste]), [['V1', 'Cliente', 150, 6000, 3450], ['R1', 'Cliente', -10, -400, -230]])
assert.deepEqual(infA.compras.map((c) => [c.proveedor, c.cantidad, c.coste]), [['Proveedor', 100, 26]])
assert.equal(infA.ultimoCoste, 26)
assert.equal(infA.serie.length, 12)
assert.deepEqual(infA.serie.slice(-6).map((x) => x.cantidad), [100, 200, 200, 50, 60, 60]) // ene … jun
assert.equal(infA.serie[0].mes, '2025-07')
assert.deepEqual(margen(40, 23), { euros: 17, pct: 42.5 })
assert.equal(margen(null, 23), null)

console.log('Al momento OK:', ex.map((a) => a.concepto).join(' | '))
console.log('Inventario OK:', variaciones.map((a) => `${a.fecha} ${a.concepto}`).join(' | '))
