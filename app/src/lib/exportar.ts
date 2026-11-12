/**
 * Exportaciones de la contabilidad: un Excel fácil de leer (con todos los libros)
 * y ficheros de asientos para importar en A3, Sage y Holded.
 * Funciona en el navegador y en Node (copia automática a las carpetas).
 */
import ExcelJS from 'exceljs'
import {
  type Asiento,
  type Inmovilizado,
  balanceSituacion,
  cuadroAmortizacion,
  entre,
  libroMayor,
  nombreCuenta,
  perdidasYGanancias,
  sumasYSaldos,
  TIPOS_INMOVILIZADO,
} from './contabilidad.ts'

const EUR = '#,##0.00 "€";[Red]-#,##0.00 "€"'
const TINTA = 'FF111110'
const LIMA = 'FFCDF564'
const GRIS = 'FFF2F2EE'

const fmtFecha = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`

function cabecera(ws: ExcelJS.Worksheet, titulo: string, subtitulo: string, columnas: { h: string; w: number; eur?: boolean }[]) {
  ws.addRow([titulo]).font = { bold: true, size: 14 }
  ws.addRow([subtitulo]).font = { color: { argb: 'FF6B6B65' } }
  ws.addRow([])
  const h = ws.addRow(columnas.map((c) => c.h))
  h.eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TINTA } }
    c.alignment = { vertical: 'middle' }
  })
  h.height = 20
  columnas.forEach((c, i) => {
    const col = ws.getColumn(i + 1)
    col.width = c.w
    if (c.eur) col.numFmt = EUR
  })
  ws.views = [{ state: 'frozen', ySplit: 4 }]
}

function destacar(row: ExcelJS.Row, color = GRIS, negrita = true) {
  row.eachCell({ includeEmpty: true }, (c) => {
    c.font = { ...(c.font ?? {}), bold: negrita }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } }
  })
}

export interface DatosLibro {
  cliente: string
  ejercicio: number
  desde: string
  hasta: string
  asientos: Asiento[]
  nombres: Record<string, string>
  inmovilizados: Inmovilizado[]
}

/** Libro Excel con todo: resumen, diario, mayor, sumas y saldos, PyG, balance e inmovilizado */
export async function libroExcel(d: DatosLibro): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'NomoTax · Área de clientes'
  const periodo = `Del ${fmtFecha(d.desde)} al ${fmtFecha(d.hasta)} · generado el ${fmtFecha(new Date().toISOString())}`
  const delPeriodo = entre(d.asientos, d.desde, d.hasta)
  const delEjercicio = entre(d.asientos, `${d.ejercicio}-01-01`, d.hasta)
  const pyg = perdidasYGanancias(delPeriodo)
  const bal = balanceSituacion(delEjercicio)
  const ss = sumasYSaldos(delPeriodo, d.nombres, 8)

  // Resumen
  const res = wb.addWorksheet('Resumen')
  cabecera(res, `${d.cliente} · Contabilidad ${d.ejercicio}`, periodo, [
    { h: 'Concepto', w: 46 },
    { h: 'Importe', w: 18, eur: true },
  ])
  for (const l of pyg.lineas.filter((x) => x.total || x.importe)) {
    const r = res.addRow([l.nombre, l.importe])
    if (l.total) destacar(r)
  }
  res.addRow([])
  destacar(res.addRow(['Total activo', bal.totalActivo]))
  destacar(res.addRow(['Total patrimonio neto y pasivo', bal.totalPasivo]))
  const cuadre = res.addRow([
    ss.cuadra ? 'Sumas y saldos: cuadra (debe = haber)' : 'Sumas y saldos: NO cuadra',
    r2(ss.totales.debe - ss.totales.haber),
  ])
  cuadre.font = { bold: true, color: { argb: ss.cuadra ? 'FF173404' : 'FFB42318' } }
  if (Math.abs(bal.diferencia) >= 0.01) {
    res.addRow(['Diferencia en el balance (falta el asiento de apertura o asientos manuales)', bal.diferencia]).font = { color: { argb: 'FFB54708' } }
  }

  // Libro diario
  const dia = wb.addWorksheet('Libro diario')
  cabecera(dia, 'Libro diario', periodo, [
    { h: 'Asiento', w: 9 },
    { h: 'Fecha', w: 12 },
    { h: 'Cuenta', w: 12 },
    { h: 'Nombre de la cuenta', w: 38 },
    { h: 'Concepto', w: 52 },
    { h: 'Debe', w: 15, eur: true },
    { h: 'Haber', w: 15, eur: true },
  ])
  for (const a of delPeriodo) {
    a.apuntes.forEach((p, i) => {
      const r = dia.addRow([i === 0 ? a.n : '', i === 0 ? fmtFecha(a.fecha) : '', p.cuenta, nombreCuenta(p.cuenta, d.nombres), i === 0 ? a.concepto : '', p.debe || null, p.haber || null])
      if (i === 0) r.getCell(1).font = { bold: true }
    })
    const sep = dia.addRow([])
    sep.height = 6
  }
  const td = delPeriodo.reduce((s, a) => s + a.apuntes.reduce((x, p) => x + p.debe, 0), 0)
  const th = delPeriodo.reduce((s, a) => s + a.apuntes.reduce((x, p) => x + p.haber, 0), 0)
  destacar(dia.addRow(['', '', '', '', 'TOTALES', r2(td), r2(th)]), LIMA)

  // Libro mayor (todas las cuentas, una detrás de otra)
  const may = wb.addWorksheet('Libro mayor')
  cabecera(may, 'Libro mayor', periodo, [
    { h: 'Fecha', w: 12 },
    { h: 'Asiento', w: 9 },
    { h: 'Concepto', w: 56 },
    { h: 'Debe', w: 15, eur: true },
    { h: 'Haber', w: 15, eur: true },
    { h: 'Saldo', w: 16, eur: true },
  ])
  for (const l of ss.lineas) {
    destacar(may.addRow([l.cuenta, '', l.nombre]), GRIS)
    const lineas = libroMayor(delPeriodo, l.cuenta)
    for (const m of lineas) may.addRow([fmtFecha(m.fecha), m.n, m.concepto, m.debe || null, m.haber || null, m.saldo])
    const tot = may.addRow(['', '', `Total ${l.cuenta}`, l.debe, l.haber, r2(l.debe - l.haber)])
    tot.font = { bold: true }
    may.addRow([])
  }

  // Sumas y saldos (subcuenta con subtotales por grupo)
  const sys = wb.addWorksheet('Sumas y saldos')
  cabecera(sys, 'Balance de sumas y saldos', periodo, [
    { h: 'Cuenta', w: 12 },
    { h: 'Nombre', w: 46 },
    { h: 'Sumas debe', w: 16, eur: true },
    { h: 'Sumas haber', w: 16, eur: true },
    { h: 'Saldo deudor', w: 16, eur: true },
    { h: 'Saldo acreedor', w: 16, eur: true },
  ])
  const grupos = sumasYSaldos(delPeriodo, d.nombres, 1).lineas
  for (const g of grupos) {
    destacar(sys.addRow([g.cuenta, `Grupo ${g.cuenta} · ${g.nombre}`, g.debe, g.haber, g.saldoDeudor || null, g.saldoAcreedor || null]))
    for (const l of ss.lineas.filter((x) => x.cuenta.startsWith(g.cuenta)))
      sys.addRow([l.cuenta, l.nombre, l.debe, l.haber, l.saldoDeudor || null, l.saldoAcreedor || null])
  }
  destacar(sys.addRow(['', 'TOTALES', ss.totales.debe, ss.totales.haber, ss.totales.saldoDeudor, ss.totales.saldoAcreedor]), LIMA)

  // Pérdidas y ganancias
  const pg = wb.addWorksheet('Pérdidas y ganancias')
  cabecera(pg, 'Cuenta de pérdidas y ganancias (modelo PYMES)', periodo, [
    { h: '', w: 6 },
    { h: 'Partida', w: 50 },
    { h: 'Importe', w: 18, eur: true },
  ])
  for (const l of pyg.lineas) {
    const r = pg.addRow([l.codigo, l.nombre, l.importe])
    if (l.total) destacar(r, l.codigo === 'D' ? LIMA : GRIS)
  }

  // Balance de situación
  const bs = wb.addWorksheet('Balance de situación')
  cabecera(bs, 'Balance de situación (modelo PYMES)', `A ${fmtFecha(d.hasta)}`, [
    { h: '', w: 6 },
    { h: 'Partida', w: 50 },
    { h: 'Importe', w: 18, eur: true },
  ])
  destacar(bs.addRow(['', 'ACTIVO', bal.totalActivo]), LIMA)
  for (const l of bal.activo) {
    const r = bs.addRow([l.codigo, l.nombre, l.importe])
    if (l.total) destacar(r)
  }
  bs.addRow([])
  destacar(bs.addRow(['', 'PATRIMONIO NETO Y PASIVO', bal.totalPasivo]), LIMA)
  for (const l of bal.pasivo) {
    const r = bs.addRow([l.codigo, l.nombre, l.importe])
    if (l.total) destacar(r)
  }
  if (Math.abs(bal.diferencia) >= 0.01) {
    bs.addRow([])
    bs.addRow(['', 'Diferencia (falta el asiento de apertura o asientos manuales)', bal.diferencia]).font = { bold: true, color: { argb: 'FFB54708' } }
  }

  // Inmovilizado
  if (d.inmovilizados.length) {
    const inm = wb.addWorksheet('Inmovilizado')
    cabecera(inm, 'Inmovilizado y amortizaciones', periodo, [
      { h: 'Bien', w: 36 },
      { h: 'Tipo', w: 34 },
      { h: 'Cuenta', w: 10 },
      { h: 'Alta', w: 12 },
      { h: 'Coef. %', w: 9 },
      { h: 'Valor', w: 15, eur: true },
      { h: 'Amortizado', w: 15, eur: true },
      { h: 'Valor neto', w: 15, eur: true },
    ])
    for (const i of d.inmovilizados) {
      const cuadro = cuadroAmortizacion(i, d.hasta)
      const acum = cuadro.at(-1)?.acumulado ?? 0
      inm.addRow([i.nombre, TIPOS_INMOVILIZADO.find((t) => t.id === i.tipo)?.nombre ?? i.tipo, i.cuenta, fmtFecha(i.fecha_inicio), Number(i.coeficiente), Number(i.valor), acum, r2(Number(i.valor) - acum)])
    }
  }

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const num = (n: number) => (n ? n.toFixed(2).replace('.', ',') : '0,00')
const csvCampo = (v: string | number) => {
  const s = String(v ?? '')
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const csv = (filas: (string | number)[][]) => '﻿' + filas.map((f) => f.map(csvCampo).join(';')).join('\r\n') + '\r\n'

/** Sage 50 / ContaPlus: CSV de asientos (Asiento;Fecha;Subcuenta;…) */
export function asientosSage(asientos: Asiento[], nombres: Record<string, string>): string {
  const filas: (string | number)[][] = [['Asiento', 'Fecha', 'Subcuenta', 'Descripción subcuenta', 'Concepto', 'Documento', 'Debe', 'Haber']]
  for (const a of asientos) for (const p of a.apuntes) filas.push([a.n, fmtFecha(a.fecha), p.cuenta, nombreCuenta(p.cuenta, nombres), a.concepto.slice(0, 60), a.documento ?? '', num(p.debe), num(p.haber)])
  return csv(filas)
}

/** A3 (A3ECO / A3ASESOR): Excel de importación de asientos */
export async function asientosA3(asientos: Asiento[], nombres: Record<string, string>): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Asientos')
  ws.columns = [
    { header: 'Fecha', key: 'f', width: 12 },
    { header: 'Asiento', key: 'n', width: 9 },
    { header: 'Cuenta', key: 'c', width: 12 },
    { header: 'Descripción cuenta', key: 'dc', width: 38 },
    { header: 'Concepto', key: 'co', width: 50 },
    { header: 'Documento', key: 'doc', width: 16 },
    { header: 'Debe', key: 'd', width: 14 },
    { header: 'Haber', key: 'h', width: 14 },
  ]
  for (const a of asientos)
    for (const p of a.apuntes)
      ws.addRow({ f: fmtFecha(a.fecha), n: a.n, c: p.cuenta, dc: nombreCuenta(p.cuenta, nombres), co: a.concepto.slice(0, 40), doc: a.documento ?? '', d: p.debe, h: p.haber })
  ws.getRow(1).font = { bold: true }
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer
}

/** Holded: Excel de importación de asientos contables */
export async function asientosHolded(asientos: Asiento[], nombres: Record<string, string>): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Asientos')
  ws.columns = [
    { header: 'Fecha', key: 'f', width: 12 },
    { header: 'Número de asiento', key: 'n', width: 10 },
    { header: 'Cuenta', key: 'c', width: 12 },
    { header: 'Nombre de la cuenta', key: 'nc', width: 38 },
    { header: 'Descripción', key: 'de', width: 50 },
    { header: 'Debe', key: 'd', width: 14 },
    { header: 'Haber', key: 'h', width: 14 },
  ]
  for (const a of asientos)
    for (const p of a.apuntes) ws.addRow({ f: fmtFecha(a.fecha), n: a.n, c: p.cuenta, nc: nombreCuenta(p.cuenta, nombres), de: a.concepto, d: p.debe, h: p.haber })
  ws.getRow(1).font = { bold: true }
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer
}
