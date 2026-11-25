import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// En `npm run dev`: POST /api/dictado llama a Claude con ANTHROPIC_API_KEY de .env.local
// (la clave se queda en el servidor local, nunca llega al navegador).
function dictadoLocal(): Plugin {
  return {
    name: 'dictado-local',
    configureServer(server) {
      const env = loadEnv('development', process.cwd(), '')
      server.middlewares.use('/api/agenda', async (req, res) => {
        const enviar = (s: number, b: unknown) => { res.statusCode = s; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(b)) }
        if (!env.CRM_AGENDA_SECRETO) return enviar(503, { error: 'sin-clave' })
        let cuerpo = ''; for await (const c of req) cuerpo += c
        try {
          const { agenda } = await server.ssrLoadModule('/servidor/pensar.ts')
          enviar(200, await agenda(env.CRM_AGENDA_SECRETO, JSON.parse(cuerpo)))
        } catch (e) { enviar(502, { error: (e as Error).message }) }
      })
      server.middlewares.use('/api/transcribir', async (req, res) => {
        const enviar = (s: number, b: unknown) => { res.statusCode = s; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(b)) }
        if (!env.OPENAI_API_KEY) return enviar(503, { error: 'sin-clave' })
        let cuerpo = ''; for await (const c of req) cuerpo += c
        try {
          const b = JSON.parse(cuerpo)
          if (b.comprobar) return enviar(200, { ok: true })
          const { transcribir } = await server.ssrLoadModule('/servidor/pensar.ts')
          enviar(200, await transcribir(env.OPENAI_API_KEY, b))
        } catch (e) { enviar(502, { error: (e as Error).message }) }
      })
      server.middlewares.use('/api/dictado', async (req, res) => {
        const enviar = (s: number, b: unknown) => { res.statusCode = s; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(b)) }
        if (!env.ANTHROPIC_API_KEY) return enviar(503, { error: 'sin-clave' })
        let cuerpo = ''; for await (const c of req) cuerpo += c
        try {
          const { default: Anthropic } = await import('@anthropic-ai/sdk')
          const { pensar } = await server.ssrLoadModule('/servidor/pensar.ts')
          enviar(200, await pensar(new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }), JSON.parse(cuerpo)))
        } catch (e) { enviar(502, { error: (e as Error).message }) }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), dictadoLocal()],
  server: { port: 5180 },
})
