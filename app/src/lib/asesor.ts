/** Datos de tu asesor y conexión con el motor de reservas de nomotax.io (Google Apps Script) */

export const ASESOR = {
  nombre: 'Pablo Pérez del Pulgar Gil',
  corto: 'Pablo',
  cargo: 'Tu asesor fiscal · NomoTax',
  foto: '/pablo-asesor.jpg',
  whatsapp: '34642757633',
  whatsappVisible: '+34 642 75 76 33',
}

// El mismo motor que usa la web (js/main.js → NT_RESERVAS_API)
const RESERVAS_API =
  'https://script.google.com/macros/s/AKfycbzV2OYEZS3uIIHw5l8Xh8duZxgbzydO1ZdTsa6qtKR_sRxtNiZjF07rqmnIUyzjSmzAKQ/exec'

export function enlaceWhatsapp(texto: string): string {
  return `https://wa.me/${ASESOR.whatsapp}?text=${encodeURIComponent(texto)}`
}

export async function cargarHuecos(): Promise<{ huecos: string[]; duracion: number }> {
  const r = await fetch(`${RESERVAS_API}?accion=huecos`, { credentials: 'omit' })
  const j = await r.json()
  if (!j.ok) throw new Error('No se ha podido cargar la agenda')
  return { huecos: j.huecos as string[], duracion: Number(j.duracion ?? 30) }
}

export type RespuestaReserva = { ok: boolean; error?: string; inicio?: string; meet?: string }

export async function enviarAlMotor(datos: Record<string, unknown>): Promise<RespuestaReserva> {
  const r = await fetch(RESERVAS_API, {
    method: 'POST',
    credentials: 'omit',
    // text/plain evita la petición previa (CORS) que Apps Script no admite
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(datos),
  })
  return (await r.json()) as RespuestaReserva
}

export function mensajeError(codigo?: string): string {
  switch (codigo) {
    case 'ocupado':
      return 'Esa hora se acaba de ocupar. Elige otra, por favor.'
    case 'repetida':
      return 'Ya nos ha llegado tu petición hace un momento. Si necesitas otra, espera unos minutos.'
    case 'telefono':
      return 'Revisa el teléfono: hace falta para poder llamarte.'
    case 'email':
      return 'Tu email no parece válido. Revísalo en «Mi perfil».'
    case 'nombre':
      return 'Falta tu nombre o el de tu empresa en «Mi perfil».'
    default:
      return 'No se ha podido enviar. Inténtalo otra vez o escríbenos por WhatsApp.'
  }
}
