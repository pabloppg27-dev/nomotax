import { useState } from 'react'
import { FileText, Link2, Paperclip, Plus, Trash2, X } from 'lucide-react'
import * as st from '../lib/almacen'
import Documentos, { rutaBase } from './Documentos'
import * as db from '../lib/datos'
import { useStore } from '../lib/store'
import type { Tarea } from '../lib/tipos'
import { Boton, Campo, entrada, Modal } from './ui'
import { SelCliente, SelPrioridad, SelProyecto } from './Selectores'

/** Crear (tarea sin id) o editar una tarea */
export default function TareaDetalle({ tarea, onClose }: { tarea: Partial<Tarea>; onClose: () => void }) {
  const { recargar, cliente, proyecto } = useStore()
  const [t, setT] = useState<Partial<Tarea>>({ prioridad: 'media', enlaces: [], ...tarea })
  const [nuevoLink, setNuevoLink] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [pendientes, setPendientes] = useState<File[]>([]) // archivos elegidos antes de crear la tarea
  // Carpeta de la tarea: Cliente / (Proyecto) / Tareas / «Título · id» — con los datos guardados, no los que estás editando
  const carpetaDe = (x: Partial<Tarea>) => (alm: st.Almacen) =>
    st.rutaTarea(alm, rutaBase(cliente(x.cliente_id)?.nombre, proyecto(x.proyecto_id)?.nombre), x.titulo ?? 'Tarea', x.id!)
  const set = (c: Partial<Tarea>) => setT((x) => ({ ...x, ...c }))

  async function guardar() {
    if (!t.titulo?.trim()) return
    setGuardando(true)
    const datos = { titulo: t.titulo.trim(), descripcion: t.descripcion || null, prioridad: t.prioridad, cliente_id: t.cliente_id || null,
      proyecto_id: t.proyecto_id || null, fecha: t.fecha || null, enlaces: t.enlaces ?? [] }
    if (t.id) await db.cambiarTarea(t.id, datos)
    else {
      const nueva = await db.crearTarea(datos)
      if (pendientes.length) {
        const r = await st.almacen(true)
        if ('alm' in r) await r.alm.guardar(await carpetaDe(nueva)(r.alm), pendientes)
        else alert('No se han guardado los archivos: falta dar acceso a la carpeta del Mac.')
      }
    }
    await recargar(); onClose()
  }
  function anadirLink() {
    const url = nuevoLink.trim(); if (!url) return
    const full = /^https?:\/\//.test(url) ? url : 'https://' + url
    let titulo = full; try { titulo = new URL(full).hostname.replace(/^www\./, '') } catch { /* vale */ }
    set({ enlaces: [...(t.enlaces ?? []), { titulo, url: full }] }); setNuevoLink('')
  }

  return (
    <Modal titulo={t.id ? 'Tarea' : 'Nueva tarea'} onClose={onClose}>
      <div className="space-y-4">
        <Campo etiqueta="Tarea"><input className={entrada} value={t.titulo ?? ''} onChange={(e) => set({ titulo: e.target.value })} autoFocus={!t.id} /></Campo>
        <Campo etiqueta="Prioridad"><SelPrioridad value={t.prioridad!} onChange={(prioridad) => set({ prioridad })} /></Campo>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo etiqueta="Cliente"><SelCliente value={t.cliente_id} onChange={(cliente_id) => set({ cliente_id })} /></Campo>
          <Campo etiqueta="Proyecto"><SelProyecto value={t.proyecto_id} onChange={(proyecto_id) => set({ proyecto_id })} /></Campo>
        </div>
        <Campo etiqueta="Fecha límite"><input type="date" className={entrada} value={t.fecha ?? ''} onChange={(e) => set({ fecha: e.target.value || null })} /></Campo>
        <Campo etiqueta="Detalle"><textarea rows={5} className={entrada} value={t.descripcion ?? ''} onChange={(e) => set({ descripcion: e.target.value })} placeholder="Explicación, pasos, lo que haga falta…" /></Campo>
        <div>
          <span className="mb-1 block text-xs font-medium text-muted">Enlaces</span>
          <ul className="mb-2 space-y-1">
            {(t.enlaces ?? []).map((l, i) => (
              <li key={i} className="flex items-center gap-2 text-sm">
                <Link2 size={14} className="shrink-0 text-muted" />
                <a href={l.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate underline">{l.titulo}</a>
                <button onClick={() => set({ enlaces: t.enlaces!.filter((_, j) => j !== i) })} className="text-muted hover:text-rojo"><Trash2 size={14} /></button>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <input className={entrada} placeholder="Pega un enlace" value={nuevoLink} onChange={(e) => setNuevoLink(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && anadirLink()} />
            <Boton variante="suave" onClick={anadirLink}><Plus size={16} /></Boton>
          </div>
        </div>
        <div>
          <span className="mb-1 block text-xs font-medium text-muted">Documentos</span>
          {t.id ? (
            <Documentos clave={t.id} destino={carpetaDe(tarea)} />
          ) : (
            <div className="rounded-xl border-2 border-dashed border-line p-3"
              onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); setPendientes((x) => [...x, ...Array.from(e.dataTransfer.files)]) }}>
              {pendientes.map((f, i) => (
                <p key={i} className="flex items-center gap-2 py-1 text-sm"><FileText size={14} className="text-muted" /><span className="min-w-0 flex-1 truncate">{f.name}</span>
                  <button onClick={() => setPendientes((x) => x.filter((_, j) => j !== i))} className="text-muted hover:text-rojo"><X size={14} /></button></p>
              ))}
              <label className="flex cursor-pointer items-center justify-center gap-2 py-2 text-sm text-muted hover:text-ink">
                <Paperclip size={14} /> Adjuntar documentos
                <input type="file" multiple className="hidden" onChange={(e) => { setPendientes((x) => [...x, ...Array.from(e.target.files ?? [])]); e.target.value = '' }} />
              </label>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
          {t.id && <Boton variante="peligro" onClick={async () => { if (confirm('¿Borrar la tarea?')) { await db.borrarTarea(t.id!); await recargar(); onClose() } }}><Trash2 size={16} /> Borrar</Boton>}
          {t.id && <Boton variante="suave" onClick={async () => { await db.cambiarTarea(t.id!, { hecha: !t.hecha, hecha_at: t.hecha ? null : new Date().toISOString() }); await recargar(); onClose() }}>{t.hecha ? 'Reabrir' : 'Marcar hecha'}</Boton>}
          <Boton className="ml-auto" onClick={guardar} disabled={guardando || !t.titulo?.trim()}>Guardar</Boton>
        </div>
      </div>
    </Modal>
  )
}
