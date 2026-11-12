import { useEffect, useState, type FormEvent } from 'react'
import { supabase, errorMessage } from '../lib/supabase'
import { limpiarNif } from '../lib/format'
import type { Contact } from '../lib/types'
import { Button, Field, Input, Modal, Textarea, notify } from './ui'

type Datos = Omit<Contact, 'id' | 'owner_id' | 'created_at'>

const vacio: Datos = {
  nombre: '',
  nif: '',
  email: '',
  telefono: '',
  direccion: '',
  cp: '',
  ciudad: '',
  provincia: '',
  pais: 'España',
  notas: '',
}

export default function ContactForm({
  open,
  onClose,
  ownerId,
  contacto,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  ownerId: string
  contacto?: Contact | null
  onSaved: (c: Contact) => void
}) {
  const [form, setForm] = useState<Datos>(vacio)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (!open) return
    if (contacto) {
      const { nombre, nif, email, telefono, direccion, cp, ciudad, provincia, pais, notas } = contacto
      setForm({ nombre, nif, email, telefono, direccion, cp, ciudad, provincia, pais, notas })
    } else setForm(vacio)
  }, [open, contacto])

  const set = (k: keyof Datos) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value })

  const guardar = async (e?: FormEvent) => {
    e?.preventDefault()
    if (!form.nombre.trim()) return notify('Pon al menos el nombre del cliente', 'error')
    setGuardando(true)
    const datos = {
      ...form,
      nombre: form.nombre.trim(),
      nif: limpiarNif(form.nif),
      email: form.email?.trim() || null,
    }
    const res = contacto
      ? await supabase.from('contacts').update(datos).eq('id', contacto.id).select().single()
      : await supabase.from('contacts').insert({ ...datos, owner_id: ownerId }).select().single()
    setGuardando(false)
    if (res.error) return notify(await errorMessage(res.error), 'error')
    notify(contacto ? 'Cliente actualizado' : 'Cliente creado')
    onSaved(res.data as Contact)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={contacto ? 'Editar cliente' : 'Nuevo cliente'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => guardar()} loading={guardando}>
            Guardar
          </Button>
        </>
      }
    >
      <form onSubmit={guardar} className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre o razón social" className="sm:col-span-2">
          <Input value={form.nombre} onChange={set('nombre')} autoFocus required />
        </Field>
        <Field label="NIF / CIF / VAT">
          <Input value={form.nif ?? ''} onChange={set('nif')} />
        </Field>
        <Field label="Email">
          <Input type="email" value={form.email ?? ''} onChange={set('email')} />
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
        <Field label="Teléfono">
          <Input value={form.telefono ?? ''} onChange={set('telefono')} />
        </Field>
        <Field label="Notas" className="sm:col-span-2">
          <Textarea value={form.notas ?? ''} onChange={set('notas')} />
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}

export function snapshotDe(c: Contact) {
  return {
    nombre: c.nombre,
    nif: c.nif,
    email: c.email,
    direccion: c.direccion,
    cp: c.cp,
    ciudad: c.ciudad,
    provincia: c.provincia,
    pais: c.pais,
  }
}
