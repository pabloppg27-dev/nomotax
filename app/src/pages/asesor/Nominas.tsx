import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PDFDocument } from 'pdf-lib'
import { AlertTriangle, ArrowRight, CheckCircle2, FileText, Loader2, Send, Trash2 } from 'lucide-react'
import { useAuth } from '../../lib/auth'
import { BUCKET, abrirDocumento, errorMessage, supabase } from '../../lib/supabase'
import { eur, round2 } from '../../lib/format'
import { nuevoId } from '../../lib/id'
import { MESES } from '../../lib/laboral'
import { buscarTrabajador, datosDeOcr, leerNomina, mapaNominas } from '../../lib/lecturaNominas'
import type { Nomina, Profile, Trabajador } from '../../lib/types'
import NumInput from '../../components/NumInput'
import SelectBuscable from '../../components/SelectBuscable'
import UploadZone from '../../components/UploadZone'
import { Badge, Button, Card, Field, PageHeader, Select, confirmar, cx, notify } from '../../components/ui'

type Empresa = Pick<Profile, 'id' | 'nombre' | 'nombre_comercial' | 'email' | 'nif'>
type Fila = { key: string; estado: 'leyendo' | 'listo' | 'error'; error?: string; nomina: Nomina; paginas: number[] }
type Lote = { archivo: string; estado: 'subiendo' | 'mapa' | 'partiendo' | 'hecho' | 'error'; error?: string; aviso?: string }
type Pendiente = { owner_id: string; anio: number; mes: number; cuantas: number }

const nombreEmpresa = (e: Pick<Empresa, 'nombre' | 'nombre_comercial' | 'email'>) => e.nombre_comercial || e.nombre || e.email || 'Empresa'

function mesAnterior() {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - 1)
  return { anio: d.getFullYear(), mes: d.getMonth() + 1 }
}

/** «1, 2, 3, 5» → «1-3, 5» */
function rangos(ps: number[]): string {
  const s = [...new Set(ps)].sort((a, b) => a - b)
  const out: string[] = []
  for (let i = 0; i < s.length; i++) {
    let j = i
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++
    out.push(j > i ? `${s[i]}-${s[j]}` : String(s[i]))
    i = j
  }
  return out.join(', ')
}

/** Lanza las tareas de n en n */
async function deANn<T>(tareas: (() => Promise<T>)[], n: number) {
  let i = 0
  await Promise.all(
    Array.from({ length: Math.min(n, tareas.length) }, async () => {
      while (i < tareas.length) await tareas[i++]()
    }),
  )
}

export default function NominasAsesor() {
  const { setOwner } = useAuth()
  const navigate = useNavigate()
  const inicial = mesAnterior()
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [conTrabajadores, setConTrabajadores] = useState<Set<string>>(new Set())
  const [pendientes, setPendientes] = useState<Pendiente[]>([])
  const [ownerId, setOwnerId] = useState('')
  const [anio, setAnio] = useState(inicial.anio)
  const [mes, setMes] = useState(inicial.mes)
  const [trabajadores, setTrabajadores] = useState<Trabajador[]>([])
  const [lotes, setLotes] = useState<Lote[]>([])
  const [filas, setFilas] = useState<Fila[]>([])
  const [publicando, setPublicando] = useState(false)

  const cargarPendientes = useCallback(async () => {
    const { data } = await supabase.from('nominas').select('owner_id, anio, mes').eq('estado', 'borrador')
    const m = new Map<string, Pendiente>()
    for (const n of (data as { owner_id: string; anio: number; mes: number }[]) ?? []) {
      const k = `${n.owner_id}-${n.anio}-${n.mes}`
      const p = m.get(k)
      if (p) p.cuantas++
      else m.set(k, { ...n, cuantas: 1 })
    }
    setPendientes([...m.values()].sort((a, b) => b.anio - a.anio || b.mes - a.mes))
  }, [])

  useEffect(() => {
    Promise.all([
      supabase.from('profiles').select('id, nombre, nombre_comercial, email, nif').eq('role', 'client').order('nombre'),
      supabase.from('trabajadores').select('owner_id'),
    ]).then(([p, t]) => {
      setEmpresas((p.data as Empresa[]) ?? [])
      setConTrabajadores(new Set(((t.data as { owner_id: string }[]) ?? []).map((x) => x.owner_id)))
    })
    cargarPendientes()
  }, [cargarPendientes])

  useEffect(() => {
    setTrabajadores([])
    setFilas([])
    setLotes([])
    if (!ownerId) return
    supabase
      .from('trabajadores')
      .select('*')
      .eq('owner_id', ownerId)
      .order('nombre')
      .then(({ data }) => setTrabajadores((data as Trabajador[]) ?? []))
  }, [ownerId])

  // Primero las empresas con trabajadores
  const opciones = useMemo(
    () =>
      [...empresas]
        .sort((a, b) => Number(conTrabajadores.has(b.id)) - Number(conTrabajadores.has(a.id)))
        .map((e) => ({ value: e.id, label: nombreEmpresa(e), detalle: [e.nif, conTrabajadores.has(e.id) ? null : 'sin trabajadores'].filter(Boolean).join(' · ') || undefined })),
    [empresas, conTrabajadores],
  )
  const nombreDe = (id: string) => {
    const e = empresas.find((x) => x.id === id)
    return e ? nombreEmpresa(e) : 'Empresa'
  }

  const cambiarLote = (i: number, patch: Partial<Lote>) => setLotes((ls) => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)))
  const cambiarFila = (key: string, patch: Partial<Fila>) => setFilas((fs) => fs.map((f) => (f.key === key ? { ...f, ...patch } : f)))

  const procesar = async (files: File[]) => {
    if (!ownerId) return notify('Elige primero la empresa', 'error')
    const periodo = `${anio}-${String(mes).padStart(2, '0')}`
    const base = lotes.length
    setLotes((ls) => [...ls, ...files.map((f): Lote => ({ archivo: f.name, estado: 'subiendo' }))])
    const lecturas: (() => Promise<void>)[] = []

    for (let i = 0; i < files.length; i++) {
      const f = files[i]
      const idx = base + i
      const lotePath = `${ownerId}/laboral/nominas/${periodo}/lote-${nuevoId()}.pdf`
      try {
        if (f.type !== 'application/pdf' && !f.name.toLowerCase().endsWith('.pdf')) throw new Error('Tiene que ser un PDF')
        const bytes = new Uint8Array(await f.arrayBuffer())
        const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true })
        const total = pdf.getPageCount()

        // 1) Subir el PDF entero un momento para que la IA diga qué páginas son de quién
        const up = await supabase.storage.from(BUCKET).upload(lotePath, f, { contentType: 'application/pdf' })
        if (up.error) throw new Error(await errorMessage(up.error))
        cambiarLote(idx, { estado: 'mapa' })
        const mapa = await mapaNominas(lotePath)

        // 2) Partirlo: un PDF por nómina, con solo sus páginas
        cambiarLote(idx, { estado: 'partiendo' })
        const usadas = new Set<number>()
        for (const t of mapa.nominas) {
          const paginas = [...new Set(t.paginas)].filter((p) => p >= 1 && p <= total && !usadas.has(p)).sort((a, b) => a - b)
          if (!paginas.length) continue
          paginas.forEach((p) => usadas.add(p))
          const doc = await PDFDocument.create()
          const copias = await doc.copyPages(pdf, paginas.map((p) => p - 1))
          copias.forEach((p) => doc.addPage(p))
          const parte = await doc.save()
          const path = `${ownerId}/laboral/nominas/${periodo}/${nuevoId()}.pdf`
          const subida = await supabase.storage.from(BUCKET).upload(path, new Blob([parte as BlobPart], { type: 'application/pdf' }), { contentType: 'application/pdf' })
          if (subida.error) throw new Error(await errorMessage(subida.error))
          const ins = await supabase
            .from('nominas')
            .insert({
              owner_id: ownerId,
              anio: t.periodo_anio ?? anio,
              mes: t.periodo_mes ?? mes,
              tipo: t.tipo ?? 'mensual',
              file_path: path,
              nombre_leido: t.nombre,
              dni_leido: t.dni,
              trabajador_id: buscarTrabajador({ trabajador: { nombre: t.nombre, dni: t.dni, nss: null } } as Parameters<typeof buscarTrabajador>[0], trabajadores),
            })
            .select()
            .single()
          if (ins.error) throw new Error(await errorMessage(ins.error))
          const key = nuevoId()
          const nomina = ins.data as Nomina
          setFilas((fs) => [...fs, { key, estado: 'leyendo', nomina, paginas }])
          // 3) Leer los importes de cada nómina (después, de tres en tres)
          lecturas.push(async () => {
            try {
              const o = await leerNomina(path)
              const datos = datosDeOcr(o, trabajadores)
              // Si la IA no casa al trabajador con el recibo suelto, se queda el del mapa
              const upd = await supabase
                .from('nominas')
                .update({ ...datos, trabajador_id: datos.trabajador_id ?? nomina.trabajador_id })
                .eq('id', nomina.id)
                .select()
                .single()
              if (upd.error) throw new Error(await errorMessage(upd.error))
              cambiarFila(key, { estado: 'listo', nomina: upd.data as Nomina })
            } catch (e) {
              cambiarFila(key, { estado: 'error', error: `No se han podido leer los importes: ${(e as Error).message}` })
            }
          })
        }
        const sobran = Array.from({ length: total }, (_, k) => k + 1).filter((p) => !usadas.has(p))
        const avisos = [
          sobran.length ? `Página${sobran.length === 1 ? '' : 's'} ${rangos(sobran)} sin repartir (resúmenes u hojas que no son de un trabajador).` : '',
          mapa.notas ?? '',
        ].filter(Boolean)
        cambiarLote(idx, { estado: 'hecho', aviso: avisos.join(' ') || undefined })
      } catch (e) {
        cambiarLote(idx, { estado: 'error', error: (e as Error).message })
      }
      // El PDF con todas no se guarda: cada trabajador solo debe poder ver lo suyo
      await supabase.storage.from(BUCKET).remove([lotePath])
    }
    await deANn(lecturas, 3)
    cargarPendientes()
  }

  const guardar = async (f: Fila, patch: Partial<Nomina>) => {
    const n = { ...f.nomina, ...patch }
    n.coste_total = round2(Number(n.bruto) + Number(n.ss_empresa))
    cambiarFila(f.key, { nomina: n })
    const { error } = await supabase
      .from('nominas')
      .update({ trabajador_id: n.trabajador_id, bruto: n.bruto, neto: n.neto, ss_empresa: n.ss_empresa, coste_total: n.coste_total })
      .eq('id', n.id)
    if (error) notify(await errorMessage(error), 'error')
  }

  const descartar = async (f: Fila) => {
    const ok = await confirmar({ titulo: 'Quitar esta nómina', texto: 'Se borra la nómina y su PDF. El trabajador no la verá.', accion: 'Quitar', peligro: true })
    if (!ok) return
    await supabase.storage.from(BUCKET).remove([f.nomina.file_path])
    const { error } = await supabase.from('nominas').delete().eq('id', f.nomina.id)
    if (error) return notify(await errorMessage(error), 'error')
    setFilas((fs) => fs.filter((x) => x.key !== f.key))
    cargarPendientes()
  }

  const ocupado = lotes.some((l) => ['subiendo', 'mapa', 'partiendo'].includes(l.estado)) || filas.some((f) => f.estado === 'leyendo')
  const listas = filas.filter((f) => f.estado !== 'leyendo' && f.nomina.trabajador_id && f.nomina.estado === 'borrador')
  const sinAsignar = filas.filter((f) => f.estado !== 'leyendo' && !f.nomina.trabajador_id).length

  const publicar = async () => {
    setPublicando(true)
    const ids = listas.map((f) => f.nomina.id)
    const { error } = await supabase.from('nominas').update({ estado: 'publicada', publicada_at: new Date().toISOString() }).in('id', ids)
    setPublicando(false)
    if (error) return notify(await errorMessage(error), 'error')
    setFilas((fs) => fs.map((f) => (ids.includes(f.nomina.id) ? { ...f, nomina: { ...f.nomina, estado: 'publicada' } } : f)))
    notify(`${ids.length} nómina${ids.length === 1 ? '' : 's'} publicada${ids.length === 1 ? '' : 's'}: cada trabajador ya la ve en «Mis nóminas»`)
    cargarPendientes()
  }

  const nombreTrab = (id: string | null) => trabajadores.find((t) => t.id === id)?.nombre
  const anioActual = new Date().getFullYear()

  return (
    <>
      <PageHeader title="Nóminas" subtitle="Sube el PDF con las nóminas del mes de una empresa: se parte por trabajador, se leen los importes y cada uno ve la suya." />

      {pendientes.length > 0 && (
        <Card className="mb-6 overflow-hidden">
          <div className="border-b border-line bg-ambar/10 px-4 py-3">
            <h2 className="font-semibold">Sin publicar</h2>
            <p className="text-sm text-muted">Subidas pero los trabajadores aún no las ven.</p>
          </div>
          <ul className="divide-y divide-line">
            {pendientes.map((p) => (
              <li key={`${p.owner_id}-${p.anio}-${p.mes}`}>
                <button
                  onClick={async () => {
                    await setOwner(p.owner_id)
                    navigate('/laboral/nominas')
                  }}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-paper"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{nombreDe(p.owner_id)}</span>
                    <span className="block text-sm capitalize text-muted">
                      {MESES[p.mes - 1]} {p.anio}
                    </span>
                  </span>
                  <Badge tono="ambar">
                    {p.cuantas} nómina{p.cuantas === 1 ? '' : 's'}
                  </Badge>
                  <ArrowRight className="size-4 text-muted" />
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="mb-6 p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <Field label="Empresa">
            <SelectBuscable value={ownerId} onChange={(v) => setOwnerId(v)} opciones={opciones} placeholder="Elige la empresa…" buscarPlaceholder="Buscar por nombre o NIF…" disabled={ocupado} />
          </Field>
          <Field label="Mes">
            <Select value={mes} onChange={(e) => setMes(Number(e.target.value))} disabled={ocupado}>
              {MESES.map((m, i) => (
                <option key={m} value={i + 1} className="capitalize">
                  {m}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Año">
            <Select value={anio} onChange={(e) => setAnio(Number(e.target.value))} disabled={ocupado}>
              {[anioActual + 1, anioActual, anioActual - 1].map((a) => (
                <option key={a}>{a}</option>
              ))}
            </Select>
          </Field>
        </div>
        {ownerId && trabajadores.length === 0 && (
          <p className="mt-3 flex items-center gap-1.5 text-sm text-ambar">
            <AlertTriangle className="size-4" /> Esta empresa no tiene trabajadores dados de alta: las nóminas se podrán subir, pero no asignar.
          </p>
        )}
        <div className="mt-4">
          <UploadZone
            compacto
            onFiles={procesar}
            disabled={!ownerId || ocupado}
            titulo={ownerId ? 'Arrastra aquí el PDF con las nóminas' : 'Elige primero la empresa'}
            texto="Un PDF con todas (o uno por nómina). Si el PDF dice otro mes, se usa el suyo."
          />
        </div>
        {lotes.length > 0 && (
          <ul className="mt-3 space-y-1.5 text-sm">
            {lotes.map((l, i) => (
              <li key={i} className="flex items-start gap-2">
                {l.estado === 'hecho' ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-verde" />
                ) : l.estado === 'error' ? (
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-rojo" />
                ) : (
                  <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-muted" />
                )}
                <span className="min-w-0">
                  <span className="font-medium">{l.archivo}</span>
                  <span className="text-muted">
                    {l.estado === 'subiendo' && ' · subiendo…'}
                    {l.estado === 'mapa' && ' · viendo qué páginas son de cada trabajador…'}
                    {l.estado === 'partiendo' && ' · separando las nóminas…'}
                  </span>
                  {l.error && <span className="block text-rojo">{l.error}</span>}
                  {l.aviso && <span className="block text-ambar">{l.aviso}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {filas.length > 0 && (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-paper px-4 py-3">
            <div>
              <h2 className="font-semibold">
                {filas.length} nómina{filas.length === 1 ? '' : 's'} de {nombreDe(ownerId)}
              </h2>
              <p className="text-sm text-muted">
                {sinAsignar ? `${sinAsignar} sin trabajador: elígelo para poder publicarla.` : 'Revisa los importes y publica.'}
              </p>
            </div>
            <Button icon={<Send className="size-4" />} disabled={ocupado || !listas.length} loading={publicando} onClick={publicar}>
              Publicar {listas.length || ''}
            </Button>
          </div>
          <ul className="divide-y divide-line">
            {filas.map((f) => {
              const n = f.nomina
              const publicada = n.estado === 'publicada'
              return (
                <li key={f.key} className={cx('px-4 py-4', publicada && 'bg-verde/5')}>
                  <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    {f.estado === 'leyendo' ? (
                      <Loader2 className="size-4 animate-spin text-muted" />
                    ) : f.estado === 'error' ? (
                      <AlertTriangle className="size-4 text-rojo" />
                    ) : (
                      <CheckCircle2 className="size-4 text-verde" />
                    )}
                    <span className="font-medium">{nombreTrab(n.trabajador_id) ?? n.nombre_leido ?? 'Sin identificar'}</span>
                    <span className="text-muted">
                      {[n.dni_leido, `pág. ${rangos(f.paginas)}`, n.tipo !== 'mensual' ? n.tipo : null, `${MESES[n.mes - 1]} ${n.anio}`].filter(Boolean).join(' · ')}
                    </span>
                    {f.estado === 'leyendo' && <span className="text-muted">Leyendo importes…</span>}
                    {publicada && <Badge tono="verde">Publicada</Badge>}
                    <span className="ml-auto flex gap-1">
                      <button className="rounded-full p-1.5 text-muted hover:bg-ink/5 hover:text-ink" onClick={() => abrirDocumento(n.file_path)} aria-label="Ver PDF" title="Ver PDF">
                        <FileText className="size-4" />
                      </button>
                      {!publicada && (
                        <button className="rounded-full p-1.5 text-muted hover:bg-rojo/10 hover:text-rojo" onClick={() => descartar(f)} aria-label="Quitar" title="Quitar">
                          <Trash2 className="size-4" />
                        </button>
                      )}
                    </span>
                  </div>
                  {f.error && <p className="mb-2 text-sm text-rojo">{f.error}</p>}
                  {n.ocr?.notas && <p className="mb-2 text-sm text-ink/70">{n.ocr.notas}</p>}
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))]">
                    <Field label="Trabajador" className="col-span-2 lg:col-span-1">
                      <SelectBuscable
                        value={n.trabajador_id ?? ''}
                        className={!n.trabajador_id ? '!border-ambar' : ''}
                        onChange={(v) => guardar(f, { trabajador_id: v || null })}
                        opciones={trabajadores.map((t) => ({ value: t.id, label: t.nombre, detalle: t.dni ?? undefined }))}
                        placeholder="Elige trabajador…"
                        buscarPlaceholder="Buscar por nombre o DNI…"
                        disabled={publicada}
                      />
                    </Field>
                    <Field label="Bruto">
                      <NumInput className="text-right" value={Number(n.bruto)} onValue={(v) => guardar(f, { bruto: v })} disabled={publicada || f.estado === 'leyendo'} />
                    </Field>
                    <Field label="Neto">
                      <NumInput className="text-right" value={Number(n.neto)} onValue={(v) => guardar(f, { neto: v })} disabled={publicada || f.estado === 'leyendo'} />
                    </Field>
                    <Field label="SS empresa">
                      <NumInput className="text-right" value={Number(n.ss_empresa)} onValue={(v) => guardar(f, { ss_empresa: v })} disabled={publicada || f.estado === 'leyendo'} />
                    </Field>
                    <Field label="Coste total">
                      <div className="num flex h-10 items-center justify-end rounded-lg bg-paper px-3 font-medium">{eur(n.coste_total)}</div>
                    </Field>
                  </div>
                </li>
              )
            })}
          </ul>
        </Card>
      )}
    </>
  )
}
