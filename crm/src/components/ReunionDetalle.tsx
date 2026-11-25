import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarDays, ExternalLink, Loader2, Trash2, Video } from 'lucide-react'
import { agendar, aISO, cancelar, diaLocal, hora } from '../lib/agenda'
import * as db from '../lib/datos'
import { useStore } from '../lib/store'
import type { Reunion } from '../lib/tipos'
import { SelCliente, SelProyecto } from './Selectores'
import { Boton, Campo, entrada, Modal } from './ui'

export type BorradorReunion = Partial<Reunion> & { fecha?: string | null; hora?: string | null }

/** Nueva reunión (sin id): revisar y «Confirmar y enviar» → Google Calendar + Meet + invitación.
 *  Existente: ver, notas, reprogramar (cancela y vuelve a crear el evento) o cancelar. */
export default function ReunionDetalle({ reunion, onClose, onGuardada }: { reunion: BorradorReunion; onClose: () => void; onGuardada?: (r: Reunion) => void }) {
  const { recargar, cliente, clientes } = useStore()
  const ir = useNavigate()
  const ini = reunion.inicio
  const [r, setR] = useState<BorradorReunion>({
    duracion: 60, meet: true, ...reunion,
    fecha: reunion.fecha ?? (ini ? diaLocal(ini) : null), hora: reunion.hora ?? (ini ? hora(ini) : '10:00'),
    email: reunion.email ?? cliente(reunion.cliente_id)?.email ?? '',
  })
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const set = (c: BorradorReunion) => setR((x) => ({ ...x, ...c }))
  const existe = !!r.id
  const cambiaHora = existe && (r.fecha !== diaLocal(ini!) || r.hora !== hora(ini!) || r.duracion !== reunion.duracion || (r.email || '') !== (reunion.email || '') || r.meet !== reunion.meet)

  async function confirmar(forzar = false) {
    if (!r.titulo?.trim() || !r.fecha || !r.hora) return setError('Falta el asunto, el día o la hora')
    setEnviando(true); setError(null)
    try {
      const inicio = aISO(r.fecha, r.hora)
      const email = r.email?.trim().toLowerCase() || null
      // Sin cliente elegido pero el email es de uno: se asocia solo
      const cliente_id = r.cliente_id || (email ? clientes.find((x) => x.email?.toLowerCase() === email)?.id : null) || null
      const c = cliente(cliente_id)
      let g: { evento_id?: string | null; evento_url?: string | null; meet_url?: string | null } = {}
      if (!existe || cambiaHora) {
        // En Google siempre «NomoTax <> Empresa»; el asunto va en la descripción
        const a = await agendar({ titulo: `NomoTax <> ${c?.nombre ?? r.titulo.trim()}`,
          descripcion: [r.titulo.trim(), r.descripcion].filter(Boolean).join('\n\n'), inicio, duracion: r.duracion ?? 60,
          email, nombre: c?.nombre, meet: !!r.meet, forzar })
        if (!a.ok) {
          if (a.error === 'ocupado') { setOcupado(true); return }
          throw new Error(a.error === 'no-autorizado' ? 'Google Calendar no acepta la clave (CRM_SECRETO)' : a.error ?? 'No se ha podido agendar')
        }
        if (existe && reunion.evento_id) await cancelar(reunion.evento_id).catch(() => null)
        g = { evento_id: a.evento_id ?? null, evento_url: a.evento_url ?? null, meet_url: a.meet || null }
      }
      const datos = { titulo: r.titulo.trim(), descripcion: r.descripcion || null, cliente_id, proyecto_id: r.proyecto_id || null,
        inicio, duracion: r.duracion ?? 60, email, meet: !!r.meet, notas: r.notas || null, ...g }
      let guardada: Reunion
      if (existe) { await db.cambiarReunion(r.id!, datos); guardada = { ...(reunion as Reunion), ...datos } }
      else guardada = await db.crearReunion(datos)
      // El email queda en la ficha del cliente: la próxima vez sale solo
      await db.recordarEmail(c, email).catch(() => null)
      await recargar(); onGuardada?.(guardada); onClose()
    } catch (e) { setError((e as Error).message) } finally { setEnviando(false) }
  }

  async function anular() {
    if (!confirm(r.email ? '¿Cancelar la reunión? Google avisará al invitado.' : '¿Cancelar la reunión?')) return
    setEnviando(true)
    try {
      if (reunion.evento_id) { const a = await cancelar(reunion.evento_id); if (!a.ok) throw new Error(a.error) }
      await db.borrarReunion(r.id!); await recargar(); onClose()
    } catch (e) { setError((e as Error).message); setEnviando(false) }
  }

  return (
    <Modal titulo={existe ? 'Reunión' : 'Nueva reunión'} onClose={onClose}>
      <div className="space-y-3">
        {existe && reunion.meet_url && (
          <a href={reunion.meet_url} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 rounded-lg bg-lima px-4 py-2.5 text-sm font-semibold text-ink">
            <Video size={18} /> Unirse a Meet
          </a>
        )}
        <Campo etiqueta="Asunto"><input className={entrada} value={r.titulo ?? ''} onChange={(e) => set({ titulo: e.target.value })} /></Campo>
        <div className="grid grid-cols-[1fr_auto_auto] gap-2">
          <Campo etiqueta="Día"><input type="date" className={entrada} value={r.fecha ?? ''} onChange={(e) => set({ fecha: e.target.value })} /></Campo>
          <Campo etiqueta="Hora"><input type="time" className={entrada} value={r.hora ?? ''} onChange={(e) => set({ hora: e.target.value })} /></Campo>
          <Campo etiqueta="Min."><input type="number" min={5} step={5} className={`${entrada} w-20`} value={r.duracion ?? 60} onChange={(e) => set({ duracion: +e.target.value || 60 })} /></Campo>
        </div>
        <Campo etiqueta="Cliente"><SelCliente value={r.cliente_id} onChange={(v) => set({ cliente_id: v, email: r.email || cliente(v)?.email || '' })} /></Campo>
        <Campo etiqueta="Proyecto"><SelProyecto value={r.proyecto_id} onChange={(v) => set({ proyecto_id: v })} /></Campo>
        <Campo etiqueta="Email del invitado (le llega la invitación de Google)">
          <input type="email" className={entrada} value={r.email ?? ''} onChange={(e) => set({ email: e.target.value })} placeholder="Vacío = solo en tu calendario" />
        </Campo>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!r.meet} onChange={(e) => set({ meet: e.target.checked })} /> Con Google Meet</label>
        <Campo etiqueta="Qué se va a tratar (sale en la invitación)"><textarea rows={3} className={entrada} value={r.descripcion ?? ''} onChange={(e) => set({ descripcion: e.target.value })} /></Campo>
        {existe && <Campo etiqueta="Notas internas"><textarea rows={3} className={entrada} value={r.notas ?? ''} onChange={(e) => set({ notas: e.target.value })} placeholder="Solo para ti" /></Campo>}
        {ocupado && (
          <div className="rounded-lg bg-amber-50 p-3 text-sm">
            Ya tienes algo en el calendario a esa hora.
            <div className="mt-2 flex gap-2"><Boton variante="suave" onClick={() => setOcupado(false)}>Cambiar hora</Boton><Boton onClick={() => { setOcupado(false); void confirmar(true) }}>Agendar igualmente</Boton></div>
          </div>
        )}
        {error && <p className="text-sm text-rojo">{error}</p>}
        <div className="flex flex-wrap gap-2 border-t border-line pt-4">
          {existe && <Boton variante="peligro" onClick={anular} disabled={enviando}><Trash2 size={16} /> Cancelar reunión</Boton>}
          {existe && <Boton variante="suave" onClick={() => { onClose(); ir(`/calendario?dia=${r.fecha}`) }}><CalendarDays size={16} /> Ver en calendario</Boton>}
          {existe && reunion.evento_url && <a href={reunion.evento_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-2 text-sm text-muted"><ExternalLink size={14} /> Google</a>}
          <Boton className="ml-auto" onClick={() => confirmar()} disabled={enviando || ocupado}>
            {enviando ? <><Loader2 size={16} className="animate-spin" /> Enviando…</> : !existe ? (r.email ? 'Confirmar y enviar' : 'Confirmar') : cambiaHora ? 'Reprogramar' : 'Guardar'}
          </Boton>
        </div>
      </div>
    </Modal>
  )
}
