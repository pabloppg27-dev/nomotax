import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { notify } from './components/ui'

// Cualquier fallo inesperado se ve en pantalla (sobre todo en el móvil, sin consola)
window.addEventListener('unhandledrejection', (e) => {
  notify(`Error: ${(e.reason as Error)?.message ?? String(e.reason)}`, 'error')
})
window.addEventListener('error', (e) => {
  if (e.message) notify(`Error: ${e.message}`, 'error')
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
