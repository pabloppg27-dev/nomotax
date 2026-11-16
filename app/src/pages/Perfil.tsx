import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useConfig } from '../components/Configuracion'
import { ImageUp, KeyRound, Palette, Trash2 } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { BUCKET, errorMessage, signedUrl, supabase } from '../lib/supabase'
import { limpiarNif } from '../lib/format'
import type { Profile } from '../lib/types'
import { NOMBRE_ROL } from '../lib/permisos'
import { Button, Card, Field, Input, Loading, Textarea, notify } from '../components/ui'

type Editable = Pick<
  Profile,
  | 'nombre'
  | 'nombre_comercial'
  | 'nif'
  | 'direccion'
  | 'cp'
  | 'ciudad'
  | 'provincia'
  | 'pais'
  | 'telefono'
  | 'iban'
  | 'serie_factura'
  | 'serie_presupuesto'
  | 'serie_rectificativa'
  | 'pie_factura'
  | 'email_facturacion'
>

export default function Perfil() {
  const { rol, puede } = useAuth()
  // Admin sin «empresa», socio, comercial o empleado: solo su usuario (nombre, contraseña, accesos)
  const esMiembro = rol !== null && rol !== 'titular' && rol !== 'asesor'
  if (esMiembro && !puede('empresa')) return <MiCuenta />
  return <PerfilEmpresa esMiembro={esMiembro} />
}

function PerfilEmpresa({ esMiembro }: { esMiembro: boolean }) {
  const { owner, me, viewingOther, refresh } = useAuth()
  const { nuevaClave } = useConfig()
  const [form, setForm] = useState<Editable | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [subiendoLogo, setSubiendoLogo] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Lo que había al cargar o al guardar por última vez (para saber si hay cambios sin guardar)
  const [inicial, setInicial] = useState('')

  // El formulario solo se rellena al abrir la cuenta (o al cambiar de cliente). Antes se rellenaba
  // cada vez que se refrescaba el perfil, y al subir el logo se borraba lo que aún no estaba guardado.
  useEffect(() => {
    if (!owner) return
    const datos: Editable = {
      nombre: owner.nombre,
      // Solo si la columna ya existe en Supabase (supabase/marca.sql); si no, no se envía al guardar
      ...('nombre_comercial' in owner ? { nombre_comercial: owner.nombre_comercial ?? '' } : {}),
      nif: owner.nif,
      direccion: owner.direccion,
      cp: owner.cp,
      ciudad: owner.ciudad,
      provincia: owner.provincia,
      pais: owner.pais ?? 'España',
      telefono: owner.telefono,
      iban: owner.iban,
      serie_factura: owner.serie_factura,
      serie_presupuesto: owner.serie_presupuesto,
      serie_rectificativa: owner.serie_rectificativa ?? 'R',
      pie_factura: owner.pie_factura,
      // Solo si la columna ya existe (supabase/facturacion-automatica.sql)
      ...('email_facturacion' in owner ? { email_facturacion: owner.email_facturacion ?? '' } : {}),
    }
    setForm(datos)
    setInicial(JSON.stringify(datos))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner?.id])

  useEffect(() => {
    if (owner?.logo_path) signedUrl(owner.logo_path, 3600).then(setLogoUrl)
    else setLogoUrl(null)
  }, [owner?.logo_path])

  const sinGuardar = form !== null && inicial !== '' && JSON.stringify(form) !== inicial

  // Si cierras o recargas la página con cambios sin guardar, el navegador te avisa
  useEffect(() => {
    if (!sinGuardar) return
    const avisar = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', avisar)
    return () => window.removeEventListener('beforeunload', avisar)
  }, [sinGuardar])

  if (!owner || !form) return <Loading />

  const set = (k: keyof Editable) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value })

  const guardar = async (e: FormEvent) => {
    e.preventDefault()
    setGuardando(true)
    const { nombre_comercial, email_facturacion, ...resto } = form
    const { error } = await supabase
      .from('profiles')
      .update({
        ...resto,
        ...(nombre_comercial !== undefined ? { nombre_comercial: nombre_comercial?.trim() || null } : {}),
        ...(email_facturacion !== undefined ? { email_facturacion: email_facturacion?.trim().toLowerCase() || null } : {}),
        nif: limpiarNif(form.nif),
        iban: form.iban ? form.iban.toUpperCase().replace(/\s+/g, ' ').trim() : null,
        serie_factura: (form.serie_factura || 'F').toUpperCase().trim(),
        serie_presupuesto: (form.serie_presupuesto || 'P').toUpperCase().trim(),
        serie_rectificativa: (form.serie_rectificativa || 'R').toUpperCase().trim(),
      })
      .eq('id', owner.id)
    setGuardando(false)
    if (error) return notify(await errorMessage(error), 'error')
    setInicial(JSON.stringify(form))
    await refresh()
    notify('Datos guardados')
  }

  const subirLogo = async (file: File) => {
    if (!file.type.startsWith('image/')) return notify('El logo tiene que ser una imagen (PNG o JPG)', 'error')
    setSubiendoLogo(true)
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
    const path = `${owner.id}/logo/logo-${Date.now()}.${ext}`
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type })
    if (error) {
      setSubiendoLogo(false)
      return notify(await errorMessage(error), 'error')
    }
    if (owner.logo_path) await supabase.storage.from(BUCKET).remove([owner.logo_path])
    await supabase.from('profiles').update({ logo_path: path }).eq('id', owner.id)
    await refresh()
    setSubiendoLogo(false)
    notify(sinGuardar ? 'Logo actualizado. Recuerda pulsar «Guardar cambios» para los datos que has cambiado.' : 'Logo actualizado')
  }

  const quitarLogo = async () => {
    if (!owner.logo_path) return
    await supabase.storage.from(BUCKET).remove([owner.logo_path])
    await supabase.from('profiles').update({ logo_path: null }).eq('id', owner.id)
    await refresh()
  }

  return (
    <>
      <p className="mb-5 text-[15px] text-muted">
        {viewingOther ? 'Datos del cliente: aparecen' : esMiembro ? 'Datos de la empresa: aparecen' : 'Tus datos aparecen'} en las facturas y presupuestos.
      </p>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <form onSubmit={guardar}>
          <Card className="p-5 sm:p-6">
            <h2 className="mb-4 font-semibold">Datos fiscales</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nombre o razón social" className="sm:col-span-2">
                <Input value={form.nombre ?? ''} onChange={set('nombre')} required />
              </Field>
              {form.nombre_comercial !== undefined && (
                <Field
                  label="Nombre comercial (opcional)"
                  className="sm:col-span-2"
                  hint="Para autónomos que facturan con una marca: sale arriba en la factura y tu nombre y apellidos debajo."
                >
                  <Input value={form.nombre_comercial ?? ''} onChange={set('nombre_comercial')} placeholder="NomoTax" />
                </Field>
              )}
              <Field label="NIF / CIF">
                <Input value={form.nif ?? ''} onChange={set('nif')} />
              </Field>
              <Field label="Teléfono">
                <Input value={form.telefono ?? ''} onChange={set('telefono')} />
              </Field>
              <Field label="Dirección" className="sm:col-span-2">
                <Input value={form.direccion ?? ''} onChange={set('direccion')} />
              </Field>
              <Field label="Código postal">
                <Input value={form.cp ?? ''} onChange={set('cp')} />
              </Field>
              <Field label="Ciudad">
                <Input value={form.ciudad ?? ''} onChange={set('ciudad')} />
              </Field>
              <Field label="Provincia">
                <Input value={form.provincia ?? ''} onChange={set('provincia')} />
              </Field>
              <Field label="País">
                <Input value={form.pais ?? ''} onChange={set('pais')} />
              </Field>
            </div>

            <h2 className="mb-4 mt-8 font-semibold">Facturación</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="IBAN para cobros" className="sm:col-span-2" hint="Aparece en el pie de tus facturas.">
                <Input value={form.iban ?? ''} onChange={set('iban')} placeholder="ES00 0000 0000 0000 0000 0000" />
              </Field>
              <Field label="Serie de facturas" hint="Ej.: F → F2026-0001">
                <Input value={form.serie_factura} onChange={set('serie_factura')} maxLength={6} />
              </Field>
              <Field label="Serie de presupuestos" hint="Ej.: P → P2026-001">
                <Input value={form.serie_presupuesto} onChange={set('serie_presupuesto')} maxLength={6} />
              </Field>
              <Field label="Serie de rectificativas" hint="Obligatoria y distinta: R → R2026-0001">
                <Input value={form.serie_rectificativa} onChange={set('serie_rectificativa')} maxLength={6} />
              </Field>
              <Field label="Texto al pie de la factura" className="sm:col-span-2" hint="Opcional: condiciones de pago, registro mercantil…">
                <Textarea value={form.pie_factura ?? ''} onChange={set('pie_factura')} />
              </Field>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
              {sinGuardar && <span className="text-sm font-medium text-ambar">Tienes cambios sin guardar</span>}
              <Button type="submit" loading={guardando}>
                Guardar cambios
              </Button>
            </div>
          </Card>
        </form>

        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="mb-1 font-semibold">Logo</h2>
            <p className="mb-4 text-sm text-muted">Se usa en la cabecera de tus facturas y presupuestos.</p>
            <div className="grid h-32 place-items-center rounded-xl border border-dashed border-line bg-paper">
              {logoUrl ? (
                <img src={logoUrl} alt="Logo" className="max-h-24 max-w-[80%] object-contain" />
              ) : (
                <span className="text-sm text-muted">Sin logo</span>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) subirLogo(f)
                e.target.value = ''
              }}
            />
            <div className="mt-3 flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                icon={<ImageUp className="size-4" />}
                loading={subiendoLogo}
                onClick={() => fileRef.current?.click()}
              >
                {logoUrl ? 'Cambiar' : 'Subir logo'}
              </Button>
              {logoUrl && (
                <Button variant="ghost" size="sm" icon={<Trash2 className="size-4" />} onClick={quitarLogo}>
                  Quitar
                </Button>
              )}
            </div>
          </Card>

          <ColorMarca ownerId={owner.id} actual={owner.color_marca ?? null} onGuardado={refresh} />

          {esMiembro && <TuUsuario />}
          {!viewingOther && <CambiarClave destacar={nuevaClave} email={me?.email ?? ''} />}
        </div>
      </div>
    </>
  )
}

const LIMA_NOMOTAX = '#CDF564'

function ColorMarca({ ownerId, actual, onGuardado }: { ownerId: string; actual: string | null; onGuardado: () => Promise<void> | void }) {
  const [hex, setHex] = useState(actual ?? '')
  const [guardando, setGuardando] = useState(false)
  useEffect(() => setHex(actual ?? ''), [actual])

  const normal = hex.trim() ? (hex.trim().startsWith('#') ? hex.trim() : `#${hex.trim()}`).toUpperCase() : ''
  const valido = normal === '' || /^#[0-9A-F]{6}$/.test(normal)
  const muestra = valido && normal ? normal : LIMA_NOMOTAX
  const cambiado = (actual ?? '').toUpperCase() !== normal

  const guardar = async (valor: string | null) => {
    setGuardando(true)
    const { error } = await supabase.from('profiles').update({ color_marca: valor }).eq('id', ownerId)
    setGuardando(false)
    if (error) return notify(await errorMessage(error), 'error')
    await onGuardado()
    notify(valor ? 'Color de marca guardado' : 'Vuelve el lima de NomoTax')
  }

  return (
    <Card className="p-5">
      <h2 className="mb-1 flex items-center gap-2 font-semibold">
        <Palette className="size-4" /> Color de marca
      </h2>
      <p className="mb-4 text-sm text-muted">Franja superior y caja del total en facturas y presupuestos. Vacío: lima de NomoTax.</p>
      <div className="flex items-center gap-3">
        <input
          type="color"
          aria-label="Elegir color"
          value={muestra.toLowerCase()}
          onChange={(e) => setHex(e.target.value.toUpperCase())}
          className="size-11 shrink-0 cursor-pointer rounded-lg border border-line bg-white p-1"
        />
        <Input
          value={hex}
          onChange={(e) => setHex(e.target.value)}
          placeholder={LIMA_NOMOTAX}
          maxLength={7}
          className="min-w-0 font-mono uppercase"
        />
      </div>
      <div className="mt-3 flex h-9 items-center justify-between rounded-lg px-3 text-sm font-bold" style={{ background: muestra, color: textoSobre(muestra) }}>
        <span>TOTAL</span>
        <span>1.234,56€</span>
      </div>
      {!valido && <p className="mt-2 text-sm text-red-600">Usa el formato #RRGGBB, por ejemplo #1D4FD7.</p>}
      <div className="mt-3 flex gap-2">
        <Button size="sm" variant="secondary" loading={guardando} disabled={!valido || !cambiado} onClick={() => guardar(normal || null)}>
          Guardar color
        </Button>
        {actual && (
          <Button size="sm" variant="ghost" onClick={() => guardar(null)}>
            Volver al lima
          </Button>
        )}
      </div>
    </Card>
  )
}

/** Negro o blanco según la luminancia del fondo (igual que en el PDF). */
function textoSobre(hex: string) {
  const n = parseInt(hex.slice(1), 16)
  const lin = (c: number) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255)
  return L > 0.179 ? '#111110' : '#FFFFFF'
}

function CambiarClave({ destacar, email }: { destacar: boolean; email: string }) {
  const [clave, setClave] = useState('')
  const [repetir, setRepetir] = useState('')
  const [guardando, setGuardando] = useState(false)

  const guardar = async (e: FormEvent) => {
    e.preventDefault()
    if (clave.length < 8) return notify('La contraseña debe tener al menos 8 caracteres', 'error')
    if (clave !== repetir) return notify('Las contraseñas no coinciden', 'error')
    setGuardando(true)
    const { error } = await supabase.auth.updateUser({ password: clave })
    setGuardando(false)
    if (error) return notify(await errorMessage(error), 'error')
    setClave('')
    setRepetir('')
    notify('Contraseña cambiada')
  }

  return (
    <Card className={destacar ? 'p-5 ring-2 ring-lima' : 'p-5'}>
      <h2 className="mb-1 flex items-center gap-2 font-semibold">
        <KeyRound className="size-4" /> Contraseña
      </h2>
      <p className="mb-4 text-sm text-muted">
        {destacar ? 'Crea tu contraseña nueva.' : `Cambia la contraseña de ${email}.`}
      </p>
      <form onSubmit={guardar} className="space-y-3">
        <input type="email" autoComplete="username" value={email} readOnly hidden />
        <Field label="Nueva contraseña">
          <Input type="password" autoComplete="new-password" value={clave} onChange={(e) => setClave(e.target.value)} />
        </Field>
        <Field label="Repítela">
          <Input type="password" autoComplete="new-password" value={repetir} onChange={(e) => setRepetir(e.target.value)} />
        </Field>
        <Button type="submit" variant="secondary" size="sm" loading={guardando}>
          Cambiar contraseña
        </Button>
      </form>
    </Card>
  )
}

/** Perfil de quien entra como miembro de una empresa sin poder tocar sus datos */
function MiCuenta() {
  const { me, accesos } = useAuth()
  const { nuevaClave } = useConfig()
  return (
    <>
      <p className="mb-5 text-[15px] text-muted">Tu usuario y las empresas a las que tienes acceso.</p>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <TuUsuario />
          <Card className="p-5 sm:p-6">
            <h2 className="mb-1 font-semibold">Tus accesos</h2>
            <p className="mb-4 text-sm text-muted">Te los da cada empresa. Para cambiarlos, habla con ella.</p>
            <div className="divide-y divide-line">
              {accesos.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="truncate">{a.empresa.nombre_comercial || a.empresa.nombre || a.empresa.email}</span>
                  <span className="shrink-0 text-sm text-muted">{NOMBRE_ROL[a.rol]}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
        <div>
          <CambiarClave destacar={nuevaClave} email={me?.email ?? ''} />
        </div>
      </div>
    </>
  )
}

/** Nombre de la persona (no de la empresa) */
function TuUsuario() {
  const { me, refresh } = useAuth()
  const [nombre, setNombre] = useState(me?.nombre ?? '')
  const [guardando, setGuardando] = useState(false)
  useEffect(() => setNombre(me?.nombre ?? ''), [me?.nombre])
  if (!me) return null
  const guardar = async (e: FormEvent) => {
    e.preventDefault()
    setGuardando(true)
    const { error } = await supabase.from('profiles').update({ nombre: nombre.trim() || null }).eq('id', me.id)
    setGuardando(false)
    if (error) return notify(await errorMessage(error), 'error')
    await refresh()
    notify('Nombre guardado')
  }
  return (
    <Card className="p-5">
      <form onSubmit={guardar}>
        <h2 className="mb-1 font-semibold">Tu usuario</h2>
        <p className="mb-4 text-sm text-muted">{me.email}</p>
        <Field label="Tu nombre">
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre y apellidos" />
        </Field>
        <Button type="submit" variant="secondary" className="mt-3" loading={guardando} disabled={nombre === (me.nombre ?? '')}>
          Guardar
        </Button>
      </form>
    </Card>
  )
}
