import { useEffect, useState } from 'react'
import { ExternalLink, FileText } from 'lucide-react'
import { signedUrl } from '../lib/supabase'
import { Spinner } from './ui'

/** Muestra el PDF o la foto original guardada en el almacenamiento */
export default function DocPreview({ path }: { path: string | null }) {
  const [url, setUrl] = useState<string | null>(null)
  const [cargando, setCargando] = useState(Boolean(path))
  const [movil] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches)

  useEffect(() => {
    let vivo = true
    if (!path) {
      setUrl(null)
      setCargando(false)
      return
    }
    setCargando(true)
    signedUrl(path, 900).then((u) => {
      if (!vivo) return
      setUrl(u)
      setCargando(false)
    })
    return () => {
      vivo = false
    }
  }, [path])

  if (!path) {
    return <div className="grid h-full min-h-48 place-items-center rounded-xl bg-paper text-sm text-muted">Sin documento adjunto</div>
  }
  if (cargando || !url) {
    return (
      <div className="grid h-full min-h-48 place-items-center rounded-xl bg-paper">
        <Spinner />
      </div>
    )
  }
  const esPdf = path.toLowerCase().endsWith('.pdf')
  // En el móvil (iPhone sobre todo) un PDF incrustado no respeta el ancho y se sale de la pantalla:
  // se muestra una tarjeta que lo abre a pantalla completa.
  if (esPdf && movil) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-xl border border-line bg-paper p-4 active:bg-ink/5">
        <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-white">
          <FileText className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">Ver la factura</span>
          <span className="block text-sm text-muted">PDF · se abre a pantalla completa</span>
        </span>
        <ExternalLink className="size-4 text-muted" />
      </a>
    )
  }
  return (
    <div className="flex h-full flex-col">
      <div className="min-h-64 flex-1 overflow-hidden rounded-xl border border-line bg-paper">
        {esPdf ? (
          <iframe src={url} title="Documento" className="h-full min-h-[420px] w-full" />
        ) : (
          <img src={url} alt="Documento" className="h-full max-h-[45vh] w-full object-contain md:max-h-[70vh]" />
        )}
      </div>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="mt-2 inline-flex items-center gap-1 self-start text-sm text-muted hover:text-ink"
      >
        <ExternalLink className="size-3.5" /> Abrir en otra pestaña
      </a>
    </div>
  )
}
