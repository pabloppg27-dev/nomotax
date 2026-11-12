import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, FileText, Loader2, Send, Sparkles, Trash2, Upload } from 'lucide-react'
import { useAuth } from '../../lib/auth'
import { BUCKET, abrirDocumento, errorMessage, invocar, supabase } from '../../lib/supabase'
import { eur, round2 } from '../../lib/format'
import { nuevoId } from '../../lib/id'
import { MESES, limpiarDni } from '../../lib/laboral'
import type { Nomina, NominaOcr, Trabajador } from '../../lib/types'
import NumInput from '../../components/NumInput'
import UploadZone from '../../components/UploadZone'
import { Badge, Button, Card, Empty, Field, Loading, Modal, Select, confirmar, notify } from '../../components/ui'
import LaboralTabs from './LaboralTabs'

async function leerNomina(path: string): Promise<NominaOcr> {
  const data = await invocar<{ datos?: NominaOcr }>('leer-nomina', { path })
  if (!data?.datos) throw new Error('No se han podido leer los datos')
  return data.datos
}

/** Pasa lo leído a los campos de la nómina */
function datosDeOcr(o: NominaOcr, trabajadores: Trabajador[]) {
  const bruto = Number(o.total_devengado ?? 0)
  const ssEmp = Number(o.ss_empresa ?? 0)
  return {
    trabajador_id: buscarTrabajador(o, trabajadores),
    nombre_leido: o.trabajador?.nombre ?? null,
    dni_leido: limpiarDni(o.trabajador?.dni) || null,
    tipo: o.tipo ?? 'mensual',
    bruto,
    neto: Number(o.liquido ?? 0),
    irpf: Number(o.irpf_importe ?? 0),
    irpf_pct: o.irpf_pct,
    ss_trabajador: Number(o.ss_trabajador ?? 0),
    ss_empresa: ssEmp,
    variables: Number(o.variables ?? 0),
    coste_total: round2(bruto + ssEmp),
    conceptos: o.conceptos_variables,
    ocr: o,
  }
}

function buscarTrabajador(ocr: NominaOcr, lista: Trabajador[]): string | null {
  const dni = limpiarDni(ocr.trabajador?.dni)
  if (dni) {
    const t = lista.find((w) => limpiarDni(w.dni) === dni)
    if (t) return t.id
  }
  const nombre = (ocr.trabajador?.nombre ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (nombre) {
    const palabras = nombre.split(/[\s,]+/).filter((p) => p.length > 2)
    const t = lista.find((w) => {
      const n = w.nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      return palabras.length > 1 && palabras.every((p) => n.includes(p))
    })
    if (t) return t.id
  }
  return null
}

export default function Nominas() {
  const { ownerId, isAdvisor } = useAuth()
  const [nominas, setNominas] = useState<Nomina[] | null>(null)
  const [trabajadores, setTrabajadores] = useState<Trabajador[]>([])
  const [anio, setAnio] = useState(new Date().getFullYear())
  const [subir, setSubir] = useState(false)

  const cargar = useCallback(async () => {
    if (!ownerId) return
    const [n, t] = await Promise.all([
      supabase.from('nominas').select('*').eq('owner_id', ownerId).order('anio', { ascending: false }).order('mes', { ascending: false }),
      supabase.from('trabajadores').select('*').eq('owner_id', ownerId).order('nombre'),
    ])
    const lista = (n.data as Nomina[]) ?? []
    setNominas(lista)
    setTrabajadores((t.data as Trabajador[]) ?? [])
    if (lista.length && !lista.some((x) => x.anio === anio)) setAnio(lista[0].anio)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerId])

  useEffect(() => {
    cargar()
  }, [cargar])

  const nombreDe = useMemo(() => Object.fromEntries(trabajadores.map((t) => [t.id, t.nombre])), [trabajadores])
  const anios = useMemo(() => {
    const s = new Set((nominas ?? []).map((n) => n.anio))
    s.add(new Date().getFullYear())
    return [...s].sort((a, b) => b - a)
  }, [nominas])

  const porMes = useMemo(() => {
    const grupos = new Map<number, Nomina[]>()
    for (const n of (nominas ?? []).filter((x) => x.anio === anio)) {
      grupos.set(n.mes, [...(grupos.get(n.mes) ?? []), n])
    }
    return [...grupos.entries()].sort((a, b) => b[0] - a[0])
  }, [nominas, anio])

  const borradores = (nominas ?? []).filter((n) => n.estado === 'borrador')

  const publicar = async (ids: string[]) => {
    const { error } = await supabase
      .from('nominas')
      .update({ estado: 'publicada', publicada_at: new Date().toISOString() })
      .in('id', ids)
    if (error) return notify(await errorMessage(error), 'error')
    notify(ids.length === 1 ? 'Nómina publicada' : `${ids.length} nóminas publicadas`)
    cargar()
  }

  const [releyendo, setReleyendo] = useState<string | null>(null)
  const releer = async (n: Nomina) => {
    setReleyendo(n.id)
    try {
      const o = await leerNomina(n.file_path)
      const { error } = await supabase.from('nominas').update(datosDeOcr(o, trabajadores)).eq('id', n.id)
      if (error) throw new Error(await errorMessage(error))
      notify('Nómina leída. Revisa los importes y publícala.')
      cargar()
    } catch (e) {
      notify((e as Error).message, 'error')
    }
    setReleyendo(null)
  }

  const borrar = async (n: Nomina) => {
    const ok = await confirmar({ titulo: 'Eliminar nómina', texto: 'Se borrará la nómina y su PDF.', accion: 'Eliminar', peligro: true })
    if (!ok) return
    await supabase.storage.from(BUCKET).remove([n.file_path])
    const { error } = await supabase.from('nominas').delete().eq('id', n.id)
    if (error) return notify(await errorMessage(error), 'error')
    cargar()
  }

  if (!ownerId) return <Loading />

  return (
    <>
      <LaboralTabs
        subtitle="Todas las nóminas, mes a mes."
        actions={
          isAdvisor ? (
            <Button icon={<Upload className="size-4" />} onClick={() => setSubir(true)}>
              Subir nóminas
            </Button>
          ) : undefined
        }
      />

      {isAdvisor && borradores.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-lima/35 px-4 py-3 text-sm">
          <span>
            Tienes <strong>{borradores.length}</strong> nómina{borradores.length === 1 ? '' : 's'} sin publicar: el cliente todavía no las ve.
          </span>
          <Button
            size="sm"
            icon={<Send className="size-4" />}
            disabled={borradores.some((b) => !b.trabajador_id)}
            onClick={() => publicar(borradores.map((b) => b.id))}
          >
            Publicar todas
          </Button>
        </div>
      )}

      <div className="mb-4 flex items-center gap-2">
        <Select className="!h-9 w-28 !text-sm" value={anio} onChange={(e) => setAnio(Number(e.target.value))} aria-label="Año">
          {anios.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </Select>
      </div>

      {nominas === null ? (
        <Loading />
      ) : porMes.length === 0 ? (
        <Card>
          <Empty
            icon={<FileText className="size-5" />}
            title={`No hay nóminas de ${anio}`}
            text={isAdvisor ? 'Sube las nóminas del mes y la IA las asignará a cada trabajador.' : 'Tu asesor las subirá aquí cada mes.'}
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {porMes.map(([mes, lista]) => {
            const tot = (k: keyof Nomina) => lista.reduce((s, x) => s + Number(x[k] ?? 0), 0)
            return (
              <Card key={mes} className="overflow-hidden">
                <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line bg-paper px-4 py-3">
                  <h2 className="font-semibold capitalize">
                    {MESES[mes - 1]} {anio}
                  </h2>
                  <p className="num text-sm text-muted">
                    Bruto {eur(tot('bruto'))} · SS empresa {eur(tot('ss_empresa'))} · <strong className="text-ink">Coste {eur(tot('coste_total'))}</strong>
                  </p>
                </div>
                <ul className="divide-y divide-line">
                  {lista.map((n) => (
                    <li key={n.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                      <button onClick={() => abrirDocumento(n.file_path)} className="flex min-w-0 flex-1 items-center gap-2 text-left hover:underline">
                        <FileText className="size-4 shrink-0 text-muted" />
                        <span className="truncate font-medium">{(n.trabajador_id && nombreDe[n.trabajador_id]) || n.nombre_leido || 'Sin asignar'}</span>
                        {n.tipo !== 'mensual' && <span className="text-sm text-muted">· {n.tipo}</span>}
                      </button>
                      {isAdvisor && n.estado === 'borrador' && <Badge tono="ambar">Sin publicar</Badge>}
                      <span className="num text-sm text-muted">neto {eur(n.neto)}</span>
                      <span className="num hidden text-sm text-muted sm:inline">SS empresa {eur(n.ss_empresa)}</span>
                      <span className="num w-24 text-right font-medium">{eur(n.coste_total)}</span>
                      {isAdvisor && (
                        <span className="flex gap-1">
                          {n.estado === 'borrador' && (
                            <button
                              className="rounded-full p-1.5 text-muted hover:bg-ink/5 hover:text-ink disabled:opacity-50"
                              onClick={() => releer(n)}
                              disabled={releyendo === n.id}
                              aria-label="Leer de nuevo"
                              title="Leer de nuevo"
                            >
                              {releyendo === n.id ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                            </button>
                          )}
                          {n.estado === 'borrador' && n.trabajador_id && (
                            <button className="rounded-full p-1.5 text-muted hover:bg-ink/5 hover:text-ink" onClick={() => publicar([n.id])} aria-label="Publicar">
                              <Send className="size-4" />
                            </button>
                          )}
                          <button className="rounded-full p-1.5 text-muted hover:bg-rojo/10 hover:text-rojo" onClick={() => borrar(n)} aria-label="Eliminar">
                            <Trash2 className="size-4" />
                          </button>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </Card>
            )
          })}
        </div>
      )}

      {isAdvisor && (
        <SubirNominas
          open={subir}
          onClose={() => {
            setSubir(false)
            cargar()
          }}
          ownerId={ownerId}
          trabajadores={trabajadores}
          onPublicar={publicar}
        />
      )}
    </>
  )
}

type Fila = {
  key: string
  archivo: string
  estado: 'subiendo' | 'leyendo' | 'listo' | 'error'
  error?: string
  nomina?: Nomina
}

function mesAnterior() {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - 1)
  return { anio: d.getFullYear(), mes: d.getMonth() + 1 }
}

function SubirNominas({
  open,
  onClose,
  ownerId,
  trabajadores,
  onPublicar,
}: {
  open: boolean
  onClose: () => void
  ownerId: string
  trabajadores: Trabajador[]
  onPublicar: (ids: string[]) => Promise<void>
}) {
  const inicial = mesAnterior()
  const [anio, setAnio] = useState(inicial.anio)
  const [mes, setMes] = useState(inicial.mes)
  const [filas, setFilas] = useState<Fila[]>([])

  useEffect(() => {
    if (!open) setFilas([])
  }, [open])

  const actualizar = (key: string, patch: Partial<Fila>) => setFilas((fs) => fs.map((f) => (f.key === key ? { ...f, ...patch } : f)))

  const guardarNomina = async (key: string, n: Nomina, patch: Partial<Nomina>) => {
    const nueva = { ...n, ...patch }
    nueva.coste_total = round2(Number(nueva.bruto) + Number(nueva.ss_empresa))
    actualizar(key, { nomina: nueva })
    const { error } = await supabase
      .from('nominas')
      .update({
        trabajador_id: nueva.trabajador_id,
        bruto: nueva.bruto,
        neto: nueva.neto,
        irpf: nueva.irpf,
        ss_trabajador: nueva.ss_trabajador,
        ss_empresa: nueva.ss_empresa,
        variables: nueva.variables,
        coste_total: nueva.coste_total,
        anio: nueva.anio,
        mes: nueva.mes,
      })
      .eq('id', n.id)
    if (error) notify(await errorMessage(error), 'error')
  }

  const procesar = async (files: File[]) => {
    const nuevas: Fila[] = files.map((f) => ({ key: nuevoId(), archivo: f.name, estado: 'subiendo' }))
    setFilas((fs) => [...fs, ...nuevas])
    for (let i = 0; i < files.length; i++) {
      const key = nuevas[i].key
      const f = files[i]
      try {
        if (f.type !== 'application/pdf' && !f.name.toLowerCase().endsWith('.pdf')) throw new Error('Tiene que ser un PDF')
        const path = `${ownerId}/laboral/nominas/${anio}-${String(mes).padStart(2, '0')}/${nuevoId()}.pdf`
        const up = await supabase.storage.from(BUCKET).upload(path, f, { contentType: 'application/pdf' })
        if (up.error) throw new Error(await errorMessage(up.error))
        const ins = await supabase.from('nominas').insert({ owner_id: ownerId, anio, mes, file_path: path }).select().single()
        if (ins.error) throw new Error(await errorMessage(ins.error))
        let n = ins.data as Nomina
        actualizar(key, { estado: 'leyendo', nomina: n })
        try {
          const o = await leerNomina(path)
          const upd = await supabase.from('nominas').update(datosDeOcr(o, trabajadores)).eq('id', n.id).select().single()
          if (upd.error) throw new Error(await errorMessage(upd.error))
          n = upd.data as Nomina
          actualizar(key, { estado: 'listo', nomina: n })
        } catch (e) {
          actualizar(key, { estado: 'error', error: `Subida, pero no se ha podido leer: ${(e as Error).message}`, nomina: n })
        }
      } catch (e) {
        actualizar(key, { estado: 'error', error: (e as Error).message })
      }
    }
  }

  const listas = filas.filter((f) => f.nomina && f.nomina.trabajador_id && f.estado !== 'subiendo' && f.estado !== 'leyendo')
  const ocupado = filas.some((f) => f.estado === 'subiendo' || f.estado === 'leyendo')
  const anioActual = new Date().getFullYear()

  return (
    <Modal
      open={open}
      onClose={() => !ocupado && onClose()}
      wide
      title="Subir nóminas"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={ocupado}>
            {filas.length ? 'Cerrar (quedan sin publicar)' : 'Cancelar'}
          </Button>
          <Button
            icon={<Send className="size-4" />}
            disabled={ocupado || !listas.length}
            onClick={async () => {
              await onPublicar(listas.map((f) => f.nomina!.id))
              onClose()
            }}
          >
            Publicar {listas.length || ''} nómina{listas.length === 1 ? '' : 's'}
          </Button>
        </>
      }
    >
      <div className="mb-4 grid max-w-sm grid-cols-2 gap-3">
        <Field label="Mes">
          <Select value={mes} onChange={(e) => setMes(Number(e.target.value))} disabled={filas.length > 0}>
            {MESES.map((m, i) => (
              <option key={m} value={i + 1} className="capitalize">
                {m}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Año">
          <Select value={anio} onChange={(e) => setAnio(Number(e.target.value))} disabled={filas.length > 0}>
            {[anioActual + 1, anioActual, anioActual - 1, anioActual - 2].map((a) => (
              <option key={a}>{a}</option>
            ))}
          </Select>
        </Field>
      </div>

      <UploadZone compacto onFiles={procesar} disabled={ocupado} titulo="Arrastra aquí los PDF de las nóminas" texto="Un PDF por nómina. Leemos los importes y la asignamos al trabajador por su DNI." />

      {filas.length > 0 && (
        <div className="mt-4 space-y-3">
          {filas.map((f) => {
            const n = f.nomina
            const periodoDistinto = n?.ocr?.periodo_mes && (n.ocr.periodo_mes !== n.mes || (n.ocr.periodo_anio && n.ocr.periodo_anio !== n.anio))
            return (
              <div key={f.key} className="rounded-xl border border-line p-4">
                <div className="mb-2 flex items-center gap-2 text-sm">
                  {f.estado === 'listo' ? (
                    <CheckCircle2 className="size-4 text-verde" />
                  ) : f.estado === 'error' ? (
                    <AlertTriangle className="size-4 text-rojo" />
                  ) : (
                    <Loader2 className="size-4 animate-spin text-muted" />
                  )}
                  <span className="min-w-0 flex-1 truncate font-medium">{f.archivo}</span>
                  <span className="text-muted">
                    {f.estado === 'subiendo' && 'Subiendo…'}
                    {f.estado === 'leyendo' && 'Leyendo la nómina…'}
                  </span>
                </div>
                {f.error && <p className="mb-2 text-sm text-rojo">{f.error}</p>}
                {n && f.estado !== 'subiendo' && f.estado !== 'leyendo' && (
                  <>
                    {(n.nombre_leido || n.dni_leido) && (
                      <p className="mb-2 text-sm text-muted">
                        Leído: {n.nombre_leido} {n.dni_leido && `· ${n.dni_leido}`}
                      </p>
                    )}
                    {periodoDistinto && (
                      <p className="mb-2 flex items-center gap-1.5 text-sm text-ambar">
                        <AlertTriangle className="size-4" /> La nómina es de {MESES[(n.ocr!.periodo_mes ?? 1) - 1]} {n.ocr!.periodo_anio}.
                        <button
                          className="underline"
                          onClick={() => guardarNomina(f.key, n, { mes: n.ocr!.periodo_mes!, anio: n.ocr!.periodo_anio ?? n.anio })}
                        >
                          Usar ese mes
                        </button>
                      </p>
                    )}
                    {n.ocr?.notas && <p className="mb-2 text-sm text-ink/70">{n.ocr.notas}</p>}
                    <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                      <Field label="Trabajador" className="sm:col-span-3 lg:col-span-2">
                        <Select
                          value={n.trabajador_id ?? ''}
                          className={!n.trabajador_id ? '!border-ambar' : ''}
                          onChange={(e) => guardarNomina(f.key, n, { trabajador_id: e.target.value || null })}
                        >
                          <option value="">Elige trabajador…</option>
                          {trabajadores.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.nombre}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Bruto">
                        <NumInput className="text-right" value={Number(n.bruto)} onValue={(v) => guardarNomina(f.key, n, { bruto: v })} />
                      </Field>
                      <Field label="Neto">
                        <NumInput className="text-right" value={Number(n.neto)} onValue={(v) => guardarNomina(f.key, n, { neto: v })} />
                      </Field>
                      <Field label="SS empresa">
                        <NumInput className="text-right" value={Number(n.ss_empresa)} onValue={(v) => guardarNomina(f.key, n, { ss_empresa: v })} />
                      </Field>
                      <Field label="Coste total">
                        <div className="num flex h-10 items-center justify-end rounded-lg bg-paper px-3 font-medium">{eur(n.coste_total)}</div>
                      </Field>
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}
    </Modal>
  )
}
