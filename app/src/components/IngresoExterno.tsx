import { useEffect, useState } from 'react'
import { Check, Sparkles, Trash2 } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { BUCKET, errorMessage, supabase } from '../lib/supabase'
import { eur, limpiarNif, round2 } from '../lib/format'
import type { Invoice } from '../lib/types'
import DocPreview from './DocPreview'
import NumInput from './NumInput'
import { Button, Field, Input, Modal, Select, confirmar, notify } from './ui'

/** Revisión de una factura emitida que se ha subido desde otro programa */
export default function IngresoExterno({
  factura,
  onClose,
  onChanged,
}: {
  factura: Invoice | null
  onClose: () => void
  onChanged: () => void
}) {
  const { isAdvisor } = useAuth()
  const [f, setF] = useState<Invoice | null>(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => setF(factura ? { ...factura } : null), [factura])
  if (!factura || !f) return null

  const set = <K extends keyof Invoice>(k: K, v: Invoice[K]) => setF({ ...f, [k]: v })
  const setCliente = (k: 'nombre' | 'nif', v: string) => setF({ ...f, cliente: { ...f.cliente, [k]: v } })
  const calculado = round2(Number(f.base) + Number(f.cuota_iva) - Number(f.cuota_irpf))
  const descuadre = Math.abs(calculado - Number(f.total)) > 0.02
  const ocr = f.ocr

  const guardar = async () => {
    if (!f.numero || !f.fecha) return notify('Faltan el número o la fecha', 'error')
    setGuardando(true)
    const tipo = f.lineas?.[0]?.iva ?? (Number(f.base) ? round2((Number(f.cuota_iva) / Number(f.base)) * 100) : 0)
    const { error } = await supabase
      .from('invoices')
      .update({
        numero: f.numero,
        fecha: f.fecha,
        vencimiento: f.vencimiento,
        cliente: { ...f.cliente, nif: limpiarNif(f.cliente.nif) },
        base: f.base,
        cuota_iva: f.cuota_iva,
        cuota_irpf: f.cuota_irpf,
        irpf_pct: Number(f.base) ? round2((Number(f.cuota_irpf) / Number(f.base)) * 100) : 0,
        total: f.total,
        estado: f.estado,
        contabilizado: f.contabilizado,
        lineas: [{ concepto: f.lineas?.[0]?.concepto || 'Según factura', cantidad: 1, precio: Number(f.base), iva: tipo }],
      })
      .eq('id', f.id)
    setGuardando(false)
    if (error) return notify(await errorMessage(error), 'error')
    notify('Factura guardada')
    onChanged()
    onClose()
  }

  const borrar = async () => {
    const ok = await confirmar({
      titulo: 'Eliminar factura subida',
      texto: 'Se borrará la factura y el documento adjunto. No se puede deshacer.',
      accion: 'Eliminar',
      peligro: true,
    })
    if (!ok) return
    if (f.file_path) await supabase.storage.from(BUCKET).remove([f.file_path])
    const { error } = await supabase.from('invoices').delete().eq('id', f.id)
    if (error) return notify(await errorMessage(error), 'error')
    notify('Factura eliminada')
    onChanged()
    onClose()
  }

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title="Factura emitida (subida)"
      footer={
        <>
          <Button variant="ghost" className="mr-auto text-rojo" icon={<Trash2 className="size-4" />} onClick={borrar}>
            Eliminar
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button icon={<Check className="size-4" />} loading={guardando} onClick={guardar}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="grid gap-6 md:grid-cols-[1fr_1.1fr]">
        <div className="md:sticky md:top-0 md:self-start">
          <DocPreview path={f.file_path} />
        </div>
        <div className="space-y-4">
          <div className="flex gap-2 rounded-xl bg-lima/35 px-3 py-2.5 text-sm">
            <Sparkles className="mt-0.5 size-4 shrink-0" />
            <span>
              Datos leídos automáticamente. Revísalos y guarda.
              {ocr?.notas && <span className="mt-1 block text-ink/75">{ocr.notas}</span>}
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Cliente" className="sm:col-span-2">
              <Input value={f.cliente?.nombre ?? ''} onChange={(e) => setCliente('nombre', e.target.value)} />
            </Field>
            <Field label="NIF del cliente">
              <Input value={f.cliente?.nif ?? ''} onChange={(e) => setCliente('nif', e.target.value)} />
            </Field>
            <Field label="Nº de factura">
              <Input value={f.numero ?? ''} onChange={(e) => set('numero', e.target.value)} />
            </Field>
            <Field label="Fecha">
              <Input type="date" value={f.fecha ?? ''} onChange={(e) => set('fecha', e.target.value)} />
            </Field>
            <Field label="Vencimiento">
              <Input type="date" value={f.vencimiento ?? ''} onChange={(e) => set('vencimiento', e.target.value || null)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3 rounded-xl border border-line p-4">
            <Field label="Base imponible">
              <NumInput className="text-right" value={Number(f.base)} onValue={(n) => set('base', n)} />
            </Field>
            <Field label="Cuota de IVA">
              <NumInput className="text-right" value={Number(f.cuota_iva)} onValue={(n) => set('cuota_iva', n)} />
            </Field>
            <Field label="Retención IRPF">
              <NumInput className="text-right" value={Number(f.cuota_irpf)} onValue={(n) => set('cuota_irpf', n)} />
            </Field>
            <Field label="Total">
              <NumInput className="text-right font-semibold" value={Number(f.total)} onValue={(n) => set('total', n)} />
            </Field>
            {descuadre && (
              <p className="col-span-2 text-sm text-ambar">Base + IVA − IRPF = {eur(calculado)}, no coincide con el total.</p>
            )}
          </div>
          <Field label="Estado de cobro">
            <Select value={f.estado} onChange={(e) => set('estado', e.target.value as Invoice['estado'])}>
              <option value="emitida">Pendiente de cobro</option>
              <option value="cobrada">Cobrada</option>
            </Select>
          </Field>
          {isAdvisor && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-ink"
                checked={f.contabilizado}
                onChange={(e) => set('contabilizado', e.target.checked)}
              />
              Contabilizada por el asesor
            </label>
          )}
        </div>
      </div>
    </Modal>
  )
}
