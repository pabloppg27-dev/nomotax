import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Bell, CheckCircle2, FileWarning, Inbox, PhoneCall, Receipt, TrendingUp, UserPlus, Percent, Stethoscope } from 'lucide-react'
import { useAuth } from '../../lib/auth'
import { errorMessage, supabase } from '../../lib/supabase'
import { eur, fecha, num } from '../../lib/format'
import { ESTADOS_TRABAJADOR, diasHabilesHasta } from '../../lib/laboral'
import { diasHasta } from '../../lib/impuestos'
import { ASESOR } from '../../lib/asesor'
import { TIPOS_PETICION, avisarBandeja, cargarBandeja, totalBandeja, type Bandeja } from '../../lib/bandeja'
import { SUBTIPOS_BAJA } from '../../lib/ausencias'
import { Badge, Button, Card, Empty, Loading, PageHeader, cx, notify } from '../../components/ui'

const fCita = (iso: string) =>
  new Date(iso).toLocaleString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/** Hace cuánto: «hoy», «ayer», «hace 3 días» */
function hace(iso: string): string {
  const d = -diasHasta(iso.slice(0, 10))
  return d <= 0 ? 'hoy' : d === 1 ? 'ayer' : `hace ${d} días`
}

export default function BandejaAsesor() {
  const { me, setOwner } = useAuth()
  const navigate = useNavigate()
  const [b, setB] = useState<Bandeja | null>(null)

  const cargar = useCallback(async () => {
    setB(await cargarBandeja())
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  /** Entrar en la cuenta del cliente e ir a esa página */
  const ir = async (ownerId: string, ruta: string) => {
    await setOwner(ownerId === me?.id ? null : ownerId)
    navigate(ruta)
  }

  const hecha = async (tabla: 'llamadas' | 'peticiones', id: string) => {
    const cambios = tabla === 'peticiones' ? { estado: 'hecha', resuelta_at: new Date().toISOString() } : { estado: 'hecha' }
    const { error } = await supabase.from(tabla).update(cambios).eq('id', id)
    if (error) return notify(await errorMessage(error), 'error')
    notify('Hecho')
    avisarBandeja()
    cargar()
  }

  const marcarBajaVista = async (id: string) => {
    const { error } = await supabase.rpc('baja_vista', { p_id: id })
    if (error) return notify(await errorMessage(error), 'error')
    avisarBandeja()
    cargar()
  }

  if (!b) return <Loading />
  const nombre = (id: string) => (id === me?.id ? 'NomoTax' : b.nombres.get(id) ?? 'Cliente')
  const total = totalBandeja(b)

  const resumen = [
    { n: b.notificaciones.length, label: 'Plazos de Hacienda', id: 'plazos' },
    { n: b.peticiones.length, label: 'Peticiones', id: 'peticiones' },
    { n: b.llamadas.length, label: 'Llamadas', id: 'llamadas' },
    { n: b.altas.length + b.irpf.length + b.bajas.length, label: 'Laboral', id: 'laboral' },
    { n: b.gastos.length + b.amortizables.length, label: 'Gastos', id: 'gastos' },
  ]

  return (
    <>
      <PageHeader
        title="Bandeja"
        subtitle={total ? `Hola, ${ASESOR.corto}. Tienes ${total} cosa${total === 1 ? '' : 's'} pendiente${total === 1 ? '' : 's'} en tus clientes.` : 'Lo que te piden y tienes pendiente en todos tus clientes.'}
      />

      {total === 0 ? (
        <Card>
          <Empty icon={<CheckCircle2 className="size-5" />} title="Todo al día" text="Cuando un cliente te pida algo, suba gastos o tenga un plazo de Hacienda, aparecerá aquí." />
        </Card>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {resumen.map((r) => (
              <a
                key={r.id}
                href={`#${r.id}`}
                className={cx('rounded-2xl px-4 py-3 transition-colors', r.n ? 'bg-white shadow-[0_0_0_1px_var(--color-line)] hover:bg-lima/30' : 'bg-ink/[0.03] text-muted')}
              >
                <span className="num block text-2xl font-semibold">{r.n}</span>
                <span className="text-sm">{r.label}</span>
              </a>
            ))}
          </div>

          <Seccion id="plazos" icon={<FileWarning className="size-4" />} titulo="Plazos de Hacienda y notificaciones" n={b.notificaciones.length} tono="rojo">
            {b.notificaciones.map((d) => {
              const dias = diasHasta(d.fecha_limite)
              return (
                <Fila key={d.id} onClick={() => ir(d.owner_id, '/impuestos')} titulo={d.titulo} detalle={`${nombre(d.owner_id)}${d.organismo ? ` · ${d.organismo}` : ''}`}>
                  <span className={cx('text-sm', dias <= 5 ? 'font-medium text-rojo' : 'text-muted')}>
                    {dias < 0 ? `Venció el ${fecha(d.fecha_limite)}` : dias === 0 ? 'Vence hoy' : `Vence el ${fecha(d.fecha_limite)} · ${dias} día${dias === 1 ? '' : 's'}`}
                  </span>
                </Fila>
              )
            })}
          </Seccion>

          <Seccion id="peticiones" icon={<Bell className="size-4" />} titulo="Peticiones de clientes" n={b.peticiones.length}>
            {b.peticiones.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                <button onClick={() => ir(p.owner_id, '/')} className="min-w-0 flex-1 text-left">
                  <span className="block truncate font-medium">
                    {nombre(p.owner_id)} · {TIPOS_PETICION[p.tipo] ?? p.tipo}
                  </span>
                  {p.texto && <span className="block whitespace-pre-line text-sm text-ink/80">{p.texto}</span>}
                  <span className="block text-xs text-muted">Pedido {hace(p.created_at)}</span>
                </button>
                <Button size="sm" variant="secondary" onClick={() => hecha('peticiones', p.id)}>
                  Hecha
                </Button>
              </li>
            ))}
          </Seccion>

          <Seccion id="llamadas" icon={<PhoneCall className="size-4" />} titulo="Llamadas y citas" n={b.llamadas.length}>
            {b.llamadas.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{nombre(l.owner_id)}</span>
                  <span className="block truncate text-sm text-muted">
                    {l.tipo === 'cita' && l.inicio
                      ? `Cita ${fCita(l.inicio)} · ${l.modalidad === 'meet' ? 'Google Meet' : 'llamarle'}`
                      : `Pide que le llames · ${l.franja ?? 'cuando puedas'}`}
                    {l.tema ? ` · ${l.tema}` : ''}
                  </span>
                </span>
                {l.telefono && (
                  <a href={`tel:${l.telefono.replace(/\s/g, '')}`} className="num text-sm font-medium underline">
                    {l.telefono}
                  </a>
                )}
                {l.meet_link && (
                  <a href={l.meet_link} target="_blank" rel="noreferrer" className="text-sm underline">
                    Meet
                  </a>
                )}
                <Button size="sm" variant="secondary" onClick={() => hecha('llamadas', l.id)}>
                  Hecha
                </Button>
              </li>
            ))}
          </Seccion>

          <Seccion id="laboral" icon={<UserPlus className="size-4" />} titulo="Laboral: altas, bajas médicas y cambios de IRPF" n={b.altas.length + b.irpf.length + b.bajas.length}>
            {b.altas.map((a) => {
              const dias = diasHabilesHasta(a.fecha_inicio)
              const est = ESTADOS_TRABAJADOR[a.estado]
              return (
                <Fila key={a.id} onClick={() => ir(a.owner_id, `/laboral/trabajadores/${a.id}`)} titulo={`Alta de ${a.nombre}`} detalle={nombre(a.owner_id)}>
                  <span className={cx('text-sm', dias < 3 ? 'font-medium text-rojo' : 'text-muted')}>
                    Empieza el {fecha(a.fecha_inicio)}
                    {dias < 3 ? ` · ${dias <= 0 ? '¡ya!' : `${dias} día${dias === 1 ? '' : 's'} hábil${dias === 1 ? '' : 'es'}`}` : ''}
                  </span>
                  <Badge tono={est.tono}>{est.label}</Badge>
                </Fila>
              )
            })}
            {b.bajas.map((x) => (
              <Fila
                key={x.id}
                onClick={() => ir(x.owner_id, '/laboral/ausencias')}
                titulo={`Baja de ${x.trabajador?.nombre ?? 'un trabajador'}`}
                detalle={`${nombre(x.owner_id)} · ${SUBTIPOS_BAJA.find((t) => t.id === x.subtipo)?.nombre ?? 'Baja'}`}
                icono={<Stethoscope className="size-4 text-muted" />}
              >
                <span className="num text-sm">
                  Desde el {fecha(x.desde)}
                  {x.hasta ? ` hasta el ${fecha(x.hasta)}` : ' · sin alta'}
                </span>
                {/* Dentro del botón de la fila: no puede ser otro <button> */}
                <span
                  role="button"
                  tabIndex={0}
                  className="inline-flex h-8 items-center rounded-full border border-line bg-white px-3 text-sm font-medium hover:border-ink/30"
                  onClick={(e) => {
                    e.stopPropagation()
                    marcarBajaVista(x.id)
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter' && e.key !== ' ') return
                    e.preventDefault()
                    e.stopPropagation()
                    marcarBajaVista(x.id)
                  }}
                >
                  Ya la tengo en cuenta
                </span>
              </Fila>
            ))}
            {b.irpf.map((s) => (
              <Fila
                key={s.id}
                onClick={() => ir(s.owner_id, `/laboral/trabajadores/${s.trabajador_id}`)}
                titulo={`${s.trabajador?.nombre ?? 'Trabajador'} pide más retención`}
                detalle={`${nombre(s.owner_id)}${s.comentario ? ` · ${s.comentario}` : ''}`}
                icono={<Percent className="size-4 text-muted" />}
              >
                <span className="num text-sm">
                  {s.pct_actual !== null ? `${num(s.pct_actual)}% → ` : ''}
                  <strong>{num(s.pct_solicitado)}%</strong> desde {s.desde.split('-').reverse().join('/')}
                </span>
              </Fila>
            ))}
          </Seccion>

          <Seccion id="gastos" icon={<Receipt className="size-4" />} titulo="Gastos por revisar" n={b.gastos.length + b.amortizables.length}>
            {b.gastos.map((g) => (
              <Fila key={g.owner_id} onClick={() => ir(g.owner_id, '/gastos')} titulo={nombre(g.owner_id)} detalle={`El más antiguo, subido ${hace(g.desde)}`}>
                <Badge tono="lima">
                  {g.cuantos} gasto{g.cuantos === 1 ? '' : 's'}
                </Badge>
              </Fila>
            ))}
            {b.amortizables.map((a) => (
              <Fila
                key={a.id}
                onClick={() => ir(a.owner_id, `/gastos?revisar=${a.id}`)}
                titulo={`¿Inversión? ${a.concepto || a.proveedor || 'Gasto'}`}
                detalle={`${nombre(a.owner_id)}${a.proveedor ? ` · ${a.proveedor}` : ''} · ${fecha(a.fecha)}`}
                icono={<TrendingUp className="size-4 text-muted" />}
              >
                <span className="num font-medium">{eur(a.base)}</span>
              </Fila>
            ))}
          </Seccion>
        </>
      )}

    </>
  )
}

function Seccion({ id, icon, titulo, n, tono, children }: { id: string; icon: ReactNode; titulo: string; n: number; tono?: 'rojo'; children: ReactNode }) {
  if (!n) return null
  return (
    <Card className="mb-6 overflow-hidden" guia={id}>
      <div id={id} className={cx('flex scroll-mt-24 items-center gap-2 border-b border-line px-4 py-3', tono === 'rojo' ? 'bg-rojo/5' : 'bg-lima/30')}>
        {icon ?? <Inbox className="size-4" />}
        <h2 className="font-semibold">
          {titulo} ({n})
        </h2>
      </div>
      <ul className="divide-y divide-line">{children}</ul>
    </Card>
  )
}

function Fila({ onClick, titulo, detalle, icono, children }: { onClick: () => void; titulo: string; detalle: string; icono?: ReactNode; children?: ReactNode }) {
  return (
    <li>
      <button onClick={onClick} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left hover:bg-paper">
        {icono}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{titulo}</span>
          <span className="block truncate text-sm text-muted">{detalle}</span>
        </span>
        {children}
        <ArrowRight className="size-4 text-muted" />
      </button>
    </li>
  )
}
