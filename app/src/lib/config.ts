/**
 * Con true, las facturas creadas en la app se marcan como documento de
 * pruebas (en el PDF y al emitir). Desactivado el 16/11/2026: los clientes ya
 * emiten facturas reales (Verifactu obligatorio desde oct. 2028).
 */
export const MODO_PRUEBAS_FACTURAS = false

/**
 * Apartado «Tarjetas» (Stripe Connect + Issuing). Visible en local (npm run dev) y en cualquier compilación
 * hecha con VITE_TARJETAS=1. Mientras Stripe no apruebe Issuing queda oculto en la web publicada.
 */
export const TARJETAS_ACTIVAS = import.meta.env.DEV || import.meta.env.VITE_TARJETAS === '1'

/**
 * Mientras las claves de Stripe sean de PRUEBA, en la web publicada el apartado completo solo lo ve el asesor;
 * los clientes ven «Próximamente». Con VITE_TARJETAS_CLIENTES=1 (Stripe aprobado y claves reales) lo usan todos.
 */
export const TARJETAS_PARA_CLIENTES = import.meta.env.DEV || import.meta.env.VITE_TARJETAS_CLIENTES === '1'

/**
 * 'demo' = todo simulado en el navegador (sin Stripe ni base de datos), para probar el flujo.
 * 'real' = usa la función «tarjetas» de Supabase y Stripe. Por defecto, demo en local y real si no.
 * Se puede forzar con VITE_TARJETAS_MODO=demo|real.
 */
export const TARJETAS_MODO: 'demo' | 'real' =
  import.meta.env.VITE_TARJETAS_MODO === 'real' ? 'real' : import.meta.env.VITE_TARJETAS_MODO === 'demo' || import.meta.env.DEV ? 'demo' : 'real'
