import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AlertCircle, CheckCircle2, Loader2, Receipt, Search } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { errorMessage, supabase } from '../lib/supabase'
import { enPeriodo, eur, fecha, trimestreActual, type Periodo } from '../lib/format'
import { CATEGORIAS, nombreCategoria } from '../lib/categorias'
import { necesitaRevision } from '../lib/contabilidad.ts'
import { importesDe, leerFactura, prepararArchivo, subirDocumento } from '../lib/upload'
import { nuevoId } from '../lib/id'
import type { Expense } from '../lib/types'
import ExpenseReview from '../components/ExpenseReview'
import PeriodPicker from '../components/PeriodPicker'
import UploadZone from '../components/UploadZone'
import { Badge, Card, Empty, Input, Loading, PageHeader, Select, notify } from '../components/ui'

type Tarea = { key: string; nombre: string; estado: 'subiendo' | 'leyendo' | 'hecho' | 'error'; error?: string }

export default function Gastos() {
  const { ownerId, isAdvisor } = useAuth()
  const [params, setParams] = useSearchParams()
  const [gastos, setGastos] = useState<Expense[] | null>(null)
  const [periodo, setPeriodo] = useState<Periodo>(trimestreActual())
  const [categoria, setCategoria] = useState('')
  const [q, setQ] = useState('')
  const [tareas, setTareas] = useState<Tarea[]>([])
  const [abierto, setAbierto] = useState<Expense | null>(null)

  const cargar = useCallback(async () => {
    if (!ownerId) return [] as Expense[]
    const { data } = await supabase
      .from('expenses')
      .select('*')
      .eq('owner_id', ownerId)
      .order('fecha', { ascending: false, nullsFirst: true })
      .order('created_at', { ascending: false })
    const lista = (data as Expense[]) ?? []
    setGastos(lista)
    return lista
  }, [ownerId])

  useEffect(() => {
    cargar().then((lista) => {
      // Enlace directo desde el panel del asesor: /gastos?revisar=<id>
      const id = params.get('revisar')
      const g = id && lista.find((x) => x.id === id)
      if (g) {
        setAbierto(g)
        setParams({}, { replace: true })
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargar])

  const actualizarTarea = (key: string, patch: Partial<Tarea>) =>
    setTareas((ts) => ts.map((t) => (t.key === key ? { ...t, ...patch } : t)))

  const procesar = async (files: File[]) => {
    if (!ownerId) return
    const nuevas = files.map((f) => ({ key: nuevoId(), nombre: f.name, estado: 'subiendo' as const }))
    setTareas((ts) => [...nuevas, ...ts.filter((t) => t.estado !== 'hecho')])
    let ultimoId: string | null = null

    for (let i = 0; i < files.length; i++) {
      const key = nuevas[i].key
      try {
        const archivo = await prepararArchivo(files[i])
        const path = await subirDocumento(ownerId, 'gastos', archivo)
        const { data: fila, error } = await supabase
          .from('expenses')
          .insert({ owner_id: ownerId, file_path: path, estado: 'pendiente' })
          .select()
          .single()
        if (error) throw new Error(await errorMessage(error))
        ultimoId = fila.id
        actualizarTarea(key, { estado: 'leyendo' })
        cargar()

        try {
          const ocr = await leerFactura(path, 'gasto', ownerId)
          const imp = importesDe(ocr)
          await supabase
            .from('expenses')
            .update({
              fecha: ocr.fecha,
              proveedor: ocr.emisor.nombre,
              proveedor_nif: ocr.emisor.nif,
              numero: ocr.numero,
              concepto: ocr.concepto,
              categoria: ocr.categoria,
              ...imp,
              naturaleza: ocr.naturaleza === 'inversion' ? 'inversion' : 'gasto',
              revision: necesitaRevision(ocr.naturaleza, imp.base) ? 'pendiente' : null,
              ocr,
            })
            .eq('id', fila.id)
          actualizarTarea(key, { estado: 'hecho' })
        } catch (e) {
          actualizarTarea(key, { estado: 'error', error: `Guardado, pero no se ha podido leer: ${(e as Error).message}` })
        }
      } catch (e) {
        actualizarTarea(key, { estado: 'error', error: (e as Error).message })
      }
    }

    const lista = await cargar()
    if (files.length === 1 && ultimoId) {
      const g = lista.find((x) => x.id === ultimoId)
      if (g) setAbierto(g)
    } else {
      notify(`${files.length} documentos procesados. Revísalos en la lista.`)
    }
  }

  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase()
    return (gastos ?? []).filter((g) => {
      if (g.estado === 'revisado' && !enPeriodo(g.fecha, periodo)) return false
      if (g.estado === 'pendiente' && g.fecha && !enPeriodo(g.fecha, periodo)) return false
      if (categoria && g.categoria !== categoria) return false
      if (t && ![g.proveedor, g.concepto, g.numero, g.proveedor_nif].some((v) => v?.toLowerCase().includes(t))) return false
      return true
    })
  }, [gastos, periodo, categoria, q])

  const resumen = useMemo(() => {
    const ok = visibles.filter((g) => g.estado === 'revisado')
    return {
      base: ok.reduce((s, g) => s + Number(g.base), 0),
      iva: ok.reduce((s, g) => s + Number(g.cuota_iva), 0),
      pendientes: (gastos ?? []).filter((g) => g.estado === 'pendiente').length,
    }
  }, [visibles, gastos])

  if (!ownerId) return <Loading />
  const ocupado = tareas.some((t) => t.estado === 'subiendo' || t.estado === 'leyendo')

  return (
    <>
      <PageHeader
        title="Gastos"
        subtitle="Sube tus facturas y tickets: los leemos por ti y tú solo revisas."
      />

      <UploadZone
        onFiles={procesar}
        disabled={ocupado}
        titulo={ocupado ? 'Procesando documentos…' : 'Arrastra aquí tus facturas o tickets'}
        texto="PDF o foto (JPG, PNG, HEIC). Puedes subir varios a la vez."
      />

      {tareas.length > 0 && (
        <Card className="mt-4 divide-y divide-line">
          {tareas.map((t) => (
            <div key={t.key} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              {t.estado === 'hecho' ? (
                <CheckCircle2 className="size-4 shrink-0 text-verde" />
              ) : t.estado === 'error' ? (
                <AlertCircle className="size-4 shrink-0 text-rojo" />
              ) : (
                <Loader2 className="size-4 shrink-0 animate-spin text-muted" />
              )}
              <span className="min-w-0 flex-1 truncate">{t.nombre}</span>
              <span className={t.estado === 'error' ? 'text-right text-rojo' : 'text-muted'}>
                {t.estado === 'subiendo' && 'Subiendo…'}
                {t.estado === 'leyendo' && 'Leyendo la factura…'}
                {t.estado === 'hecho' && 'Listo para revisar'}
                {t.estado === 'error' && t.error}
              </span>
            </div>
          ))}
        </Card>
      )}

      <div className="mt-8 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <PeriodPicker value={periodo} onChange={setPeriodo} />
        <div className="flex gap-2">
          <div className="relative flex-1 lg:w-60">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input placeholder="Buscar" value={q} onChange={(e) => setQ(e.target.value)} className="!h-9 pl-9 !text-sm" />
          </div>
          <Select className="!h-9 w-44 !text-sm" value={categoria} onChange={(e) => setCategoria(e.target.value)} aria-label="Categoría">
            <option value="">Todas las categorías</option>
            {CATEGORIAS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-sm text-muted">Gastos (base)</p>
          <p className="num mt-1 text-xl font-semibold">{eur(resumen.base)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted">IVA soportado</p>
          <p className="num mt-1 text-xl font-semibold">{eur(resumen.iva)}</p>
        </Card>
        <Card className="col-span-2 p-4 sm:col-span-1">
          <p className="text-sm text-muted">Pendientes de revisar</p>
          <p className="mt-1 text-xl font-semibold">{resumen.pendientes}</p>
        </Card>
      </div>

      <Card className="mt-4 overflow-hidden">
        {gastos === null ? (
          <Loading />
        ) : visibles.length === 0 ? (
          <Empty
            icon={<Receipt className="size-5" />}
            title={gastos.length ? 'No hay gastos en este periodo' : 'Todavía no has subido gastos'}
            text={gastos.length ? 'Cambia el trimestre o los filtros.' : 'Sube tu primera factura o haz una foto de un ticket.'}
          />
        ) : (
          <table className="w-full text-left text-[15px]">
            <thead className="hidden border-b border-line bg-paper text-xs uppercase tracking-wide text-muted md:table-header-group">
              <tr>
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium">Proveedor</th>
                <th className="px-4 py-3 font-medium">Categoría</th>
                <th className="px-4 py-3 text-right font-medium">Base</th>
                <th className="px-4 py-3 text-right font-medium">IVA</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {visibles.map((g) => (
                <tr
                  key={g.id}
                  onClick={() => setAbierto(g)}
                  className="grid cursor-pointer grid-cols-[1fr_auto] gap-x-3 border-b border-line px-4 py-3 last:border-0 hover:bg-paper md:table-row md:p-0"
                >
                  <td className="order-3 text-sm text-muted md:order-none md:px-4 md:py-3 md:text-[15px] md:text-ink">{fecha(g.fecha)}</td>
                  <td className="order-1 min-w-0 md:order-none md:max-w-72 md:px-4 md:py-3">
                    <p className="truncate font-medium">{g.proveedor || 'Sin proveedor'}</p>
                    {g.concepto && <p className="truncate text-sm text-muted">{g.concepto}</p>}
                  </td>
                  <td className="order-4 justify-self-end text-sm text-muted md:order-none md:justify-self-auto md:px-4 md:py-3">
                    {nombreCategoria(g.categoria)}
                  </td>
                  <td className="num hidden text-right md:table-cell md:px-4 md:py-3">{eur(g.base)}</td>
                  <td className="num hidden text-right md:table-cell md:px-4 md:py-3">{eur(g.cuota_iva)}</td>
                  <td className="num order-2 text-right font-medium md:order-none md:px-4 md:py-3">{eur(g.total)}</td>
                  <td className="order-5 col-span-2 md:order-none md:px-4 md:py-3 md:text-right">
                    {g.revision === 'pendiente' ? (
                      <Badge tono="ambar">{isAdvisor ? '¿Amortización?' : 'En revisión por tu asesor'}</Badge>
                    ) : g.estado === 'pendiente' ? (
                      <Badge tono="lima">Revisar</Badge>
                    ) : g.contabilizado ? (
                      <Badge tono="verde">Contabilizado</Badge>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <ExpenseReview gasto={abierto} onClose={() => setAbierto(null)} onChanged={cargar} />
    </>
  )
}
