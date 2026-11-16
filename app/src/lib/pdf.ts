import { signedUrl } from './supabase'
import { MODO_PRUEBAS_FACTURAS } from './config'
import { construirPdf, type LogoPdf } from './pdfFactura'
import type { Emisor, Invoice, Quote } from './types'

// El diseño de la factura está en pdfFactura.ts (también lo usa la facturación automática).

async function cargarLogo(path: string | null | undefined): Promise<LogoPdf | null> {
  if (!path) return null
  try {
    const url = await signedUrl(path, 120)
    if (!url) return null
    const blob = await (await fetch(url)).blob()
    const dataUrl: string = await new Promise((res, rej) => {
      const r = new FileReader()
      r.onload = () => res(r.result as string)
      r.onerror = rej
      r.readAsDataURL(blob)
    })
    const img: HTMLImageElement = await new Promise((res, rej) => {
      const i = new Image()
      i.onload = () => res(i)
      i.onerror = rej
      i.src = dataUrl
    })
    // Logos grandes: se reducen (máx. 480 px) para que el PDF no pese casi 1 MB
    const escala = Math.min(1, 480 / Math.max(img.naturalWidth, img.naturalHeight))
    const w = Math.max(1, Math.round(img.naturalWidth * escala))
    const h = Math.max(1, Math.round(img.naturalHeight * escala))
    if (escala < 1) {
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      canvas.getContext('2d')?.drawImage(img, 0, 0, w, h)
      return { dataUrl: canvas.toDataURL('image/png'), formato: 'PNG', w, h }
    }
    const formato = blob.type.includes('png') ? 'PNG' : blob.type.includes('webp') ? 'WEBP' : 'JPEG'
    return { dataUrl, formato, w, h }
  } catch {
    return null
  }
}

export async function descargarPdf(
  tipo: 'factura' | 'presupuesto',
  d: (Invoice | Quote) & { vencimiento?: string | null; valido_hasta?: string | null },
  emisor: Emisor,
  /** Del perfil actual del emisor (no fiscal): color y nombre comercial */
  marca?: { color?: string | null; nombreComercial?: string | null },
) {
  const logo = await cargarLogo(emisor.logo_path)
  const { doc, nombre } = await construirPdf(tipo, d, emisor, marca, logo, MODO_PRUEBAS_FACTURAS)
  doc.save(nombre)
}
