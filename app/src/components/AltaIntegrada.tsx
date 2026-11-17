import { useMemo } from 'react'
import { loadConnectAndInitialize } from '@stripe/connect-js'
import { ConnectAccountOnboarding, ConnectComponentsProvider } from '@stripe/react-connect-js'
import { sesionAlta, STRIPE_PK } from '../lib/tarjetas'

/**
 * El alta de la empresa en Stripe, dentro de la propia app (Connect embedded components).
 * El formulario es de Stripe (los datos de identidad no pasan por NomoTax) pero se ve con nuestros colores.
 */
export default function AltaIntegrada({ ownerId, onSalir }: { ownerId: string; onSalir: () => void }) {
  const conexion = useMemo(
    () =>
      loadConnectAndInitialize({
        publishableKey: STRIPE_PK,
        fetchClientSecret: () => sesionAlta(ownerId),
        locale: 'es-ES',
        appearance: {
          overlays: 'dialog',
          variables: {
            colorPrimary: '#111110',
            colorBackground: '#ffffff',
            colorText: '#111110',
            colorSecondaryText: '#6b6b65',
            colorBorder: '#e5e5df',
            colorDanger: '#b42318',
            borderRadius: '12px',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif',
            buttonPrimaryColorBackground: '#111110',
            buttonPrimaryColorText: '#ffffff',
            actionPrimaryColorText: '#111110',
            formHighlightColorBorder: '#111110',
          },
        },
      }),
    [ownerId],
  )
  return (
    <ConnectComponentsProvider connectInstance={conexion}>
      <ConnectAccountOnboarding onExit={onSalir} />
    </ConnectComponentsProvider>
  )
}
