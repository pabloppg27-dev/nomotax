import { BUCKET, errorMessage, invocar, supabase } from './supabase'
import { nuevoId } from './id'
import type { OcrResult } from './types'

const MAX_LADO = 2000
const ACEPTADOS = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']

export const ACCEPT_ATTR = 'application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif'

/** Reduce las fotos grandes (y convierte HEIC del iPhone) a JPEG antes de subirlas */
export async function prepararArchivo(file: File): Promise<File> {
  const tipo = file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : '')
  if (!ACEPTADOS.includes(tipo) && !/\.(heic|heif)$/i.test(file.name)) {
    throw new Error(`«${file.name}» no es un PDF ni una imagen`)
  }
  if (tipo === 'application/pdf') {
    if (file.size > 15 * 1024 * 1024) throw new Error(`«${file.name}» supera los 15 MB`)
    return file
  }
  const esHeic = /heic|heif/i.test(tipo) || /\.(heic|heif)$/i.test(file.name)
  if (!esHeic && file.size < 1.5 * 1024 * 1024) return file

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error(`No se ha podido abrir «${file.name}». Prueba a hacer la foto en JPG o sube el PDF.`)
  }
  const escala = Math.min(1, MAX_LADO / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * escala)
  canvas.height = Math.round(bitmap.height * escala)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  const blob: Blob = await new Promise((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error('No se ha podido procesar la imagen'))), 'image/jpeg', 0.85),
  )
  const nombre = file.name.replace(/\.[^.]+$/, '') + '.jpg'
  return new File([blob], nombre, { type: 'image/jpeg' })
}

export async function subirDocumento(ownerId: string, carpeta: 'gastos' | 'facturas', file: File): Promise<string> {
  const ext = file.type === 'application/pdf' ? 'pdf' : file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${ownerId}/${carpeta}/${nuevoId()}.${ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false })
  if (error) throw new Error(await errorMessage(error))
  return path
}

export async function leerFactura(path: string, tipo: 'gasto' | 'emitida', ownerId: string): Promise<OcrResult> {
  const data = await invocar<{ datos?: OcrResult }>('ocr-factura', { path, tipo, owner_id: ownerId })
  if (!data?.datos) throw new Error('No se han podido leer los datos')
  return data.datos as OcrResult
}

const suma = (xs: number[]) => Math.round(xs.reduce((s, x) => s + x, 0) * 100) / 100

/** Totales coherentes a partir de lo leído */
export function importesDe(o: OcrResult) {
  const base = o.base_total ?? suma(o.desglose_iva.map((d) => d.base))
  const cuota_iva = o.cuota_iva_total ?? suma(o.desglose_iva.map((d) => d.cuota))
  const cuota_irpf = o.cuota_irpf ?? 0
  const total = o.total ?? Math.round((base + cuota_iva - cuota_irpf) * 100) / 100
  const iva_pct = o.desglose_iva.length === 1 ? o.desglose_iva[0].tipo : null
  return { base, cuota_iva, cuota_irpf, total, iva_pct, irpf_pct: o.irpf_pct }
}
