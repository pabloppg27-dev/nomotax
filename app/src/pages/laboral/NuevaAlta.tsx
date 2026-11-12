import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, Camera, Send, X } from 'lucide-react'
import { useAuth } from '../../lib/auth'
import { BUCKET, errorMessage, supabase } from '../../lib/supabase'
import { eur, sumarDias, hoyISO } from '../../lib/format'
import { nuevoId } from '../../lib/id'
import { prepararArchivo } from '../../lib/upload'
import {
  NIVELES_ESTUDIOS,
  TIPOS_CONTRATO,
  comprobarSalario,
  diasHabilesHasta,
  dniValido,
  ibanValido,
  limpiarDni,
  limpiarIban,
} from '../../lib/laboral'
import type { CategoriaConvenio, CentroTrabajo, PerfilLaboral, Trabajador } from '../../lib/types'
import NumInput from '../../components/NumInput'
import { Button, Card, Field, Input, Loading, Select, Textarea, cx, notify } from '../../components/ui'

type Form = {
  nombre: string
  dni: string
  dni_caducidad: string
  nss: string
  nss_tramitar: boolean
  fecha_nacimiento: string
  domicilio: string
  telefono: string
  iban: string
  nivel_estudios: string
  fecha_inicio: string
  centro_id: string
  puesto: string
  tipo_contrato: string
  fecha_fin: string
  motivo_temporal: string
  sustituye_a: string
  jornada: 'completa' | 'parcial'
  horas_semana: number
  horario: string
  teletrabajo: boolean
  salario_bruto_mensual: number
  pagas: 12 | 14
  observaciones: string
}

const vacio = (): Form => ({
  nombre: '',
  dni: '',
  dni_caducidad: '',
  nss: '',
  nss_tramitar: false,
  fecha_nacimiento: '',
  domicilio: '',
  telefono: '',
  iban: '',
  nivel_estudios: '',
  fecha_inicio: sumarDias(hoyISO(), 7),
  centro_id: '',
  puesto: '',
  tipo_contrato: 'indefinido',
  fecha_fin: '',
  motivo_temporal: '',
  sustituye_a: '',
  jornada: 'completa',
  horas_semana: 0,
  horario: '',
  teletrabajo: false,
  salario_bruto_mensual: 0,
  pagas: 14,
  observaciones: '',
})

export default function NuevaAlta() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { ownerId } = useAuth()
  const [form, setForm] = useState<Form>(vacio)
  const [centros, setCentros] = useState<CentroTrabajo[]>([])
  const [categorias, setCategorias] = useState<CategoriaConvenio[]>([])
  const [perfil, setPerfil] = useState<PerfilLaboral | null>(null)
  const [fotos, setFotos] = useState<File[]>([])
  const [cargando, setCargando] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!ownerId) return
    Promise.all([
      supabase.from('centros_trabajo').select('*').eq('owner_id', ownerId).order('nombre'),
      supabase.from('categorias_convenio').select('*').eq('owner_id', ownerId),
      supabase.from('perfil_laboral').select('*').eq('owner_id', ownerId).maybeSingle(),
      id ? supabase.from('trabajadores').select('*').eq('id', id).single() : Promise.resolve({ data: null }),
    ]).then(([c, k, p, t]) => {
      const lista = (c.data as CentroTrabajo[]) ?? []
      setCentros(lista)
      setCategorias((k.data as CategoriaConvenio[]) ?? [])
      setPerfil((p.data as PerfilLaboral) ?? null)
      const tr = t.data as Trabajador | null
      if (tr) {
        if (tr.estado !== 'solicitada') {
          notify('Esta alta ya está en trámite: pide los cambios a tu asesor', 'error')
          navigate(`/laboral/trabajadores/${tr.id}`, { replace: true })
          return
        }
        setForm({
          ...vacio(),
          ...Object.fromEntries(Object.entries(tr).map(([k, v]) => [k, v ?? ''])),
          nss_tramitar: tr.nss_tramitar,
          teletrabajo: tr.teletrabajo,
          horas_semana: Number(tr.horas_semana ?? 0),
          salario_bruto_mensual: Number(tr.salario_bruto_mensual),
          pagas: tr.pagas,
          jornada: tr.jornada,
        } as Form)
      } else if (lista.length === 1) {
        setForm((f) => ({ ...f, centro_id: lista[0].id }))
      }
      setCargando(false)
    })
  }, [ownerId, id, navigate])

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }))
  const txt = (k: keyof Form) => (e: { target: { value: string } }) => set(k, e.target.value as never)

  // Avisos
  const dias = form.fecha_inicio ? diasHabilesHasta(form.fecha_inicio) : null
  const pocaAntelacion = dias !== null && dias < 3
  const dniMal = form.dni.length >= 8 && !dniValido(form.dni)
  const ibanMal = limpiarIban(form.iban).length >= 15 && !ibanValido(form.iban)
  const categoriaMinima = useMemo(() => {
    const conMin = categorias.filter((c) => c.salario_min_mensual)
    if (!conMin.length) return null
    return conMin.reduce((a, b) => (Number(a.salario_min_mensual) <= Number(b.salario_min_mensual) ? a : b))
  }, [categorias])
  const salario = comprobarSalario({
    brutoMensual: form.salario_bruto_mensual,
    pagas: form.pagas,
    jornada: form.jornada,
    horasSemana: form.horas_semana,
    perfil,
    categoria: categoriaMinima,
  })

  if (cargando || !ownerId) return <Loading />

  const temporalProduccion = form.tipo_contrato === 'temporal_produccion'
  const sustitucion = form.tipo_contrato === 'temporal_sustitucion'
  const formativo = form.tipo_contrato.startsWith('formativo')

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    const falta = (m: string) => {
      notify(m, 'error')
      return false
    }
    if (!form.nombre.trim()) return falta('Falta el nombre del trabajador')
    if (!form.dni.trim()) return falta('Falta el DNI o NIE')
    if (!form.nss_tramitar && !form.nss.trim()) return falta('Pon el nº de la Seguridad Social o marca que no lo tiene')
    if (!form.fecha_inicio) return falta('Falta la fecha de inicio')
    if (centros.length && !form.centro_id) return falta('Elige el centro de trabajo')
    if (!form.puesto.trim()) return falta('Describe el puesto y sus funciones')
    if (temporalProduccion && (!form.fecha_fin || !form.motivo_temporal.trim()))
      return falta('En un contrato temporal hay que indicar la fecha de fin y el motivo')
    if (sustitucion && !form.sustituye_a.trim()) return falta('Indica a quién sustituye')
    if (form.jornada === 'parcial' && !form.horas_semana) return falta('Indica las horas semanales de la jornada parcial')
    if (!form.salario_bruto_mensual) return falta('Falta el salario bruto mensual')

    setEnviando(true)
    const datos = {
      owner_id: ownerId,
      nombre: form.nombre.trim(),
      dni: limpiarDni(form.dni),
      dni_caducidad: form.dni_caducidad || null,
      nss: form.nss_tramitar ? null : form.nss.replace(/[\s/.-]/g, '') || null,
      nss_tramitar: form.nss_tramitar,
      fecha_nacimiento: form.fecha_nacimiento || null,
      domicilio: form.domicilio.trim() || null,
      telefono: form.telefono.trim() || null,
      iban: limpiarIban(form.iban) || null,
      nivel_estudios: form.nivel_estudios || null,
      fecha_inicio: form.fecha_inicio,
      centro_id: form.centro_id || null,
      puesto: form.puesto.trim(),
      tipo_contrato: form.tipo_contrato,
      fecha_fin: temporalProduccion || sustitucion || formativo ? form.fecha_fin || null : null,
      motivo_temporal: temporalProduccion ? form.motivo_temporal.trim() : null,
      sustituye_a: sustitucion ? form.sustituye_a.trim() : null,
      jornada: form.jornada,
      horas_semana: form.jornada === 'parcial' ? form.horas_semana : null,
      horario: form.horario.trim() || null,
      teletrabajo: form.teletrabajo,
      salario_bruto_mensual: form.salario_bruto_mensual,
      pagas: form.pagas,
      observaciones: form.observaciones.trim() || null,
    }
    const res = id
      ? await supabase.from('trabajadores').update(datos).eq('id', id).select().single()
      : await supabase.from('trabajadores').insert(datos).select().single()
    if (res.error) {
      setEnviando(false)
      return notify(await errorMessage(res.error), 'error')
    }
    const trabajador = res.data as Trabajador

    // Fotos del DNI
    for (const f of fotos) {
      try {
        const archivo = await prepararArchivo(f)
        const ext = archivo.type === 'application/pdf' ? 'pdf' : archivo.type === 'image/png' ? 'png' : 'jpg'
        const path = `${ownerId}/laboral/${trabajador.id}/dni-${nuevoId()}.${ext}`
        const up = await supabase.storage.from(BUCKET).upload(path, archivo, { contentType: archivo.type })
        if (up.error) throw new Error(await errorMessage(up.error))
        await supabase.from('trabajador_documentos').insert({
          owner_id: ownerId,
          trabajador_id: trabajador.id,
          tipo: 'dni',
          nombre: f.name,
          path,
        })
      } catch (err) {
        notify(`No se ha podido subir ${f.name}: ${(err as Error).message}`, 'error')
      }
    }
    setEnviando(false)
    notify(id ? 'Solicitud actualizada' : 'Alta enviada a tu asesor')
    navigate(`/laboral/trabajadores/${trabajador.id}`)
  }

  return (
    <>
      <Link to={id ? `/laboral/trabajadores/${id}` : '/laboral'} className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> {id ? 'Volver a la ficha' : 'Laboral'}
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">{id ? 'Editar solicitud de alta' : 'Nueva alta'}</h1>
      <p className="mb-6 mt-1 text-[15px] text-muted">Rellena lo que sepas. Nosotros revisamos el resto y te avisamos si falta algo.</p>

      <form onSubmit={enviar} className="max-w-3xl space-y-6">
        <Seccion titulo="Trabajador">
          <Field label="Nombre y apellidos" className="sm:col-span-2">
            <Input value={form.nombre} onChange={txt('nombre')} autoComplete="off" />
          </Field>
          <Field label="DNI o NIE">
            <Input value={form.dni} onChange={txt('dni')} className={cx(dniMal && '!border-ambar')} />
            {dniMal && <Aviso>La letra no cuadra con el número. Revísalo.</Aviso>}
          </Field>
          <Field label="Caducidad del DNI/NIE">
            <Input type="date" value={form.dni_caducidad} onChange={txt('dni_caducidad')} />
          </Field>
          <Field label="Nº de la Seguridad Social">
            <Input value={form.nss} onChange={txt('nss')} disabled={form.nss_tramitar} placeholder={form.nss_tramitar ? 'Lo tramitamos nosotros' : ''} />
          </Field>
          <label className="flex items-center gap-2 self-end pb-2.5 text-sm">
            <input type="checkbox" className="size-4 accent-ink" checked={form.nss_tramitar} onChange={(e) => set('nss_tramitar', e.target.checked)} />
            No tiene: tramitadlo vosotros
          </label>
          <Field label="Fecha de nacimiento">
            <Input type="date" value={form.fecha_nacimiento} onChange={txt('fecha_nacimiento')} />
          </Field>
          <Field label="Teléfono">
            <Input type="tel" value={form.telefono} onChange={txt('telefono')} />
          </Field>
          <Field label="Domicilio" className="sm:col-span-2">
            <Input value={form.domicilio} onChange={txt('domicilio')} placeholder="Calle, número, CP y ciudad" />
          </Field>
          <Field label="IBAN para la nómina">
            <Input value={form.iban} onChange={txt('iban')} placeholder="ES00 0000 0000 0000 0000 0000" className={cx(ibanMal && '!border-ambar')} />
            {ibanMal && <Aviso>El IBAN no parece correcto.</Aviso>}
          </Field>
          <Field label="Nivel de estudios">
            <Select value={form.nivel_estudios} onChange={txt('nivel_estudios')}>
              <option value="">Elige…</option>
              {NIVELES_ESTUDIOS.map((n) => (
                <option key={n}>{n}</option>
              ))}
            </Select>
          </Field>
          <div className="sm:col-span-2">
            <span className="mb-1 block text-[13px] font-medium text-ink/80">Foto del DNI/NIE (las dos caras)</span>
            <div className="flex flex-wrap items-center gap-2">
              {fotos.map((f, i) => (
                <span key={i} className="inline-flex items-center gap-1 rounded-full bg-paper px-3 py-1 text-sm">
                  {f.name}
                  <button type="button" onClick={() => setFotos(fotos.filter((_, j) => j !== i))} aria-label="Quitar">
                    <X className="size-3.5" />
                  </button>
                </span>
              ))}
              <Button type="button" size="sm" variant="secondary" icon={<Camera className="size-4" />} onClick={() => fileRef.current?.click()}>
                {fotos.length ? 'Añadir otra' : 'Subir fotos'}
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*,application/pdf"
                multiple
                className="hidden"
                onChange={(e) => {
                  setFotos([...fotos, ...Array.from(e.target.files ?? [])].slice(0, 4))
                  e.target.value = ''
                }}
              />
            </div>
          </div>
        </Seccion>

        <Seccion titulo="Contrato">
          <Field label="Fecha de inicio">
            <Input type="date" value={form.fecha_inicio} onChange={txt('fecha_inicio')} />
            {pocaAntelacion && (
              <Aviso>
                Quedan {dias} día{dias === 1 ? '' : 's'} hábil{dias === 1 ? '' : 'es'}: el alta tiene que estar hecha antes de que empiece. Avísanos cuanto antes.
              </Aviso>
            )}
          </Field>
          <Field label="Centro de trabajo">
            {centros.length ? (
              <Select value={form.centro_id} onChange={txt('centro_id')}>
                <option value="">Elige…</option>
                {centros.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </Select>
            ) : (
              <Input disabled placeholder="Tu asesor aún no ha añadido centros" />
            )}
          </Field>
          <Field label="Puesto y funciones principales" className="sm:col-span-2" hint="Con esto te proponemos la categoría según tu convenio.">
            <Textarea value={form.puesto} onChange={txt('puesto')} placeholder="Ej.: Dependienta. Atención al público, caja y reposición." />
          </Field>
          <Field label="Tipo de contrato" className="sm:col-span-2">
            <Select value={form.tipo_contrato} onChange={txt('tipo_contrato')}>
              {TIPOS_CONTRATO.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </Select>
          </Field>
          {(temporalProduccion || sustitucion || formativo) && (
            <Field label={temporalProduccion ? 'Fecha de fin' : 'Fecha de fin (si se sabe)'}>
              <Input type="date" value={form.fecha_fin} onChange={txt('fecha_fin')} />
            </Field>
          )}
          {temporalProduccion && (
            <Field label="Motivo de la contratación temporal">
              <Input value={form.motivo_temporal} onChange={txt('motivo_temporal')} placeholder="Ej.: campaña de Navidad" />
            </Field>
          )}
          {sustitucion && (
            <Field label="¿A quién sustituye y por qué?">
              <Input value={form.sustituye_a} onChange={txt('sustituye_a')} placeholder="Ej.: María López, baja por maternidad" />
            </Field>
          )}
          <Field label="Jornada">
            <Select value={form.jornada} onChange={(e) => set('jornada', e.target.value as Form['jornada'])}>
              <option value="completa">Completa</option>
              <option value="parcial">Parcial</option>
            </Select>
          </Field>
          {form.jornada === 'parcial' ? (
            <Field label="Horas a la semana">
              <NumInput value={form.horas_semana} onValue={(n) => set('horas_semana', n)} />
            </Field>
          ) : (
            <div className="hidden sm:block" />
          )}
          <Field label="Horario y días de trabajo" className="sm:col-span-2">
            <Input value={form.horario} onChange={txt('horario')} placeholder="Ej.: lunes a viernes de 9:00 a 14:00" />
          </Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" className="size-4 accent-ink" checked={form.teletrabajo} onChange={(e) => set('teletrabajo', e.target.checked)} />
            Hará teletrabajo (te prepararemos el acuerdo de trabajo a distancia)
          </label>
        </Seccion>

        <Seccion titulo="Salario">
          <Field label="Salario bruto mensual">
            <NumInput className="text-right" value={form.salario_bruto_mensual} onValue={(n) => set('salario_bruto_mensual', n)} />
          </Field>
          <Field label="Pagas al año">
            <Select value={form.pagas} onChange={(e) => set('pagas', Number(e.target.value) as 12 | 14)}>
              <option value={14}>14 pagas</option>
              <option value={12}>12 pagas (extras prorrateadas)</option>
            </Select>
          </Field>
          {form.salario_bruto_mensual > 0 && (
            <p className="text-sm text-muted sm:col-span-2">
              Bruto anual: <strong className="num text-ink">{eur(form.salario_bruto_mensual * form.pagas)}</strong>
            </p>
          )}
          {salario && !salario.ok && (
            <div className="sm:col-span-2">
              <Aviso>
                Está por debajo del mínimo de tu convenio ({eur(salario.anualMinimo)} al año{form.jornada === 'parcial' ? ' para esta jornada' : ''}). Lo
                revisaremos contigo.
              </Aviso>
            </div>
          )}
        </Seccion>

        <Seccion titulo="Observaciones">
          <Field label="Algo más que debamos saber (opcional)" className="sm:col-span-2">
            <Textarea value={form.observaciones} onChange={txt('observaciones')} placeholder="Ej.: está inscrito en el paro, es familiar mío, ya trabajó con nosotros…" />
          </Field>
        </Seccion>

        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="accent" icon={<Send className="size-4" />} loading={enviando}>
            {id ? 'Guardar cambios' : 'Enviar solicitud de alta'}
          </Button>
          <Button type="button" variant="secondary" onClick={() => navigate(-1)}>
            Cancelar
          </Button>
        </div>
      </form>
    </>
  )
}

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <Card className="p-5 sm:p-6">
      <h2 className="mb-4 font-semibold">{titulo}</h2>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </Card>
  )
}

function Aviso({ children }: { children: ReactNode }) {
  return (
    <span className="mt-1.5 flex gap-1.5 text-sm text-ambar">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </span>
  )
}
