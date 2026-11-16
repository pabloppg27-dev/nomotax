import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Copy, KeyRound, Pencil, Trash2, UserPlus, UsersRound } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { errorMessage, invocar, supabase } from '../lib/supabase'
import { MODULOS, NOMBRE_ROL, PERMISOS_ADMIN_DEFECTO, ROLES, ajustarPermisos } from '../lib/permisos'
import type { Miembro, Modulo, RolMiembro } from '../lib/types'
import { Badge, Button, Card, Empty, Field, Input, Loading, Modal, PageHeader, Select, confirmar, cx, notify } from '../components/ui'

type Trabajador = { id: string; nombre: string; estado: string }

/** Lo que se edita de un acceso */
interface Borrador {
  id?: string
  email: string
  nombre: string
  rol: RolMiembro
  permisos: Record<Modulo, boolean>
  trabajador_id: string
  activo: boolean
  bienvenida: boolean
}

const nuevo = (): Borrador => ({
  email: '',
  nombre: '',
  rol: 'admin',
  permisos: { ...PERMISOS_ADMIN_DEFECTO },
  trabajador_id: '',
  activo: true,
  bienvenida: true,
})

/** embebido: dentro de Configuración (sin el título grande de página) */
export default function Usuarios({ embebido = false }: { embebido?: boolean }) {
  const { owner, ownerId, me, isAdvisor } = useAuth()
  const [miembros, setMiembros] = useState<Miembro[] | null>(null)
  const [faltaSql, setFaltaSql] = useState(false)
  const [trabajadores, setTrabajadores] = useState<Trabajador[]>([])
  const [editando, setEditando] = useState<Borrador | null>(null)
  const [clave, setClave] = useState<{ email: string; password: string; enviado: boolean } | null>(null)

  const cargar = useCallback(async () => {
    if (!ownerId) return
    const [m, t] = await Promise.all([
      supabase.from('miembros').select('*').eq('cuenta_id', ownerId).order('created_at'),
      supabase.from('trabajadores').select('id, nombre, estado').eq('owner_id', ownerId).neq('estado', 'baja').order('nombre'),
    ])
    if (m.error) {
      setFaltaSql(true)
      setMiembros([])
    } else setMiembros((m.data as Miembro[]) ?? [])
    setTrabajadores((t.data as Trabajador[]) ?? [])
  }, [ownerId])

  useEffect(() => {
    cargar()
  }, [cargar])

  // En directo: si otra persona cambia los accesos, la lista se actualiza
  useEffect(() => {
    if (!ownerId) return
    const canal = supabase
      .channel(`miembros-${ownerId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'miembros', filter: `cuenta_id=eq.${ownerId}` }, () => cargar())
      .subscribe()
    return () => {
      supabase.removeChannel(canal)
    }
  }, [ownerId, cargar])

  if (!owner || !miembros) return <Loading />

  const nombreTrabajador = (id: string | null) => trabajadores.find((t) => t.id === id)?.nombre

  const reenviar = async (m: Miembro) => {
    const ok = await confirmar({
      titulo: 'Reenviar el acceso',
      texto: `Se creará una contraseña provisional nueva para ${m.email} y se le enviará por correo. La que tenía dejará de funcionar.`,
      accion: 'Reenviar',
    })
    if (!ok) return
    try {
      const r = await invocar<{ password: string; bienvenida: string }>('invitar-miembro', { reenviar: m.id })
      setClave({ email: m.email, password: r.password, enviado: r.bienvenida === 'enviada' })
    } catch (e) {
      notify((e as Error).message, 'error')
    }
  }

  const quitar = async (m: Miembro) => {
    const ok = await confirmar({
      titulo: 'Quitar el acceso',
      texto: `${m.nombre || m.email} dejará de poder entrar en ${owner.nombre || 'la empresa'}. Lo que haya subido o creado se queda en la empresa.`,
      accion: 'Quitar acceso',
      peligro: true,
    })
    if (!ok) return
    const { error } = await supabase.from('miembros').delete().eq('id', m.id)
    if (error) return notify(await errorMessage(error), 'error')
    notify('Acceso quitado')
    cargar()
  }

  const activos = miembros.filter((m) => m.activo)
  const inactivos = miembros.filter((m) => !m.activo)

  return (
    <>
      {embebido ? (
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[15px] text-muted">Da acceso a las personas de tu empresa. Cada una ve solo lo que le toca.</p>
          {!faltaSql && (
            <Button variant="accent" icon={<UserPlus className="size-4" />} onClick={() => setEditando(nuevo())}>
              Dar acceso
            </Button>
          )}
        </div>
      ) : (
        <PageHeader
          title="Usuarios"
          subtitle="Da acceso a las personas de tu empresa. Cada una ve solo lo que le toca."
          actions={
            !faltaSql && (
              <Button variant="accent" icon={<UserPlus className="size-4" />} onClick={() => setEditando(nuevo())}>
                Dar acceso
              </Button>
            )
          }
        />
      )}

      {faltaSql ? (
        <Card className="p-6">
          <p className="font-medium">Los usuarios aún no están activados</p>
          {isAdvisor ? (
            <p className="mt-1 text-sm text-muted">
              Falta ejecutar <code className="rounded bg-paper px-1">supabase/usuarios.sql</code> en Supabase y desplegar las funciones{' '}
              <code className="rounded bg-paper px-1">invitar-miembro</code> y <code className="rounded bg-paper px-1">vista-socio</code>. Los pasos
              están en el README, en «Usuarios de la empresa».
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted">Tu asesor tiene que terminar de activarlos. En cuanto lo haga, podrás dar acceso desde aquí.</p>
          )}
        </Card>
      ) : (
        <div className="space-y-6">
          <Card className="divide-y divide-line">
            <Fila
              nombre={owner.nombre || owner.email || 'Titular'}
              email={owner.email}
              etiqueta={<Badge tono="negro">Titular</Badge>}
              detalle="Acceso a todo. Es la cuenta de la empresa."
            />
            {activos.map((m) => (
              <Fila
                key={m.id}
                nombre={m.nombre || m.email}
                email={m.nombre ? m.email : null}
                tu={m.user_id === me?.id}
                etiqueta={<Badge tono={m.rol === 'admin' ? 'lima' : 'gris'}>{NOMBRE_ROL[m.rol]}</Badge>}
                detalle={detalle(m, nombreTrabajador(m.trabajador_id))}
                acciones={
                  <>
                    <Button size="sm" variant="ghost" icon={<Pencil className="size-4" />} onClick={() => setEditando(aBorrador(m))}>
                      Editar
                    </Button>
                    <Button size="sm" variant="ghost" icon={<KeyRound className="size-4" />} onClick={() => reenviar(m)}>
                      Reenviar acceso
                    </Button>
                  </>
                }
              />
            ))}
          </Card>

          {activos.length === 0 && (
            <Card>
              <Empty
                icon={<UsersRound className="size-5" />}
                title="Todavía no has dado acceso a nadie"
                text="Socios, administración, comerciales o empleados: cada uno con su propio usuario y solo con lo que necesita."
                action={
                  <Button variant="accent" icon={<UserPlus className="size-4" />} onClick={() => setEditando(nuevo())}>
                    Dar acceso
                  </Button>
                }
              />
            </Card>
          )}

          {inactivos.length > 0 && (
            <div>
              <h2 className="mb-2 text-sm font-medium text-muted">Sin acceso ahora mismo</h2>
              <Card className="divide-y divide-line">
                {inactivos.map((m) => (
                  <Fila
                    key={m.id}
                    nombre={m.nombre || m.email}
                    email={m.nombre ? m.email : null}
                    apagado
                    etiqueta={<Badge>{NOMBRE_ROL[m.rol]} · desactivado</Badge>}
                    acciones={
                      <>
                        <Button size="sm" variant="ghost" icon={<Pencil className="size-4" />} onClick={() => setEditando(aBorrador(m))}>
                          Editar
                        </Button>
                        <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => quitar(m)}>
                          Quitar
                        </Button>
                      </>
                    }
                  />
                ))}
              </Card>
            </div>
          )}
        </div>
      )}

      {editando && (
        <EditorAcceso
          inicial={editando}
          cuentaId={owner.id}
          trabajadores={trabajadores}
          onClose={() => setEditando(null)}
          onQuitar={
            editando.id
              ? () => {
                  const m = miembros.find((x) => x.id === editando.id)
                  setEditando(null)
                  if (m) quitar(m)
                }
              : undefined
          }
          onGuardado={(r) => {
            setEditando(null)
            cargar()
            if (r?.password) setClave(r)
          }}
        />
      )}

      <Modal
        open={clave !== null}
        onClose={() => setClave(null)}
        title="Acceso listo"
        footer={<Button onClick={() => setClave(null)}>Hecho</Button>}
      >
        {clave && (
          <div className="space-y-4 text-[15px]">
            <p>
              {clave.enviado
                ? `Le hemos enviado un correo a ${clave.email} con sus accesos.`
                : `No se ha podido enviar el correo: pásale tú estos accesos a ${clave.email}.`}
            </p>
            <div className="rounded-xl bg-paper p-4">
              <p className="text-sm text-muted">Usuario</p>
              <p className="font-medium">{clave.email}</p>
              <p className="mt-3 text-sm text-muted">Contraseña provisional</p>
              <div className="flex items-center gap-2">
                <code className="rounded-md bg-lima px-2 py-0.5 font-mono text-base">{clave.password}</code>
                <button
                  className="rounded-full p-2 hover:bg-ink/5"
                  aria-label="Copiar contraseña"
                  onClick={() => navigator.clipboard.writeText(clave.password).then(() => notify('Contraseña copiada'))}
                >
                  <Copy className="size-4" />
                </button>
              </div>
            </div>
            <p className="text-sm text-muted">Al entrar la cambiará en «Mi perfil». Esta contraseña no se vuelve a mostrar.</p>
          </div>
        )}
      </Modal>
    </>
  )
}

function aBorrador(m: Miembro): Borrador {
  return {
    id: m.id,
    email: m.email,
    nombre: m.nombre ?? '',
    rol: m.rol,
    permisos: { ...PERMISOS_ADMIN_DEFECTO, ...(m.rol === 'admin' ? m.permisos : {}) } as Record<Modulo, boolean>,
    trabajador_id: m.trabajador_id ?? '',
    activo: m.activo,
    bienvenida: false,
  }
}

function detalle(m: Miembro, trabajador?: string): string {
  if (m.rol === 'admin') {
    const si = MODULOS.filter((x) => m.permisos?.[x.id]).map((x) => (x.id === 'ventas' ? 'Facturas' : x.id === 'empresa' ? 'Datos de la empresa' : x.nombre))
    return si.length ? si.join(' · ') : 'Ningún módulo activado'
  }
  if (m.rol === 'empleado') return trabajador ? `Ficha de trabajador: ${trabajador}` : 'Sin ficha de trabajador vinculada (no verá nóminas)'
  return ROLES.find((r) => r.id === m.rol)?.detalle ?? ''
}

function Fila({
  nombre,
  email,
  etiqueta,
  detalle,
  acciones,
  tu,
  apagado,
}: {
  nombre: string
  email?: string | null
  etiqueta: ReactNode
  detalle?: string
  acciones?: ReactNode
  tu?: boolean
  apagado?: boolean
}) {
  return (
    <div className={cx('flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5', apagado && 'opacity-60')}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-medium">{nombre}</p>
          {etiqueta}
          {tu && <Badge tono="verde">Tú</Badge>}
        </div>
        {email && <p className="truncate text-sm text-muted">{email}</p>}
        {detalle && <p className="mt-1 text-sm text-muted">{detalle}</p>}
      </div>
      {acciones && <div className="flex shrink-0 flex-wrap gap-1">{acciones}</div>}
    </div>
  )
}

function EditorAcceso({
  inicial,
  cuentaId,
  trabajadores,
  onClose,
  onGuardado,
  onQuitar,
}: {
  inicial: Borrador
  cuentaId: string
  trabajadores: Trabajador[]
  onClose: () => void
  onGuardado: (r?: { email: string; password: string; enviado: boolean }) => void
  onQuitar?: () => void
}) {
  const [b, setB] = useState<Borrador>(inicial)
  const [guardando, setGuardando] = useState(false)
  const esNuevo = !b.id

  const guardar = async (e: FormEvent) => {
    e.preventDefault()
    if (esNuevo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email.trim())) return notify('Pon un email válido', 'error')
    setGuardando(true)
    try {
      if (esNuevo) {
        const r = await invocar<{ password: string | null; bienvenida: string; nuevo: boolean }>('invitar-miembro', {
          cuenta_id: cuentaId,
          email: b.email.trim().toLowerCase(),
          nombre: b.nombre.trim() || null,
          rol: b.rol,
          permisos: b.rol === 'admin' ? b.permisos : {},
          trabajador_id: b.rol === 'empleado' ? b.trabajador_id || null : null,
          bienvenida: b.bienvenida,
        })
        notify(r.nuevo ? 'Acceso creado' : 'Acceso dado. Ya tenía usuario en NomoTax: entra con su contraseña de siempre.')
        onGuardado(r.password ? { email: b.email.trim().toLowerCase(), password: r.password, enviado: r.bienvenida === 'enviada' } : undefined)
      } else {
        const { error } = await supabase
          .from('miembros')
          .update({
            nombre: b.nombre.trim() || null,
            rol: b.rol,
            permisos: b.rol === 'admin' ? b.permisos : {},
            trabajador_id: b.rol === 'empleado' ? b.trabajador_id || null : null,
            activo: b.activo,
          })
          .eq('id', b.id!)
        if (error) throw new Error(await errorMessage(error))
        notify('Cambios guardados')
        onGuardado()
      }
    } catch (err) {
      notify((err as Error).message, 'error')
    }
    setGuardando(false)
  }

  const cambiarPermiso = (m: Modulo, v: boolean) => {
    // Sin ventas o gastos, la contabilidad saldría incompleta: se apaga con ellos
    let p = { ...b.permisos, [m]: v }
    if ((m === 'ventas' || m === 'gastos') && !v) p = { ...p, contabilidad: false }
    setB({ ...b, permisos: ajustarPermisos(p) })
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={esNuevo ? 'Dar acceso' : `Acceso de ${inicial.nombre || inicial.email}`}
      footer={
        <>
          {onQuitar && (
            <Button variant="danger" className="mr-auto" icon={<Trash2 className="size-4" />} onClick={onQuitar}>
              Quitar acceso
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="form-acceso" loading={guardando}>
            {esNuevo ? 'Dar acceso' : 'Guardar'}
          </Button>
        </>
      }
    >
      <form id="form-acceso" onSubmit={guardar} className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Email">
            <Input
              type="email"
              required
              value={b.email}
              disabled={!esNuevo}
              onChange={(e) => setB({ ...b, email: e.target.value })}
              placeholder="nombre@empresa.com"
              autoFocus={esNuevo}
            />
          </Field>
          <Field label="Nombre">
            <Input value={b.nombre} onChange={(e) => setB({ ...b, nombre: e.target.value })} placeholder="Nombre y apellidos" />
          </Field>
        </div>

        <div>
          <p className="mb-2 text-[13px] font-medium text-ink/80">Rol</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {ROLES.map((r) => (
              <button
                type="button"
                key={r.id}
                onClick={() => setB({ ...b, rol: r.id })}
                className={cx(
                  'rounded-xl border p-3 text-left transition-colors',
                  b.rol === r.id ? 'border-ink bg-lima/30' : 'border-line hover:border-ink/30',
                )}
              >
                <span className="block font-medium">{r.nombre}</span>
                <span className="block text-xs text-muted">{r.detalle}</span>
              </button>
            ))}
          </div>
        </div>

        {b.rol === 'admin' && (
          <div>
            <p className="mb-2 text-[13px] font-medium text-ink/80">Qué puede ver y hacer</p>
            <div className="divide-y divide-line rounded-xl border border-line">
              {MODULOS.map((m) => {
                const forzado = (m.id === 'ventas' || m.id === 'gastos') && b.permisos.contabilidad
                return (
                  <label key={m.id} className={cx('flex cursor-pointer items-start gap-3 px-3 py-2.5', forzado && 'cursor-default')}>
                    <input
                      type="checkbox"
                      className="mt-1 size-4 accent-ink"
                      checked={b.permisos[m.id]}
                      disabled={forzado}
                      onChange={(e) => cambiarPermiso(m.id, e.target.checked)}
                    />
                    <span>
                      <span className="block text-[15px]">{m.nombre}</span>
                      <span className="block text-xs text-muted">
                        {m.detalle}
                        {forzado && ' · Necesario para la contabilidad'}
                      </span>
                    </span>
                  </label>
                )
              })}
            </div>
            <p className="mt-2 text-xs text-muted">Todos los admins ven también la Vista de socio y pueden hablar con el asesor.</p>
          </div>
        )}

        {b.rol === 'empleado' && (
          <Field
            label="Su ficha de trabajador"
            hint={trabajadores.length ? 'Para que vea sus nóminas y sus documentos.' : 'No hay trabajadores dados de alta en Laboral: podrá subir tickets, pero no verá nóminas.'}
          >
            <Select value={b.trabajador_id} onChange={(e) => setB({ ...b, trabajador_id: e.target.value })}>
              <option value="">Sin vincular</option>
              {trabajadores.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </Select>
          </Field>
        )}

        {b.rol === 'comercial' && (
          <p className="rounded-xl bg-paper p-3 text-sm text-muted">
            Puede preparar facturas, pero se quedan en borrador: las emite el titular o alguien de administración.
          </p>
        )}

        {esNuevo ? (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-ink" checked={b.bienvenida} onChange={(e) => setB({ ...b, bienvenida: e.target.checked })} />
            Enviarle un correo con sus accesos
          </label>
        ) : (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-ink" checked={b.activo} onChange={(e) => setB({ ...b, activo: e.target.checked })} />
            Acceso activo (desmárcalo para cortarle el acceso sin borrarlo)
          </label>
        )}
      </form>
    </Modal>
  )
}
