// Prueba ausencias.sql en un Postgres en memoria que imita Supabase (auth.uid(), storage, roles)
//   node test-data/probar-ausencias-sql.mjs supabase
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
  'planes', 'planes-cobro', 'planes-laboral', 'marca', 'facturacion-automatica', 'numeracion-continua', 'usuarios',
  'trabajador-cualquier-rol', 'fichajes', 'cuentas-titular', 'ausencias', 'ausencias', 'informe-jornada', 'informe-jornada']
for (const f of files) {
  const sql = readFileSync(`${DIR}/${f}.sql`, 'utf8').replace(/create extension[^;]*;/gi, '')
    // pg_cron no existe en PGlite: se quita la programación
    .replace(/-- CRON[\s\S]*?-- FIN CRON/g, '')
  try {
    await db.exec(sql)
  } catch (e) {
    console.error(`✗ ${f}.sql: ${e.message}`)
    process.exit(1)
  }
}
console.log('✓ SQL aplicado (ausencias.sql e informe-jornada.sql, dos veces cada uno)')

await db.exec(`
grant usage on schema public, storage, auth to authenticated;
grant all on all tables in schema public to authenticated;
grant all on all tables in schema storage to authenticated;
grant execute on all functions in schema public, auth, storage to authenticated;
`)

const U = {
  T: '00000000-0000-0000-0000-00000000000a', A: '00000000-0000-0000-0000-00000000000b', S: '00000000-0000-0000-0000-00000000000d',
  E: '00000000-0000-0000-0000-00000000000f', E2: '00000000-0000-0000-0000-000000000013', X: '00000000-0000-0000-0000-000000000010',
  ADV: '00000000-0000-0000-0000-000000000011',
}
for (const [k, id] of Object.entries(U)) await db.query(`insert into auth.users (id, email) values ($1, $2)`, [id, `${k.toLowerCase()}@x.es`])
await db.exec(`update public.profiles set role = 'advisor' where id = '${U.ADV}';
update public.profiles set role = 'member' where id in ('${U.A}','${U.S}','${U.E}','${U.E2}');`)

const W1 = '00000000-0000-0000-0000-0000000000a1', W2 = '00000000-0000-0000-0000-0000000000a2'
await db.exec(`
insert into public.trabajadores (id, owner_id, nombre, dni, fecha_inicio, tipo_contrato, salario_bruto_mensual, estado, vacaciones_dias)
values ('${W1}', '${U.T}', 'Eva', '1A', '2026-01-01', 'indefinido', 2000, 'alta', 23),
       ('${W2}', '${U.T}', 'Juan', '2B', '2026-01-01', 'indefinido', 3000, 'alta', 23);
insert into public.miembros (cuenta_id, user_id, email, rol, permisos) values
 ('${U.T}', '${U.A}', 'a@x.es', 'admin', '{"laboral":true}'),
 ('${U.T}', '${U.S}', 's@x.es', 'socio', '{}');
insert into public.miembros (cuenta_id, user_id, email, rol, trabajador_id, fichaje) values
 ('${U.T}', '${U.E}', 'e@x.es', 'empleado', '${W1}', true),
 ('${U.T}', '${U.E2}', 'e2@x.es', 'empleado', '${W2}', true);
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
const fila = async (sql) => (await db.query(sql)).rows[0]
const intenta = async (sql) => {
  try {
    const r = await db.query(sql)
    return r.rows[0] ?? r.affectedRows ?? 0
  } catch (e) {
    return 'error: ' + e.message.slice(0, 90)
  }
}
const err = (r) => typeof r === 'string' && r.startsWith('error')
const pedir = (tipo, desde, hasta, trab = W1, extra = "null, null") =>
  `select * from public.pedir_ausencia('${U.T}', '${trab}', '${tipo}', null, ${desde ? `'${desde}'` : 'null'}, ${hasta ? `'${hasta}'` : 'null'}, ${extra})`

// Pedir
const v1 = await como(U.E, () => intenta(pedir('vacaciones', '2026-12-21', '2026-12-31')))
ok(v1.estado === 'pendiente', 'el trabajador pide vacaciones: quedan pendientes')
ok(err(await como(U.E, () => intenta(pedir('vacaciones', '2026-12-28', '2027-01-04')))), 'NO se pueden pedir fechas que se solapan')
ok(err(await como(U.E, () => intenta(pedir('vacaciones', '2026-12-01', '2026-12-02', W2)))), 'NO puede pedir vacaciones para otro')
ok(err(await como(U.E, () => intenta(pedir('vacaciones', '2026-12-10', '2026-12-05')))), 'NO: último día antes del primero')
ok(err(await como(U.E, () => intenta(pedir('vacaciones', '2026-12-10', null)))), 'NO: vacaciones sin último día')
ok(err(await como(U.E, () => intenta(pedir('permiso', '2026-12-10', '2026-12-10')))), 'NO: permiso «otro» sin motivo')
const p1 = await como(U.E, () => intenta(pedir('permiso', '2026-12-10', '2026-12-10', W1, "'Médico', null")))
ok(p1.estado === 'pendiente', 'permiso con motivo: pendiente')
ok(err(await como(U.X, () => intenta(pedir('vacaciones', '2026-11-02', '2026-11-03')))), 'alguien de fuera NO puede pedir')
ok(err(await como(U.S, () => intenta(pedir('vacaciones', '2026-11-02', '2026-11-03')))), 'el socio sin ficha NO puede pedir')
ok(err(await como(U.E, () => intenta(pedir('vacaciones', '2026-11-02', '2026-11-03', W1, `null, '${U.T}/gastos/x.pdf'`)))), 'NO: justificante fuera de su carpeta')

// Baja: se comunica, no se aprueba, y puede quedar abierta
const b1 = await como(U.E2, () => intenta(pedir('baja', '2026-11-16', null, W2)))
ok(b1.estado === 'aprobada' && b1.hasta === null, 'la baja queda registrada al momento y abierta')
ok(err(await como(U.E2, () => intenta(pedir('vacaciones', '2026-12-01', '2026-12-02', W2)))), 'NO se pueden pedir vacaciones con una baja abierta')
ok(err(await como(U.E2, () => intenta(`select * from public.cerrar_baja('${b1.id}', '2026-11-10')`))), 'NO: alta antes del inicio de la baja')
ok((await como(U.E2, () => intenta(`select * from public.cerrar_baja('${b1.id}', '2026-11-20')`))).hasta, 'el trabajador pone la fecha de alta')
ok(err(await como(U.E2, () => intenta(`select * from public.cerrar_baja('${b1.id}', '2026-11-25')`))), 'NO se cambia la fecha de alta ya puesta')

// Ver
ok((await como(U.E, () => n(`select 1 from public.ausencias`))) === 2, 'el trabajador ve solo las suyas')
ok((await como(U.A, () => n(`select 1 from public.ausencias`))) === 3, 'el admin con Laboral ve todas')
ok((await como(U.S, () => n(`select 1 from public.ausencias`))) === 0, 'el socio no ve ausencias')
ok((await como(U.T, () => n(`select 1 from public.ausencias`))) === 3, 'el titular ve todas')
ok((await como(U.ADV, () => n(`select 1 from public.ausencias`))) === 3, 'el asesor ve todas')

// Resolver
ok(err(await como(U.E, () => intenta(`select * from public.resolver_ausencia('${v1.id}', true)`))), 'el trabajador NO puede aprobarse')
ok((await como(U.A, () => intenta(`select * from public.resolver_ausencia('${v1.id}', true)`))).estado === 'aprobada', 'el admin aprueba')
ok(err(await como(U.A, () => intenta(`select * from public.resolver_ausencia('${v1.id}', false)`))), 'NO se resuelve dos veces')
const r1 = await como(U.T, () => intenta(`select * from public.resolver_ausencia('${p1.id}', false, 'Ese día hay cierre')`))
ok(r1.estado === 'rechazada' && r1.respuesta === 'Ese día hay cierre', 'el titular rechaza con motivo')
ok((await como(U.E, () => intenta(pedir('permiso', '2026-12-10', '2026-12-10', W1, "'Médico, otra hora', null")))).estado === 'pendiente', 'tras un rechazo se puede volver a pedir ese día')

// Anular
ok(err(await como(U.E, () => intenta(`select * from public.anular_ausencia('${v1.id}')`))), 'el trabajador NO anula una aprobada')
ok(err(await como(U.A, () => intenta(`select * from public.anular_ausencia('${v1.id}')`))), 'la empresa NO anula una aprobada sin motivo')
ok((await como(U.A, () => intenta(`select * from public.anular_ausencia('${v1.id}', 'Cambio de fechas')`))).estado === 'anulada', 'la empresa anula una aprobada con motivo')
const v2 = await como(U.E, () => intenta(pedir('vacaciones', '2026-12-22', '2026-12-31')))
ok(v2.estado === 'pendiente', 'anulada la anterior, se vuelven a pedir esas fechas')
ok((await como(U.E, () => intenta(`select * from public.anular_ausencia('${v2.id}')`))).estado === 'anulada', 'el trabajador cancela su solicitud pendiente')

// Lo que apunta la empresa vale ya
const a1 = await como(U.A, () => intenta(pedir('vacaciones', '2026-08-03', '2026-08-14', W2)))
ok(a1.estado === 'aprobada' && a1.revisado_por === U.A, 'lo que apunta la empresa queda aprobado')

// Nada de tocar la tabla a mano
ok(err(await como(U.A, () => intenta(`delete from public.ausencias where id = '${a1.id}'`))) || (await n(`select 1 from public.ausencias where id = '${a1.id}'`)) === 1, 'NO se puede borrar (admin)')
ok(err(await intenta(`delete from public.ausencias where id = '${a1.id}'`)), 'NO se puede borrar ni con la clave de servicio')
await como(U.E, () => intenta(`update public.ausencias set estado = 'aprobada' where trabajador_id = '${W1}'`))
ok((await n(`select 1 from public.ausencias where trabajador_id = '${W1}' and estado = 'aprobada'`)) === 0, 'el trabajador NO puede aprobarse con un update')
ok(err(await como(U.E, () => intenta(`insert into public.ausencias (owner_id, trabajador_id, tipo, desde, hasta, estado) values ('${U.T}', '${W1}', 'vacaciones', '2026-07-01', '2026-07-02', 'aprobada')`))), 'NO se inserta a mano')

// Justificante
const pend = await como(U.E, () => intenta(pedir('permiso', '2026-12-14', '2026-12-14', W1, "'Mudanza', null")))
ok((await como(U.E, () => intenta(`insert into storage.objects (bucket_id, name) values ('documentos', '${U.T}/laboral/${W1}/ausencias/parte.pdf')`))) === 1, 'el trabajador sube su justificante a su carpeta')
ok(err(await como(U.E, () => intenta(`insert into storage.objects (bucket_id, name) values ('documentos', '${U.T}/laboral/${W1}/dni.pdf')`))), 'NO puede subir otros documentos a su ficha')
ok(err(await como(U.E, () => intenta(`insert into storage.objects (bucket_id, name) values ('documentos', '${U.T}/laboral/${W2}/ausencias/x.pdf')`))), 'NO puede subir a la carpeta de otro')
ok((await como(U.E, () => intenta(`select * from public.adjuntar_ausencia('${pend.id}', '${U.T}/laboral/${W1}/ausencias/parte.pdf')`))).archivo_path, 'adjunta el justificante después')
ok(err(await como(U.E, () => intenta(`select * from public.adjuntar_ausencia('${pend.id}', '${U.T}/laboral/${W1}/ausencias/otro.pdf')`))), 'NO se cambia un justificante ya puesto')
ok((await como(U.A, () => n(`select 1 from storage.objects where name like '%/ausencias/parte.pdf'`))) === 1, 'el admin con Laboral ve el justificante')
ok((await como(U.E2, () => n(`select 1 from storage.objects where name like '%/ausencias/parte.pdf'`))) === 0, 'otro trabajador NO lo ve')

// Bajas en la Bandeja del asesor
ok(err(await como(U.A, () => intenta(`select public.baja_vista('${b1.id}')`))), 'solo el asesor marca una baja como vista')
await como(U.ADV, () => intenta(`select public.baja_vista('${b1.id}')`))
ok((await fila(`select asesor_visto from public.ausencias where id = '${b1.id}'`)).asesor_visto === true, 'el asesor la marca como vista')

// Festivos locales
ok((await como(U.A, () => intenta(`insert into public.festivos_empresa (owner_id, fecha, nombre) values ('${U.T}', '2026-10-06', 'Fiesta mayor')`))) === 1, 'el admin pone un festivo local')
ok(err(await como(U.E, () => intenta(`insert into public.festivos_empresa (owner_id, fecha, nombre) values ('${U.T}', '2026-10-07', 'X')`))), 'el trabajador NO pone festivos')
ok((await como(U.E, () => n(`select 1 from public.festivos_empresa`))) === 1, 'el trabajador ve los festivos de su empresa')
ok((await como(U.X, () => n(`select 1 from public.festivos_empresa`))) === 0, 'alguien de fuera no los ve')

// Informe semanal
ok((await como(U.E, () => n(`select 1 from public.informes_jornada`))) === 0, 'el registro de envíos del informe no lo ve el trabajador')
ok(err(await como(U.T, () => intenta(`update public.perfil_laboral set informe_jornada = true where owner_id = '${U.T}'`))) ||
   (await n(`select 1 from public.perfil_laboral where informe_jornada`)) === 0, 'el cliente NO activa el informe (lo hace el asesor)')

console.log(fallos ? `\n${fallos} FALLO(S)` : '\nTodo OK')
process.exit(fallos ? 1 : 0)
