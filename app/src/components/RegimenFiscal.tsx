import { useEffect, useState } from 'react'
import { errorMessage, supabase } from '../lib/supabase'
import type { Profile } from '../lib/types'
import {
  FORMAS,
  METODOS_IRPF,
  REGIMENES_IVA,
  TIPOS_IS,
  formaPorNif,
  type Fiscal,
  type Forma,
  type MetodoIrpf,
  type RegimenIva,
  type TipoIs,
} from '../lib/regimenFiscal'
import { Button, Field, Modal, Select, cx, notify } from './ui'

type PerfilFiscal = Pick<Profile, 'id' | 'nombre' | 'email' | 'nif' | 'fiscal'>

/** Ventana del asesor para poner el régimen fiscal de un cliente (Panel → Clientes) */
export function EditorFiscal({ perfil, onClose, onGuardado }: { perfil: PerfilFiscal | null; onClose: () => void; onGuardado: () => Promise<void> | void }) {
  const [f, setF] = useState<Fiscal>({})
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (!perfil) return
    const inicial = perfil.fiscal ?? {}
    setF({ ...inicial, forma: inicial.forma ?? formaPorNif(perfil.nif) ?? 'autonomo', iva: inicial.iva ?? [] })
  }, [perfil])

  const cambiar = (c: Partial<Fiscal>) => setF((x) => ({ ...x, ...c }))
  const conIva = (id: RegimenIva, si: boolean) => {
    const iva = new Set(f.iva ?? [])
    if (si) iva.add(id)
    else iva.delete(id)
    // Módulos de IRPF y régimen simplificado de IVA suelen ir juntos: se propone, se puede quitar
    cambiar({ iva: REGIMENES_IVA.map((r) => r.id).filter((r) => iva.has(r)) })
  }

  const guardar = async () => {
    if (!perfil) return
    setGuardando(true)
    // Solo lo que aplica a su forma: el IRPF al autónomo, el Impuesto de Sociedades a la sociedad
    const fiscal: Fiscal = {
      forma: f.forma,
      ...(f.forma === 'autonomo' || f.forma === 'comunidad' ? { irpf: f.irpf ?? 'directa_simplificada' } : {}),
      ...(f.forma === 'sociedad' ? { is: f.is ?? 'general' } : {}),
      iva: f.iva ?? [],
      roi: Boolean(f.roi),
      redeme: Boolean(f.redeme),
      sii: Boolean(f.sii),
    }
    const { error } = await supabase.from('profiles').update({ fiscal }).eq('id', perfil.id)
    setGuardando(false)
    if (error) {
      const msg = await errorMessage(error)
      return notify(/fiscal/.test(msg) ? 'Falta ejecutar supabase/panel-asesor.sql en Supabase' : msg, 'error')
    }
    notify('Régimen fiscal guardado')
    await onGuardado()
    onClose()
  }

  const casilla = (checked: boolean, onChange: (v: boolean) => void, titulo: string, detalle?: string) => (
    <label key={titulo} className={cx('flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5', checked ? 'border-ink bg-lima/20' : 'border-line hover:bg-paper')}>
      <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-ink" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="min-w-0">
        <span className="block text-[15px] font-medium">{titulo}</span>
        {detalle && <span className="block text-xs text-muted">{detalle}</span>}
      </span>
    </label>
  )

  return (
    <Modal
      open={Boolean(perfil)}
      onClose={onClose}
      title={`Régimen fiscal${perfil?.nombre ? ` · ${perfil.nombre}` : ''}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={guardar} loading={guardando}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Field label="Forma">
          <Select value={f.forma ?? 'autonomo'} onChange={(e) => cambiar({ forma: e.target.value as Forma })}>
            {Object.entries(FORMAS).map(([id, nombre]) => (
              <option key={id} value={id}>
                {nombre}
              </option>
            ))}
          </Select>
        </Field>

        {(f.forma === 'autonomo' || f.forma === 'comunidad') && (
          <Field label="IRPF">
            <Select
              value={f.irpf ?? 'directa_simplificada'}
              onChange={(e) => {
                const irpf = e.target.value as MetodoIrpf
                const iva = new Set(f.iva ?? [])
                if (irpf === 'modulos' && f.irpf !== 'modulos') iva.add('simplificado')
                cambiar({ irpf, iva: REGIMENES_IVA.map((r) => r.id).filter((r) => iva.has(r)) })
              }}
            >
              {Object.entries(METODOS_IRPF).map(([id, nombre]) => (
                <option key={id} value={id}>
                  {nombre}
                </option>
              ))}
            </Select>
          </Field>
        )}

        {f.forma === 'sociedad' && (
          <Field label="Impuesto de Sociedades">
            <Select value={f.is ?? 'general'} onChange={(e) => cambiar({ is: e.target.value as TipoIs })}>
              {Object.entries(TIPOS_IS).map(([id, nombre]) => (
                <option key={id} value={id}>
                  {nombre}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <div>
          <p className="mb-1 text-[13px] font-medium text-ink/80">IVA: regímenes especiales</p>
          <p className="mb-2 text-xs text-muted">Sin marcar ninguno, va por el régimen general.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {REGIMENES_IVA.map((r) => casilla(Boolean(f.iva?.includes(r.id)), (v) => conIva(r.id, v), r.nombre, r.detalle))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-[13px] font-medium text-ink/80">Registros</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {casilla(Boolean(f.roi), (v) => cambiar({ roi: v }), 'ROI', 'Operador intracomunitario')}
            {casilla(Boolean(f.redeme), (v) => cambiar({ redeme: v }), 'REDEME', 'Devolución mensual de IVA')}
            {casilla(Boolean(f.sii), (v) => cambiar({ sii: v }), 'SII', 'Libros de IVA al día')}
          </div>
        </div>

        <p className="rounded-xl bg-paper px-3 py-2.5 text-sm text-muted">
          De momento queda anotado en su ficha. Los cálculos propios de módulos, recargo de equivalencia, REBU y demás se irán añadiendo, y el apartado Trimestre lo usará para decir
          qué modelos le tocan.
        </p>
      </div>
    </Modal>
  )
}
