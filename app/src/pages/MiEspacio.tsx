import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, FileText, Loader2, Receipt, Trash2, Wallet } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { BUCKET, abrirDocumento, errorMessage, supabase } from '../lib/supabase'
import { eur, fecha } from '../lib/format'
import { necesitaRevision } from '../lib/contabilidad.ts'
import { columnasDivisa } from '../lib/divisas'
import { importesDe, leerFactura, prepararArchivo, subirDocumento } from '../lib/upload'
import { nombreDoc } from '../lib/laboral'
import type { Expense, Nomina, Trabajador } from '../lib/types'
import UploadZone from '../components/UploadZone'
import { Badge, Card, Empty, Loading, confirmar, notify } from '../components/ui'

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

type Doc = { id: string; tipo: string; nombre: string | null; path: string; created_at: string }

/** Portal del empleado: sus tickets de gasto, sus nóminas y sus documentos */
export default function MiEspacio() {
  const { ownerId, owner, me, miembro } = useAuth()
  const [tickets, setTickets] = useState<Expense[] | null>(null)
  const [nominas, setNominas] = useState<Nomina[]>([])
  const [docs, setDocs] = useState<Doc[]>([])
  const [ficha, setFicha] = useState<Trabajador | null>(null)
  const [subiendo, setSubiendo] = useState<string | null>(null)

  const trabajadorId = miembro?.trabajador_id ?? null

  const cargar = useCallback(async () => {
    if (!ownerId || !me) return
    const [t, n, d, f] = await Promise.all([
      supabase.from('expenses').select('*').eq('owner_id', ownerId).eq('subido_por', me.id).order('created_at', { ascending: false }),
      trabajadorId
        ? supabase.from('nominas').select('*').eq('owner_id', ownerId).eq('trabajador_id', trabajadorId).eq('estado', 'publicada').order('anio', { ascending: false }).order('mes', { ascending: false })
        : Promise.resolve({ data: [] }),
      trabajadorId
        ? supabase.from('trabajador_documentos').select('id, tipo, nombre, path, created_at').eq('trabajador_id', trabajadorId).order('created_at', { ascending: false })
        : Promise.resolve({ data: [] }),
      trabajadorId ? supabase.from('trabajadores').select('*').eq('id', trabajadorId).maybeSingle() : Promise.resolve({ data: null }),
    ])
    setTickets((t.data as Expense[]) ?? [])
    setNominas((n.data as Nomina[]) ?? [])
    setDocs((d.data as Doc[]) ?? [])
    setFicha((f.data as Trabajador) ?? null)
  }, [ownerId, me, trabajadorId])

  useEffect(() => {
    cargar()
  }, [cargar])

  if (!ownerId || !owner || !tickets) return <Loading />

  const subir = async (files: File[]) => {
    for (const file of files) {
      setSubiendo(file.name)
      try {
        const archivo = await prepararArchivo(file)
        const path = await subirDocumento(ownerId, 'gastos', archivo)
        const { data: fila, error } = await supabase.from('expenses').insert({ owner_id: ownerId, file_path: path, estado: 'pendiente' }).select().single()
        if (error) throw new Error(await errorMessage(error))
        await cargar()
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
              ...columnasDivisa(ocr),
              ocr,
            })
            .eq('id', fila.id)
        } catch {
          /* Se queda subido; administración lo completa al revisarlo */
        }
      } catch (e) {
        notify(`${file.name}: ${(e as Error).message}`, 'error')
      }
    }
    setSubiendo(null)
    await cargar()
    notify(files.length === 1 ? 'Ticket enviado. Administración lo revisará.' : `${files.length} tickets enviados`)
  }

  const borrar = async (g: Expense) => {
    const ok = await confirmar({ titulo: 'Borrar el ticket', texto: 'Se borra el ticket y su archivo. Solo se puede mientras nadie lo ha revisado.', accion: 'Borrar', peligro: true })
    if (!ok) return
    if (g.file_path) await supabase.storage.from(BUCKET).remove([g.file_path])
    const { error } = await supabase.from('expenses').delete().eq('id', g.id)
    if (error) notify(await errorMessage(error), 'error')
    cargar()
  }

  const nombre = me?.nombre?.split(' ')[0]

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">{nombre ? `Hola, ${nombre}` : 'Mi espacio'}</h1>
        <p className="mt-1 text-[15px] text-muted">Tus tickets de gasto, tus nóminas y tus documentos en {owner.nombre_comercial || owner.nombre}.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-4">
          <Card className="p-5 sm:p-6">
            <h2 className="flex items-center gap-2 font-semibold">
              <Receipt className="size-4" /> Mis tickets de gasto
            </h2>
            <p className="mb-4 text-sm text-muted">Haz una foto al ticket o sube el PDF: lo leemos solo y administración lo revisa.</p>
            <UploadZone onFiles={subir} titulo="Subir tickets" texto="Foto o PDF · puedes subir varios" disabled={subiendo !== null} compacto />
            {subiendo && (
              <p className="mt-3 flex items-center gap-2 text-sm text-muted">
                <Loader2 className="size-4 animate-spin" /> Subiendo y leyendo «{subiendo}»…
              </p>
            )}
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

        <div className="space-y-4">
          <Card className="p-5 sm:p-6">
            <h2 className="flex items-center gap-2 font-semibold">
              <FileText className="size-4" /> Mis nóminas
            </h2>
            {!trabajadorId ? (
              <p className="mt-3 flex items-start gap-2 text-sm text-muted">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                Tu usuario aún no está vinculado a tu ficha de trabajador. Pídeselo a la empresa para ver aquí tus nóminas.
              </p>
            ) : nominas.length === 0 ? (
              <p className="mt-3 text-sm text-muted">Todavía no hay nóminas publicadas.</p>
            ) : (
              <div className="mt-3 divide-y divide-line">
                {nominas.map((n) => (
                  <button key={n.id} className="flex w-full items-center justify-between gap-3 py-2.5 text-left hover:text-ink/70" onClick={() => abrirDocumento(n.file_path)}>
                    <span className="capitalize">
                      {MESES[n.mes - 1]} {n.anio}
                      {n.tipo !== 'mensual' && <span className="text-muted"> · {n.tipo === 'extra' ? 'paga extra' : n.tipo}</span>}
                    </span>
                    <span className="num text-sm text-muted">Líquido {eur(Number(n.neto))}</span>
                  </button>
                ))}
              </div>
            )}
          </Card>

          {docs.length > 0 && (
            <Card className="p-5 sm:p-6">
              <h2 className="font-semibold">Mis documentos</h2>
              <div className="mt-3 divide-y divide-line">
                {docs.map((d) => (
                  <button key={d.id} className="flex w-full items-center justify-between gap-3 py-2.5 text-left" onClick={() => abrirDocumento(d.path)}>
                    <span>{nombreDoc(d.tipo)}</span>
                    <span className="text-sm text-muted">{fecha(d.created_at)}</span>
                  </button>
                ))}
              </div>
            </Card>
          )}

          {ficha && (
            <Card className="p-5 sm:p-6">
              <h2 className="font-semibold">Mi ficha</h2>
              <dl className="mt-3 space-y-2 text-[15px]">
                {[
                  ['Puesto', ficha.puesto],
                  ['Desde', fecha(ficha.fecha_inicio)],
                  ['Jornada', ficha.jornada === 'completa' ? 'Completa' : `Parcial${ficha.horas_semana ? ` · ${ficha.horas_semana} h/semana` : ''}`],
                  ['Salario bruto mensual', eur(Number(ficha.salario_bruto_mensual))],
                  ['Pagas', String(ficha.pagas)],
                ]
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-3">
                      <dt className="text-muted">{k}</dt>
                      <dd className="text-right">{v}</dd>
                    </div>
                  ))}
              </dl>
              <p className="mt-4 text-xs text-muted">¿Algún dato no es correcto? Avisa a la empresa.</p>
            </Card>
          )}
        </div>
      </div>
    </>
  )
}
