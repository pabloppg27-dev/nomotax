import { useRef, useState, type ReactNode } from 'react'
import { Camera, Upload } from 'lucide-react'
import { ACCEPT_ATTR } from '../lib/upload'
import { Button, cx, notify } from './ui'

export default function UploadZone({
  onFiles,
  titulo,
  texto,
  disabled,
  compacto,
}: {
  onFiles: (files: File[]) => void | Promise<void>
  titulo: string
  texto?: ReactNode
  disabled?: boolean
  compacto?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const camRef = useRef<HTMLInputElement>(null)
  const [encima, setEncima] = useState(false)

  const recibir = (list: FileList | null) => {
    const files = Array.from(list ?? [])
    if (!files.length) return
    try {
      Promise.resolve(onFiles(files)).catch((e) => notify(`No se ha podido subir: ${(e as Error)?.message ?? e}`, 'error'))
    } catch (e) {
      notify(`No se ha podido subir: ${(e as Error)?.message ?? e}`, 'error')
    }
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        if (!disabled) setEncima(true)
      }}
      onDragLeave={() => setEncima(false)}
      onDrop={(e) => {
        e.preventDefault()
        setEncima(false)
        if (!disabled) recibir(e.dataTransfer.files)
      }}
      className={cx(
        'rounded-2xl border-2 border-dashed text-center transition-colors',
        compacto ? 'px-4 py-5' : 'px-6 py-9',
        encima ? 'border-ink bg-lima/30' : 'border-line bg-white',
      )}
    >
      <div className="mx-auto mb-3 grid size-11 place-items-center rounded-full bg-lima">
        <Upload className="size-5" />
      </div>
      <p className="font-medium">{titulo}</p>
      {texto && <p className="mx-auto mt-1 max-w-md text-sm text-muted">{texto}</p>}
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <Button disabled={disabled} icon={<Upload className="size-4" />} onClick={() => inputRef.current?.click()}>
          Subir archivos
        </Button>
        <Button
          variant="secondary"
          disabled={disabled}
          icon={<Camera className="size-4" />}
          onClick={() => camRef.current?.click()}
          className="sm:hidden"
        >
          Hacer foto
        </Button>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT_ATTR}
        className="hidden"
        onChange={(e) => {
          recibir(e.target.files)
          e.target.value = ''
        }}
      />
      <input
        ref={camRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          recibir(e.target.files)
          e.target.value = ''
        }}
      />
    </div>
  )
}
