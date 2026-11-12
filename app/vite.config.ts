import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // host: true → accesible desde otros dispositivos de la misma wifi (pruebas en el móvil)
  server: { port: 5173, host: true },
})
