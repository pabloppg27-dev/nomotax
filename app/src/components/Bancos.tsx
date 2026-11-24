import { useMemo, useRef, useState } from 'react'
import { CheckCircle2, FileSpreadsheet, FileText, Landmark, Trash2, Upload, X } from 'lucide-react'
import { BUCKET, errorMessage, supabase } from '../lib/supabase'
import { nuevoId } from '../lib/id'
import { verDocumento } from '../lib/visor'
import { fecha, MESES_CORTOS } from '../lib/format'
import {
  ACCEPT_EXTRACTO,
  MESES,
  TIPOS_PERIODO,
  coberturaAnual,
  nombrePeriodo,
  rangoMeses,
  tipoExtracto,
  type ExtractoBancario,
  type FormatoExtracto,
  type TipoPeriodo,
} from '../lib/bancos'
import { Badge, Button, Card, Empty, Field, Input, Modal, Select, Textarea, confirmar, cx, notify } from './ui'

const BANCOS_HABITUALES = ['CaixaBank', 'BBVA', 'Banco Santander', 'Banco Sabadell', 'Bankinter', 'ING', 'Kutxabank', 'Unicaja', 'Abanca', 'Ibercaja', 'Cajamar', 'Banca March', 'Openbank', 'Revolut', 'Wise', 'Qonto', 'N26']

async function subirExtracto(ownerId: string, file: File): Promise<{ path: string; formato: FormatoExtracto }> {
  const t = tipoExtracto(file)
  const path = `${ownerId}/bancos/${nuevoId()}.${t.ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: t.mime, upsert: false })
  if (error) throw new Error(await errorMessage(error))
  return { path, formato: t.formato }
}

const FORMATO: Record<ExtractoBancario['formato'], string> = { pdf: 'PDF', csv: 'CSV', excel: 'Excel' }

/** Abre el PDF en otra pestaña; el CSV o Excel se descarga con su nombre original */
async function abrirExtracto(e: ExtractoBancario) {
  const w = e.formato === 'pdf' ? window.open('', '_blank') : null
  const { data } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(e.file_path, 300, e.formato === 'pdf' ? undefined : { download: e.nombre_archivo || true })
  if (!data?.signedUrl) {
    w?.close()
    return notify('No se ha podido abrir el extracto', 'error')
  }
  if (w) w.location.href = data.signedUrl
  else if (e.formato === 'pdf') verDocumento(data.signedUrl, e.nombre_archivo || 'Extracto', 'pdf')
  else window.location.href = data.signedUrl
}

/* ----------------------------------------------------------- Subir extracto */

function trimestreAnterior() {
  const d = new Date()
  const t = Math.floor(d.getMonth() / 3) // 0 = estamos en el 1T → el anterior es el 4T del año pasado
  return t === 0 ? { anio: d.getFullYear() - 1, t: 4 } : { anio: d.getFullYear(), t }
}

export function SubirExtracto({ ownerId, meId, bancosUsados, existentes, onClose, onSaved }: { ownerId: string; meId: string | null; bancosUsados: string[]; existentes: ExtractoBancario[]; onClose: () => void; onSaved: () => void }) {
  const inicial = trimestreAnterior()
  const actual = new Date().getFullYear()
  const anios = [actual, actual - 1, actual - 2, actual - 3, actual - 4]

  const [banco, setBanco] = useState(bancosUsados[0] ?? '')
  const [cuenta, setCuenta] = useState('')
  const [tipo, setTipo] = useState<TipoPeriodo>('trimestre')
  const [anio, setAnio] = useState(inicial.anio)
  const [mes, setMes] = useState(new Date().getMonth() === 0 ? 12 : new Date().getMonth()) // mes anterior (1-12)
  const [trim, setTrim] = useState(inicial.t)
  const [desdeP, setDesdeP] = useState('')
  const [hastaP, setHastaP] = useState('')
  const [archivos, setArchivos] = useState<File[]>([])
  const [notas, setNotas] = useState('')
  const [subiendo, setSubiendo] = useState(false)
  const [encima, setEncima] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const rango =
    tipo === 'mes'
      ? rangoMeses(anio, mes, mes)
      : tipo === 'trimestre'
        ? rangoMeses(anio, trim * 3 - 2, trim * 3)
        : tipo === 'anio'
          ? rangoMeses(anio, 1, 12)
          : { desde: desdeP, hasta: hastaP }
  const rangoOk = Boolean(rango.desde && rango.hasta && rango.hasta >= rango.desde)

  const solapa = useMemo(() => {
    if (!rangoOk || !banco.trim()) return []
    const b = banco.trim().toLowerCase()
    return existentes.filter((e) => e.banco.toLowerCase() === b && (e.cuenta ?? '') === cuenta.trim() && e.desde <= rango.hasta && e.hasta >= rango.desde)
  }, [existentes, banco, cuenta, rango.desde, rango.hasta, rangoOk])

  const anadir = (list: FileList | File[] | null) => {
    const nuevos: File[] = []
    for (const f of Array.from(list ?? [])) {
      try {
        tipoExtracto(f)
        nuevos.push(f)
      } catch (e) {
        notify((e as Error).message, 'error')
      }
    }
    setArchivos((a) => [...a, ...nuevos.filter((n) => !a.some((x) => x.name === n.name && x.size === n.size))])
  }

  const subir = async () => {
    if (!banco.trim()) return notify('Indica el banco', 'error')
    if (!rangoOk) return notify(tipo === 'personalizado' ? 'Elige las fechas: la de inicio no puede ser posterior a la de fin' : 'Elige el periodo', 'error')
    if (!archivos.length) return notify('Añade el extracto (PDF, CSV o Excel)', 'error')
    setSubiendo(true)
    let ok = 0
    for (const f of archivos) {
      try {
        const { path, formato } = await subirExtracto(ownerId, f)
        const { error } = await supabase.from('extractos_bancarios').insert({
          owner_id: ownerId,
          banco: banco.trim(),
          cuenta: cuenta.trim() || null,
          desde: rango.desde,
          hasta: rango.hasta,
          formato,
          nombre_archivo: f.name,
          file_path: path,
          notas: notas.trim() || null,
          subido_por: meId,
        })
        if (error) {
          await supabase.storage.from(BUCKET).remove([path])
          throw new Error(await errorMessage(error))
        }
        ok++
      } catch (e) {
        notify(`«${f.name}»: ${(e as Error).message}`, 'error')
      }
    }
    setSubiendo(false)
    if (ok) {
      notify(ok === 1 ? 'Extracto subido' : `${ok} extractos subidos`)
      onSaved()
      if (ok === archivos.length) onClose()
      else setArchivos(archivos.slice(ok))
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Subir extracto bancario"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={subir} loading={subiendo} icon={<Upload className="size-4" />}>
            Subir
          </Button>
        </>
      }
    >
      <p className="mb-4 text-sm text-muted">
        Descarga los movimientos desde la web o la app de tu banco y súbelos aquí. Nos sirven para cuadrar tu contabilidad con el banco (conciliación bancaria).
      </p>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-[1fr_150px]">
        <Field label="Banco">
          <Input list="bancos-extracto" value={banco} onChange={(e) => setBanco(e.target.value)} placeholder="Ej.: CaixaBank" />
          <datalist id="bancos-extracto">
            {[...new Set([...bancosUsados, ...BANCOS_HABITUALES])].map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
        </Field>
        <Field label="Cuenta (opcional)" hint="Últimos 4 dígitos del IBAN">
          <Input inputMode="numeric" maxLength={4} value={cuenta} onChange={(e) => setCuenta(e.target.value.replace(/\D/g, ''))} placeholder="1234" />
        </Field>
      </div>

      <div className="mt-5">
        <span className="mb-1 block text-[13px] font-medium text-ink/80">Periodo del extracto</span>
        <div className="grid grid-cols-2 gap-1 rounded-2xl bg-ink/5 p-1 sm:grid-cols-4">
          {TIPOS_PERIODO.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTipo(t.id)}
              className={cx('rounded-xl px-2 py-2 text-sm transition-colors', tipo === t.id ? 'bg-ink text-white' : 'text-ink/70 hover:text-ink')}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-end gap-3">
          {tipo !== 'personalizado' && (
            <Field label="Año">
              <Select className="w-28" value={anio} onChange={(e) => setAnio(Number(e.target.value))}>
                {anios.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {tipo === 'mes' && (
            <Field label="Mes">
              <Select className="w-40" value={mes} onChange={(e) => setMes(Number(e.target.value))}>
                {MESES.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {tipo === 'trimestre' && (
            <div className="flex rounded-full bg-ink/5 p-0.5">
              {[1, 2, 3, 4].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTrim(t)}
                  className={cx('rounded-full px-3.5 py-2 text-sm transition-colors', trim === t ? 'bg-ink text-white' : 'text-ink/70 hover:text-ink')}
                >
                  {t}T
                </button>
              ))}
            </div>
          )}
          {tipo === 'personalizado' && (
            <div className="grid w-full grid-cols-2 gap-3">
              <Field label="Desde">
                <Input type="date" value={desdeP} max={hastaP || undefined} onChange={(e) => setDesdeP(e.target.value)} />
              </Field>
              <Field label="Hasta">
                <Input type="date" value={hastaP} min={desdeP || undefined} onChange={(e) => setHastaP(e.target.value)} />
              </Field>
            </div>
          )}
        </div>
        {rangoOk && (
          <p className="mt-2 text-sm text-muted">
            Del {fecha(rango.desde)} al {fecha(rango.hasta)}
          </p>
        )}
        {solapa.length > 0 && (
          <p className="mt-2 rounded-xl bg-ambar/10 px-3 py-2 text-sm text-ambar">
            Ya hay {solapa.length === 1 ? 'un extracto' : `${solapa.length} extractos`} de {banco.trim()} en estas fechas ({solapa.map((s) => nombrePeriodo(s.desde, s.hasta)).join(', ')}). Puedes subirlo igualmente.
          </p>
        )}
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setEncima(true)
        }}
        onDragLeave={() => setEncima(false)}
        onDrop={(e) => {
          e.preventDefault()
          setEncima(false)
          anadir(e.dataTransfer.files)
        }}
        className={cx('mt-5 rounded-2xl border-2 border-dashed px-4 py-5 text-center transition-colors', encima ? 'border-ink bg-lima/30' : 'border-line')}
      >
        <p className="text-sm font-medium">Arrastra aquí el extracto o</p>
        <Button className="mt-2" size="sm" variant="secondary" icon={<Upload className="size-4" />} onClick={() => inputRef.current?.click()}>
          Elegir archivos
        </Button>
        <p className="mt-2 text-xs text-muted">PDF, CSV o Excel · hasta 15 MB · puedes subir varios a la vez</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT_EXTRACTO}
          className="hidden"
          onChange={(e) => {
            anadir(e.target.files)
            e.target.value = ''
          }}
        />
      </div>
      {archivos.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {archivos.map((f, i) => (
            <li key={`${f.name}-${f.size}`} className="flex items-center gap-2 rounded-xl bg-paper px-3 py-2 text-sm">
              {/\.pdf$/i.test(f.name) ? <FileText className="size-4 shrink-0 text-muted" /> : <FileSpreadsheet className="size-4 shrink-0 text-muted" />}
              <span className="min-w-0 flex-1 truncate">{f.name}</span>
              <button type="button" className="grid size-7 place-items-center rounded-full text-muted hover:bg-ink/10" onClick={() => setArchivos(archivos.filter((_, j) => j !== i))} aria-label="Quitar">
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Field label="Notas (opcional)" className="mt-5">
        <Textarea rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Ej.: cuenta de la tarjeta de empresa" />
      </Field>
    </Modal>
  )
}

/* ------------------------------------------------------- Lista de extractos */

export function ExtractosVista({
  lista,
  anio,
  desde,
  hasta,
  isAdvisor,
  meId,
  onSubir,
  onChanged,
}: {
  lista: ExtractoBancario[]
  anio: number
  desde: string
  hasta: string
  isAdvisor: boolean
  meId: string | null
  onSubir: () => void
  onChanged: () => void
}) {
  const delPeriodo = lista.filter((e) => e.desde <= hasta && e.hasta >= desde).sort((a, b) => b.desde.localeCompare(a.desde) || a.banco.localeCompare(b.banco))

  // Una fila por banco/cuenta con los 12 meses del año
  const cuentas = useMemo(() => {
    const m = new Map<string, ExtractoBancario[]>()
    for (const e of lista) {
      const k = `${e.banco}${e.cuenta ? ` ·${e.cuenta}` : ''}`
      m.set(k, [...(m.get(k) ?? []), e])
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([nombre, xs]) => ({ nombre, meses: coberturaAnual(xs, anio) }))
  }, [lista, anio])
  const conDatos = cuentas.filter((c) => c.meses.some(Boolean))

  if (!lista.length)
    return (
      <Card>
        <Empty
          icon={<Landmark className="size-5" />}
          title="Todavía no hay extractos bancarios"
          text="Sube los movimientos de tus cuentas (PDF, CSV o Excel, como te los dé el banco) por meses, trimestres o el año entero. Con ellos cuadramos tu contabilidad con el banco."
        />
        <div className="-mt-4 pb-6 text-center">
          <Button icon={<Upload className="size-4" />} onClick={onSubir}>
            Subir extracto bancario
          </Button>
        </div>
      </Card>
    )

  const conciliar = async (e: ExtractoBancario) => {
    const { error } = await supabase.from('extractos_bancarios').update({ conciliado: !e.conciliado }).eq('id', e.id)
    if (error) return notify(await errorMessage(error), 'error')
    onChanged()
  }
  const borrar = async (e: ExtractoBancario) => {
    if (!(await confirmar({ titulo: 'Eliminar extracto', texto: `¿Eliminar el extracto de ${e.banco} (${nombrePeriodo(e.desde, e.hasta)})?`, accion: 'Eliminar', peligro: true }))) return
    const { error } = await supabase.from('extractos_bancarios').delete().eq('id', e.id)
    if (error) return notify(await errorMessage(error), 'error')
    await supabase.storage.from(BUCKET).remove([e.file_path])
    onChanged()
  }

  return (
    <div className="space-y-5">
      <Card className="p-4">
        <p className="mb-3 text-sm font-medium">Meses entregados en {anio}</p>
        {conDatos.length ? (
          <div className="space-y-3">
            {conDatos.map((c) => (
              <div key={c.nombre}>
                <p className="mb-1 truncate text-sm text-muted">{c.nombre}</p>
                <div className="grid grid-cols-6 gap-1 sm:grid-cols-12">
                  {c.meses.map((m, i) => (
                    <span
                      key={i}
                      title={m === 'parcial' ? 'Faltan días de este mes' : m ? 'Mes completo' : 'Sin extracto'}
                      className={cx(
                        'rounded-lg py-1.5 text-center text-xs font-medium',
                        m === 'completo' ? 'bg-lima text-ink' : m === 'parcial' ? 'bg-ambar/15 text-ambar' : 'bg-ink/5 text-ink/40',
                      )}
                    >
                      {MESES_CORTOS[i]}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            <p className="text-xs text-muted">
              <span className="mr-1 inline-block size-2.5 rounded-sm bg-lima align-middle" /> completo
              <span className="ml-3 mr-1 inline-block size-2.5 rounded-sm bg-ambar/40 align-middle" /> faltan días
              <span className="ml-3 mr-1 inline-block size-2.5 rounded-sm bg-ink/10 align-middle" /> sin extracto
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted">No hay extractos de {anio}.</p>
        )}
      </Card>

      {!delPeriodo.length ? (
        <Card>
          <Empty title="No hay extractos en este periodo" text="Cambia el año o el trimestre arriba, o sube el extracto que falta." />
        </Card>
      ) : (
        <Card className="divide-y divide-line">
          {delPeriodo.map((e) => (
            <div key={e.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{nombrePeriodo(e.desde, e.hasta)}</span>
                  <span className="text-ink/80">
                    {e.banco}
                    {e.cuenta ? ` ·${e.cuenta}` : ''}
                  </span>
                  <Badge tono="gris">{FORMATO[e.formato]}</Badge>
                  {e.conciliado && <Badge tono="verde">Conciliado</Badge>}
                </span>
                <span className="block truncate text-sm text-muted">
                  {[e.nombre_archivo, `subido el ${fecha(e.created_at)}`, e.notas].filter(Boolean).join(' · ')}
                </span>
              </span>
              <span className="flex items-center gap-1">
                <Button size="sm" variant="secondary" icon={e.formato === 'pdf' ? <FileText className="size-4" /> : <FileSpreadsheet className="size-4" />} onClick={() => abrirExtracto(e)}>
                  {e.formato === 'pdf' ? 'Ver' : 'Descargar'}
                </Button>
                {isAdvisor && (
                  <button
                    className="grid size-8 place-items-center rounded-full text-muted hover:bg-ink/5"
                    onClick={() => conciliar(e)}
                    aria-label={e.conciliado ? 'Marcar pendiente' : 'Marcar conciliado'}
                    title={e.conciliado ? 'Marcar pendiente' : 'Marcar conciliado'}
                  >
                    <CheckCircle2 className={cx('size-4', e.conciliado && 'text-verde')} />
                  </button>
                )}
                {(isAdvisor || (e.subido_por === meId && !e.conciliado)) && (
                  <button className="grid size-8 place-items-center rounded-full text-muted hover:bg-rojo/10 hover:text-rojo" onClick={() => borrar(e)} aria-label="Eliminar">
                    <Trash2 className="size-4" />
                  </button>
                )}
              </span>
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}
