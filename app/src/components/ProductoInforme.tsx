import { useMemo, useState, type ReactNode } from 'react'
import { Pencil, SlidersHorizontal } from 'lucide-react'
import { MESES_CORTOS, eur, fecha, num } from '../lib/format'
import { TIPOS_EXISTENCIA, informeProducto, margen, type Movimiento, type Producto } from '../lib/inventario.ts'
import { Badge, Button, Card, Modal, cx } from './ui'

const cant = (n: number) => num(n, Number.isInteger(n) ? 0 : 3)

/**
 * Informe de un producto (Contabilidad → Inventario → clic en un producto): stock y su valor,
 * valor de venta, vendido este mes, margen, gráfico de stock de los últimos 12 meses,
 * precio de venta con IVA y margen, margen real de lo vendido, compras y compradores.
 */
export default function ProductoInforme({
  producto: p,
  movs,
  corte,
  movimientos,
  onClose,
  onEditar,
  onAjustar,
}: {
  producto: Producto
  movs: Movimiento[]
  corte: string
  /** Lista de movimientos (la de la pestaña Inventario) */
  movimientos: ReactNode
  onClose: () => void
  onEditar: () => void
  onAjustar: () => void
}) {
  const inf = useMemo(() => informeProducto(movs, p.id, corte), [movs, p.id, corte])
  const { estado } = inf
  const precio = Number(p.precio_venta ?? 0)
  const iva = Number(p.iva ?? 21)
  const m = margen(precio, estado.coste)
  const stockVendible = Math.max(estado.cantidad, 0)
  const valorVenta = precio * stockVendible

  const mesActual = corte.slice(0, 7)
  const delMes = inf.ventas.filter((v) => v.fecha.slice(0, 7) === mesActual)
  const anio = corte.slice(0, 4)
  const delAnio = inf.ventas.filter((v) => v.fecha.slice(0, 4) === anio)
  const ventasAnio = delAnio.reduce((s, v) => s + v.importe, 0)
  const costeAnio = delAnio.reduce((s, v) => s + v.coste, 0)
  const uds = (xs: { cantidad: number }[]) => xs.reduce((s, v) => s + v.cantidad, 0)

  // Compradores: unidades e importe por cliente, de más a menos
  const compradores = useMemo(() => {
    const acc = new Map<string, { cantidad: number; importe: number }>()
    for (const v of inf.ventas) {
      const x = acc.get(v.cliente) ?? { cantidad: 0, importe: 0 }
      acc.set(v.cliente, { cantidad: x.cantidad + v.cantidad, importe: x.importe + v.importe })
    }
    return [...acc.entries()].sort((a, b) => b[1].importe - a[1].importe)
  }, [inf.ventas])

  return (
    <Modal open wide onClose={onClose} title={p.nombre}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          {p.referencia && <Badge>{p.referencia}</Badge>}
          <Badge>{TIPOS_EXISTENCIA.find((t) => t.id === p.tipo)?.nombre.split(' (')[0]}</Badge>
          {!p.activo && <Badge tono="ambar">Archivado</Badge>}
          <div className="ml-auto flex gap-2">
            <Button variant="secondary" size="sm" icon={<SlidersHorizontal className="size-4" />} onClick={onAjustar}>
              Ajustar stock
            </Button>
            <Button variant="secondary" size="sm" icon={<Pencil className="size-4" />} onClick={onEditar}>
              Editar
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile titulo="Total stock" valor={`${cant(estado.cantidad)} ${p.unidad}`} nota={`Coste total ${eur(estado.valor)}`} tono={estado.cantidad < 0 ? 'mal' : undefined} />
          <Tile
            titulo="Valor de venta"
            valor={precio ? eur(valorVenta) : '—'}
            nota={precio ? `Si vendes todo a ${eur(precio)}/${p.unidad}` : 'Pon el precio de venta'}
          />
          <Tile titulo="Vendido este mes" valor={`${cant(uds(delMes))} ${p.unidad}`} nota={eur(delMes.reduce((s, v) => s + v.importe, 0))} />
          <Tile
            titulo="Margen"
            valor={m ? `${num(m.pct, 1)}%` : '—'}
            nota={m ? `${eur(m.euros)} por ${p.unidad}` : 'Falta el precio de venta'}
            tono={m && m.euros < 0 ? 'mal' : undefined}
          />
        </div>

        <section>
          <h3 className="mb-2 font-semibold">Gráfico de stock</h3>
          <Card className="p-4">
            <GraficoStock serie={inf.serie} unidad={p.unidad} />
          </Card>
        </section>

        <section>
          <h3 className="mb-2 font-semibold">Precio de venta</h3>
          {/* Móvil: lista, sin desplazar a la derecha */}
          <Card className="divide-y divide-line text-sm sm:hidden">
            {(
              [
                ['Precio sin IVA', precio ? eur(precio) : '—'],
                [`IVA ${num(iva, 0)}%`, precio ? eur((precio * iva) / 100) : '—'],
                ['Precio con IVA', precio ? eur(precio * (1 + iva / 100)) : '—'],
                ['Coste medio', eur(estado.coste)],
                ['Margen', m ? `${num(m.pct, 1)}% · ${eur(m.euros)}` : '—'],
                ...(inf.ultimoCoste !== null ? [['Último precio de compra', eur(inf.ultimoCoste)]] : []),
              ] as [string, string][]
            ).map(([k, v]) => (
              <div key={k} className="num flex justify-between gap-3 px-4 py-2.5">
                <span className="text-muted">{k}</span>
                <span className={cx('font-medium', k === 'Margen' && m && m.euros < 0 && 'text-rojo')}>{v}</span>
              </div>
            ))}
            {!precio && (
              <button className="w-full px-4 py-3 text-left font-medium underline underline-offset-2" onClick={onEditar}>
                Poner precio de venta
              </button>
            )}
          </Card>
          <Card className="hidden overflow-x-auto sm:block">
            <table className="num w-full min-w-[560px] text-sm">
              <thead className="border-b border-line bg-paper text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">Tarifa</th>
                  <th className="px-4 py-2.5 text-right font-medium">Sin IVA</th>
                  <th className="px-4 py-2.5 text-right font-medium">IVA</th>
                  <th className="px-4 py-2.5 text-right font-medium">Total</th>
                  <th className="px-4 py-2.5 text-right font-medium">Coste medio</th>
                  <th className="px-4 py-2.5 text-right font-medium">Margen</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="px-4 py-3 font-medium">Precio de venta</td>
                  {precio ? (
                    <>
                      <td className="px-4 py-3 text-right">{eur(precio)}</td>
                      <td className="px-4 py-3 text-right text-muted">
                        {eur((precio * iva) / 100)} · {num(iva, 0)}%
                      </td>
                      <td className="px-4 py-3 text-right font-medium">{eur(precio * (1 + iva / 100))}</td>
                    </>
                  ) : (
                    <td colSpan={3} className="px-4 py-3 text-right">
                      <button className="font-medium underline underline-offset-2" onClick={onEditar}>
                        Poner precio de venta
                      </button>
                    </td>
                  )}
                  <td className="px-4 py-3 text-right">{eur(estado.coste)}</td>
                  <td className={cx('px-4 py-3 text-right font-medium', m && m.euros < 0 && 'text-rojo')}>
                    {m ? `${num(m.pct, 1)}% · ${eur(m.euros)}` : '—'}
                  </td>
                </tr>
                {inf.ultimoCoste !== null && (
                  <tr className="border-t border-line text-muted">
                    <td className="px-4 py-2.5">Último precio de compra</td>
                    <td className="px-4 py-2.5 text-right">{eur(inf.ultimoCoste)}</td>
                    <td colSpan={4} className="px-4 py-2.5 text-right text-xs">
                      {precio ? `Con este coste, el margen sería ${num(margen(precio, inf.ultimoCoste)!.pct, 1)}%` : ''}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
        </section>

        <section>
          <h3 className="mb-2 font-semibold">Margen real de lo vendido en {anio}</h3>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile titulo="Unidades vendidas" valor={`${cant(uds(delAnio))} ${p.unidad}`} />
            <Tile titulo="Ventas" valor={eur(ventasAnio)} nota="Sin IVA" />
            <Tile titulo="Coste de lo vendido" valor={eur(costeAnio)} nota="A coste medio" />
            <Tile
              titulo="Margen"
              valor={eur(ventasAnio - costeAnio)}
              nota={ventasAnio ? `${num(((ventasAnio - costeAnio) / ventasAnio) * 100, 1)}% sobre ventas` : 'Sin ventas este año'}
              tono={ventasAnio - costeAnio < 0 ? 'mal' : undefined}
            />
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <section>
            <h3 className="mb-2 font-semibold">Compradores del producto</h3>
            <Card>
              {compradores.length ? (
                <ul className="divide-y divide-line text-sm">
                  {compradores.slice(0, 8).map(([cliente, x]) => (
                    <li key={cliente} className="num flex items-center justify-between gap-3 px-4 py-2.5">
                      <span className="min-w-0 truncate font-medium">{cliente}</span>
                      <span className="shrink-0 text-right">
                        {eur(x.importe)} <span className="text-muted">· {cant(x.cantidad)} {p.unidad}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-4 py-4 text-sm text-muted">Todavía no hay ventas de este producto.</p>
              )}
            </Card>
          </section>
          <section>
            <h3 className="mb-2 font-semibold">Histórico de compras</h3>
            <Card>
              {inf.compras.length ? (
                <ul className="divide-y divide-line text-sm">
                  {[...inf.compras].reverse().slice(0, 8).map((c, i) => (
                    <li key={i} className="num flex items-center justify-between gap-3 px-4 py-2.5">
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{c.proveedor}</span>
                        <span className="text-xs text-muted">
                          {fecha(c.fecha)} · {c.documento}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        {eur(c.coste)}/{p.unidad} <span className="text-muted">· {cant(c.cantidad)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-4 py-4 text-sm text-muted">Todavía no hay compras de este producto.</p>
              )}
            </Card>
          </section>
        </div>

        <section>
          <h3 className="mb-2 font-semibold">Movimientos de stock</h3>
          <Card className="p-4">{movimientos}</Card>
        </section>
      </div>
    </Modal>
  )
}

function Tile({ titulo, valor, nota, tono }: { titulo: string; valor: string; nota?: string; tono?: 'mal' }) {
  return (
    <Card className="p-4">
      <p className="text-sm text-muted">{titulo}</p>
      <p className={cx('num mt-1 text-xl font-semibold', tono === 'mal' && 'text-rojo')}>{valor}</p>
      {nota && <p className="mt-1 text-xs text-muted">{nota}</p>}
    </Card>
  )
}

/** Stock a final de cada mes (una serie: sin leyenda), con línea fina, rejilla discreta y detalle al pasar el ratón */
function GraficoStock({ serie, unidad }: { serie: { mes: string; cantidad: number; valor: number }[]; unidad: string }) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 640
  const H = 200
  const pad = { l: 44, r: 12, t: 12, b: 26 }
  const max = Math.max(1, ...serie.map((s) => s.cantidad))
  const min = Math.min(0, ...serie.map((s) => s.cantidad))
  // Escala «bonita»: 0, ½ y el máximo redondeado
  const paso = 10 ** Math.floor(Math.log10(max))
  const tope = Math.ceil(max / paso) * paso
  const x = (i: number) => pad.l + (i * (W - pad.l - pad.r)) / (serie.length - 1)
  const y = (v: number) => pad.t + ((tope - v) * (H - pad.t - pad.b)) / (tope - min || 1)
  const linea = serie.map((s, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(s.cantidad).toFixed(1)}`).join(' ')
  const area = `${linea} L${x(serie.length - 1).toFixed(1)},${y(Math.max(min, 0)).toFixed(1)} L${x(0).toFixed(1)},${y(Math.max(min, 0)).toFixed(1)} Z`
  const marcas = [0, tope / 2, tope]
  const h = hover !== null ? serie[hover] : null

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label="Stock a final de cada mes">
        {marcas.map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} className="stroke-line" strokeWidth={1} />
            <text x={pad.l - 8} y={y(v)} textAnchor="end" dominantBaseline="middle" className="fill-muted text-[11px]">
              {num(v, 0)}
            </text>
          </g>
        ))}
        <path d={area} className="fill-lima/40" />
        <path d={linea} fill="none" className="stroke-ink" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {serie.map((s, i) => (
          <text key={s.mes} x={x(i)} y={H - 8} textAnchor="middle" className={cx('text-[11px]', hover === i ? 'fill-ink' : 'fill-muted')}>
            {MESES_CORTOS[Number(s.mes.slice(5, 7)) - 1]}
          </text>
        ))}
        {hover !== null && (
          <>
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} className="stroke-ink/30" strokeWidth={1} />
            <circle cx={x(hover)} cy={y(serie[hover].cantidad)} r={5} className="fill-ink stroke-white" strokeWidth={2} />
          </>
        )}
        {/* Zonas para el ratón, más anchas que la marca */}
        {serie.map((s, i) => (
          <rect
            key={s.mes}
            x={x(i) - (W - pad.l - pad.r) / (serie.length - 1) / 2}
            y={0}
            width={(W - pad.l - pad.r) / (serie.length - 1)}
            height={H}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
      </svg>
      {h && hover !== null && (
        <div
          className="num pointer-events-none absolute top-0 -translate-x-1/2 rounded-lg bg-ink px-2.5 py-1.5 text-xs text-white shadow"
          style={{ left: `${(x(hover) / W) * 100}%` }}
        >
          <p className="font-medium">
            {MESES_CORTOS[Number(h.mes.slice(5, 7)) - 1]} {h.mes.slice(0, 4)}
          </p>
          <p>
            {cant(h.cantidad)} {unidad} · {eur(h.valor)}
          </p>
        </div>
      )}
    </div>
  )
}
