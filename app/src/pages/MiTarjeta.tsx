import { useCallback, useEffect, useState } from 'react'
import { CreditCard, Pause, ShoppingBag } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { errorMessage } from '../lib/supabase'
import { eur, fecha } from '../lib/format'
import { cambiarEstadoTarjeta, gastadoEsteMes, misTarjetas, type Movimiento, type Tarjeta } from '../lib/tarjetas'
import TarjetaVisual from '../components/TarjetaVisual'
import { Badge, Button, Card, Empty, Loading, PageHeader, confirmar, cx, notify } from '../components/ui'

/** «Mi tarjeta»: lo que ve la persona a la que la empresa le ha dado una tarjeta */
export default function MiTarjeta() {
  const { ownerId, me, owner } = useAuth()
  const [datos, setDatos] = useState<{ tarjetas: Tarjeta[]; movimientos: Movimiento[] } | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    if (!ownerId || !me) return
    setDatos(await misTarjetas(ownerId, me.id))
  }, [ownerId, me])

  useEffect(() => {
    cargar()
  }, [cargar])

  if (!ownerId || !me || !datos) return <Loading />
  const empresa = owner?.nombre_comercial || owner?.nombre || 'tu empresa'

  return (
    <>
      <PageHeader title="Mi tarjeta" subtitle={`La tarjeta que te ha dado ${empresa} para sus gastos.`} />
      {datos.tarjetas.length === 0 ? (
        <Card>
          <Empty icon={<CreditCard className="size-5" />} title="No tienes ninguna tarjeta" text="Cuando la empresa te dé una, aparecerá aquí con tus límites y tus compras." />
        </Card>
      ) : (
        <div className="space-y-8">
          {datos.tarjetas.map((t) => {
            const gastado = gastadoEsteMes(t.id, datos.movimientos)
            const pct = t.limite_mensual ? Math.min(100, (gastado / t.limite_mensual) * 100) : 0
            const movs = datos.movimientos.filter((m) => m.tarjeta_id === t.id)
            return (
              <section key={t.id} className="grid gap-6 md:grid-cols-[minmax(0,380px)_1fr]">
                <div className="space-y-3">
                  <TarjetaVisual titular={t.asignada_a || t.titular_nombre} alias={t.alias} ultimos4={t.ultimos4} exp_mes={t.exp_mes} exp_anio={t.exp_anio} estado={t.estado} tipo={t.tipo} />
                  <div className="px-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{t.alias}</span>
                      {t.estado !== 'activa' && <Badge tono="ambar">Congelada</Badge>}
                    </div>
                    <div className="mt-2 flex justify-between text-xs text-muted">
                      <span>Este mes: {eur(gastado)}</span>
                      <span>{t.limite_mensual === null ? 'Sin límite al mes' : `Límite ${eur(t.limite_mensual)}/mes`}</span>
                    </div>
                    {t.limite_mensual !== null && (
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink/10">
                        <div className={cx('h-full rounded-full', pct >= 90 ? 'bg-rojo' : 'bg-lima-dark')} style={{ width: `${pct}%` }} />
                      </div>
                    )}
                    {t.limite_compra != null && <p className="mt-1 text-right text-xs text-muted">Máx. {eur(t.limite_compra)} por compra</p>}
                    {t.estado === 'activa' ? (
                      <Button
                        className="mt-3"
                        size="sm"
                        variant="secondary"
                        icon={<Pause className="size-3.5" />}
                        loading={ocupado === t.id}
                        onClick={async () => {
                          const ok = await confirmar({
                            titulo: 'Congelar la tarjeta',
                            texto: 'Úsalo si la has perdido o no la reconoces. Dejará de funcionar hasta que la empresa la vuelva a activar.',
                            accion: 'Congelar',
                            peligro: true,
                          })
                          if (!ok) return
                          setOcupado(t.id)
                          try {
                            await cambiarEstadoTarjeta(ownerId, t.id, 'congelada')
                            notify('Tarjeta congelada')
                            await cargar()
                          } catch (e) {
                            notify(await errorMessage(e), 'error')
                          } finally {
                            setOcupado(null)
                          }
                        }}
                      >
                        Congelar
                      </Button>
                    ) : (
                      <p className="mt-3 text-sm text-muted">Para volver a usarla, pide a la empresa que la active.</p>
                    )}
                  </div>
                </div>
                <div>
                  <h2 className="mb-3 text-lg font-semibold">Tus compras</h2>
                  <Card>
                    {movs.length === 0 ? (
                      <Empty icon={<ShoppingBag className="size-5" />} title="Sin compras todavía" />
                    ) : (
                      <ul className="divide-y divide-line">
                        {movs.map((m) => (
                          <li key={m.id} className="flex items-center gap-3 px-4 py-3">
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-[15px] font-medium">{m.comercio ?? 'Compra'}</div>
                              <div className="truncate text-xs text-muted">
                                {fecha(m.fecha)}
                                {m.motivo ? ` · ${m.motivo}` : ''}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className={cx('num text-[15px] font-medium', m.estado === 'rechazada' && 'text-muted line-through')}>-{eur(Math.abs(m.importe))}</div>
                              {m.estado === 'rechazada' && <Badge tono="rojo">Rechazada</Badge>}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Card>
                </div>
              </section>
            )
          })}
        </div>
      )}
    </>
  )
}
