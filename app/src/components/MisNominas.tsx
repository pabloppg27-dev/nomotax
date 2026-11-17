import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Download, FileText } from 'lucide-react'
import { abrirDocumento } from '../lib/supabase'
import { eur, num } from '../lib/format'
import { MESES } from '../lib/laboral'
import type { Nomina } from '../lib/types'
import { Card, cx, notify } from './ui'

const MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const suma = (xs: Nomina[], k: 'bruto' | 'neto' | 'irpf' | 'ss_trabajador' | 'ss_empresa' | 'coste_total') =>
  xs.reduce((a, n) => a + Number(n[k] ?? 0), 0)

function Fila({ k, v, fuerte, resta, nota }: { k: string; v: number; fuerte?: boolean; resta?: boolean; nota?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <dt className={fuerte ? 'font-semibold' : 'text-muted'}>
        {k}
        {nota && <span className="ml-1.5 text-xs text-muted">{nota}</span>}
      </dt>
      <dd className={cx('num text-right', fuerte && 'font-semibold')}>
        {resta ? '−' : ''}
        {eur(v)}
      </dd>
    </div>
  )
}

/** Las nóminas del empleado por año y mes, con el desglose (bruto, Seguridad Social, IRPF, líquido y coste) */
export default function MisNominas({ nominas, ejemplo }: { nominas: Nomina[]; ejemplo?: boolean }) {
  const anios = useMemo(() => [...new Set(nominas.map((n) => n.anio))].sort((a, b) => b - a), [nominas])
  const [anio, setAnio] = useState<number | null>(null)
  const [mes, setMes] = useState<number | null>(null)

  const anioSel = anio ?? anios[0]
  const delAnio = nominas.filter((n) => n.anio === anioSel)
  const mesesConNomina = new Set(delAnio.map((n) => n.mes))
  const mesSel = mes && mesesConNomina.has(mes) ? mes : Math.max(0, ...mesesConNomina)
  const delMes = delAnio.filter((n) => n.mes === mesSel)

  const bruto = suma(delAnio, 'bruto')
  const irpf = suma(delAnio, 'irpf')
  const maxBruto = Math.max(1, ...Array.from({ length: 12 }, (_, i) => suma(delAnio.filter((n) => n.mes === i + 1), 'bruto')))

  const abrir = (n: Nomina) => (n.file_path ? abrirDocumento(n.file_path) : notify('Es una nómina de ejemplo: no tiene PDF.'))

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-semibold">
          <FileText className="size-4" /> Mis nóminas
        </h2>
        <div className="flex items-center gap-1">
          <button
            className="rounded-full p-1.5 text-muted hover:bg-ink/5 disabled:opacity-30"
            disabled={anios.indexOf(anioSel) >= anios.length - 1}
            onClick={() => setAnio(anios[anios.indexOf(anioSel) + 1])}
            aria-label="Año anterior"
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="num min-w-10 text-center text-sm font-medium">{anioSel}</span>
          <button
            className="rounded-full p-1.5 text-muted hover:bg-ink/5 disabled:opacity-30"
            disabled={anios.indexOf(anioSel) <= 0}
            onClick={() => setAnio(anios[anios.indexOf(anioSel) - 1])}
            aria-label="Año siguiente"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>
      {ejemplo && <p className="mt-1 text-xs text-ambar">Datos de ejemplo (solo en local): una nómina española típica.</p>}

      <div className="lg:mt-5 lg:grid lg:grid-cols-[1.1fr_1fr] lg:gap-10">
      <div>
      {/* Meses del año */}
      <div className="mt-4 grid grid-cols-6 gap-1.5 lg:mt-0">
        {MES_CORTO.map((m, i) => {
          const hay = mesesConNomina.has(i + 1)
          const activo = hay && mesSel === i + 1
          return (
            <button
              key={m}
              disabled={!hay}
              onClick={() => setMes(i + 1)}
              className={cx(
                'rounded-xl border px-1 py-2 text-sm capitalize transition-colors',
                activo ? 'border-ink bg-ink text-lima' : hay ? 'border-line bg-white hover:border-ink' : 'border-transparent bg-paper text-muted/50',
              )}
            >
              {m}
            </button>
          )
        })}
      </div>

      {/* Detalle del mes elegido */}
      {delMes.map((n) => (
        <div key={n.id} className="mt-5">
          <div className="rounded-2xl bg-ink p-4 text-white">
            <p className="text-sm capitalize text-white/60">
              {MESES[n.mes - 1]} {n.anio}
              {n.tipo !== 'mensual' && ` · ${n.tipo === 'extra' ? 'paga extra' : n.tipo}`}
            </p>
            <p className="num mt-1 text-3xl font-semibold text-lima">{eur(Number(n.neto))}</p>
            <p className="text-sm text-white/60">Líquido a cobrar</p>
          </div>

          <dl className="mt-3 divide-y divide-line text-[15px]">
            <Fila k="Salario bruto" v={Number(n.bruto)} fuerte />
            {n.conceptos?.map((c) => (
              <Fila key={c.concepto} k={`· ${c.concepto}`} v={Number(c.importe)} />
            ))}
            <Fila k="Seguridad Social" v={Number(n.ss_trabajador)} resta nota={Number(n.bruto) ? `${num((Number(n.ss_trabajador) / Number(n.bruto)) * 100)}%` : undefined} />
            <Fila k="Retención de IRPF" v={Number(n.irpf)} resta nota={n.irpf_pct ? `${num(Number(n.irpf_pct))}%` : undefined} />
            <Fila k="Líquido" v={Number(n.neto)} fuerte />
          </dl>

          <div className="mt-3 rounded-xl bg-paper px-3.5 py-2.5 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-muted">Coste total para la empresa</span>
              <span className="num font-medium">{eur(Number(n.coste_total))}</span>
            </div>
            <p className="mt-0.5 text-xs text-muted">Tu bruto más la Seguridad Social que paga la empresa por ti ({eur(Number(n.ss_empresa))}).</p>
          </div>

          <button
            onClick={() => abrir(n)}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-full border border-line py-2.5 text-sm font-medium hover:border-ink"
          >
            <Download className="size-4" /> Ver la nómina en PDF
          </button>
        </div>
      ))}

      </div>

      {/* Resumen del año */}
      <div className="mt-6 border-t border-line pt-5 lg:mt-0 lg:border-l lg:border-t-0 lg:pl-10 lg:pt-0">
        <h3 className="text-sm font-semibold">Resumen de {anioSel}</h3>
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          {[
            ['Bruto', eur(bruto)],
            ['IRPF retenido', eur(irpf)],
            ['Seguridad Social', eur(suma(delAnio, 'ss_trabajador'))],
            ['Líquido cobrado', eur(suma(delAnio, 'neto'))],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl bg-paper px-3.5 py-2.5">
              <p className="text-xs text-muted">{k}</p>
              <p className="num font-semibold">{v}</p>
            </div>
          ))}
        </div>
        {bruto > 0 && <p className="mt-2 text-xs text-muted">IRPF medio retenido este año: {num((irpf / bruto) * 100)}%.</p>}
        <p className="mt-1 text-xs text-muted">Orientativo. Para la renta usa el certificado de retenciones de «Mis documentos», que sube la empresa cada año.</p>

        <div className="mt-4 flex h-20 items-end gap-1.5" aria-hidden>
          {MES_CORTO.map((m, i) => {
            const b = suma(delAnio.filter((n) => n.mes === i + 1), 'bruto')
            return (
              <div key={m} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                <div className={cx('w-full rounded-t', b ? (mesSel === i + 1 ? 'bg-ink' : 'bg-lima') : 'bg-line')} style={{ height: `${Math.max(4, (b / maxBruto) * 100)}%` }} />
              </div>
            )
          })}
        </div>
        <div className="mt-1 flex gap-1.5 text-center text-[10px] capitalize text-muted">
          {MES_CORTO.map((m) => (
            <span key={m} className="flex-1">
              {m}
            </span>
          ))}
        </div>
      </div>
      </div>
    </Card>
  )
}
