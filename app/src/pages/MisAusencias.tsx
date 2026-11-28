import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarCheck, CalendarDays, Stethoscope, Umbrella } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { enDemo } from '../lib/demoFichaje'
import { saldoVacaciones, type Ausencia, type TipoAusencia } from '../lib/ausencias'
import { cargarAusencias } from '../lib/ausenciasApi'
import type { Trabajador } from '../lib/types'
import { AvisoCalendario, FilaAusencia, ModalAusencia, TarjetaSaldo, hoyIso, useCalendario } from '../components/Ausencias'
import { Button, Card, Empty, Loading } from '../components/ui'

/** Mi espacio → Ausencias: saldo de vacaciones, pedir vacaciones o permisos, comunicar una baja */
export default function MisAusencias({ ficha }: { ficha: Trabajador | null }) {
  const { ownerId, owner } = useAuth()
  const demo = enDemo()
  const t = demo ? ({ id: 'd1', nombre: 'Laura Gómez', fecha_inicio: '2025-03-01', vacaciones_dias: 23, centro_id: null } as unknown as Trabajador) : ficha
  const cal = useCalendario(ownerId, owner, t?.centro_id)
  const [ausencias, setAusencias] = useState<Ausencia[] | null>(null)
  const [pedir, setPedir] = useState<TipoAusencia | null>(null)

  const cargar = useCallback(async () => {
    if (!ownerId || !t) return setAusencias([])
    setAusencias(await cargarAusencias(ownerId, t.id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerId, t?.id])

  useEffect(() => {
    cargar()
  }, [cargar])

  const hoy = hoyIso()
  const anio = Number(hoy.slice(0, 4))
  const saldo = useMemo(() => (t && ausencias ? saldoVacaciones(t, ausencias, anio, cal.festivos, hoy) : null), [t, ausencias, anio, cal.festivos, hoy])

  if (!t) {
    return (
      <Card className="p-5 sm:p-6">
        <p className="text-sm text-muted">Tu usuario aún no está vinculado a tu ficha de trabajador. Pídeselo a la empresa para pedir vacaciones aquí.</p>
      </Card>
    )
  }
  if (!ausencias || !saldo || !ownerId) return <Loading />

  // Arriba lo que está por venir o pendiente; abajo el historial
  const activas = ausencias.filter((a) => (a.estado === 'pendiente' || a.estado === 'aprobada') && (a.hasta ?? '9999') >= hoy)
  const pasadas = ausencias.filter((a) => !activas.includes(a))
  const proximosFestivos = [...cal.festivos.entries()].filter(([f]) => f >= hoy).sort(([a], [b]) => a.localeCompare(b)).slice(0, 4)

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.2fr] lg:items-start">
      <div className="space-y-4">
        <AvisoCalendario comunidad={cal.comunidad} anio={anio} />
        <TarjetaSaldo saldo={saldo} />
        {/* En fila solo cuando cada botón cabe entero (móvil y columna estrecha del ordenador: uno debajo de otro) */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-1">
          <Button className="w-full" icon={<Umbrella className="size-4" />} onClick={() => setPedir('vacaciones')}>
            Pedir vacaciones
          </Button>
          <Button className="w-full" variant="secondary" icon={<CalendarCheck className="size-4" />} onClick={() => setPedir('permiso')}>
            Pedir un permiso
          </Button>
          <Button className="w-full" variant="secondary" icon={<Stethoscope className="size-4" />} onClick={() => setPedir('baja')}>
            Comunicar una baja
          </Button>
        </div>
        {proximosFestivos.length > 0 && (
          <Card className="p-5 sm:p-6">
            <h2 className="flex items-center gap-2 font-semibold">
              <CalendarDays className="size-4" /> Próximos festivos
            </h2>
            <ul className="mt-2 divide-y divide-line text-sm">
              {proximosFestivos.map(([f, n]) => (
                <li key={f} className="flex justify-between gap-3 py-2">
                  <span>{n}</span>
                  <span className="num shrink-0 text-muted">{new Date(f + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      <div className="space-y-4">
        <Card className="divide-y divide-line">
          <h2 className="px-4 py-3 font-semibold sm:px-5">Pedidas y próximas</h2>
          {activas.length === 0 ? (
            <Empty icon={<Umbrella className="size-5" />} title="Nada pendiente" text="Cuando pidas vacaciones o un permiso, lo verás aquí con su estado." />
          ) : (
            activas.map((a) => <FilaAusencia key={a.id} a={a} admin={false} festivos={cal.festivos} onCambio={cargar} />)
          )}
        </Card>
        {pasadas.length > 0 && (
          <Card className="divide-y divide-line">
            <h2 className="px-4 py-3 font-semibold sm:px-5">Historial</h2>
            {pasadas.map((a) => (
              <FilaAusencia key={a.id} a={a} admin={false} festivos={cal.festivos} onCambio={cargar} />
            ))}
          </Card>
        )}
      </div>

      <ModalAusencia
        open={pedir !== null}
        onClose={() => setPedir(null)}
        cuenta={ownerId}
        trabajadores={[{ id: t.id, nombre: t.nombre }]}
        trabajadorInicial={t.id}
        tipoInicial={pedir ?? 'vacaciones'}
        admin={false}
        festivos={cal.festivos}
        saldoDe={(_, y) => (y === anio ? saldo : saldoVacaciones(t, ausencias, y, cal.festivos, hoy))}
        onHecho={() => {
          setPedir(null)
          cargar()
        }}
      />
    </div>
  )
}
