/** Informe en PDF de la Vista de socio: para descargar o reenviar a los socios */
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { eur, fecha } from './format'
import { variacion, type LineaComparada, type VistaSocio } from './vistaSocio'
import type { LineaInforme } from './contabilidad'

const INK: [number, number, number] = [17, 17, 16]
const LIMA: [number, number, number] = [205, 245, 100]
const MUTED: [number, number, number] = [107, 107, 101]
const PAPER: [number, number, number] = [247, 247, 245]

export function informeSocio(v: VistaSocio, empresa: string): Blob {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const M = 16

  // Cabecera
  doc.setFillColor(...INK)
  doc.rect(0, 0, W, 30, 'F')
  doc.setFillColor(...LIMA)
  doc.rect(0, 30, W, 1.6, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(17)
  doc.text(empresa, M, 14)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.setTextColor(...LIMA)
  doc.text(`INFORME PARA SOCIOS · DEL ${fecha(v.desde)} AL ${fecha(v.hasta)}`, M, 22)

  let y = 42
  const titulo = (t: string) => {
    if (y > 260) {
      doc.addPage()
      y = 20
    }
    doc.setTextColor(...INK)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11.5)
    doc.text(t, M, y)
    y += 3
  }
  const tabla = (head: string[], body: (string | { content: string; styles?: object })[][], derecha: number[], negrita: number[] = []) => {
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M },
      head: [head],
      body,
      theme: 'plain',
      styles: { fontSize: 8.8, cellPadding: { top: 1.6, bottom: 1.6, left: 2, right: 2 }, textColor: INK },
      headStyles: { fillColor: PAPER, textColor: MUTED, fontStyle: 'bold' },
      columnStyles: Object.fromEntries(derecha.map((i) => [i, { halign: 'right' }])),
      didParseCell: (d) => {
        if (d.section === 'body' && negrita.includes(d.row.index)) d.cell.styles.fontStyle = 'bold'
      },
    })
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 9
  }

  const c = v.cifras
  titulo('Cifras clave')
  tabla(
    ['', 'Periodo', `Mismo periodo ${v.anterior.desde.slice(0, 4)}`, 'Variación'],
    [
      ['Ventas', eur(c.ventas), eur(c.ventasAnt), variacion(c.ventas, c.ventasAnt)],
      ['Gastos', eur(c.gastos), eur(c.gastosAnt), variacion(c.gastos, c.gastosAnt)],
      ['Resultado', eur(c.resultado), eur(c.resultadoAnt), variacion(c.resultado, c.resultadoAnt)],
      ['Margen', c.margen === null ? '—' : `${(c.margen * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })}%`, '', ''],
      ['Coste de personal', eur(v.plantilla.costePersonal), eur(v.plantilla.costePersonalAnt), variacion(v.plantilla.costePersonal, v.plantilla.costePersonalAnt)],
    ],
    [1, 2, 3],
    [2],
  )

  titulo('Liquidez a ' + fecha(v.hasta))
  tabla(
    ['', 'Importe'],
    [
      ['Dinero en bancos', eur(v.liquidez.tesoreria)],
      ['Pendiente de cobrar a clientes', eur(v.liquidez.pendienteCobro)],
      ['Pendiente de pagar a proveedores', eur(v.liquidez.pendientePago)],
      ['Hacienda, Seguridad Social y nóminas pendientes', eur(v.liquidez.administraciones)],
      ['Plantilla (trabajadores de alta)', String(v.plantilla.trabajadores)],
    ],
    [1],
  )

  titulo('Cuenta de pérdidas y ganancias (modelo PYMES)')
  tabla(
    ['', 'Periodo', `Mismo periodo ${v.anterior.desde.slice(0, 4)}`],
    v.pyg.map((l: LineaComparada) => [l.nombre, eur(l.importe), eur(l.anterior)]),
    [1, 2],
    v.pyg.map((l, i) => (l.total ? i : -1)).filter((i) => i >= 0),
  )

  doc.addPage()
  y = 20
  const filas = (ls: LineaInforme[]) => ls.map((l) => [l.nivel === 0 ? l.nombre : `   ${l.nombre}`, eur(l.importe)])
  const totales = (ls: LineaInforme[]) => ls.map((l, i) => (l.total ? i : -1)).filter((i) => i >= 0)
  titulo(`Balance de situación a ${fecha(v.hasta)} · Activo`)
  tabla(['', 'Importe'], [...filas(v.balance.activo), ['TOTAL ACTIVO', eur(v.balance.totalActivo)]], [1], [...totales(v.balance.activo), v.balance.activo.length])
  titulo('Patrimonio neto y pasivo')
  tabla(['', 'Importe'], [...filas(v.balance.pasivo), ['TOTAL PATRIMONIO NETO Y PASIVO', eur(v.balance.totalPasivo)]], [1], [...totales(v.balance.pasivo), v.balance.pasivo.length])

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...MUTED)
  const nota = doc.splitTextToSize(
    'Cifras calculadas con la contabilidad del Área de clientes de NomoTax (facturas, gastos revisados, nóminas, asientos e inmovilizado registrados hasta la fecha). ' +
      'Son orientativas hasta el cierre del ejercicio.' +
      (v.balance.cuadra ? '' : ' El balance aún no cuadra: falta el asiento de apertura del ejercicio.'),
    W - 2 * M,
  )
  doc.text(nota, M, Math.min(y, 275))
  return doc.output('blob')
}
