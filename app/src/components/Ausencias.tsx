/**
 * Piezas comunes de Ausencias (vacaciones, permisos y bajas): calendario de festivos, formulario para
 * pedir o apuntar, tarjeta de saldo de vacaciones y cada fila de la lista con sus acciones.
 * Las usan «Mi espacio → Ausencias» (trabajador) y «Laboral → Ausencias» (empresa).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CalendarCheck, Check, FileText, Paperclip, Stethoscope, Umbrella, X } from 'lucide-react'
import { abrirDocumento, supabase } from '../lib/supabase'
import { enDemo } from '../lib/demoFichaje'
import {
  NOMBRE_ESTADO_AUSENCIA,
  SUBTIPOS_BAJA,
  SUBTIPOS_PERMISO,
  diasDeAusencia,
  diasLaborables,
  nombreAusencia,
  textoFechas,
  type Ausencia,
  type SaldoVacaciones,
  type TipoAusencia,
} from '../lib/ausencias'
import { COMUNIDADES, comunidadDe, festivosDe, hayCalendario, provinciaDeTrabajo, type FestivoLocal } from '../lib/festivos'
import { adjuntarJustificante, anularAusencia, cargarFestivosLocales, cerrarBaja, pedirAusencia, resolverAusencia } from '../lib/ausenciasApi'
import type { CentroTrabajo, Profile } from '../lib/types'
import { Badge, Button, Card, Field, Input, Modal, Select, Textarea, cx, notify } from './ui'

export const hoyIso = () => new Date().toLocaleDateString('sv-SE')

// ------------------------------------------------------------------ Calendario de festivos

export interface Calendario {
  /** fecha → nombre, de la comunidad del centro (o de la empresa) más los locales */
  festivos: Map<string, string>
  locales: FestivoLocal[]
  comunidad: string | null
  recargar: () => void
}

/** Festivos de la empresa: los del BOE de su comunidad y los locales que ha puesto */
export function useCalendario(ownerId: string | null, empresa: Pick<Profile, 'provincia'> | null, centroId?: string | null): Calendario {
  const [locales, setLocales] = useState<FestivoLocal[]>([])
  const [centros, setCentros] = useState<Pick<CentroTrabajo, 'id' | 'provincia'>[]>([])
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!ownerId) return
    cargarFestivosLocales(ownerId).then(setLocales)
    if (enDemo()) return setCentros([])
    supabase
      .from('centros_trabajo')
      .select('id, provincia')
      .eq('owner_id', ownerId)
      .then(({ data }) => setCentros((data as Pick<CentroTrabajo, 'id' | 'provincia'>[]) ?? []))
  }, [ownerId, n])
  const provincia = enDemo() ? 'Barcelona' : provinciaDeTrabajo(centroId, centros, empresa)
  const com = comunidadDe(provincia)
  const festivos = useMemo(() => festivosDe(com, locales), [com, locales])
  return { festivos, locales, comunidad: com ? COMUNIDADES[com] : null, recargar: () => setN((x) => x + 1) }
}

// ------------------------------------------------------------------ Etiquetas

export const TONO_TIPO: Record<TipoAusencia, string> = {
  vacaciones: 'bg-lima text-ink',
  permiso: 'bg-[#e8eefc] text-[#2a4a9c]',
  baja: 'bg-rojo/10 text-rojo',
}

export function BadgeEstado({ a }: { a: Ausencia }) {
  if (a.tipo === 'baja' && a.estado === 'aprobada') return <Badge tono="gris">{a.hasta ? 'Comunicada' : 'Abierta'}</Badge>
  const tono = { pendiente: 'ambar', aprobada: 'verde', rechazada: 'rojo', anulada: 'gris' } as const
  return <Badge tono={tono[a.estado]}>{NOMBRE_ESTADO_AUSENCIA[a.estado]}</Badge>
}

export const ICONO_TIPO: Record<TipoAusencia, typeof Umbrella> = { vacaciones: Umbrella, permiso: CalendarCheck, baja: Stethoscope }

// ------------------------------------------------------------------ Saldo de vacaciones

export function TarjetaSaldo({ saldo, titulo = 'Tus vacaciones' }: { saldo: SaldoVacaciones; titulo?: string }) {
  const usado = Math.min(100, Math.round(((saldo.aprobados + saldo.pendientes) / Math.max(1, saldo.derecho)) * 100))
  const aprob = Math.min(100, Math.round((saldo.aprobados / Math.max(1, saldo.derecho)) * 100))
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">
            {titulo} {saldo.anio}
          </h2>
          <p className="mt-0.5 text-sm text-muted">Días laborables (de lunes a viernes, sin festivos)</p>
        </div>
        <p className="num text-right">
          <span className="rounded-md bg-lima px-2 py-0.5 text-2xl font-semibold">{saldo.quedan}</span>
          <span className="mt-1 block text-sm text-muted">de {saldo.derecho} te quedan</span>
        </p>
      </div>
      <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-ink/10">
        <div className="relative h-full" style={{ width: `${usado}%` }}>
          <div className="absolute inset-0 rounded-full bg-ambar/50" />
          <div className="absolute inset-y-0 left-0 rounded-full bg-ink" style={{ width: `${usado ? (aprob / usado) * 100 : 0}%` }} />
        </div>
      </div>
      <dl className="num mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        <div>
          <dt className="inline text-muted">Disfrutados </dt>
          <dd className="inline font-medium">{saldo.disfrutados}</dd>
        </div>
        <div>
          <dt className="inline text-muted">Aprobados por venir </dt>
          <dd className="inline font-medium">{saldo.aprobados - saldo.disfrutados}</dd>
        </div>
        <div>
          <dt className="inline text-muted">Pendientes de aprobar </dt>
          <dd className="inline font-medium">{saldo.pendientes}</dd>
        </div>
      </dl>
      {(saldo.proporcional || saldo.sinDato) && (
        <p className="mt-3 text-xs text-muted">
          {saldo.sinDato
            ? 'Tu ficha no tiene los días de vacaciones del contrato: contamos el mínimo legal (30 días naturales, unos 22 laborables).'
            : 'Proporcionales a los días que trabajas este año.'}
        </p>
      )}
    </Card>
  )
}

// ------------------------------------------------------------------ Pedir o apuntar una ausencia

export function ModalAusencia({
  open,
  onClose,
  cuenta,
  trabajadores,
  trabajadorInicial,
  tipoInicial,
  admin,
  festivos,
  saldoDe,
  onHecho,
}: {
  open: boolean
  onClose: () => void
  cuenta: string
  /** Empresa: a quién se le apunta. Trabajador: solo él. */
  trabajadores: { id: string; nombre: string }[]
  trabajadorInicial?: string | null
  tipoInicial: TipoAusencia
  admin: boolean
  festivos: Map<string, string>
  /** Saldo de vacaciones del trabajador en un año (para «te quedarán…» y el tope) */
  saldoDe?: (trabajadorId: string, anio: number) => SaldoVacaciones | null
  onHecho: (a: Ausencia) => void
}) {
  const [tipo, setTipo] = useState<TipoAusencia>(tipoInicial)
  const [trab, setTrab] = useState(trabajadorInicial ?? trabajadores[0]?.id ?? '')
  const [subtipo, setSubtipo] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [sinAlta, setSinAlta] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [archivo, setArchivo] = useState<File | null>(null)
  const [enviando, setEnviando] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Cada vez que se abre, limpio y con el tipo del botón pulsado
  useEffect(() => {
    if (!open) return
    setTipo(tipoInicial)
    setTrab(trabajadorInicial ?? trabajadores[0]?.id ?? '')
    setSubtipo(tipoInicial === 'baja' ? 'enfermedad' : '')
    setDesde('')
    setHasta('')
    setSinAlta(tipoInicial === 'baja')
    setMotivo('')
    setArchivo(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tipoInicial])

  const fin = tipo === 'baja' && sinAlta ? null : hasta || desde
  const dias = desde && (fin ?? desde) >= desde ? diasLaborables(desde, fin ?? desde, festivos).length : 0
  // Vacaciones: por cada año que toca, los días que pide frente a los que le quedan (el trabajador no puede pasarse)
  const porAnio =
    tipo === 'vacaciones' && trab && saldoDe && desde && fin && fin >= desde
      ? Array.from({ length: Number(fin.slice(0, 4)) - Number(desde.slice(0, 4)) + 1 }, (_, i) => Number(desde.slice(0, 4)) + i).flatMap((anio) => {
          const s = saldoDe(trab, anio)
          const d0 = desde > `${anio}-01-01` ? desde : `${anio}-01-01`
          const d1 = fin < `${anio}-12-31` ? fin : `${anio}-12-31`
          return s ? [{ anio, dias: diasLaborables(d0, d1, festivos).length, quedan: s.quedan, derecho: s.derecho }] : []
        })
      : []
  const excesos = porAnio.filter((x) => x.dias > x.quedan)
  const bloqueado = !admin && excesos.length > 0
  const textoExceso = excesos
    .map((x) => (x.quedan > 0 ? `en ${x.anio} solo te quedan ${x.quedan} ${x.quedan === 1 ? 'día' : 'días'} de ${x.derecho}` : `en ${x.anio} ya no te quedan días (tienes ${x.derecho})`))
    .join(' y ')
  const ayuda = tipo === 'permiso' ? SUBTIPOS_PERMISO.find((s) => s.id === subtipo)?.ayuda : null

  const enviar = async () => {
    if (!trab) return notify('Elige el trabajador', 'error')
    if (!desde) return notify('Pon el primer día', 'error')
    if (fin && fin < desde) return notify('El último día no puede ser anterior al primero', 'error')
    if (tipo === 'permiso' && !subtipo) return notify('Elige el tipo de permiso', 'error')
    if (tipo === 'permiso' && subtipo === 'otro' && !motivo.trim()) return notify('Explica el motivo del permiso', 'error')
    if (tipo !== 'baja' && dias === 0) return notify('Esas fechas no tienen ningún día laborable', 'error')
    if (bloqueado) return notify(`No puedes pedir tantos días: ${textoExceso}.`, 'error')
    setEnviando(true)
    try {
      const a = await pedirAusencia({ cuenta, trabajadorId: trab, tipo, subtipo: subtipo || null, desde, hasta: fin, motivo, archivo }, admin)
      notify(
        admin
          ? 'Ausencia apuntada'
          : tipo === 'baja'
            ? 'Baja comunicada a la empresa'
            : 'Solicitud enviada: la empresa la revisará',
      )
      onHecho(a)
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No se ha podido guardar', 'error')
    } finally {
      setEnviando(false)
    }
  }

  const titulo = admin
    ? 'Apuntar una ausencia'
    : { vacaciones: 'Pedir vacaciones', permiso: 'Pedir un permiso', baja: 'Comunicar una baja' }[tipo]

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={titulo}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={enviar} loading={enviando} disabled={bloqueado}>
            {admin ? 'Apuntar' : tipo === 'baja' ? 'Comunicar la baja' : 'Enviar solicitud'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {admin && (
          <Field label="Trabajador">
            <Select value={trab} onChange={(e) => setTrab(e.target.value)}>
              {trabajadores.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Tipo de ausencia">
          {(['vacaciones', 'permiso', 'baja'] as const).map((t) => {
            const Icono = ICONO_TIPO[t]
            return (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={tipo === t}
                onClick={() => {
                  setTipo(t)
                  setSubtipo(t === 'baja' ? 'enfermedad' : '')
                  setSinAlta(t === 'baja')
                }}
                className={cx(
                  'flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2 text-sm font-medium transition-colors',
                  tipo === t ? 'border-ink bg-ink text-white' : 'border-line bg-white hover:border-ink/30',
                )}
              >
                <Icono className="size-4" />
                {t === 'vacaciones' ? 'Vacaciones' : t === 'permiso' ? 'Permiso' : 'Baja'}
              </button>
            )
          })}
        </div>

        {tipo === 'permiso' && (
          <Field label="Tipo de permiso" hint={ayuda ? `${ayuda} Tu convenio puede darte más.` : undefined}>
            <Select value={subtipo} onChange={(e) => setSubtipo(e.target.value)}>
              <option value="">Elige…</option>
              {SUBTIPOS_PERMISO.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {tipo === 'baja' && (
          <Field label="Tipo de baja">
            <Select value={subtipo} onChange={(e) => setSubtipo(e.target.value)}>
              {SUBTIPOS_BAJA.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label={tipo === 'baja' ? 'Primer día de baja' : 'Primer día'}>
            <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </Field>
          <Field label={tipo === 'baja' ? 'Último día de baja' : 'Último día'}>
            <Input type="date" value={tipo === 'baja' && sinAlta ? '' : hasta} min={desde || undefined} disabled={tipo === 'baja' && sinAlta} onChange={(e) => setHasta(e.target.value)} />
          </Field>
        </div>
        {tipo === 'baja' && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-ink" checked={sinAlta} onChange={(e) => setSinAlta(e.target.checked)} />
            Todavía no tengo el alta
          </label>
        )}

        {desde && (tipo !== 'baja' || !sinAlta) && (
          <p className="num rounded-xl bg-paper px-4 py-3 text-sm">
            <strong>
              {dias} {dias === 1 ? 'día laborable' : 'días laborables'}
            </strong>
            {porAnio.length === 1 && !excesos.length && (
              <span className="text-muted">
                {' '}
                · {admin ? 'le quedarán' : 'te quedarán'} {porAnio[0].quedan - porAnio[0].dias} de {porAnio[0].derecho}
              </span>
            )}
          </p>
        )}
        {excesos.length > 0 && (
          <p className={cx('rounded-xl px-4 py-3 text-sm', bloqueado ? 'bg-rojo/10 text-rojo' : 'bg-ambar/10 text-ambar')}>
            {bloqueado ? (
              <>
                <strong>No puedes pedir tantos días:</strong> {textoExceso}. Cuentan las vacaciones aprobadas y las pendientes de aprobar. Si crees que te
                corresponden más, habla con la empresa.
              </>
            ) : (
              <>
                <strong>Se pasa de sus días:</strong> {textoExceso.replace(/te quedan/g, 'le quedan').replace(/no te quedan/g, 'no le quedan')}. Como empresa
                puedes apuntarlo igualmente (por ejemplo, días pendientes del año anterior o que da el convenio).
              </>
            )}
          </p>
        )}

        <Field
          label={tipo === 'permiso' && subtipo === 'otro' ? 'Motivo' : 'Comentario (opcional)'}
          hint={tipo === 'vacaciones' && !admin ? 'Por ley, las vacaciones se fijan de común acuerdo y las sabes con 2 meses de antelación (art. 38 ET).' : undefined}
        >
          <Textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder={tipo === 'vacaciones' ? 'Ej.: viaje en familia' : ''} />
        </Field>

        {tipo !== 'vacaciones' && (
          <div>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,image/*"
              className="hidden"
              onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
            />
            <Button type="button" variant="secondary" size="sm" icon={<Paperclip className="size-4" />} onClick={() => fileRef.current?.click()}>
              {archivo ? archivo.name.slice(0, 32) : tipo === 'baja' ? 'Adjuntar el parte (opcional)' : 'Adjuntar justificante (opcional)'}
            </Button>
            {tipo === 'baja' && (
              <p className="mt-1.5 text-xs text-muted">No es obligatorio: desde 2023 la Seguridad Social manda el parte de baja directamente a la empresa.</p>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}

// ------------------------------------------------------------------ Una ausencia de la lista

export function FilaAusencia({
  a,
  nombre,
  admin,
  festivos,
  onCambio,
}: {
  a: Ausencia
  /** Empresa: el nombre del trabajador */
  nombre?: string
  admin: boolean
  festivos: Map<string, string>
  onCambio: () => void
}) {
  const [modal, setModal] = useState<'rechazar' | 'anular' | 'alta' | null>(null)
  const [texto, setTexto] = useState('')
  const [fechaAlta, setFechaAlta] = useState('')
  const [enviando, setEnviando] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const Icono = ICONO_TIPO[a.tipo]
  const hoy = hoyIso()
  const dias = diasDeAusencia(a, festivos, hoy)

  const hacer = useCallback(
    async (fn: () => Promise<unknown>, ok: string) => {
      setEnviando(true)
      try {
        await fn()
        notify(ok)
        setModal(null)
        setTexto('')
        onCambio()
      } catch (e) {
        notify(e instanceof Error ? e.message : 'No se ha podido guardar', 'error')
      } finally {
        setEnviando(false)
      }
    },
    [onCambio],
  )

  const puedeCancelar = a.estado === 'pendiente' || (admin && a.estado === 'aprobada')
  const bajaAbierta = a.tipo === 'baja' && a.estado === 'aprobada' && !a.hasta

  return (
    <div className="px-4 py-3 sm:px-5">
      <div className="flex items-start gap-3">
        <span className={cx('mt-0.5 grid size-9 shrink-0 place-items-center rounded-full', TONO_TIPO[a.tipo])}>
          <Icono className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium">
            {nombre ? `${nombre} · ` : ''}
            {nombreAusencia(a)}
          </p>
          <p className="num text-sm text-muted">
            {textoFechas(a, true)} · {dias} {dias === 1 ? 'día laborable' : 'días laborables'}
            {bajaAbierta ? ' hasta hoy' : ''}
          </p>
          {a.motivo && <p className="mt-0.5 text-sm text-muted">«{a.motivo}»</p>}
          {a.respuesta && (a.estado === 'rechazada' || a.estado === 'anulada') && (
            <p className="mt-0.5 text-sm text-rojo">Motivo: {a.respuesta}</p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <BadgeEstado a={a} />
            {a.archivo_path && (
              <button
                onClick={() => (a.archivo_path === 'demo' ? notify('Es un justificante de ejemplo') : abrirDocumento(a.archivo_path!))}
                className="inline-flex items-center gap-1 text-xs font-medium underline"
              >
                <FileText className="size-3.5" /> Justificante
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-2 pl-12">
        {admin && a.estado === 'pendiente' && (
          <>
            <Button size="sm" icon={<Check className="size-4" />} loading={enviando} onClick={() => hacer(() => resolverAusencia(a, true), 'Aprobada')}>
              Aprobar
            </Button>
            <Button size="sm" variant="secondary" icon={<X className="size-4" />} onClick={() => setModal('rechazar')}>
              Rechazar
            </Button>
          </>
        )}
        {bajaAbierta && (
          <Button size="sm" variant="secondary" onClick={() => setModal('alta')}>
            Poner fecha de alta
          </Button>
        )}
        {!a.archivo_path && a.tipo !== 'vacaciones' && (a.estado === 'pendiente' || a.estado === 'aprobada') && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) hacer(() => adjuntarJustificante(a, f), 'Justificante añadido')
              }}
            />
            <Button size="sm" variant="ghost" icon={<Paperclip className="size-4" />} onClick={() => fileRef.current?.click()}>
              {a.tipo === 'baja' ? 'Añadir el parte' : 'Añadir justificante'}
            </Button>
          </>
        )}
        {puedeCancelar && !(a.estado === 'aprobada' && a.tipo === 'baja' && !admin) && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => (a.estado === 'pendiente' && !admin ? hacer(() => anularAusencia(a), 'Solicitud cancelada') : setModal('anular'))}
          >
            {a.estado === 'pendiente' && !admin ? 'Cancelar la solicitud' : 'Anular'}
          </Button>
        )}
      </div>

      <Modal
        open={modal === 'rechazar' || modal === 'anular'}
        onClose={() => setModal(null)}
        title={modal === 'rechazar' ? 'Rechazar la solicitud' : 'Anular la ausencia'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModal(null)}>
              Volver
            </Button>
            <Button
              variant="danger"
              loading={enviando}
              onClick={() =>
                modal === 'rechazar'
                  ? hacer(() => resolverAusencia(a, false, texto), 'Rechazada')
                  : hacer(() => anularAusencia(a, texto, admin), 'Ausencia anulada')
              }
            >
              {modal === 'rechazar' ? 'Rechazar' : 'Anular'}
            </Button>
          </>
        }
      >
        <p className="mb-3 text-sm text-muted">
          {nombre ? `${nombre}: ` : ''}
          {nombreAusencia(a)} {textoFechas(a, true)}.{' '}
          {modal === 'rechazar' ? 'Le avisamos por correo con el motivo.' : 'Queda constancia de la anulación y le avisamos por correo.'}
        </p>
        <Field label="Motivo">
          <Textarea rows={2} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={modal === 'rechazar' ? 'Ej.: esa semana hay cierre de proyecto' : ''} />
        </Field>
      </Modal>

      <Modal
        open={modal === 'alta'}
        onClose={() => setModal(null)}
        title="Fecha de alta"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModal(null)}>
              Volver
            </Button>
            <Button loading={enviando} onClick={() => (fechaAlta ? hacer(() => cerrarBaja(a, fechaAlta), 'Fecha de alta guardada') : notify('Pon el último día de baja', 'error'))}>
              Guardar
            </Button>
          </>
        }
      >
        <Field label="Último día de baja" hint="El día siguiente vuelves a trabajar.">
          <Input type="date" min={a.desde} value={fechaAlta} onChange={(e) => setFechaAlta(e.target.value)} />
        </Field>
      </Modal>
    </div>
  )
}

/** Aviso si no hay calendario oficial para ese año o no se sabe la comunidad */
export function AvisoCalendario({ comunidad, anio }: { comunidad: string | null; anio: number }) {
  if (comunidad && hayCalendario(anio)) return null
  return (
    <p className="mb-4 rounded-xl bg-ambar/10 px-4 py-3 text-sm text-ambar">
      {!comunidad
        ? 'No sabemos en qué comunidad está el centro de trabajo: solo contamos las fiestas de toda España. Pon la provincia en el perfil de la empresa o en el centro de trabajo.'
        : `Aún no tenemos el calendario oficial de ${anio}: de momento solo cuentan los festivos locales.`}
    </p>
  )
}
