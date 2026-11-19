import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Receipt, Search } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { enPeriodo, eur, fecha, trimestreActual, type Periodo } from '../lib/format'
import { CATEGORIAS, nombreCategoria } from '../lib/categorias'
import { importeMoneda } from '../lib/divisas'
import { useAlCambiarSubidas, useSubidas } from '../lib/subidas'
import type { Expense } from '../lib/types'
import ExpenseReview from '../components/ExpenseReview'
import PeriodPicker from '../components/PeriodPicker'
import UploadZone from '../components/UploadZone'
import { Badge, Card, Empty, Input, Loading, PageHeader, Select } from '../components/ui'

export default function Gastos() {
  const { ownerId, isAdvisor } = useAuth()
  const [params, setParams] = useSearchParams()
  const [gastos, setGastos] = useState<Expense[] | null>(null)
  const [periodo, setPeriodo] = useState<Periodo>(trimestreActual())
  const [categoria, setCategoria] = useState('')
  const [q, setQ] = useState('')
  const { encolar } = useSubidas()
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

  // Enlace directo desde el panel del asesor o el de subidas: /gastos?revisar=<id>
  const revisar = params.get('revisar')
  useEffect(() => {
    cargar().then((lista) => {
      const g = revisar && lista.find((x) => x.id === revisar)
      if (g) {
        setAbierto(g)
        setParams({}, { replace: true })
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargar, revisar])

  // Se encolan y se procesan en segundo plano (panel flotante): puedes cambiar de página mientras tanto
  const procesar = (files: File[]) => {
    if (!ownerId) return
    encolar('gasto', ownerId, files)
  }

  useAlCambiarSubidas(() => {
    cargar()
  })

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

  return (
    <>
      <PageHeader
        title="Gastos"
        subtitle="Sube tus facturas y tickets: los leemos por ti y tú solo revisas."
      />

      <div data-guia="subir-gasto">
        <UploadZone
          onFiles={procesar}
          titulo="Arrastra aquí tus facturas o tickets"
          texto="PDF o foto (JPG, PNG, HEIC). Puedes subir varios a la vez: se leen en segundo plano y puedes seguir trabajando."
        />
      </div>

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
                  <td className="num order-2 text-right font-medium md:order-none md:px-4 md:py-3">
                    {eur(g.total)}
                    {g.moneda && g.moneda !== 'EUR' && g.importe_original !== null && (
                      <span className="block text-xs font-normal text-muted">{importeMoneda(g.importe_original, g.moneda)}</span>
                    )}
                  </td>
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
