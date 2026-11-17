import { useState } from 'react'
import { errorMessage } from '../lib/supabase'
import type { ConfigTarjeta, Persona, Tarjeta } from '../lib/tarjetas'
import NumInput from './NumInput'
import TarjetaVisual from './TarjetaVisual'
import { Button, Field, Input, Modal, Select, notify } from './ui'

/** Valor del desplegable «¿Quién la usa?»: '' empresa · u:<id> usuario · t:<id> trabajador · __otra nombre escrito */
function valorPersona(c: ConfigTarjeta, otra: boolean): string {
  if (c.user_id) return `u:${c.user_id}`
  if (c.trabajador_id) return `t:${c.trabajador_id}`
  return otra ? '__otra' : ''
}

/** Para quién es la tarjeta y sus límites: lo comparten «Nueva tarjeta», «Configurar» y «Dar tarjeta» (Usuarios) */
export function CamposTarjeta({ c, setC, personas }: { c: ConfigTarjeta; setC: (c: ConfigTarjeta) => void; personas: Persona[] }) {
  const [otra, setOtra] = useState(Boolean(c.asignada_a && !c.trabajador_id && !c.user_id))
  const usuarios = personas.filter((p) => p.tipo === 'usuario')
  const trabajadores = personas.filter((p) => p.tipo === 'trabajador')
  return (
    <>
      <Field label="Nombre de la tarjeta" hint="Para distinguirla: «Publicidad», «Viajes», «Software»…">
        <Input value={c.alias} maxLength={60} onChange={(e) => setC({ ...c, alias: e.target.value })} placeholder="Publicidad" />
      </Field>
      <Field
        label="¿Quién la usa?"
        hint={
          c.user_id
            ? 'La verá en su menú, en «Mi tarjeta», con sus límites y sus compras.'
            : personas.length
              ? 'Su nombre sale en la tarjeta. Si es un usuario de la empresa, además la verá en «Mi tarjeta».'
              : 'Cuando des acceso a personas (Usuarios) o des de alta trabajadores (Laboral), podrás elegirlas aquí.'
        }
      >
        <Select
          value={valorPersona(c, otra)}
          onChange={(e) => {
            const v = e.target.value
            const base = { ...c, user_id: null, trabajador_id: null }
            if (v === '') {
              setOtra(false)
              setC({ ...base, asignada_a: null })
            } else if (v === '__otra') {
              setOtra(true)
              setC({ ...base, asignada_a: '' })
            } else {
              setOtra(false)
              const [tipo, id] = [v.slice(0, 1), v.slice(2)]
              const p = personas.find((x) => x.id === id && x.tipo === (tipo === 'u' ? 'usuario' : 'trabajador'))
              setC({ ...base, [tipo === 'u' ? 'user_id' : 'trabajador_id']: id, asignada_a: p?.nombre.slice(0, 26) ?? null })
            }
          }}
        >
          <option value="">La empresa (sin asignar)</option>
          {usuarios.length > 0 && (
            <optgroup label="Usuarios de la empresa">
              {usuarios.map((p) => (
                <option key={p.id} value={`u:${p.id}`}>
                  {p.nombre}
                  {p.detalle ? ` · ${p.detalle}` : ''}
                </option>
              ))}
            </optgroup>
          )}
          {trabajadores.length > 0 && (
            <optgroup label="Trabajadores">
              {trabajadores.map((p) => (
                <option key={p.id} value={`t:${p.id}`}>
                  {p.nombre}
                </option>
              ))}
            </optgroup>
          )}
          <option value="__otra">Otra persona…</option>
        </Select>
      </Field>
      {otra && (
        <Field label="Nombre de la persona">
          <Input value={c.asignada_a ?? ''} maxLength={26} onChange={(e) => setC({ ...c, asignada_a: e.target.value })} placeholder="Nombre y apellido" />
        </Field>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Límite al mes (€)" hint="Vacío = sin límite.">
          <NumInput value={c.limite_mensual ?? 0} onValue={(n) => setC({ ...c, limite_mensual: n > 0 ? n : null })} />
        </Field>
        <Field label="Máximo por compra (€)" hint="Vacío = sin máximo.">
          <NumInput value={c.limite_compra ?? 0} onValue={(n) => setC({ ...c, limite_compra: n > 0 ? n : null })} />
        </Field>
      </div>
    </>
  )
}

/** Comprueba lo básico antes de mandar la tarjeta (nombre y, si es «otra persona», su nombre) */
function validar(c: ConfigTarjeta): string | null {
  if (!c.alias.trim()) return 'Ponle un nombre a la tarjeta'
  if (c.asignada_a !== null && !c.trabajador_id && !c.user_id && c.asignada_a.trim().length < 2) return 'Escribe el nombre de la persona'
  return null
}

const limpia = (c: ConfigTarjeta): ConfigTarjeta => ({ ...c, alias: c.alias.trim(), asignada_a: c.asignada_a?.trim() || null })

export const configVacia = (inicial: Partial<ConfigTarjeta> = {}): ConfigTarjeta => ({
  alias: '',
  user_id: null,
  trabajador_id: null,
  asignada_a: null,
  limite_mensual: null,
  limite_compra: null,
  ...inicial,
})

export function NuevaTarjeta({
  titular,
  personas,
  inicial,
  onClose,
  onCrear,
}: {
  titular: string
  personas: Persona[]
  /** Para abrirla ya con una persona elegida (desde Usuarios) */
  inicial?: Partial<ConfigTarjeta>
  onClose: () => void
  onCrear: (d: ConfigTarjeta & { tipo: 'virtual' | 'fisica' }) => Promise<void>
}) {
  const [c, setC] = useState<ConfigTarjeta>(configVacia(inicial))
  const [tipo, setTipo] = useState<'virtual' | 'fisica'>('virtual')
  const [trabajando, setTrabajando] = useState(false)

  async function crear() {
    const fallo = validar(c)
    if (fallo) return notify(fallo, 'error')
    setTrabajando(true)
    try {
      await onCrear({ ...limpia(c), tipo })
    } catch (e) {
      notify(await errorMessage(e), 'error')
      setTrabajando(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={inicial?.asignada_a ? `Tarjeta para ${inicial.asignada_a}` : 'Nueva tarjeta'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={trabajando} onClick={crear}>
            Crear tarjeta
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <TarjetaVisual titular={c.asignada_a || titular} alias={c.alias} ultimos4="0000" exp_mes={null} exp_anio={null} tipo={tipo} />
        <CamposTarjeta c={c} setC={setC} personas={personas} />
        <Field label="Tipo" hint={tipo === 'fisica' ? 'La física llega por correo en unos días a la dirección de tu empresa.' : 'La virtual la tienes al instante.'}>
          <Select value={tipo} onChange={(e) => setTipo(e.target.value as 'virtual' | 'fisica')}>
            <option value="virtual">Virtual</option>
            <option value="fisica">Física</option>
          </Select>
        </Field>
      </div>
    </Modal>
  )
}

export function ConfigurarTarjeta({
  t,
  titular,
  personas,
  onClose,
  onGuardar,
}: {
  t: Tarjeta
  titular: string
  personas: Persona[]
  onClose: () => void
  onGuardar: (c: ConfigTarjeta) => Promise<void>
}) {
  const [c, setC] = useState<ConfigTarjeta>(
    configVacia({
      alias: t.alias,
      user_id: t.user_id ?? null,
      trabajador_id: t.trabajador_id ?? null,
      asignada_a: t.asignada_a ?? null,
      limite_mensual: t.limite_mensual,
      limite_compra: t.limite_compra ?? null,
    }),
  )
  const [trabajando, setTrabajando] = useState(false)
  return (
    <Modal
      open
      onClose={onClose}
      title={`Configurar «${t.alias}»`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            loading={trabajando}
            onClick={async () => {
              const fallo = validar(c)
              if (fallo) return notify(fallo, 'error')
              setTrabajando(true)
              try {
                await onGuardar(limpia(c))
              } catch (e) {
                notify(await errorMessage(e), 'error')
                setTrabajando(false)
              }
            }}
          >
            Guardar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <TarjetaVisual titular={c.asignada_a || titular} alias={c.alias} ultimos4={t.ultimos4} exp_mes={t.exp_mes} exp_anio={t.exp_anio} tipo={t.tipo} estado={t.estado} />
        <CamposTarjeta c={c} setC={setC} personas={personas} />
        {t.tipo === 'fisica' && <p className="text-xs text-muted">En una tarjeta física ya impresa, cambiar la persona no cambia el nombre grabado: para eso, cancélala y crea una nueva.</p>}
      </div>
    </Modal>
  )
}
