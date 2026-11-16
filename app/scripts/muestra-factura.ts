// PDF de ejemplo de la factura automática, con el diseño real de la app.
// Se ejecuta con: node scripts/empaquetar-facturar.mjs --muestra

import { writeFileSync } from 'node:fs'
import { construirPdf } from '../src/lib/pdfFactura'
import { facturaDelDia, IRPF_NOMOTAX } from '../src/lib/facturaPlan'
import { calcularTotales } from '../src/lib/totals'
import type { Emisor, Invoice } from '../src/lib/types'

const hoy = '2026-12-01'
const nova = {
  plan: 'empresa_smart',
  plan_periodo: 'mensual' as const,
  plan_proximo_cobro: '2026-12-01',
  plan_precio: 130,
  plan_nominas: 4,
  plan_nomina_precio: 15,
}
const f = facturaDelDia(nova, hoy)
if (!f) throw new Error('No toca factura ese día')
const t = calcularTotales(f.lineas, IRPF_NOMOTAX)

const emisor: Emisor = {
  nombre: 'Pablo Pérez del Pulgar Gil',
  nif: '23927599D',
  direccion: '[Tu dirección]',
  cp: '[CP]',
  ciudad: '[Ciudad]',
  pais: 'España',
  email: 'info@nomotax.io',
  telefono: '+34 642 75 76 33',
  iban: 'ES00 0000 0000 0000 0000 0000',
}

const factura = {
  id: 'muestra',
  owner_id: 'muestra',
  contact_id: null,
  origen: 'app',
  tipo: 'factura',
  cliente: { nombre: 'Nova Hiring SL', nif: 'B75773119', direccion: 'C/ Turia 53', ciudad: 'Valencia', pais: 'España', email: 'marc@novahiring.com' },
  serie: 'NT',
  num: 1,
  numero: 'NT2026-0001',
  fecha: hoy,
  vencimiento: hoy,
  lineas: f.lineas,
  base: t.base,
  cuota_iva: t.cuota_iva,
  irpf_pct: IRPF_NOMOTAX,
  cuota_irpf: t.cuota_irpf,
  total: t.total,
  estado: 'emitida',
  notas: null,
} as unknown as Invoice

const { doc } = await construirPdf('factura', factura, emisor, { nombreComercial: 'NomoTax' }, null, false)
const salida = 'test-data/Muestra factura automatica NomoTax - Nova Hiring.pdf'
writeFileSync(salida, Buffer.from(doc.output('arraybuffer')))
console.log(`✓ ${salida}`)
console.log(f.lineas.map((l) => `  ${l.concepto.replace('\n', ' — ')}: ${l.cantidad} × ${l.precio}€`).join('\n'))
console.log(`  Base ${t.base} · IVA ${t.cuota_iva} · IRPF −${t.cuota_irpf} · Total ${t.total}`)

// Correo de la factura (mismo diseño que el de bienvenida)
const { htmlFactura } = await import('../supabase/functions/facturar-planes/correo')
const correo = 'test-data/Vista previa correo factura - Nova Hiring.html'
writeFileSync(
  correo,
  htmlFactura({ nombre: 'Nova Hiring SL', numero: 'NT2026-0001', fecha: hoy, lineas: f.lineas, base: t.base, cuota_iva: t.cuota_iva, cuota_irpf: t.cuota_irpf, total: t.total, iban: emisor.iban }),
)
console.log(`✓ ${correo}`)
