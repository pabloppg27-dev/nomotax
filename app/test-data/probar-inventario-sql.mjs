// Prueba inventario.sql (productos, ajustes de stock, permisos) en un Postgres en memoria que imita Supabase.
//   node test-data/probar-inventario-sql.mjs supabase      (necesita @electric-sql/pglite, como probar-usuarios-sql.mjs)
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'

const DIR = process.argv[2] ?? 'supabase'
const db = new PGlite()

await db.exec(`
create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
create publication supabase_realtime;
create role authenticated;
`)

const files = ['schema', 'laboral', 'rectificativas', 'asesor', 'contabilidad', 'divisas', 'bienvenida', 'impuestos', 'bancos',
  'planes', 'planes-cobro', 'planes-laboral', 'marca', 'facturacion-automatica', 'numeracion-continua', 'usuarios', 'trabajador-cualquier-rol',
  'fichajes', 'cuentas-titular', 'inventario', 'inventario', 'inventario-al-momento']
for (const f of files) {
  try {
    await db.exec(readFileSync(`${DIR}/${f}.sql`, 'utf8').replace(/create extension[^;]*;/i, ''))
  } catch (e) {
    console.error(`✗ ${f}.sql: ${e.message}`)
    process.exit(1)
  }
}
console.log('✓ SQL aplicado (inventario.sql dos veces e inventario-al-momento.sql)')

await db.exec(`
grant usage on schema public, storage, auth to authenticated;
grant all on all tables in schema public to authenticated;
grant execute on all functions in schema public, auth, storage to authenticated;
`)

const U = {
  T: '00000000-0000-0000-0000-00000000000a', A: '00000000-0000-0000-0000-00000000000b', C: '00000000-0000-0000-0000-00000000000e',
  E: '00000000-0000-0000-0000-00000000000f', X: '00000000-0000-0000-0000-000000000010', ADV: '00000000-0000-0000-0000-000000000011',
}
for (const [k, id] of Object.entries(U)) await db.query(`insert into auth.users (id, email) values ($1, $2)`, [id, `${k.toLowerCase()}@x.es`])
await db.exec(`update public.profiles set role = 'advisor' where id = '${U.ADV}';
update public.profiles set role = 'member' where id in ('${U.A}','${U.C}','${U.E}');
insert into public.miembros (cuenta_id, user_id, email, rol, permisos) values
 ('${U.T}', '${U.A}', 'a@x.es', 'admin', '{"gastos":true}'),
 ('${U.T}', '${U.C}', 'c@x.es', 'comercial', '{}'),
 ('${U.T}', '${U.E}', 'e@x.es', 'empleado', '{}');`)

let fallos = 0
const ok = (cond, msg) => {
  if (!cond) fallos++
  console.log(`${cond ? '✓' : '✗'} ${msg}`)
}
async function como(user, fn) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${user}', false);`)
  try {
    return await fn()
  } finally {
    await db.exec('reset role;')
  }
}
const n = async (sql) => (await db.query(sql)).rows.length
const intenta = async (sql) => {
  try {
    await db.exec(sql)
    return true
  } catch {
    return false
  }
}

const P = '00000000-0000-0000-0000-0000000000b1'
await db.exec(`insert into public.expenses (owner_id, estado, fecha, categoria, base, total) values ('${U.T}', 'revisado', '2026-02-01', 'compras', 25, 30.25)`)
ok(await como(U.T, () => intenta(`insert into public.productos (id, owner_id, referencia, nombre) values ('${P}', '${U.T}', 'AB-12', 'Tornillo')`)), 'el titular crea un producto')
ok(!(await como(U.T, () => intenta(`insert into public.productos (owner_id, referencia, nombre) values ('${U.T}', 'ab-12', 'Otro')`))), 'no se repite la referencia (sin mayúsculas)')
ok(await como(U.T, () => intenta(`insert into public.productos (owner_id, nombre) values ('${U.T}', 'Sin referencia'), ('${U.T}', 'Otro sin referencia')`)), 'varios productos sin referencia')
ok((await como(U.X, () => n(`select 1 from public.productos`))) === 0, 'otra empresa no ve los productos')
ok((await como(U.C, () => n(`select 1 from public.productos where owner_id = '${U.T}'`))) === 3, 'el comercial ve los productos (para facturar)')
ok(!(await como(U.C, () => intenta(`insert into public.productos (owner_id, nombre) values ('${U.T}', 'X')`))), 'el comercial no crea productos')
ok((await como(U.E, () => n(`select 1 from public.productos where owner_id = '${U.T}'`))) === 0, 'el empleado no ve los productos')
ok(await como(U.A, () => intenta(`insert into public.stock_ajustes (owner_id, producto_id, fecha, cantidad, coste_unitario, motivo) values ('${U.T}', '${P}', '2026-01-01', 100, 2.5, 'inicial')`)), 'admin con gastos carga el stock inicial')
ok((await como(U.C, () => n(`select 1 from public.stock_ajustes`))) === 0, 'el comercial no ve los ajustes')
ok(!(await como(U.T, () => intenta(`insert into public.stock_ajustes (owner_id, producto_id, fecha, cantidad, motivo) values ('${U.T}', '${P}', '2026-01-01', 1, 'otro')`))), 'motivo no válido')
ok((await como(U.T, () => db.query(`update public.expenses set lineas = '[{"referencia":"AB-12","descripcion":"Tornillo","cantidad":10,"importe":25,"producto_id":"${P}"}]' where owner_id = '${U.T}' returning id`))).rows.length === 1, 'las líneas de compra se guardan en el gasto')
ok((await db.query(`select existencias_periodo from public.profiles where id = '${U.T}'`)).rows[0].existencias_periodo === 'momento', 'por defecto, variación al momento')
ok(!(await como(U.T, () => intenta(`update public.profiles set existencias_periodo = 'anual' where id = '${U.T}'`))), 'el cliente no cambia la periodicidad')
ok(await como(U.T, () => intenta(`update public.profiles set nombre = 'Empresa T' where id = '${U.T}'`)), 'el cliente sigue pudiendo editar sus datos')
ok(await como(U.ADV, () => intenta(`update public.profiles set existencias_periodo = 'anual' where id = '${U.T}'`)), 'el asesor cambia la periodicidad')
ok(await como(U.T, () => intenta(`delete from public.productos where id = '${P}'`)), 'al borrar un producto se borran sus ajustes')
ok((await db.query(`select 1 from public.stock_ajustes where producto_id = '${P}'`)).rows.length === 0, 'sin ajustes huérfanos')

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo bien')
process.exit(fallos ? 1 : 0)
