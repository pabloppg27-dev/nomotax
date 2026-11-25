/**
 * Prueba del motor de Trimestre (qué modelos tocan y cuánto salen), sin Supabase.
 *   node test-data/probar-trimestre.ts
 */
import assert from 'node:assert/strict'
import { modelosDelTrimestre, paisDeNif, plazoDe, trimestreAPresentar, type DatosEmpresa, type FacturaT, type GastoT, type NominaT } from '../src/lib/trimestre.ts'

const fac = (fecha: string, base: number, o: Partial<FacturaT> = {}): FacturaT => ({
  fecha, estado: 'emitida', base, cuota_iva: base * 0.21, cuota_irpf: 0, total: base * 1.21, cliente: { nombre: 'Cliente SL', nif: 'B11111111', pais: 'España' }, fecha_cobro: null, ...o,
})
const gas = (fecha: string, base: number, o: Partial<GastoT> = {}): GastoT => ({
  fecha, estado: 'revisado', base, cuota_iva: base * 0.21, cuota_irpf: 0, total: base * 1.21, categoria: 'otros', proveedor: 'Proveedor', proveedor_nif: 'B22222222',
  revision: null, pagado: true, fecha_pago: fecha, ...o,
})
const nom = (mes: number, irpf: number): NominaT => ({ anio: 2026, mes, estado: 'publicada', irpf, bruto: 2000, ss_empresa: 640, coste_total: 2640 })
const empresa = (o: Partial<DatosEmpresa>): DatosEmpresa => ({ perfil: { id: 'x', nombre: 'X', nif: '12345678Z', fiscal: null }, facturas: [], gastos: [], nominas: [], presentados: [], trabajadores: 0, ...o })
const de = (r: ReturnType<typeof modelosDelTrimestre>, m: string) => r.modelos.find((x) => x.modelo === m)

// 1) Autónomo con alquiler, profesional y un gasto sin revisar (4T)
{
  const r = modelosDelTrimestre(
    empresa({
      perfil: { id: 'a', nombre: 'Autónomo', nif: '12345678Z', fiscal: { forma: 'autonomo', irpf: 'directa_simplificada', iva: [] } },
      facturas: [fac('2026-02-10', 10000), fac('2026-11-05', 10000), fac('2026-12-01', 500, { estado: 'borrador' })],
      gastos: [
        gas('2026-10-01', 1000, { categoria: 'alquiler', cuota_irpf: 190 }),
        gas('2026-10-15', 500, { categoria: 'profesionales', cuota_irpf: 75 }),
        gas('2026-12-20', 300, { estado: 'pendiente' }),
      ],
      presentados: [{ id: 'p', modelo: '130', anio: 2026, periodo: '1T', resultado: 'ingresar', importe: 1900, fecha_presentacion: '2026-04-15', file_path: null }],
    }),
    2026,
    4,
  )
  assert.equal(r.forma, 'autonomo')
  const m303 = de(r, '303')!
  assert.equal(m303.importe, 2100 - 315) // 2.100 repercutido − (210 + 105) soportado
  assert.equal(m303.resultado, 'ingresar')
  assert.equal(de(r, '111')!.importe, 75)
  assert.equal(de(r, '115')!.importe, 190)
  // 130: (20.000 − 1.500) = 18.500 → −5% (925) = 17.575 → 20% = 3.515 − 1.900 del 1T = 1.615
  const m130 = de(r, '130')!
  assert.equal(m130.importe, 1615)
  assert.ok(m130.notas.some((n) => n.includes('2T, 3T')), 'avisa de que faltan 2T y 3T')
  assert.ok(r.avisos[0].startsWith('1 gasto sin revisar'))
  // Anuales en el 4T
  assert.ok(de(r, '390') && de(r, '190') && de(r, '180'))
  assert.equal(de(r, '347')!.desglose.length, 1) // Cliente SL: 24.200€ > 3.005,06€
  assert.equal(de(r, '202'), undefined)
}

// 2) Recargo de equivalencia: sin 303 ni 390
{
  const r = modelosDelTrimestre(empresa({ perfil: { id: 'b', nombre: 'Tienda', nif: '12345678Z', fiscal: { forma: 'autonomo', iva: ['recargo'] } }, facturas: [fac('2026-05-01', 1000)] }), 2026, 2)
  assert.equal(de(r, '303')!.estado, 'no_obligado')
}

// 3) Sociedad que vende a Francia: 349, 202 y ROI
{
  const r = modelosDelTrimestre(
    empresa({
      perfil: { id: 'c', nombre: 'SL', nif: 'B12345678', fiscal: null },
      facturas: [fac('2026-08-01', 4000, { cuota_iva: 0, total: 4000, cliente: { nombre: 'Client SARL', nif: 'FR12345678901', pais: 'Francia' } })],
      gastos: [gas('2026-07-01', 1000, { proveedor_nif: 'DE123456789', cuota_iva: 0, total: 1000 })],
    }),
    2026,
    3,
  )
  assert.equal(r.forma, 'sociedad')
  const m349 = de(r, '349')!
  assert.equal(m349.importe, 5000)
  assert.ok(m349.notas[0].includes('ROI'))
  assert.equal(de(r, '202')!.periodo, '2P')
  assert.equal(de(r, '303')!.resultado, 'cero')
  assert.ok(de(r, '303')!.notas.some((n) => n.includes('proveedores de la UE')))
  assert.ok(r.avisos.some((a) => a.startsWith('Sin régimen fiscal')))
}

// 4) Profesional con retención en casi todo: 130 probablemente no obligado
{
  const r = modelosDelTrimestre(
    empresa({ perfil: { id: 'd', nombre: 'Abogada', nif: '12345678Z', fiscal: { forma: 'autonomo' } }, facturas: [fac('2026-01-10', 9000, { cuota_irpf: 1350 }), fac('2026-02-10', 1000)] }),
    2026,
    1,
  )
  assert.equal(de(r, '130')!.estado, 'no_obligado')
}

// 5) Nóminas: 111 con IRPF y aviso del mes que falta; presentado
{
  const r = modelosDelTrimestre(
    empresa({
      perfil: { id: 'e', nombre: 'SL', nif: 'B12345678', fiscal: { forma: 'sociedad' } },
      nominas: [nom(10, 300), nom(11, 300)],
      trabajadores: 1,
      presentados: [{ id: 'q', modelo: '303', anio: 2026, periodo: '4T', resultado: 'cero', importe: 0, fecha_presentacion: '2027-01-20', file_path: null }],
    }),
    2026,
    4,
  )
  const m111 = de(r, '111')!
  assert.equal(m111.importe, 600)
  assert.ok(m111.notas[0].includes('diciembre'))
  assert.equal(de(r, '303')!.estado, 'presentado')
  assert.equal(de(r, '202')!.periodo, '3P')
}

// 5b) Un registro sin fecha de presentación es «pendiente de presentar», no presentado
{
  const r = modelosDelTrimestre(
    empresa({
      perfil: { id: 'g', nombre: 'SL', nif: 'B12345678', fiscal: { forma: 'sociedad' } },
      presentados: [{ id: 'z', modelo: '303', anio: 2026, periodo: '4T', resultado: 'ingresar', importe: 500, fecha_presentacion: null, file_path: null }],
    }),
    2026,
    4,
  )
  assert.equal(de(r, '303')!.estado, 'pendiente')
  assert.equal(de(r, '303')!.preparado?.id, 'z')
}

// 6) Módulos y criterio de caja
{
  const r = modelosDelTrimestre(
    empresa({
      perfil: { id: 'f', nombre: 'Bar', nif: '12345678Z', fiscal: { forma: 'autonomo', irpf: 'modulos', iva: ['caja'] } },
      facturas: [fac('2026-03-20', 1000, { estado: 'cobrada', fecha_cobro: '2026-04-05' }), fac('2026-04-10', 1000)],
    }),
    2026,
    2,
  )
  assert.equal(de(r, '131')!.estado, 'manual')
  assert.equal(de(r, '303')!.importe, 210) // solo la cobrada en abril
}

// Utilidades
assert.equal(paisDeNif('FR12345678901'), 'FR')
assert.equal(paisDeNif('B12345678'), null)
assert.equal(paisDeNif('ESB12345678'), null)
assert.equal(plazoDe('303', 2026, '4T'), '2027-01-30')
assert.equal(plazoDe('111', 2026, '4T'), '2027-01-20')
assert.equal(plazoDe('130', 2026, '2T'), '2026-07-20')
assert.deepEqual(trimestreAPresentar(new Date(2026, 10, 26)), { anio: 2026, t: 4 })
assert.deepEqual(trimestreAPresentar(new Date(2027, 0, 15)), { anio: 2026, t: 4 })
assert.deepEqual(trimestreAPresentar(new Date(2026, 9, 10)), { anio: 2026, t: 3 })

console.log('Trimestre: todas las pruebas pasan')
