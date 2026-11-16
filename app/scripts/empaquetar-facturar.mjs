// Empaqueta la Edge Function facturar-planes en UN solo archivo para pegarlo en Supabase
// (el editor del dashboard no ve los archivos de src/). Así la factura sale con el mismo
// diseño que la app (src/lib/pdfFactura.ts).
//
//   node scripts/empaquetar-facturar.mjs           → supabase/functions/facturar-planes/index.ts
//   node scripts/empaquetar-facturar.mjs --muestra → además, un PDF de ejemplo en test-data/

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

async function empaquetar(entrada, salida, paraDeno) {
  const bundle = await rolldown({
    input: resolve(raiz, entrada),
    platform: 'neutral',
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
    ? '// GENERADO con `node scripts/empaquetar-facturar.mjs` a partir de fuente.ts y src/lib.\n' +
      '// Pega este archivo entero en Supabase → Edge Functions → facturar-planes. No lo edites a mano.\n\n'
    : ''
  mkdirSync(dirname(resolve(raiz, salida)), { recursive: true })
  writeFileSync(resolve(raiz, salida), cabecera + output.map((o) => o.code ?? '').join('\n'))
}

await empaquetar('supabase/functions/facturar-planes/fuente.ts', 'supabase/functions/facturar-planes/index.ts', true)
console.log('✓ supabase/functions/facturar-planes/index.ts')

if (process.argv.includes('--muestra')) {
  await empaquetar('scripts/muestra-factura.ts', 'node_modules/.cache/muestra-factura.mjs', false)
  execFileSync(process.execPath, [resolve(raiz, 'node_modules/.cache/muestra-factura.mjs')], { stdio: 'inherit', cwd: raiz })
}
