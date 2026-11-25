/**
 * Configuración → Plantillas: el asunto y el mensaje de cada correo que envía la empresa
 * (facturas, accesos, nóminas, presupuestos) con {variables} y vista previa con su logo y color de marca.
 * Desde dónde salen los correos (su dominio) se configura aparte, en «Correo».
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Palette, RotateCcw, Save } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { errorMessage, supabase } from '../lib/supabase'
import { hoyISO } from '../lib/format'
import { correoDeFactura, htmlCorreoFactura } from '../lib/correoFactura'
import {
  ASUNTO_EQUIPO,
  FUNCIONES_ROL,
  NOMBRE_ROL,
  PLANTILLAS,
  correoDePlantilla,
  ejemploPlantilla,
  htmlCorreoPlantilla,
  plantillaDe,
  type TipoPlantilla,
} from '../lib/plantillasCorreo'
import { Badge, Button, Card, Field, Input, Textarea, cx, notify } from './ui'
import SelectorColor, { hexValido, normalizarHex } from './SelectorColor'
import { VistaPreviaCorreo, nombreEmpresa, useLogoUrl, useRemitente } from './CorreoComun'

type Borrador = { asunto: string; mensaje: string }
type ColoresCorreo = { color: string; cabecera: string; boton: string }

const LIMA = '#CDF564'
const NEGRO = '#111110'

/** Combinaciones listas para elegir (vacío = el color de NomoTax: negro y lima) */
const COMBINACIONES: { nombre: string; colores: ColoresCorreo }[] = [
  { nombre: 'Negro y lima', colores: { color: '', cabecera: '', boton: '' } },
  { nombre: 'Azul', colores: { color: '#7FB2FF', cabecera: '#12307A', boton: '#12307A' } },
  { nombre: 'Verde', colores: { color: '#7BE0A8', cabecera: '#0F3D2E', boton: '#0F3D2E' } },
  { nombre: 'Granate', colores: { color: '#F5A3B5', cabecera: '#5A1424', boton: '#5A1424' } },
  { nombre: 'Claro', colores: { color: '#111110', cabecera: '#F2F2EE', boton: '#111110' } },
]

export default function Plantillas() {
  const { owner, refresh } = useAuth()
  const remitente = useRemitente()
  const logo = useLogoUrl(owner?.logo_path)
  const [tipo, setTipo] = useState<TipoPlantilla>('factura')
  const [borradores, setBorradores] = useState<Partial<Record<TipoPlantilla, Borrador>>>({})
  const [guardando, setGuardando] = useState(false)
  // En «Accesos», la vista previa puede enseñar el correo de equipo (el que recibe el rol empleado)
  const [verEquipo, setVerEquipo] = useState(false)
  const ultimoCampo = useRef<'asunto' | 'mensaje'>('mensaje')
  const refAsunto = useRef<HTMLInputElement>(null)
  const refMensaje = useRef<HTMLTextAreaElement>(null)

  const def = plantillaDe(tipo)

  // Lo guardado de cada tipo (vacío = el texto de por defecto)
  const guardado = useMemo(() => {
    const r = {} as Record<TipoPlantilla, Borrador>
    for (const p of PLANTILLAS) {
      r[p.tipo] = {
        asunto: (owner?.[p.colAsunto] as string | null | undefined)?.trim() || p.porDefecto.asunto,
        mensaje: (owner?.[p.colMensaje] as string | null | undefined)?.trim() || p.porDefecto.mensaje,
      }
    }
    return r
  }, [owner])

  // Si cambia lo guardado (guardar, cambiar de empresa), se descartan los borradores
  useEffect(() => setBorradores({}), [guardado])

  // Colores del diseño (valen para todos los correos). El acento es el color de marca de siempre.
  const coloresGuardados: ColoresCorreo = {
    color: owner?.color_marca ?? '',
    cabecera: owner?.color_cabecera ?? '',
    boton: owner?.color_boton ?? '',
  }
  const [colores, setColores] = useState<ColoresCorreo>(coloresGuardados)
  const [guardandoColores, setGuardandoColores] = useState(false)
  const clave = `${coloresGuardados.color}|${coloresGuardados.cabecera}|${coloresGuardados.boton}`
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setColores(coloresGuardados), [clave])

  if (!owner) return null
  const actual = borradores[tipo] ?? guardado[tipo]
  const cambiado = actual.asunto !== guardado[tipo].asunto || actual.mensaje !== guardado[tipo].mensaje
  const esDefecto = actual.asunto === def.porDefecto.asunto && actual.mensaje === def.porDefecto.mensaje
  // Hasta que se ejecuten los SQL (envio-facturas.sql, correo-empresa.sql) las columnas no existen
  const columnasOk = def.colMensaje in owner

  const empresa = nombreEmpresa(owner)
  const responder = owner.email_respuesta || remitente.direccion || owner.email || '—'
  const hexes = {
    color: normalizarHex(colores.color),
    cabecera: normalizarHex(colores.cabecera),
    boton: normalizarHex(colores.boton),
  }
  const coloresOk = hexValido(hexes.color) && hexValido(hexes.cabecera) && hexValido(hexes.boton)
  const coloresCambiados = (['color', 'cabecera', 'boton'] as const).some((k) => hexes[k] !== coloresGuardados[k].toUpperCase())
  // Hasta que se ejecute supabase/plantillas-diseno.sql las columnas de la cabecera y el botón no existen
  const disenoActivo = 'color_cabecera' in owner
  // La vista previa enseña lo que se está tocando, aunque aún no esté guardado
  const diseno = {
    empresa,
    color: coloresOk ? hexes.color || null : owner.color_marca,
    cabecera: coloresOk ? hexes.cabecera || null : owner.color_cabecera,
    boton: coloresOk ? hexes.boton || null : owner.color_boton,
    logo,
    respuesta: responder,
    telefono: owner.telefono,
  }

  let asuntoListo: string
  let html: string
  if (tipo === 'factura') {
    const ejemplo = {
      cliente: 'Laura García',
      numero: `${owner.serie_factura || 'F'}${new Date().getFullYear()}-0001`,
      fecha: hoyISO(),
      vencimiento: hoyISO(),
      total: 1210,
      empresa,
      pais: 'España',
      lineas: [
        { concepto: 'Diseño de la web corporativa\nMaquetación, textos y puesta en marcha', cantidad: 1, precio: 800, iva: 21 },
        { concepto: 'Mantenimiento mensual', cantidad: 2, precio: 100, iva: 21 },
      ],
      irpf_pct: 0,
    }
    const listo = correoDeFactura(actual, ejemplo)
    asuntoListo = listo.asunto
    html = htmlCorreoFactura(listo.mensaje, ejemplo, { ...diseno, iban: owner.iban })
  } else if (tipo === 'acceso' && verEquipo) {
    const vars = { ...ejemploPlantilla('acceso', empresa), rol: NOMBRE_ROL.empleado, funciones: FUNCIONES_ROL.empleado }
    asuntoListo = ASUNTO_EQUIPO
    html = htmlCorreoPlantilla('equipo', '', vars, diseno)
  } else {
    const vars = ejemploPlantilla(tipo, empresa)
    const listo = correoDePlantilla(tipo, actual, vars)
    asuntoListo = listo.asunto
    html = htmlCorreoPlantilla(tipo, listo.mensaje, vars, diseno)
  }

  const poner = (parcial: Partial<Borrador>) => setBorradores((b) => ({ ...b, [tipo]: { ...actual, ...parcial } }))

  const insertar = (v: string) => {
    const token = `{${v}}`
    const campo = ultimoCampo.current
    const el = campo === 'asunto' ? refAsunto.current : refMensaje.current
    const valor = actual[campo]
    const ini = el?.selectionStart ?? valor.length
    const fin = el?.selectionEnd ?? valor.length
    poner({ [campo]: valor.slice(0, ini) + token + valor.slice(fin) })
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(ini + token.length, ini + token.length)
    })
  }

  const guardarColores = async () => {
    if (!coloresOk) return notify('Los colores tienen que ser como #1D4FD7', 'error')
    setGuardandoColores(true)
    const { error } = await supabase
      .from('profiles')
      .update({ color_marca: hexes.color || null, color_cabecera: hexes.cabecera || null, color_boton: hexes.boton || null })
      .eq('id', owner.id)
    setGuardandoColores(false)
    if (error) return notify(await errorMessage(error), 'error')
    await refresh()
    notify('Diseño guardado')
  }

  const guardar = async () => {
    if (!actual.asunto.trim()) return notify('El asunto no puede quedar vacío', 'error')
    if (!actual.mensaje.trim()) return notify('El mensaje no puede quedar vacío', 'error')
    setGuardando(true)
    const { error } = await supabase
      .from('profiles')
      .update({
        // Si es el texto de por defecto se guarda vacío: así le llegan las mejoras que hagamos
        [def.colAsunto]: actual.asunto.trim() === def.porDefecto.asunto ? null : actual.asunto.trim(),
        [def.colMensaje]: actual.mensaje.trim() === def.porDefecto.mensaje ? null : actual.mensaje.trim(),
      })
      .eq('id', owner.id)
    setGuardando(false)
    if (error) return notify(await errorMessage(error), 'error')
    await refresh()
    notify('Plantilla guardada')
  }

  return (
    <div className="space-y-6">
      {/* Qué correo se edita */}
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Plantillas">
        {PLANTILLAS.map((p) => (
          <button
            key={p.tipo}
            role="tab"
            aria-selected={p.tipo === tipo}
            onClick={() => setTipo(p.tipo)}
            className={cx(
              'rounded-full px-4 py-2 text-[15px] transition-colors',
              p.tipo === tipo ? 'bg-ink font-medium text-white' : 'bg-paper text-ink/75 ring-1 ring-line hover:bg-ink/[0.05] hover:text-ink',
            )}
          >
            {p.titulo}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          {!columnasOk && (
            <div className="rounded-xl bg-ambar/10 px-4 py-3 text-sm text-ambar">
              Falta activar las plantillas en la base de datos ({tipo === 'factura' ? 'supabase/envio-facturas.sql' : 'supabase/correo-empresa.sql'}). Hasta
              entonces no se pueden guardar.
            </div>
          )}
          <Card className="space-y-4 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="font-semibold">Correo de {def.titulo.toLowerCase()}</h4>
                  {!def.enUso && <Badge tono="ambar">Preparada</Badge>}
                </div>
                <p className="mt-1 text-sm text-muted">{def.detalle}</p>
                {!def.enUso && (
                  <p className="mt-1 text-sm text-muted">Ya puedes dejarla a tu gusto: se usará en cuanto se puedan enviar desde la plataforma.</p>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                icon={<RotateCcw className="size-3.5" />}
                onClick={() => poner({ asunto: def.porDefecto.asunto, mensaje: def.porDefecto.mensaje })}
                disabled={esDefecto}
              >
                Por defecto
              </Button>
            </div>
            <Field label="Asunto">
              <Input
                ref={refAsunto}
                value={actual.asunto}
                maxLength={200}
                onFocus={() => (ultimoCampo.current = 'asunto')}
                onChange={(e) => poner({ asunto: e.target.value })}
              />
            </Field>
            <Field label="Mensaje">
              <Textarea
                ref={refMensaje}
                rows={11}
                maxLength={5000}
                value={actual.mensaje}
                onFocus={() => (ultimoCampo.current = 'mensaje')}
                onChange={(e) => poner({ mensaje: e.target.value })}
              />
            </Field>
            <div>
              <p className="mb-2 text-[13px] font-medium text-ink/80">Insertar dato</p>
              <div className="flex flex-wrap gap-1.5">
                {def.variables.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    title={v.detalle}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => insertar(v.id)}
                    className="rounded-full bg-paper px-2.5 py-1 font-mono text-xs text-ink ring-1 ring-line hover:bg-lima/40"
                  >
                    {`{${v.id}}`}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted">
                {tipo === 'factura'
                  ? 'A los clientes de fuera de España se les envía en inglés, igual que el PDF. '
                  : tipo === 'acceso'
                    ? 'El usuario, la contraseña y el botón de entrada se añaden solos debajo del mensaje. Los empleados reciben un correo propio de equipo, con el aviso del registro de jornada (míralo en la vista previa). '
                    : 'El PDF va adjunto y se añade solo un resumen debajo del mensaje. '}
                El logo y el color son los de tu Perfil.
              </p>
            </div>
          </Card>

          <Card className="space-y-4 p-5">
            <div>
              <h4 className="flex items-center gap-2 font-semibold">
                <Palette className="size-4" /> Diseño de tus correos
              </h4>
              <p className="mt-1 text-sm text-muted">Los colores valen para todos los correos. El texto se ajusta solo para que siempre se lea.</p>
            </div>
            {!disenoActivo && (
              <div className="rounded-xl bg-ambar/10 px-4 py-3 text-sm text-ambar">
                Falta activar los colores en la base de datos (supabase/plantillas-diseno.sql). Hasta entonces solo se puede cambiar el color de acento.
              </div>
            )}
            <div>
              <p className="mb-2 text-[13px] font-medium text-ink/80">Combinaciones</p>
              <div className="flex flex-wrap gap-2">
                {COMBINACIONES.map((c) => (
                  <button
                    key={c.nombre}
                    type="button"
                    disabled={!disenoActivo}
                    onClick={() => setColores(c.colores)}
                    className="flex items-center gap-2 rounded-full bg-paper py-1 pl-1.5 pr-3 text-sm ring-1 ring-line hover:bg-lima/30 disabled:opacity-50"
                  >
                    <span className="flex overflow-hidden rounded-full ring-1 ring-ink/10">
                      <span className="size-5" style={{ background: c.colores.cabecera || NEGRO }} />
                      <span className="size-5" style={{ background: c.colores.color || LIMA }} />
                    </span>
                    {c.nombre}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectorColor
                label="Fondo de la cabecera"
                hint="Donde van el logo y tu nombre. Vacío: negro."
                valor={colores.cabecera}
                porDefecto={NEGRO}
                onChange={(v) => disenoActivo && setColores((c) => ({ ...c, cabecera: v }))}
              />
              <SelectorColor
                label="Color de acento"
                hint="Franja, etiquetas y caja del total. También es el color de marca de tus PDF. Vacío: lima."
                valor={colores.color}
                porDefecto={LIMA}
                onChange={(v) => setColores((c) => ({ ...c, color: v }))}
              />
              <SelectorColor
                label="Botón de entrada"
                hint="El botón del correo de accesos. Vacío: negro."
                valor={colores.boton}
                porDefecto={NEGRO}
                onChange={(v) => disenoActivo && setColores((c) => ({ ...c, boton: v }))}
              />
            </div>
            <div className="flex justify-end">
              <Button variant="secondary" icon={<Save className="size-4" />} onClick={guardarColores} loading={guardandoColores} disabled={!coloresCambiados || !coloresOk}>
                Guardar diseño
              </Button>
            </div>
          </Card>

          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted">
              {remitente.propio ? (
                <>
                  Sale desde <strong className="text-ink">{remitente.direccion}</strong>.
                </>
              ) : (
                <>
                  Sale desde <strong className="text-ink">{remitente.direccion}</strong>. Para enviarlo desde tu dominio, conéctalo en «Correo».
                </>
              )}
            </p>
            <Button variant="accent" icon={<Save className="size-4" />} onClick={guardar} loading={guardando} disabled={!cambiado || !columnasOk}>
              Guardar
            </Button>
          </div>
        </div>

        <div className="lg:sticky lg:top-0 lg:self-start">
          <p className="mb-2 text-[13px] font-medium text-ink/80">Vista previa (con datos de ejemplo)</p>
          {tipo === 'acceso' && (
            <div className="mb-3 flex flex-wrap gap-2" role="tablist" aria-label="Correo de accesos según el rol">
              {[
                { equipo: false, texto: 'Administración, socio y comercial' },
                { equipo: true, texto: 'Empleados' },
              ].map((o) => (
                <button
                  key={o.texto}
                  type="button"
                  role="tab"
                  aria-selected={verEquipo === o.equipo}
                  onClick={() => setVerEquipo(o.equipo)}
                  className={cx(
                    'rounded-full px-3 py-1.5 text-sm transition-colors',
                    verEquipo === o.equipo ? 'bg-ink font-medium text-white' : 'bg-paper text-ink/75 ring-1 ring-line hover:bg-ink/[0.05] hover:text-ink',
                  )}
                >
                  {o.texto}
                </button>
              ))}
            </div>
          )}
          {tipo === 'acceso' && verEquipo && (
            <p className="mb-3 text-xs text-muted">Este correo tiene un texto fijo: no cambia con la plantilla de la izquierda.</p>
          )}
          <VistaPreviaCorreo de={remitente.de} responder={responder} asunto={asuntoListo} html={html} />
        </div>
      </div>
    </div>
  )
}
