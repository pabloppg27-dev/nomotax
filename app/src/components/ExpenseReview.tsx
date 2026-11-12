import { useEffect, useState } from 'react'
import { AlertTriangle, Check, Landmark, Sparkles, Trash2 } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { BUCKET, errorMessage, supabase } from '../lib/supabase'
import { eur, fecha as fmtFecha, limpiarNif, num, round2 } from '../lib/format'
import { CATEGORIAS } from '../lib/categorias'
import { importesDe, leerFactura } from '../lib/upload'
import type { Expense, OcrResult } from '../lib/types'
import { aEuros, columnasDivisa, importeMoneda } from '../lib/divisas'
import { CUENTA_CATEGORIA, TIPOS_INMOVILIZADO, necesitaRevision, type Inmovilizado } from '../lib/contabilidad.ts'
import DocPreview from './DocPreview'
import NumInput from './NumInput'
import { Button, Field, Input, Modal, Select, confirmar, notify } from './ui'

type Form = Pick<
  Expense,
    | 'fecha'
  | 'proveedor'
  | 'proveedor_nif'
  | 'numero'
  | 'concepto'
  | 'categoria'
  | 'base'
  | 'iva_pct'
  | 'cuota_iva'
  | 'irpf_pct'
  | 'cuota_irpf'
  | 'total'
  | 'contabilizado'
  | 'naturaleza'
  | 'pagado'
  | 'fecha_pago'
>

/** Lo que decide el asesor: gasto del año o inmovilizado que se amortiza */
type Decision = { tipo: 'gasto' | 'inmovilizado' | null; cuenta: string; inmoId?: string; clase: string; coeficiente: number; fecha_inicio: string; nombre: string }

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
  const [dec, setDec] = useState<Decision | null>(null)

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
      naturaleza: gasto.naturaleza ?? 'gasto',
      pagado: gasto.pagado ?? true,
      fecha_pago: gasto.fecha_pago ?? null,
    })
    const tipoOcr = gasto.ocr?.tipo_inmovilizado
    const clase = TIPOS_INMOVILIZADO.find((t) => t.id === tipoOcr) ?? TIPOS_INMOVILIZADO[0]
    const base: Decision = {
      tipo: gasto.revision === 'gasto' || gasto.revision === 'inmovilizado' ? gasto.revision : null,
      cuenta: gasto.cuenta ?? '',
      clase: clase.id,
      coeficiente: clase.coeficiente,
      fecha_inicio: gasto.fecha ?? '',
      nombre: gasto.concepto ?? '',
    }
    setDec(base)
    if (isAdvisor)
      supabase
        .from('inmovilizados')
        .select('*')
        .eq('expense_id', gasto.id)
        .maybeSingle()
        .then(({ data }) => {
          const i = data as Inmovilizado | null
          if (i) setDec({ ...base, inmoId: i.id, clase: i.tipo, coeficiente: Number(i.coeficiente), fecha_inicio: i.fecha_inicio, nombre: i.nombre })
        })
  }, [gasto, isAdvisor])

  if (!gasto || !form) return null

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm({ ...form, [k]: v })
  const calculado = round2(form.base + form.cuota_iva - form.cuota_irpf)
  const descuadre = Math.abs(calculado - form.total) > 0.02
  const varios = (ocr?.desglose_iva?.length ?? 0) > 1

  /** Factura en otra moneda: al cambiar la fecha se aplica el cambio del BCE de ese día */
  const cambiarFecha = async (f: string | null) => {
    setForm({ ...form, fecha: f })
    if (!ocr?.divisa || !f) return
    try {
      const o = await aEuros(ocr, f)
      const imp = importesDe(o)
      setOcr(o)
      setForm((x) => x && { ...x, fecha: f, base: imp.base, cuota_iva: imp.cuota_iva, cuota_irpf: imp.cuota_irpf, total: imp.total })
    } catch (e) {
      notify((e as Error).message, 'error')
    }
  }

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
        naturaleza: o.naturaleza === 'inversion' ? 'inversion' : 'gasto',
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
    const d = dec as Decision
    const decidido = isAdvisor && dec ? dec.tipo : null
    if (decidido === 'inmovilizado' && (!d.fecha_inicio || !d.coeficiente)) return notify('Falta la fecha de alta o el coeficiente del inmovilizado', 'error')
    setGuardando(true)
    const cambios: Record<string, unknown> = {
      ...form,
      fecha_pago: form.pagado ? form.fecha_pago : null,
      proveedor_nif: limpiarNif(form.proveedor_nif),
      estado: 'revisado',
      ...(ocr?.divisa ? columnasDivisa(ocr) : {}),
      ocr,
    }
    if (decidido) {
      cambios.revision = d.tipo
      cambios.cuenta = d.tipo === 'gasto' && d.cuenta.trim() ? d.cuenta.trim() : null
    } else if (gasto.revision !== 'gasto' && gasto.revision !== 'inmovilizado') {
      cambios.revision = necesitaRevision(form.naturaleza, form.base) ? 'pendiente' : null
    }
    const { error } = await supabase.from('expenses').update(cambios).eq('id', gasto.id)
    if (error) {
      setGuardando(false)
      return notify(await errorMessage(error), 'error')
    }
    // Ficha de inmovilizado (con su amortización) o se quita si al final es gasto
    if (decidido === 'inmovilizado') {
      const clase = TIPOS_INMOVILIZADO.find((t) => t.id === d.clase) ?? TIPOS_INMOVILIZADO[0]
      const fila = {
        owner_id: gasto.owner_id,
        expense_id: gasto.id,
        nombre: d.nombre.trim() || form.concepto || form.proveedor || 'Inmovilizado',
        tipo: clase.id,
        cuenta: clase.cuenta,
        cuenta_amortizacion: clase.amortizacion,
        valor: form.base,
        fecha_inicio: d.fecha_inicio,
        coeficiente: d.coeficiente,
      }
      const r = d.inmoId ? await supabase.from('inmovilizados').update(fila).eq('id', d.inmoId) : await supabase.from('inmovilizados').insert(fila)
      if (r.error) {
        setGuardando(false)
        return notify(await errorMessage(r.error), 'error')
      }
    } else if (decidido === 'gasto' && d.inmoId) {
      await supabase.from('inmovilizados').delete().eq('id', d.inmoId)
    }
    setGuardando(false)
    notify(decidido === 'inmovilizado' ? 'Guardado como inmovilizado: se amortizará cada mes' : 'Gasto guardado')
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
        <div className="min-w-0 md:sticky md:top-0 md:self-start">
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

        <div className="min-w-0 space-y-4">
          {ocr && (
            <div className="flex gap-2 rounded-xl bg-lima/35 px-3 py-2.5 text-sm">
              <Sparkles className="mt-0.5 size-4 shrink-0" />
              <span className="min-w-0">
                Leído automáticamente. Revísalo y confirma.
                {ocr.notas && <NotaIA texto={ocr.notas} />}
              </span>
            </div>
          )}
          {ocr?.divisa && (
            <div className="rounded-xl bg-paper px-3 py-2.5 text-sm">
              <p className="font-medium">
                Factura en {ocr.divisa.moneda}: {importeMoneda(ocr.divisa.originales.total, ocr.divisa.moneda)} = {eur(form.total)}
              </p>
              <p className="text-muted">
                Cambio oficial del BCE del {fmtFecha(ocr.divisa.fecha_cambio)}: 1€ = {num(ocr.divisa.tasa, 4)} {ocr.divisa.moneda}. Los importes de abajo ya están en euros.
              </p>
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
              <Input type="date" value={form.fecha ?? ''} onChange={(e) => cambiarFecha(e.target.value || null)} />
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

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" className="size-4 accent-ink" checked={form.pagado} onChange={(e) => set('pagado', e.target.checked)} />
              Ya está pagada
            </label>
            {form.pagado && (
              <label className="flex items-center gap-2 text-muted">
                el día
                <Input
                  type="date"
                  className="!h-9 w-40 !text-sm"
                  value={form.fecha_pago ?? form.fecha ?? ''}
                  onChange={(e) => set('fecha_pago', e.target.value || null)}
                />
              </label>
            )}
          </div>

          {!isAdvisor && gasto.revision === 'pendiente' && (
            <div className="flex gap-2 rounded-xl bg-ambar/10 px-3 py-2.5 text-sm text-ambar">
              <Landmark className="mt-0.5 size-4 shrink-0" />
              Parece una compra duradera (más de 300 €). Tu asesor revisará si se amortiza en varios años.
            </div>
          )}

          {isAdvisor && dec && (
            <div className="rounded-xl border border-line p-4">
              <p className="mb-1 flex items-center gap-2 font-medium">
                <Landmark className="size-4" /> Contabilidad (solo asesor)
              </p>
              <p className="mb-3 text-sm text-muted">
                {gasto.revision === 'pendiente'
                  ? 'La IA cree que es una inversión. ¿Es gasto del año o inmovilizado que se amortiza?'
                  : form.naturaleza === 'inversion'
                    ? 'La IA lo marcó como inversión.'
                    : '¿Cómo se contabiliza?'}
              </p>
              <div className="mb-3 inline-flex rounded-full bg-paper p-1 text-sm">
                {(['gasto', 'inmovilizado'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setDec({ ...dec, tipo: t })}
                    className={`rounded-full px-4 py-1.5 ${dec.tipo === t ? 'bg-ink text-white' : 'text-muted hover:text-ink'}`}
                  >
                    {t === 'gasto' ? 'Es gasto' : 'Es inmovilizado'}
                  </button>
                ))}
              </div>
              {dec.tipo === 'gasto' && (
                <Field label="Cuenta de gasto (opcional)">
                  <Input
                    value={dec.cuenta}
                    onChange={(e) => setDec({ ...dec, cuenta: e.target.value.replace(/\D/g, '') })}
                    placeholder={`Por la categoría: ${CUENTA_CATEGORIA[form.categoria] ?? '629'}`}
                  />
                </Field>
              )}
              {dec.tipo === 'inmovilizado' && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Nombre del bien" className="sm:col-span-2">
                    <Input value={dec.nombre} onChange={(e) => setDec({ ...dec, nombre: e.target.value })} placeholder="Ej.: MacBook Pro 14" />
                  </Field>
                  <Field label="Tipo de bien" className="sm:col-span-2">
                    <Select
                      value={dec.clase}
                      onChange={(e) => {
                        const c = TIPOS_INMOVILIZADO.find((t) => t.id === e.target.value)!
                        setDec({ ...dec, clase: c.id, coeficiente: c.coeficiente })
                      }}
                    >
                      {TIPOS_INMOVILIZADO.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.nombre} · {t.cuenta}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Coeficiente anual %">
                    <NumInput className="text-right" value={dec.coeficiente} onValue={(n) => setDec({ ...dec, coeficiente: n })} />
                  </Field>
                  <Field label="Puesta en funcionamiento">
                    <Input type="date" value={dec.fecha_inicio} onChange={(e) => setDec({ ...dec, fecha_inicio: e.target.value })} />
                  </Field>
                  <p className="text-sm text-muted sm:col-span-2">
                    Valor {eur(form.base)} · cuota anual {eur(round2((form.base * dec.coeficiente) / 100))} · se amortiza en unos{' '}
                    {dec.coeficiente ? Math.ceil(100 / dec.coeficiente) : '–'} años
                  </p>
                </div>
              )}
            </div>
          )}

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

/** La nota de la IA, en corto: dos líneas y «Ver más» si hace falta */
function NotaIA({ texto }: { texto: string }) {
  const [abierta, setAbierta] = useState(false)
  const larga = texto.length > 110
  return (
    <span className="mt-1 block text-ink/75">
      <span className={larga && !abierta ? 'line-clamp-2' : undefined}>{texto}</span>
      {larga && (
        <button type="button" className="mt-0.5 font-medium text-ink underline underline-offset-2" onClick={() => setAbierta(!abierta)}>
          {abierta ? 'Ver menos' : 'Ver más'}
        </button>
      )}
    </span>
  )
}
