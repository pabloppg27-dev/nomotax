import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Building2, Pencil, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '../../lib/auth'
import { errorMessage, supabase } from '../../lib/supabase'
import { eur } from '../../lib/format'
import type { CategoriaConvenio, CentroTrabajo, PerfilLaboral } from '../../lib/types'
import NumInput from '../../components/NumInput'
import { Button, Card, Empty, Field, Input, Loading, Modal, Select, Textarea, confirmar, notify } from '../../components/ui'
import LaboralTabs from './LaboralTabs'

const perfilVacio = (owner_id: string): PerfilLaboral => ({
  owner_id,
  convenio_nombre: '',
  convenio_codigo: '',
  periodo_prueba: '',
  pagas_convenio: 14,
  horas_semana_convenio: 40,
  notas: '',
})

export default function Empresa() {
  const { ownerId, isAdvisor } = useAuth()
  const [perfil, setPerfil] = useState<PerfilLaboral | null>(null)
  const [centros, setCentros] = useState<CentroTrabajo[] | null>(null)
  const [categorias, setCategorias] = useState<CategoriaConvenio[] | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [centro, setCentro] = useState<Partial<CentroTrabajo> | null>(null)
  const [categoria, setCategoria] = useState<Partial<CategoriaConvenio> | null>(null)

  const cargar = useCallback(async () => {
    if (!ownerId) return
    const [p, c, k] = await Promise.all([
      supabase.from('perfil_laboral').select('*').eq('owner_id', ownerId).maybeSingle(),
      supabase.from('centros_trabajo').select('*').eq('owner_id', ownerId).order('nombre'),
      supabase.from('categorias_convenio').select('*').eq('owner_id', ownerId).order('orden').order('nombre'),
    ])
    setPerfil((p.data as PerfilLaboral) ?? perfilVacio(ownerId))
    setCentros((c.data as CentroTrabajo[]) ?? [])
    setCategorias((k.data as CategoriaConvenio[]) ?? [])
  }, [ownerId])

  useEffect(() => {
    cargar()
  }, [cargar])

  if (!ownerId || !perfil || !centros || !categorias) return <Loading />
  const editable = isAdvisor

  const guardarPerfil = async (e: FormEvent) => {
    e.preventDefault()
    setGuardando(true)
    const { error } = await supabase.from('perfil_laboral').upsert({ ...perfil, owner_id: ownerId })
    setGuardando(false)
    if (error) return notify(await errorMessage(error), 'error')
    notify('Convenio guardado')
  }

  const guardarCentro = async () => {
    if (!centro?.nombre?.trim()) return notify('Pon un nombre al centro', 'error')
    const datos = {
      owner_id: ownerId,
      nombre: centro.nombre.trim(),
      direccion: centro.direccion || null,
      cp: centro.cp || null,
      ciudad: centro.ciudad || null,
      provincia: centro.provincia || null,
      ccc: centro.ccc ? centro.ccc.replace(/\s/g, '') : null,
    }
    const res = centro.id
      ? await supabase.from('centros_trabajo').update(datos).eq('id', centro.id)
      : await supabase.from('centros_trabajo').insert(datos)
    if (res.error) return notify(await errorMessage(res.error), 'error')
    setCentro(null)
    notify('Centro guardado')
    cargar()
  }

  const guardarCategoria = async () => {
    if (!categoria?.nombre?.trim()) return notify('Pon el nombre de la categoría', 'error')
    const datos = {
      owner_id: ownerId,
      nombre: categoria.nombre.trim(),
      grupo_cotizacion: categoria.grupo_cotizacion || null,
      salario_min_mensual: categoria.salario_min_mensual || null,
      orden: categoria.orden ?? categorias.length,
    }
    const res = categoria.id
      ? await supabase.from('categorias_convenio').update(datos).eq('id', categoria.id)
      : await supabase.from('categorias_convenio').insert(datos)
    if (res.error) return notify(await errorMessage(res.error), 'error')
    setCategoria(null)
    notify('Categoría guardada')
    cargar()
  }

  const borrar = async (tabla: 'centros_trabajo' | 'categorias_convenio', id: string, nombre: string) => {
    const ok = await confirmar({ titulo: 'Eliminar', texto: `¿Eliminar «${nombre}»?`, accion: 'Eliminar', peligro: true })
    if (!ok) return
    const { error } = await supabase.from(tabla).delete().eq('id', id)
    if (error) return notify(await errorMessage(error), 'error')
    cargar()
  }

  const setP = (k: keyof PerfilLaboral) => (e: { target: { value: string } }) => setPerfil({ ...perfil, [k]: e.target.value })

  return (
    <>
      <LaboralTabs
        subtitle={
          editable
            ? 'Datos laborales de la empresa: se usan para las altas y para comprobar los salarios.'
            : 'Los datos laborales de tu empresa, tal como los tiene tu asesor.'
        }
      />

      <div className="grid gap-6 xl:grid-cols-2">
        {/* Centros */}
        <Card className="p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="font-semibold">Centros de trabajo</h2>
            {editable && (
              <Button size="sm" variant="secondary" icon={<Plus className="size-4" />} onClick={() => setCentro({})}>
                Añadir centro
              </Button>
            )}
          </div>
          {centros.length === 0 ? (
            <Empty
              icon={<Building2 className="size-5" />}
              title="Sin centros de trabajo"
              text={editable ? 'Añade los centros para que el cliente pueda elegirlos al pedir un alta.' : 'Tu asesor los añadirá pronto.'}
            />
          ) : (
            <ul className="divide-y divide-line">
              {centros.map((c) => (
                <li key={c.id} className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0 text-sm">
                    <p className="text-[15px] font-medium">{c.nombre}</p>
                    <p className="text-muted">{[c.direccion, [c.cp, c.ciudad].filter(Boolean).join(' '), c.provincia].filter(Boolean).join(', ')}</p>
                    {c.ccc && <p className="text-muted">CCC {c.ccc}</p>}
                  </div>
                  {editable && (
                    <div className="flex shrink-0">
                      <button className="rounded-full p-1.5 text-muted hover:bg-ink/5" onClick={() => setCentro(c)} aria-label="Editar">
                        <Pencil className="size-4" />
                      </button>
                      <button className="rounded-full p-1.5 text-muted hover:bg-rojo/10 hover:text-rojo" onClick={() => borrar('centros_trabajo', c.id, c.nombre)} aria-label="Eliminar">
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Convenio */}
        <Card className="p-5 sm:p-6">
          <h2 className="mb-4 font-semibold">Convenio colectivo</h2>
          <form onSubmit={guardarPerfil} className="grid gap-3 sm:grid-cols-2">
            <Field label="Convenio" className="sm:col-span-2">
              <Input value={perfil.convenio_nombre ?? ''} onChange={setP('convenio_nombre')} disabled={!editable} placeholder="Ej.: Oficinas y despachos de Madrid" />
            </Field>
            <Field label="Código del convenio">
              <Input value={perfil.convenio_codigo ?? ''} onChange={setP('convenio_codigo')} disabled={!editable} />
            </Field>
            <Field label="Pagas del convenio">
              <Select
                value={perfil.pagas_convenio}
                disabled={!editable}
                onChange={(e) => setPerfil({ ...perfil, pagas_convenio: Number(e.target.value) })}
              >
                {[12, 14, 15, 16].map((n) => (
                  <option key={n} value={n}>
                    {n} pagas
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Jornada completa (horas/semana)">
              <NumInput
                value={Number(perfil.horas_semana_convenio)}
                disabled={!editable}
                onValue={(n) => setPerfil({ ...perfil, horas_semana_convenio: n || 40 })}
              />
            </Field>
            <Field label="Periodo de prueba">
              <Input value={perfil.periodo_prueba ?? ''} onChange={setP('periodo_prueba')} disabled={!editable} placeholder="Ej.: 6 meses técnicos, 2 meses resto" />
            </Field>
            <Field label="Notas" className="sm:col-span-2">
              <Textarea value={perfil.notas ?? ''} onChange={setP('notas')} disabled={!editable} />
            </Field>
            {editable && (
              <div className="sm:col-span-2">
                <Button type="submit" loading={guardando}>
                  Guardar convenio
                </Button>
              </div>
            )}
          </form>
        </Card>

        {/* Categorías */}
        <Card className="p-5 sm:p-6 xl:col-span-2">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">Categorías y salarios mínimos</h2>
              <p className="text-sm text-muted">Salario bruto mensual a jornada completa según el convenio, en {perfil.pagas_convenio} pagas.</p>
            </div>
            {editable && (
              <Button size="sm" variant="secondary" icon={<Plus className="size-4" />} onClick={() => setCategoria({})}>
                Añadir categoría
              </Button>
            )}
          </div>
          {categorias.length === 0 ? (
            <p className="py-6 text-sm text-muted">Todavía no hay categorías.</p>
          ) : (
            <table className="w-full text-left text-[15px]">
              <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="py-2 pr-3 font-medium">Categoría</th>
                  <th className="py-2 pr-3 font-medium">Grupo</th>
                  <th className="py-2 pr-3 text-right font-medium">Mínimo mensual</th>
                  {editable && <th />}
                </tr>
              </thead>
              <tbody>
                {categorias.map((k) => (
                  <tr key={k.id} className="border-b border-line last:border-0">
                    <td className="py-2.5 pr-3">{k.nombre}</td>
                    <td className="py-2.5 pr-3 text-muted">{k.grupo_cotizacion ?? '—'}</td>
                    <td className="num py-2.5 pr-3 text-right">{k.salario_min_mensual ? eur(k.salario_min_mensual) : '—'}</td>
                    {editable && (
                      <td className="w-16 py-2.5 text-right">
                        <button className="rounded-full p-1.5 text-muted hover:bg-ink/5" onClick={() => setCategoria(k)} aria-label="Editar">
                          <Pencil className="size-4" />
                        </button>
                        <button className="rounded-full p-1.5 text-muted hover:bg-rojo/10 hover:text-rojo" onClick={() => borrar('categorias_convenio', k.id, k.nombre)} aria-label="Eliminar">
                          <Trash2 className="size-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      <Modal
        open={Boolean(centro)}
        onClose={() => setCentro(null)}
        title={centro?.id ? 'Editar centro' : 'Nuevo centro de trabajo'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCentro(null)}>
              Cancelar
            </Button>
            <Button onClick={guardarCentro}>Guardar</Button>
          </>
        }
      >
        {centro && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nombre" className="sm:col-span-2">
              <Input value={centro.nombre ?? ''} onChange={(e) => setCentro({ ...centro, nombre: e.target.value })} placeholder="Ej.: Oficina central" autoFocus />
            </Field>
            <Field label="Dirección" className="sm:col-span-2">
              <Input value={centro.direccion ?? ''} onChange={(e) => setCentro({ ...centro, direccion: e.target.value })} />
            </Field>
            <Field label="Código postal">
              <Input value={centro.cp ?? ''} onChange={(e) => setCentro({ ...centro, cp: e.target.value })} />
            </Field>
            <Field label="Ciudad">
              <Input value={centro.ciudad ?? ''} onChange={(e) => setCentro({ ...centro, ciudad: e.target.value })} />
            </Field>
            <Field label="Provincia">
              <Input value={centro.provincia ?? ''} onChange={(e) => setCentro({ ...centro, provincia: e.target.value })} />
            </Field>
            <Field label="Código de cuenta de cotización">
              <Input value={centro.ccc ?? ''} onChange={(e) => setCentro({ ...centro, ccc: e.target.value })} />
            </Field>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(categoria)}
        onClose={() => setCategoria(null)}
        title={categoria?.id ? 'Editar categoría' : 'Nueva categoría'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCategoria(null)}>
              Cancelar
            </Button>
            <Button onClick={guardarCategoria}>Guardar</Button>
          </>
        }
      >
        {categoria && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Categoría profesional" className="sm:col-span-2">
              <Input value={categoria.nombre ?? ''} onChange={(e) => setCategoria({ ...categoria, nombre: e.target.value })} placeholder="Ej.: Auxiliar administrativo" autoFocus />
            </Field>
            <Field label="Grupo de cotización">
              <Select
                value={categoria.grupo_cotizacion ?? ''}
                onChange={(e) => setCategoria({ ...categoria, grupo_cotizacion: e.target.value ? Number(e.target.value) : null })}
              >
                <option value="">—</option>
                {Array.from({ length: 11 }, (_, i) => i + 1).map((g) => (
                  <option key={g} value={g}>
                    Grupo {g}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Salario mínimo bruto mensual">
              <NumInput
                className="text-right"
                value={Number(categoria.salario_min_mensual ?? 0)}
                onValue={(n) => setCategoria({ ...categoria, salario_min_mensual: n })}
              />
            </Field>
          </div>
        )}
      </Modal>
    </>
  )
}
