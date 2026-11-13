import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Archive, CheckCircle2, FileText, Landmark, Pencil, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { abrirDocumento, BUCKET, errorMessage, supabase } from '../lib/supabase'
import { eur, fecha, hoyISO } from '../lib/format'
import { prepararArchivo, subirDocumento } from '../lib/upload'
import {
  MODELOS,
  PERIODOS,
  RESULTADOS,
  TIPOS_ARCHIVO,
  conPlazo,
  diasHasta,
  nombreModelo,
  nombrePeriodo,
  ordenPeriodo,
  type DocArchivo,
  type Impuesto,
  type Resultado,
  type TipoArchivo,
} from '../lib/impuestos'
import NumInput from '../components/NumInput'
import { Badge, Button, Card, Empty, Field, Input, Loading, Modal, PageHeader, Select, Textarea, confirmar, cx, notify } from '../components/ui'

type Vista = 'impuestos' | 'archivo'

export default function Impuestos() {
  const { ownerId, isAdvisor } = useAuth()
  const [vista, setVista] = useState<Vista>('impuestos')
  const [impuestos, setImpuestos] = useState<Impuesto[] | null>(null)
  const [archivo, setArchivo] = useState<DocArchivo[] | null>(null)
  const [editImp, setEditImp] = useState<Partial<Impuesto> | null>(null)
  const [editDoc, setEditDoc] = useState<Partial<DocArchivo> | null>(null)

  const cargar = useCallback(async () => {
    if (!ownerId) return
    const [i, a] = await Promise.all([
      supabase.from('impuestos').select('*').eq('owner_id', ownerId),
      supabase.from('archivo').select('*').eq('owner_id', ownerId).order('fecha', { ascending: false }),
    ])
    setImpuestos((i.data as Impuesto[]) ?? [])
    setArchivo((a.data as DocArchivo[]) ?? [])
  }, [ownerId])

  useEffect(() => {
    cargar()
  }, [cargar])

  if (!ownerId) return <Loading />
  const pendientes = conPlazo(archivo ?? [])

  return (
    <>
      <PageHeader
        title="Impuestos"
        subtitle="Los impuestos presentados y tus documentos oficiales, siempre a mano."
        actions={
          vista === 'impuestos' ? (
            isAdvisor && (
              <Button icon={<Plus className="size-4" />} onClick={() => setEditImp({ anio: new Date().getFullYear(), periodo: trimestreAnterior(), resultado: 'ingresar', importe: 0, fecha_presentacion: hoyISO() })}>
                Subir impuesto
              </Button>
            )
          ) : (
            <Button icon={<Plus className="size-4" />} onClick={() => setEditDoc({ tipo: 'notificacion', fecha: hoyISO() })}>
              Subir documento
            </Button>
          )
        }
      />

      {pendientes.length > 0 && <AvisoPlazos lista={pendientes} onVer={() => setVista('archivo')} />}

      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-line">
        {(
          [
            ['impuestos', 'Presentados', Landmark],
            ['archivo', 'Archivo', Archive],
          ] as const
        ).map(([id, label, Icono]) => (
          <button
            key={id}
            onClick={() => setVista(id)}
            className={cx(
              '-mb-px inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2 text-[15px] transition-colors',
              vista === id ? 'border-ink font-medium text-ink' : 'border-transparent text-muted hover:text-ink',
            )}
          >
            <Icono className="size-4" />
            {label}
          </button>
        ))}
      </div>

      {vista === 'impuestos' ? (
        impuestos === null ? <Loading /> : <ListaImpuestos lista={impuestos} editable={isAdvisor} onEditar={setEditImp} />
      ) : archivo === null ? (
        <Loading />
      ) : (
        <ListaArchivo lista={archivo} isAdvisor={isAdvisor} onEditar={setEditDoc} onChanged={cargar} />
      )}

      {editImp && <EditorImpuesto inicial={editImp} ownerId={ownerId} onClose={() => setEditImp(null)} onSaved={cargar} />}
      {editDoc && <EditorDoc inicial={editDoc} ownerId={ownerId} isAdvisor={isAdvisor} onClose={() => setEditDoc(null)} onSaved={cargar} />}
    </>
  )
}

function trimestreAnterior() {
  const m = new Date().getMonth()
  return ['4T', '1T', '2T', '3T'][Math.floor(m / 3)]
}

export function AvisoPlazos({ lista, onVer }: { lista: DocArchivo[]; onVer: () => void }) {
  const d = lista[0]
  const dias = diasHasta(d.fecha_limite!)
  return (
    <button onClick={onVer} className="mb-5 flex w-full items-start gap-2 rounded-xl bg-rojo/10 px-4 py-3 text-left text-sm text-rojo">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <span>
        <strong>{d.titulo}</strong>: plazo {dias < 0 ? `vencido hace ${-dias} día${dias === -1 ? '' : 's'}` : dias === 0 ? 'hoy' : `en ${dias} día${dias === 1 ? '' : 's'}`} ({fecha(d.fecha_limite)})
        {lista.length > 1 && ` · y ${lista.length - 1} más`}
      </span>
    </button>
  )
}

function ListaImpuestos({ lista, editable, onEditar }: { lista: Impuesto[]; editable: boolean; onEditar: (i: Impuesto) => void }) {
  const anios = useMemo(() => [...new Set(lista.map((i) => i.anio))].sort((a, b) => b - a), [lista])
  if (!lista.length)
    return (
      <Card>
        <Empty icon={<Landmark className="size-5" />} title="Todavía no hay impuestos" text="Aquí aparecerán los modelos que presente tu asesor, con su justificante." />
      </Card>
    )
  return (
    <div className="space-y-8">
      {anios.map((anio) => {
        const delAnio = lista.filter((i) => i.anio === anio).sort((a, b) => ordenPeriodo(b.periodo) - ordenPeriodo(a.periodo) || a.modelo.localeCompare(b.modelo))
        const pagado = delAnio.filter((i) => i.resultado === 'ingresar').reduce((s, i) => s + Number(i.importe), 0)
        const devolver = delAnio.filter((i) => i.resultado === 'devolver').reduce((s, i) => s + Number(i.importe), 0)
        return (
          <section key={anio}>
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold">{anio}</h2>
              <p className="text-sm text-muted">
                Pagado <strong className="num text-ink">{eur(pagado)}</strong>
                {devolver > 0 && (
                  <>
                    {' '}· a devolver <strong className="num text-ink">{eur(devolver)}</strong>
                  </>
                )}
              </p>
            </div>
            <Card className="divide-y divide-line">
              {delAnio.map((i) => {
                const r = RESULTADOS[i.resultado]
                return (
                  <div key={i.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                    <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-paper text-sm font-semibold">{i.modelo}</span>
                    <span className="min-w-0 flex-1 basis-40">
                      <span className="block font-medium">
                        {nombreModelo(i.modelo)} · {nombrePeriodo(i.periodo)}
                      </span>
                      <span className="block text-sm text-muted">
                        {i.fecha_presentacion ? `Presentado el ${fecha(i.fecha_presentacion)}` : 'Pendiente de presentar'}
                        {i.notas ? ` · ${i.notas}` : ''}
                      </span>
                    </span>
                    <span className="ml-auto text-right">
                      <Badge tono={r.tono}>{r.label}</Badge>
                      {['ingresar', 'devolver', 'compensar'].includes(i.resultado) && <span className="num mt-0.5 block font-medium">{eur(i.importe)}</span>}
                    </span>
                    <span className="flex gap-1">
                      {i.file_path && (
                        <Button size="sm" variant="secondary" icon={<FileText className="size-4" />} onClick={() => abrirDocumento(i.file_path!)}>
                          Ver
                        </Button>
                      )}
                      {editable && (
                        <button className="grid size-8 place-items-center rounded-full text-muted hover:bg-ink/5" onClick={() => onEditar(i)} aria-label="Editar">
                          <Pencil className="size-4" />
                        </button>
                      )}
                    </span>
                  </div>
                )
              })}
            </Card>
          </section>
        )
      })}
    </div>
  )
}

function ListaArchivo({ lista, isAdvisor, onEditar, onChanged }: { lista: DocArchivo[]; isAdvisor: boolean; onEditar: (d: DocArchivo) => void; onChanged: () => void }) {
  const { me } = useAuth()
  if (!lista.length)
    return (
      <Card>
        <Empty
          icon={<Archive className="size-5" />}
          title="El archivo está vacío"
          text="Notificaciones de Hacienda o la Seguridad Social, requerimientos, certificados, escrituras… Si te llega una carta, súbela aquí y la vemos."
        />
      </Card>
    )

  const atendida = async (d: DocArchivo) => {
    const { error } = await supabase.from('archivo').update({ atendida: !d.atendida }).eq('id', d.id)
    if (error) return notify(await errorMessage(error), 'error')
    onChanged()
  }
  const borrar = async (d: DocArchivo) => {
    if (!(await confirmar({ titulo: 'Eliminar documento', texto: `¿Eliminar «${d.titulo}»?`, accion: 'Eliminar', peligro: true }))) return
    if (d.file_path) await supabase.storage.from(BUCKET).remove([d.file_path])
    const { error } = await supabase.from('archivo').delete().eq('id', d.id)
    if (error) return notify(await errorMessage(error), 'error')
    onChanged()
  }

  return (
    <Card className="divide-y divide-line">
      {lista.map((d) => {
        const dias = d.fecha_limite ? diasHasta(d.fecha_limite) : null
        const urgente = dias !== null && !d.atendida && dias <= 7
        return (
          <div key={d.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{d.titulo}</span>
                <Badge tono="gris">{TIPOS_ARCHIVO[d.tipo]}</Badge>
                {d.fecha_limite && d.atendida && <Badge tono="verde">Atendida</Badge>}
              </span>
              <span className="block text-sm text-muted">
                {[d.organismo, fecha(d.fecha)].filter(Boolean).join(' · ')}
                {d.notas ? ` · ${d.notas}` : ''}
              </span>
              {d.fecha_limite && !d.atendida && (
                <span className={cx('mt-0.5 block text-sm font-medium', urgente ? 'text-rojo' : 'text-ambar')}>
                  Plazo: {fecha(d.fecha_limite)}
                  {dias !== null && (dias < 0 ? ' · vencido' : dias === 0 ? ' · hoy' : ` · quedan ${dias} día${dias === 1 ? '' : 's'}`)}
                </span>
              )}
            </span>
            <span className="flex items-center gap-1">
              {d.file_path && (
                <Button size="sm" variant="secondary" icon={<FileText className="size-4" />} onClick={() => abrirDocumento(d.file_path!)}>
                  Ver
                </Button>
              )}
              {isAdvisor && d.fecha_limite && (
                <button className="grid size-8 place-items-center rounded-full text-muted hover:bg-ink/5" onClick={() => atendida(d)} aria-label="Marcar atendida" title={d.atendida ? 'Marcar pendiente' : 'Marcar atendida'}>
                  <CheckCircle2 className={cx('size-4', d.atendida && 'text-verde')} />
                </button>
              )}
              {isAdvisor && (
                <button className="grid size-8 place-items-center rounded-full text-muted hover:bg-ink/5" onClick={() => onEditar(d)} aria-label="Editar">
                  <Pencil className="size-4" />
                </button>
              )}
              {(isAdvisor || d.subido_por === me?.id) && (
                <button className="grid size-8 place-items-center rounded-full text-muted hover:bg-rojo/10 hover:text-rojo" onClick={() => borrar(d)} aria-label="Eliminar">
                  <Trash2 className="size-4" />
                </button>
              )}
            </span>
          </div>
        )
      })}
    </Card>
  )
}

/** Selector de archivo sencillo (PDF o foto) */
function ElegirArchivo({ archivo, actual, onArchivo }: { archivo: File | null; actual?: string | null; onArchivo: (f: File | null) => void }) {
  return (
    <Field label="Documento (PDF o foto)">
      <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-line px-4 py-3 text-sm hover:border-ink/40">
        <FileText className="size-5 shrink-0 text-muted" />
        <span className="min-w-0 flex-1 truncate">{archivo ? archivo.name : actual ? 'Ya hay un documento. Pulsa para cambiarlo.' : 'Pulsa para elegir el archivo'}</span>
        <input type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => onArchivo(e.target.files?.[0] ?? null)} />
      </label>
    </Field>
  )
}

function EditorImpuesto({ inicial, ownerId, onClose, onSaved }: { inicial: Partial<Impuesto>; ownerId: string; onClose: () => void; onSaved: () => void }) {
  const [i, setI] = useState(inicial)
  const [archivo, setArchivoSel] = useState<File | null>(null)
  const [guardando, setGuardando] = useState(false)
  const set = <K extends keyof Impuesto>(k: K, v: Impuesto[K]) => setI({ ...i, [k]: v })

  const guardar = async () => {
    if (!i.modelo || !i.anio || !i.periodo) return notify('Falta el modelo, el año o el periodo', 'error')
    setGuardando(true)
    try {
      let file_path = i.file_path ?? null
      if (archivo) file_path = await subirDocumento(ownerId, 'impuestos', await prepararArchivo(archivo))
      const fila = {
        owner_id: ownerId,
        modelo: i.modelo,
        anio: i.anio,
        periodo: i.periodo,
        resultado: i.resultado ?? 'ingresar',
        importe: Number(i.importe) || 0,
        fecha_presentacion: i.fecha_presentacion || null,
        notas: i.notas?.trim() || null,
        file_path,
      }
      const r = i.id ? await supabase.from('impuestos').update(fila).eq('id', i.id) : await supabase.from('impuestos').insert(fila)
      if (r.error) throw new Error(await errorMessage(r.error))
      if (archivo && i.id && inicial.file_path) await supabase.storage.from(BUCKET).remove([inicial.file_path])
      notify('Impuesto guardado')
      onSaved()
      onClose()
    } catch (e) {
      notify((e as Error).message, 'error')
    }
    setGuardando(false)
  }

  const borrar = async () => {
    if (!i.id || !(await confirmar({ titulo: 'Eliminar impuesto', texto: 'Se borrará el registro y su justificante.', accion: 'Eliminar', peligro: true }))) return
    if (i.file_path) await supabase.storage.from(BUCKET).remove([i.file_path])
    await supabase.from('impuestos').delete().eq('id', i.id)
    onSaved()
    onClose()
  }

  const conImporte = ['ingresar', 'devolver', 'compensar'].includes(i.resultado ?? '')
  return (
    <Modal
      open
      onClose={onClose}
      title={i.id ? 'Editar impuesto' : 'Subir impuesto presentado'}
      footer={
        <>
          {i.id && (
            <Button variant="ghost" className="mr-auto text-rojo" icon={<Trash2 className="size-4" />} onClick={borrar}>
              Eliminar
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={guardar} loading={guardando}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2">
        <Field label="Modelo" className="sm:col-span-2">
          <Select value={i.modelo ?? ''} onChange={(e) => set('modelo', e.target.value)}>
            <option value="">Elige el modelo</option>
            {MODELOS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id === 'otro' || m.id === 'CCAA' ? m.nombre : `${m.id} · ${m.nombre}`}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Año">
          <NumInput value={i.anio ?? new Date().getFullYear()} onValue={(n) => set('anio', Math.round(n))} />
        </Field>
        <Field label="Periodo">
          <Select value={i.periodo ?? '1T'} onChange={(e) => set('periodo', e.target.value)}>
            {PERIODOS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Resultado">
          <Select value={i.resultado ?? 'ingresar'} onChange={(e) => set('resultado', e.target.value as Resultado)}>
            {Object.entries(RESULTADOS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </Select>
        </Field>
        {conImporte && (
          <Field label="Importe">
            <NumInput className="text-right" value={Number(i.importe) || 0} onValue={(n) => set('importe', n)} />
          </Field>
        )}
        <Field label="Fecha de presentación">
          <Input type="date" value={i.fecha_presentacion ?? ''} onChange={(e) => set('fecha_presentacion', e.target.value || null)} />
        </Field>
        <div className="sm:col-span-2">
          <ElegirArchivo archivo={archivo} actual={i.file_path} onArchivo={setArchivoSel} />
        </div>
        <Field label="Nota para el cliente (opcional)" className="sm:col-span-2">
          <Input value={i.notas ?? ''} onChange={(e) => set('notas', e.target.value)} placeholder="Ej.: domiciliado el 20/10" />
        </Field>
      </div>
    </Modal>
  )
}

function EditorDoc({ inicial, ownerId, isAdvisor, onClose, onSaved }: { inicial: Partial<DocArchivo>; ownerId: string; isAdvisor: boolean; onClose: () => void; onSaved: () => void }) {
  const { me } = useAuth()
  const [d, setD] = useState(inicial)
  const [archivo, setArchivoSel] = useState<File | null>(null)
  const [guardando, setGuardando] = useState(false)
  const set = <K extends keyof DocArchivo>(k: K, v: DocArchivo[K]) => setD({ ...d, [k]: v })

  const guardar = async () => {
    if (!d.titulo?.trim()) return notify('Ponle un título', 'error')
    if (!d.id && !archivo) return notify('Elige el documento', 'error')
    setGuardando(true)
    try {
      let file_path = d.file_path ?? null
      if (archivo) file_path = await subirDocumento(ownerId, 'archivo', await prepararArchivo(archivo))
      const fila = {
        owner_id: ownerId,
        titulo: d.titulo.trim(),
        tipo: d.tipo ?? 'notificacion',
        organismo: d.organismo?.trim() || null,
        fecha: d.fecha || hoyISO(),
        fecha_limite: d.fecha_limite || null,
        notas: d.notas?.trim() || null,
        file_path,
      }
      const r = d.id ? await supabase.from('archivo').update(fila).eq('id', d.id) : await supabase.from('archivo').insert({ ...fila, subido_por: me?.id })
      if (r.error) throw new Error(await errorMessage(r.error))
      if (archivo && d.id && inicial.file_path) await supabase.storage.from(BUCKET).remove([inicial.file_path])
      notify(isAdvisor ? 'Documento guardado' : 'Documento subido. Tu asesor lo revisará.')
      onSaved()
      onClose()
    } catch (e) {
      notify((e as Error).message, 'error')
    }
    setGuardando(false)
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={d.id ? 'Editar documento' : 'Subir documento'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={guardar} loading={guardando}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2">
        <Field label="Título" className="sm:col-span-2">
          <Input value={d.titulo ?? ''} onChange={(e) => set('titulo', e.target.value)} placeholder="Ej.: Requerimiento IVA 2T 2026" autoFocus />
        </Field>
        <Field label="Tipo">
          <Select value={d.tipo ?? 'notificacion'} onChange={(e) => set('tipo', e.target.value as TipoArchivo)}>
            {Object.entries(TIPOS_ARCHIVO).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Organismo (opcional)">
          <Input value={d.organismo ?? ''} onChange={(e) => set('organismo', e.target.value)} placeholder="AEAT, Seguridad Social…" />
        </Field>
        <Field label="Fecha del documento">
          <Input type="date" value={d.fecha ?? ''} onChange={(e) => set('fecha', e.target.value)} />
        </Field>
        <Field label="Plazo para contestar (opcional)">
          <Input type="date" value={d.fecha_limite ?? ''} onChange={(e) => set('fecha_limite', e.target.value || null)} />
        </Field>
        <div className="sm:col-span-2">
          <ElegirArchivo archivo={archivo} actual={d.file_path} onArchivo={setArchivoSel} />
        </div>
        <Field label="Nota (opcional)" className="sm:col-span-2">
          <Textarea value={d.notas ?? ''} onChange={(e) => set('notas', e.target.value)} rows={2} />
        </Field>
      </div>
    </Modal>
  )
}
