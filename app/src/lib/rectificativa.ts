import { errorMessage, supabase } from './supabase'
import { hoyISO } from './format'
import { calcularTotales } from './totals'
import type { Invoice, Profile } from './types'
import { confirmar, notify } from '../components/ui'

/**
 * Un clic: borrador de rectificativa que anula la factura entera (importes en negativo).
 * Vale para las facturas de la app y para las subidas desde otro programa, cobradas o no.
 * Devuelve el id del borrador creado, o null si se cancela o falla.
 */
export async function crearBorradorRectificativa(factura: Invoice, owner: Profile, yaRectificaciones = 0): Promise<string | null> {
  const ok = await confirmar({
    titulo: 'Crear factura rectificativa',
    texto:
      `Se creará un borrador en la serie ${owner.serie_rectificativa || 'R'} que anula la factura ${factura.numero} (los mismos conceptos en negativo). ` +
      'Si solo hay que corregir una parte, deja en el borrador únicamente la diferencia antes de emitirla.' +
      (yaRectificaciones ? ` Ojo: esta factura ya tiene ${yaRectificaciones} rectificativa${yaRectificaciones > 1 ? 's' : ''}.` : ''),
    accion: 'Crear rectificativa',
  })
  if (!ok) return null
  const negativas = (factura.lineas ?? []).map((l) => ({ ...l, precio: -Number(l.precio) }))
  const t = calcularTotales(negativas, Number(factura.irpf_pct))
  const { data, error } = await supabase
    .from('invoices')
    .insert({
      owner_id: owner.id,
      tipo: 'rectificativa',
      serie: owner.serie_rectificativa || 'R',
      rectifica_id: factura.id,
      rectifica_numero: factura.numero,
      rectifica_fecha: factura.fecha,
      causa_rectificacion: 'R1',
      contact_id: factura.contact_id,
      cliente: factura.cliente,
      fecha: hoyISO(),
      lineas: negativas,
      irpf_pct: factura.irpf_pct,
      base: t.base,
      cuota_iva: t.cuota_iva,
      cuota_irpf: t.cuota_irpf,
      total: t.total,
      // En la misma moneda y con las mismas cuentas que la factura (supabase/cuentas-bancarias.sql)
      ...('cuentas_bancarias' in owner ? { moneda: factura.moneda ?? 'EUR', cuentas_cobro: factura.cuentas_cobro ?? null } : {}),
    })
    .select('id')
    .single()
  if (error) {
    notify(await errorMessage(error), 'error')
    return null
  }
  notify('Borrador de rectificativa creado: revisa el motivo y emítela')
  return data.id as string
}
