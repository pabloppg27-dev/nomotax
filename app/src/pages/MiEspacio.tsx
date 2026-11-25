import { useCallback, useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { AlertCircle, ChevronDown, FileText, Download, FolderOpen, IdCard, Receipt, Trash2, Wallet } from 'lucide-react'
import { useAuth, verComoDev } from '../lib/auth'
import { DOCS_DEMO, FICHA_DEMO, NOMINAS_DEMO } from '../lib/demoEmpleado'
import { BUCKET, abrirDocumento, errorMessage, supabase } from '../lib/supabase'
import { eur, fecha, num } from '../lib/format'
import { nombreContrato, nombreDoc, textoPrueba, textoVacaciones } from '../lib/laboral'
import { useAlCambiarSubidas, useSubidas } from '../lib/subidas'
import type { Expense, Nomina, Trabajador } from '../lib/types'
import UploadZone from '../components/UploadZone'
import MisNominas from '../components/MisNominas'
import { PedirCambioIrpf } from '../components/SolicitudIrpf'
import DescargaFichajes from '../components/DescargaFichajes'
import { enDemo } from '../lib/demoFichaje'
import { Badge, Card, Empty, Loading, confirmar, cx, notify } from '../components/ui'

export const SECCIONES = ['tickets', 'nominas', 'documentos', 'ficha']

type Doc = { id: string; tipo: string; nombre: string | null; path: string; created_at: string; anio?: number | null }

/** Portal del empleado: sus tickets de gasto, sus nóminas y sus documentos */
export default function MiEspacio() {
  const { seccion } = useParams()
  const { ownerId, owner, me, miembro, viendoComo } = useAuth()
  const [tickets, setTickets] = useState<Expense[] | null>(null)
  const [nominas, setNominas] = useState<Nomina[]>([])
  const [docs, setDocs] = useState<Doc[]>([])
  const [ficha, setFicha] = useState<Trabajador | null>(null)
  const { encolar } = useSubidas()
  const [certAbierto, setCertAbierto] = useState(false)

  const idFicha = miembro?.trabajador_id ?? null
  const trabajadorId = idFicha === 'demo' ? null : idFicha
  // Solo en local con ?verComo=empleado (o &ficha=1) y sin trabajador vinculado: una nómina de ejemplo para ver la pantalla
  const ejemplo = import.meta.env.DEV && !trabajadorId && (verComoDev() === 'empleado' || idFicha === 'demo')

  const cargar = useCallback(async () => {
    if (!ownerId || !me) return
    // «Ver lo que ve X» (cuenta demo): sus tickets son los que subió su usuario, no el tuyo
    let autor: string | null = viendoComo ? viendoComo.userId ?? null : me.id
    if (viendoComo && !autor) {
      const m = supabase.from('miembros').select('user_id').eq('cuenta_id', ownerId).limit(1)
      // Por su ficha; si su rol no la guarda (comercial), por el nombre
      autor = (await m.eq('trabajador_id', viendoComo.id).maybeSingle()).data?.user_id ?? null
      if (!autor) autor = (await supabase.from('miembros').select('user_id').eq('cuenta_id', ownerId).ilike('nombre', `${viendoComo.nombre} %`).limit(1).maybeSingle()).data?.user_id ?? null
    }
    const [t, n, d, f] = await Promise.all([
      autor
        ? supabase.from('expenses').select('*').eq('owner_id', ownerId).eq('subido_por', autor).order('created_at', { ascending: false })
        : Promise.resolve({ data: [] }),
      trabajadorId
        ? supabase.from('nominas').select('*').eq('owner_id', ownerId).eq('trabajador_id', trabajadorId).eq('estado', 'publicada').order('anio', { ascending: false }).order('mes', { ascending: false })
        : Promise.resolve({ data: [] }),
      trabajadorId
        ? supabase.from('trabajador_documentos').select('*').eq('trabajador_id', trabajadorId).order('created_at', { ascending: false })
        : Promise.resolve({ data: [] }),
      trabajadorId ? supabase.from('trabajadores').select('*').eq('id', trabajadorId).maybeSingle() : Promise.resolve({ data: null }),
    ])
    setTickets((t.data as Expense[]) ?? [])
    setNominas((n.data as Nomina[]) ?? [])
    setDocs((d.data as Doc[]) ?? [])
    setFicha((f.data as Trabajador) ?? null)
  }, [ownerId, me, trabajadorId, viendoComo])

  useEffect(() => {
    cargar()
  }, [cargar])

  useAlCambiarSubidas(() => {
    cargar()
  })

  if (!ownerId || !owner || !tickets) return <Loading />
  const nominasVer = ejemplo ? NOMINAS_DEMO : nominas
  const fichaVer = ejemplo ? FICHA_DEMO : ficha
  const docsVer = ejemplo ? DOCS_DEMO : docs

  // Se encolan y se procesan en segundo plano (panel flotante)
  const subir = (files: File[]) => {
    if (!ownerId) return
    encolar('ticket', ownerId, files)
  }

  const borrar = async (g: Expense) => {
    const ok = await confirmar({ titulo: 'Borrar el ticket', texto: 'Se borra el ticket y su archivo. Solo se puede mientras nadie lo ha revisado.', accion: 'Borrar', peligro: true })
    if (!ok) return
    if (g.file_path) await supabase.storage.from(BUCKET).remove([g.file_path])
    const { error } = await supabase.from('expenses').delete().eq('id', g.id)
    if (error) notify(await errorMessage(error), 'error')
    cargar()
  }

  const verDoc = (path: string) => (path ? abrirDocumento(path) : notify('Es un documento de ejemplo: no tiene archivo.'))

  if (!SECCIONES.includes(seccion ?? '')) return <Navigate to="/mi-espacio/tickets" replace />

  const titulo = { tickets: 'Mis tickets de gasto', nominas: 'Mis nóminas', documentos: 'Mis documentos', ficha: 'Mi ficha' }[seccion as string]
  const sub = {
    tickets: 'Haz una foto al ticket o sube el PDF: lo leemos solo y administración lo revisa.',
    nominas: `Tus nóminas en ${owner.nombre_comercial || owner.nombre}: elige el mes para ver el desglose.`,
    documentos: 'Contrato, alta en la Seguridad Social, certificado de retenciones para la renta y el resto de papeles que tiene la empresa de ti.',
    ficha: 'Los datos de tu contrato.',
  }[seccion as string]

  const sinVincular = (
    <Card className="p-5 sm:p-6">
      <p className="flex items-start gap-2 text-sm text-muted">
        <AlertCircle className="mt-0.5 size-4 shrink-0" />
        Tu usuario aún no está vinculado a tu ficha de trabajador. Pídeselo a la empresa para verlo aquí.
      </p>
    </Card>
  )

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">{titulo}</h1>
        <p className="mt-1 text-[15px] text-muted">{sub}</p>
      </div>

      {seccion === 'tickets' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.3fr] lg:items-start">
          <Card className="p-5 sm:p-6" guia="subir-ticket">
            <h2 className="mb-4 flex items-center gap-2 font-semibold">
              <Receipt className="size-4" /> Subir un ticket
            </h2>
            <UploadZone onFiles={subir} titulo="Subir tickets" texto="Foto o PDF · puedes subir varios y seguir usando la app mientras se leen" compacto fotoPrimero />
          </Card>

          <Card className="divide-y divide-line">
            {tickets.length === 0 ? (
              <Empty icon={<Wallet className="size-5" />} title="Aún no has subido tickets" text="Comidas, parking, taxis, material… todo lo que hayas pagado tú para la empresa." />
            ) : (
              tickets.map((g) => (
                <div key={g.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                  <button className="min-w-0 flex-1 text-left" onClick={() => g.file_path && abrirDocumento(g.file_path)}>
                    <p className="truncate font-medium">{g.proveedor || g.concepto || 'Ticket'}</p>
                    <p className="text-sm text-muted">
                      {g.fecha ? fecha(g.fecha) : `Subido el ${fecha(g.created_at)}`}
                      {g.concepto && g.proveedor ? ` · ${g.concepto}` : ''}
                    </p>
                  </button>
                  <div className="text-right">
                    <p className="num font-medium">{Number(g.total) ? eur(Number(g.total)) : '—'}</p>
                    {g.estado === 'revisado' ? <Badge tono="verde">Revisado</Badge> : <Badge tono="ambar">Pendiente de revisar</Badge>}
                  </div>
                  {g.estado === 'pendiente' && (
                    <button onClick={() => borrar(g)} className="rounded-full p-2 text-muted hover:bg-ink/5 hover:text-rojo" aria-label="Borrar ticket">
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
              ))
            )}
          </Card>
        </div>
      )}

      {seccion === 'nominas' &&
        (!trabajadorId && !ejemplo ? (
          sinVincular
        ) : nominasVer.length === 0 ? (
          <Card className="p-5 sm:p-6">
            <p className="flex items-center gap-2 text-sm text-muted">
              <FileText className="size-4" /> Todavía no hay nóminas publicadas.
            </p>
          </Card>
        ) : (
          <MisNominas nominas={nominasVer} ejemplo={ejemplo} />
        ))}

      {seccion === 'documentos' && (enDemo() || (trabajadorId && miembro?.fichaje)) && (
        <DescargaFichajes
          trabajadorId={trabajadorId ?? 'd1'}
          nombre={enDemo() ? 'Laura Gómez' : fichaVer?.nombre ?? ''}
          dni={enDemo() ? '12345678Z' : fichaVer?.dni ?? null}
        />
      )}

      {seccion === 'documentos' &&
        (!trabajadorId && !ejemplo ? (
          sinVincular
        ) : docsVer.length === 0 ? (
          <Card>
            <Empty icon={<FolderOpen className="size-5" />} title="Todavía no hay documentos" text="Cuando la empresa suba tu contrato u otros papeles, los verás aquí." />
          </Card>
        ) : (
          <Card className="max-w-2xl divide-y divide-line px-5 sm:px-6">
            {(() => {
              const certs = docsVer.filter((d) => d.tipo === 'certificado_retenciones').sort((x, y) => Number(y.anio ?? 0) - Number(x.anio ?? 0))
              const resto = docsVer.filter((d) => d.tipo !== 'certificado_retenciones')
              return (
                <>
                  {certs.length > 0 && (
                    <div>
                      <button
                        className="flex w-full items-center justify-between gap-3 py-3 text-left hover:text-ink/70"
                        onClick={() => setCertAbierto((v) => !v)}
                        aria-expanded={certAbierto}
                      >
                        <span className="flex items-center gap-2.5">
                          <FileText className="size-4 text-muted" /> Certificado de retenciones (IRPF)
                          <Badge tono="lima">Para la renta</Badge>
                        </span>
                        <span className="flex items-center gap-2 text-sm text-muted">
                          {certs.length} {certs.length === 1 ? 'año' : 'años'}
                          <ChevronDown className={cx('size-4 transition-transform', certAbierto && 'rotate-180')} />
                        </span>
                      </button>
                      {certAbierto && (
                        <div className="mb-3 flex flex-wrap gap-2 pl-6">
                          {certs.map((d) => (
                            <button
                              key={d.id}
                              onClick={() => verDoc(d.path)}
                              className="num inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-4 py-2 text-sm font-medium hover:border-ink"
                            >
                              <Download className="size-3.5" /> {d.anio ?? fecha(d.created_at)}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {resto.map((d) => (
                    <button key={d.id} className="flex w-full items-center justify-between gap-3 py-3 text-left hover:text-ink/70" onClick={() => verDoc(d.path)}>
                      <span className="flex items-center gap-2.5">
                        <FileText className="size-4 text-muted" /> {nombreDoc(d.tipo, d.anio)}
                      </span>
                      <span className="text-sm text-muted">{fecha(d.created_at)}</span>
                    </button>
                  ))}
                </>
              )
            })()}
          </Card>
        ))}

      {seccion === 'ficha' &&
        (!fichaVer ? (
          sinVincular
        ) : (
          <>
            <FichaContrato ficha={fichaVer} />
            <PedirCambioIrpf trabajador={fichaVer} demo={ejemplo} />
          </>
        ))}
    </>
  )
}

/** Tarjeta «Datos de tu contrato» que ve el trabajador */
export function FichaContrato({ ficha }: { ficha: Trabajador }) {
  return (
    <Card className="max-w-2xl p-5 sm:p-6" guia="ficha-contrato">
      <h2 className="flex items-center gap-2 font-semibold">
        <IdCard className="size-4" /> Datos de tu contrato
      </h2>
      <dl className="mt-3 divide-y divide-line text-[15px]">
        {[
          ['Puesto', ficha.puesto],
          ['Contrato', ficha.tipo_contrato ? nombreContrato(ficha.tipo_contrato) : null],
          ['Desde', fecha(ficha.fecha_inicio)],
          ['Convenio', ficha.convenio],
          ['Categoría', ficha.clasificacion],
          ['Periodo de prueba', textoPrueba(ficha.fecha_inicio, ficha.prueba_meses)],
          ['Vacaciones', textoVacaciones(ficha.vacaciones_dias, ficha.vacaciones_nota)],
          ['Jornada', ficha.jornada === 'completa' ? 'Completa' : `Parcial${ficha.horas_semana ? ` · ${ficha.horas_semana} h/semana` : ''}`],
          ['Salario bruto anual', eur(Math.round(Number(ficha.salario_bruto_mensual) * Number(ficha.pagas || 12)))],
          [`Bruto por paga (${ficha.pagas} pagas)`, eur(Number(ficha.salario_bruto_mensual))],
          ['Retención IRPF', ficha.irpf_pct != null ? `${num(Number(ficha.irpf_pct))}%` : null],
        ]
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 py-2.5">
              <dt className="text-muted">{k}</dt>
              <dd className="text-right">{v}</dd>
            </div>
          ))}
      </dl>
      <p className="mt-4 text-xs text-muted">¿Algún dato no es correcto? Avisa a la empresa.</p>
    </Card>
  )
}
