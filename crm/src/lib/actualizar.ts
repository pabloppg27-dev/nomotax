// Auto-actualización: si hay una versión nueva publicada, recarga sola.
// Comprueba al volver a la ventana y cada 5 minutos. No recarga con una ventana abierta
// (dictado, tarea…) ni mientras escribes, para no perder nada.
const actual = () => document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/"]')?.getAttribute('src')

async function hayNueva(): Promise<boolean> {
  const mia = actual(); if (!mia) return false // en desarrollo no hay /assets
  try {
    const html = await (await fetch('/', { cache: 'no-store' })).text()
    const src = html.match(/src="(\/assets\/[^"]+\.js)"/)?.[1]
    return !!src && src !== mia
  } catch { return false }
}

const ocupado = () => !!document.querySelector('.fixed.inset-0') ||
  ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName ?? '')

let pendiente = false
async function comprobar() {
  if (!pendiente) pendiente = await hayNueva()
  if (pendiente && !ocupado()) location.reload()
}

export function autoActualizar() {
  window.addEventListener('focus', () => void comprobar())
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void comprobar() })
  setInterval(() => void comprobar(), 5 * 60 * 1000)
}
