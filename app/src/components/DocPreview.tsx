import { useEffect, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { signedUrl } from '../lib/supabase'
import { Spinner } from './ui'

/** Muestra el PDF o la foto original guardada en el almacenamiento */
export default function DocPreview({ path }: { path: string | null }) {
  const [url, setUrl] = useState<string | null>(null)
  const [cargando, setCargando] = useState(Boolean(path))

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
  return (
    <div className="flex h-full flex-col">
      <div className="min-h-64 flex-1 overflow-hidden rounded-xl border border-line bg-paper">
        {esPdf ? (
          <iframe src={url} title="Documento" className="h-full min-h-[420px] w-full" />
        ) : (
          <img src={url} alt="Documento" className="h-full max-h-[70vh] w-full object-contain" />
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
