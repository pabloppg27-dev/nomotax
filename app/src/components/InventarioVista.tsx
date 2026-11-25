import { Fragment, useMemo, useState, type ReactNode } from 'react'
import { AlertTriangle, BarChart3, Boxes, ClipboardCheck, Pencil, Plus, SlidersHorizontal } from 'lucide-react'
import { errorMessage, supabase } from '../lib/supabase'
import { eur, fecha, hoyISO, num } from '../lib/format'
import type { DatosContables } from '../lib/contabilidad.ts'
import {
  MOTIVOS_AJUSTE,
  PERIODOS_EXISTENCIAS,
  TIPOS_EXISTENCIA,
  aplicar,
  movimientosStock,
  margen,
  stockA,
  type EstadoProducto,
  type MotivoAjuste,
  type Movimiento,
  type PeriodoExistencias,
  type Producto,
  type TipoExistencia,
} from '../lib/inventario.ts'
import { TIPOS_IVA } from '../lib/totals'
import NumInput from './NumInput'
import ProductoInforme from './ProductoInforme'
import SelectBuscable from './SelectBuscable'
import { Badge, Button, Card, Empty, Field, Input, Modal, Select, confirmar, cx, notify } from './ui'

const VACIO: EstadoProducto = { cantidad: 0, coste: 0, valor: 0 }

/**
 * Contabilidad → Inventario. Stock y valor de cada referencia a la fecha del periodo elegido,
 * con sus movimientos (compras, ventas, ajustes). El asiento de variación de existencias lo hace
 * solo el motor contable al cierre de cada periodo.
 */
export default function InventarioVista({
  datos,
  ownerId,
  isAdvisor,
  hasta,
  onChanged,
}: {
  datos: DatosContables
  ownerId: string
  isAdvisor: boolean
  hasta: string
  onChanged: () => void
}) {
  const inv = datos.inventario
  const corte = hasta < hoyISO() ? hasta : hoyISO()
  const [abierto, setAbierto] = useState<string | null>(null)
  const [producto, setProducto] = useState<Partial<Producto> | null>(null)
  const [ajuste, setAjuste] = useState<{ producto_id?: string } | null>(null)
  const [recuento, setRecuento] = useState(false)
  const [verArchivados, setVerArchivados] = useState(false)
  const [informe, setInforme] = useState<Producto | null>(null)

  const movs = useMemo(() => (inv ? movimientosStock(datos.gastos, datos.facturas, inv.ajustes) : []), [inv, datos.gastos, datos.facturas])
  const stock = useMemo(() => stockA(movs, corte), [movs, corte])

  if (!inv) return null

  const productos = inv.productos.filter((p) => p.activo || verArchivados)
  const total = [...stock.values()].reduce((s, e) => s + e.valor, 0)
  const valorVenta = inv.productos.reduce((s, p) => s + Math.max(stock.get(p.id)?.cantidad ?? 0, 0) * Number(p.precio_venta ?? 0), 0)
  const negativos = inv.productos.filter((p) => (stock.get(p.id)?.cantidad ?? 0) < 0)
  const compras = datos.gastos.filter((g) => g.categoria === 'compras')
  const pendientes = compras.filter((g) => g.estado === 'pendiente').length
  const sinLineas = compras.filter((g) => g.estado === 'revisado' && !g.lineas?.some((l) => l.producto_id)).length

  const cambiarPeriodo = async (periodo: PeriodoExistencias) => {
    const { error } = await supabase.from('profiles').update({ existencias_periodo: periodo }).eq('id', ownerId)
    if (error) return notify(await errorMessage(error), 'error')
    notify('Guardado: la contabilidad se recalcula')
    onChanged()
  }

  const acciones = (
    <div className="flex flex-wrap gap-2">
      <Button icon={<Plus className="size-4" />} onClick={() => setProducto({ tipo: 'mercaderias', unidad: 'ud' })}>
        Nuevo producto
      </Button>
      <Button variant="secondary" icon={<SlidersHorizontal className="size-4" />} disabled={!inv.productos.length} onClick={() => setAjuste({})}>
        Stock inicial o ajuste
      </Button>
      <Button variant="secondary" icon={<ClipboardCheck className="size-4" />} disabled={!inv.productos.length} onClick={() => setRecuento(true)}>
        Hacer recuento
      </Button>
    </div>
  )

  const modales = (
    <>
      {producto && (
        <ProductoModal
          ownerId={ownerId}
          producto={producto}
          tieneMovimientos={Boolean(producto.id && movs.some((m) => m.producto_id === producto.id))}
          costeActual={producto.id && stock.get(producto.id) ? stock.get(producto.id)!.coste : null}
          onClose={() => setProducto(null)}
          onSaved={onChanged}
        />
      )}
      {ajuste && <AjusteModal ownerId={ownerId} productos={inv.productos} inicial={ajuste.producto_id} stock={stock} onClose={() => setAjuste(null)} onSaved={onChanged} />}
      {informe && (
        <ProductoInforme
          producto={inv.productos.find((p) => p.id === informe.id) ?? informe}
          movs={movs}
          corte={corte}
          movimientos={<Movimientos movs={movs.filter((m) => m.producto_id === informe.id && m.fecha <= corte)} unidad={informe.unidad} />}
          onClose={() => setInforme(null)}
          onEditar={() => {
            setProducto(informe)
            setInforme(null)
          }}
          onAjustar={() => {
            setAjuste({ producto_id: informe.id })
            setInforme(null)
          }}
        />
      )}
      {recuento && <RecuentoModal ownerId={ownerId} productos={inv.productos.filter((p) => p.activo)} movs={movs} onClose={() => setRecuento(false)} onSaved={onChanged} />}
    </>
  )

  if (!inv.productos.length)
    return (
      <Card>
        <Empty
          icon={<Boxes className="size-5" />}
          title="Todavía no hay productos"
          text="Sube tus facturas de compra en Gastos: se leen sus líneas y cada referencia se da de alta sola. También puedes crear productos y cargar el stock inicial a mano."
          action={acciones}
        />
        {modales}
      </Card>
    )

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-sm text-muted">Existencias a {fecha(corte)}</p>
          <p className="num mt-1 text-xl font-semibold">{eur(total)}</p>
          <p className="mt-1 text-xs text-muted">
            A coste medio de compra{valorVenta ? ` · valor de venta ${eur(valorVenta)}` : ''}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted">Referencias</p>
          <p className="num mt-1 text-xl font-semibold">{inv.productos.filter((p) => p.activo).length}</p>
          <p className="mt-1 text-xs text-muted">{[...stock.values()].filter((e) => e.cantidad > 0).length} con stock</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted">Asiento de variación de existencias</p>
          {isAdvisor ? (
            <Select className="mt-1" value={inv.periodo} onChange={(e) => cambiarPeriodo(e.target.value as PeriodoExistencias)}>
              {PERIODOS_EXISTENCIAS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </Select>
          ) : (
            <p className="mt-1 text-xl font-semibold">{PERIODOS_EXISTENCIAS.find((p) => p.id === inv.periodo)?.nombre}</p>
          )}
          <p className="mt-1 text-xs text-muted">
            {inv.periodo === 'momento'
              ? 'Con cada compra, venta o ajuste: el PyG y el balance, siempre al día.'
              : inv.periodo === 'no'
                ? 'El stock se lleva, pero no pasa a la contabilidad.'
                : 'Al cerrar cada periodo, el valor del almacén pasa a la contabilidad.'}
          </p>
        </Card>
      </div>

      {acciones}

      {(pendientes > 0 || sinLineas > 0 || negativos.length > 0) && (
        <div className="space-y-2">
          {pendientes > 0 && (
            <Aviso>
              {pendientes} factura{pendientes > 1 ? 's' : ''} de compra pendiente{pendientes > 1 ? 's' : ''} de confirmar en Gastos: su stock todavía no cuenta.
            </Aviso>
          )}
          {sinLineas > 0 && (
            <Aviso>
              {sinLineas} factura{sinLineas > 1 ? 's' : ''} de compra sin productos: no suman stock. Ábrela{sinLineas > 1 ? 's' : ''} en Gastos y pulsa «Leer de nuevo» o
              elige el producto de cada línea.
            </Aviso>
          )}
          {negativos.length > 0 && (
            <Aviso>
              Stock en negativo: {negativos.map((p) => p.nombre).join(', ')}. Falta alguna compra o el stock inicial; mientras, cuentan como 0€.
            </Aviso>
          )}
        </div>
      )}

      {/* Móvil: una tarjeta por producto, sin desplazar a la derecha */}
      <Card className="divide-y divide-line sm:hidden">
        {productos.map((p) => {
          const e = stock.get(p.id) ?? VACIO
          return (
            <div key={p.id}>
              <div
                role="button"
                tabIndex={0}
                className="flex cursor-pointer items-center gap-3 px-4 py-3 active:bg-paper"
                onClick={() => setAbierto(abierto === p.id ? null : p.id)}
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium leading-snug">
                    {p.nombre} {!p.activo && <Badge>Archivado</Badge>}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted">
                    {[p.referencia, TIPOS_EXISTENCIA.find((t) => t.id === p.tipo)?.nombre.split(' (')[0]].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <div className="num shrink-0 text-right">
                  <p className={cx('font-semibold', e.cantidad < 0 && 'text-rojo')}>
                    {num(e.cantidad, Number.isInteger(e.cantidad) ? 0 : 3)} {p.unidad}
                  </p>
                  <p className="text-xs text-muted">
                    {eur(e.valor)}
                    {e.cantidad ? ` · ${eur(e.coste)}/${p.unidad}` : ''}
                  </p>
                </div>
                <button
                  className="-mr-2 grid size-9 shrink-0 place-items-center rounded-full text-muted active:bg-ink/5"
                  aria-label="Editar producto"
                  onClick={(ev) => {
                    ev.stopPropagation()
                    setProducto(p)
                  }}
                >
                  <Pencil className="size-4" />
                </button>
              </div>
              {abierto === p.id && (
                <div className="bg-paper/60 px-4 py-3">
                  <Movimientos movs={movs.filter((m) => m.producto_id === p.id && m.fecha <= corte)} unidad={p.unidad} />
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button variant="secondary" size="sm" icon={<BarChart3 className="size-4" />} onClick={() => setInforme(p)}>
                      Ver informe
                    </Button>
                    <Button variant="ghost" size="sm" icon={<SlidersHorizontal className="size-4" />} onClick={() => setAjuste({ producto_id: p.id })}>
                      Ajustar stock
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
        {TIPOS_EXISTENCIA.map((t) => {
          const v = inv.productos.filter((p) => p.tipo === t.id).reduce((s, p) => s + (stock.get(p.id)?.valor ?? 0), 0)
          if (!v) return null
          return (
            <div key={t.id} className="num flex justify-between gap-3 px-4 py-2.5 text-sm text-muted">
              <span>
                {t.nombre.split(' (')[0]} · {t.cuenta}
              </span>
              <span className="font-medium text-ink">{eur(v)}</span>
            </div>
          )
        })}
      </Card>

      <Card className="hidden overflow-x-auto sm:block">
        <table className="num w-full min-w-[860px] text-left text-sm">
          <thead className="border-b border-line bg-paper text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-3 py-2.5 font-medium">Referencia</th>
              <th className="px-3 py-2.5 font-medium">Producto</th>
              <th className="px-3 py-2.5 font-medium">Tipo</th>
              <th className="px-3 py-2.5 text-right font-medium">Stock</th>
              <th className="px-3 py-2.5 text-right font-medium">Coste medio</th>
              <th className="px-3 py-2.5 text-right font-medium">Precio venta</th>
              <th className="px-3 py-2.5 text-right font-medium">Margen</th>
              <th className="px-3 py-2.5 text-right font-medium">Valor</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {productos.map((p) => {
              const e = stock.get(p.id) ?? VACIO
              return (
                <Fragment key={p.id}>
                  <tr className="cursor-pointer border-b border-line hover:bg-paper" title="Ver informe del producto" onClick={() => setInforme(p)}>
                    <td className="px-3 py-2.5 text-muted">{p.referencia || '—'}</td>
                    <td className="px-3 py-2.5 font-medium">
                      {p.nombre} {!p.activo && <Badge>Archivado</Badge>}
                    </td>
                    <td className="px-3 py-2.5 text-muted">{TIPOS_EXISTENCIA.find((t) => t.id === p.tipo)?.nombre.split(' (')[0]}</td>
                    <td className={cx('px-3 py-2.5 text-right', e.cantidad < 0 && 'text-rojo')}>
                      {num(e.cantidad, Number.isInteger(e.cantidad) ? 0 : 3)} {p.unidad}
                    </td>
                    <td className="px-3 py-2.5 text-right">{eur(e.coste)}</td>
                    <td className="px-3 py-2.5 text-right">{p.precio_venta ? eur(p.precio_venta) : <span className="text-muted">—</span>}</td>
                    <td className={cx('px-3 py-2.5 text-right', (margen(p.precio_venta, e.coste)?.euros ?? 0) < 0 && 'text-rojo')}>
                      {margen(p.precio_venta, e.coste) ? `${num(margen(p.precio_venta, e.coste)!.pct, 1)}%` : <span className="text-muted">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right font-medium">{eur(e.valor)}</td>
                    <td className="px-2 py-2.5">
                      <button
                        className="grid size-8 place-items-center rounded-full text-muted hover:bg-ink/5 hover:text-ink"
                        aria-label="Editar producto"
                        onClick={(ev) => {
                          ev.stopPropagation()
                          setProducto(p)
                        }}
                      >
                        <Pencil className="size-4" />
                      </button>
                    </td>
                  </tr>
                </Fragment>
              )
            })}
          </tbody>
          <tfoot>
            {TIPOS_EXISTENCIA.map((t) => {
              const v = inv.productos.filter((p) => p.tipo === t.id).reduce((s, p) => s + (stock.get(p.id)?.valor ?? 0), 0)
              if (!v) return null
              return (
                <tr key={t.id} className="text-muted">
                  <td colSpan={7} className="px-3 py-2 text-right">
                    {t.nombre.split(' (')[0]} · cuenta {t.cuenta}
                  </td>
                  <td className="px-3 py-2 text-right font-medium text-ink">{eur(v)}</td>
                  <td />
                </tr>
              )
            })}
          </tfoot>
        </table>
      </Card>
      {inv.productos.some((p) => !p.activo) && (
        <button className="text-sm text-muted underline underline-offset-2" onClick={() => setVerArchivados(!verArchivados)}>
          {verArchivados ? 'Ocultar archivados' : 'Ver archivados'}
        </button>
      )}
      {modales}
    </div>
  )
}

function Aviso({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-2 rounded-xl bg-ambar/10 px-4 py-3 text-sm text-ambar">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </div>
  )
}

function Movimientos({ movs, unidad }: { movs: Movimiento[]; unidad: string }) {
  if (!movs.length) return <p className="text-sm text-muted">Sin movimientos todavía.</p>
  let e = VACIO
  const filas = movs.map((m) => {
    e = aplicar(e, m)
    return { m, e }
  })
  const n = (x: number) => num(x, Number.isInteger(x) ? 0 : 3)
  return (
    <div className="num text-sm">
      <p className="mb-2 text-xs uppercase tracking-wide text-muted">Movimientos</p>
      <ul>
        {filas.reverse().map(({ m, e }, i) => (
          <li key={i} className="flex items-start gap-3 border-b border-line/60 py-2 last:border-0">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span>{fecha(m.fecha)}</span>
                <Badge tono={m.origen === 'compra' ? 'verde' : m.origen === 'venta' ? 'gris' : 'ambar'}>
                  {m.origen === 'compra' ? 'Compra' : m.origen === 'venta' ? 'Venta' : m.documento}
                </Badge>
              </div>
              {m.origen !== 'ajuste' && m.documento && <p className="mt-0.5 truncate text-xs text-muted">{m.documento}</p>}
            </div>
            <div className="shrink-0 text-right">
              <p className={cx('font-medium', m.cantidad < 0 ? 'text-rojo' : 'text-verde')}>
                {m.cantidad > 0 ? '+' : ''}
                {n(m.cantidad)} {unidad}
                {m.coste !== null && <span className="font-normal text-muted"> a {eur(m.coste)}</span>}
              </p>
              <p className="text-xs text-muted">
                Quedan {n(e.cantidad)} · {eur(e.valor)}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ProductoModal({
  ownerId,
  producto,
  tieneMovimientos,
  costeActual,
  onClose,
  onSaved,
}: {
  ownerId: string
  producto: Partial<Producto>
  tieneMovimientos: boolean
  costeActual: number | null
  onClose: () => void
  onSaved: () => void
}) {
  const [f, setF] = useState<Partial<Producto>>(producto)
  const [guardando, setGuardando] = useState(false)
  const set = <K extends keyof Producto>(k: K, v: Producto[K]) => setF({ ...f, [k]: v })

  const guardar = async () => {
    if (!f.nombre?.trim()) return notify('Falta el nombre del producto', 'error')
    setGuardando(true)
    const fila = {
      referencia: f.referencia?.trim() || null,
      nombre: f.nombre.trim(),
      tipo: f.tipo ?? 'mercaderias',
      unidad: f.unidad?.trim() || 'ud',
      precio_venta: f.precio_venta ?? null,
      iva: f.iva ?? 21,
      activo: f.activo ?? true,
    }
    const { error } = f.id
      ? await supabase.from('productos').update(fila).eq('id', f.id)
      : await supabase.from('productos').insert({ ...fila, owner_id: ownerId })
    setGuardando(false)
    if (error) {
      const msg = await errorMessage(error)
      return notify(msg.includes('productos_referencia_uq') ? 'Ya hay un producto con esa referencia' : msg, 'error')
    }
    notify(f.id ? 'Producto guardado' : 'Producto creado')
    onSaved()
    onClose()
  }

  const borrar = async () => {
    const ok = await confirmar({ titulo: 'Eliminar producto', texto: `¿Eliminar «${f.nombre}»?`, accion: 'Eliminar', peligro: true })
    if (!ok) return
    const { error } = await supabase.from('productos').delete().eq('id', f.id!)
    if (error) return notify(await errorMessage(error), 'error')
    onSaved()
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={f.id ? 'Producto' : 'Nuevo producto'}
      footer={
        <>
          {f.id &&
            (tieneMovimientos ? (
              <Button variant="ghost" className="mr-auto" onClick={() => setF({ ...f, activo: !(f.activo ?? true) })}>
                {f.activo === false ? 'Reactivar' : 'Archivar'}
              </Button>
            ) : (
              <Button variant="ghost" className="mr-auto text-rojo" onClick={borrar}>
                Eliminar
              </Button>
            ))}
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={guardando} onClick={guardar}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Referencia" hint="Código del proveedor o el tuyo. Con él se reconocen las líneas de las facturas.">
          <Input value={f.referencia ?? ''} onChange={(e) => set('referencia', e.target.value)} />
        </Field>
        <Field label="Unidad">
          <Input value={f.unidad ?? 'ud'} onChange={(e) => set('unidad', e.target.value)} placeholder="ud, kg, l, m…" />
        </Field>
        <Field label="Nombre" className="sm:col-span-2">
          <Input value={f.nombre ?? ''} onChange={(e) => set('nombre', e.target.value)} />
        </Field>
        <Field label="Tipo de existencia" className="sm:col-span-2">
          <Select value={f.tipo ?? 'mercaderias'} onChange={(e) => set('tipo', e.target.value as TipoExistencia)}>
            {TIPOS_EXISTENCIA.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre} · {t.cuenta}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Precio de venta sin IVA" hint="Se propone al añadirlo a una factura y sirve para ver el margen.">
          <NumInput className="text-right" value={Number(f.precio_venta ?? 0)} onValue={(n) => set('precio_venta', n || null)} />
        </Field>
        <Field label="IVA de venta">
          <Select value={Number(f.iva ?? 21)} onChange={(e) => set('iva', Number(e.target.value))}>
            {TIPOS_IVA.map((t) => (
              <option key={t} value={t}>
                {t}%
              </option>
            ))}
          </Select>
        </Field>
        {Number(f.precio_venta) > 0 && costeActual !== null && (
          <p className="num text-sm text-muted sm:col-span-2">
            Con el coste medio actual ({eur(costeActual)}), el margen es{' '}
            <strong className={cx('text-ink', Number(f.precio_venta) < costeActual && 'text-rojo')}>
              {num(margen(f.precio_venta, costeActual)!.pct, 1)}% · {eur(margen(f.precio_venta, costeActual)!.euros)}
            </strong>{' '}
            por {f.unidad || 'ud'}.
          </p>
        )}
        {f.activo === false && <p className="self-end text-sm text-muted">Archivado: no sale al elegir producto.</p>}
      </div>
    </Modal>
  )
}

function AjusteModal({
  ownerId,
  productos,
  inicial,
  stock,
  onClose,
  onSaved,
}: {
  ownerId: string
  productos: Producto[]
  inicial?: string
  stock: Map<string, EstadoProducto>
  onClose: () => void
  onSaved: () => void
}) {
  const [productoId, setProductoId] = useState(inicial ?? '')
  const [fechaA, setFechaA] = useState(hoyISO())
  const [motivo, setMotivo] = useState<MotivoAjuste>(inicial && stock.get(inicial)?.cantidad ? 'ajuste' : 'inicial')
  // Unidades siempre en positivo (el teclado numérico del móvil no tiene «−»): el sentido se elige aparte
  const [cantidad, setCantidad] = useState(0)
  const [sentido, setSentido] = useState<'entra' | 'sale'>('entra')
  const [coste, setCoste] = useState(0)
  const [notas, setNotas] = useState('')
  const [guardando, setGuardando] = useState(false)
  const p = productos.find((x) => x.id === productoId)
  // El stock inicial siempre entra y la merma siempre sale; «Otro ajuste» deja elegir
  const sale = motivo === 'merma' || (motivo === 'ajuste' && sentido === 'sale')
  const unidades = Math.abs(cantidad)
  const conCoste = motivo === 'inicial' || (motivo === 'ajuste' && !sale)

  const guardar = async () => {
    if (!productoId) return notify('Elige el producto', 'error')
    if (!unidades) return notify('Pon las unidades', 'error')
    if (motivo === 'inicial' && !coste) return notify('El stock inicial necesita su coste por unidad', 'error')
    setGuardando(true)
    const { error } = await supabase.from('stock_ajustes').insert({
      owner_id: ownerId,
      producto_id: productoId,
      fecha: fechaA,
      cantidad: sale ? -unidades : unidades,
      coste_unitario: conCoste && coste ? coste : null,
      motivo,
      notas: notas.trim() || null,
    })
    setGuardando(false)
    if (error) return notify(await errorMessage(error), 'error')
    notify('Stock actualizado')
    onSaved()
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Stock inicial o ajuste"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={guardando} onClick={guardar}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Producto" className="sm:col-span-2">
          <SelectBuscable
            value={productoId}
            onChange={setProductoId}
            opciones={productos.filter((x) => x.activo).map((x) => ({ value: x.id, label: x.nombre, detalle: x.referencia ?? undefined }))}
            placeholder="Elige un producto"
            buscarPlaceholder="Buscar por nombre o referencia…"
          />
        </Field>
        <Field label="Motivo">
          <Select value={motivo} onChange={(e) => setMotivo(e.target.value as MotivoAjuste)}>
            {MOTIVOS_AJUSTE.filter((m) => m.id !== 'recuento').map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Fecha" hint={motivo === 'inicial' ? 'Normalmente, el día de la apertura (1 de enero)' : undefined}>
          <Input type="date" value={fechaA} onChange={(e) => setFechaA(e.target.value)} />
        </Field>
        {motivo === 'ajuste' && (
          // Sin <Field>: dentro de un <label> el toque se reenvía al primer botón
          <div className="sm:col-span-2">
            <span className="mb-1 block text-[13px] font-medium text-ink/80">Las unidades…</span>
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-paper p-1" role="radiogroup" aria-label="Las unidades entran o salen">
              {(
                [
                  ['entra', 'Entran (+)'],
                  ['sale', 'Salen (−)'],
                ] as const
              ).map(([id, txt]) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={sentido === id}
                  onClick={() => setSentido(id)}
                  className={cx(
                    'h-10 rounded-lg text-sm font-medium transition-colors',
                    sentido === id ? (id === 'sale' ? 'bg-white text-rojo shadow-sm' : 'bg-white text-verde shadow-sm') : 'text-muted hover:text-ink',
                  )}
                >
                  {txt}
                </button>
              ))}
            </div>
          </div>
        )}
        <Field
          label={`${motivo === 'merma' ? 'Unidades perdidas' : 'Unidades'}${p ? ` (${p.unidad})` : ''}`}
          hint={motivo === 'merma' ? 'Se restan del stock' : undefined}
        >
          <NumInput className="text-right" value={unidades} onValue={(n) => setCantidad(Math.abs(n))} />
        </Field>
        {conCoste && (
          <Field label="Coste por unidad sin IVA" hint={motivo === 'inicial' ? undefined : 'Vacío = al coste medio'}>
            <NumInput className="text-right" value={coste} onValue={setCoste} />
          </Field>
        )}
        <Field label="Notas (opcional)" className="sm:col-span-2">
          <Input value={notas} onChange={(e) => setNotas(e.target.value)} />
        </Field>
        {p && (
          <p className="text-sm text-muted sm:col-span-2">
            Stock actual: {num(stock.get(p.id)?.cantidad ?? 0, 0)} {p.unidad} a {eur(stock.get(p.id)?.coste ?? 0)}.
            {unidades > 0 && (
              <span className="font-medium text-ink">
                {' '}
                Quedarán {num((stock.get(p.id)?.cantidad ?? 0) + (sale ? -unidades : unidades), Number.isInteger(unidades) ? 0 : 3)} {p.unidad}.
              </span>
            )}
            {motivo === 'inicial' && ' El stock inicial debe cuadrar con las existencias del asiento de apertura (cuenta 300).'}
          </p>
        )}
      </div>
    </Modal>
  )
}

function RecuentoModal({
  ownerId,
  productos,
  movs,
  onClose,
  onSaved,
}: {
  ownerId: string
  productos: Producto[]
  movs: Movimiento[]
  onClose: () => void
  onSaved: () => void
}) {
  const [fechaR, setFechaR] = useState(hoyISO())
  const [contado, setContado] = useState<Record<string, number>>({})
  const [buscar, setBuscar] = useState('')
  const [guardando, setGuardando] = useState(false)
  const teorico = useMemo(() => stockA(movs, fechaR), [movs, fechaR])
  const lista = productos.filter((p) => !buscar || `${p.nombre} ${p.referencia ?? ''}`.toLowerCase().includes(buscar.toLowerCase()))
  const diferencias = productos
    .filter((p) => contado[p.id] !== undefined)
    .map((p) => ({ p, dif: Math.round((contado[p.id] - (teorico.get(p.id)?.cantidad ?? 0)) * 1000) / 1000 }))
    .filter((x) => x.dif)
  const valorDif = diferencias.reduce((s, x) => s + x.dif * (teorico.get(x.p.id)?.coste ?? 0), 0)

  const guardar = async () => {
    if (!diferencias.length) return notify('No hay diferencias con el stock teórico')
    setGuardando(true)
    const { error } = await supabase.from('stock_ajustes').insert(
      diferencias.map((x) => ({ owner_id: ownerId, producto_id: x.p.id, fecha: fechaR, cantidad: x.dif, motivo: 'recuento', notas: 'Recuento físico' })),
    )
    setGuardando(false)
    if (error) return notify(await errorMessage(error), 'error')
    notify(`Recuento guardado: ${diferencias.length} ajuste${diferencias.length > 1 ? 's' : ''}`)
    onSaved()
    onClose()
  }

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title="Recuento de inventario"
      footer={
        <>
          <span className="num mr-auto text-sm text-muted">
            {diferencias.length ? `${diferencias.length} diferencia${diferencias.length > 1 ? 's' : ''} · ${eur(valorDif)}` : 'Sin diferencias'}
          </span>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={guardando} onClick={guardar} disabled={!diferencias.length}>
            Guardar recuento
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-muted">
        Pon las unidades que hay de verdad. Solo se guarda la diferencia con el stock teórico (mermas, roturas, errores) y se valora al coste medio.
      </p>
      <div className="mb-3 grid gap-3 sm:grid-cols-2">
        <Field label="Fecha del recuento">
          <Input type="date" value={fechaR} onChange={(e) => setFechaR(e.target.value)} />
        </Field>
        <Field label="Buscar">
          <Input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Nombre o referencia" />
        </Field>
      </div>
      <div className="max-h-[50vh] overflow-y-auto rounded-xl border border-line">
        <table className="num w-full text-sm">
          <thead className="sticky top-0 border-b border-line bg-paper text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Producto</th>
              <th className="px-3 py-2 text-right font-medium">Teórico</th>
              <th className="w-32 px-3 py-2 text-right font-medium">Contado</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((p) => {
              const t = teorico.get(p.id)?.cantidad ?? 0
              const c = contado[p.id]
              return (
                <tr key={p.id} className="border-b border-line/60 last:border-0">
                  <td className="px-3 py-1.5">
                    <span className="font-medium">{p.nombre}</span>
                    {p.referencia && <span className="ml-2 text-xs text-muted">{p.referencia}</span>}
                  </td>
                  <td className="px-3 py-1.5 text-right text-muted">
                    {num(t, Number.isInteger(t) ? 0 : 3)} {p.unidad}
                  </td>
                  <td className="px-3 py-1.5">
                    <NumInput
                      aria-label={`Contado de ${p.nombre}`}
                      className={cx('!h-9 text-right', c !== undefined && c !== t && '!border-ambar')}
                      value={c ?? t}
                      onValue={(n) => setContado({ ...contado, [p.id]: n })}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Modal>
  )
}
