// Empaqueta una Edge Function que usa código de src/lib en UN solo archivo para pegarlo en Supabase
// (el editor del dashboard no ve los archivos de src/). Así la factura sale con el mismo
// diseño que la app (src/lib/pdfFactura.ts) y la vista de socio con el mismo motor contable.
//
//   node scripts/empaquetar-facturar.mjs             → supabase/functions/facturar-planes/index.ts
//   node scripts/empaquetar-facturar.mjs --muestra   → además, un PDF de ejemplo en test-data/
//   node scripts/empaquetar-facturar.mjs vista-socio → supabase/functions/vista-socio/index.ts

import { rolldown } from 'rolldown'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(resolve(raiz, 'package.json'), 'utf8'))

// Paquetes que Deno descarga solo (npm:...) en vez de meterlos en el archivo
const NPM = {
  '@supabase/supabase-js': `npm:@supabase/supabase-js@${pkg.dependencies['@supabase/supabase-js']}`,
  nodemailer: 'npm:nodemailer@6.9.16',
  jspdf: `npm:jspdf@${pkg.dependencies.jspdf}`,
  'jspdf-autotable': `npm:jspdf-autotable@${pkg.dependencies['jspdf-autotable']}`,
  qrcode: `npm:qrcode@${pkg.dependencies.qrcode}`,
}

const FUNCION = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'facturar-planes'

async function empaquetar(entrada, salida, paraDeno) {
  const bundle = await rolldown({
    input: resolve(raiz, entrada),
    platform: 'neutral',
    // En Deno no existe import.meta.env (es cosa de Vite). Si src/lib/config.ts lo lee y llega al paquete,
    // la función se cae al arrancar en CADA llamada («TypeError: Cannot read properties of undefined»).
    // Aquí se sustituye por un objeto vacío: DEV y las VITE_* quedan sin definir (= publicado, sin extras).
    transform: { define: { 'import.meta.env': '{}' } },
    plugins: [
      {
        name: 'externos',
        resolveId(id) {
          if (id in NPM) return { id: paraDeno ? NPM[id] : id, external: true }
          if (id.startsWith('node:')) return { id, external: true }
          return null
        },
      },
    ],
  })
  const { output } = await bundle.generate({ format: 'esm', codeSplitting: false })
  await bundle.close()
  const cabecera = paraDeno
    ? `// GENERADO con \`node scripts/empaquetar-facturar.mjs${FUNCION === 'facturar-planes' ? '' : ' ' + FUNCION}\` a partir de fuente.ts y src/lib.\n` +
      `// Pega este archivo entero en Supabase → Edge Functions → ${FUNCION}. No lo edites a mano.\n\n`
    : ''
  mkdirSync(dirname(resolve(raiz, salida)), { recursive: true })
  writeFileSync(resolve(raiz, salida), cabecera + output.map((o) => o.code ?? '').join('\n'))
}

await empaquetar(`supabase/functions/${FUNCION}/fuente.ts`, `supabase/functions/${FUNCION}/index.ts`, true)
console.log(`✓ supabase/functions/${FUNCION}/index.ts`)

if (process.argv.includes('--muestra')) {
  await empaquetar('scripts/muestra-factura.ts', 'node_modules/.cache/muestra-factura.mjs', false)
  execFileSync(process.execPath, [resolve(raiz, 'node_modules/.cache/muestra-factura.mjs')], { stdio: 'inherit', cwd: raiz })
}
