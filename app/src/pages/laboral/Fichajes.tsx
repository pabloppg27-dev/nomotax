import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, Download, Pencil, Printer, X } from 'lucide-react'
import { useAuth } from '../../lib/auth'
import { errorMessage, supabase } from '../../lib/supabase'
import { fecha, num } from '../../lib/format'
import { MESES } from '../../lib/laboral'
import { NOMBRE_TIPO, csvRegistro, descargar, duracion, hora, resumenDias, type Fichaje } from '../../lib/fichaje'
import type { Trabajador } from '../../lib/types'
import { Badge, Button, Card, Empty, Loading, Select, notify } from '../../components/ui'
import { ModalCorreccion } from '../Fichar'
import LaboralTabs from './LaboralTabs'
import { Link } from 'react-router-dom'
import { TRABAJADORES_DEMO, enDemo, fichajesDemo } from '../../lib/demoFichaje'

let DEMO: Fichaje[] | null = null

/** Registro de jornada de la empresa: por trabajador y mes, correcciones pendientes y exportación */
export default function Fichajes() {
  const { ownerId } = useAuth()
  const hoy = new Date()
  const [mes, setMes] = useState(`${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`)
  const [trabajadores, setTrabajadores] = useState<Trabajador[] | null>(null)
  const [sel, setSel] = useState('')
  const [fs, setFs] = useState<Fichaje[]>([])
  const [pendientes, setPendientes] = useState<Fichaje[]>([])
  const [corregir, setCorregir] = useState(false)

  const cargar = useCallback(async () => {
    if (!ownerId) return
    const [a, m] = mes.split('-').map(Number)
    const desde = new Date(a, m - 1, 1)
    const hasta = new Date(a, m, 1)
    if (enDemo()) {
      DEMO ??= fichajesDemo()
      setTrabajadores(TRABAJADORES_DEMO)
      setFs(DEMO.filter((f) => new Date(f.momento) >= desde && new Date(f.momento) < hasta))
      setPendientes(DEMO.filter((f) => f.estado === 'pendiente'))
      return
    }
    const [t, f, p] = await Promise.all([
      supabase.from('trabajadores').select('*').eq('owner_id', ownerId).order('nombre'),
      supabase.from('fichajes').select('*').eq('owner_id', ownerId).gte('momento', desde.toISOString()).lt('momento', hasta.toISOString()).order('momento'),
      supabase.from('fichajes').select('*').eq('owner_id', ownerId).eq('estado', 'pendiente').order('momento'),
    ])
    setTrabajadores((t.data as Trabajador[]) ?? [])
    setFs((f.data as Fichaje[]) ?? [])
    setPendientes((p.data as Fichaje[]) ?? [])
  }, [ownerId, mes])

  useEffect(() => {
    cargar()
  }, [cargar])

  const porTrab = useMemo(() => {
    const m = new Map<string, Fichaje[]>()
    for (const f of fs) m.set(f.trabajador_id, [...(m.get(f.trabajador_id) ?? []), f])
    return m
  }, [fs])

  if (!trabajadores) return <Loading />
  const nombre = (id: string) => trabajadores.find((t) => t.id === id)?.nombre ?? '—'
  const [a, m] = mes.split('-').map(Number)
  const meses = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const actual = trabajadores.find((t) => t.id === sel)
  const dias = sel ? resumenDias(porTrab.get(sel) ?? []) : []

  const resolver = async (f: Fichaje, aprobar: boolean) => {
    if (enDemo()) {
      DEMO = DEMO!.map((x) => (x.id === f.id ? { ...x, estado: aprobar ? 'valido' : 'rechazado' } : x))
      notify(aprobar ? 'Corrección aprobada (demo)' : 'Corrección rechazada (demo)')
      return cargar()
    }
    const { error } = await supabase.rpc('resolver_fichaje', { p_id: f.id, p_aprobar: aprobar })
    if (error) return notify(await errorMessage(error), 'error')
    notify(aprobar ? 'Corrección aprobada' : 'Corrección rechazada')
    cargar()
  }

  const exportar = (t: Trabajador) =>
    descargar(`Registro jornada ${t.nombre} ${MESES[m - 1]} ${a}.csv`, csvRegistro(t.nombre, t.dni, resumenDias(porTrab.get(t.id) ?? [])))

  return (
    <>
      <LaboralTabs subtitle="Registro de jornada (art. 34.9 ET): no se puede borrar ni editar y se conserva 4 años." />

      {enDemo() && (
        <p className="mb-4 rounded-xl bg-lima/40 px-4 py-3 text-sm">
          Modo demo: datos de ejemplo, no se guarda nada.{' '}
          <Link to="/fichar?demo" className="font-medium underline">
            Ver la pantalla del trabajador
          </Link>
        </p>
      )}

      {pendientes.length > 0 && (
        <Card className="mb-4 divide-y divide-line">
          <h2 className="flex items-center gap-2 px-4 py-3 font-semibold sm:px-5">
            <AlertTriangle className="size-4 text-ambar" /> Correcciones pendientes
          </h2>
          {pendientes.map((f) => (
            <div key={f.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <p className="font-medium">
                  {nombre(f.trabajador_id)} · {NOMBRE_TIPO[f.tipo]} {fecha(f.momento)} {hora(f.momento)}
                </p>
                <p className="text-sm text-muted">{f.motivo}</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" icon={<X className="size-4" />} onClick={() => resolver(f, false)}>
                  Rechazar
                </Button>
                <Button size="sm" icon={<Check className="size-4" />} onClick={() => resolver(f, true)}>
                  Aprobar
                </Button>
              </div>
            </div>
          ))}
        </Card>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select className="!w-auto" value={mes} onChange={(e) => setMes(e.target.value)}>
          {meses.map((x) => (
            <option key={x} value={x}>
              {MESES[Number(x.slice(5)) - 1]} {x.slice(0, 4)}
            </option>
          ))}
        </Select>
        {sel && (
          <Button variant="secondary" onClick={() => setSel('')}>
            Ver todos
          </Button>
        )}
      </div>

      {!sel ? (
        <Card className="divide-y divide-line">
          {trabajadores.length === 0 ? (
            <Empty icon={<AlertTriangle className="size-5" />} title="No hay trabajadores" text="Da de alta a tus trabajadores y actívales «Fichaje» en Usuarios." />
          ) : (
            trabajadores.map((t) => {
              const d = resumenDias(porTrab.get(t.id) ?? [])
              const total = d.reduce((s, x) => s + x.trabajadoMin, 0)
              const abierto = d.some((x) => x.abierto && x.dia !== new Date().toLocaleDateString('sv-SE'))
              return (
                <div key={t.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                  <button className="min-w-0 flex-1 text-left" onClick={() => setSel(t.id)}>
                    <p className="truncate font-medium">{t.nombre}</p>
                    <p className="text-sm text-muted">
                      {d.length} días fichados {abierto && <Badge tono="ambar">Fichaje sin cerrar</Badge>}
                    </p>
                  </button>
                  <p className="num font-medium">{num(total / 60)} h</p>
                  <button onClick={() => exportar(t)} className="rounded-full p-2 text-muted hover:bg-ink/5 hover:text-ink" aria-label="Descargar Excel">
                    <Download className="size-4" />
                  </button>
                </div>
              )
            })
          )}
        </Card>
      ) : (
        actual && (
          <Card className="divide-y divide-line print:shadow-none">
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-5">
              <div>
                <h2 className="font-semibold">{actual.nombre}</h2>
                <p className="text-sm text-muted">
                  {actual.dni} · {MESES[m - 1]} {a} · total <span className="num">{num(dias.reduce((s, x) => s + x.trabajadoMin, 0) / 60)} h</span>
                </p>
              </div>
              <div className="flex gap-2 print:hidden">
                <Button size="sm" variant="secondary" icon={<Pencil className="size-4" />} onClick={() => setCorregir(true)}>
                  Corregir
                </Button>
                <Button size="sm" variant="secondary" icon={<Download className="size-4" />} onClick={() => exportar(actual)}>
                  Excel
                </Button>
                <Button size="sm" variant="secondary" icon={<Printer className="size-4" />} onClick={() => window.print()}>
                  Imprimir
                </Button>
              </div>
            </div>
            {dias.length === 0 ? (
              <p className="px-4 py-4 text-sm text-muted sm:px-5">Sin fichajes este mes.</p>
            ) : (
              [...dias].reverse().map((d) => (
                <div key={d.dia} className="px-4 py-3 sm:px-5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium">{fecha(d.dia)}</p>
                    <p className="num font-medium">{duracion(d.trabajadoMin)}</p>
                  </div>
                  <p className="num text-sm text-muted">
                    {d.fichajes.map((f) => `${NOMBRE_TIPO[f.tipo]} ${hora(f.momento)}${f.origen === 'correccion' ? ' (corregido)' : ''}`).join(' · ')}
                    {d.abierto ? ' · sin cerrar' : ''}
                  </p>
                </div>
              ))
            )}
          </Card>
        )
      )}

      {sel && ownerId && (
        <ModalCorreccion
          admin
          open={corregir}
          onClose={() => setCorregir(false)}
          cuenta={ownerId}
          trabajadorId={sel}
          fichajes={porTrab.get(sel) ?? []}
          onHecho={() => {
            setCorregir(false)
            cargar()
          }}
        />
      )}
    </>
  )
}
