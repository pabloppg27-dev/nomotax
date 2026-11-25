import { useEffect, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { Download, ExternalLink, FileText, X } from 'lucide-react'
import { cerrarVisor, visor } from '../lib/visor'
import { usePermitirZoom } from '../lib/zoom'

/** Documento a pantalla completa dentro de la app, con «Cerrar» siempre a la vista (también Esc). */
export function VisorHost() {
  const doc = useSyncExternalStore(visor.suscribir, visor.leer)
  // En el resto de la app el zoom con los dedos está bloqueado; aquí sí se puede ampliar el documento
  usePermitirZoom(Boolean(doc))

  useEffect(() => {
    if (!doc) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && cerrarVisor()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [doc])

  if (!doc) return null
  return createPortal(
    <div className="fixed inset-0 z-[60] flex flex-col bg-ink/60 backdrop-blur-[2px] sm:p-4" onClick={cerrarVisor}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={doc.nombre}
        className="relative mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden bg-white shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-line py-2 pl-4 pr-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:pl-5">
          <FileText className="size-4 shrink-0 text-muted" />
          <h2 className="min-w-0 flex-1 truncate text-sm font-medium">{doc.nombre}</h2>
          <a
            href={doc.url}
            target="_blank"
            rel="noreferrer"
            className="hidden items-center gap-1.5 rounded-full px-3 py-2 text-sm text-muted hover:bg-paper hover:text-ink sm:inline-flex"
          >
            <ExternalLink className="size-4" /> Abrir en el navegador
          </a>
          <button
            onClick={cerrarVisor}
            className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-ink px-4 text-sm font-medium text-white hover:bg-ink/85"
            aria-label="Cerrar"
          >
            <X className="size-5" /> Cerrar
          </button>
        </div>
        <div className="min-h-0 flex-1 bg-paper">
          {doc.tipo === 'pdf' ? (
            <iframe src={doc.url} title={doc.nombre} className="block h-full w-full" />
          ) : doc.tipo === 'imagen' ? (
            <img src={doc.url} alt={doc.nombre} className="h-full w-full object-contain p-2" />
          ) : (
            <div className="grid h-full place-items-center p-6 text-center">
              <div>
                <p className="mb-4 text-sm text-muted">Este tipo de archivo no se puede ver aquí.</p>
                <a href={doc.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2.5 text-sm font-medium text-white">
                  <Download className="size-4" /> Descargar
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
