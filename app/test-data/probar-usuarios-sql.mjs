// Prueba usuarios.sql en un Postgres en memoria que imita Supabase (auth.uid(), storage, roles)
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'

const DIR = process.argv[2]
const db = new PGlite()

const prelude = `
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
`
await db.exec(prelude)

const files = ['schema', 'laboral', 'rectificativas', 'asesor', 'contabilidad', 'divisas', 'bienvenida', 'impuestos', 'bancos',
  'planes', 'planes-cobro', 'planes-laboral', 'marca', 'facturacion-automatica', 'numeracion-continua', 'usuarios', 'usuarios']
for (const f of files) {
  let sql = readFileSync(`${DIR}/${f}.sql`, 'utf8').replace(/create extension[^;]*;/i, '')
  try {
    await db.exec(sql)
  } catch (e) {
    console.error(`✗ ${f}.sql: ${e.message}`)
    process.exit(1)
  }
}
console.log('✓ SQL aplicado (usuarios.sql dos veces)')

await db.exec(`
grant usage on schema public, storage, auth to authenticated;
grant all on all tables in schema public to authenticated;
grant all on all tables in schema storage to authenticated;
grant execute on all functions in schema public, auth, storage to authenticated;
`)

const U = {
  T: '00000000-0000-0000-0000-00000000000a', A: '00000000-0000-0000-0000-00000000000b', A2: '00000000-0000-0000-0000-00000000000c',
  S: '00000000-0000-0000-0000-00000000000d', C: '00000000-0000-0000-0000-00000000000e', E: '00000000-0000-0000-0000-00000000000f',
  X: '00000000-0000-0000-0000-000000000010', ADV: '00000000-0000-0000-0000-000000000011', T2: '00000000-0000-0000-0000-000000000012',
}
for (const [k, id] of Object.entries(U)) await db.query(`insert into auth.users (id, email) values ($1, $2)`, [id, `${k.toLowerCase()}@x.es`])
await db.exec(`update public.profiles set role = 'advisor' where id = '${U.ADV}';
update public.profiles set role = 'member' where id in ('${U.A}','${U.A2}','${U.S}','${U.C}','${U.E}');
update public.profiles set nombre = 'Empresa T SL', nif = 'B12345678', direccion = 'C/ Uno' where id = '${U.T}';`)

const W1 = '00000000-0000-0000-0000-0000000000a1', W2 = '00000000-0000-0000-0000-0000000000a2'
await db.exec(`
insert into public.trabajadores (id, owner_id, nombre, dni, fecha_inicio, tipo_contrato, salario_bruto_mensual, estado)
values ('${W1}', '${U.T}', 'Eva', '1A', '2026-01-01', 'indefinido', 2000, 'alta'),
       ('${W2}', '${U.T}', 'Juan', '2B', '2026-01-01', 'indefinido', 3000, 'alta');
insert into public.invoices (owner_id, estado, fecha, base, total) values ('${U.T}', 'emitida', '2026-03-01', 100, 121), ('${U.T}', 'borrador', '2026-03-02', 50, 60.5);
insert into public.expenses (owner_id, estado, fecha, base, total, file_path) values ('${U.T}', 'revisado', '2026-03-01', 10, 12.1, '${U.T}/gastos/a.pdf');
insert into public.nominas (owner_id, trabajador_id, anio, mes, estado, file_path, bruto, neto, ss_empresa)
values ('${U.T}', '${W1}', 2026, 1, 'publicada', '${U.T}/laboral/nominas/2026-01/e.pdf', 2000, 1600, 600),
       ('${U.T}', '${W2}', 2026, 1, 'publicada', '${U.T}/laboral/nominas/2026-01/j.pdf', 3000, 2300, 900),
       ('${U.T}', '${W2}', 2026, 2, 'borrador',  '${U.T}/laboral/nominas/2026-02/j.pdf', 3000, 2300, 900);
insert into public.impuestos (owner_id, modelo, anio, periodo, importe) values ('${U.T}', '303', 2026, '1T', 50);
insert into public.archivo (owner_id, titulo) values ('${U.T}', 'Notificación');
insert into public.extractos_bancarios (owner_id, banco, desde, hasta, formato, file_path) values ('${U.T}', 'BBVA', '2026-01-01', '2026-03-31', 'pdf', '${U.T}/bancos/x.pdf');
insert into public.llamadas (owner_id, tipo) values ('${U.T}', 'llamame');
insert into public.contacts (owner_id, nombre) values ('${U.T}', 'Cliente 1');
insert into public.trabajador_documentos (owner_id, trabajador_id, path) values ('${U.T}', '${W1}', '${U.T}/laboral/${W1}/dni.pdf'), ('${U.T}', '${W2}', '${U.T}/laboral/${W2}/dni.pdf');
insert into storage.objects (bucket_id, name) values
 ('documentos', '${U.T}/gastos/a.pdf'), ('documentos', '${U.T}/facturas/f.pdf'), ('documentos', '${U.T}/bancos/x.pdf'),
 ('documentos', '${U.T}/impuestos/i.pdf'), ('documentos', '${U.T}/logo/l.png'),
 ('documentos', '${U.T}/laboral/nominas/2026-01/e.pdf'), ('documentos', '${U.T}/laboral/nominas/2026-01/j.pdf'),
 ('documentos', '${U.T}/laboral/${W1}/dni.pdf'), ('documentos', '${U.T}/laboral/${W2}/dni.pdf'),
 ('documentos', '${U.T2}/gastos/otra.pdf');
insert into public.miembros (cuenta_id, user_id, email, rol, permisos) values
 ('${U.T}', '${U.A}',  'A@x.es', 'admin', '{"ventas":false,"gastos":true,"bancos":true,"contabilidad":true,"impuestos":false,"laboral":true,"nominas":false}'),
 ('${U.T}', '${U.A2}', 'a2@x.es', 'admin', '{"usuarios":true}'),
 ('${U.T}', '${U.S}',  's@x.es', 'socio', '{"ventas":true}'),
 ('${U.T}', '${U.C}',  'c@x.es', 'comercial', '{}');
insert into public.miembros (cuenta_id, user_id, email, rol, trabajador_id) values ('${U.T}', '${U.E}', 'e@x.es', 'empleado', '${W1}');
`)

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
    await db.exec(`reset role;`)
  }
}
const n = async (sql) => (await db.query(sql)).rows.length
const intenta = async (sql) => {
  try {
    const r = await db.query(sql)
    return r.affectedRows ?? 0
  } catch (e) {
    return 'error: ' + e.message.slice(0, 80)
  }
}

// Permisos guardados limpios
const pA = (await db.query(`select permisos from public.miembros where user_id = '${U.A}'`)).rows[0].permisos
ok(pA.ventas === true && pA.usuarios === false && pA.impuestos === false, 'admin con contabilidad: se le activan ventas y gastos; el resto, como se marcó')
const pS = (await db.query(`select permisos from public.miembros where user_id = '${U.S}'`)).rows[0].permisos
ok(Object.keys(pS).length === 0, 'socio: permisos vacíos aunque se manden')

const tablas = ['invoices', 'expenses', 'nominas', 'impuestos', 'archivo', 'extractos_bancarios', 'llamadas', 'contacts', 'trabajadores', 'trabajador_documentos', 'miembros']
const esperado = {
  T:   { invoices: 2, expenses: 1, nominas: 2, impuestos: 1, archivo: 1, extractos_bancarios: 1, llamadas: 1, contacts: 1, trabajadores: 2, trabajador_documentos: 2, miembros: 5 },
  ADV: { invoices: 2, expenses: 1, nominas: 3, impuestos: 1, archivo: 1, extractos_bancarios: 1, llamadas: 1, contacts: 1, trabajadores: 2, trabajador_documentos: 2, miembros: 5 },
  A:   { invoices: 2, expenses: 1, nominas: 0, impuestos: 0, archivo: 0, extractos_bancarios: 1, llamadas: 1, contacts: 1, trabajadores: 2, trabajador_documentos: 2, miembros: 1 },
  A2:  { invoices: 0, expenses: 0, nominas: 0, impuestos: 0, archivo: 0, extractos_bancarios: 0, llamadas: 1, contacts: 0, trabajadores: 0, trabajador_documentos: 0, miembros: 5 },
  S:   { invoices: 0, expenses: 0, nominas: 0, impuestos: 0, archivo: 0, extractos_bancarios: 0, llamadas: 1, contacts: 0, trabajadores: 0, trabajador_documentos: 0, miembros: 1 },
  C:   { invoices: 2, expenses: 0, nominas: 0, impuestos: 0, archivo: 0, extractos_bancarios: 0, llamadas: 0, contacts: 1, trabajadores: 0, trabajador_documentos: 0, miembros: 1 },
  E:   { invoices: 0, expenses: 0, nominas: 1, impuestos: 0, archivo: 0, extractos_bancarios: 0, llamadas: 0, contacts: 0, trabajadores: 1, trabajador_documentos: 1, miembros: 1 },
  X:   { invoices: 0, expenses: 0, nominas: 0, impuestos: 0, archivo: 0, extractos_bancarios: 0, llamadas: 0, contacts: 0, trabajadores: 0, trabajador_documentos: 0, miembros: 0 },
}
for (const [quien, exp] of Object.entries(esperado)) {
  const vistos = await como(U[quien], async () => {
    const r = {}
    for (const t of tablas) r[t] = await n(`select 1 from public.${t}`)
    return r
  })
  const malos = tablas.filter((t) => vistos[t] !== exp[t]).map((t) => `${t}: ve ${vistos[t]}, debía ${exp[t]}`)
  ok(malos.length === 0, `${quien} ve lo que debe${malos.length ? ' → ' + malos.join('; ') : ''}`)
}

// Perfil de la empresa
ok(await como(U.S, () => n(`select 1 from public.profiles where id = '${U.T}'`)) === 1, 'socio ve los datos de la empresa (nombre, logo)')
ok(await como(U.X, () => n(`select 1 from public.profiles where id = '${U.T}'`)) === 0, 'alguien de fuera no ve la empresa')
ok((await como(U.S, () => intenta(`update public.profiles set nombre = 'Hack' where id = '${U.T}'`))) === 0, 'socio no puede cambiar los datos de la empresa')
ok((await como(U.A, () => intenta(`update public.profiles set nombre = 'Hack' where id = '${U.T}'`))) === 0, 'admin sin «empresa» no puede cambiar los datos de la empresa')

// Comercial: solo borradores
ok((await como(U.C, () => intenta(`insert into public.invoices (owner_id, estado, fecha) values ('${U.T}', 'borrador', '2026-04-01')`))) === 1, 'comercial crea un borrador')
ok(String(await como(U.C, () => intenta(`insert into public.invoices (owner_id, estado, fecha) values ('${U.T}', 'emitida', '2026-04-01')`))).startsWith('error'), 'comercial NO puede crear una factura emitida')
ok((await como(U.C, () => intenta(`update public.invoices set estado = 'emitida' where owner_id = '${U.T}' and estado = 'borrador'`))) !== 2 &&
   (await n(`select 1 from public.invoices where estado = 'borrador'`)) === 2, 'comercial NO puede emitir un borrador')
ok((await como(U.C, () => intenta(`update public.invoices set estado = 'cobrada' where estado = 'emitida'`))) === 0, 'comercial NO puede tocar una factura emitida')
const creadoPor = (await db.query(`select creado_por from public.invoices where estado = 'borrador' order by created_at desc limit 1`)).rows[0].creado_por
ok(creadoPor === U.C, 'la factura guarda quién la creó (creado_por)')
ok((await como(U.T, () => intenta(`update public.invoices set estado = 'emitida' where creado_por = '${U.C}'`))) === 1, 'el titular emite el borrador del comercial')
ok((await como(U.A, () => intenta(`insert into public.invoices (owner_id, estado, fecha) values ('${U.T}', 'emitida', '2026-04-02')`))) === 1, 'admin con ventas sí emite')

// Empleado: sus tickets
ok((await como(U.E, () => intenta(`insert into public.expenses (owner_id, estado, file_path) values ('${U.T}', 'pendiente', '${U.T}/gastos/ticket.jpg')`))) === 1, 'empleado sube un ticket')
ok(String(await como(U.E, () => intenta(`insert into public.expenses (owner_id, estado) values ('${U.T}', 'revisado')`))).startsWith('error'), 'empleado NO puede dar un gasto por revisado')
ok((await como(U.E, () => n(`select 1 from public.expenses`))) === 1, 'empleado ve solo su ticket')
ok((await como(U.E, () => intenta(`update public.expenses set estado = 'revisado' where subido_por = '${U.E}'`))) === 0 ||
   String(await como(U.E, () => intenta(`update public.expenses set estado = 'revisado' where subido_por = '${U.E}'`))).startsWith('error'), 'empleado NO puede revisar su ticket')
ok((await como(U.A, () => n(`select 1 from public.expenses`))) === 2, 'admin con gastos ve el ticket del empleado')
ok((await como(U.E, () => intenta(`insert into public.expenses (owner_id, estado, subido_por) values ('${U.T}', 'pendiente', '${U.T}')`))) === 1 &&
   (await n(`select 1 from public.expenses where subido_por = '${U.T}'`)) === 0, 'subido_por no se puede falsear')

// Archivos
const archivos = async (quien) => (await como(U[quien], () => db.query(`select name from storage.objects order by name`))).rows.map((r) => r.name.split('/').slice(1).join('/'))
const vE = await archivos('E')
ok(vE.includes('logo/l.png') && vE.includes('laboral/nominas/2026-01/e.pdf') && vE.includes(`laboral/${W1}/dni.pdf`) &&
   !vE.includes('laboral/nominas/2026-01/j.pdf') && !vE.includes(`laboral/${W2}/dni.pdf`) && !vE.includes('gastos/a.pdf') && !vE.includes('facturas/f.pdf'),
   `empleado: logo, su nómina y su DNI, nada más → ${vE.join(', ')}`)
const vS = await archivos('S')
ok(vS.length === 1 && vS[0] === 'logo/l.png', `socio: solo el logo → ${vS.join(', ')}`)
const vC = await archivos('C')
ok(vC.sort().join() === ['facturas/f.pdf', 'logo/l.png'].join(), `comercial: facturas y logo → ${vC.join(', ')}`)
const vA = await archivos('A')
ok(!vA.some((x) => x.includes('nominas')) && !vA.includes('impuestos/i.pdf') && vA.includes('bancos/x.pdf') && vA.includes(`laboral/${W2}/dni.pdf`), `admin sin nóminas ni impuestos → ${vA.join(', ')}`)
ok((await archivos('X')).length === 0, 'alguien de fuera no ve archivos')
ok((await archivos('T')).length === 9, 'el titular ve todos los suyos (y no los de otra empresa)')
ok((await como(U.E, () => intenta(`insert into storage.objects (bucket_id, name) values ('documentos', '${U.T}/gastos/nuevo.jpg')`))) === 1, 'empleado puede subir a gastos')
ok(String(await como(U.E, () => intenta(`insert into storage.objects (bucket_id, name) values ('documentos', '${U.T}/facturas/x.pdf')`))).startsWith('error'), 'empleado NO puede subir a facturas')
ok(String(await como(U.C, () => intenta(`insert into storage.objects (bucket_id, name) values ('documentos', '${U.T}/logo/x.png')`))).startsWith('error'), 'comercial NO puede cambiar el logo')

// Nóminas agregadas
const agA = await como(U.A, () => db.query(`select * from public.nominas_agregadas('${U.T}')`))
ok(agA.rows.length === 1 && Number(agA.rows[0].bruto) === 5000 && agA.rows[0].nominas === 2, 'admin con contabilidad y sin nóminas: totales del mes (5.000 € de 2 nóminas, sin nombres)')
ok((await como(U.S, () => db.query(`select * from public.nominas_agregadas('${U.T}')`))).rows.length === 0, 'socio: no recibe nóminas agregadas')
ok((await como(U.C, () => db.query(`select * from public.nominas_agregadas('${U.T}')`))).rows.length === 0, 'comercial: no recibe nóminas agregadas')

// Gestión de usuarios
ok((await como(U.A2, () => intenta(`update public.miembros set rol = 'socio' where user_id = '${U.C}'`))) === 1, 'admin con «usuarios» cambia el rol de otro')
ok((await como(U.A, () => intenta(`update public.miembros set permisos = '{"usuarios":true}' where user_id = '${U.A}'`))) === 0, 'admin sin «usuarios» NO se puede dar más permisos')
ok((await como(U.C, () => intenta(`delete from public.miembros where user_id = '${U.E}'`))) === 0, 'otro miembro NO puede borrar accesos')
ok(String(await como(U.A2, () => intenta(`update public.miembros set cuenta_id = '${U.T2}' where user_id = '${U.E}'`))).startsWith('error'), 'no se puede mover un acceso a otra empresa')
ok(String(await como(U.A2, () => intenta(`insert into public.miembros (cuenta_id, user_id, email, rol) values ('${U.T}', '${U.X}', 'x@x.es', 'admin')`))).startsWith('error'), 'las altas solo por la función invitar-miembro (no desde la app)')
await como(U.T, () => intenta(`update public.miembros set activo = false where user_id = '${U.E}'`))
ok((await como(U.E, () => n(`select 1 from public.nominas`))) === 0, 'un acceso desactivado ya no ve nada')

// Advisor sigue igual
ok((await como(U.ADV, () => intenta(`update public.profiles set nombre = 'Empresa T SL' where id = '${U.T}'`))) === 1, 'el asesor sigue pudiendo editar la empresa')

console.log(fallos ? `\n${fallos} FALLO(S)` : '\nTodo OK')
process.exit(fallos ? 1 : 0)
