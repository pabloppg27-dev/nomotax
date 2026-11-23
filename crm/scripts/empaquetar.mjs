// Genera supabase/functions/crm-dictado/index.ts (un solo archivo para pegar en el dashboard)
import { readFileSync, writeFileSync } from 'node:fs'
const f = readFileSync('servidor/funcion.ts', 'utf8')
const p = readFileSync('servidor/pensar.ts', 'utf8')
writeFileSync('supabase/functions/crm-dictado/index.ts', f + '\n// ---------- servidor/pensar.ts ----------\n' + p)
console.log('OK → supabase/functions/crm-dictado/index.ts')
