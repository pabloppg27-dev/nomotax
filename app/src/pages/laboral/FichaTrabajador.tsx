import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, FileText, Paperclip, Pencil, Trash2, Upload } from 'lucide-react'
import { useAuth } from '../../lib/auth'
import { BUCKET, abrirDocumento, errorMessage, supabase } from '../../lib/supabase'
import { eur, fecha, hoyISO, sumarDias } from '../../lib/format'
import { nuevoId } from '../../lib/id'
import { prepararArchivo } from '../../lib/upload'
import { ESTADOS_TRABAJADOR, MESES, TIPOS_DOC, comprobarSalario, nombreContrato, nombreDoc } from '../../lib/laboral'
import type {
  CategoriaConvenio,
  CentroTrabajo,
  DocTrabajador,
  EstadoTrabajador,
  Nomina,
  PerfilLaboral,
  TipoDocTrabajador,
  Trabajador,
} from '../../lib/types'
import MonthlyChart from '../../components/MonthlyChart'
import { Badge, Button, Card, Field, Input, Loading, Select, Textarea, confirmar, notify } from '../../components/ui'

export default function FichaTrabajador() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { ownerId, isAdvisor, me } = useAuth()
  const [t, setT] = useState<Trabajador | null>(null)
  const [docs, setDocs] = useState<DocTrabajador[]>([])
  const [nominas, setNominas] = useState<Nomina[]>([])
  const [centro, setCentro] = useState<CentroTrabajo | null>(null)
  const [categorias, setCategorias] = useState<CategoriaConvenio[]>([])
  const [perfil, setPerfil] = useState<PerfilLaboral | null>(null)
  const [anio, setAnio] = useState(new Date().getFullYear())

  const cargar = useCallback(async () => {
    if (!id || !ownerId) return
    const { data, error } = await supabase.from('trabajadores').select('*').eq('id', id).single()
    if (error || !data) {
      notify('No se ha encontrado el trabajador', 'error')
      navigate('/laboral')
      return
    }
    const tr = data as Trabajador
    const [d, n, c, k, p] = await Promise.all([
      supabase.from('trabajador_documentos').select('*').eq('trabajador_id', id).order('created_at', { ascending: false }),
      supabase.from('nominas').select('*').eq('trabajador_id', id).order('anio', { ascending: false }).order('mes', { ascending: false }),
      tr.centro_id ? supabase.from('centros_trabajo').select('*').eq('id', tr.centro_id).maybeSingle() : Promise.resolve({ data: null }),
      supabase.from('categorias_convenio').select('*').eq('owner_id', tr.owner_id).order('orden').order('nombre'),
      supabase.from('perfil_laboral').select('*').eq('owner_id', tr.owner_id).maybeSingle(),
    ])
    setT(tr)
    setDocs((d.data as DocTrabajador[]) ?? [])
    const ns = (n.data as Nomina[]) ?? []
    setNominas(ns)
    if (ns.length) setAnio(ns[0].anio)
    setCentro((c.data as CentroTrabajo) ?? null)
    setCategorias((k.data as CategoriaConvenio[]) ?? [])
    setPerfil((p.data as PerfilLaboral) ?? null)
  }, [id, ownerId, navigate])

  useEffect(() => {
    cargar()
  }, [cargar])

  const cifras = useMemo(() => {
    const publicadas = nominas.filter((x) => x.estado === 'publicada' || isAdvisor)
    if (!publicadas.length) return null
    const ultimoK = publicadas[0].anio * 100 + publicadas[0].mes
    const delMes = publicadas.filter((x) => x.anio * 100 + x.mes === ultimoK)
    const suma = (arr: Nomina[], k: keyof Nomina) => arr.reduce((s, x) => s + Number(x[k] ?? 0), 0)
    const delAnio = publicadas.filter((x) => x.anio === anio)
    const meses = Array.from({ length: 12 }, () => ({ bruto: 0, ss_empresa: 0 }))
    for (const x of delAnio) {
      meses[x.mes - 1].bruto += Number(x.bruto)
      meses[x.mes - 1].ss_empresa += Number(x.ss_empresa)
    }
    return {
      etiqueta: `${MESES[publicadas[0].mes - 1]} ${publicadas[0].anio}`,
      mes: {
        neto: suma(delMes, 'neto'),
        bruto: suma(delMes, 'bruto'),
        variables: suma(delMes, 'variables'),
        irpf: suma(delMes, 'irpf'),
        ss_trabajador: suma(delMes, 'ss_trabajador'),
        ss_empresa: suma(delMes, 'ss_empresa'),
        coste: suma(delMes, 'coste_total'),
      },
      anio: {
        bruto: suma(delAnio, 'bruto'),
        neto: suma(delAnio, 'neto'),
        ss_empresa: suma(delAnio, 'ss_empresa'),
        coste: suma(delAnio, 'coste_total'),
        variables: suma(delAnio, 'variables'),
      },
      meses,
      anios: [...new Set(publicadas.map((x) => x.anio))],
    }
  }, [nominas, anio, isAdvisor])

  if (!t || !ownerId) return <Loading />

  const est = ESTADOS_TRABAJADOR[t.estado]
  const editableCliente = !isAdvisor && t.estado === 'solicitada'
  const caducaPronto = t.dni_caducidad && t.dni_caducidad <= sumarDias(hoyISO(), 60)
  const categoria = categorias.find((c) => c.id === t.categoria_id) ?? null

  const cancelar = async () => {
    const ok = await confirmar({
      titulo: 'Cancelar solicitud',
      texto: `¿Cancelar la solicitud de alta de ${t.nombre}? Se borrarán sus datos y documentos.`,
      accion: 'Cancelar solicitud',
      peligro: true,
    })
    if (!ok) return
    if (docs.length) await supabase.storage.from(BUCKET).remove(docs.map((d) => d.path))
    const { error } = await supabase.from('trabajadores').delete().eq('id', t.id)
    if (error) return notify(await errorMessage(error), 'error')
    notify('Solicitud cancelada')
    navigate('/laboral')
  }

  return (
    <>
      <Link to="/laboral" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Trabajadores
      </Link>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">{t.nombre}</h1>
            <Badge tono={est.tono}>{est.label}</Badge>
          </div>
          <p className="mt-1 text-[15px] text-muted">
            {t.puesto ? t.puesto.split('.')[0] : 'Sin puesto'} · {nombreContrato(t.tipo_contrato)} · desde {fecha(t.fecha_inicio)}
          </p>
        </div>
        {editableCliente && (
          <div className="flex gap-2">
            <Button variant="secondary" icon={<Pencil className="size-4" />} onClick={() => navigate(`/laboral/alta/${t.id}`)}>
              Editar solicitud
            </Button>
            <Button variant="ghost" className="text-rojo" icon={<Trash2 className="size-4" />} onClick={cancelar}>
              Cancelar
            </Button>
          </div>
        )}
      </div>

      {t.estado === 'solicitada' && !isAdvisor && (
        <div className="mb-6 rounded-xl bg-lima/35 px-4 py-3 text-sm">
          Hemos recibido la solicitud. Tu asesor la revisará y te avisará cuando el alta esté tramitada. Hasta entonces puedes corregir los datos.
        </div>
      )}

      {isAdvisor && (
        <PanelAsesor trabajador={t} categorias={categorias} perfil={perfil} onSaved={cargar} />
      )}

      {cifras && (
        <div className="mb-6 space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Cifra label={`Coste total · ${cifras.etiqueta}`} valor={eur(cifras.mes.coste)} destacada />
            <Cifra label="Seguridad Social a cargo de la empresa" valor={eur(cifras.mes.ss_empresa)} />
            <Cifra label="Salario bruto" valor={eur(cifras.mes.bruto)} nota={cifras.mes.variables ? `incluye ${eur(cifras.mes.variables)} de variables` : 'sin variables'} />
            <Cifra label="Neto cobrado" valor={eur(cifras.mes.neto)} nota={`IRPF ${eur(cifras.mes.irpf)} · SS ${eur(cifras.mes.ss_trabajador)}`} />
          </div>
          <Card className="p-5 sm:p-6">
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">Coste por mes</h2>
              {cifras.anios.length > 1 && (
                <Select className="!h-8 w-24 !text-sm" value={anio} onChange={(e) => setAnio(Number(e.target.value))} aria-label="Año">
                  {cifras.anios.map((a) => (
                    <option key={a}>{a}</option>
                  ))}
                </Select>
              )}
            </div>
            <p className="mb-4 text-sm text-muted">
              {anio}: coste total <strong className="num text-ink">{eur(cifras.anio.coste)}</strong> · bruto {eur(cifras.anio.bruto)} · Seguridad Social empresa{' '}
              {eur(cifras.anio.ss_empresa)}
              {cifras.anio.variables ? ` · variables ${eur(cifras.anio.variables)}` : ''}
            </p>
            <MonthlyChart
              meses={cifras.meses}
              anio={anio}
              apilado
              series={[
                { key: 'bruto', label: 'Salario bruto', color: '#111110' },
                { key: 'ss_empresa', label: 'SS empresa', color: '#b3e04d' },
              ]}
              total={{ label: 'Coste total', modo: 'suma' }}
            />
          </Card>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5 sm:p-6">
          <h2 className="mb-3 font-semibold">Datos personales</h2>
          <Datos
            filas={[
              ['DNI / NIE', t.dni],
              [
                'Caducidad',
                t.dni_caducidad ? (
                  <span className={caducaPronto ? 'inline-flex items-center gap-1 text-ambar' : ''}>
                    {caducaPronto && <AlertTriangle className="size-4" />}
                    {fecha(t.dni_caducidad)}
                  </span>
                ) : null,
              ],
              ['Seguridad Social', t.nss_tramitar ? 'No tiene: lo tramitamos nosotros' : t.nss],
              ['Nacimiento', t.fecha_nacimiento ? fecha(t.fecha_nacimiento) : null],
              ['Domicilio', t.domicilio],
              ['Teléfono', t.telefono],
              ['IBAN', t.iban ? t.iban.replace(/(.{4})/g, '$1 ').trim() : null],
              ['Estudios', t.nivel_estudios],
            ]}
          />
        </Card>
        <Card className="p-5 sm:p-6">
          <h2 className="mb-3 font-semibold">Contrato</h2>
          <Datos
            filas={[
              ['Tipo', nombreContrato(t.tipo_contrato)],
              ['Inicio', fecha(t.fecha_inicio)],
              ['Fin', t.fecha_fin ? fecha(t.fecha_fin) : null],
              ['Motivo', t.motivo_temporal],
              ['Sustituye a', t.sustituye_a],
              ['Centro', centro ? centro.nombre : null],
              ['Jornada', t.jornada === 'completa' ? 'Completa' : `Parcial · ${Number(t.horas_semana)} h/semana`],
              ['Horario', t.horario],
              ['Teletrabajo', t.teletrabajo ? 'Sí' : 'No'],
              ['Salario', `${eur(t.salario_bruto_mensual)} brutos × ${t.pagas} pagas = ${eur(Number(t.salario_bruto_mensual) * t.pagas)}/año`],
              ['Categoría', categoria ? `${categoria.nombre}${categoria.grupo_cotizacion ? ` (grupo ${categoria.grupo_cotizacion})` : ''}` : null],
              ['Puesto', t.puesto],
              ['Observaciones', t.observaciones],
            ]}
          />
        </Card>

        <Documentos trabajador={t} docs={docs} isAdvisor={isAdvisor} miId={me?.id ?? ''} onChanged={cargar} />

        <Card className="p-5 sm:p-6">
          <h2 className="mb-3 font-semibold">Nóminas</h2>
          {nominas.length === 0 ? (
            <p className="py-4 text-sm text-muted">Aún no hay nóminas de este trabajador.</p>
          ) : (
            <ul className="divide-y divide-line">
              {nominas.map((n) => (
                <li key={n.id}>
                  <button onClick={() => abrirDocumento(n.file_path)} className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-paper">
                    <FileText className="size-4 shrink-0 text-muted" />
                    <span className="flex-1 capitalize">
                      {MESES[n.mes - 1]} {n.anio}
                      {n.tipo !== 'mensual' && <span className="ml-1 text-sm normal-case text-muted">· {n.tipo}</span>}
                      {n.estado === 'borrador' && <span className="ml-2 text-xs normal-case text-ambar">sin publicar</span>}
                    </span>
                    <span className="num text-sm text-muted">neto {eur(n.neto)}</span>
                    <span className="num w-24 text-right text-sm font-medium">{eur(n.coste_total)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  )
}

function Cifra({ label, valor, nota, destacada }: { label: string; valor: string; nota?: string; destacada?: boolean }) {
  return (
    <div className={destacada ? 'rounded-2xl bg-ink p-4 text-white' : 'rounded-2xl border border-line bg-white p-4'}>
      <p className={destacada ? 'text-sm capitalize text-white/60' : 'text-sm text-muted'}>{label}</p>
      <p className={destacada ? 'num mt-1 text-2xl font-semibold text-lima' : 'num mt-1 text-xl font-semibold'}>{valor}</p>
      {nota && <p className={destacada ? 'mt-1 text-xs text-white/50' : 'mt-1 text-xs text-muted'}>{nota}</p>}
    </div>
  )
}

function Datos({ filas }: { filas: [string, ReactNode][] }) {
  return (
    <dl className="divide-y divide-line text-[15px]">
      {filas
        .filter(([, v]) => v !== null && v !== undefined && v !== '')
        .map(([k, v]) => (
          <div key={k} className="grid grid-cols-[120px_1fr] gap-3 py-2">
            <dt className="text-sm text-muted">{k}</dt>
            <dd className="min-w-0 break-words">{v}</dd>
          </div>
        ))}
    </dl>
  )
}

function PanelAsesor({
  trabajador,
  categorias,
  perfil,
  onSaved,
}: {
  trabajador: Trabajador
  categorias: CategoriaConvenio[]
  perfil: PerfilLaboral | null
  onSaved: () => void
}) {
  const [estado, setEstado] = useState<EstadoTrabajador>(trabajador.estado)
  const [categoriaId, setCategoriaId] = useState(trabajador.categoria_id ?? '')
  const [notas, setNotas] = useState(trabajador.notas_asesor ?? '')
  const [fechaBaja, setFechaBaja] = useState(trabajador.fecha_baja ?? '')
  const [guardando, setGuardando] = useState(false)

  const categoria = categorias.find((c) => c.id === categoriaId) ?? null
  const check = comprobarSalario({
    brutoMensual: Number(trabajador.salario_bruto_mensual),
    pagas: trabajador.pagas,
    jornada: trabajador.jornada,
    horasSemana: trabajador.horas_semana,
    perfil,
    categoria,
  })

  const guardar = async () => {
    setGuardando(true)
    const { error } = await supabase
      .from('trabajadores')
      .update({
        estado,
        categoria_id: categoriaId || null,
        notas_asesor: notas.trim() || null,
        fecha_baja: estado === 'baja' ? fechaBaja || hoyISO() : null,
      })
      .eq('id', trabajador.id)
    setGuardando(false)
    if (error) return notify(await errorMessage(error), 'error')
    notify('Guardado')
    onSaved()
  }

  return (
    <Card className="mb-6 border-ink/20 p-5 sm:p-6">
      <h2 className="mb-1 font-semibold">Gestión del asesor</h2>
      <p className="mb-4 text-sm text-muted">Solo lo ves tú.</p>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Estado">
          <Select value={estado} onChange={(e) => setEstado(e.target.value as EstadoTrabajador)}>
            {(Object.keys(ESTADOS_TRABAJADOR) as EstadoTrabajador[]).map((k) => (
              <option key={k} value={k}>
                {ESTADOS_TRABAJADOR[k].label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Categoría (convenio)" className="sm:col-span-2">
          <Select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
            <option value="">{categorias.length ? 'Sin asignar' : 'Añade categorías en la pestaña Empresa'}</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
                {c.salario_min_mensual ? ` · mín. ${eur(c.salario_min_mensual)}` : ''}
              </option>
            ))}
          </Select>
          {check && (
            <span className={`mt-1.5 block text-sm ${check.ok ? 'text-verde' : 'text-rojo'}`}>
              {check.ok
                ? `Cumple el convenio: ${eur(check.anualOfrecido)}/año frente a un mínimo de ${eur(check.anualMinimo)}.`
                : `No llega al mínimo: ${eur(check.anualOfrecido)}/año frente a ${eur(check.anualMinimo)}.`}
            </span>
          )}
        </Field>
        {estado === 'baja' && (
          <Field label="Fecha de baja">
            <Input type="date" value={fechaBaja} onChange={(e) => setFechaBaja(e.target.value)} />
          </Field>
        )}
        <Field label="Notas internas" className={estado === 'baja' ? 'sm:col-span-2' : 'sm:col-span-3'}>
          <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} className="min-h-16" />
        </Field>
      </div>
      <Button className="mt-4" onClick={guardar} loading={guardando}>
        Guardar
      </Button>
    </Card>
  )
}

function Documentos({
  trabajador,
  docs,
  isAdvisor,
  miId,
  onChanged,
}: {
  trabajador: Trabajador
  docs: DocTrabajador[]
  isAdvisor: boolean
  miId: string
  onChanged: () => void
}) {
  const [tipo, setTipo] = useState<TipoDocTrabajador>(isAdvisor ? 'contrato' : 'dni')
  const [subiendo, setSubiendo] = useState(false)
  const ref = useRef<HTMLInputElement>(null)

  const subir = async (files: File[]) => {
    setSubiendo(true)
    for (const f of files) {
      try {
        const archivo = await prepararArchivo(f)
        const ext = archivo.type === 'application/pdf' ? 'pdf' : archivo.type === 'image/png' ? 'png' : 'jpg'
        const path = `${trabajador.owner_id}/laboral/${trabajador.id}/${tipo}-${nuevoId()}.${ext}`
        const up = await supabase.storage.from(BUCKET).upload(path, archivo, { contentType: archivo.type })
        if (up.error) throw new Error(await errorMessage(up.error))
        const { error } = await supabase.from('trabajador_documentos').insert({
          owner_id: trabajador.owner_id,
          trabajador_id: trabajador.id,
          tipo,
          nombre: f.name,
          path,
        })
        if (error) throw new Error(await errorMessage(error))
      } catch (e) {
        notify(`${f.name}: ${(e as Error).message}`, 'error')
      }
    }
    setSubiendo(false)
    notify('Documento subido')
    onChanged()
  }

  const borrar = async (d: DocTrabajador) => {
    const ok = await confirmar({ titulo: 'Eliminar documento', texto: `¿Eliminar «${d.nombre ?? nombreDoc(d.tipo)}»?`, accion: 'Eliminar', peligro: true })
    if (!ok) return
    await supabase.storage.from(BUCKET).remove([d.path])
    const { error } = await supabase.from('trabajador_documentos').delete().eq('id', d.id)
    if (error) return notify(await errorMessage(error), 'error')
    onChanged()
  }

  const tipos = isAdvisor ? TIPOS_DOC : TIPOS_DOC.filter((x) => x.id === 'dni' || x.id === 'otro')

  return (
    <Card className="p-5 sm:p-6">
      <h2 className="mb-3 font-semibold">Documentos</h2>
      {docs.length === 0 ? (
        <p className="pb-2 text-sm text-muted">Sin documentos todavía.</p>
      ) : (
        <ul className="mb-3 divide-y divide-line">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center gap-3 py-2.5">
              <Paperclip className="size-4 shrink-0 text-muted" />
              <button onClick={() => abrirDocumento(d.path)} className="min-w-0 flex-1 text-left hover:underline">
                <span className="block truncate">{nombreDoc(d.tipo)}</span>
                <span className="block truncate text-xs text-muted">
                  {d.nombre} · {fecha(d.created_at)}
                </span>
              </button>
              {(isAdvisor || d.subido_por === miId) && (
                <button className="rounded-full p-1.5 text-muted hover:bg-rojo/10 hover:text-rojo" onClick={() => borrar(d)} aria-label="Eliminar">
                  <Trash2 className="size-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <Select className="!h-9 w-auto !text-sm" value={tipo} onChange={(e) => setTipo(e.target.value as TipoDocTrabajador)} aria-label="Tipo de documento">
          {tipos.map((x) => (
            <option key={x.id} value={x.id}>
              {x.nombre}
            </option>
          ))}
        </Select>
        <Button size="sm" variant="secondary" icon={<Upload className="size-4" />} loading={subiendo} onClick={() => ref.current?.click()}>
          Subir
        </Button>
        <input
          ref={ref}
          type="file"
          multiple
          accept="application/pdf,image/*"
          className="hidden"
          onChange={(e) => {
            const fs = Array.from(e.target.files ?? [])
            e.target.value = ''
            if (fs.length) subir(fs)
          }}
        />
      </div>
    </Card>
  )
}
