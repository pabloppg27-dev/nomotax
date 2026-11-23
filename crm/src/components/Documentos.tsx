import { useCallback, useEffect, useState } from 'react'
import { FileText, FolderOpen, Loader2, Trash2, Upload } from 'lucide-react'
import * as st from '../lib/almacen'
import { Boton } from './ui'

/**
 * Documentos de un cliente / proyecto / tarea. Se guardan solos (nube o navegador);
 * opcionalmente en una carpeta del Mac.
 * - destino: carpeta donde va lo que subes. ver: la que se lista (por defecto, destino).
 */
export default function Documentos({ destino, ver, recursivo = false, clave }: {
  destino: (alm: st.Almacen) => Promise<st.Ruta> | st.Ruta
  ver?: st.Ruta
  recursivo?: boolean
  clave: string
}) {
  const [alm, setAlm] = useState<st.Almacen | null>(null)
  const [nombreMac, setNombreMac] = useState<string>()
  const [pidePermiso, setPidePermiso] = useState<string | null>(null)
  const [archivos, setArchivos] = useState<st.Archivo[] | null>(null)
  const [subiendo, setSubiendo] = useState(false)
  const [encima, setEncima] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async (pedir = false) => {
    try {
      const r = await st.almacen(pedir)
      if ('pidePermiso' in r) { setPidePermiso(r.pidePermiso); setArchivos([]); return }
      setPidePermiso(null); setAlm(r.alm); setNombreMac(r.nombreMac)
      setArchivos(await r.alm.listar(ver ?? await destino(r.alm), recursivo)); setError(null)
    } catch (e) { setError((e as Error).message); setArchivos([]) }
  }, [clave]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void cargar() }, [cargar])

  async function subir(lista: FileList | File[] | null) {
    if (!lista?.length || !alm) return
    setSubiendo(true)
    try { await alm.guardar(await destino(alm), Array.from(lista)); await cargar() }
    catch (e) { setError((e as Error).message) } finally { setSubiendo(false) }
  }

  if (pidePermiso) return (
    <div className="rounded-xl border-2 border-dashed border-line p-4 text-center text-sm">
      <p className="mb-2 text-muted">Los documentos están en la carpeta «{pidePermiso}» del Mac.</p>
      <Boton onClick={() => cargar(true)}><FolderOpen size={16} /> Dar acceso</Boton>
    </div>
  )

  return (
    <div onDragOver={(e) => { e.preventDefault(); setEncima(true) }} onDragLeave={() => setEncima(false)}
      onDrop={(e) => { e.preventDefault(); setEncima(false); void subir(e.dataTransfer.files) }}
      className={`rounded-xl border-2 border-dashed p-3 transition-colors ${encima ? 'border-ink bg-lima/30' : 'border-line'}`}>
      {archivos === null ? null : archivos.length === 0 ? (
        <p className="py-3 text-center text-sm text-muted">Arrastra aquí los documentos o pulsa «Subir»</p>
      ) : (
        <ul className="mb-2">
          {archivos.map((a) => (
            <li key={a.ruta + '/' + a.nombre} className="flex items-center gap-2 border-b border-line py-2 text-sm">
              <FileText size={16} className="shrink-0 text-muted" />
              <button onClick={() => a.abrir().catch((e) => setError(e.message))} className="min-w-0 flex-1 text-left hover:underline">
                <span className="block truncate">{a.nombre}</span>
                {a.ruta && <span className="block truncate text-xs text-muted">{a.ruta.replace(/ · [0-9a-f]{6}/g, '').replace(/(^|\/)Tareas\//, '$1Tarea: ').replace(/(^|\/)_General$/, '$1General').split('/').join(' · ')}</span>}
              </button>
              <span className="shrink-0 text-xs text-muted">{new Date(a.fecha).toLocaleDateString('es-ES')}</span>
              <button aria-label="Borrar" onClick={async () => { if (confirm(`¿Borrar «${a.nombre}»?`)) { await a.borrar(); await cargar() } }} className="text-muted hover:text-rojo"><Trash2 size={14} /></button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mb-2 text-xs text-rojo">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-ink px-3 py-1.5 text-sm text-white">
          {subiendo ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Subir
          <input type="file" multiple className="hidden" onChange={(e) => { void subir(e.target.files); e.target.value = '' }} />
        </label>
        <span className="ml-auto text-xs text-muted">
          {alm?.tipo === 'mac' ? <>📁 Mac: {nombreMac} · <button className="underline" onClick={async () => { if (confirm('¿Dejar de usar la carpeta del Mac? Los archivos se quedan en ella.')) { await st.dejarCarpetaMac(); await cargar() } }}>quitar</button></>
            : <>{alm?.tipo === 'nube' ? '☁️ Guardado en la nube' : 'Guardado en este navegador'}{st.puedeUsarMac() && <> · <button className="underline" onClick={async () => { await st.elegirCarpetaMac(); await cargar(true) }}>usar una carpeta del Mac</button></>}</>}
        </span>
      </div>
    </div>
  )
}

/** Ruta estándar: Cliente / [Proyecto] */
export function rutaBase(cliente?: string, proyecto?: string): st.Ruta {
  return [cliente ?? 'Sin cliente', ...(proyecto ? [proyecto] : [])]
}
