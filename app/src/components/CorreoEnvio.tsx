/**
 * Configuración → Correo: la empresa conecta el servidor SMTP de su dominio (Google Workspace, Microsoft 365,
 * su hosting…) y TODOS sus correos (facturas, accesos, nóminas, presupuestos) salen desde su propio email.
 * Si no lo conecta, salen desde info@nomotax.io con su nombre. Aquí también: a dónde llegan las respuestas.
 * La contraseña la cifra y la guarda la función smtp-config; esta pantalla nunca la vuelve a ver.
 */
import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Plug, Power, Save, Trash2, TriangleAlert } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { errorMessage, invocar, supabase } from '../lib/supabase'
import { PROVEEDORES_SMTP, proveedorSmtp } from '../lib/smtp'
import { Badge, Button, Card, Field, Input, Select, confirmar, notify } from './ui'
import { REMITENTE_FACTURAS, nombreEmpresa, useSmtpEmpresa } from './CorreoComun'

const fechaHora = (iso: string) => new Date(iso).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function CorreoEnvio() {
  const { owner, refresh } = useAuth()
  const { config, cargando, sinTabla, recargar } = useSmtpEmpresa()

  // ---- Formulario del servidor
  const [proveedor, setProveedor] = useState('otro')
  const [host, setHost] = useState('')
  const [puerto, setPuerto] = useState(465)
  const [seguridad, setSeguridad] = useState<'ssl' | 'starttls'>('ssl')
  const [usuario, setUsuario] = useState('')
  const [password, setPassword] = useState('')
  const [remitente, setRemitente] = useState('')
  const [nombre, setNombre] = useState('')
  const [trabajando, setTrabajando] = useState<'guardar' | 'probar' | 'desactivar' | 'borrar' | null>(null)

  // ---- Respuestas y copia (van en el perfil)
  const [respuesta, setRespuesta] = useState('')
  const [copia, setCopia] = useState(false)
  const [guardandoResp, setGuardandoResp] = useState(false)

  useEffect(() => {
    if (!config) return
    setProveedor(config.proveedor)
    setHost(config.host)
    setPuerto(config.puerto)
    setSeguridad(config.seguridad)
    setUsuario(config.usuario)
    setRemitente(config.remitente_email)
    setNombre(config.remitente_nombre ?? '')
    setPassword('')
  }, [config])

  const respInicial = owner?.email_respuesta ?? ''
  const copiaInicial = Boolean(owner?.correo_copia)
  useEffect(() => {
    setRespuesta(respInicial)
    setCopia(copiaInicial)
  }, [respInicial, copiaInicial])

  const prov = proveedorSmtp(proveedor)
  const empresa = nombreEmpresa(owner)
  const cuenta = owner?.id

  const elegirProveedor = (id: string) => {
    const p = proveedorSmtp(id)
    setProveedor(id)
    if (id !== 'otro') {
      setHost(p.host)
      setPuerto(p.puerto)
      setSeguridad(p.seguridad)
    }
  }

  const cambiado = useMemo(() => {
    if (!config) return Boolean(host || usuario || remitente || password)
    return (
      proveedor !== config.proveedor ||
      host.trim().toLowerCase() !== config.host ||
      puerto !== config.puerto ||
      seguridad !== config.seguridad ||
      usuario.trim() !== config.usuario ||
      remitente.trim().toLowerCase() !== config.remitente_email ||
      nombre.trim() !== (config.remitente_nombre ?? '') ||
      password !== ''
    )
  }, [config, proveedor, host, puerto, seguridad, usuario, remitente, nombre, password])

  const llamar = async (accion: 'guardar' | 'probar' | 'desactivar' | 'borrar') => {
    if (!cuenta) return
    if (accion === 'guardar') {
      if (!host.trim()) return notify('Falta el servidor de correo', 'error')
      if (!EMAIL.test(remitente.trim())) return notify('Pon el email desde el que se enviará (por ejemplo, facturas@tuempresa.com)', 'error')
      if (!usuario.trim()) return notify('Falta el usuario', 'error')
      if (!password && !config) return notify('Falta la contraseña', 'error')
    }
    setTrabajando(accion)
    try {
      const r = await invocar<{ ok?: boolean; activo?: boolean; error?: string; enviado_a?: string | null }>('smtp-config', {
        accion,
        cuenta_id: cuenta,
        ...(accion === 'guardar'
          ? {
              proveedor,
              host: host.trim(),
              puerto,
              seguridad,
              usuario: usuario.trim(),
              password: password || undefined,
              remitente_email: remitente.trim(),
              remitente_nombre: nombre.trim() || undefined,
            }
          : {}),
      })
      await recargar()
      if (accion === 'borrar') {
        setPassword('')
        notify('Correo desconectado: los envíos vuelven a salir con NomoTax')
      } else if (accion === 'desactivar') {
        notify('Correo desactivado: los envíos salen con NomoTax')
      } else if (r.ok) {
        notify(r.enviado_a ? `Conectado. Te hemos enviado un correo de prueba a ${r.enviado_a}` : 'Conectado')
      } else {
        notify(r.error ?? 'No se ha podido conectar', 'error')
      }
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'error')
    } finally {
      setTrabajando(null)
    }
  }

  const quitar = async () => {
    const ok = await confirmar({
      titulo: 'Quitar tu correo',
      texto: `Se borra la configuración y la contraseña. Desde ahora tus correos saldrán desde ${REMITENTE_FACTURAS} con tu nombre.`,
      accion: 'Quitar',
      peligro: true,
    })
    if (ok) await llamar('borrar')
  }

  const guardarRespuestas = async () => {
    if (!owner) return
    const r = respuesta.trim().toLowerCase()
    if (r && !EMAIL.test(r)) return notify('Pon un email válido para las respuestas', 'error')
    setGuardandoResp(true)
    const { error } = await supabase.from('profiles').update({ email_respuesta: r || null, correo_copia: copia }).eq('id', owner.id)
    setGuardandoResp(false)
    if (error) return notify(await errorMessage(error), 'error')
    await refresh()
    notify('Guardado')
  }

  if (!owner) return null
  const respCambiada = respuesta.trim().toLowerCase() !== respInicial || copia !== copiaInicial
  const activo = Boolean(config?.activo)

  return (
    <div className="max-w-3xl space-y-6">
      {sinTabla && (
        <div className="rounded-xl bg-ambar/10 px-4 py-3 text-sm text-ambar">
          Falta activar el correo propio en la base de datos (supabase/correo-empresa.sql). Hasta entonces no se puede conectar.
        </div>
      )}

      {/* Estado */}
      <Card className="p-5">
        <div className="flex items-start gap-3">
          <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${activo ? 'bg-verde/10 text-verde' : 'bg-ink/5 text-ink/60'}`}>
            {activo ? <CheckCircle2 className="size-5" /> : <Plug className="size-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="font-semibold">{activo ? 'Tus correos salen desde tu dominio' : 'Tus correos salen con NomoTax'}</h4>
              <Badge tono={activo ? 'verde' : 'gris'}>{activo ? 'Conectado' : 'Sin conectar'}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted">
              {activo ? (
                <>
                  Facturas, accesos y el resto de correos salen desde <strong className="text-ink">{config?.remitente_email}</strong>
                  {config?.verificado_at ? `. Última prueba correcta: ${fechaHora(config.verificado_at)}.` : '.'}
                </>
              ) : (
                <>
                  Ahora salen desde <strong className="text-ink">{REMITENTE_FACTURAS}</strong> con tu nombre («{empresa} vía NomoTax»). Conecta el correo
                  de tu dominio para que lleguen desde tu propio email.
                </>
              )}
            </p>
            {config?.ultimo_error && !activo && (
              <p className="mt-2 flex items-start gap-2 rounded-lg bg-rojo/10 px-3 py-2 text-sm text-rojo">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                <span>{config.ultimo_error}</span>
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* Servidor */}
      <Card className="space-y-4 p-5">
        <div>
          <h4 className="font-semibold">Tu servidor de correo (SMTP)</h4>
          <p className="mt-1 text-sm text-muted">
            Usa el buzón de tu dominio (por ejemplo, <span className="font-mono text-xs">facturas@tuempresa.com</span>). Al guardar, te enviamos un
            correo de prueba y, si sale bien, queda activo.
          </p>
        </div>

        <Field label="Proveedor de tu correo">
          <Select value={proveedor} onChange={(e) => elegirProveedor(e.target.value)}>
            {PROVEEDORES_SMTP.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </Select>
        </Field>
        {prov.ayuda && <p className="-mt-2 rounded-lg bg-paper px-3 py-2 text-sm text-ink/80">{prov.ayuda}</p>}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email desde el que se envía" hint="El que verán tus clientes y trabajadores.">
            <Input
              type="email"
              value={remitente}
              onChange={(e) => {
                const v = e.target.value
                // Casi siempre el usuario es el mismo email: se rellena solo mientras no lo hayas cambiado
                if (!usuario || usuario === remitente) setUsuario(v)
                setRemitente(v)
              }}
              placeholder="facturas@tuempresa.com"
              autoComplete="off"
            />
          </Field>
          <Field label="Nombre del remitente" hint={`Si lo dejas vacío, «${empresa}».`}>
            <Input value={nombre} maxLength={120} onChange={(e) => setNombre(e.target.value)} placeholder={empresa} />
          </Field>
          <Field label="Servidor SMTP">
            <Input value={host} onChange={(e) => setHost(e.target.value)} placeholder="smtp.tuempresa.com" autoCapitalize="none" autoComplete="off" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Puerto">
              <Select value={puerto} onChange={(e) => setPuerto(Number(e.target.value))}>
                {[465, 587, 25, 2525].map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Seguridad">
              <Select value={seguridad} onChange={(e) => setSeguridad(e.target.value as 'ssl' | 'starttls')}>
                <option value="ssl">SSL/TLS</option>
                <option value="starttls">STARTTLS</option>
              </Select>
            </Field>
          </div>
          <Field label="Usuario">
            <Input value={usuario} onChange={(e) => setUsuario(e.target.value)} placeholder="facturas@tuempresa.com" autoCapitalize="none" autoComplete="off" />
          </Field>
          <Field label="Contraseña" hint={config ? 'Guardada y cifrada. Déjala vacía para no cambiarla.' : 'Se guarda cifrada: nadie puede volver a verla.'}>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={config ? '••••••••••' : ''}
              autoComplete="new-password"
            />
          </Field>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex flex-wrap gap-2">
            {config && (
              <Button variant="danger" size="sm" icon={<Trash2 className="size-3.5" />} onClick={quitar} loading={trabajando === 'borrar'} disabled={Boolean(trabajando)}>
                Quitar
              </Button>
            )}
            {config && activo && (
              <Button variant="secondary" size="sm" icon={<Power className="size-3.5" />} onClick={() => llamar('desactivar')} loading={trabajando === 'desactivar'} disabled={Boolean(trabajando)}>
                Desactivar
              </Button>
            )}
            {config && !activo && !cambiado && (
              <Button variant="secondary" size="sm" icon={<Plug className="size-3.5" />} onClick={() => llamar('probar')} loading={trabajando === 'probar'} disabled={Boolean(trabajando)}>
                Probar otra vez
              </Button>
            )}
          </div>
          <Button
            variant="accent"
            icon={<Plug className="size-4" />}
            onClick={() => llamar('guardar')}
            loading={trabajando === 'guardar'}
            disabled={Boolean(trabajando) || sinTabla || (Boolean(config) && !cambiado)}
          >
            Guardar y probar
          </Button>
        </div>
      </Card>

      {/* Respuestas */}
      <Card className="space-y-4 p-5">
        <div>
          <h4 className="font-semibold">Respuestas</h4>
          <p className="mt-1 text-sm text-muted">
            Cuando alguien responda a uno de tus correos, la respuesta te llega a ti{activo ? '' : ', no a NomoTax'}.
          </p>
        </div>
        <Field label="Las respuestas llegan a" hint={`Si lo dejas vacío, al ${activo ? 'email del remitente' : 'email de la cuenta'} (${(activo ? config?.remitente_email : owner.email) ?? '—'}).`}>
          <Input type="email" value={respuesta} onChange={(e) => setRespuesta(e.target.value)} placeholder={owner.email ?? 'facturacion@tuempresa.com'} />
        </Field>
        <label className="flex items-start gap-2.5 text-sm">
          <input type="checkbox" className="mt-0.5 size-4 accent-ink" checked={copia} onChange={(e) => setCopia(e.target.checked)} />
          <span>
            Recibir una copia oculta de cada factura que envíe
            <span className="block text-xs text-muted">Llega al email de respuestas.</span>
          </span>
        </label>
        <div className="flex justify-end">
          <Button variant="secondary" icon={<Save className="size-4" />} onClick={guardarRespuestas} loading={guardandoResp} disabled={!respCambiada}>
            Guardar
          </Button>
        </div>
      </Card>

      {cargando && <p className="text-sm text-muted">Cargando…</p>}
    </div>
  )
}
