import { useCallback, useEffect, useMemo, useState } from 'react'
import { Mail, Pencil, Phone, Plus, Search, Trash2, Users } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { supabase, errorMessage } from '../lib/supabase'
import { eur } from '../lib/format'
import type { Contact } from '../lib/types'
import ContactForm from '../components/ContactForm'
import { Button, Card, Empty, Input, Loading, PageHeader, confirmar, notify } from '../components/ui'

export default function Clientes() {
  const { ownerId, soloDe } = useAuth()
  const [contactos, setContactos] = useState<Contact[] | null>(null)
  const [facturado, setFacturado] = useState<Record<string, number>>({})
  const [q, setQ] = useState('')
  const [editando, setEditando] = useState<Contact | null>(null)
  const [abierto, setAbierto] = useState(false)

  const cargar = useCallback(async () => {
    if (!ownerId) return
    let fq = supabase.from('invoices').select('contact_id, base').eq('owner_id', ownerId).neq('estado', 'borrador').gte('fecha', `${new Date().getFullYear()}-01-01`)
    if (soloDe) fq = fq.eq('creado_por', soloDe)
    const [c, f, suyos] = await Promise.all([
      supabase.from('contacts').select('*').eq('owner_id', ownerId).order('nombre'),
      fq,
      // Comercial: sus clientes son los que ha dado de alta él o con los que tiene facturas o presupuestos
      soloDe
        ? Promise.all([
            supabase.from('invoices').select('contact_id').eq('owner_id', ownerId).eq('creado_por', soloDe),
            supabase.from('quotes').select('contact_id').eq('owner_id', ownerId).eq('creado_por', soloDe),
          ])
        : Promise.resolve(null),
    ])
    const todos = (c.data as Contact[]) ?? []
    if (suyos) {
      const ids = new Set([...(suyos[0].data ?? []), ...(suyos[1].data ?? [])].map((r) => r.contact_id as string | null))
      setContactos(todos.filter((x) => ids.has(x.id) || (x as Contact & { creado_por?: string | null }).creado_por === soloDe))
    } else setContactos(todos)
    const totales: Record<string, number> = {}
    for (const r of (f.data as { contact_id: string | null; base: number }[]) ?? []) {
      if (r.contact_id) totales[r.contact_id] = (totales[r.contact_id] ?? 0) + Number(r.base)
    }
    setFacturado(totales)
  }, [ownerId, soloDe])

  useEffect(() => {
    cargar()
  }, [cargar])

  const lista = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!contactos) return []
    if (!t) return contactos
    return contactos.filter((c) =>
      [c.nombre, c.nif, c.email, c.ciudad].some((v) => v?.toLowerCase().includes(t)),
    )
  }, [contactos, q])

  const borrar = async (c: Contact) => {
    const ok = await confirmar({
      titulo: 'Eliminar cliente',
      texto: `¿Eliminar a ${c.nombre}? Las facturas y presupuestos que ya tiene se conservan.`,
      accion: 'Eliminar',
      peligro: true,
    })
    if (!ok) return
    const { error } = await supabase.from('contacts').delete().eq('id', c.id)
    if (error) return notify(await errorMessage(error), 'error')
    notify('Cliente eliminado')
    cargar()
  }

  if (!ownerId) return <Loading />

  return (
    <>
      <PageHeader
        title="Clientes"
        subtitle="Tu agenda de clientes para hacer presupuestos y facturas."
        actions={
          <Button
            icon={<Plus className="size-4" />}
            onClick={() => {
              setEditando(null)
              setAbierto(true)
            }}
          >
            Nuevo cliente
          </Button>
        }
      />

      {contactos === null ? (
        <Loading />
      ) : contactos.length === 0 ? (
        <Card>
          <Empty
            icon={<Users className="size-5" />}
            title="Todavía no tienes clientes"
            text="Añade a tus clientes una vez y los tendrás a mano cada vez que factures."
            action={
              <Button icon={<Plus className="size-4" />} onClick={() => setAbierto(true)}>
                Añadir el primero
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <div className="relative mb-4 max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input placeholder="Buscar por nombre, NIF o ciudad" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {lista.map((c) => (
              <Card key={c.id} className="flex flex-col p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{c.nombre}</p>
                    <p className="text-sm text-muted">{c.nif || 'Sin NIF'}</p>
                  </div>
                  <div className="flex shrink-0">
                    <button
                      className="rounded-full p-1.5 text-muted hover:bg-ink/5 hover:text-ink"
                      onClick={() => {
                        setEditando(c)
                        setAbierto(true)
                      }}
                      aria-label="Editar"
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button
                      className="rounded-full p-1.5 text-muted hover:bg-rojo/10 hover:text-rojo"
                      onClick={() => borrar(c)}
                      aria-label="Eliminar"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
                <div className="mt-3 space-y-1 text-sm text-ink/75">
                  {c.email && (
                    <p className="flex items-center gap-2 truncate">
                      <Mail className="size-3.5 shrink-0 text-muted" />
                      {c.email}
                    </p>
                  )}
                  {c.telefono && (
                    <p className="flex items-center gap-2">
                      <Phone className="size-3.5 shrink-0 text-muted" />
                      {c.telefono}
                    </p>
                  )}
                  {c.ciudad && <p className="text-muted">{[c.ciudad, c.pais !== 'España' ? c.pais : null].filter(Boolean).join(', ')}</p>}
                </div>
                <div className="mt-auto flex items-baseline justify-between border-t border-line pt-3 text-sm">
                  <span className="text-muted">Facturado este año</span>
                  <span className="num font-medium">{eur(facturado[c.id] ?? 0)}</span>
                </div>
              </Card>
            ))}
          </div>
          {lista.length === 0 && <p className="py-10 text-center text-sm text-muted">Ningún cliente coincide con «{q}».</p>}
        </>
      )}

      <ContactForm open={abierto} onClose={() => setAbierto(false)} ownerId={ownerId} contacto={editando} onSaved={() => cargar()} />
    </>
  )
}
