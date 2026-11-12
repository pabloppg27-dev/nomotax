import { useEffect, useState } from 'react'
import { AlertTriangle, Check, Sparkles, Trash2 } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { BUCKET, errorMessage, supabase } from '../lib/supabase'
import { eur, limpiarNif, num, round2 } from '../lib/format'
import { CATEGORIAS } from '../lib/categorias'
import { importesDe, leerFactura } from '../lib/upload'
import type { Expense, OcrResult } from '../lib/types'
import DocPreview from './DocPreview'
import NumInput from './NumInput'
import { Button, Field, Input, Modal, Select, confirmar, notify } from './ui'

type Form = Pick<
  Expense,
  'fecha' | 'proveedor' | 'proveedor_nif' | 'numero' | 'concepto' | 'categoria' | 'base' | 'iva_pct' | 'cuota_iva' | 'irpf_pct' | 'cuota_irpf' | 'total' | 'contabilizado'
>

export default function ExpenseReview({
  gasto,
  onClose,
  onChanged,
}: {
  gasto: Expense | null
  onClose: () => void
  onChanged: () => void
}) {
  const { isAdvisor } = useAuth()
  const [form, setForm] = useState<Form | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [leyendo, setLeyendo] = useState(false)
  const [ocr, setOcr] = useState<OcrResult | null>(null)

  useEffect(() => {
    setOcr(gasto?.ocr ?? null)
    if (!gasto) return setForm(null)
    setForm({
      fecha: gasto.fecha,
      proveedor: gasto.proveedor,
      proveedor_nif: gasto.proveedor_nif,
      numero: gasto.numero,
      concepto: gasto.concepto,
      categoria: gasto.categoria,
      base: Number(gasto.base),
      iva_pct: gasto.iva_pct === null ? null : Number(gasto.iva_pct),
      cuota_iva: Number(gasto.cuota_iva),
      irpf_pct: gasto.irpf_pct === null ? null : Number(gasto.irpf_pct),
      cuota_irpf: Number(gasto.cuota_irpf),
      total: Number(gasto.total),
      contabilizado: gasto.contabilizado,
    })
  }, [gasto])

  if (!gasto || !form) return null

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm({ ...form, [k]: v })
  const calculado = round2(form.base + form.cuota_iva - form.cuota_irpf)
  const descuadre = Math.abs(calculado - form.total) > 0.02
  const varios = (ocr?.desglose_iva?.length ?? 0) > 1

  const releer = async () => {
    if (!gasto.file_path) return
    setLeyendo(true)
    try {
      const o = await leerFactura(gasto.file_path, 'gasto', gasto.owner_id)
      const imp = importesDe(o)
      setOcr(o)
      setForm({
        ...form,
        fecha: o.fecha ?? form.fecha,
        proveedor: o.emisor.nombre ?? form.proveedor,
        proveedor_nif: o.emisor.nif ?? form.proveedor_nif,
        numero: o.numero ?? form.numero,
        concepto: o.concepto ?? form.concepto,
        categoria: o.categoria || form.categoria,
        base: imp.base,
        iva_pct: imp.iva_pct,
        cuota_iva: imp.cuota_iva,
        irpf_pct: imp.irpf_pct,
        cuota_irpf: imp.cuota_irpf,
        total: imp.total,
      })
      notify('Datos leídos. Revísalos y confirma.')
    } catch (e) {
      notify((e as Error).message, 'error')
    }
    setLeyendo(false)
  }

  const guardar = async () => {
    if (!form.fecha) return notify('Falta la fecha de la factura', 'error')
    setGuardando(true)
    const { error } = await supabase
      .from('expenses')
      .update({ ...form, proveedor_nif: limpiarNif(form.proveedor_nif), estado: 'revisado', ocr })
      .eq('id', gasto.id)
    setGuardando(false)
    if (error) return notify(await errorMessage(error), 'error')
    notify('Gasto guardado')
    onChanged()
    onClose()
  }

  const borrar = async () => {
    const ok = await confirmar({
      titulo: 'Eliminar gasto',
      texto: 'Se borrará el gasto y el documento adjunto. No se puede deshacer.',
      accion: 'Eliminar',
      peligro: true,
    })
    if (!ok) return
    if (gasto.file_path) await supabase.storage.from(BUCKET).remove([gasto.file_path])
    const { error } = await supabase.from('expenses').delete().eq('id', gasto.id)
    if (error) return notify(await errorMessage(error), 'error')
    notify('Gasto eliminado')
    onChanged()
    onClose()
  }

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={gasto.estado === 'pendiente' ? 'Revisa los datos del gasto' : 'Gasto'}
      footer={
        <>
          <Button variant="ghost" className="mr-auto text-rojo" icon={<Trash2 className="size-4" />} onClick={borrar}>
            Eliminar
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button icon={<Check className="size-4" />} loading={guardando} onClick={guardar}>
            {gasto.estado === 'pendiente' ? 'Confirmar gasto' : 'Guardar'}
          </Button>
        </>
      }
    >
      <div className="grid gap-6 md:grid-cols-[1fr_1.1fr]">
        <div className="md:sticky md:top-0 md:self-start">
          <DocPreview path={gasto.file_path} />
          {gasto.file_path && (
            <Button
              variant="secondary"
              size="sm"
              className="mt-3"
              icon={<Sparkles className="size-4" />}
              loading={leyendo}
              onClick={releer}
            >
              {leyendo ? 'Leyendo…' : 'Leer de nuevo'}
            </Button>
          )}
        </div>

        <div className="space-y-4">
          {ocr && (
            <div className="flex gap-2 rounded-xl bg-lima/35 px-3 py-2.5 text-sm">
              <Sparkles className="mt-0.5 size-4 shrink-0" />
              <span>
                Datos leídos automáticamente. Revísalos antes de confirmar.
                {ocr.notas && <span className="mt-1 block text-ink/75">{ocr.notas}</span>}
              </span>
            </div>
          )}
          {ocr && !ocr.es_factura && (
            <div className="flex gap-2 rounded-xl bg-ambar/10 px-3 py-2.5 text-sm text-ambar">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              Este documento no parece una factura ni un ticket.
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Proveedor" className="sm:col-span-2">
              <Input value={form.proveedor ?? ''} onChange={(e) => set('proveedor', e.target.value)} />
            </Field>
            <Field label="NIF del proveedor">
              <Input value={form.proveedor_nif ?? ''} onChange={(e) => set('proveedor_nif', e.target.value)} />
            </Field>
            <Field label="Nº de factura">
              <Input value={form.numero ?? ''} onChange={(e) => set('numero', e.target.value)} />
            </Field>
            <Field label="Fecha">
              <Input type="date" value={form.fecha ?? ''} onChange={(e) => set('fecha', e.target.value || null)} />
            </Field>
            <Field label="Categoría">
              <Select value={form.categoria} onChange={(e) => set('categoria', e.target.value)}>
                {CATEGORIAS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Concepto" className="sm:col-span-2">
              <Input value={form.concepto ?? ''} onChange={(e) => set('concepto', e.target.value)} />
            </Field>
          </div>

          <div className="rounded-xl border border-line p-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Base imponible">
                <NumInput className="text-right" value={form.base} onValue={(n) => set('base', n)} />
              </Field>
              <Field label={varios ? 'IVA (varios tipos)' : 'Tipo de IVA %'}>
                <NumInput
                  className="text-right"
                  value={form.iva_pct ?? 0}
                  disabled={varios}
                  onValue={(n) => setForm({ ...form, iva_pct: n, cuota_iva: round2((form.base * n) / 100) })}
                />
              </Field>
              <Field label="Cuota de IVA">
                <NumInput className="text-right" value={form.cuota_iva} onValue={(n) => set('cuota_iva', n)} />
              </Field>
              <Field label="Retención IRPF">
                <NumInput className="text-right" value={form.cuota_irpf} onValue={(n) => set('cuota_irpf', n)} />
              </Field>
              <Field label="Total factura" className="col-span-2">
                <NumInput className="text-right text-lg font-semibold" value={form.total} onValue={(n) => set('total', n)} />
              </Field>
            </div>
            {varios && ocr && (
              <div className="mt-3 space-y-0.5 text-xs text-muted">
                {ocr.desglose_iva.map((d, i) => (
                  <p key={i} className="num">
                    IVA {num(d.tipo)} %: base {eur(d.base)} · cuota {eur(d.cuota)}
                  </p>
                ))}
              </div>
            )}
            {descuadre && (
              <p className="mt-3 flex items-center gap-1.5 text-sm text-ambar">
                <AlertTriangle className="size-4" />
                Base + IVA − IRPF = {eur(calculado)}, no coincide con el total.
              </p>
            )}
          </div>

          {isAdvisor && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-ink"
                checked={form.contabilizado}
                onChange={(e) => set('contabilizado', e.target.checked)}
              />
              Contabilizado por el asesor
            </label>
          )}
        </div>
      </div>
    </Modal>
  )
}
