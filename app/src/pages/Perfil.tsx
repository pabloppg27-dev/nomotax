import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ImageUp, KeyRound, Trash2 } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { BUCKET, errorMessage, signedUrl, supabase } from '../lib/supabase'
import { limpiarNif } from '../lib/format'
import type { Profile } from '../lib/types'
import { Button, Card, Field, Input, Loading, PageHeader, Textarea, notify } from '../components/ui'

type Editable = Pick<
  Profile,
  | 'nombre'
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
  | 'pie_factura'
>

export default function Perfil() {
  const { owner, me, viewingOther, refresh } = useAuth()
  const [params] = useSearchParams()
  const [form, setForm] = useState<Editable | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [subiendoLogo, setSubiendoLogo] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!owner) return
    setForm({
      nombre: owner.nombre,
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
      pie_factura: owner.pie_factura,
    })
    if (owner.logo_path) signedUrl(owner.logo_path, 3600).then(setLogoUrl)
    else setLogoUrl(null)
  }, [owner])

  if (!owner || !form) return <Loading />

  const set = (k: keyof Editable) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value })

  const guardar = async (e: FormEvent) => {
    e.preventDefault()
    setGuardando(true)
    const { error } = await supabase
      .from('profiles')
      .update({
        ...form,
        nif: limpiarNif(form.nif),
        iban: form.iban ? form.iban.toUpperCase().replace(/\s+/g, ' ').trim() : null,
        serie_factura: (form.serie_factura || 'F').toUpperCase().trim(),
        serie_presupuesto: (form.serie_presupuesto || 'P').toUpperCase().trim(),
      })
      .eq('id', owner.id)
    setGuardando(false)
    if (error) return notify(await errorMessage(error), 'error')
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
    notify('Logo actualizado')
  }

  const quitarLogo = async () => {
    if (!owner.logo_path) return
    await supabase.storage.from(BUCKET).remove([owner.logo_path])
    await supabase.from('profiles').update({ logo_path: null }).eq('id', owner.id)
    await refresh()
  }

  return (
    <>
      <PageHeader
        title={viewingOther ? 'Perfil del cliente' : 'Mi perfil'}
        subtitle="Estos datos aparecen en tus facturas y presupuestos."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <form onSubmit={guardar}>
          <Card className="p-5 sm:p-6">
            <h2 className="mb-4 font-semibold">Datos fiscales</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nombre o razón social" className="sm:col-span-2">
                <Input value={form.nombre ?? ''} onChange={set('nombre')} required />
              </Field>
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
              <Field label="Texto al pie de la factura" className="sm:col-span-2" hint="Opcional: condiciones de pago, registro mercantil…">
                <Textarea value={form.pie_factura ?? ''} onChange={set('pie_factura')} />
              </Field>
            </div>

            <div className="mt-6 flex justify-end">
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

          {!viewingOther && <CambiarClave destacar={params.has('nueva-clave')} email={me?.email ?? ''} />}
        </div>
      </div>
    </>
  )
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
