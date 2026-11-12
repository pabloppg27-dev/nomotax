import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Solo en este ordenador. Para probar en el móvil por wifi: npm run movil
  server: { port: 5173 },
})
