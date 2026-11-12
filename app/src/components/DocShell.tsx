import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Card } from './ui'

/** Estructura común de los editores de presupuesto y factura */
export default function DocShell({
  back,
  backLabel,
  title,
  badge,
  cliente,
  fechas,
  lineas,
  notas,
  totales,
  acciones,
  aviso,
}: {
  back: string
  backLabel: string
  title: string
  badge?: ReactNode
  cliente: ReactNode
  fechas: ReactNode
  lineas: ReactNode
  notas: ReactNode
  totales: ReactNode
  acciones: ReactNode
  aviso?: ReactNode
}) {
  return (
    <>
      <Link to={back} className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> {backLabel}
      </Link>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">{title}</h1>
        {badge}
      </div>
      {aviso}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <Card className="grid gap-6 p-5 sm:p-6 md:grid-cols-2">
            <div>
              <h2 className="mb-3 font-semibold">Cliente</h2>
              {cliente}
            </div>
            <div>
              <h2 className="mb-3 font-semibold">Datos</h2>
              {fechas}
            </div>
          </Card>
          <Card className="p-5 sm:p-6">
            <h2 className="mb-4 font-semibold">Conceptos</h2>
            {lineas}
          </Card>
          <Card className="p-5 sm:p-6">
            <h2 className="mb-3 font-semibold">Notas</h2>
            {notas}
          </Card>
        </div>
        <div>
          <div className="space-y-4 xl:sticky xl:top-8">
            <Card className="p-5">{totales}</Card>
            <div className="flex flex-col gap-2">{acciones}</div>
          </div>
        </div>
      </div>
    </>
  )
}
