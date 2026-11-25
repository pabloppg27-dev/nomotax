import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowRight, CheckCircle2, FileText, Search } from 'lucide-react'
import { useAuth } from '../../lib/auth'
import { abrirDocumento, errorMessage, supabase } from '../../lib/supabase'
import { eur, fecha, hoyISO } from '../../lib/format'
import { prepararArchivo, subirDocumento } from '../../lib/upload'
import { RESULTADOS, diasHasta, nombrePeriodo, type Resultado } from '../../lib/impuestos'
import { FORMAS, etiquetasFiscal } from '../../lib/regimenFiscal'
import {
  modelosDelTrimestre,
  trimestreAPresentar,
  type DatosEmpresa,
  type FacturaT,
  type GastoT,
  type ModeloCalc,
  type NominaT,
  type PresentadoT,
  type ResultadoEmpresa,
  type Trimestre as T,
} from '../../lib/trimestre'
import type { Profile } from '../../lib/types'
import NumInput from '../../components/NumInput'
import { Badge, Button, Card, Field, Input, Loading, Modal, PageHeader, Select, Textarea, cx, notify } from '../../components/ui'

type Perfil = Pick<Profile, 'id' | 'nombre' | 'nombre_comercial' | 'email' | 'nif' | 'fiscal' | 'es_demo'>
type Fila = { perfil: Perfil; r: ResultadoEmpresa }

const nombreDe = (p: Perfil) => p.nombre_comercial || p.nombre || p.email || 'Cliente'

/** Todas las filas de una consulta (Supabase devuelve 1.000 como mucho por petición) */
async function todas<R>(consulta: (desde: number, hasta: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<R[]> {
  const out: R[] = []
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await consulta(desde, desde + 999)
    if (error || !Array.isArray(data)) break
    out.push(...(data as R[]))
    if (data.length < 1000) break
  }
  return out
}

/** Trimestres para el selector: del que toca presentar hacia atrás, y el siguiente */
function opcionesTrimestre() {
  const { anio, t } = trimestreAPresentar()
  const lista: { anio: number; t: T }[] = []
  let a = anio
  let k: number = t + 1
  if (k > 4) {
    k = 1
    a++
  }
  for (let i = 0; i < 8; i++) {
    lista.push({ anio: a, t: k as T })
    k--
    if (k < 1) {
      k = 4
      a--
    }
  }
  return lista
}

const TONO_ESTADO: Record<ModeloCalc['estado'], string> = {
  pendiente: 'border-ambar/40 bg-ambar/10 text-ink',
  presentado: 'border-verde/30 bg-verde/10 text-verde',
  manual: 'border-line bg-ink/5 text-ink/70',
  no_obligado: 'border-line bg-white text-muted line-through decoration-ink/30',
  recordatorio: 'border-dashed border-ink/30 bg-white text-ink/70',
}

const TEXTO_ESTADO: Record<ModeloCalc['estado'], string> = {
  pendiente: 'Pendiente',
  presentado: 'Presentado',
  manual: 'A calcular a mano',
  no_obligado: 'Probablemente no le toca',
  recordatorio: 'Recordatorio',
}

export default function TrimestreAsesor() {
  const { setOwner } = useAuth()
  const navigate = useNavigate()
  const opciones = useMemo(opcionesTrimestre, [])
  const inicial = trimestreAPresentar()
  const [sel, setSel] = useState(`${inicial.anio}-${inicial.t}`)
  const [filas, setFilas] = useState<Fila[] | null>(null)
  const [q, setQ] = useState('')
  const [soloPendientes, setSoloPendientes] = useState(false)
  const [abierto, setAbierto] = useState<{ fila: Fila; m: ModeloCalc } | null>(null)
  const [presentar, setPresentar] = useState<{ fila: Fila; m: ModeloCalc } | null>(null)

  const [anio, t] = sel.split('-').map(Number) as [number, T]

  const cargar = useCallback(async () => {
    setFilas(null)
    const desde = `${anio}-01-01`
    const hasta = `${anio}-12-31`
    const [perfiles, facturas, gastos, pendientes, nominas, impuestos, trabajadores] = await Promise.all([
      todas<Perfil>((a, b) => supabase.from('profiles').select('id, nombre, nombre_comercial, email, nif, fiscal, es_demo').eq('role', 'client').order('nombre').range(a, b)),
      todas<FacturaT & { owner_id: string }>((a, b) =>
        supabase.from('invoices').select('owner_id, fecha, estado, base, cuota_iva, cuota_irpf, total, cliente, fecha_cobro').neq('estado', 'borrador').gte('fecha', desde).lte('fecha', hasta).range(a, b),
      ),
      todas<GastoT & { owner_id: string }>((a, b) =>
        supabase
          .from('expenses')
          .select('owner_id, fecha, estado, base, cuota_iva, cuota_irpf, total, categoria, proveedor, proveedor_nif, revision, pagado, fecha_pago')
          .gte('fecha', desde)
          .lte('fecha', hasta)
          .range(a, b),
      ),
      // Gastos sin fecha aún por revisar (salen como aviso)
      todas<GastoT & { owner_id: string }>((a, b) =>
        supabase.from('expenses').select('owner_id, fecha, estado, base, cuota_iva, cuota_irpf, total, categoria, proveedor, proveedor_nif, revision, pagado, fecha_pago').is('fecha', null).eq('estado', 'pendiente').range(a, b),
      ),
      todas<NominaT & { owner_id: string }>((a, b) => supabase.from('nominas').select('owner_id, anio, mes, estado, irpf, bruto, ss_empresa, coste_total').eq('anio', anio).range(a, b)),
      todas<PresentadoT & { owner_id: string }>((a, b) => supabase.from('impuestos').select('id, owner_id, modelo, anio, periodo, resultado, importe, fecha_presentacion, file_path').eq('anio', anio).range(a, b)),
      todas<{ owner_id: string }>((a, b) => supabase.from('trabajadores').select('owner_id').eq('estado', 'alta').range(a, b)),
    ])
    const por = <X extends { owner_id: string }>(xs: X[]) => {
      const m = new Map<string, X[]>()
      for (const x of xs) m.set(x.owner_id, [...(m.get(x.owner_id) ?? []), x])
      return m
    }
    const [pf, pg, pn, pi] = [por(facturas), por([...gastos, ...pendientes]), por(nominas), por(impuestos)]
    const pt = new Map<string, number>()
    for (const x of trabajadores) pt.set(x.owner_id, (pt.get(x.owner_id) ?? 0) + 1)
    // La cuenta demo solo sale en local (npm run dev)
    const visibles = perfiles.filter((p) => !p.es_demo || import.meta.env.DEV)
    setFilas(
      visibles.map((perfil) => {
        const d: DatosEmpresa = {
          perfil,
          facturas: pf.get(perfil.id) ?? [],
          gastos: pg.get(perfil.id) ?? [],
          nominas: pn.get(perfil.id) ?? [],
          presentados: pi.get(perfil.id) ?? [],
          trabajadores: pt.get(perfil.id) ?? 0,
        }
        return { perfil, r: modelosDelTrimestre(d, anio, t) }
      }),
    )
  }, [anio, t])

  useEffect(() => {
    cargar()
  }, [cargar])

  const cuenta = useMemo(() => {
    const todos = (filas ?? []).flatMap((f) => f.r.modelos)
    return {
      pendientes: todos.filter((m) => m.estado === 'pendiente' || m.estado === 'manual').length,
      presentados: todos.filter((m) => m.estado === 'presentado').length,
      aIngresar: todos.filter((m) => m.estado === 'pendiente' && m.resultado === 'ingresar').reduce((s, m) => s + (m.importe ?? 0), 0),
    }
  }, [filas])

  const visibles = useMemo(() => {
    const texto = q.trim().toLowerCase()
    return (filas ?? [])
      .filter((f) => !texto || [nombreDe(f.perfil), f.perfil.nif].some((v) => v?.toLowerCase().includes(texto)))
      .filter((f) => !soloPendientes || f.r.modelos.some((m) => m.estado === 'pendiente' || m.estado === 'manual'))
      .sort((a, b) => {
        // Primero las que tienen algo pendiente
        const pa = a.r.modelos.filter((m) => m.estado === 'pendiente' || m.estado === 'manual').length
        const pb = b.r.modelos.filter((m) => m.estado === 'pendiente' || m.estado === 'manual').length
        return Number(pb > 0) - Number(pa > 0) || nombreDe(a.perfil).localeCompare(nombreDe(b.perfil))
      })
  }, [filas, q, soloPendientes])

  const plazoGeneral = t === 4 ? `20 de enero de ${anio + 1} (303 y 390 hasta el 30)` : `20 de ${['abril', 'julio', 'octubre'][t - 1]} de ${anio}`
  const diasPlazo = diasHasta(t === 4 ? `${anio + 1}-01-20` : `${anio}-${String(t * 3 + 1).padStart(2, '0')}-20`)

  return (
    <>
      <PageHeader
        title="Trimestre"
        subtitle={
          <>
            Plazo: hasta el {plazoGeneral}
            {diasPlazo >= 0 ? ` · faltan ${diasPlazo} día${diasPlazo === 1 ? '' : 's'}` : ' · ya pasó'}
          </>
        }
        actions={
          <Select value={sel} onChange={(e) => setSel(e.target.value)} aria-label="Trimestre" className="w-36">
            {opciones.map((o) => (
              <option key={`${o.anio}-${o.t}`} value={`${o.anio}-${o.t}`}>
                {o.t}T {o.anio}
              </option>
            ))}
          </Select>
        }
      />

      {filas === null ? (
        <Loading />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Dato n={String(filas.length)} label="Empresas" />
            <Dato n={String(cuenta.pendientes)} label="Modelos pendientes" />
            <Dato n={String(cuenta.presentados)} label="Presentados" />
            <Dato n={eur(cuenta.aIngresar)} label="A ingresar (estimado)" />
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="relative min-w-0 flex-1 sm:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <Input placeholder="Buscar empresa" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4 accent-ink" checked={soloPendientes} onChange={(e) => setSoloPendientes(e.target.checked)} />
              Solo con pendientes
            </label>
          </div>

          <Card className="overflow-hidden">
            <ul className="divide-y divide-line">
              {visibles.map((f) => (
                <li key={f.perfil.id} className="px-4 py-4">
                  <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <button
                      onClick={async () => {
                        await setOwner(f.perfil.id)
                        navigate('/impuestos')
                      }}
                      className="truncate font-medium underline-offset-2 hover:underline"
                    >
                      {nombreDe(f.perfil)}
                    </button>
                    <Badge>{FORMAS[f.r.forma].split(' ')[0]}</Badge>
                    {etiquetasFiscal(f.perfil.fiscal).map((e) => (
                      <Badge key={e} tono="negro">
                        {e}
                      </Badge>
                    ))}
                    {f.perfil.es_demo && <Badge tono="lima">demo</Badge>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {f.r.modelos.map((m) => (
                      <button
                        key={`${m.modelo}-${m.periodo}`}
                        onClick={() => setAbierto({ fila: f, m })}
                        className={cx('inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm transition-shadow hover:shadow-[0_0_0_2px_var(--color-ink)]', TONO_ESTADO[m.estado])}
                        title={TEXTO_ESTADO[m.estado]}
                      >
                        {m.estado === 'presentado' && <CheckCircle2 className="size-3.5" />}
                        <span className="font-semibold">{m.modelo}</span>
                        {m.periodo === '0A' && <span className="text-xs opacity-70">anual</span>}
                        {m.importe !== null && m.estado !== 'no_obligado' && !(m.presentado && ['cero', 'informativa'].includes(m.presentado.resultado)) && (
                          <span className="num">
                            {(m.presentado ?? m.preparado) ? eur((m.presentado ?? m.preparado)!.importe) : m.resultado === 'compensar' || m.resultado === 'devolver' ? `−${eur(m.importe)}` : eur(m.importe)}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                  {f.r.avisos.length > 0 && (
                    <ul className="mt-2 space-y-0.5 text-sm text-ambar">
                      {f.r.avisos.map((a) => (
                        <li key={a} className="flex items-start gap-1.5">
                          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {a}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
              {visibles.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted">Ninguna empresa con esos filtros.</li>}
            </ul>
          </Card>

          <p className="mt-3 text-xs text-muted">
            Ámbar: pendiente · verde: presentado · gris: a calcular a mano · tachado: probablemente no le toca · discontinuo: recordatorio. Importes estimados con los datos de la app.
          </p>
        </>
      )}

      {abierto && (
        <Detalle
          fila={abierto.fila}
          m={abierto.m}
          onClose={() => setAbierto(null)}
          onPresentar={() => {
            setPresentar(abierto)
            setAbierto(null)
          }}
          onEntrar={async () => {
            await setOwner(abierto.fila.perfil.id)
            navigate('/impuestos')
          }}
        />
      )}
      {presentar && <Presentar fila={presentar.fila} m={presentar.m} onClose={() => setPresentar(null)} onHecho={cargar} />}
    </>
  )
}

function Dato({ n, label }: { n: string; label: string }) {
  return (
    <div className="rounded-2xl bg-white px-4 py-3 shadow-[0_0_0_1px_var(--color-line)]">
      <span className="num block text-xl font-semibold sm:text-2xl">{n}</span>
      <span className="text-sm text-muted">{label}</span>
    </div>
  )
}

function Detalle({ fila, m, onClose, onPresentar, onEntrar }: { fila: Fila; m: ModeloCalc; onClose: () => void; onPresentar: () => void; onEntrar: () => void }) {
  const res = m.resultado ? RESULTADOS[m.resultado] : null
  const dias = diasHasta(m.plazo)
  return (
    <Modal
      open
      onClose={onClose}
      title={`${m.modelo} · ${m.nombre}`}
      footer={
        <>
          <Button variant="secondary" icon={<ArrowRight className="size-4" />} onClick={onEntrar}>
            Entrar en su cuenta
          </Button>
          {m.estado !== 'presentado' && (
            <Button icon={<CheckCircle2 className="size-4" />} onClick={onPresentar}>
              Marcar como presentado
            </Button>
          )}
        </>
      }
    >
      <p className="font-medium">{nombreDe(fila.perfil)}</p>
      <p className="mb-4 text-sm text-muted">
        {nombrePeriodo(m.periodo)} {m.anio} · plazo {fecha(m.plazo)}
        {m.estado !== 'presentado' && (dias >= 0 ? ` · faltan ${dias} días` : ' · plazo pasado')} · {TEXTO_ESTADO[m.estado]}
      </p>

      {m.presentado && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl bg-verde/10 px-3 py-2.5 text-sm">
          <CheckCircle2 className="size-4 text-verde" />
          <span className="flex-1">
            Presentado{m.presentado.fecha_presentacion ? ` el ${fecha(m.presentado.fecha_presentacion)}` : ''}: {RESULTADOS[m.presentado.resultado]?.label ?? m.presentado.resultado}{' '}
            <strong className="num">{eur(m.presentado.importe)}</strong>
          </span>
          {m.presentado.file_path && (
            <button onClick={() => abrirDocumento(m.presentado!.file_path!)} className="inline-flex items-center gap-1 font-medium underline">
              <FileText className="size-4" /> Justificante
            </button>
          )}
        </div>
      )}

      {m.preparado && (
        <div className="mb-4 rounded-xl bg-ambar/10 px-3 py-2.5 text-sm">
          Preparado en su Impuestos, pendiente de presentar: {RESULTADOS[m.preparado.resultado]?.label ?? m.preparado.resultado}{' '}
          <strong className="num">{eur(m.preparado.importe)}</strong>
        </div>
      )}

      {m.desglose.length > 0 && (
        <table className="w-full text-[15px]">
          <tbody>
            {m.desglose.map((l, i) => (
              <tr key={i} className="border-b border-line">
                <td className="py-2 pr-3 text-ink/80">{l.texto}</td>
                <td className={cx('num py-2 text-right', l.importe < 0 && 'text-muted')}>{eur(l.importe)}</td>
              </tr>
            ))}
            {m.importe !== null && (
              <tr>
                <td className="py-2 pr-3 font-semibold">{res ? res.label : 'Resultado'}</td>
                <td className="num py-2 text-right font-semibold">{eur(m.importe)}</td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {m.notas.length > 0 && (
        <ul className="mt-4 space-y-1.5 text-sm">
          {m.notas.map((n) => (
            <li key={n} className="flex items-start gap-2 rounded-lg bg-paper px-3 py-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-ambar" /> {n}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}

function Presentar({ fila, m, onClose, onHecho }: { fila: Fila; m: ModeloCalc; onClose: () => void; onHecho: () => void }) {
  const [resultado, setResultado] = useState<Resultado>(m.preparado?.resultado ?? m.resultado ?? 'ingresar')
  const [importe, setImporte] = useState(m.preparado ? Number(m.preparado.importe) : m.importe ?? 0)
  const [dia, setDia] = useState(hoyISO())
  const [notas, setNotas] = useState('')
  const [archivo, setArchivo] = useState<File | null>(null)
  const [guardando, setGuardando] = useState(false)
  const conImporte = ['ingresar', 'devolver', 'compensar'].includes(resultado)

  const guardar = async () => {
    setGuardando(true)
    try {
      const file_path = archivo ? await subirDocumento(fila.perfil.id, 'impuestos', await prepararArchivo(archivo)) : (m.preparado?.file_path ?? null)
      const fila_ = {
        owner_id: fila.perfil.id,
        modelo: m.modelo,
        anio: m.anio,
        periodo: m.periodo,
        resultado,
        importe: conImporte ? importe : 0,
        fecha_presentacion: dia || null,
        file_path,
        ...(notas.trim() ? { notas: notas.trim() } : m.preparado ? {} : { notas: null }),
      }
      // Si ya estaba preparado (sin fecha), se completa ese registro en vez de crear otro
      const { error } = m.preparado
        ? await supabase.from('impuestos').update(fila_).eq('id', m.preparado.id)
        : await supabase.from('impuestos').insert(fila_)
      if (error) throw new Error(await errorMessage(error))
      notify(`${m.modelo} marcado como presentado: el cliente lo ve en Impuestos`)
      onHecho()
      onClose()
    } catch (e) {
      notify((e as Error).message, 'error')
    }
    setGuardando(false)
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Presentado: ${m.modelo} ${nombrePeriodo(m.periodo)} ${m.anio}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={guardar} loading={guardando}>
            Guardar
          </Button>
        </>
      }
    >
      <p className="mb-4 font-medium">{nombreDe(fila.perfil)}</p>
      {m.preparado && <p className="mb-4 rounded-xl bg-ambar/10 px-3 py-2 text-sm">Ya estaba preparado en su Impuestos: se completa ese registro.</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Resultado">
          <Select value={resultado} onChange={(e) => setResultado(e.target.value as Resultado)}>
            {Object.entries(RESULTADOS).map(([id, r]) => (
              <option key={id} value={id}>
                {r.label}
              </option>
            ))}
          </Select>
        </Field>
        {conImporte && (
          <Field label="Importe">
            <NumInput className="text-right" value={importe} onValue={setImporte} />
          </Field>
        )}
        <Field label="Fecha de presentación">
          <Input type="date" value={dia} onChange={(e) => setDia(e.target.value)} />
        </Field>
        <Field label="Justificante (PDF)">
          <label className="flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-line px-3 text-sm hover:border-ink/40">
            <FileText className="size-4 shrink-0 text-muted" />
            <span className="min-w-0 flex-1 truncate">{archivo ? archivo.name : 'Elegir archivo'}</span>
            <input type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
          </label>
        </Field>
        <Field label="Notas (opcional)" className="sm:col-span-2">
          <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Ej.: domiciliado el 20 de enero" />
        </Field>
      </div>
      <p className="mt-3 text-sm text-muted">Queda en su apartado Impuestos, donde lo ve el cliente con el justificante.</p>
    </Modal>
  )
}
