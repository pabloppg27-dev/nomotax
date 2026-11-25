import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CheckCircle2, Copy, Download, FileMinus, Mail, Save, Send, Trash2, Undo2 } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { errorMessage, supabase } from '../lib/supabase'
import { fecha as fmtFecha, fechaLarga, hoyISO } from '../lib/format'
import { calcularTotales, lineaVacia } from '../lib/totals'
import { CAUSAS_RECTIFICACION, analizarFacturas } from '../lib/estados'
import { crearBorradorRectificativa } from '../lib/rectificativa'
import { MODO_PRUEBAS_FACTURAS } from '../lib/config'
import type { CausaRectificacion, ClienteSnapshot, Emisor, Invoice, Linea } from '../lib/types'
import ContactPicker from '../components/ContactPicker'
import EnviarFactura from '../components/EnviarFactura'
import { NOMBRE_IDIOMA, idiomaDePais } from '../lib/idiomaFactura'
import { snapshotDe } from '../components/ContactForm'
import DocShell from '../components/DocShell'
import LinesEditor from '../components/LinesEditor'
import TotalsBox from '../components/TotalsBox'
import CobroFactura, { type EleccionCobro } from '../components/CobroFactura'
import { cambioBCE } from '../lib/divisas'
import { cobroPropuesto, copiaCuentas, cuentaPorDefecto, cuentasDe, cuentasDeFactura, dinero, esEur, importesFactura } from '../lib/cuentasBancarias'
import { Badge, Button, Card, Field, Input, Loading, Modal, Select, Textarea, confirmar, notify } from '../components/ui'

export default function FacturaEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { ownerId, owner, isAdvisor, rol } = useAuth()
  // El comercial prepara facturas, pero las emite el titular o administración (supabase/usuarios.sql)
  const soloBorradores = rol === 'comercial'

  const [cargando, setCargando] = useState(Boolean(id))
  const [factura, setFactura] = useState<Invoice | null>(null)
  const [contactId, setContactId] = useState<string | null>(null)
  const [cliente, setCliente] = useState<ClienteSnapshot>({})
  const [fecha, setFecha] = useState(hoyISO())
  const [vencimiento, setVencimiento] = useState(hoyISO())
  const [lineas, setLineas] = useState<Linea[]>([lineaVacia()])
  const [irpf, setIrpf] = useState(0)
  const [notas, setNotas] = useState('')
  const [causa, setCausa] = useState<CausaRectificacion>('R1')
  const [motivo, setMotivo] = useState('')
  type Min = Pick<Invoice, 'id' | 'numero' | 'estado' | 'total' | 'tipo' | 'rectifica_id' | 'vencimiento'>
  const [rectificadaPor, setRectificadaPor] = useState<Min[]>([])
  const [original, setOriginal] = useState<Min | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [fechaCobro, setFechaCobro] = useState<string | null>(null)
  const [enviar, setEnviar] = useState(false)
  // Cobro: moneda de la factura y cuentas que salen (supabase/cuentas-bancarias.sql)
  const [cobro, setCobro] = useState<EleccionCobro>(() => ({
    moneda: 'EUR',
    cuentaLocal: null,
    cuentaEur: cuentaPorDefecto(cuentasDe(owner), 'EUR')?.id ?? null,
  }))
  const [cambio, setCambio] = useState<{ tasa: number; fecha: string } | null>(null)
  const [cargandoCambio, setCargandoCambio] = useState(false)

  const aplicar = (f: Invoice) => {
    setFactura(f)
    setContactId(f.contact_id)
    setCliente(f.cliente ?? {})
    setFecha(f.fecha)
    setVencimiento(f.vencimiento ?? '')
    setLineas(f.lineas?.length ? f.lineas : [lineaVacia()])
    setIrpf(Number(f.irpf_pct))
    setNotas(f.notas ?? '')
    setCausa(f.causa_rectificacion ?? 'R1')
    setMotivo(f.motivo_rectificacion ?? '')
    const moneda = (f.moneda || 'EUR').toUpperCase()
    const guardadas = Array.isArray(f.cuentas_cobro) ? f.cuentas_cobro : null
    const disponibles = cuentasDe(owner)
    const existe = (id: string | undefined) => (id && disponibles.some((c) => c.id === id) ? id : null)
    setCobro({
      moneda,
      cuentaLocal: esEur(moneda)
        ? null
        : guardadas
          ? existe(guardadas.find((c) => c.moneda === moneda)?.id)
          : cuentaPorDefecto(disponibles, moneda)?.id ?? null,
      cuentaEur: guardadas ? existe(guardadas.find((c) => esEur(c.moneda))?.id) : cuentaPorDefecto(disponibles, 'EUR')?.id ?? null,
    })
    setCambio(f.tipo_cambio && f.fecha_cambio ? { tasa: Number(f.tipo_cambio), fecha: f.fecha_cambio } : null)
  }

  useEffect(() => {
    if (!id) return
    setCargando(true)
    supabase
      .from('invoices')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          notify('No se ha encontrado la factura', 'error')
          navigate('/facturas')
          return
        }
        if ((data as Invoice).origen === 'externa') {
          navigate(`/facturas?ver=${data.id}`, { replace: true })
          return
        }
        aplicar(data as Invoice)
        setCargando(false)
        const rid = (data as Invoice).rectifica_id
        if (rid) {
          supabase
            .from('invoices')
            .select('id, numero, estado, total, tipo, rectifica_id, vencimiento')
            .eq('id', rid)
            .maybeSingle()
            .then(({ data: o }) => setOriginal((o as Min) ?? null))
        }
      })
    // Rectificativas que corrigen esta factura
    supabase
      .from('invoices')
      .select('id, numero, estado, total, tipo, rectifica_id, vencimiento')
      .eq('rectifica_id', id)
      .order('created_at')
      .then(({ data }) => setRectificadaPor((data as Min[]) ?? []))
  }, [id, navigate])

  const totales = useMemo(() => calcularTotales(lineas, irpf), [lineas, irpf])
  const bloqueada = Boolean(factura && factura.estado !== 'borrador')
  const otraMoneda = !esEur(cobro.moneda)

  // Factura en otra moneda: cambio oficial del BCE del día de la factura (o el último publicado)
  useEffect(() => {
    if (bloqueada || !otraMoneda) {
      if (!otraMoneda) setCambio(null)
      return
    }
    let vivo = true
    // Sin cambio mientras llega el nuevo: así nunca se guarda el de otra moneda u otro día
    setCambio(null)
    setCargandoCambio(true)
    cambioBCE(cobro.moneda, fecha)
      .then((c) => vivo && setCambio(c))
      .catch((e) => {
        if (!vivo) return
        setCambio(null)
        notify(e instanceof Error ? e.message : String(e), 'error')
      })
      .finally(() => vivo && setCargandoCambio(false))
    return () => {
      vivo = false
    }
  }, [bloqueada, otraMoneda, cobro.moneda, fecha])

  // Factura nueva: si el perfil llega después de abrirla, su cuenta en euros por defecto
  useEffect(() => {
    if (id || !owner) return
    setCobro((c) => (c.cuentaEur || c.cuentaLocal ? c : { ...c, cuentaEur: cuentaPorDefecto(cuentasDe(owner), 'EUR')?.id ?? null }))
    // Solo al llegar el perfil (no en cada refresco: si quitaste la cuenta a mano, se respeta)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, owner?.id])

  // Lo que sale en la factura en su moneda (de las líneas convertidas, para que cuadre)
  const enMoneda = useMemo(
    () => (otraMoneda && cambio ? importesFactura({ moneda: cobro.moneda, tipo_cambio: cambio.tasa, lineas, irpf_pct: irpf }).totales.total : null),
    [otraMoneda, cambio, cobro.moneda, lineas, irpf],
  )

  if (cargando || !ownerId || !owner) return <Loading />

  const faltanDatosPropios = !owner.nombre || !owner.nif || !owner.direccion
  // Columnas de supabase/cuentas-bancarias.sql: hasta ejecutarlo, la factura se guarda como antes
  const conCuentas = 'cuentas_bancarias' in owner
  const cuentas = cuentasDe(owner)

  /** Al cambiar de moneda, la cuenta de esa moneda por defecto */
  const cambiarCobro = (v: EleccionCobro) =>
    setCobro(
      v.moneda !== cobro.moneda && !v.cuentaLocal && !esEur(v.moneda)
        ? { ...v, cuentaLocal: cuentaPorDefecto(cuentas, v.moneda)?.id ?? null }
        : v,
    )

  const columnasCobro = () => {
    if (!conCuentas) return {}
    const otra = otraMoneda && cambio
    const elegidas = copiaCuentas(cuentas, [otra ? cobro.cuentaLocal : null, cobro.cuentaEur])
    return {
      moneda: otra ? cobro.moneda : 'EUR',
      tipo_cambio: otra ? cambio.tasa : null,
      fecha_cambio: otra ? cambio.fecha : null,
      importe_original: otra ? enMoneda : null,
      cuentas_cobro: elegidas.length ? elegidas : null,
    }
  }
  const esRectificativa = factura?.tipo === 'rectificativa'

  const payload = () => ({
    owner_id: ownerId,
    contact_id: contactId,
    cliente,
    fecha,
    vencimiento: vencimiento || null,
    lineas: lineas.filter((l) => l.concepto.trim() || l.precio),
    irpf_pct: irpf,
    base: totales.base,
    cuota_iva: totales.cuota_iva,
    cuota_irpf: totales.cuota_irpf,
    total: totales.total,
    notas: notas.trim() || null,
    ...(esRectificativa ? { causa_rectificacion: causa, motivo_rectificacion: motivo.trim() || null } : {}),
    ...columnasCobro(),
  })

  const validar = () => {
    if (!cliente.nombre) {
      notify('Elige un cliente', 'error')
      return false
    }
    if (!payload().lineas.length) {
      notify('Añade al menos un concepto', 'error')
      return false
    }
    if (otraMoneda && conCuentas && !cambio) {
      notify(cargandoCambio ? 'Espera un segundo: estamos consultando el cambio del BCE' : `No hay cambio del BCE para ${cobro.moneda}: prueba otra vez o factura en euros`, 'error')
      return false
    }
    return true
  }

  const guardar = async (extra: Record<string, unknown> = {}): Promise<Invoice | null> => {
    if (!validar()) return null
    setGuardando(true)
    const res = factura
      ? await supabase
          .from('invoices')
          .update({ ...payload(), ...extra })
          .eq('id', factura.id)
          .select()
          .single()
      : await supabase
          .from('invoices')
          .insert({ ...payload(), serie: owner.serie_factura || 'F', ...extra })
          .select()
          .single()
    setGuardando(false)
    if (res.error) {
      notify(await errorMessage(res.error), 'error')
      return null
    }
    const f = res.data as Invoice
    aplicar(f)
    if (!factura) navigate(`/facturas/${f.id}`, { replace: true })
    return f
  }

  const guardarBorrador = async () => {
    const f = await guardar()
    if (f) notify('Borrador guardado')
  }

  const emitir = async () => {
    if (!validar()) return
    if (esRectificativa && !motivo.trim()) {
      notify('Explica el motivo de la rectificación antes de emitirla', 'error')
      return
    }
    if (faltanDatosPropios) {
      notify('Completa tu nombre, NIF y dirección en «Mi perfil» antes de emitir', 'error')
      return
    }
    if (!cliente.nif) {
      const seguir = await confirmar({
        titulo: 'Falta el NIF del cliente',
        texto: 'Una factura completa debe llevar el NIF del destinatario. ¿Quieres emitirla igualmente?',
        accion: 'Emitir sin NIF',
      })
      if (!seguir) return
    }
    const ok = await confirmar({
      titulo: esRectificativa ? 'Emitir factura rectificativa' : 'Emitir factura',
      texto:
        `Se le asignará el siguiente número de la serie ${factura?.serie ?? owner.serie_factura} con fecha ${fechaLarga(fecha)}. ` +
        'Una vez emitida no se puede modificar ni borrar.' +
        (MODO_PRUEBAS_FACTURAS ? ' (Modo pruebas: el PDF saldrá marcado como documento de pruebas.)' : ''),
      accion: 'Emitir',
    })
    if (!ok) return
    const f = await guardar({ estado: 'emitida' })
    if (f) {
      notify(`${esRectificativa ? 'Rectificativa' : 'Factura'} ${f.numero} emitida`)
      // Siguiente paso natural: mandársela al cliente
      setEnviar(true)
    }
  }

  const crearRectificativa = async () => {
    if (!factura) return
    const nueva = await crearBorradorRectificativa(factura, owner, rectificadaPor.length)
    if (nueva) navigate(`/facturas/${nueva}`)
  }

  const cambiarEstado = async (estado: 'emitida' | 'cobrada', cobro: string | null = null) => {
    if (!factura) return
    const { data, error } = await supabase
      .from('invoices')
      .update({ estado, fecha_cobro: estado === 'cobrada' ? cobro : null })
      .eq('id', factura.id)
      .select()
      .single()
    setFechaCobro(null)
    if (error) return notify(await errorMessage(error), 'error')
    aplicar(data as Invoice)
    notify(estado === 'cobrada' ? 'Marcada como cobrada' : 'Marcada como pendiente de cobro')
  }

  const toggleContabilizado = async () => {
    if (!factura) return
    const { data, error } = await supabase
      .from('invoices')
      .update({ contabilizado: !factura.contabilizado })
      .eq('id', factura.id)
      .select()
      .single()
    if (error) return notify(await errorMessage(error), 'error')
    aplicar(data as Invoice)
  }

  const pdf = async () => {
    const f = bloqueada ? factura : await guardar()
    if (!f) return
    const { descargarPdf } = await import('../lib/pdf')
    await descargarPdf('factura', f, (f.emisor as Emisor) ?? (owner as Emisor), {
      color: owner?.color_marca,
      nombreComercial: owner?.nombre_comercial,
    })
  }

  const duplicar = async () => {
    if (!factura) return
    const { data, error } = await supabase
      .from('invoices')
      .insert({
        owner_id: ownerId,
        contact_id: factura.contact_id,
        cliente: factura.cliente,
        serie: factura.serie,
        fecha: hoyISO(),
        vencimiento: hoyISO(),
        lineas: factura.lineas,
        irpf_pct: factura.irpf_pct,
        base: factura.base,
        cuota_iva: factura.cuota_iva,
        cuota_irpf: factura.cuota_irpf,
        total: factura.total,
        notas: factura.notas,
        // Misma moneda y cuentas; el cambio se vuelve a consultar con la fecha nueva
        ...(conCuentas ? { moneda: factura.moneda ?? 'EUR', cuentas_cobro: factura.cuentas_cobro ?? null } : {}),
      })
      .select()
      .single()
    if (error) return notify(await errorMessage(error), 'error')
    notify('Copia creada como borrador')
    navigate(`/facturas/${data.id}`)
  }

  const borrar = async () => {
    if (!factura) return navigate('/facturas')
    const ok = await confirmar({
      titulo: 'Eliminar borrador',
      texto: '¿Eliminar este borrador de factura? No se puede deshacer.',
      accion: 'Eliminar',
      peligro: true,
    })
    if (!ok) return
    const { error } = await supabase.from('invoices').delete().eq('id', factura.id)
    if (error) return notify(await errorMessage(error), 'error')
    notify('Borrador eliminado')
    navigate('/facturas')
  }

  const est =
    factura && factura.estado !== 'borrador'
      ? analizarFacturas([factura, ...rectificadaPor, ...(original ? [original] : [])], hoyISO()).get(factura.id) ?? null
      : factura
        ? { label: 'Borrador', tono: 'gris' as const }
        : null
  // Anulada del todo por rectificativas, o rectificativa ya descontada de una factura sin cobrar: no hay cobro ni abono que marcar
  const sinMovimiento = est?.label === 'Anulada' || est?.label === 'Aplicada'
  const titulo = esRectificativa
    ? factura?.numero
      ? `Rectificativa ${factura.numero}`
      : 'Borrador de factura rectificativa'
    : factura?.numero
      ? `Factura ${factura.numero}`
      : factura
        ? 'Borrador de factura'
        : 'Nueva factura'

  return (
    <>
    <DocShell
      back="/facturas"
      backLabel="Facturas"
      title={titulo}
      badge={
        <>
          {est && <Badge tono={est.tono}>{est.label}</Badge>}
          {factura?.contabilizado && <Badge tono="verde">Contabilizada</Badge>}
        </>
      }
      aviso={
        <>
          {!bloqueada && faltanDatosPropios && (
            <div className="mb-6 rounded-xl bg-ambar/10 px-4 py-3 text-sm text-ambar">
              Para emitir facturas necesitas completar tus datos fiscales (nombre, NIF y dirección) en{' '}
              <Link to="/perfil" className="font-medium underline">
                Mi perfil
              </Link>
              .
            </div>
          )}
          {MODO_PRUEBAS_FACTURAS && (
            <div className="mb-6 rounded-xl bg-ink/5 px-4 py-3 text-sm text-ink/75">
              <strong>Modo pruebas.</strong> La emisión de facturas todavía no está conectada a Verifactu: los PDF salen
              marcados como documento de pruebas.
            </div>
          )}
          {esRectificativa && factura && (
            <Card className="mb-6 border-ink/20 p-5 sm:p-6">
              <p className="mb-4 text-[15px]">
                Rectifica la factura{' '}
                {factura.rectifica_id ? (
                  <Link to={`/facturas/${factura.rectifica_id}`} className="font-medium underline">
                    {factura.rectifica_numero}
                  </Link>
                ) : (
                  <strong>{factura.rectifica_numero}</strong>
                )}
                {factura.rectifica_fecha && ` del ${fmtFecha(factura.rectifica_fecha)}`}.
                {!bloqueada && (
                  <span className="mt-1 block text-sm text-muted">
                    Por defecto anula la factura entera. Si solo corriges una parte, deja en los conceptos únicamente la diferencia.
                  </span>
                )}
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Causa">
                  <Select value={causa} disabled={bloqueada} onChange={(e) => setCausa(e.target.value as CausaRectificacion)}>
                    {CAUSAS_RECTIFICACION.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.id} · {c.nombre}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Motivo (aparece en la factura)">
                  <Input
                    value={motivo}
                    disabled={bloqueada}
                    onChange={(e) => setMotivo(e.target.value)}
                    placeholder="Ej.: error en el precio del servicio"
                  />
                </Field>
              </div>
            </Card>
          )}
          {rectificadaPor.length > 0 && (
            <div className="mb-6 rounded-xl bg-ambar/10 px-4 py-3 text-sm">
              Esta factura está rectificada por{' '}
              {rectificadaPor.map((r, i) => (
                <span key={r.id}>
                  {i > 0 && ', '}
                  <Link to={`/facturas/${r.id}`} className="font-medium underline">
                    {r.numero ?? 'un borrador'}
                  </Link>
                </span>
              ))}
              .
            </div>
          )}
          {factura?.quote_id && (
            <p className="-mt-3 mb-6 text-sm text-muted">
              Creada a partir de un{' '}
              <Link to={`/presupuestos/${factura.quote_id}`} className="underline">
                presupuesto
              </Link>
              .
            </p>
          )}
        </>
      }
      cliente={
        <>
          <ContactPicker
            ownerId={ownerId}
            contactId={contactId}
            cliente={cliente}
            disabled={bloqueada}
            onPick={(c) => {
              setContactId(c.id)
              setCliente(snapshotDe(c))
              // Cliente de EE. UU., Reino Unido…: si tienes cuenta en su moneda, la factura sale en ella
              if (conCuentas) setCobro(cobroPropuesto(cuentas, c.pais))
            }}
          />
          {cliente.nombre && idiomaDePais(cliente.pais) !== 'es' && (
            <p className="mt-2 text-sm text-muted">El PDF saldrá en {NOMBRE_IDIOMA[idiomaDePais(cliente.pais)]} (cliente de {cliente.pais}).</p>
          )}
        </>
      }
      fechas={
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fecha de factura">
            <Input type="date" value={fecha} disabled={bloqueada} onChange={(e) => {
                // Si el vencimiento iba el mismo día que la fecha, lo mueve con ella
                if (vencimiento === fecha) setVencimiento(e.target.value)
                setFecha(e.target.value)
              }} />
          </Field>
          <Field label="Vencimiento">
            <Input type="date" value={vencimiento} disabled={bloqueada} onChange={(e) => setVencimiento(e.target.value)} />
          </Field>
          <p className="col-span-2 text-sm text-muted">
            Serie <strong className="text-ink">{factura?.serie ?? owner.serie_factura}</strong>{esRectificativa && ' (rectificativas)'}
            {factura?.numero ? ` · Nº ${factura.numero}` : ' · el número se asigna al emitir'}
          </p>
        </div>
      }
      lineas={<LinesEditor lineas={lineas} onChange={setLineas} disabled={bloqueada} />}
      cobro={
        conCuentas ? (
          <CobroFactura
            owner={owner}
            valor={cobro}
            onChange={cambiarCobro}
            cambio={cambio}
            cargandoCambio={cargandoCambio}
            totalEur={totales.total}
            totalMoneda={enMoneda}
            paisCliente={cliente.pais}
            bloqueada={bloqueada}
            cuentasEmitida={factura ? cuentasDeFactura(factura, factura.emisor as Emisor | null) : []}
          />
        ) : null
      }
      notas={
        <Textarea
          placeholder="Texto que aparecerá en la factura (opcional)"
          value={notas}
          disabled={bloqueada}
          onChange={(e) => setNotas(e.target.value)}
        />
      }
      totales={
        <>
          <TotalsBox totales={totales} irpfPct={irpf} onIrpf={setIrpf} disabled={bloqueada} />
          {otraMoneda && enMoneda !== null && (
            <p className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-lima/40 px-4 py-2.5 text-[15px]">
              <span>En la factura</span>
              <span className="num font-semibold">{dinero(enMoneda, cobro.moneda)}</span>
            </p>
          )}
        </>
      }
      acciones={
        bloqueada && factura ? (
          <>
            {!soloBorradores && (
              <Button variant={factura.enviada_at ? 'secondary' : 'accent'} icon={<Mail className="size-4" />} onClick={() => setEnviar(true)}>
                {factura.enviada_at ? 'Enviar otra vez' : 'Enviar por email'}
              </Button>
            )}
            {factura.enviada_at && (
              <p className="-mt-1 px-1 text-xs text-muted">
                Enviada el {fmtFecha(factura.enviada_at)} a {factura.enviada_a}
              </p>
            )}
            <Button icon={<Download className="size-4" />} onClick={pdf}>
              Descargar PDF
            </Button>
            {sinMovimiento || soloBorradores ? null : factura.estado === 'emitida' ? (
              <Button variant="secondary" icon={<CheckCircle2 className="size-4" />} onClick={() => setFechaCobro(hoyISO())}>
                {esRectificativa ? 'Marcar como abonada' : 'Marcar como cobrada'}
              </Button>
            ) : (
              <Button variant="secondary" icon={<Undo2 className="size-4" />} onClick={() => cambiarEstado('emitida')}>
                {esRectificativa ? 'Marcar como pendiente de abono' : 'Marcar como pendiente de cobro'}
              </Button>
            )}
            {!esRectificativa && !sinMovimiento && !soloBorradores && (
              <Button variant="secondary" icon={<FileMinus className="size-4" />} onClick={crearRectificativa}>
                Crear factura rectificativa
              </Button>
            )}
            {!esRectificativa && (
              <Button variant="ghost" icon={<Copy className="size-4" />} onClick={duplicar}>
                Duplicar como borrador
              </Button>
            )}
            <p className="px-1 text-xs text-muted">Las facturas emitidas no se pueden modificar ni borrar: se corrigen con una rectificativa.</p>
            {isAdvisor && (
              <label className="mt-2 flex items-center gap-2 px-1 text-sm">
                <input type="checkbox" className="size-4 accent-ink" checked={factura.contabilizado} onChange={toggleContabilizado} />
                Contabilizada por el asesor
              </label>
            )}
          </>
        ) : (
          <>
            {soloBorradores ? (
              <>
                <Button variant="accent" icon={<Save className="size-4" />} loading={guardando} onClick={guardarBorrador}>
                  Guardar borrador
                </Button>
                <p className="px-1 text-xs text-muted">La emite el titular o alguien de administración: le aparecerá en Facturas como borrador.</p>
              </>
            ) : (
              <>
                <Button variant="accent" icon={<Send className="size-4" />} onClick={emitir} disabled={guardando}>
                  {esRectificativa ? 'Emitir rectificativa' : 'Emitir factura'}
                </Button>
                <Button icon={<Save className="size-4" />} loading={guardando} onClick={guardarBorrador}>
                  Guardar borrador
                </Button>
              </>
            )}
            <Button variant="secondary" icon={<Download className="size-4" />} onClick={pdf}>
              Vista previa en PDF
            </Button>
            <Button variant="ghost" icon={<Trash2 className="size-4" />} onClick={borrar} className="text-rojo">
              {factura ? 'Eliminar borrador' : 'Descartar'}
            </Button>
          </>
        )
      }
    />
    {enviar && factura && factura.estado !== 'borrador' && (
      <EnviarFactura
        factura={factura}
        onClose={() => setEnviar(false)}
        onEnviada={(r) => setFactura((f) => (f ? { ...f, ...r } : f))}
      />
    )}
    {fechaCobro !== null && (
      <Modal
        open
        onClose={() => setFechaCobro(null)}
        title={esRectificativa ? '¿Cuándo se abonó?' : '¿Cuándo la cobraste?'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setFechaCobro(null)}>
              Cancelar
            </Button>
            <Button icon={<CheckCircle2 className="size-4" />} onClick={() => cambiarEstado('cobrada', fechaCobro || hoyISO())}>
              {esRectificativa ? 'Marcar como abonada' : 'Marcar como cobrada'}
            </Button>
          </>
        }
      >
        <Field label="Fecha del cobro" hint="Así el banco y los clientes de la contabilidad cuadran con tu extracto.">
          <Input type="date" value={fechaCobro} onChange={(e) => setFechaCobro(e.target.value)} />
        </Field>
      </Modal>
    )}
    </>
  )
}
