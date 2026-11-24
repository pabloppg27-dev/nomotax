/**
 * Visor de documentos dentro de la app. Se usa cuando no se puede abrir otra pestaña
 * (la app de Mac no abre ventanas nuevas, o el navegador bloquea la ventana emergente):
 * antes se abría el documento encima de la app y no había forma de volver.
 */
export type DocumentoVisor = { url: string; nombre: string; tipo: 'pdf' | 'imagen' | 'otro' }

let actual: DocumentoVisor | null = null
const oyentes = new Set<() => void>()
const avisar = () => oyentes.forEach((o) => o())

export function tipoDocumento(nombre: string): DocumentoVisor['tipo'] {
  const ext = nombre.split('?')[0].split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'pdf') return 'pdf'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'heif', 'svg'].includes(ext)) return 'imagen'
  return 'otro'
}

export function verDocumento(url: string, nombre: string, tipo: DocumentoVisor['tipo'] = tipoDocumento(nombre)) {
  actual = { url, nombre, tipo }
  avisar()
}

export function cerrarVisor() {
  actual = null
  avisar()
}

export const visor = {
  suscribir(cb: () => void) {
    oyentes.add(cb)
    return () => {
      oyentes.delete(cb)
    }
  },
  leer: () => actual,
}
