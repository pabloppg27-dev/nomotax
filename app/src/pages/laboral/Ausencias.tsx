import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, Plus, Trash2, Umbrella } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import { enDemo, TRABAJADORES_DEMO } from '../../lib/demoFichaje'
import { MESES } from '../../lib/laboral'
import { ausenciaDelDia, diaSemana, diasEntre, saldoVacaciones, sumarDias, vigente, type Ausencia } from '../../lib/ausencias'
import { cargarAusencias, ponerFestivoLocal, quitarFestivoLocal } from '../../lib/ausenciasApi'
import type { Trabajador } from '../../lib/types'
import { AvisoCalendario, FilaAusencia, ModalAusencia, TONO_TIPO, hoyIso, useCalendario } from '../../components/Ausencias'
import { Button, Card, Empty, Field, Input, Loading, cx, notify } from '../../components/ui'
import LaboralTabs from './LaboralTabs'

const SEMANA = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const iniciales = (n: string) =>
  n
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()

/** Laboral → Ausencias: solicitudes por aprobar, calendario del equipo, saldo de vacaciones y festivos locales */
export default function Ausencias() {
  const { ownerId, owner } = useAuth()
  const demo = enDemo()
  const hoy = hoyIso()
  const [mes, setMes] = useState(hoy.slice(0, 7))
  const [trabajadores, setTrabajadores] = useState<Trabajador[] | null>(null)
  const [ausencias, setAusencias] = useState<Ausencia[]>([])
  const [apuntar, setApuntar] = useState(false)
  const [diaSel, setDiaSel] = useState<string | null>(null)
  const cal = useCalendario(ownerId, owner)

  const cargar = useCallback(async () => {
    if (!ownerId) return
    const [t, a] = await Promise.all([
      demo
        ? Promise.resolve(TRABAJADORES_DEMO.map((x) => ({ ...x, fecha_inicio: '2025-03-01', vacaciones_dias: x.id === 'd3' ? null : 23 }) as Trabajador))
        : supabase
            .from('trabajadores')
            .select('*')
            .eq('owner_id', ownerId)
            .in('estado', ['alta', 'en_tramite'])
            .order('nombre')
            .then(({ data }) => (data as Trabajador[]) ?? []),
      cargarAusencias(ownerId),
    ])
    setTrabajadores(t)
    setAusencias(a)
  }, [ownerId, demo])

  useEffect(() => {
    cargar()
  }, [cargar])

  const anio = Number(mes.slice(0, 4))
  const saldos = useMemo(
    () => new Map((trabajadores ?? []).map((t) => [t.id, saldoVacaciones(t, ausencias.filter((a) => a.trabajador_id === t.id), anio, cal.festivos, hoy)])),
    [trabajadores, ausencias, anio, cal.festivos, hoy],
  )

  if (!trabajadores || !ownerId) return <Loading />
  const nombre = (id: string) => trabajadores.find((t) => t.id === id)?.nombre ?? '—'
  const pendientes = ausencias.filter((a) => a.estado === 'pendiente').sort((a, b) => a.desde.localeCompare(b.desde))

  // Mes en cuadrícula (empieza en lunes)
  const primero = `${mes}-01`
  const ultimo = sumarDias(`${sumarDias(primero, 32).slice(0, 7)}-01`, -1)
  const huecos = (diaSemana(primero) + 6) % 7
  const diasMes = diasEntre(primero, ultimo)
  const delDia = (d: string) =>
    trabajadores
      .map((t) => ({ t, a: ausenciaDelDia(d, ausencias.filter((x) => x.trabajador_id === t.id)) }))
      .filter((x): x is { t: Trabajador; a: Ausencia } => Boolean(x.a))
  const delMes = ausencias
    .filter((a) => vigente(a) && a.desde <= ultimo && (a.hasta ?? '9999') >= primero)
    .sort((a, b) => a.desde.localeCompare(b.desde))
  const moverMes = (n: number) => {
    const [y, m] = mes.split('-').map(Number)
    const d = new Date(y, m - 1 + n, 1)
    setMes(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    setDiaSel(null)
  }
  const verDia = diaSel ? delDia(diaSel) : []

  return (
    <>
      <LaboralTabs
        subtitle="Vacaciones, permisos y bajas del equipo. Lo que se aprueba aquí no cuenta como «sin fichar» en el informe de los lunes."
        actions={
          <Button icon={<Plus className="size-4" />} onClick={() => setApuntar(true)} disabled={trabajadores.length === 0}>
            Apuntar ausencia
          </Button>
        }
      />

      {demo && (
        <p className="mb-4 rounded-xl bg-lima/40 px-4 py-3 text-sm">
          Modo demo: datos de ejemplo, no se guarda nada.{' '}
          <Link to="/mi-espacio/ausencias?demo" className="font-medium underline">
            Ver la pantalla del trabajador
          </Link>
        </p>
      )}
      <AvisoCalendario comunidad={cal.comunidad} anio={anio} />

      {pendientes.length > 0 && (
        <Card className="mb-4 divide-y divide-line">
          <h2 className="flex items-center gap-2 px-4 py-3 font-semibold sm:px-5">
            <AlertTriangle className="size-4 text-ambar" /> Por aprobar ({pendientes.length})
          </h2>
          {pendientes.map((a) => (
            <FilaAusencia key={a.id} a={a} nombre={nombre(a.trabajador_id)} admin festivos={cal.festivos} onCambio={cargar} />
          ))}
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.3fr_1fr] lg:items-start">
        <div className="space-y-4">
          {/* Calendario del mes */}
          <Card className="p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <button onClick={() => moverMes(-1)} className="grid size-10 place-items-center rounded-full hover:bg-ink/5" aria-label="Mes anterior">
                <ChevronLeft className="size-5" />
              </button>
              <h2 className="font-semibold capitalize">
                {MESES[Number(mes.slice(5)) - 1]} {anio}
              </h2>
              <button onClick={() => moverMes(1)} className="grid size-10 place-items-center rounded-full hover:bg-ink/5" aria-label="Mes siguiente">
                <ChevronRight className="size-5" />
              </button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted">
              {SEMANA.map((d) => (
                <div key={d} className="py-1 font-medium">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: huecos }, (_, i) => (
                <div key={`h${i}`} />
              ))}
              {diasMes.map((d) => {
                const quien = delDia(d)
                const fest = cal.festivos.get(d)
                const finde = diaSemana(d) === 0 || diaSemana(d) === 6
                return (
                  <button
                    key={d}
                    onClick={() => setDiaSel(diaSel === d ? null : d)}
                    title={fest ?? undefined}
                    className={cx(
                      'flex min-h-14 flex-col items-center gap-0.5 rounded-lg border p-1 text-left transition-colors',
                      diaSel === d ? 'border-ink' : 'border-transparent hover:border-line',
                      fest ? 'bg-lima/30' : finde ? 'bg-paper' : 'bg-white',
                    )}
                  >
                    <span className={cx('num text-xs', d === hoy ? 'rounded-full bg-ink px-1.5 font-semibold text-white' : finde || fest ? 'text-muted' : 'text-ink')}>
                      {Number(d.slice(8))}
                    </span>
                    <span className="flex flex-wrap justify-center gap-0.5">
                      {quien.slice(0, 3).map(({ t, a }) => (
                        <span
                          key={t.id}
                          className={cx('grid h-4 min-w-4 place-items-center rounded-full px-0.5 text-[9px] font-semibold leading-none', TONO_TIPO[a.tipo], a.estado === 'pendiente' && 'opacity-60 ring-1 ring-ambar')}
                        >
                          {iniciales(t.nombre)}
                        </span>
                      ))}
                      {quien.length > 3 && <span className="text-[9px] text-muted">+{quien.length - 3}</span>}
                    </span>
                  </button>
                )
              })}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
              <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-lima" /> Vacaciones</span>
              <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-[#c9d6f7]" /> Permiso</span>
              <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-rojo/30" /> Baja</span>
              <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-lima/30 ring-1 ring-line" /> Festivo</span>
              <span>Transparente: por aprobar</span>
            </div>
            {diaSel && (
              <div className="mt-3 rounded-xl bg-paper px-4 py-3 text-sm">
                <p className="font-medium">
                  {new Date(diaSel + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
                  {cal.festivos.get(diaSel) ? ` · ${cal.festivos.get(diaSel)}` : ''}
                </p>
                {verDia.length === 0 ? (
                  <p className="text-muted">Todo el equipo trabaja.</p>
                ) : (
                  <ul className="mt-1 space-y-0.5">
                    {verDia.map(({ t, a }) => (
                      <li key={t.id}>
                        {t.nombre}: {a.tipo === 'vacaciones' ? 'vacaciones' : a.tipo === 'permiso' ? 'permiso' : 'baja'}
                        {a.estado === 'pendiente' ? ' (por aprobar)' : ''}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </Card>

          <Card className="divide-y divide-line">
            <h2 className="px-4 py-3 font-semibold sm:px-5">
              Ausencias de {MESES[Number(mes.slice(5)) - 1]}
            </h2>
            {delMes.length === 0 ? (
              <Empty icon={<Umbrella className="size-5" />} title="Nadie falta este mes" text="Las vacaciones, permisos y bajas aprobadas o por aprobar salen aquí." />
            ) : (
              delMes.map((a) => <FilaAusencia key={a.id} a={a} nombre={nombre(a.trabajador_id)} admin festivos={cal.festivos} onCambio={cargar} />)
            )}
          </Card>
        </div>

        <div className="space-y-4">
          {/* Saldo de vacaciones de cada uno */}
          <Card className="p-5 sm:p-6">
            <h2 className="font-semibold">Vacaciones {anio}</h2>
            <p className="mt-0.5 text-sm text-muted">Días laborables: los del contrato (proporcionales si entró este año).</p>
            {trabajadores.length === 0 ? (
              <p className="mt-3 text-sm text-muted">No hay trabajadores de alta.</p>
            ) : (
              <table className="num mt-3 w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th className="pb-1 font-medium">Persona</th>
                    <th className="pb-1 text-right font-medium">Tiene</th>
                    <th className="pb-1 text-right font-medium">Usados</th>
                    <th className="pb-1 text-right font-medium">Quedan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {trabajadores.map((t) => {
                    const s = saldos.get(t.id)!
                    return (
                      <tr key={t.id}>
                        <td className="py-2 pr-2">
                          <span className="block truncate">{t.nombre}</span>
                          {s.sinDato && <span className="text-xs text-ambar">Sin días en la ficha: mínimo legal</span>}
                        </td>
                        <td className="py-2 text-right">{s.derecho}</td>
                        <td className="py-2 text-right">
                          {s.aprobados}
                          {s.pendientes ? <span className="text-ambar"> +{s.pendientes}</span> : ''}
                        </td>
                        <td className="py-2 text-right font-semibold">{s.quedan}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </Card>

          <Festivos ownerId={ownerId} anio={anio} cal={cal} />
        </div>
      </div>

      <ModalAusencia
        open={apuntar}
        onClose={() => setApuntar(false)}
        cuenta={ownerId}
        trabajadores={trabajadores.map((t) => ({ id: t.id, nombre: t.nombre }))}
        tipoInicial="vacaciones"
        admin
        festivos={cal.festivos}
        saldoDe={(id, y) => {
          const t = trabajadores.find((x) => x.id === id)
          if (!t) return null
          return y === anio ? (saldos.get(id) ?? null) : saldoVacaciones(t, ausencias.filter((a) => a.trabajador_id === id), y, cal.festivos, hoy)
        }}
        onHecho={() => {
          setApuntar(false)
          cargar()
        }}
      />
    </>
  )
}

/** Calendario de festivos del año: los oficiales (BOE) y los locales que pone la empresa */
function Festivos({ ownerId, anio, cal }: { ownerId: string; anio: number; cal: ReturnType<typeof useCalendario> }) {
  const [fecha, setFecha] = useState('')
  const [nombre, setNombre] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [verTodos, setVerTodos] = useState(false)
  const locales = cal.locales.filter((f) => f.fecha.startsWith(String(anio)))
  const oficiales = [...cal.festivos.entries()].filter(([f]) => f.startsWith(String(anio)) && !locales.some((l) => l.fecha === f)).sort(([a], [b]) => a.localeCompare(b))
  const fmt = (f: string) => new Date(f + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })

  const poner = async () => {
    if (!fecha || !nombre.trim()) return notify('Pon la fecha y el nombre del festivo', 'error')
    setGuardando(true)
    try {
      await ponerFestivoLocal(ownerId, fecha, nombre)
      setFecha('')
      setNombre('')
      cal.recargar()
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No se ha podido guardar', 'error')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Card className="p-5 sm:p-6">
      <h2 className="flex items-center gap-2 font-semibold">
        <CalendarDays className="size-4" /> Festivos {anio}
      </h2>
      <p className="mt-0.5 text-sm text-muted">
        {cal.comunidad ? `Nacionales y de ${cal.comunidad} (BOE)` : 'Nacionales (BOE)'}, más los 2 locales de vuestro municipio, que los pones tú.
      </p>

      <h3 className="mt-4 text-xs font-medium tracking-wide text-muted uppercase">Locales de la empresa</h3>
      {locales.length === 0 ? (
        <p className="mt-1 text-sm text-ambar">Aún no hay festivos locales de {anio}: añade los 2 de vuestro ayuntamiento.</p>
      ) : (
        <ul className="mt-1 divide-y divide-line text-sm">
          {locales.map((f) => (
            <li key={f.id ?? f.fecha} className="flex items-center justify-between gap-3 py-1.5">
              <span className="min-w-0 truncate">{f.nombre}</span>
              <span className="flex shrink-0 items-center gap-1">
                <span className="num text-muted">{fmt(f.fecha)}</span>
                {f.id && (
                  <button
                    onClick={() =>
                      quitarFestivoLocal(f.id!)
                        .then(cal.recargar)
                        .catch((e) => notify(e.message, 'error'))
                    }
                    className="grid size-8 place-items-center rounded-full text-muted hover:bg-ink/5 hover:text-rojo"
                    aria-label={`Quitar ${f.nombre}`}
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 grid grid-cols-[auto_1fr] gap-2 sm:grid-cols-[auto_1fr_auto]">
        <Field label="Día">
          <Input type="date" className="!w-[9.5rem]" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </Field>
        <Field label="Nombre">
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Fiesta mayor" />
        </Field>
        <Button className="col-span-2 self-end sm:col-span-1" variant="secondary" loading={guardando} onClick={poner}>
          Añadir
        </Button>
      </div>

      <h3 className="mt-5 text-xs font-medium tracking-wide text-muted uppercase">Oficiales</h3>
      <ul className="mt-1 divide-y divide-line text-sm">
        {(verTodos ? oficiales : oficiales.filter(([f]) => f >= hoyIso()).slice(0, 4)).map(([f, n]) => (
          <li key={f} className="flex justify-between gap-3 py-1.5">
            <span className="min-w-0 truncate">{n}</span>
            <span className="num shrink-0 text-muted">{fmt(f)}</span>
          </li>
        ))}
      </ul>
      {oficiales.length > 4 && (
        <button onClick={() => setVerTodos((v) => !v)} className="mt-1 text-sm font-medium underline">
          {verTodos ? 'Ver solo los próximos' : `Ver los ${oficiales.length} del año`}
        </button>
      )}
    </Card>
  )
}
