// PDFs de ejemplo de la cuenta demo «NomoTax Demo, S.L.» (todo inventado, marcado «EJEMPLO»).
// Los llama scripts/demo-nomotax.mjs y van a public/demo-docs/ (se publican con la web, no a Supabase).
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { jsPDF } from 'jspdf'

const INK = [17, 17, 16]
const GRIS = [110, 110, 105]
const LINEA = [225, 225, 220]
const LIMA = [205, 245, 100]
const W = 210
const M = 18
const eur = (x) => {
  const [e, d] = Math.abs(x).toFixed(2).split('.')
  return `${x < 0 ? '-' : ''}${e.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${d}€`
}
const f = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const larga = (iso) => `${Number(iso.slice(8, 10))} de ${MESES[Number(iso.slice(5, 7)) - 1]} de ${iso.slice(0, 4)}`
// Las fuentes estándar del PDF no tienen algunos signos tipográficos
const t = (s) => String(s).replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/·/g, '-').replace(/…/g, '...')

class Doc {
  constructor(titulo, sub) {
    this.d = new jsPDF({ unit: 'mm', format: 'a4' })
    this.d.setProperties({ title: t(titulo), author: 'NomoTax Demo, S.L. (ejemplo)' })
    this.y = 0
    this.cabecera(titulo, sub)
  }
  cabecera(titulo, sub) {
    const d = this.d
    d.setFillColor(...LIMA)
    d.rect(0, 0, W, 9, 'F')
    d.setFont('helvetica', 'bold').setFontSize(7.5).setTextColor(...INK)
    d.text('DOCUMENTO DE EJEMPLO - DATOS FICTICIOS - CUENTA DEMO DE NOMOTAX', W / 2, 5.8, { align: 'center' })
    d.setFontSize(17).text(t(titulo), M, 24)
    this.y = 24
    if (sub) {
      d.setFont('helvetica', 'normal').setFontSize(10).setTextColor(...GRIS)
      for (const l of d.splitTextToSize(t(sub), W - 2 * M)) d.text(l, M, (this.y += 6))
    }
    this.y += 8
    this.marca()
  }
  marca() {
    const d = this.d
    d.saveGraphicsState()
    d.setGState(new d.GState({ opacity: 0.06 }))
    d.setFont('helvetica', 'bold').setFontSize(110).setTextColor(...INK)
    d.text('EJEMPLO', W / 2, 190, { align: 'center', angle: 30 })
    d.restoreGraphicsState()
  }
  sitio(h) {
    if (this.y + h > 280) {
      this.d.addPage()
      this.y = 20
      this.marca()
    }
  }
  h2(s) {
    this.sitio(14)
    this.y += 3
    this.d.setFont('helvetica', 'bold').setFontSize(11).setTextColor(...INK).text(t(s), M, this.y)
    this.y += 2
    this.d.setDrawColor(...LINEA).line(M, this.y, W - M, this.y)
    this.y += 5
  }
  p(s, { size = 9.5, gris = false, bold = false } = {}) {
    const d = this.d
    d.setFont('helvetica', bold ? 'bold' : 'normal').setFontSize(size).setTextColor(...(gris ? GRIS : INK))
    for (const l of d.splitTextToSize(t(s), W - 2 * M)) {
      this.sitio(6)
      d.text(l, M, this.y)
      this.y += size * 0.45
    }
    this.y += 1.5
  }
  kv(filas, cols = 2) {
    const d = this.d
    const ancho = (W - 2 * M) / cols
    for (let i = 0; i < filas.length; i += cols) {
      this.sitio(11)
      filas.slice(i, i + cols).forEach(([k, v], j) => {
        const x = M + j * ancho
        d.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...GRIS).text(t(k).toUpperCase(), x, this.y)
        d.setFont('helvetica', 'bold').setFontSize(9.5).setTextColor(...INK).text(d.splitTextToSize(t(v ?? '-'), ancho - 3)[0], x, this.y + 4.5)
      })
      this.y += 11
    }
  }
  tabla(cab, filas, anchos, { total } = {}) {
    const d = this.d
    const xs = anchos.reduce((a, w) => [...a, a[a.length - 1] + w], [M])
    const fila = (cells, bold, fondo) => {
      this.sitio(7)
      if (fondo) {
        d.setFillColor(...fondo)
        d.rect(M, this.y - 4.2, W - 2 * M, 6.4, 'F')
      }
      d.setFont('helvetica', bold ? 'bold' : 'normal').setFontSize(8.8).setTextColor(...INK)
      cells.forEach((c, i) => {
        const num = i > 0
        d.text(t(c), num ? xs[i + 1] - 2 : xs[i] + 2, this.y, num ? { align: 'right' } : undefined)
      })
      this.y += 6.4
    }
    fila(cab, true, [240, 240, 236])
    filas.forEach((r) => fila(r, false))
    if (total) fila(total, true, LIMA)
    this.y += 3
  }
  firma(izq, der) {
    this.sitio(34)
    this.y += 14
    const d = this.d
    d.setDrawColor(...GRIS)
    d.line(M, this.y, M + 70, this.y)
    d.line(W - M - 70, this.y, W - M, this.y)
    d.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...GRIS)
    d.text(t(izq), M, this.y + 5)
    d.text(t(der), W - M - 70, this.y + 5)
    this.y += 12
  }
  guardar(ruta) {
    const n = this.d.getNumberOfPages()
    for (let i = 1; i <= n; i++) {
      this.d.setPage(i)
      this.d.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...GRIS)
      this.d.text('NomoTax Demo, S.L. es una empresa ficticia para enseñar la app. Ningún dato es real.', M, 291)
      this.d.text(`${i}/${n}`, W - M, 291, { align: 'right' })
    }
    writeFileSync(ruta, Buffer.from(this.d.output('arraybuffer')))
  }
}

/** Genera todos los PDFs y devuelve las rutas públicas (demo-docs/…) por trabajador */
export function generarPdfs({ APP, EMPRESA, CCC, TRAB, nominas, tickets, certificados }) {
  const DIR = join(APP, 'public/demo-docs')
  rmSync(DIR, { recursive: true, force: true })
  for (const sub of ['', 'nominas', 'tickets']) mkdirSync(join(DIR, sub), { recursive: true })
  const empresa = `${EMPRESA.nombre} (CIF ${EMPRESA.nif}), con domicilio en ${EMPRESA.direccion}, ${EMPRESA.cp} ${EMPRESA.ciudad}`
  const out = {}
  const ruta = (n) => ({ fs: join(DIR, n), path: `demo-docs/${n}` })

  for (const w of TRAB) {
    const docs = (out[w.v] = [])
    const slug = w.v

    // DNI (copia)
    {
      const r = ruta(`${slug}-dni.pdf`)
      const d = new Doc('Copia del DNI', `${w.nombre} - aportada por el trabajador al incorporarse`)
      const x = M, y = d.y + 2, ancho = 100, alto = 63
      d.d.setFillColor(236, 240, 246).setDrawColor(...LINEA).roundedRect(x, y, ancho, alto, 4, 4, 'FD')
      d.d.setFillColor(205, 212, 222).roundedRect(x + 6, y + 14, 26, 32, 2, 2, 'F')
      d.d.setFont('helvetica', 'bold').setFontSize(8).setTextColor(...GRIS).text('DOCUMENTO NACIONAL DE IDENTIDAD (EJEMPLO)', x + 6, y + 8)
      const [nom, ...ap] = w.nombre.split(' ')
      const filas = [['APELLIDOS', ap.join(' ')], ['NOMBRE', nom], ['NACIMIENTO', f(w.nac)], ['DNI', w.dni], ['VALIDEZ', `${f(w.nac).slice(0, 6)}2031`]]
      filas.forEach(([k, v], i) => {
        d.d.setFont('helvetica', 'normal').setFontSize(6.5).setTextColor(...GRIS).text(k, x + 38, y + 16 + i * 9)
        d.d.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...INK).text(t(v), x + 38, y + 20 + i * 9)
      })
      d.y = y + alto + 10
      d.p('Copia ficticia generada para la demostración. No corresponde a ninguna persona real.', { gris: true, size: 8.5 })
      d.guardar(r.fs)
      docs.push({ tipo: 'dni', nombre: 'DNI (copia)', path: r.path, fecha: w.inicio })
    }

    // Contrato
    {
      const r = ruta(`${slug}-contrato.pdf`)
      const d = new Doc('Contrato de trabajo indefinido', `A tiempo completo - ${w.puesto}`)
      d.kv([
        ['Empresa', EMPRESA.nombre], ['CIF', EMPRESA.nif],
        ['Centro de trabajo', `${EMPRESA.direccion}, ${EMPRESA.ciudad}`], ['CCC', CCC],
        ['Trabajador/a', w.nombre], ['DNI', w.dni],
        ['N.º afiliación SS', w.nss], ['Fecha de nacimiento', f(w.nac)],
        ['Domicilio', w.domicilio], ['Nivel de estudios', w.estudios],
      ])
      d.h2('Cláusulas')
      const cl = [
        `PRIMERA. El trabajador/a prestará sus servicios como ${w.puesto}, con la clasificación profesional ${w.clas}, en el centro de trabajo de Barcelona, con posibilidad de teletrabajo según el acuerdo anexo.`,
        `SEGUNDA. La jornada será de 40 horas semanales a tiempo completo, de lunes a jueves de 9:00 a 18:00 y los viernes de 8:00 a 15:00, con registro diario de jornada en la app de la empresa.`,
        `TERCERA. La duración del contrato será indefinida y comenzará el ${larga(w.inicio)}. Se establece un periodo de prueba de 6 meses.`,
        `CUARTA. El trabajador/a percibirá una retribución bruta de ${eur(w.bruto * 14)} anuales, distribuidos en 14 pagas de ${eur(w.bruto)} (12 mensualidades y 2 pagas extraordinarias en junio y diciembre)${w.comision ? ', más comisiones del 3% sobre las ventas cobradas de su cartera, que se liquidan en la nómina del mes siguiente' : ''}.`,
        'QUINTA. Vacaciones anuales de 23 días laborables, más el 24 y el 31 de diciembre.',
        'SEXTA. En lo no previsto se estará a lo dispuesto en el XVIII Convenio colectivo estatal de empresas de consultoría, tecnologías de la información y estudios de mercado, y en el Estatuto de los Trabajadores.',
        'SÉPTIMA. Protección de datos: los datos del trabajador/a se tratarán solo para gestionar la relación laboral.',
      ]
      cl.forEach((c) => d.p(c))
      d.p(`En Barcelona, a ${larga(w.inicio)}.`, { gris: true })
      d.firma('La empresa', 'El trabajador/a')
      d.guardar(r.fs)
      docs.push({ tipo: 'contrato', nombre: 'Contrato de trabajo indefinido', path: r.path, fecha: w.inicio })
    }

    // Alta en la Seguridad Social
    {
      const r = ruta(`${slug}-alta-ss.pdf`)
      const d = new Doc('Resolución de alta en la Seguridad Social', 'Régimen General - comunicación de alta del trabajador (ejemplo)')
      d.kv([
        ['Empresa', EMPRESA.nombre], ['Código de cuenta de cotización', CCC],
        ['Trabajador/a', w.nombre], ['DNI', w.dni],
        ['N.º afiliación', w.nss], ['Fecha real de alta', f(w.inicio)],
        ['Contrato', '100 - Indefinido a tiempo completo'], ['Grupo de cotización', w.clas.includes('Grupo A') ? '1' : w.clas.includes('Grupo B') ? '2' : '5'],
      ])
      d.p('Se comunica que el alta del trabajador/a indicado ha sido reconocida en el Régimen General de la Seguridad Social con efectos de la fecha real de alta.', { gris: true })
      d.p('Documento ficticio que imita una resolución de alta para la demostración. No ha sido emitido por ninguna administración.', { gris: true, size: 8.5 })
      d.guardar(r.fs)
      docs.push({ tipo: 'alta_ss', nombre: 'Alta en la Seguridad Social', path: r.path, fecha: w.inicio })
    }

    // Acuerdo de teletrabajo
    {
      const r = ruta(`${slug}-teletrabajo.pdf`)
      const d = new Doc('Acuerdo de trabajo a distancia', 'Ley 10/2021 - anexo al contrato de trabajo')
      d.kv([['Empresa', EMPRESA.nombre], ['Trabajador/a', w.nombre], ['Fecha de efectos', f(w.inicio)], ['Distribución', '2 días en remoto por semana']])
      ;[
        'El trabajo a distancia es voluntario y reversible por ambas partes con un preaviso de 15 días.',
        'La empresa entrega el equipo necesario (portátil, pantalla y auriculares) y compensa los gastos con 35,00€ al mes en la nómina.',
        'El horario y el registro de jornada son los mismos que en la oficina. Se garantiza el derecho a la desconexión digital fuera del horario.',
        `Lugar de trabajo a distancia: ${w.domicilio}.`,
      ].forEach((c) => d.p(c))
      d.firma('La empresa', 'El trabajador/a')
      d.guardar(r.fs)
      docs.push({ tipo: 'teletrabajo', nombre: 'Acuerdo de teletrabajo', path: r.path, fecha: w.inicio })
    }

    // Modelo 145
    {
      const r = ruta(`${slug}-modelo-145.pdf`)
      const d = new Doc('Modelo 145 - Comunicación de datos al pagador', 'Retenciones sobre rendimientos del trabajo (ejemplo rellenado)')
      const casado = w.v === 't1' || w.v === 't2'
      d.kv([
        ['Perceptor', w.nombre], ['NIF', w.dni],
        ['Año de nacimiento', w.nac.slice(0, 4)], ['Situación familiar', casado ? '2 - Casado/a, cónyuge con rentas > 1.500€' : '3 - Otras situaciones'],
        ['Hijos/descendientes menores de 25 años', w.v === 't1' ? '2 (nacidos en 2016 y 2019)' : w.v === 't2' ? '1 (nacido en 2023)' : 'Ninguno'], ['Discapacidad', 'No'],
        ['Movilidad geográfica', 'No'], ['Préstamo vivienda habitual (antes de 2013)', 'No'],
      ])
      d.p(`El perceptor declara que los datos anteriores son ciertos. En Barcelona, a ${larga(w.inicio > '2026-01-01' ? w.inicio : '2026-01-02')}.`, { gris: true })
      d.firma('Recibido: la empresa', 'Firma del perceptor')
      d.guardar(r.fs)
      docs.push({ tipo: 'modelo_145', nombre: 'Modelo 145', path: r.path, fecha: w.inicio > '2026-01-01' ? w.inicio : '2026-01-02' })
    }
  }

  // Certificados de retenciones (para la renta)
  for (const c of certificados) {
    const w = c.t
    const r = ruta(`${w.v}-certificado-${c.anio}.pdf`)
    const d = new Doc(`Certificado de retenciones e ingresos a cuenta del IRPF - ${c.anio}`, 'Rendimientos del trabajo. Para la declaración de la renta (art. 108 del Reglamento del IRPF).')
    d.h2('Pagador')
    d.kv([['Razón social', EMPRESA.nombre], ['NIF', EMPRESA.nif], ['Domicilio', `${EMPRESA.direccion}, ${EMPRESA.cp} ${EMPRESA.ciudad}`], ['Ejercicio', String(c.anio)]])
    d.h2('Perceptor')
    d.kv([['Nombre', w.nombre], ['NIF', w.dni], ['Domicilio', w.domicilio], ['Relación', `Trabajador por cuenta ajena desde ${f(w.inicio)}`]])
    d.h2('Rendimientos del trabajo')
    d.tabla(
      ['Concepto', 'Importe'],
      [
        ['Retribuciones dinerarias íntegras', eur(c.integro)],
        ['Retribuciones en especie', eur(0)],
        ['Retenciones e ingresos a cuenta practicados', eur(c.retencion)],
        ['Gastos deducibles: cotizaciones a la Seguridad Social', eur(c.ss)],
        ['Tipo medio de retención', `${c.pct.toFixed(2).replace('.', ',')}%`],
      ],
      [120, 54],
      { total: ['Rendimiento neto (íntegro - gastos deducibles)', eur(c.integro - c.ss)] },
    )
    d.p('Estos importes coinciden con los declarados por la empresa en el modelo 190 del ejercicio. Guarda este certificado para tu declaración de la renta.', { gris: true })
    d.p(`En Barcelona, a ${larga(`${c.anio + 1}-01-20`)}.`, { gris: true })
    d.firma(`${EMPRESA.nombre}`, '')
    d.guardar(r.fs)
    out[w.v].push({ tipo: 'certificado_retenciones', nombre: `Certificado de retenciones ${c.anio}`, path: r.path, anio: c.anio, fecha: `${c.anio + 1}-01-20` })
  }

  // Nóminas
  const nomPaths = new Map()
  for (const n of nominas) {
    const w = n.t
    const nombre = `${w.v}-${n.anio}-${String(n.mes).padStart(2, '0')}${n.tipo === 'extra' ? '-extra' : ''}.pdf`
    const r = ruta(`nominas/${nombre}`)
    const periodo = `${MESES[n.mes - 1]} de ${n.anio}`
    const d = new Doc(n.tipo === 'extra' ? `Paga extraordinaria de verano - ${n.anio}` : `Nómina de ${periodo}`, `Recibo individual justificativo del pago de salarios - ${EMPRESA.nombre}`)
    d.kv([
      ['Empresa', `${EMPRESA.nombre} - CIF ${EMPRESA.nif}`], ['CCC', CCC],
      ['Trabajador/a', w.nombre], ['DNI / N.º afiliación', `${w.dni} / ${w.nss}`],
      ['Categoría', w.clas], ['Antigüedad', f(w.inicio)],
      ['Periodo', n.tipo === 'extra' ? `Junio de ${n.anio} (extra)` : `Del 1 al ${new Date(n.anio, n.mes, 0).getDate()} de ${periodo}`], ['Días', '30'],
    ])
    const dev = n.conceptos.filter((x) => x.importe > 0)
    const ded = n.conceptos.filter((x) => x.importe < 0)
    if (n.tipo === 'extra') ded.push({ concepto: `Retención IRPF (${w.irpf}%)`, importe: -n.irpf })
    d.h2('Devengos')
    d.tabla(['Concepto', 'Importe'], dev.map((x) => [x.concepto, eur(x.importe)]), [120, 54], { total: ['Total devengado', eur(n.bruto)] })
    d.h2('Deducciones')
    d.tabla(['Concepto', 'Importe'], ded.map((x) => [x.concepto, eur(-x.importe)]), [120, 54], { total: ['Total a deducir', eur(n.irpf + n.ss_trabajador)] })
    d.tabla(['Líquido a percibir', eur(n.neto)], [], [120, 54])
    d.p(`Transferencia a la cuenta ${w.iban.slice(0, 4)} **** **** **** ${w.iban.slice(-4)} el último día hábil del mes.`, { gris: true, size: 8.5 })
    d.h2('Aportación de la empresa')
    d.tabla(['Concepto', 'Importe'], [['Seguridad Social a cargo de la empresa (32,15%)', eur(n.ss_empresa)]], [120, 54], { total: ['Coste total para la empresa', eur(n.coste_total)] })
    d.firma('Recibí: el trabajador/a', `${EMPRESA.nombre}`)
    d.guardar(r.fs)
    nomPaths.set(n, r.path)
  }

  // Tickets de gasto de los trabajadores
  for (const k of tickets) {
    const r = ruta(`tickets/${k.id}.pdf`)
    const d = new jsPDF({ unit: 'mm', format: [80, 120] })
    const c = (s, y, o = {}) => d.text(t(s), 40, y, { align: 'center', ...o })
    d.setFont('courier', 'bold').setFontSize(10)
    c(k.proveedor, 12)
    d.setFont('courier', 'normal').setFontSize(7.5)
    c(`NIF ${k.nif}`, 17)
    c(k.direccion, 21)
    c(`${f(k.fecha)}  ${k.hora}   Ticket ${k.numero}`, 28)
    d.text('-'.repeat(38), 6, 33)
    let y = 39
    for (const [concepto, imp] of k.lineas) {
      d.text(t(concepto), 6, y)
      d.text(eur(imp), 74, y, { align: 'right' })
      y += 5
    }
    d.text('-'.repeat(38), 6, y)
    y += 5
    d.text(`Base imponible`, 6, y), d.text(eur(k.base), 74, y, { align: 'right' })
    d.text(`IVA ${k.iva}%`, 6, (y += 4.5)), d.text(eur(k.cuota), 74, y, { align: 'right' })
    d.setFont('courier', 'bold').setFontSize(10)
    d.text('TOTAL', 6, (y += 7)), d.text(eur(k.total), 74, y, { align: 'right' })
    d.setFont('courier', 'normal').setFontSize(7)
    c('Pagado con tarjeta ****4821', y + 8)
    c('TICKET DE EJEMPLO - DATOS FICTICIOS', 112)
    writeFileSync(r.fs, Buffer.from(d.output('arraybuffer')))
    k.path = r.path
  }

  return { docs: out, nomPaths }
}
