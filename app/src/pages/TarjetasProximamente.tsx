import { useAuth } from '../lib/auth'
import TarjetaVisual from '../components/TarjetaVisual'
import { Badge, Card, PageHeader } from '../components/ui'

/** Lo que ven los clientes en «Tarjetas» hasta que Stripe apruebe la emisión (ver TARJETAS_PARA_CLIENTES) */
export default function TarjetasProximamente() {
  const { owner } = useAuth()
  // Nombre comercial (marca del autónomo) si lo tiene; si no, el de la empresa o el del autónomo
  const nombre = owner?.nombre_comercial || owner?.nombre || owner?.email || 'Tu empresa'
  return (
    <>
      <PageHeader title="Tarjetas" subtitle="Tarjetas Visa para los gastos de tu empresa, con tu propio saldo y límites." />
      <Card className="overflow-hidden">
        <div className="grid gap-6 p-5 sm:p-8 md:grid-cols-2 md:items-center">
          <div>
            <Badge tono="lima">Próximamente</Badge>
            <h2 className="mt-3 text-xl font-semibold tracking-tight">Muy pronto, tus tarjetas de empresa en NomoTax</h2>
            <p className="mt-2 text-[15px] text-muted">
              Podrás emitir tarjetas virtuales y físicas, ponerles un límite de gasto al mes y ver cada compra registrada en tu contabilidad, sin salir del área de clientes.
            </p>
            <p className="mt-3 text-sm text-muted">Te avisaremos en cuanto esté disponible.</p>
          </div>
          <div className="grid place-items-center">
            <TarjetaVisual titular={nombre} ultimos4="0000" exp_mes={null} exp_anio={null} />
          </div>
        </div>
      </Card>
    </>
  )
}
