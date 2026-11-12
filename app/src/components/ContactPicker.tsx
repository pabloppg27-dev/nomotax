import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { direccionCompleta } from '../lib/format'
import type { ClienteSnapshot, Contact } from '../lib/types'
import ContactForm from './ContactForm'
import { Button, Select } from './ui'

export default function ContactPicker({
  ownerId,
  contactId,
  cliente,
  disabled,
  onPick,
}: {
  ownerId: string
  contactId: string | null
  cliente: ClienteSnapshot
  disabled?: boolean
  onPick: (c: Contact) => void
}) {
  const [contactos, setContactos] = useState<Contact[]>([])
  const [nuevo, setNuevo] = useState(false)

  useEffect(() => {
    supabase
      .from('contacts')
      .select('*')
      .eq('owner_id', ownerId)
      .order('nombre')
      .then(({ data }) => setContactos((data as Contact[]) ?? []))
  }, [ownerId])

  const lineas = direccionCompleta(cliente)

  return (
    <div>
      {!disabled && (
        <div className="flex gap-2">
          <Select
            value={contactId ?? ''}
            onChange={(e) => {
              const c = contactos.find((x) => x.id === e.target.value)
              if (c) onPick(c)
            }}
          >
            <option value="" disabled>
              {contactos.length ? 'Elige un cliente…' : 'Aún no tienes clientes'}
            </option>
            {contactos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
                {c.nif ? ` · ${c.nif}` : ''}
              </option>
            ))}
          </Select>
          <Button type="button" variant="secondary" icon={<Plus className="size-4" />} onClick={() => setNuevo(true)}>
            Nuevo
          </Button>
        </div>
      )}

      {cliente?.nombre && (
        <div className="mt-3 rounded-xl bg-paper px-4 py-3 text-sm">
          <p className="font-medium">{cliente.nombre}</p>
          {cliente.nif && <p className="text-muted">NIF {cliente.nif}</p>}
          {lineas.map((l) => (
            <p key={l} className="text-muted">
              {l}
            </p>
          ))}
          {!cliente.nif && !disabled && <p className="mt-1 text-ambar">Falta el NIF del cliente: es obligatorio en una factura completa.</p>}
        </div>
      )}

      <ContactForm
        open={nuevo}
        onClose={() => setNuevo(false)}
        ownerId={ownerId}
        onSaved={(c) => {
          setContactos((prev) => [...prev, c].sort((a, b) => a.nombre.localeCompare(b.nombre)))
          onPick(c)
        }}
      />
    </div>
  )
}
