import { useEffect } from 'react'

/*
 * Zoom con los dedos bloqueado en toda la app (sobre todo en el iPhone, en Safari y anclada
 * a la pantalla de inicio). Safari ignora `user-scalable=no`, así que se bloquea por tres vías:
 * la etiqueta viewport, `touch-action` en el CSS (clase `zoom-libre` para soltarlo) y el
 * evento `gesturestart`, que solo existe en Safari.
 * Excepción: mientras el visor de documentos está abierto se puede ampliar (tickets, nóminas…).
 */

const BLOQUEADO = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover'
const LIBRE = 'width=device-width, initial-scale=1, viewport-fit=cover'

let abiertos = 0

function aplicar() {
  const libre = abiertos > 0
  document.querySelector('meta[name="viewport"]')?.setAttribute('content', libre ? LIBRE : BLOQUEADO)
  document.documentElement.classList.toggle('zoom-libre', libre)
}

/** Se llama una vez al arrancar la app. */
export function bloquearZoom() {
  aplicar()
  document.addEventListener(
    'gesturestart',
    (e) => {
      if (abiertos === 0) e.preventDefault()
    },
    { passive: false },
  )
}

/** Permite ampliar mientras el componente que lo usa esté a la vista (al cerrar vuelve a 100%). */
export function usePermitirZoom(activo = true) {
  useEffect(() => {
    if (!activo) return
    abiertos++
    aplicar()
    return () => {
      abiertos--
      aplicar()
    }
  }, [activo])
}
