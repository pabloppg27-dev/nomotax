-- =====================================================================
-- CUENTA DEMO: «NomoTax Demo, S.L.» (datos ficticios para enseñar a clientes)
-- Generado con: node scripts/demo-nomotax.mjs  (no editar a mano)
--
-- Crea la empresa demo (cliente demo@nomotax.io, sale en el panel del asesor) y la llena con 2026
-- hasta noviembre: 73 facturas (605.500€ sin IVA), 148 gastos,
-- 6 inmovilizados con amortización, 5 trabajadores con 52 nóminas, presupuestos,
-- impuestos (303, 111, 115, 202, 200, informativas), documentos y apertura.
--
-- Solo toca la cuenta demo (es_demo): ninguna otra cuenta cambia.
-- Se puede volver a ejecutar: vacía la demo y la vuelve a llenar.
--
-- Extractos del banco: después, sube los CSV de test-data/demo-extractos/
-- en Contabilidad → Bancos (CaixaBank).
-- =====================================================================

alter table public.profiles add column if not exists es_demo boolean not null default false;
alter table public.profiles add column if not exists nombre_comercial text;
alter table public.quotes add column if not exists enviado_at timestamptz;
alter table public.quotes add column if not exists enviado_a text;
-- Documentos del trabajador con año (certificado de retenciones): igual que laboral-documentos.sql
alter table public.trabajador_documentos add column if not exists anio int;
alter table public.trabajador_documentos drop constraint if exists trabajador_documentos_tipo_check;
alter table public.trabajador_documentos add constraint trabajador_documentos_tipo_check
  check (tipo in ('dni', 'contrato', 'alta_ss', 'teletrabajo', 'modelo_145', 'certificado_retenciones', 'otro'));
alter table public.trabajadores add column if not exists irpf_pct numeric(5,2);
alter table public.trabajadores add column if not exists convenio text;
alter table public.trabajadores add column if not exists clasificacion text;
alter table public.trabajadores add column if not exists prueba_meses int;
alter table public.trabajadores add column if not exists vacaciones_dias int;
alter table public.trabajadores add column if not exists vacaciones_nota text;

do $$
declare
  o uuid;
  n int;
  x uuid;
  centro uuid;
  c1 uuid; c2 uuid; c3 uuid; c4 uuid; c5 uuid; c6 uuid; c7 uuid; c8 uuid; c9 uuid; c10 uuid; t1 uuid; t2 uuid; t3 uuid; t4 uuid; t5 uuid;
  marca jsonb := '{"carga":"demo-nomotax"}';
  falta text := '';
begin
  -- Antes de nada: ¿están creadas las tablas que usa la demo?
  if to_regclass('public.inmovilizados') is null then falta := falta || ' contabilidad.sql'; end if;
  if to_regclass('public.asientos_manuales') is null then falta := falta || ' contabilidad.sql'; end if;
  if to_regclass('public.impuestos') is null then falta := falta || ' impuestos.sql'; end if;
  if to_regclass('public.archivo') is null then falta := falta || ' impuestos.sql'; end if;
  if to_regclass('public.trabajadores') is null then falta := falta || ' laboral.sql'; end if;
  if to_regclass('public.nominas') is null then falta := falta || ' laboral.sql'; end if;
  if to_regclass('public.centros_trabajo') is null then falta := falta || ' laboral.sql'; end if;
  if to_regclass('public.perfil_laboral') is null then falta := falta || ' laboral.sql'; end if;
  if to_regclass('public.categorias_convenio') is null then falta := falta || ' laboral.sql'; end if;
  if to_regclass('public.trabajador_documentos') is null then falta := falta || ' laboral.sql'; end if;
  if to_regclass('public.miembros') is null then falta := falta || ' usuarios.sql'; end if;
  if falta <> '' then
    raise exception 'Faltan tablas. Ejecuta antes en el SQL Editor estos archivos de app/supabase:%', (select string_agg(distinct x, ' ') from unnest(string_to_array(trim(falta), ' ')) x);
  end if;

  -- La empresa demo es una cuenta propia (demo@nomotax.io) que sale en el panel del asesor.
  -- Si ya existe (es_demo), se reutiliza; si no, se crea. No toca ninguna otra cuenta.
  select id into o from public.profiles where coalesce(es_demo, false) order by created_at limit 1;
  if o is null then
    o := 'de300000-0000-4000-8000-000000000001';
    if not exists (select 1 from auth.users where id = o) then
      insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new, email_change)
      values (o, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'demo@nomotax.io', '', now(),
        '{"provider":"email","providers":["email"]}', '{"nombre":"NomoTax Demo, S.L."}', now(), now(), '', '', '', '');
    end if;
    insert into public.profiles (id, email, nombre) values (o, 'demo@nomotax.io', 'NomoTax Demo, S.L.') on conflict (id) do nothing;
    update public.profiles set es_demo = true where id = o;
  end if;
  if (select lower(coalesce(email, '')) = 'info@nomotax.io' or role <> 'client' from public.profiles where id = o) then
    raise exception 'La cuenta demo no puede ser la emisora de NomoTax ni la del asesor';
  end if;

  -- ---------------------------------------------------------- Borrar lo que había
  if to_regclass('public.envios_factura') is not null then
    execute 'delete from public.envios_factura where invoice_id in (select id from public.invoices where owner_id = $1)' using o;
  end if;
  if to_regclass('public.facturas_plan') is not null then
    execute 'delete from public.facturas_plan where invoice_id in (select id from public.invoices where owner_id = $1)' using o;
  end if;
  if to_regclass('public.fichajes') is not null then
    -- El registro de jornada no se puede borrar desde la app; aquí sí, solo el de la demo
    execute 'alter table public.fichajes disable trigger fichajes_inalterable_trg';
    execute 'delete from public.fichajes where owner_id = $1' using o;
    execute 'alter table public.fichajes enable trigger fichajes_inalterable_trg';
  end if;
  if to_regclass('public.solicitudes_irpf') is not null then
    execute 'delete from public.solicitudes_irpf where owner_id = $1' using o;
  end if;
  if to_regclass('public.tarjetas') is not null then
    execute 'update public.tarjetas set trabajador_id = null where trabajador_id in (select id from public.trabajadores where owner_id = $1)' using o;
  end if;
  delete from public.miembros where cuenta_id = o and user_id::text like 'de300000-0000-4000-8000-0000000001%';
  update public.miembros set trabajador_id = null where cuenta_id = o and trabajador_id is not null;
  delete from public.nominas where owner_id = o;
  delete from public.trabajador_documentos where owner_id = o;
  delete from public.trabajadores where owner_id = o;
  delete from public.categorias_convenio where owner_id = o;
  delete from public.centros_trabajo where owner_id = o;
  delete from public.perfil_laboral where owner_id = o;
  delete from public.inmovilizados where owner_id = o;
  delete from public.asientos_manuales where owner_id = o;
  delete from public.invoices where owner_id = o and rectifica_id is not null;
  delete from public.invoices where owner_id = o;
  delete from public.quotes where owner_id = o;
  delete from public.expenses where owner_id = o;
  delete from public.contacts where owner_id = o;
  delete from public.impuestos where owner_id = o;
  if to_regclass('public.archivo') is not null then
    execute 'delete from public.archivo where owner_id = $1' using o;
  end if;
  if to_regclass('public.extractos_bancarios') is not null then
    execute 'delete from public.extractos_bancarios where owner_id = $1' using o;
  end if;

  -- ---------------------------------------------------------- Datos de la empresa
  update public.profiles set
    es_demo = true, nombre = 'NomoTax Demo, S.L.', nombre_comercial = null, nif = 'B08917262',
    direccion = 'Passeig de Gràcia 55, 4.º 2.ª', cp = '08007', ciudad = 'Barcelona', provincia = 'Barcelona',
    pais = 'España', telefono = '930 000 555', iban = 'ES9121000418450200051332', pie_factura = 'NomoTax Demo, S.L. · Inscrita en el Registro Mercantil de Barcelona · Empresa de demostración: datos ficticios.',
    serie_factura = 'F', serie_presupuesto = 'P'
  where id = o;
  -- Cuentas bancarias (cuentas-bancarias.sql): euros por defecto y una en dólares para los clientes de EE. UU.
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'cuentas_bancarias') then
    execute 'update public.profiles set cuentas_bancarias = $2::jsonb where id = $1' using o, '[{"id":"de300000-0000-4000-8000-0000000002a1","moneda":"EUR","alias":"Cuenta principal","banco":"Banco de ejemplo","titular":"NomoTax Demo, S.L.","iban":"ES9121000418450200051332","predeterminada":true},{"id":"de300000-0000-4000-8000-0000000002a2","moneda":"USD","alias":"Cuenta en dólares","banco":"Example Bank (USD)","titular":"NomoTax Demo, S.L.","numero":"000123456789","codigo_local":"000000000","swift":"DEMOUS33XXX","direccion_banco":"1 Example Plaza, New York, NY 10001","predeterminada":true}]';
  end if;

  -- ---------------------------------------------------------- Clientes
  insert into public.contacts (owner_id, nombre, nif, email, direccion, cp, ciudad, provincia, pais, notas) values
    (o, 'Grupo Hotelero Mediterráneo, S.L.', 'B07318421', 'administracion@ghmediterraneo.example', 'Avinguda Jaume III 12', '07012', 'Palma', 'Illes Balears', 'España', 'Cliente ficticio (demo)')
    returning id into c1;
  insert into public.contacts (owner_id, nombre, nif, email, direccion, cp, ciudad, provincia, pais, notas) values
    (o, 'Logística Ebro Norte, S.A.', 'A50662105', 'cuentas@ebronorte.example', 'Polígono Plaza, calle Bari 33', '50197', 'Zaragoza', 'Zaragoza', 'España', 'Cliente ficticio (demo)')
    returning id into c2;
  insert into public.contacts (owner_id, nombre, nif, email, direccion, cp, ciudad, provincia, pais, notas) values
    (o, 'Clínicas Dentales Sonrisa, S.L.', 'B46205738', 'facturas@clinicasonrisa.example', 'Carrer de Colón 48', '46004', 'València', 'Valencia', 'España', 'Cliente ficticio (demo)')
    returning id into c3;
  insert into public.contacts (owner_id, nombre, nif, email, direccion, cp, ciudad, provincia, pais, notas) values
    (o, 'Bodegas Alt Penedès, S.L.', 'B08477192', 'admin@altpenedes.example', 'Carretera de Sant Sadurní km 4', '08720', 'Vilafranca del Penedès', 'Barcelona', 'España', 'Cliente ficticio (demo)')
    returning id into c4;
  insert into public.contacts (owner_id, nombre, nif, email, direccion, cp, ciudad, provincia, pais, notas) values
    (o, 'Costa Brava Homes, S.L.', 'B17580341', 'hola@costabravahomes.example', 'Passeig del Mar 21', '17250', 'Platja d''Aro', 'Girona', 'España', 'Cliente ficticio (demo)')
    returning id into c5;
  insert into public.contacts (owner_id, nombre, nif, email, direccion, cp, ciudad, provincia, pais, notas) values
    (o, 'Ágora Pagos Fintech, S.L.', 'B28933612', 'finance@agorapagos.example', 'Calle de Serrano 90', '28006', 'Madrid', 'Madrid', 'España', 'Cliente ficticio (demo)')
    returning id into c6;
  insert into public.contacts (owner_id, nombre, nif, email, direccion, cp, ciudad, provincia, pais, notas) values
    (o, 'Moda Sostenible Verde, S.L.', 'B48115067', 'pagos@modaverde.example', 'Alameda de Recalde 27', '48009', 'Bilbao', 'Bizkaia', 'España', 'Cliente ficticio (demo)')
    returning id into c7;
  insert into public.contacts (owner_id, nombre, nif, email, direccion, cp, ciudad, provincia, pais, notas) values
    (o, 'Berliner Datenwerk GmbH', 'DE298765431', 'accounting@datenwerk.example', 'Torstraße 140', '10119', 'Berlin', null, 'Alemania', 'Cliente ficticio (demo)')
    returning id into c8;
  insert into public.contacts (owner_id, nombre, nif, email, direccion, cp, ciudad, provincia, pais, notas) values
    (o, 'Coastline Ventures LLC', '87-1234567', 'ap@coastlineventures.example', '500 Brickell Ave, Suite 1200', 'FL 33131', 'Miami', null, 'Estados Unidos', 'Cliente ficticio (demo)')
    returning id into c9;
  insert into public.contacts (owner_id, nombre, nif, email, direccion, cp, ciudad, provincia, pais, notas) values
    (o, 'Academia Formación Digital, S.L.', 'B41702887', 'admin@formaciondigital.example', 'Avenida de la Constitución 14', '41001', 'Sevilla', 'Sevilla', 'España', 'Cliente ficticio (demo)')
    returning id into c10;

  -- ---------------------------------------------------------- Usuarios de los trabajadores (sin contraseña: no pueden entrar)
  if not exists (select 1 from auth.users where id = 'de300000-0000-4000-8000-000000000101') then
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change)
    values ('de300000-0000-4000-8000-000000000101', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'marta.soler@nomotaxdemo.example', '', now(),
      '{"provider":"email","providers":["email"]}', '{"nombre":"Marta Soler Vidal"}', now(), now(), '', '', '', '');
  end if;
  insert into public.profiles (id, email, nombre) values ('de300000-0000-4000-8000-000000000101', 'marta.soler@nomotaxdemo.example', 'Marta Soler Vidal') on conflict (id) do nothing;
  update public.profiles set role = 'member', nombre = 'Marta Soler Vidal' where id = 'de300000-0000-4000-8000-000000000101';
  if not exists (select 1 from auth.users where id = 'de300000-0000-4000-8000-000000000102') then
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change)
    values ('de300000-0000-4000-8000-000000000102', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'javier.ortega@nomotaxdemo.example', '', now(),
      '{"provider":"email","providers":["email"]}', '{"nombre":"Javier Ortega Prats"}', now(), now(), '', '', '', '');
  end if;
  insert into public.profiles (id, email, nombre) values ('de300000-0000-4000-8000-000000000102', 'javier.ortega@nomotaxdemo.example', 'Javier Ortega Prats') on conflict (id) do nothing;
  update public.profiles set role = 'member', nombre = 'Javier Ortega Prats' where id = 'de300000-0000-4000-8000-000000000102';
  if not exists (select 1 from auth.users where id = 'de300000-0000-4000-8000-000000000103') then
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change)
    values ('de300000-0000-4000-8000-000000000103', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lucia.fernandez@nomotaxdemo.example', '', now(),
      '{"provider":"email","providers":["email"]}', '{"nombre":"Lucía Fernández Gil"}', now(), now(), '', '', '', '');
  end if;
  insert into public.profiles (id, email, nombre) values ('de300000-0000-4000-8000-000000000103', 'lucia.fernandez@nomotaxdemo.example', 'Lucía Fernández Gil') on conflict (id) do nothing;
  update public.profiles set role = 'member', nombre = 'Lucía Fernández Gil' where id = 'de300000-0000-4000-8000-000000000103';
  if not exists (select 1 from auth.users where id = 'de300000-0000-4000-8000-000000000104') then
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change)
    values ('de300000-0000-4000-8000-000000000104', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pau.ribas@nomotaxdemo.example', '', now(),
      '{"provider":"email","providers":["email"]}', '{"nombre":"Pau Ribas Comas"}', now(), now(), '', '', '', '');
  end if;
  insert into public.profiles (id, email, nombre) values ('de300000-0000-4000-8000-000000000104', 'pau.ribas@nomotaxdemo.example', 'Pau Ribas Comas') on conflict (id) do nothing;
  update public.profiles set role = 'member', nombre = 'Pau Ribas Comas' where id = 'de300000-0000-4000-8000-000000000104';
  if not exists (select 1 from auth.users where id = 'de300000-0000-4000-8000-000000000105') then
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change)
    values ('de300000-0000-4000-8000-000000000105', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sara.el@nomotaxdemo.example', '', now(),
      '{"provider":"email","providers":["email"]}', '{"nombre":"Sara El Amrani Torres"}', now(), now(), '', '', '', '');
  end if;
  insert into public.profiles (id, email, nombre) values ('de300000-0000-4000-8000-000000000105', 'sara.el@nomotaxdemo.example', 'Sara El Amrani Torres') on conflict (id) do nothing;
  update public.profiles set role = 'member', nombre = 'Sara El Amrani Torres' where id = 'de300000-0000-4000-8000-000000000105';

  -- ---------------------------------------------------------- Presupuestos
  insert into public.quotes (owner_id, contact_id, cliente, serie, fecha, valido_hasta, lineas, base, cuota_iva, total, creado_por, estado) values
    (o, c4, '{"nombre":"Bodegas Alt Penedès, S.L.","nif":"B08477192","email":"admin@altpenedes.example","direccion":"Carretera de Sant Sadurní km 4","cp":"08720","ciudad":"Vilafranca del Penedès","provincia":"Barcelona","pais":"España"}'::jsonb, 'P', '2026-01-20', '2026-02-19', '[{"concepto":"Tienda online y club de vinos · Fase 1: diseño","cantidad":1,"precio":14500,"iva":21},{"concepto":"Fase 2: desarrollo","cantidad":1,"precio":22000,"iva":21},{"concepto":"Fase 3: lanzamiento","cantidad":1,"precio":9800,"iva":21}]'::jsonb, 46300, 9723, 56023, 'de300000-0000-4000-8000-000000000104', 'aceptado');
  insert into public.quotes (owner_id, contact_id, cliente, serie, fecha, valido_hasta, lineas, base, cuota_iva, total, creado_por, estado) values
    (o, c10, '{"nombre":"Academia Formación Digital, S.L.","nif":"B41702887","email":"admin@formaciondigital.example","direccion":"Avenida de la Constitución 14","cp":"41001","ciudad":"Sevilla","provincia":"Sevilla","pais":"España"}'::jsonb, 'P', '2026-06-02', '2026-07-02', '[{"concepto":"Integración del LMS con Moodle y SSO","cantidad":1,"precio":7800,"iva":21}]'::jsonb, 7800, 1638, 9438, 'de300000-0000-4000-8000-000000000104', 'rechazado');
  insert into public.quotes (owner_id, contact_id, cliente, serie, fecha, valido_hasta, lineas, base, cuota_iva, total, creado_por, estado) values
    (o, c7, '{"nombre":"Moda Sostenible Verde, S.L.","nif":"B48115067","email":"pagos@modaverde.example","direccion":"Alameda de Recalde 27","cp":"48009","ciudad":"Bilbao","provincia":"Bizkaia","pais":"España"}'::jsonb, 'P', '2026-09-15', '2026-10-15', '[{"concepto":"App móvil de fidelización (iOS y Android)\nPagos: 40% al inicio, 30% entrega intermedia, 30% final","cantidad":1,"precio":49000,"iva":21}]'::jsonb, 49000, 10290, 59290, 'de300000-0000-4000-8000-000000000104', 'aceptado');
  insert into public.quotes (owner_id, contact_id, cliente, serie, fecha, valido_hasta, lineas, base, cuota_iva, total, creado_por, estado, enviado_at, enviado_a) values
    (o, c5, '{"nombre":"Costa Brava Homes, S.L.","nif":"B17580341","email":"hola@costabravahomes.example","direccion":"Passeig del Mar 21","cp":"17250","ciudad":"Platja d''Aro","provincia":"Girona","pais":"España"}'::jsonb, 'P', '2026-11-10', '2026-12-10', '[{"concepto":"Mantenimiento y evolutivos 2027 (cuota mensual)","cantidad":12,"precio":2100,"iva":21}]'::jsonb, 25200, 5292, 30492, 'de300000-0000-4000-8000-000000000104', 'enviado', '2026-11-10 10:30+01', 'hola@costabravahomes.example');
  insert into public.quotes (owner_id, contact_id, cliente, serie, fecha, valido_hasta, lineas, base, cuota_iva, total, creado_por, estado, enviado_at, enviado_a) values
    (o, c1, '{"nombre":"Grupo Hotelero Mediterráneo, S.L.","nif":"B07318421","email":"administracion@ghmediterraneo.example","direccion":"Avinguda Jaume III 12","cp":"07012","ciudad":"Palma","provincia":"Illes Balears","pais":"España"}'::jsonb, 'P', '2026-11-18', '2026-12-18', '[{"concepto":"App de check-in online para huéspedes\nDiseño, desarrollo e integración con el PMS","cantidad":1,"precio":32000,"iva":21}]'::jsonb, 32000, 6720, 38720, null, 'enviado', '2026-11-18 10:30+01', 'administracion@ghmediterraneo.example');
  insert into public.quotes (owner_id, contact_id, cliente, serie, fecha, valido_hasta, lineas, base, cuota_iva, total, creado_por, estado) values
    (o, c2, '{"nombre":"Logística Ebro Norte, S.A.","nif":"A50662105","email":"cuentas@ebronorte.example","direccion":"Polígono Plaza, calle Bari 33","cp":"50197","ciudad":"Zaragoza","provincia":"Zaragoza","pais":"España"}'::jsonb, 'P', '2026-11-21', '2026-12-21', '[{"concepto":"BI de flotas · Fase 2: predicción de rutas con IA","cantidad":1,"precio":28500,"iva":21}]'::jsonb, 28500, 5985, 34485, null, 'borrador');

  -- ---------------------------------------------------------- Facturas emitidas (las numera la app: F2026-0001…)
  insert into public.invoices (owner_id, contact_id, origen, cliente, serie, fecha, vencimiento, lineas, base, cuota_iva, total, estado, fecha_cobro, notas, creado_por, ocr) values
    (o, c1, 'app', '{"nombre":"Grupo Hotelero Mediterráneo, S.L.","nif":"B07318421","email":"administracion@ghmediterraneo.example","direccion":"Avinguda Jaume III 12","cp":"07012","ciudad":"Palma","provincia":"Illes Balears","pais":"España"}'::jsonb, 'F', '2026-01-02', '2026-02-01', '[{"concepto":"Mantenimiento evolutivo de la plataforma de reservas · enero 2026\nSoporte 24/7, mejoras y hosting gestionado","cantidad":1,"precio":9500,"iva":21}]'::jsonb, 9500, 1995, 11495, 'cobrada', '2026-01-19', null, null, marca);
  insert into public.invoices (owner_id, contact_id, origen, cliente, serie, fecha, vencimiento, lineas, base, cuota_iva, total, estado, fecha_cobro, notas, creado_por, ocr) values
    (o, c2, 'app', '{"nombre":"Logística Ebro Norte, S.A.","nif":"A50662105","email":"cuentas@ebronorte.example","direccion":"Polígono Plaza, calle Bari 33","cp":"50197","ciudad":"Zaragoza","provincia":"Zaragoza","pais":"España"}'::jsonb, 'F', '2026-01-02', '2026-02-01', '[{"concepto":"Soporte y desarrollo de la app de gestión de flotas · enero 2026","cantidad":1,"precio":7200,"iva":21}]'::jsonb, 7200, 1512, 8712, 'cobrada', '2026-01-27', null, null, marca);
  insert into public.invoices (owner_id, contact_id, origen, cliente, serie, fecha, vencimiento, lineas, base, cuota_iva, total, estado, fecha_cobro, notas, creado_por, ocr) values
    (o, c6, 'app', '{"nombre":"Ágora Pagos Fintech, S.L.","nif":"B28933612","email":"finance@agorapagos.example","direccion":"Calle de Serrano 90","cp":"28006","ciudad":"Madrid","provincia":"Madrid","pais":"España"}'::jsonb, 'F', '2026-01-02', '2026-02-01', '[{"concepto":"Equipo dedicado de desarrollo · enero 2026\n2 perfiles senior a tiempo completo","cantidad":1,"precio":6500,"iva":21}]'::jsonb, 6500, 1365, 7865, 'cobrada', '2026-01-12', null, null, marca);
  insert into public.invoices (owner_id, contact_id, origen, cliente, serie, fecha, vencimiento, lineas, base, cuota_iva, total, estado, fecha_cobro, notas, creado_por, ocr) values
    (o, c3, 'app', '{"nombre":"Clínicas Dentales Sonrisa, S.L.","nif":"B46205738","email":"facturas@clinicasonrisa.example","direccion":"Carrer de Colón 48","cp":"46004","ciudad":"València","provincia":"Valencia","pais":"España"}'::jsonb, 'F', '2026-01-02', '2026-02-01', '[{"concepto":"Mantenimiento web, CRM de pacientes y cita online · enero 2026","cantidad":1,"precio":2400,"iva":21}]'::jsonb, 2400, 504, 2904, 'cobrada', '2026-01-09', null, null, marca);
  insert into public.invoices (owner_id, contact_id, origen, cliente, serie, fecha, vencimiento, lineas, base, cuota_iva, total, estado, fecha_cobro, notas, creado_por, ocr) values
    (o, c7, 'app', '{"nombre":"Moda Sostenible Verde, S.L.","nif":"B48115067","email":"pagos@modaverde.example","direccion":"Alameda de Recalde 27","cp":"48009","ciudad":"Bilbao","provincia":"Bizkaia","pais":"España"}'::jsonb, 'F', '2026-01-19', '2026-02-18', '[{"concepto":"Auditoría UX del ecommerce\nAnálisis heurístico, test con 8 usuarios e informe de mejoras","cantidad":1,"precio":6200,"iva":21}]'::jsonb, 6200, 1302, 7502, 'cobrada', '2026-02-09', null, 'de300000-0000-4000-8000-000000000104', marca);
  insert into public.invoices (owner_id, contact_id, origen, cliente, serie, fecha, vencimiento, lineas, base, cuota_iva, total, estado, fecha_cobro, notas, creado_por, ocr) values
    (o, c1, 'app', '{"nombre":"Grupo Hotelero Mediterráneo, S.L.","nif":"B07318421","email":"administracion@ghmediterraneo.example","direccion":"Avinguda Jaume III 12","cp":"07012","ciudad":"Palma","provincia":"Illes Balears","pais":"España"}'::jsonb, 'F', '2026-02-02', '2026-03-04', '[{"concepto":"Mantenimiento evolutivo de la plataforma de reservas · febrero 2026\nSoporte 24/7, mejoras y hosting gestionado","cantidad":1,"precio":9500,"iva":21}]'::jsonb, 9500, 1995, 11495, 'cobrada', '2026-02-13', null, null, marca);
  insert into public.invoices (owner_id, contact_id, origen, cliente, serie, fecha, vencimiento, lineas, base, cuota_iva, total, estado, fecha_cobro, notas, creado_por, ocr) values
    (o, c2, 'app', '{"nombre":"Logística Ebro Norte, S.A.","nif":"A50662105","email":"cuentas@ebronorte.example","direccion":"Polígono Plaza, calle Bari 33","cp":"50197","ciudad":"Zaragoza","provincia":"Zaragoza","pais":"España"}'::jsonb, 'F', '2026-02-02', '2026-03-04', '[{"concepto":"Soporte y desarrollo de la app de gestión de flotas · febrero 2026","cantidad":1,"precio":7200,"iva":21}]'::jsonb, 7200, 1512, 8712, 'cobrada', '2026-03-02', null, null, marca);
  insert into public.invoices (owner_id, contact_id, origen, cliente, serie, fecha, vencimiento, lineas, base, cuota_iva, total, estado, fecha_cobro, notas, creado_por, ocr) values
    (o, c6, 'app', '{"nombre":"Ágora Pagos Fintech, S.L.","nif":"B28933612","email":"finance@agorapagos.example","direccion":"Calle de Serrano 90","cp":"28006","ciudad":"Madrid","provincia":"Madrid","pais":"España"}'::jsonb, 'F', '2026-02-02', '2026-03-04', '[{"concepto":"Equipo dedicado de desarrollo · febrero 2026\n2 perfiles senior a tiempo completo","cantidad":1,"precio":6500,"iva":21}]'::jsonb, 6500, 1365, 7865, 'cobrada', '2026-02-10', null, null, marca);
  insert into public.invoices (owner_id, contact_id, origen, cliente, serie, fecha, vencimiento, lineas, base, cuota_iva, total, estado, fecha_cobro, notas, creado_por, ocr) values
    (o, c3, 'app', '{"nombre":"Clínicas Dentales Sonrisa, S.L.","nif":"B46205738","email":"facturas@clinicasonrisa.example","direccion":"Carrer de Colón 48","cp":"46004","ciudad":"València","provincia":"Valencia","pais":"España"}'::jsonb, 'F', '2026-02-02', '2026-03-04', '[{"concepto":"Mantenimiento web, CRM de pacientes y cita online · febrero 2026","cantidad":1,"precio":2400,"iva":21}]'::jsonb, 2400, 504, 2904, 'cobrada', '2026-02-12', null, null, marca);
  insert into public.invoices (owner_id, contact_id, origen, cliente, serie, fecha, vencimiento, lineas, base, cuota_iva, total, estado, fecha_cobro, notas, creado_por, ocr) values
    (o, c4, 'app', '{"nombre":"Bodegas Alt Penedès, S.L.","nif":"B08477192","email":"admin@altpenedes.example","direccion":"Carretera de Sant Sadurní km 4","cp":"08720","ciudad":"Vilafranca del Penedès","provincia":"Barcelona","pais":"España"}'::jsonb, 'F', '2026-02-09', '2026-03-11', '[{"concepto":"Tienda online y club de vinos · Fase 1: diseño\nUX, identidad digital y prototipo navegable","cantidad":1,"precio":14500,"iva":21}]'::jsonb, 14500, 3045, 17545, 'cobrada', '2026-03-06', null, 'de300000-0000-4000-8000-000000000104', marca);
  insert into public.invoices (owner_id, contact_id, origen, cliente, serie, fecha, vencimiento, lineas, base, cuota_iva, total, estado, fecha_cobro, notas, creado_por, ocr) values
    (o, c10, 'app', '{"nombre":"Academia Formación Digital, S.L.","nif":"B41702887","email":"admin@formaciondigital.example","direccion":"Avenida de la Constitución 14","cp":"41001","ciudad":"Sevilla","provincia":"Sevilla","pais":"España"}'::jsonb, 'F', '2026-02-16', '2026-03-18', '[{"concepto":"Plataforma e-learning (LMS)\nLicencia anual y personalización de la marca","cantidad":1,"precio":11500,"iva":21}]'::jsonb, 11500, 2415, 13915, 'cobrada', '2026-03-12', null, 'de300000-0000-4000-8000-000000000104', marca);
  insert into public.invoices (owner_id, contact_id, origen, cliente, serie, fecha, vencimiento, lineas, base, cuota_iva, total, estado, fecha_cobro, notas, creado_por, ocr) values
    (o, c1, 'app', '{"nombre":"Grupo Hotelero Mediterráneo, S.L.","nif":"B07318421","email":"administracion@ghmediterraneo.example","direccion":"Avinguda Jaume III 12","cp":"07012","ciudad":"Palma","provincia":"Illes Balears","pais":"España"}'::jsonb, 'F', '2026-03-02', '2026-04-01', '[{"concepto":"Mantenimiento evolutivo de la plataforma de reservas · marzo 2026\nSoporte 24/7, mejoras y hosting gestionado","cantidad":1,"precio":9500,"iva":21}]'::jsonb, 9500, 1995, 11495, 'cobrada', '2026-03-16', null, null, marca);
  insert into public.invoices (owner_id, contact_id, origen, cliente, serie, fecha, vencimiento, lineas, base, cuota_iva, total, estado, fecha_cobro, notas, creado_por, ocr) values
    (o, c2, 'app', '{"nombre":"Logística Ebro Norte, S.A.","nif":"A50662105","email":"cuentas@ebronorte.example","direccion":"Polígono Plaza, calle Bari 33","cp":"50197","ciudad":"Zaragoza","provincia":"Zaragoza","pais":"España"}'::jsonb, 'F', '2026-03-02', '2026-04-01', '[{"concepto":"Soporte y desarrollo de la app de gestión de flotas · marzo 2026","cantidad":1,"precio":7200,"iva":21}]'::jsonb, 7200, 1512, 8712, 'cobrada', '2026-03-27', null, null, marca);
  insert into public.invoices (owner_id, contact_id, origen, cliente, serie, fecha, vencimiento, lineas, base, cuota_iva, total, estado, fecha_cobro, notas, creado_por, ocr) values
    (o, c6, 'app', '{"nombre":"Ágora Pagos Fintech, S.L.","nif":"B28933612","email":"finance@agorapagos.example","direccion":"Calle de Serrano 90","cp":"28006","ciudad":"Madrid","provincia":"Madrid","pais":"España"}'::jsonb, 'F', '2026-03-02', '2026-04-01', '[{"concepto":"Equipo dedicado de desarrollo · marzo 2026\n2 perfiles senior a tiempo completo","cantidad":1,"precio":6500,"iva":21}]'::jsonb, 6500, 1365, 7865, 'cobrada', '2026-03-09', null, null, marca);
  insert into public.invoices (owner_id, contact_id, origen, cliente, serie, fecha, vencimiento, lineas, base, cuota_iva, total, estado, fecha_cobro, notas, creado_por, ocr) values
    (o, c3, 'app', '{"nombre":"Clínicas Dentales Sonrisa, S.L.","nif":"B46205738","email":"facturas@clinicasonrisa.example","direccion":"Carrer de Colón 48","cp":"46004","ciudad":"València","provincia":"Valencia","pais":"España"}'::jsonb, 'F', '2026-03-02', '2026-04-01', '[{"concepto":"Mantenimiento web, CRM de pacientes y cita online · marzo 2026","cantidad":1,"precio":2400,"iva":21}]'::jsonb, 2400, 504, 2904, 'cobrada', '2026-03-12', null, null, marca);
  insert into public.invoices (owner_id, contact_id, origen, cliente, serie, fecha, vencimiento, lineas, base, cuota_iva, total, estado, fecha_cobro, notas, creado_por, ocr) values
    (o, c5, 'app', '{"nombre":"Costa Brava Homes, S.L.","nif":"B17580341","email":"hola@costabravahomes.example","direccion":"Passeig del Mar 21","cp":"17250","ciudad":"Platja d''Aro","provincia":"Girona","pais":"España"}'::jsonb, 'F', '2026-03-04', '2026-04-03', '[{"concepto":"Portal inmobiliario con buscador por mapa\nDesarrollo y puesta en producción","cantidad":1,"precio":18900,"iva":21}]'::jsonb, 18900, 3969, 22869, 'cobrada', '2026-03-19', null, 'de300000-0000-4000-8000-000000000104', marca);
  insert into public.invoices (owner_id, contact_id, origen, cliente, serie, fecha, vencimiento, lineas, base, cuota_iva, total, estado, fecha_cobro, notas, creado_por, ocr) values
    (o, c9, 'app', '{"nombre":"Coastline Ventures LLC","nif":"87-1234567","email":"ap@coastlineventures.example","direccion":"500 Brickell Ave, Suite 1200","cp":"FL 33131","ciudad":"Miami","provincia":null,"pais":"Estados Unidos"}'::jsonb, 'F', '2026-03-16', '2026-04-15', '[{"concepto":"MVP development · Milestone 1\nDiscovery, architecture and first release","cantidad":1,"precio":24000,"iva":0}]'::jsonb, 24000, 0, 24000, 'cobrada', '2026-04-13', 'Operación no sujeta a IVA (art. 69.Uno.1.º LIVA).', null, marca);
  insert into public.invoices (owner_id, contact_id, origen, cliente, serie, fecha, vencimiento, lineas, base, cuota_iva, total, estado, fecha_cobro, notas, creado_por, ocr) values
    (o, c10, 'app', '{"nombre":"Academia Formación Digital, S.L.","nif":"B41702887","email":"admin@formaciondigital.example","direccion":"Avenida de la Constitución 14","cp":"41001","ciudad":"Sevilla","provincia":"Sevilla","pais":"España"}'::jsonb, 'F', '2026-03-23', '2026-04-22', '[{"concepto":"Formación al equipo docente","cantidad":12,"precio":150,"iva":21}]'::jsonb, 1800, 378, 2178, 'cobrada', '2026-04-14', null, 'de300000-0000-4000-8000-000000000104', marca);
  insert into public.invoices (owner_id, contact_id, origen, cliente, serie, fecha, vencimiento, lineas, base, cuota_iva, total, estado, fecha_cobro, notas, creado_por, ocr) values
    (o, c1, 'app', '{"nombre":"Grupo Hotelero Mediterráneo, S.L.","nif":"B07318421","email":"administracion@ghmediterraneo.example","direccion":"Avinguda Jaume III 12","cp":"07012","ciudad":"Palma","provincia":"Illes Balears","pais":"España"}'::jsonb, 'F', '2026-04-01', '2026-05-01', '[{"concepto":"Mantenimiento evolutivo de la plataforma de reservas · abril 2026\nSoporte 24/7, mejoras y hosting gestionado","cantidad":1,"precio":9500,"iva":21}]'::jsonb, 9500, 1995, 11495, 'cobrada', '2026-04-15', null, null, marca);
  insert into public.invoices (owner_id, contact_id, origen, cliente, serie, fecha, vencimiento, lineas, base, cuota_iva, total, estado, fecha_cobro, notas, creado_por, ocr) values
    (o, c2, 'app', '{"nombre":"Logística Ebro Norte, S.A.","nif":"A50662105","email":"cuentas@ebronorte.example","direccion":"Polígono Plaza, calle Bari 33","cp":"50197","ciudad":"Zaragoza","provincia":"Zaragoza","pais":"España"}'::jsonb, 'F', '2026-04-01', '2026-05-01', '[{"concepto":"Soporte y desarrollo de la app de gestión de flotas · abril 2026","cantidad":1,"precio":7200,"iva":21}]'::jsonb, 7200, 1512, 8712, 'cobrada', '2026-04-27', null, null, marca);
  insert into public.invoices (owner_id, contact_id, origen, cliente, serie, fecha, vencimiento, lineas, base, cuota_iva, total, estado, fecha_cobro, notas, creado_por, ocr) values
    (o, c6, 'app', '{"nombre":"Ágora Pagos Fintech, S.L.","nif":"B28933612","email":"finance@agorapagos.example","direccion":"Calle de Serrano 90","cp":"28006","ciudad":"Madrid","provincia":"Madrid","pais":"España"}'::jsonb, 'F', '2026-04-01', '2026-05-01', '[{"concepto":"Equipo dedicado de desarrollo · abril 2026\n2 perfiles senior a tiempo completo","cantidad":1,"precio":6500,"iva":21}]'::jsonb, 6500, 1365, 7865, 'cobrada', '2026-04-13', null, null, marca);
  insert into public.invoices (owner_id, contact_id, origen, cliente, serie, fecha, vencimiento, lineas, base, cuota_iva, total, estado, fecha_cobro, notas, creado_por, ocr) values
    (o, c3, 'app', '{"nombre":"Clínicas Dentales Sonrisa, S.L.","nif":"B46205738","email":"facturas@clinicasonrisa.example","direccion":"Carrer de Colón 48","cp":"46004","ciudad":"València","provincia":"Valencia","pais":"España"}'::jsonb, 'F', '2026-04-01', '2026-05-01', '[{"concepto":"Mantenimiento web, CRM de pacientes y cita online · abril 2026","cantidad":1,"precio":2400,"iva":21}]'::jsonb, 2400, 504, 2904, 'cobrada', '2026-04-13', null, null, marca);
  insert into public.invoices (owner_id, contact_id, origen, cliente, serie, fecha, vencimiento, lineas, base, cuota_iva, total, estado, fecha_cobro, notas, creado_por, ocr) values
    (o, c8, 'app', '{"nombre":"Berliner Datenwerk GmbH","nif":"DE298765431","email":"accounting@datenwerk.example","direccion":"Torstraße 140","cp":"10119","ciudad":"Berlin","provincia":null,"pais":"Alemania"}'::jsonb, 'F', '2026-04-01', '2026-05-01', '[{"concepto":"Software development services · April 2026\nDedicated backend team (data pipelines)","cantidad":1,"precio":5000,"iva":0}]'::jsonb, 5000, 0, 5000, 'cobrada', '2026-04-22', 'Reverse charge: VAT to be accounted for by the recipient (Art. 196 Directive 2006/112/EC). Inversión del sujeto pasivo.', null, marca);
  insert into public.invoices (owner_id, contact_id, origen, cliente, serie, fecha, vencimiento, lineas, base, cuota_iva, total, estado, fecha_cobro, notas, creado_por, ocr) values
    (o, c4, 'app', '{"nombre":"Bodegas Alt Penedès, S.L.","nif":"B08477192","email":"admin@altpenedes.example","direccion":"Carretera de Sant Sadurní km 4","cp":"08720","ciudad":"Vilafranca del Penedès","provincia":"Barcelona","pais":"España"}'::jsonb, 'F', '2026-04-13', '2026-05-13', '[{"concepto":"Tienda online y club de vinos · Fase 2: desarrollo\nCatálogo, suscripciones y pasarela de pago","cantidad":1,"precio":22000,"iva":21}]'::jsonb, 22000, 4620, 26620, 'cobrada', '2026-05-05', null, 'de300000-0000-4000-8000-000000000104', marca);
  insert into public.invoices (owner_id, contact_id, origen, cliente, serie, fecha, vencimiento, lineas, base, cuota_iva, total, estado, fecha_cobro, notas, creado_por, ocr) values
    (o, c3, 'app', '{"nombre":"Clínicas Dentales Sonrisa, S.L.","nif":"B46205738","email":"facturas@clinicasonrisa.example","direccion":"Carrer de Colón 48","cp":"46004","ciudad":"València","provincia":"Valencia","pais":"España"}'::jsonb, 'F', '2026-04-20', '2026-05-20', '[{"concepto":"Nueva web corporativa multiclínica\nDiseño, desarrollo y migración de contenidos","cantidad":1,"precio":8900,"iva":21}]'::jsonb, 8900, 1869, 10769, 'cobrada', '2026-04-30', null, null, marca);
  insert into public.invoices (owner_id, contact_id, origen, cliente, serie, fecha, vencimiento, lineas, base, cuota_iva, total, estado, fecha_cobro, notas, creado_por, ocr) values
    (o, c1, 'app', '{"nombre":"Grupo Hotelero Mediterráneo, S.L.","nif":"B07318421","email":"administracion@ghmediterraneo.example","direccion":"Avinguda Jaume III 12","cp":"07012","ciudad":"Palma","provincia":"Illes Balears","pais":"España"}'::jsonb, 'F', '2026-05-01', '2026-05-31', '[{"concepto":"Mantenimiento evolutivo de la plataforma de reservas · mayo 2026\nSoporte 24/7, mejoras y hosting gestionado","cantidad":1,"precio":9500,"iva":21}]'::jsonb, 9500, 1995, 11495, 'cobrada', '2026-05-15', null, null, marca);
  insert into public.invoices (owner_id, contact_id, origen, cliente, serie, fecha, vencimiento, lineas, base, cuota_iva, total, estado, fecha_cobro, notas, creado_por, ocr) values
    (o, c2, 'app', '{"nombre":"Logística Ebro Norte, S.A.","nif":"A50662105","email":"cuentas@ebronorte.example","direccion":"Polígono Plaza, calle Bari 33","cp":"50197","ciudad":"Zaragoza","provincia":"Zaragoza","pais":"España"}'::jsonb, 'F', '2026-05-01', '2026-05-31', '[{"concepto":"Soporte y desarrollo de la app de gestión de flotas · mayo 2026","cantidad":1,"precio":7200,"iva":21}]'::jsonb, 7200, 1512, 8712, 'cobrada', '2026-06-02', null, null, marca);
  insert into public.invoices (owner_id, contact_id, origen, cliente, serie, fecha, vencimiento, lineas, base, cuota_iva, total, estado, fecha_cobro, notas, creado_por, ocr) values
    (o, c6, 'app', '{"nombre":"Ágora Pagos Fintech, S.L.","nif":"B28933612","email":"finance@agorapagos.example","direccion":"Calle de Serrano 90","cp":"28006","ciudad":"Madrid","provincia":"Madrid","pais":"España"}'::jsonb, 'F', '2026-05-01', '2026-05-31', '[{"concepto":"Equipo dedicado de desarrollo · mayo 2026\n2 perfiles senior a tiempo completo","cantidad":1,"precio":6500,"iva":21}]'::jsonb, 6500, 1365, 7865, 'cobrada', '2026-05-11', null, null, marca);
  insert into public.invoices (owner_id, contact_id, origen, cliente, serie, fecha, vencimiento, lineas, base, cuota_iva, total, estado, fecha_cobro, notas, creado_por, ocr) values
    (o, c3, 'app', '{"nombre":"Clínicas Dentales Sonrisa, S.L.","nif":"B46205738","email":"facturas@clinicasonrisa.example","direccion":"Carrer de Colón 48","cp":"46004","ciudad":"València","provincia":"Valencia","pais":"España"}'::jsonb, 'F', '2026-05-01', '2026-05-31', '[{"concepto":"Mantenimiento web, CRM de pacientes y cita online · mayo 2026","cantidad":1,"precio":2400,"iva":21}]'::jsonb, 2400, 504, 2904, 'cobrada', '2026-05-08', null, null, marca);
  insert into public.invoices (owner_id, contact_id, origen, cliente, serie, fecha, vencimiento, lineas, base, cuota_iva, total, estado, fecha_cobro, notas, creado_por, ocr) values
    (o, c8, 'app', '{"nombre":"Berliner Datenwerk GmbH","nif":"DE298765431","email":"accounting@datenwerk.example","direccion":"Torstraße 140","cp":"10119","ciudad":"Berlin","provincia":null,"pais":"Alemania"}'::jsonb, 'F', '2026-05-01', '2026-05-31', '[{"concepto":"Software development services · May 2026\nDedicated backend team (data pipelines)","cantidad":1,"precio":5000,"iva":0}]'::jsonb, 5000, 0, 5000, 'cobrada', '2026-05-21', 'Reverse charge: VAT to be accounted for by the recipient (Art. 196 Directive 2006/112/EC). Inversión del sujeto pasivo.', null, marca);
  insert into public.invoices (owner_id, contact_id, origen, cliente, serie, fecha, vencimiento, lineas, base, cuota_iva, total, estado, fecha_cobro, notas, creado_por, ocr) values
    (o, c1, 'app', '{"nombre":"Grupo Hotelero Mediterráneo, S.L.","nif":"B07318421","email":"administracion@ghmediterraneo.example","direccion":"Avinguda Jaume III 12","cp":"07012","ciudad":"Palma","provincia":"Illes Balears","pais":"España"}'::jsonb, 'F', '2026-05-11', '2026-06-10', '[{"concepto":"Integración de pasarela de pago y channel manager","cantidad":1,"precio":16800,"iva":21}]'::jsonb, 16800, 3528, 20328, 'cobrada', '2026-05-21', null, null, marca);
  insert into public.invoices (owner_id, contact_id, origen, cliente, serie, fecha, vencimiento, lineas, base, cuota_iva, total, estado, fecha_cobro, notas, creado_por, ocr) values
    (o, c5, 'app', '{"nombre":"Costa Brava Homes, S.L.","nif":"B17580341","email":"hola@costabravahomes.example","direccion":"Passeig del Mar 21","cp":"17250","ciudad":"Platja d''Aro","provincia":"Girona","pais":"España"}'::jsonb, 'F', '2026-05-18', '2026-06-17', '[{"concepto":"Integración con portales inmobiliarios\nPublicación automática y sincronización de leads","cantidad":1,"precio":7400,"iva":21}]'::jsonb, 7400, 1554, 8954, 'cobrada', '2026-06-05', null, 'de300000-0000-4000-8000-000000000104', marca);
  insert into public.invoices (owner_id, contact_id, origen, cliente, serie, fecha, vencimiento, lineas, base, cuota_iva, total, estado, fecha_cobro, notas, creado_por, ocr) values
    (o, c1, 'app', '{"nombre":"Grupo Hotelero Mediterráneo, S.L.","nif":"B07318421","email":"administracion@ghmediterraneo.example","direccion":"Avinguda Jaume III 12","cp":"07012","ciudad":"Palma","provincia":"Illes Balears","pais":"España"}'::jsonb, 'F', '2026-06-01', '2026-07-01', '[{"concepto":"Mantenimiento evolutivo de la plataforma de reservas · junio 2026\nSoporte 24/7, mejoras y hosting gestionado","cantidad":1,"precio":9500,"iva":21}]'::jsonb, 9500, 1995, 11495, 'cobrada', '2026-06-11', null, null, marca);
  insert into public.invoices (owner_id, contact_id, origen, cliente, serie, fecha, vencimiento, lineas, base, cuota_iva, total, estado, fecha_cobro, notas, creado_por, ocr) values
    (o, c2, 'app', '{"nombre":"Logística Ebro Norte, S.A.","nif":"A50662105","email":"cuentas@ebronorte.example","direccion":"Polígono Plaza, calle Bari 33","cp":"50197","ciudad":"Zaragoza","provincia":"Zaragoza","pais":"España"}'::jsonb, 'F', '2026-06-01', '2026-07-01', '[{"concepto":"Soporte y desarrollo de la app de gestión de flotas · junio 2026","cantidad":1,"precio":7200,"iva":21}]'::jsonb, 7200, 1512, 8712, 'cobrada', '2026-06-26', null, null, marca);
  insert into public.invoices (owner_id, contact_id, origen, cliente, serie, fecha, vencimiento, lineas, base, cuota_iva, total, estado, fecha_cobro, notas, creado_por, ocr) values
    (o, c6, 'app', '{"nombre":"Ágora Pagos Fintech, S.L.","nif":"B28933612","email":"finance@agorapagos.example","direccion":"Calle de Serrano 90","cp":"28006","ciudad":"Madrid","provincia":"Madrid","pais":"España"}'::jsonb, 'F', '2026-06-01', '2026-07-01', '[{"concepto":"Equipo dedicado de desarrollo · junio 2026\n2 perfiles senior a tiempo completo","cantidad":1,"precio":6500,"iva":21}]'::jsonb, 6500, 1365, 7865, 'cobrada', '2026-06-10', null, null, marca);
  insert into public.invoices (owner_id, contact_id, origen, cliente, serie, fecha, vencimiento, lineas, base, cuota_iva, total, estado, fecha_cobro, notas, creado_por, ocr) values
    (o, c3, 'app', '{"nombre":"Clínicas Dentales Sonrisa, S.L.","nif":"B46205738","email":"facturas@clinicasonrisa.example","direccion":"Carrer de Colón 48","cp":"46004","ciudad":"València","provincia":"Valencia","pais":"España"}'::jsonb, 'F', '2026-06-01', '2026-07-01', '[{"concepto":"Mantenimiento web, CRM de pacientes y cita online · junio 2026","cantidad":1,"precio":2400,"iva":21}]'::jsonb, 2400, 504, 2904, 'cobrada', '2026-06-08', null, null, marca);
  insert into public.invoices (owner_id, contact_id, origen, cliente, serie, fecha, vencimiento, lineas, base, cuota_iva, total, estado, fecha_cobro, notas, creado_por, ocr) values
    (o, c8, 'app', '{"nombre":"Berliner Datenwerk GmbH","nif":"DE298765431","email":"accounting@datenwerk.example","direccion":"Torstraße 140","cp":"10119","ciudad":"Berlin","provincia":null,"pais":"Alemania"}'::jsonb, 'F', '2026-06-01', '2026-07-01', '[{"concepto":"Software development services · June 2026\nDedicated backend team (data pipelines)","cantidad":1,"precio":5000,"iva":0}]'::jsonb, 5000, 0, 5000, 'cobrada', '2026-06-22', 'Reverse charge: VAT to be accounted for by the recipient (Art. 196 Directive 2006/112/EC). Inversión del sujeto pasivo.', null, marca);
  insert into public.invoices (owner_id, contact_id, origen, cliente, serie, fecha, vencimiento, lineas, base, cuota_iva, total, estado, fecha_cobro, notas, creado_por, ocr) values
    (o, c4, 'app', '{"nombre":"Bodegas Alt Penedès, S.L.","nif":"B08477192","email":"admin@altpenedes.example","direccion":"Carretera de Sant Sadurní km 4","cp":"08720","ciudad":"Vilafranca del Penedès","provincia":"Barcelona","pais":"España"}'::jsonb, 'F', '2026-06-08', '2026-07-08', '[{"concepto":"Tienda online y club de vinos · Fase 3: lanzamiento\nSEO, analítica y formación","cantidad":1,"precio":9800,"iva":21}]'::jsonb, 9800, 2058, 11858, 'cobrada', '2026-06-29', null, 'de300000-0000-4000-8000-000000000104', marca);
  insert into public.invoices (owner_id, contact_id, origen, cliente, serie, fecha, vencimiento, lineas, base, cuota_iva, total, estado, fecha_cobro, notas, creado_por, ocr) values
    (o, c9, 'app', '{"nombre":"Coastline Ventures LLC","nif":"87-1234567","email":"ap@coastlineventures.example","direccion":"500 Brickell Ave, Suite 1200","cp":"FL 33131","ciudad":"Miami","provincia":null,"pais":"Estados Unidos"}'::jsonb, 'F', '2026-06-15', '2026-07-15', '[{"concepto":"MVP development · Milestone 2\nPayments, onboarding and admin panel","cantidad":1,"precio":24000,"iva":0}]'::jsonb, 24000, 0, 24000, 'cobrada', '2026-07-10', 'Operación no sujeta a IVA (art. 69.Uno.1.º LIVA).', null, marca);
  insert into public.invoices (owner_id, contact_id, origen, cliente, serie, fecha, vencimiento, lineas, base, cuota_iva, total, estado, fecha_cobro, notas, creado_por, ocr) values
    (o, c1, 'app', '{"nombre":"Grupo Hotelero Mediterráneo, S.L.","nif":"B07318421","email":"administracion@ghmediterraneo.example","direccion":"Avinguda Jaume III 12","cp":"07012","ciudad":"Palma","provincia":"Illes Balears","pais":"España"}'::jsonb, 'F', '2026-07-01', '2026-07-31', '[{"concepto":"Mantenimiento evolutivo de la plataforma de reservas · julio 2026\nSoporte 24/7, mejoras y hosting gestionado","cantidad":1,"precio":9500,"iva":21}]'::jsonb, 9500, 1995, 11495, 'cobrada', '2026-07-13', null, null, marca);
  insert into public.invoices (owner_id, contact_id, origen, cliente, serie, fecha, vencimiento, lineas, base, cuota_iva, total, estado, fecha_cobro, notas, creado_por, ocr) values
    (o, c2, 'app', '{"nombre":"Logística Ebro Norte, S.A.","nif":"A50662105","email":"cuentas@ebronorte.example","direccion":"Polígono Plaza, calle Bari 33","cp":"50197","ciudad":"Zaragoza","provincia":"Zaragoza","pais":"España"}'::jsonb, 'F', '2026-07-01', '2026-07-31', '[{"concepto":"Soporte y desarrollo de la app de gestión de flotas · julio 2026","cantidad":1,"precio":7200,"iva":21}]'::jsonb, 7200, 1512, 8712, 'cobrada', '2026-07-27', null, null, marca);
  insert into public.invoices (owner_id, contact_id, origen, cliente, serie, fecha, vencimiento, lineas, base, cuota_iva, total, estado, fecha_cobro, notas, creado_por, ocr) values
    (o, c6, 'app', '{"nombre":"Ágora Pagos Fintech, S.L.","nif":"B28933612","email":"finance@agorapagos.example","direccion":"Calle de Serrano 90","cp":"28006","ciudad":"Madrid","provincia":"Madrid","pais":"España"}'::jsonb, 'F', '2026-07-01', '2026-07-31', '[{"concepto":"Equipo dedicado de desarrollo · julio 2026\n2 perfiles senior a tiempo completo","cantidad":1,"precio":6500,"iva":21}]'::jsonb, 6500, 1365, 7865, 'cobrada', '2026-07-09', null, null, marca);
  insert into public.invoices (owner_id, contact_id, origen, cliente, serie, fecha, vencimiento, lineas, base, cuota_iva, total, estado, fecha_cobro, notas, creado_por, ocr) values
    (o, c3, 'app', '{"nombre":"Clínicas Dentales Sonrisa, S.L.","nif":"B46205738","email":"facturas@clinicasonrisa.example","direccion":"Carrer de Colón 48","cp":"46004","ciudad":"València","provincia":"Valencia","pais":"España"}'::jsonb, 'F', '2026-07-01', '2026-07-31', '[{"concepto":"Mantenimiento web, CRM de pacientes y cita online · julio 2026","cantidad":1,"precio":2400,"iva":21}]'::jsonb, 2400, 504, 2904, 'cobrada', '2026-07-13', null, null, marca);
  insert into public.invoices (owner_id, contact_id, origen, cliente, serie, fecha, vencimiento, lineas, base, cuota_iva, total, estado, fecha_cobro, notas, creado_por, ocr) values
    (o, c8, 'app', '{"nombre":"Berliner Datenwerk GmbH","nif":"DE298765431","email":"accounting@datenwerk.example","direccion":"Torstraße 140","cp":"10119","ciudad":"Berlin","provincia":null,"pais":"Alemania"}'::jsonb, 'F', '2026-07-01', '2026-07-31', '[{"concepto":"Software development services · July 2026\nDedicated backend team (data pipelines)","cantidad":1,"precio":5000,"iva":0}]'::jsonb, 5000, 0, 5000, 'cobrada', '2026-07-17', 'Reverse charge: VAT to be accounted for by the recipient (Art. 196 Directive 2006/112/EC). Inversión del sujeto pasivo.', null, marca);
  insert into public.invoices (owner_id, contact_id, origen, cliente, serie, fecha, vencimiento, lineas, base, cuota_iva, total, estado, fecha_cobro, notas, creado_por, ocr) values
    (o, c7, 'app', '{"nombre":"Moda Sostenible Verde, S.L.","nif":"B48115067","email":"pagos@modaverde.example","direccion":"Alameda de Recalde 27","cp":"48009","ciudad":"Bilbao","provincia":"Bizkaia","pais":"España"}'::jsonb, 'F', '2026-07-06', '2026-08-05', '[{"concepto":"Rediseño del proceso de compra (checkout)","cantidad":1,"precio":15800,"iva":21}]'::jsonb, 15800, 3318, 19118, 'cobrada', '2026-07-28', null, 'de300000-0000-4000-8000-000000000104', marca);
  insert into public.invoices (owner_id, contact_id, origen, cliente, serie, fecha, vencimiento, lineas, base, cuota_iva, total, estado, fecha_cobro, notas, creado_por, ocr) values
    (o, c2, 'app', '{"nombre":"Logística Ebro Norte, S.A.","nif":"A50662105","email":"cuentas@ebronorte.example","direccion":"Polígono Plaza, calle Bari 33","cp":"50197","ciudad":"Zaragoza","provincia":"Zaragoza","pais":"España"}'::jsonb, 'F', '2026-07-20', '2026-08-19', '[{"concepto":"Cuadro de mando BI de flotas\nModelo de datos, KPI e informes automáticos","cantidad":1,"precio":12600,"iva":21}]'::jsonb, 12600, 2646, 15246, 'cobrada', '2026-08-17', null, null, marca);
  insert into public.invoices (owner_id, contact_id, origen, cliente, serie, fecha, vencimiento, lineas, base, cuota_iva, total, estado, fecha_cobro, notas, creado_por, ocr) values
    (o, c1, 'app', '{"nombre":"Grupo Hotelero Mediterráneo, S.L.","nif":"B07318421","email":"administracion@ghmediterraneo.example","direccion":"Avinguda Jaume III 12","cp":"07012","ciudad":"Palma","provincia":"Illes Balears","pais":"España"}'::jsonb, 'F', '2026-08-03', '2026-09-02', '[{"concepto":"Mantenimiento evolutivo de la plataforma de reservas · agosto 2026\nSoporte 24/7, mejoras y hosting gestionado","cantidad":1,"precio":9500,"iva":21}]'::jsonb, 9500, 1995, 11495, 'cobrada', '2026-08-11', null, null, marca);
  insert into public.invoices (owner_id, contact_id, origen, cliente, serie, fecha, vencimiento, lineas, base, cuota_iva, total, estado, fecha_cobro, notas, creado_por, ocr) values
    (o, c2, 'app', '{"nombre":"Logística Ebro Norte, S.A.","nif":"A50662105","email":"cuentas@ebronorte.example","direccion":"Polígono Plaza, calle Bari 33","cp":"50197","ciudad":"Zaragoza","provincia":"Zaragoza","pais":"España"}'::jsonb, 'F', '2026-08-03', '2026-09-02', '[{"concepto":"Soporte y desarrollo de la app de gestión de flotas · agosto 2026","cantidad":1,"precio":7200,"iva":21}]'::jsonb, 7200, 1512, 8712, 'cobrada', '2026-09-03', null, null, marca);
  insert into public.invoices (owner_id, contact_id, origen, cliente, serie, fecha, vencimiento, lineas, base, cuota_iva, total, estado, fecha_cobro, notas, creado_por, ocr) values
    (o, c6, 'app', '{"nombre":"Ágora Pagos Fintech, S.L.","nif":"B28933612","email":"finance@agorapagos.example","direccion":"Calle de Serrano 90","cp":"28006","ciudad":"Madrid","provincia":"Madrid","pais":"España"}'::jsonb, 'F', '2026-08-03', '2026-09-02', '[{"concepto":"Equipo dedicado de desarrollo · agosto 2026\n2 perfiles senior a tiempo completo","cantidad":1,"precio":6500,"iva":21}]'::jsonb, 6500, 1365, 7865, 'cobrada', '2026-08-10', null, null, marca);
  insert into public.invoices (owner_id, contact_id, origen, cliente, serie, fecha, vencimiento, lineas, base, cuota_iva, total, estado, fecha_cobro, notas, creado_por, ocr) values
    (o, c3, 'app', '{"nombre":"Clínicas Dentales Sonrisa, S.L.","nif":"B46205738","email":"facturas@clinicasonrisa.example","direccion":"Carrer de Colón 48","cp":"46004","ciudad":"València","provincia":"Valencia","pais":"España"}'::jsonb, 'F', '2026-08-03', '2026-09-02', '[{"concepto":"Mantenimiento web, CRM de pacientes y cita online · agosto 2026","cantidad":1,"precio":2400,"iva":21}]'::jsonb, 2400, 504, 2904, 'cobrada', '2026-08-17', null, null, marca);
  insert into public.invoices (owner_id, contact_id, origen, cliente, serie, fecha, vencimiento, lineas, base, cuota_iva, total, estado, fecha_cobro, notas, creado_por, ocr) values
    (o, c8, 'app', '{"nombre":"Berliner Datenwerk GmbH","nif":"DE298765431","email":"accounting@datenwerk.example","direccion":"Torstraße 140","cp":"10119","ciudad":"Berlin","provincia":null,"pais":"Alemania"}'::jsonb, 'F', '2026-08-03', '2026-09-02', '[{"concepto":"Software development services · August 2026\nDedicated backend team (data pipelines)","cantidad":1,"precio":5000,"iva":0}]'::jsonb, 5000, 0, 5000, 'cobrada', '2026-08-18', 'Reverse charge: VAT to be accounted for by the recipient (Art. 196 Directive 2006/112/EC). Inversión del sujeto pasivo.', null, marca);
  insert into public.invoices (owner_id, contact_id, origen, cliente, serie, fecha, vencimiento, lineas, base, cuota_iva, total, estado, fecha_cobro, notas, creado_por, ocr) values
    (o, c6, 'app', '{"nombre":"Ágora Pagos Fintech, S.L.","nif":"B28933612","email":"finance@agorapagos.example","direccion":"Calle de Serrano 90","cp":"28006","ciudad":"Madrid","provincia":"Madrid","pais":"España"}'::jsonb, 'F', '2026-08-03', '2026-09-02', '[{"concepto":"Desarrollo del módulo KYC/AML\nVerificación de identidad y alertas de blanqueo","cantidad":1,"precio":21500,"iva":21}]'::jsonb, 21500, 4515, 26015, 'cobrada', '2026-08-10', null, null, marca);
  insert into public.invoices (owner_id, contact_id, origen, cliente, serie, fecha, vencimiento, lineas, base, cuota_iva, total, estado, fecha_cobro, notas, creado_por, ocr) values
    (o, c1, 'app', '{"nombre":"Grupo Hotelero Mediterráneo, S.L.","nif":"B07318421","email":"administracion@ghmediterraneo.example","direccion":"Avinguda Jaume III 12","cp":"07012","ciudad":"Palma","provincia":"Illes Balears","pais":"España"}'::jsonb, 'F', '2026-09-01', '2026-10-01', '[{"concepto":"Mantenimiento evolutivo de la plataforma de reservas · septiembre 2026\nSoporte 24/7, mejoras y hosting gestionado","cantidad":1,"precio":9500,"iva":21}]'::jsonb, 9500, 1995, 11495, 'cobrada', '2026-09-11', null, null, marca);
  insert into public.invoices (owner_id, contact_id, origen, cliente, serie, fecha, vencimiento, lineas, base, cuota_iva, total, estado, fecha_cobro, notas, creado_por, ocr) values
    (o, c2, 'app', '{"nombre":"Logística Ebro Norte, S.A.","nif":"A50662105","email":"cuentas@ebronorte.example","direccion":"Polígono Plaza, calle Bari 33","cp":"50197","ciudad":"Zaragoza","provincia":"Zaragoza","pais":"España"}'::jsonb, 'F', '2026-09-01', '2026-10-01', '[{"concepto":"Soporte y desarrollo de la app de gestión de flotas · septiembre 2026","cantidad":1,"precio":7200,"iva":21}]'::jsonb, 7200, 1512, 8712, 'cobrada', '2026-09-28', null, null, marca);
  insert into public.invoices (owner_id, contact_id, origen, cliente, serie, fecha, vencimiento, lineas, base, cuota_iva, total, estado, fecha_cobro, notas, creado_por, ocr) values
    (o, c6, 'app', '{"nombre":"Ágora Pagos Fintech, S.L.","nif":"B28933612","email":"finance@agorapagos.example","direccion":"Calle de Serrano 90","cp":"28006","ciudad":"Madrid","provincia":"Madrid","pais":"España"}'::jsonb, 'F', '2026-09-01', '2026-10-01', '[{"concepto":"Equipo dedicado de desarrollo · septiembre 2026\n2 perfiles senior a tiempo completo","cantidad":1,"precio":6500,"iva":21}]'::jsonb, 6500, 1365, 7865, 'cobrada', '2026-09-09', null, null, marca);
  insert into public.invoices (owner_id, contact_id, origen, cliente, serie, fecha, vencimiento, lineas, base, cuota_iva, total, estado, fecha_cobro, notas, creado_por, ocr) values
    (o, c3, 'app', '{"nombre":"Clínicas Dentales Sonrisa, S.L.","nif":"B46205738","email":"facturas@clinicasonrisa.example","direccion":"Carrer de Colón 48","cp":"46004","ciudad":"València","provincia":"Valencia","pais":"España"}'::jsonb, 'F', '2026-09-01', '2026-10-01', '[{"concepto":"Mantenimiento web, CRM de pacientes y cita online · septiembre 2026","cantidad":1,"precio":2400,"iva":21}]'::jsonb, 2400, 504, 2904, 'cobrada', '2026-09-11', null, null, marca);
  insert into public.invoices (owner_id, contact_id, origen, cliente, serie, fecha, vencimiento, lineas, base, cuota_iva, total, estado, fecha_cobro, notas, creado_por, ocr) values
    (o, c8, 'app', '{"nombre":"Berliner Datenwerk GmbH","nif":"DE298765431","email":"accounting@datenwerk.example","direccion":"Torstraße 140","cp":"10119","ciudad":"Berlin","provincia":null,"pais":"Alemania"}'::jsonb, 'F', '2026-09-01', '2026-10-01', '[{"concepto":"Software development services · September 2026\nDedicated backend team (data pipelines)","cantidad":1,"precio":5000,"iva":0}]'::jsonb, 5000, 0, 5000, 'cobrada', '2026-09-21', 'Reverse charge: VAT to be accounted for by the recipient (Art. 196 Directive 2006/112/EC). Inversión del sujeto pasivo.', null, marca);
  insert into public.invoices (owner_id, contact_id, origen, cliente, serie, fecha, vencimiento, lineas, base, cuota_iva, total, estado, fecha_cobro, notas, creado_por, ocr) values
    (o, c9, 'app', '{"nombre":"Coastline Ventures LLC","nif":"87-1234567","email":"ap@coastlineventures.example","direccion":"500 Brickell Ave, Suite 1200","cp":"FL 33131","ciudad":"Miami","provincia":null,"pais":"Estados Unidos"}'::jsonb, 'F', '2026-09-07', '2026-10-07', '[{"concepto":"MVP development · Milestone 3\nPublic launch and hand-over","cantidad":1,"precio":18000,"iva":0}]'::jsonb, 18000, 0, 18000, 'cobrada', '2026-10-05', 'Operación no sujeta a IVA (art. 69.Uno.1.º LIVA).', null, marca);
  insert into public.invoices (owner_id, contact_id, origen, cliente, serie, fecha, vencimiento, lineas, base, cuota_iva, total, estado, fecha_cobro, notas, creado_por, ocr) values
    (o, c5, 'app', '{"nombre":"Costa Brava Homes, S.L.","nif":"B17580341","email":"hola@costabravahomes.example","direccion":"Passeig del Mar 21","cp":"17250","ciudad":"Platja d''Aro","provincia":"Girona","pais":"España"}'::jsonb, 'F', '2026-09-14', '2026-10-14', '[{"concepto":"Campaña de SEO técnico (3 meses)","cantidad":3,"precio":1200,"iva":21}]'::jsonb, 3600, 756, 4356, 'cobrada', '2026-09-28', null, 'de300000-0000-4000-8000-000000000104', marca);
  insert into public.invoices (owner_id, contact_id, origen, cliente, serie, fecha, vencimiento, lineas, base, cuota_iva, total, estado, fecha_cobro, notas, creado_por, ocr) values
    (o, c10, 'app', '{"nombre":"Academia Formación Digital, S.L.","nif":"B41702887","email":"admin@formaciondigital.example","direccion":"Avenida de la Constitución 14","cp":"41001","ciudad":"Sevilla","provincia":"Sevilla","pais":"España"}'::jsonb, 'F', '2026-09-21', '2026-10-21', '[{"concepto":"Módulo de evaluaciones y certificados para el LMS","cantidad":1,"precio":6900,"iva":21}]'::jsonb, 6900, 1449, 8349, 'emitida', null, null, 'de300000-0000-4000-8000-000000000104', marca);
  insert into public.invoices (owner_id, contact_id, origen, cliente, serie, fecha, vencimiento, lineas, base, cuota_iva, total, estado, fecha_cobro, notas, creado_por, ocr) values
    (o, c1, 'app', '{"nombre":"Grupo Hotelero Mediterráneo, S.L.","nif":"B07318421","email":"administracion@ghmediterraneo.example","direccion":"Avinguda Jaume III 12","cp":"07012","ciudad":"Palma","provincia":"Illes Balears","pais":"España"}'::jsonb, 'F', '2026-10-01', '2026-10-31', '[{"concepto":"Mantenimiento evolutivo de la plataforma de reservas · octubre 2026\nSoporte 24/7, mejoras y hosting gestionado","cantidad":1,"precio":9500,"iva":21}]'::jsonb, 9500, 1995, 11495, 'cobrada', '2026-10-12', null, null, marca);
  insert into public.invoices (owner_id, contact_id, origen, cliente, serie, fecha, vencimiento, lineas, base, cuota_iva, total, estado, fecha_cobro, notas, creado_por, ocr) values
    (o, c2, 'app', '{"nombre":"Logística Ebro Norte, S.A.","nif":"A50662105","email":"cuentas@ebronorte.example","direccion":"Polígono Plaza, calle Bari 33","cp":"50197","ciudad":"Zaragoza","provincia":"Zaragoza","pais":"España"}'::jsonb, 'F', '2026-10-01', '2026-10-31', '[{"concepto":"Soporte y desarrollo de la app de gestión de flotas · octubre 2026","cantidad":1,"precio":7200,"iva":21}]'::jsonb, 7200, 1512, 8712, 'cobrada', '2026-10-28', null, null, marca);
  insert into public.invoices (owner_id, contact_id, origen, cliente, serie, fecha, vencimiento, lineas, base, cuota_iva, total, estado, fecha_cobro, notas, creado_por, ocr) values
    (o, c6, 'app', '{"nombre":"Ágora Pagos Fintech, S.L.","nif":"B28933612","email":"finance@agorapagos.example","direccion":"Calle de Serrano 90","cp":"28006","ciudad":"Madrid","provincia":"Madrid","pais":"España"}'::jsonb, 'F', '2026-10-01', '2026-10-31', '[{"concepto":"Equipo dedicado de desarrollo · octubre 2026\n2 perfiles senior a tiempo completo","cantidad":1,"precio":6500,"iva":21}]'::jsonb, 6500, 1365, 7865, 'cobrada', '2026-10-12', null, null, marca);
  insert into public.invoices (owner_id, contact_id, origen, cliente, serie, fecha, vencimiento, lineas, base, cuota_iva, total, estado, fecha_cobro, notas, creado_por, ocr) values
    (o, c3, 'app', '{"nombre":"Clínicas Dentales Sonrisa, S.L.","nif":"B46205738","email":"facturas@clinicasonrisa.example","direccion":"Carrer de Colón 48","cp":"46004","ciudad":"València","provincia":"Valencia","pais":"España"}'::jsonb, 'F', '2026-10-01', '2026-10-31', '[{"concepto":"Mantenimiento web, CRM de pacientes y cita online · octubre 2026","cantidad":1,"precio":2400,"iva":21}]'::jsonb, 2400, 504, 2904, 'cobrada', '2026-10-13', null, null, marca);
  insert into public.invoices (owner_id, contact_id, origen, cliente, serie, fecha, vencimiento, lineas, base, cuota_iva, total, estado, fecha_cobro, notas, creado_por, ocr) values
    (o, c8, 'app', '{"nombre":"Berliner Datenwerk GmbH","nif":"DE298765431","email":"accounting@datenwerk.example","direccion":"Torstraße 140","cp":"10119","ciudad":"Berlin","provincia":null,"pais":"Alemania"}'::jsonb, 'F', '2026-10-01', '2026-10-31', '[{"concepto":"Software development services · October 2026\nDedicated backend team (data pipelines)","cantidad":1,"precio":5000,"iva":0}]'::jsonb, 5000, 0, 5000, 'cobrada', '2026-10-19', 'Reverse charge: VAT to be accounted for by the recipient (Art. 196 Directive 2006/112/EC). Inversión del sujeto pasivo.', null, marca);
  insert into public.invoices (owner_id, contact_id, origen, cliente, serie, fecha, vencimiento, lineas, base, cuota_iva, total, estado, fecha_cobro, notas, creado_por, ocr) values
    (o, c7, 'app', '{"nombre":"Moda Sostenible Verde, S.L.","nif":"B48115067","email":"pagos@modaverde.example","direccion":"Alameda de Recalde 27","cp":"48009","ciudad":"Bilbao","provincia":"Bizkaia","pais":"España"}'::jsonb, 'F', '2026-10-05', '2026-11-04', '[{"concepto":"App móvil de fidelización · anticipo 40%\nSegún presupuesto aceptado","cantidad":1,"precio":19600,"iva":21}]'::jsonb, 19600, 4116, 23716, 'cobrada', '2026-10-26', null, 'de300000-0000-4000-8000-000000000104', marca);
  insert into public.invoices (owner_id, contact_id, origen, cliente, serie, fecha, vencimiento, lineas, base, cuota_iva, total, estado, fecha_cobro, notas, creado_por, ocr) values
    (o, c1, 'app', '{"nombre":"Grupo Hotelero Mediterráneo, S.L.","nif":"B07318421","email":"administracion@ghmediterraneo.example","direccion":"Avinguda Jaume III 12","cp":"07012","ciudad":"Palma","provincia":"Illes Balears","pais":"España"}'::jsonb, 'F', '2026-10-19', '2026-11-18', '[{"concepto":"Auditoría de seguridad y rendimiento\nPentest externo y plan de mejoras","cantidad":1,"precio":5400,"iva":21}]'::jsonb, 5400, 1134, 6534, 'cobrada', '2026-10-29', null, null, marca);
  insert into public.invoices (owner_id, contact_id, origen, cliente, serie, fecha, vencimiento, lineas, base, cuota_iva, total, estado, fecha_cobro, notas, creado_por, ocr) values
    (o, c1, 'app', '{"nombre":"Grupo Hotelero Mediterráneo, S.L.","nif":"B07318421","email":"administracion@ghmediterraneo.example","direccion":"Avinguda Jaume III 12","cp":"07012","ciudad":"Palma","provincia":"Illes Balears","pais":"España"}'::jsonb, 'F', '2026-11-02', '2026-12-02', '[{"concepto":"Mantenimiento evolutivo de la plataforma de reservas · noviembre 2026\nSoporte 24/7, mejoras y hosting gestionado","cantidad":1,"precio":9500,"iva":21}]'::jsonb, 9500, 1995, 11495, 'cobrada', '2026-11-12', null, null, marca);
  insert into public.invoices (owner_id, contact_id, origen, cliente, serie, fecha, vencimiento, lineas, base, cuota_iva, total, estado, fecha_cobro, notas, creado_por, ocr) values
    (o, c2, 'app', '{"nombre":"Logística Ebro Norte, S.A.","nif":"A50662105","email":"cuentas@ebronorte.example","direccion":"Polígono Plaza, calle Bari 33","cp":"50197","ciudad":"Zaragoza","provincia":"Zaragoza","pais":"España"}'::jsonb, 'F', '2026-11-02', '2026-12-02', '[{"concepto":"Soporte y desarrollo de la app de gestión de flotas · noviembre 2026","cantidad":1,"precio":7200,"iva":21}]'::jsonb, 7200, 1512, 8712, 'emitida', null, null, null, marca);
  insert into public.invoices (owner_id, contact_id, origen, cliente, serie, fecha, vencimiento, lineas, base, cuota_iva, total, estado, fecha_cobro, notas, creado_por, ocr) values
    (o, c6, 'app', '{"nombre":"Ágora Pagos Fintech, S.L.","nif":"B28933612","email":"finance@agorapagos.example","direccion":"Calle de Serrano 90","cp":"28006","ciudad":"Madrid","provincia":"Madrid","pais":"España"}'::jsonb, 'F', '2026-11-02', '2026-12-02', '[{"concepto":"Equipo dedicado de desarrollo · noviembre 2026\n2 perfiles senior a tiempo completo","cantidad":1,"precio":6500,"iva":21}]'::jsonb, 6500, 1365, 7865, 'cobrada', '2026-11-09', null, null, marca);
  insert into public.invoices (owner_id, contact_id, origen, cliente, serie, fecha, vencimiento, lineas, base, cuota_iva, total, estado, fecha_cobro, notas, creado_por, ocr) values
    (o, c3, 'app', '{"nombre":"Clínicas Dentales Sonrisa, S.L.","nif":"B46205738","email":"facturas@clinicasonrisa.example","direccion":"Carrer de Colón 48","cp":"46004","ciudad":"València","provincia":"Valencia","pais":"España"}'::jsonb, 'F', '2026-11-02', '2026-12-02', '[{"concepto":"Mantenimiento web, CRM de pacientes y cita online · noviembre 2026","cantidad":1,"precio":2400,"iva":21}]'::jsonb, 2400, 504, 2904, 'cobrada', '2026-11-09', null, null, marca);
  insert into public.invoices (owner_id, contact_id, origen, cliente, serie, fecha, vencimiento, lineas, base, cuota_iva, total, estado, fecha_cobro, notas, creado_por, ocr) values
    (o, c8, 'app', '{"nombre":"Berliner Datenwerk GmbH","nif":"DE298765431","email":"accounting@datenwerk.example","direccion":"Torstraße 140","cp":"10119","ciudad":"Berlin","provincia":null,"pais":"Alemania"}'::jsonb, 'F', '2026-11-02', '2026-12-02', '[{"concepto":"Software development services · November 2026\nDedicated backend team (data pipelines)","cantidad":1,"precio":5000,"iva":0}]'::jsonb, 5000, 0, 5000, 'cobrada', '2026-11-23', 'Reverse charge: VAT to be accounted for by the recipient (Art. 196 Directive 2006/112/EC). Inversión del sujeto pasivo.', null, marca);
  insert into public.invoices (owner_id, contact_id, origen, cliente, serie, fecha, vencimiento, lineas, base, cuota_iva, total, estado, fecha_cobro, notas, creado_por, ocr) values
    (o, c7, 'app', '{"nombre":"Moda Sostenible Verde, S.L.","nif":"B48115067","email":"pagos@modaverde.example","direccion":"Alameda de Recalde 27","cp":"48009","ciudad":"Bilbao","provincia":"Bizkaia","pais":"España"}'::jsonb, 'F', '2026-11-16', '2026-12-16', '[{"concepto":"App móvil de fidelización · entrega intermedia 30%","cantidad":1,"precio":14700,"iva":21}]'::jsonb, 14700, 3087, 17787, 'emitida', null, null, 'de300000-0000-4000-8000-000000000104', marca);

  -- ---------------------------------------------------------- Gastos (revisados y pagados)
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-01-01', 'Inversiones Diagonal 2010, S.L.', 'B08622912', 'ALQ-2026-01', 'Alquiler de la oficina · enero', 'alquiler', 3200, 21, 672, 19, 608, 3872, 'revisado', true, '2026-01-01', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-01-02', 'Google Cloud EMEA Ltd', null, 'GWS-1005', 'Google Workspace (12 usuarios) · enero', 'software', 168, 0, 0, null, 0, 168, 'revisado', true, '2026-01-02', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-01-05', 'Amazon Web Services EMEA SARL', null, 'EUINES26-1004', 'Servidores y bases de datos (AWS) · enero', 'software', 1733, 0, 0, null, 0, 1733, 'revisado', true, '2026-01-05', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-01-05', 'Figma, Inc. · GitHub, Inc. · Slack Technologies', null, 'SAAS-1006', 'Licencias de diseño y desarrollo · enero', 'software', 412, 0, 0, null, 0, 412, 'revisado', true, '2026-01-05', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-01-06', 'Energía Clara Comercializadora, S.L.', 'B28409175', 'F-1001', 'Electricidad oficina · enero', 'suministros', 322.15, 21, 67.65, null, 0, 389.8, 'revisado', true, '2026-01-06', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-01-09', 'Telecom Barcelona Empresas, S.A.', 'A08155285', 'F-1002', 'Fibra 1 Gb y 6 líneas móviles · enero', 'suministros', 189.5, 21, 39.8, null, 0, 229.3, 'revisado', true, '2026-01-09', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-01-12', 'Mutua de Seguros Profesionales', 'G28118735', 'F-1102', 'Seguro de responsabilidad civil profesional 2026', 'seguros', 1850, 0, 0, null, 0, 1850, 'revisado', true, '2026-01-12', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-01-15', 'Apple Distribution International', null, 'F-1122', '6 portátiles MacBook Pro 14"', 'material', 17394, 21, 3652.74, null, 0, 21046.74, 'revisado', true, '2026-01-15', 'inversion', 'inmovilizado', marca) returning id into x;
  insert into public.inmovilizados (owner_id, expense_id, nombre, tipo, cuenta, cuenta_amortizacion, valor, fecha_inicio, coeficiente) values
    (o, x, '6 portátiles MacBook Pro 14"', 'equipos_informaticos', '217', '2817', 17394, '2026-01-15', 25);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-01-27', 'Renfe Viajeros, S.M.E., S.A.', null, 'T-1110', 'Tren Barcelona–Zaragoza ida y vuelta (2 personas) · reunión Ebro Norte', 'viajes', 186.2, 10, 18.62, null, 0, 204.82, 'revisado', true, '2026-01-27', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-01-30', 'Netejes Eixample, S.L.', 'B08255762', 'F-1003', 'Limpieza de la oficina · enero', 'otros', 420, 21, 88.2, null, 0, 508.2, 'revisado', true, '2026-01-30', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-01-30', 'Google Ireland Ltd (Google Ads)', null, 'ADS-1007', 'Campañas de Google Ads · enero', 'publicidad', 1818, 0, 0, null, 0, 1818, 'revisado', true, '2026-01-30', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-01-30', 'LinkedIn Ireland Unlimited Company', null, 'LI-1008', 'Publicidad en LinkedIn · enero', 'publicidad', 717, 0, 0, null, 0, 717, 'revisado', true, '2026-01-30', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-01-30', 'CaixaBank, S.A.', null, 'COM-1009', 'Comisiones de mantenimiento y transferencias · enero', 'bancos', 44, 0, 0, null, 0, 44, 'revisado', true, '2026-01-30', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-01-30', 'Laura Méndez Ruiz (diseño UX freelance)', '47120583T', 'LM-01/26', 'Diseño de interfaces · enero', 'profesionales', 2500, 21, 525, 15, 375, 3025, 'revisado', true, '2026-02-04', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-02-02', 'Inversiones Diagonal 2010, S.L.', 'B08622912', 'ALQ-2026-02', 'Alquiler de la oficina · febrero', 'alquiler', 3200, 21, 672, 19, 608, 3872, 'revisado', true, '2026-02-02', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-02-02', 'Google Cloud EMEA Ltd', null, 'GWS-1014', 'Google Workspace (12 usuarios) · febrero', 'software', 168, 0, 0, null, 0, 168, 'revisado', true, '2026-02-02', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-02-03', 'Amazon Web Services EMEA SARL', null, 'EUINES26-1013', 'Servidores y bases de datos (AWS) · febrero', 'software', 1914, 0, 0, null, 0, 1914, 'revisado', true, '2026-02-03', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-02-04', 'Tienda de informática PcBox Gràcia', 'B08704157', 'F-1108', '2 monitores 27" para puestos nuevos', 'material', 578, 21, 121.38, null, 0, 699.38, 'revisado', true, '2026-02-04', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-02-05', 'Figma, Inc. · GitHub, Inc. · Slack Technologies', null, 'SAAS-1015', 'Licencias de diseño y desarrollo · febrero', 'software', 412, 0, 0, null, 0, 412, 'revisado', true, '2026-02-05', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-02-06', 'Energía Clara Comercializadora, S.L.', 'B28409175', 'F-1010', 'Electricidad oficina · febrero', 'suministros', 268.04, 21, 56.29, null, 0, 324.33, 'revisado', true, '2026-02-06', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-02-09', 'Telecom Barcelona Empresas, S.A.', 'A08155285', 'F-1011', 'Fibra 1 Gb y 6 líneas móviles · febrero', 'suministros', 189.5, 21, 39.8, null, 0, 229.3, 'revisado', true, '2026-02-09', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-02-10', 'Mobiliario de Oficina Actiu Barcelona, S.L.', 'B08441206', 'F-1123', 'Mesas, sillas ergonómicas y armarios para 12 puestos', 'material', 8640, 21, 1814.4, null, 0, 10454.4, 'revisado', true, '2026-02-10', 'inversion', 'inmovilizado', marca) returning id into x;
  insert into public.inmovilizados (owner_id, expense_id, nombre, tipo, cuenta, cuenta_amortizacion, valor, fecha_inicio, coeficiente) values
    (o, x, 'Mesas, sillas ergonómicas y armarios para 12 puestos', 'mobiliario', '216', '2816', 8640, '2026-02-10', 10);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-02-18', 'Vueling Airlines, S.A.', null, 'T-1111', 'Vuelos Barcelona–Palma · kick-off Grupo Hotelero', 'viajes', 248.6, 10, 24.86, null, 0, 273.46, 'revisado', true, '2026-02-18', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-02-18', 'Hotel Born Palma', null, 'T-1112', 'Alojamiento 2 noches (2 personas)', 'viajes', 312, 10, 31.2, null, 0, 343.2, 'revisado', true, '2026-02-18', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-02-23', 'Formación Cloud Academy, S.L.', 'B28512622', 'F-1106', 'Certificación AWS Solutions Architect (3 personas)', 'formacion', 1200, 21, 252, null, 0, 1452, 'revisado', true, '2026-02-23', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-02-27', 'Netejes Eixample, S.L.', 'B08255762', 'F-1012', 'Limpieza de la oficina · febrero', 'otros', 420, 21, 88.2, null, 0, 508.2, 'revisado', true, '2026-02-27', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-02-27', 'Google Ireland Ltd (Google Ads)', null, 'ADS-1016', 'Campañas de Google Ads · febrero', 'publicidad', 1913, 0, 0, null, 0, 1913, 'revisado', true, '2026-02-27', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-02-27', 'LinkedIn Ireland Unlimited Company', null, 'LI-1017', 'Publicidad en LinkedIn · febrero', 'publicidad', 717, 0, 0, null, 0, 717, 'revisado', true, '2026-02-27', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-02-27', 'CaixaBank, S.A.', null, 'COM-1018', 'Comisiones de mantenimiento y transferencias · febrero', 'bancos', 54, 0, 0, null, 0, 54, 'revisado', true, '2026-02-27', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-02-27', 'Laura Méndez Ruiz (diseño UX freelance)', '47120583T', 'LM-02/26', 'Diseño de interfaces · febrero', 'profesionales', 2500, 21, 525, 15, 375, 3025, 'revisado', true, '2026-03-04', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-03-02', 'Inversiones Diagonal 2010, S.L.', 'B08622912', 'ALQ-2026-03', 'Alquiler de la oficina · marzo', 'alquiler', 3200, 21, 672, 19, 608, 3872, 'revisado', true, '2026-03-02', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-03-02', 'Google Cloud EMEA Ltd', null, 'GWS-1023', 'Google Workspace (12 usuarios) · marzo', 'software', 168, 0, 0, null, 0, 168, 'revisado', true, '2026-03-02', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-03-02', 'Mutua de Seguros Profesionales', 'G28118735', 'F-1103', 'Seguro multirriesgo de la oficina 2026', 'seguros', 640, 0, 0, null, 0, 640, 'revisado', true, '2026-03-02', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-03-03', 'Amazon Web Services EMEA SARL', null, 'EUINES26-1022', 'Servidores y bases de datos (AWS) · marzo', 'software', 1968, 0, 0, null, 0, 1968, 'revisado', true, '2026-03-03', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-03-03', 'Reformas Integrals Eixample, S.L.', 'B08578361', 'F-1124', 'Reforma de la oficina: tabiquería, iluminación y climatización', 'material', 24500, 21, 5145, null, 0, 29645, 'revisado', true, '2026-03-03', 'inversion', 'inmovilizado', marca) returning id into x;
  insert into public.inmovilizados (owner_id, expense_id, nombre, tipo, cuenta, cuenta_amortizacion, valor, fecha_inicio, coeficiente) values
    (o, x, 'Reforma de la oficina: tabiquería, iluminación y climatización', 'instalaciones', '215', '2815', 24500, '2026-03-03', 10);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-03-05', 'Figma, Inc. · GitHub, Inc. · Slack Technologies', null, 'SAAS-1024', 'Licencias de diseño y desarrollo · marzo', 'software', 412, 0, 0, null, 0, 412, 'revisado', true, '2026-03-05', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-03-06', 'Energía Clara Comercializadora, S.L.', 'B28409175', 'F-1019', 'Electricidad oficina · marzo', 'suministros', 261.01, 21, 54.81, null, 0, 315.82, 'revisado', true, '2026-03-06', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-03-09', 'Telecom Barcelona Empresas, S.A.', 'A08155285', 'F-1020', 'Fibra 1 Gb y 6 líneas móviles · marzo', 'suministros', 189.5, 21, 39.8, null, 0, 229.3, 'revisado', true, '2026-03-09', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-03-11', 'Renfe Viajeros, S.M.E., S.A.', null, 'T-1113', 'Tren Barcelona–Madrid · reunión Ágora Pagos', 'viajes', 174.4, 10, 17.44, null, 0, 191.84, 'revisado', true, '2026-03-11', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-03-18', 'Notaría Rius i Planas', '38411927H', 'F-1109', 'Elevación a público de acuerdos sociales', 'profesionales', 310, 21, 65.1, null, 0, 375.1, 'revisado', true, '2026-03-18', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-03-27', 'Kódigo Studio, S.L.', 'B46331906', 'F-1099', 'Subcontratación desarrollo móvil · MVP Coastline (hito 1)', 'profesionales', 8500, 21, 1785, null, 0, 10285, 'revisado', true, '2026-03-27', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-03-31', 'Netejes Eixample, S.L.', 'B08255762', 'F-1021', 'Limpieza de la oficina · marzo', 'otros', 420, 21, 88.2, null, 0, 508.2, 'revisado', true, '2026-03-31', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-03-31', 'Google Ireland Ltd (Google Ads)', null, 'ADS-1025', 'Campañas de Google Ads · marzo', 'publicidad', 1562, 0, 0, null, 0, 1562, 'revisado', true, '2026-03-31', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-03-31', 'LinkedIn Ireland Unlimited Company', null, 'LI-1026', 'Publicidad en LinkedIn · marzo', 'publicidad', 945, 0, 0, null, 0, 945, 'revisado', true, '2026-03-31', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-03-31', 'CaixaBank, S.A.', null, 'COM-1027', 'Comisiones de mantenimiento y transferencias · marzo', 'bancos', 45, 0, 0, null, 0, 45, 'revisado', true, '2026-03-31', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-03-31', 'Laura Méndez Ruiz (diseño UX freelance)', '47120583T', 'LM-03/26', 'Diseño de interfaces · marzo', 'profesionales', 2500, 21, 525, 15, 375, 3025, 'revisado', true, '2026-04-06', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-03-31', 'Serra & Associats Advocats, S.L.P.', 'B08803447', 'F-1028', 'Asesoramiento jurídico (contratos y protección de datos) · 1T', 'profesionales', 1450, 21, 304.5, 15, 217.5, 1754.5, 'revisado', true, '2026-03-31', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-04-01', 'Inversiones Diagonal 2010, S.L.', 'B08622912', 'ALQ-2026-04', 'Alquiler de la oficina · abril', 'alquiler', 3200, 21, 672, 19, 608, 3872, 'revisado', true, '2026-04-01', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-04-01', 'Software ERP a medida · Kódigo Studio, S.L.', 'B46331906', 'F-1125', 'Licencia perpetua del ERP interno (gestión de proyectos y horas)', 'material', 12000, 21, 2520, null, 0, 14520, 'revisado', true, '2026-04-01', 'inversion', 'inmovilizado', marca) returning id into x;
  insert into public.inmovilizados (owner_id, expense_id, nombre, tipo, cuenta, cuenta_amortizacion, valor, fecha_inicio, coeficiente) values
    (o, x, 'Licencia perpetua del ERP interno (gestión de proyectos y horas)', 'aplicaciones', '206', '2806', 12000, '2026-04-01', 33);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-04-02', 'Google Cloud EMEA Ltd', null, 'GWS-1033', 'Google Workspace (12 usuarios) · abril', 'software', 168, 0, 0, null, 0, 168, 'revisado', true, '2026-04-02', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-04-03', 'Amazon Web Services EMEA SARL', null, 'EUINES26-1032', 'Servidores y bases de datos (AWS) · abril', 'software', 2093, 0, 0, null, 0, 2093, 'revisado', true, '2026-04-03', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-04-06', 'Energía Clara Comercializadora, S.L.', 'B28409175', 'F-1029', 'Electricidad oficina · abril', 'suministros', 260.37, 21, 54.68, null, 0, 315.05, 'revisado', true, '2026-04-06', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-04-06', 'Figma, Inc. · GitHub, Inc. · Slack Technologies', null, 'SAAS-1034', 'Licencias de diseño y desarrollo · abril', 'software', 412, 0, 0, null, 0, 412, 'revisado', true, '2026-04-06', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-04-09', 'Telecom Barcelona Empresas, S.A.', 'A08155285', 'F-1030', 'Fibra 1 Gb y 6 líneas móviles · abril', 'suministros', 189.5, 21, 39.8, null, 0, 229.3, 'revisado', true, '2026-04-09', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-04-22', 'Restaurant Can Culleretes', null, 'T-1114', 'Comida con cliente (Bodegas Alt Penedès)', 'viajes', 128.5, 10, 12.85, null, 0, 141.35, 'revisado', true, '2026-04-22', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-04-27', 'Imprenta Gràfiques Gràcia, S.L.', 'B08399511', 'F-1105', 'Material para la feria: roll-ups y tarjetas', 'publicidad', 685, 21, 143.85, null, 0, 828.85, 'revisado', true, '2026-04-27', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-04-30', 'Netejes Eixample, S.L.', 'B08255762', 'F-1031', 'Limpieza de la oficina · abril', 'otros', 420, 21, 88.2, null, 0, 508.2, 'revisado', true, '2026-04-30', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-04-30', 'Google Ireland Ltd (Google Ads)', null, 'ADS-1035', 'Campañas de Google Ads · abril', 'publicidad', 1385, 0, 0, null, 0, 1385, 'revisado', true, '2026-04-30', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-04-30', 'LinkedIn Ireland Unlimited Company', null, 'LI-1036', 'Publicidad en LinkedIn · abril', 'publicidad', 736, 0, 0, null, 0, 736, 'revisado', true, '2026-04-30', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-04-30', 'CaixaBank, S.A.', null, 'COM-1037', 'Comisiones de mantenimiento y transferencias · abril', 'bancos', 41, 0, 0, null, 0, 41, 'revisado', true, '2026-04-30', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-04-30', 'Laura Méndez Ruiz (diseño UX freelance)', '47120583T', 'LM-04/26', 'Diseño de interfaces · abril', 'profesionales', 2500, 21, 525, 15, 375, 3025, 'revisado', true, '2026-05-05', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-05-01', 'Inversiones Diagonal 2010, S.L.', 'B08622912', 'ALQ-2026-05', 'Alquiler de la oficina · mayo', 'alquiler', 3200, 21, 672, 19, 608, 3872, 'revisado', true, '2026-05-01', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-05-04', 'Amazon Web Services EMEA SARL', null, 'EUINES26-1041', 'Servidores y bases de datos (AWS) · mayo', 'software', 2001, 0, 0, null, 0, 2001, 'revisado', true, '2026-05-04', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-05-04', 'Google Cloud EMEA Ltd', null, 'GWS-1042', 'Google Workspace (12 usuarios) · mayo', 'software', 168, 0, 0, null, 0, 168, 'revisado', true, '2026-05-04', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-05-04', 'Fira de Barcelona', 'Q08730046', 'F-1104', 'Stand en feria tecnológica (4YFN)', 'publicidad', 4500, 21, 945, null, 0, 5445, 'revisado', true, '2026-05-04', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-05-05', 'Figma, Inc. · GitHub, Inc. · Slack Technologies', null, 'SAAS-1043', 'Licencias de diseño y desarrollo · mayo', 'software', 412, 0, 0, null, 0, 412, 'revisado', true, '2026-05-05', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-05-06', 'Energía Clara Comercializadora, S.L.', 'B28409175', 'F-1038', 'Electricidad oficina · mayo', 'suministros', 306.52, 21, 64.37, null, 0, 370.89, 'revisado', true, '2026-05-06', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-05-06', 'Lufthansa', null, 'T-1115', 'Vuelos Barcelona–Berlín · onboarding Datenwerk', 'viajes', 386.9, 0, 0, null, 0, 386.9, 'revisado', true, '2026-05-06', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-05-06', 'Hotel Mitte Berlin', null, 'T-1116', 'Alojamiento 3 noches', 'viajes', 465, 0, 0, null, 0, 465, 'revisado', true, '2026-05-06', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-05-11', 'Telecom Barcelona Empresas, S.A.', 'A08155285', 'F-1039', 'Fibra 1 Gb y 6 líneas móviles · mayo', 'suministros', 189.5, 21, 39.8, null, 0, 229.3, 'revisado', true, '2026-05-11', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-05-12', 'Sistemas y Redes Mediterráneo, S.L.', 'B08667024', 'F-1126', 'Servidor local, cortafuegos y red wifi de la oficina', 'material', 7800, 21, 1638, null, 0, 9438, 'revisado', true, '2026-05-12', 'inversion', 'inmovilizado', marca) returning id into x;
  insert into public.inmovilizados (owner_id, expense_id, nombre, tipo, cuenta, cuenta_amortizacion, valor, fecha_inicio, coeficiente) values
    (o, x, 'Servidor local, cortafuegos y red wifi de la oficina', 'equipos_informaticos', '217', '2817', 7800, '2026-05-12', 25);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-05-29', 'Netejes Eixample, S.L.', 'B08255762', 'F-1040', 'Limpieza de la oficina · mayo', 'otros', 420, 21, 88.2, null, 0, 508.2, 'revisado', true, '2026-05-29', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-05-29', 'Google Ireland Ltd (Google Ads)', null, 'ADS-1044', 'Campañas de Google Ads · mayo', 'publicidad', 1955, 0, 0, null, 0, 1955, 'revisado', true, '2026-05-29', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-05-29', 'LinkedIn Ireland Unlimited Company', null, 'LI-1045', 'Publicidad en LinkedIn · mayo', 'publicidad', 866, 0, 0, null, 0, 866, 'revisado', true, '2026-05-29', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-05-29', 'CaixaBank, S.A.', null, 'COM-1046', 'Comisiones de mantenimiento y transferencias · mayo', 'bancos', 42, 0, 0, null, 0, 42, 'revisado', true, '2026-05-29', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-05-29', 'Laura Méndez Ruiz (diseño UX freelance)', '47120583T', 'LM-05/26', 'Diseño de interfaces · mayo', 'profesionales', 2500, 21, 525, 15, 375, 3025, 'revisado', true, '2026-06-03', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-06-01', 'Inversiones Diagonal 2010, S.L.', 'B08622912', 'ALQ-2026-06', 'Alquiler de la oficina · junio', 'alquiler', 3200, 21, 672, 19, 608, 3872, 'revisado', true, '2026-06-01', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-06-02', 'Google Cloud EMEA Ltd', null, 'GWS-1051', 'Google Workspace (12 usuarios) · junio', 'software', 168, 0, 0, null, 0, 168, 'revisado', true, '2026-06-02', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-06-03', 'Amazon Web Services EMEA SARL', null, 'EUINES26-1050', 'Servidores y bases de datos (AWS) · junio', 'software', 2206, 0, 0, null, 0, 2206, 'revisado', true, '2026-06-03', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-06-05', 'Figma, Inc. · GitHub, Inc. · Slack Technologies', null, 'SAAS-1052', 'Licencias de diseño y desarrollo · junio', 'software', 412, 0, 0, null, 0, 412, 'revisado', true, '2026-06-05', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-06-08', 'Energía Clara Comercializadora, S.L.', 'B28409175', 'F-1047', 'Electricidad oficina · junio', 'suministros', 287.2, 21, 60.31, null, 0, 347.51, 'revisado', true, '2026-06-08', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-06-09', 'Telecom Barcelona Empresas, S.A.', 'A08155285', 'F-1048', 'Fibra 1 Gb y 6 líneas móviles · junio', 'suministros', 189.5, 21, 39.8, null, 0, 229.3, 'revisado', true, '2026-06-09', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-06-15', 'Ajuntament de Barcelona', 'P0801900B', 'F-1107', 'Tasa de recogida de residuos comerciales', 'tributos', 318, 0, 0, null, 0, 318, 'revisado', true, '2026-06-15', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-06-17', 'Iberia L.A.E., S.A.', null, 'T-1117', 'Vuelo Barcelona–Miami · entrega hito 2 Coastline', 'viajes', 1240, 0, 0, null, 0, 1240, 'revisado', true, '2026-06-17', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-06-26', 'Kódigo Studio, S.L.', 'B46331906', 'F-1100', 'Subcontratación desarrollo móvil · MVP Coastline (hito 2)', 'profesionales', 8500, 21, 1785, null, 0, 10285, 'revisado', true, '2026-06-26', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-06-30', 'Netejes Eixample, S.L.', 'B08255762', 'F-1049', 'Limpieza de la oficina · junio', 'otros', 420, 21, 88.2, null, 0, 508.2, 'revisado', true, '2026-06-30', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-06-30', 'Google Ireland Ltd (Google Ads)', null, 'ADS-1053', 'Campañas de Google Ads · junio', 'publicidad', 1602, 0, 0, null, 0, 1602, 'revisado', true, '2026-06-30', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-06-30', 'LinkedIn Ireland Unlimited Company', null, 'LI-1054', 'Publicidad en LinkedIn · junio', 'publicidad', 792, 0, 0, null, 0, 792, 'revisado', true, '2026-06-30', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-06-30', 'CaixaBank, S.A.', null, 'COM-1055', 'Comisiones de mantenimiento y transferencias · junio', 'bancos', 46, 0, 0, null, 0, 46, 'revisado', true, '2026-06-30', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-06-30', 'Laura Méndez Ruiz (diseño UX freelance)', '47120583T', 'LM-06/26', 'Diseño de interfaces · junio', 'profesionales', 2500, 21, 525, 15, 375, 3025, 'revisado', true, '2026-07-06', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-06-30', 'Serra & Associats Advocats, S.L.P.', 'B08803447', 'F-1056', 'Asesoramiento jurídico (contratos y protección de datos) · 2T', 'profesionales', 1450, 21, 304.5, 15, 217.5, 1754.5, 'revisado', true, '2026-06-30', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-07-01', 'Inversiones Diagonal 2010, S.L.', 'B08622912', 'ALQ-2026-07', 'Alquiler de la oficina · julio', 'alquiler', 3200, 21, 672, 19, 608, 3872, 'revisado', true, '2026-07-01', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-07-02', 'Google Cloud EMEA Ltd', null, 'GWS-1061', 'Google Workspace (12 usuarios) · julio', 'software', 168, 0, 0, null, 0, 168, 'revisado', true, '2026-07-02', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-07-03', 'Amazon Web Services EMEA SARL', null, 'EUINES26-1060', 'Servidores y bases de datos (AWS) · julio', 'software', 2233, 0, 0, null, 0, 2233, 'revisado', true, '2026-07-03', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-07-06', 'Energía Clara Comercializadora, S.L.', 'B28409175', 'F-1057', 'Electricidad oficina · julio', 'suministros', 356.27, 21, 74.82, null, 0, 431.09, 'revisado', true, '2026-07-06', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-07-06', 'Figma, Inc. · GitHub, Inc. · Slack Technologies', null, 'SAAS-1062', 'Licencias de diseño y desarrollo · julio', 'software', 412, 0, 0, null, 0, 412, 'revisado', true, '2026-07-06', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-07-09', 'Telecom Barcelona Empresas, S.A.', 'A08155285', 'F-1058', 'Fibra 1 Gb y 6 líneas móviles · julio', 'suministros', 189.5, 21, 39.8, null, 0, 229.3, 'revisado', true, '2026-07-09', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-07-09', 'Renfe Viajeros, S.M.E., S.A.', null, 'T-1118', 'Tren Barcelona–Bilbao · revisión checkout Moda Verde', 'viajes', 212.8, 10, 21.28, null, 0, 234.08, 'revisado', true, '2026-07-09', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-07-31', 'Netejes Eixample, S.L.', 'B08255762', 'F-1059', 'Limpieza de la oficina · julio', 'otros', 420, 21, 88.2, null, 0, 508.2, 'revisado', true, '2026-07-31', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-07-31', 'Google Ireland Ltd (Google Ads)', null, 'ADS-1063', 'Campañas de Google Ads · julio', 'publicidad', 1471, 0, 0, null, 0, 1471, 'revisado', true, '2026-07-31', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-07-31', 'LinkedIn Ireland Unlimited Company', null, 'LI-1064', 'Publicidad en LinkedIn · julio', 'publicidad', 868, 0, 0, null, 0, 868, 'revisado', true, '2026-07-31', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-07-31', 'CaixaBank, S.A.', null, 'COM-1065', 'Comisiones de mantenimiento y transferencias · julio', 'bancos', 45, 0, 0, null, 0, 45, 'revisado', true, '2026-07-31', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-07-31', 'Laura Méndez Ruiz (diseño UX freelance)', '47120583T', 'LM-07/26', 'Diseño de interfaces · julio', 'profesionales', 2500, 21, 525, 15, 375, 3025, 'revisado', true, '2026-08-05', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-08-03', 'Inversiones Diagonal 2010, S.L.', 'B08622912', 'ALQ-2026-08', 'Alquiler de la oficina · agosto', 'alquiler', 3200, 21, 672, 19, 608, 3872, 'revisado', true, '2026-08-03', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-08-03', 'Amazon Web Services EMEA SARL', null, 'EUINES26-1069', 'Servidores y bases de datos (AWS) · agosto', 'software', 2380, 0, 0, null, 0, 2380, 'revisado', true, '2026-08-03', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-08-03', 'Google Cloud EMEA Ltd', null, 'GWS-1070', 'Google Workspace (12 usuarios) · agosto', 'software', 168, 0, 0, null, 0, 168, 'revisado', true, '2026-08-03', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-08-05', 'Figma, Inc. · GitHub, Inc. · Slack Technologies', null, 'SAAS-1071', 'Licencias de diseño y desarrollo · agosto', 'software', 412, 0, 0, null, 0, 412, 'revisado', true, '2026-08-05', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-08-06', 'Energía Clara Comercializadora, S.L.', 'B28409175', 'F-1066', 'Electricidad oficina · agosto', 'suministros', 299.97, 21, 62.99, null, 0, 362.96, 'revisado', true, '2026-08-06', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-08-10', 'Telecom Barcelona Empresas, S.A.', 'A08155285', 'F-1067', 'Fibra 1 Gb y 6 líneas móviles · agosto', 'suministros', 189.5, 21, 39.8, null, 0, 229.3, 'revisado', true, '2026-08-10', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-08-31', 'Netejes Eixample, S.L.', 'B08255762', 'F-1068', 'Limpieza de la oficina · agosto', 'otros', 420, 21, 88.2, null, 0, 508.2, 'revisado', true, '2026-08-31', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-08-31', 'Google Ireland Ltd (Google Ads)', null, 'ADS-1072', 'Campañas de Google Ads · agosto', 'publicidad', 1513, 0, 0, null, 0, 1513, 'revisado', true, '2026-08-31', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-08-31', 'LinkedIn Ireland Unlimited Company', null, 'LI-1073', 'Publicidad en LinkedIn · agosto', 'publicidad', 682, 0, 0, null, 0, 682, 'revisado', true, '2026-08-31', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-08-31', 'CaixaBank, S.A.', null, 'COM-1074', 'Comisiones de mantenimiento y transferencias · agosto', 'bancos', 48, 0, 0, null, 0, 48, 'revisado', true, '2026-08-31', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-08-31', 'Laura Méndez Ruiz (diseño UX freelance)', '47120583T', 'LM-08/26', 'Diseño de interfaces · agosto', 'profesionales', 2500, 21, 525, 15, 375, 3025, 'revisado', true, '2026-09-07', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-09-01', 'Inversiones Diagonal 2010, S.L.', 'B08622912', 'ALQ-2026-09', 'Alquiler de la oficina · septiembre', 'alquiler', 3200, 21, 672, 19, 608, 3872, 'revisado', true, '2026-09-01', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-09-02', 'Google Cloud EMEA Ltd', null, 'GWS-1079', 'Google Workspace (12 usuarios) · septiembre', 'software', 168, 0, 0, null, 0, 168, 'revisado', true, '2026-09-02', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-09-03', 'Amazon Web Services EMEA SARL', null, 'EUINES26-1078', 'Servidores y bases de datos (AWS) · septiembre', 'software', 2287, 0, 0, null, 0, 2287, 'revisado', true, '2026-09-03', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-09-07', 'Energía Clara Comercializadora, S.L.', 'B28409175', 'F-1075', 'Electricidad oficina · septiembre', 'suministros', 311.43, 21, 65.4, null, 0, 376.83, 'revisado', true, '2026-09-07', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-09-07', 'Figma, Inc. · GitHub, Inc. · Slack Technologies', null, 'SAAS-1080', 'Licencias de diseño y desarrollo · septiembre', 'software', 412, 0, 0, null, 0, 412, 'revisado', true, '2026-09-07', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-09-08', 'Audiovisuales Pro BCN, S.L.', 'B08190555', 'F-1127', 'Sala de reuniones: pantalla 85", cámara y sistema de videoconferencia', 'material', 5400, 21, 1134, null, 0, 6534, 'revisado', true, '2026-09-08', 'inversion', 'inmovilizado', marca) returning id into x;
  insert into public.inmovilizados (owner_id, expense_id, nombre, tipo, cuenta, cuenta_amortizacion, valor, fecha_inicio, coeficiente) values
    (o, x, 'Sala de reuniones: pantalla 85", cámara y sistema de videoconferencia', 'otro', '219', '2819', 5400, '2026-09-08', 10);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-09-09', 'Telecom Barcelona Empresas, S.A.', 'A08155285', 'F-1076', 'Fibra 1 Gb y 6 líneas móviles · septiembre', 'suministros', 189.5, 21, 39.8, null, 0, 229.3, 'revisado', true, '2026-09-09', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-09-24', 'Restaurant 7 Portes', null, 'T-1119', 'Comida de equipo (cierre de trimestre)', 'viajes', 342, 10, 34.2, null, 0, 376.2, 'revisado', true, '2026-09-24', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-09-30', 'Netejes Eixample, S.L.', 'B08255762', 'F-1077', 'Limpieza de la oficina · septiembre', 'otros', 420, 21, 88.2, null, 0, 508.2, 'revisado', true, '2026-09-30', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-09-30', 'Google Ireland Ltd (Google Ads)', null, 'ADS-1081', 'Campañas de Google Ads · septiembre', 'publicidad', 1308, 0, 0, null, 0, 1308, 'revisado', true, '2026-09-30', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-09-30', 'LinkedIn Ireland Unlimited Company', null, 'LI-1082', 'Publicidad en LinkedIn · septiembre', 'publicidad', 762, 0, 0, null, 0, 762, 'revisado', true, '2026-09-30', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-09-30', 'CaixaBank, S.A.', null, 'COM-1083', 'Comisiones de mantenimiento y transferencias · septiembre', 'bancos', 57, 0, 0, null, 0, 57, 'revisado', true, '2026-09-30', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-09-30', 'Laura Méndez Ruiz (diseño UX freelance)', '47120583T', 'LM-09/26', 'Diseño de interfaces · septiembre', 'profesionales', 2500, 21, 525, 15, 375, 3025, 'revisado', true, '2026-10-05', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-09-30', 'Serra & Associats Advocats, S.L.P.', 'B08803447', 'F-1084', 'Asesoramiento jurídico (contratos y protección de datos) · 3T', 'profesionales', 1450, 21, 304.5, 15, 217.5, 1754.5, 'revisado', true, '2026-09-30', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-10-01', 'Inversiones Diagonal 2010, S.L.', 'B08622912', 'ALQ-2026-10', 'Alquiler de la oficina · octubre', 'alquiler', 3200, 21, 672, 19, 608, 3872, 'revisado', true, '2026-10-01', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-10-02', 'Google Cloud EMEA Ltd', null, 'GWS-1089', 'Google Workspace (12 usuarios) · octubre', 'software', 168, 0, 0, null, 0, 168, 'revisado', true, '2026-10-02', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-10-05', 'Amazon Web Services EMEA SARL', null, 'EUINES26-1088', 'Servidores y bases de datos (AWS) · octubre', 'software', 2514, 0, 0, null, 0, 2514, 'revisado', true, '2026-10-05', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-10-05', 'Figma, Inc. · GitHub, Inc. · Slack Technologies', null, 'SAAS-1090', 'Licencias de diseño y desarrollo · octubre', 'software', 412, 0, 0, null, 0, 412, 'revisado', true, '2026-10-05', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-10-06', 'Energía Clara Comercializadora, S.L.', 'B28409175', 'F-1085', 'Electricidad oficina · octubre', 'suministros', 347.94, 21, 73.07, null, 0, 421.01, 'revisado', true, '2026-10-06', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-10-09', 'Telecom Barcelona Empresas, S.A.', 'A08155285', 'F-1086', 'Fibra 1 Gb y 6 líneas móviles · octubre', 'suministros', 189.5, 21, 39.8, null, 0, 229.3, 'revisado', true, '2026-10-09', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-10-14', 'Vueling Airlines, S.A.', null, 'T-1120', 'Vuelos Barcelona–Sevilla · Academia Formación Digital', 'viajes', 156.3, 10, 15.63, null, 0, 171.93, 'revisado', true, '2026-10-14', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-10-23', 'Kódigo Studio, S.L.', 'B46331906', 'F-1101', 'Subcontratación desarrollo app de fidelización', 'profesionales', 9800, 21, 2058, null, 0, 11858, 'revisado', true, '2026-10-23', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-10-30', 'Netejes Eixample, S.L.', 'B08255762', 'F-1087', 'Limpieza de la oficina · octubre', 'otros', 420, 21, 88.2, null, 0, 508.2, 'revisado', true, '2026-10-30', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-10-30', 'Google Ireland Ltd (Google Ads)', null, 'ADS-1091', 'Campañas de Google Ads · octubre', 'publicidad', 1369, 0, 0, null, 0, 1369, 'revisado', true, '2026-10-30', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-10-30', 'LinkedIn Ireland Unlimited Company', null, 'LI-1092', 'Publicidad en LinkedIn · octubre', 'publicidad', 855, 0, 0, null, 0, 855, 'revisado', true, '2026-10-30', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-10-30', 'CaixaBank, S.A.', null, 'COM-1093', 'Comisiones de mantenimiento y transferencias · octubre', 'bancos', 47, 0, 0, null, 0, 47, 'revisado', true, '2026-10-30', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-10-30', 'Laura Méndez Ruiz (diseño UX freelance)', '47120583T', 'LM-10/26', 'Diseño de interfaces · octubre', 'profesionales', 2500, 21, 525, 15, 375, 3025, 'revisado', true, '2026-11-04', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-11-02', 'Inversiones Diagonal 2010, S.L.', 'B08622912', 'ALQ-2026-11', 'Alquiler de la oficina · noviembre', 'alquiler', 3200, 21, 672, 19, 608, 3872, 'revisado', true, '2026-11-02', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-11-02', 'Google Cloud EMEA Ltd', null, 'GWS-1097', 'Google Workspace (12 usuarios) · noviembre', 'software', 168, 0, 0, null, 0, 168, 'revisado', true, '2026-11-02', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-11-03', 'Amazon Web Services EMEA SARL', null, 'EUINES26-1096', 'Servidores y bases de datos (AWS) · noviembre', 'software', 2562, 0, 0, null, 0, 2562, 'revisado', true, '2026-11-03', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-11-05', 'Figma, Inc. · GitHub, Inc. · Slack Technologies', null, 'SAAS-1098', 'Licencias de diseño y desarrollo · noviembre', 'software', 412, 0, 0, null, 0, 412, 'revisado', true, '2026-11-05', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-11-06', 'Energía Clara Comercializadora, S.L.', 'B28409175', 'F-1094', 'Electricidad oficina · noviembre', 'suministros', 344.12, 21, 72.27, null, 0, 416.39, 'revisado', true, '2026-11-06', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-11-09', 'Telecom Barcelona Empresas, S.A.', 'A08155285', 'F-1095', 'Fibra 1 Gb y 6 líneas móviles · noviembre', 'suministros', 189.5, 21, 39.8, null, 0, 229.3, 'revisado', true, '2026-11-09', 'gasto', null, marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, irpf_pct, cuota_irpf, total, estado, pagado, fecha_pago, naturaleza, revision, ocr) values (o, '2026-11-12', 'Taxi y VTC (varios)', null, 'T-1121', 'Desplazamientos a clientes · noviembre', 'viajes', 96.4, 10, 9.64, null, 0, 106.04, 'revisado', true, '2026-11-12', 'gasto', null, marca);

  -- ---------------------------------------------------------- Laboral
  insert into public.perfil_laboral (owner_id, convenio_nombre, convenio_codigo, periodo_prueba, pagas_convenio, horas_semana_convenio, notas)
  values (o, 'XVIII Convenio colectivo estatal de empresas de consultoría, tecnologías de la información y estudios de mercado', '99001355011983',
          '6 meses técnicos titulados, 2 meses resto', 14, 40, 'Empresa de demostración')
  on conflict (owner_id) do update set convenio_nombre = excluded.convenio_nombre, convenio_codigo = excluded.convenio_codigo,
    periodo_prueba = excluded.periodo_prueba, pagas_convenio = 14, horas_semana_convenio = 40, notas = excluded.notas;
  insert into public.centros_trabajo (owner_id, nombre, direccion, cp, ciudad, provincia, ccc)
  values (o, 'Oficina Barcelona', 'Passeig de Gràcia 55, 4.º 2.ª', '08007', 'Barcelona', 'Barcelona', '08123456789')
  returning id into centro;
  insert into public.trabajadores (owner_id, estado, nombre, dni, nss, fecha_nacimiento, domicilio, telefono, iban, nivel_estudios, fecha_inicio, centro_id, puesto,
      tipo_contrato, jornada, horas_semana, horario, teletrabajo, salario_bruto_mensual, pagas, irpf_pct, convenio, clasificacion, prueba_meses, vacaciones_dias, vacaciones_nota)
    values (o, 'alta', 'Marta Soler Vidal', '46812937W', '085123987680', '1986-05-14', 'Carrer de Provença 214, 3.º 1.ª, 08036 Barcelona', '600 100 201', 'ES7921000813610123456789', 'Máster universitario', '2021-09-01', centro, 'Directora de proyectos',
      'indefinido', 'completa', 40, 'L-J 9:00-18:00 · V 8:00-15:00', true, 4200, 14, 22, 'Convenio TIC', 'Área 2 · Grupo A · Nivel 1 (Jefa de proyecto)', 6, 23, '23 días laborables + 24 y 31 de diciembre')
    returning id into t1;
  insert into public.trabajadores (owner_id, estado, nombre, dni, nss, fecha_nacimiento, domicilio, telefono, iban, nivel_estudios, fecha_inicio, centro_id, puesto,
      tipo_contrato, jornada, horas_semana, horario, teletrabajo, salario_bruto_mensual, pagas, irpf_pct, convenio, clasificacion, prueba_meses, vacaciones_dias, vacaciones_nota)
    values (o, 'alta', 'Javier Ortega Prats', '38955120C', '084471820308', '1990-11-02', 'Carrer de Verdi 31, 2.º, 08012 Barcelona', '600 100 202', 'ES1200810200250001234567', 'Grado universitario', '2022-09-15', centro, 'Desarrollador sénior',
      'indefinido', 'completa', 40, 'L-J 9:00-18:00 · V 8:00-15:00', true, 3600, 14, 19, 'Convenio TIC', 'Área 3 · Grupo B · Nivel 1 (Analista programador)', 6, 23, '23 días laborables + 24 y 31 de diciembre')
    returning id into t2;
  insert into public.trabajadores (owner_id, estado, nombre, dni, nss, fecha_nacimiento, domicilio, telefono, iban, nivel_estudios, fecha_inicio, centro_id, puesto,
      tipo_contrato, jornada, horas_semana, horario, teletrabajo, salario_bruto_mensual, pagas, irpf_pct, convenio, clasificacion, prueba_meses, vacaciones_dias, vacaciones_nota)
    values (o, 'alta', 'Lucía Fernández Gil', '53318764A', '286022441764', '1995-03-27', 'Avinguda de Mistral 18, 5.º 3.ª, 08015 Barcelona', '600 100 203', 'ES0301825322110201502220', 'Grado universitario', '2024-02-01', centro, 'Desarrolladora full stack',
      'indefinido', 'completa', 40, 'L-J 9:00-18:00 · V 8:00-15:00', true, 2900, 14, 16, 'Convenio TIC', 'Área 3 · Grupo C · Nivel 1 (Programadora)', 6, 23, '23 días laborables + 24 y 31 de diciembre')
    returning id into t3;
  insert into public.trabajadores (owner_id, estado, nombre, dni, nss, fecha_nacimiento, domicilio, telefono, iban, nivel_estudios, fecha_inicio, centro_id, puesto,
      tipo_contrato, jornada, horas_semana, horario, teletrabajo, salario_bruto_mensual, pagas, irpf_pct, convenio, clasificacion, prueba_meses, vacaciones_dias, vacaciones_nota)
    values (o, 'alta', 'Pau Ribas Comas', '47790311Z', '173095816249', '1997-08-09', 'Carrer del Torrent de l’Olla 77, 08012 Barcelona', '600 100 204', 'ES5521000418450200051398', 'Grado universitario', '2025-01-13', centro, 'Comercial · cuentas clave',
      'indefinido', 'completa', 40, 'L-J 9:00-18:00 · V 8:00-15:00', true, 2700, 14, 15, 'Convenio TIC', 'Área 3 · Grupo B · Nivel 2 (Técnico comercial)', 6, 23, '23 días laborables + 24 y 31 de diciembre')
    returning id into t4;
  insert into public.trabajadores (owner_id, estado, nombre, dni, nss, fecha_nacimiento, domicilio, telefono, iban, nivel_estudios, fecha_inicio, centro_id, puesto,
      tipo_contrato, jornada, horas_semana, horario, teletrabajo, salario_bruto_mensual, pagas, irpf_pct, convenio, clasificacion, prueba_meses, vacaciones_dias, vacaciones_nota)
    values (o, 'alta', 'Sara El Amrani Torres', '49127705G', '087251033487', '1999-12-03', 'Carrer de Sants 120, 1.º 4.ª, 08014 Barcelona', '600 100 205', 'ES2200490001502110001234', 'Grado universitario', '2026-04-06', centro, 'Administración y RR. HH.',
      'indefinido', 'completa', 40, 'L-J 9:00-18:00 · V 8:00-15:00', true, 2200, 14, 12, 'Convenio TIC', 'Área 4 · Grupo C · Nivel 1 (Técnica administrativa)', 6, 23, '23 días laborables + 24 y 31 de diciembre')
    returning id into t5;

  -- Nóminas (con PDF de ejemplo en clientes.nomotax.io/demo-docs/)
  insert into public.nominas (owner_id, trabajador_id, anio, mes, tipo, estado, file_path, nombre_leido, dni_leido, bruto, neto, irpf, irpf_pct, ss_trabajador, ss_empresa, variables, coste_total, conceptos, publicada_at, ocr) values
    (o, t1, 2026, 1, 'mensual', 'publicada', 'demo-docs/nominas/t1-2026-01.pdf', 'Marta Soler Vidal', '46812937W', 4200, 2957.5, 924, 22, 318.5, 1575.35, 0, 5775.35, '[{"concepto":"Salario base","importe":3444},{"concepto":"Plus de convenio","importe":756},{"concepto":"Retención IRPF (22%)","importe":-924},{"concepto":"Seguridad Social trabajador (6,5%)","importe":-318.5}]'::jsonb, '2026-01-31 18:00+01', marca);
  insert into public.nominas (owner_id, trabajador_id, anio, mes, tipo, estado, file_path, nombre_leido, dni_leido, bruto, neto, irpf, irpf_pct, ss_trabajador, ss_empresa, variables, coste_total, conceptos, publicada_at, ocr) values
    (o, t1, 2026, 2, 'mensual', 'publicada', 'demo-docs/nominas/t1-2026-02.pdf', 'Marta Soler Vidal', '46812937W', 4200, 2957.5, 924, 22, 318.5, 1575.35, 0, 5775.35, '[{"concepto":"Salario base","importe":3444},{"concepto":"Plus de convenio","importe":756},{"concepto":"Retención IRPF (22%)","importe":-924},{"concepto":"Seguridad Social trabajador (6,5%)","importe":-318.5}]'::jsonb, '2026-02-28 18:00+01', marca);
  insert into public.nominas (owner_id, trabajador_id, anio, mes, tipo, estado, file_path, nombre_leido, dni_leido, bruto, neto, irpf, irpf_pct, ss_trabajador, ss_empresa, variables, coste_total, conceptos, publicada_at, ocr) values
    (o, t1, 2026, 3, 'mensual', 'publicada', 'demo-docs/nominas/t1-2026-03.pdf', 'Marta Soler Vidal', '46812937W', 4200, 2957.5, 924, 22, 318.5, 1575.35, 0, 5775.35, '[{"concepto":"Salario base","importe":3444},{"concepto":"Plus de convenio","importe":756},{"concepto":"Retención IRPF (22%)","importe":-924},{"concepto":"Seguridad Social trabajador (6,5%)","importe":-318.5}]'::jsonb, '2026-03-31 18:00+01', marca);
  insert into public.nominas (owner_id, trabajador_id, anio, mes, tipo, estado, file_path, nombre_leido, dni_leido, bruto, neto, irpf, irpf_pct, ss_trabajador, ss_empresa, variables, coste_total, conceptos, publicada_at, ocr) values
    (o, t1, 2026, 4, 'mensual', 'publicada', 'demo-docs/nominas/t1-2026-04.pdf', 'Marta Soler Vidal', '46812937W', 4200, 2957.5, 924, 22, 318.5, 1575.35, 0, 5775.35, '[{"concepto":"Salario base","importe":3444},{"concepto":"Plus de convenio","importe":756},{"concepto":"Retención IRPF (22%)","importe":-924},{"concepto":"Seguridad Social trabajador (6,5%)","importe":-318.5}]'::jsonb, '2026-04-30 18:00+01', marca);
  insert into public.nominas (owner_id, trabajador_id, anio, mes, tipo, estado, file_path, nombre_leido, dni_leido, bruto, neto, irpf, irpf_pct, ss_trabajador, ss_empresa, variables, coste_total, conceptos, publicada_at, ocr) values
    (o, t1, 2026, 5, 'mensual', 'publicada', 'demo-docs/nominas/t1-2026-05.pdf', 'Marta Soler Vidal', '46812937W', 4200, 2957.5, 924, 22, 318.5, 1575.35, 0, 5775.35, '[{"concepto":"Salario base","importe":3444},{"concepto":"Plus de convenio","importe":756},{"concepto":"Retención IRPF (22%)","importe":-924},{"concepto":"Seguridad Social trabajador (6,5%)","importe":-318.5}]'::jsonb, '2026-05-31 18:00+01', marca);
  insert into public.nominas (owner_id, trabajador_id, anio, mes, tipo, estado, file_path, nombre_leido, dni_leido, bruto, neto, irpf, irpf_pct, ss_trabajador, ss_empresa, variables, coste_total, conceptos, publicada_at, ocr) values
    (o, t1, 2026, 6, 'mensual', 'publicada', 'demo-docs/nominas/t1-2026-06.pdf', 'Marta Soler Vidal', '46812937W', 4200, 2957.5, 924, 22, 318.5, 1575.35, 0, 5775.35, '[{"concepto":"Salario base","importe":3444},{"concepto":"Plus de convenio","importe":756},{"concepto":"Retención IRPF (22%)","importe":-924},{"concepto":"Seguridad Social trabajador (6,5%)","importe":-318.5}]'::jsonb, '2026-06-30 18:00+01', marca);
  insert into public.nominas (owner_id, trabajador_id, anio, mes, tipo, estado, file_path, nombre_leido, dni_leido, bruto, neto, irpf, irpf_pct, ss_trabajador, ss_empresa, variables, coste_total, conceptos, publicada_at, ocr) values
    (o, t1, 2026, 6, 'extra', 'publicada', 'demo-docs/nominas/t1-2026-06-extra.pdf', 'Marta Soler Vidal', '46812937W', 4200, 3276, 924, 22, 0, 0, 0, 4200, '[{"concepto":"Paga extraordinaria de verano","importe":4200}]'::jsonb, '2026-06-30 18:00+01', marca);
  insert into public.nominas (owner_id, trabajador_id, anio, mes, tipo, estado, file_path, nombre_leido, dni_leido, bruto, neto, irpf, irpf_pct, ss_trabajador, ss_empresa, variables, coste_total, conceptos, publicada_at, ocr) values
    (o, t1, 2026, 7, 'mensual', 'publicada', 'demo-docs/nominas/t1-2026-07.pdf', 'Marta Soler Vidal', '46812937W', 4200, 2957.5, 924, 22, 318.5, 1575.35, 0, 5775.35, '[{"concepto":"Salario base","importe":3444},{"concepto":"Plus de convenio","importe":756},{"concepto":"Retención IRPF (22%)","importe":-924},{"concepto":"Seguridad Social trabajador (6,5%)","importe":-318.5}]'::jsonb, '2026-07-31 18:00+01', marca);
  insert into public.nominas (owner_id, trabajador_id, anio, mes, tipo, estado, file_path, nombre_leido, dni_leido, bruto, neto, irpf, irpf_pct, ss_trabajador, ss_empresa, variables, coste_total, conceptos, publicada_at, ocr) values
    (o, t1, 2026, 8, 'mensual', 'publicada', 'demo-docs/nominas/t1-2026-08.pdf', 'Marta Soler Vidal', '46812937W', 4200, 2957.5, 924, 22, 318.5, 1575.35, 0, 5775.35, '[{"concepto":"Salario base","importe":3444},{"concepto":"Plus de convenio","importe":756},{"concepto":"Retención IRPF (22%)","importe":-924},{"concepto":"Seguridad Social trabajador (6,5%)","importe":-318.5}]'::jsonb, '2026-08-31 18:00+01', marca);
  insert into public.nominas (owner_id, trabajador_id, anio, mes, tipo, estado, file_path, nombre_leido, dni_leido, bruto, neto, irpf, irpf_pct, ss_trabajador, ss_empresa, variables, coste_total, conceptos, publicada_at, ocr) values
    (o, t1, 2026, 9, 'mensual', 'publicada', 'demo-docs/nominas/t1-2026-09.pdf', 'Marta Soler Vidal', '46812937W', 4200, 2957.5, 924, 22, 318.5, 1575.35, 0, 5775.35, '[{"concepto":"Salario base","importe":3444},{"concepto":"Plus de convenio","importe":756},{"concepto":"Retención IRPF (22%)","importe":-924},{"concepto":"Seguridad Social trabajador (6,5%)","importe":-318.5}]'::jsonb, '2026-09-30 18:00+01', marca);
  insert into public.nominas (owner_id, trabajador_id, anio, mes, tipo, estado, file_path, nombre_leido, dni_leido, bruto, neto, irpf, irpf_pct, ss_trabajador, ss_empresa, variables, coste_total, conceptos, publicada_at, ocr) values
    (o, t1, 2026, 10, 'mensual', 'publicada', 'demo-docs/nominas/t1-2026-10.pdf', 'Marta Soler Vidal', '46812937W', 4200, 2957.5, 924, 22, 318.5, 1575.35, 0, 5775.35, '[{"concepto":"Salario base","importe":3444},{"concepto":"Plus de convenio","importe":756},{"concepto":"Retención IRPF (22%)","importe":-924},{"concepto":"Seguridad Social trabajador (6,5%)","importe":-318.5}]'::jsonb, '2026-10-31 18:00+01', marca);
  insert into public.nominas (owner_id, trabajador_id, anio, mes, tipo, estado, file_path, nombre_leido, dni_leido, bruto, neto, irpf, irpf_pct, ss_trabajador, ss_empresa, variables, coste_total, conceptos, publicada_at, ocr) values
    (o, t2, 2026, 1, 'mensual', 'publicada', 'demo-docs/nominas/t2-2026-01.pdf', 'Javier Ortega Prats', '38955120C', 3600, 2643, 684, 19, 273, 1350.3, 0, 4950.3, '[{"concepto":"Salario base","importe":2952},{"concepto":"Plus de convenio","importe":648},{"concepto":"Retención IRPF (19%)","importe":-684},{"concepto":"Seguridad Social trabajador (6,5%)","importe":-273}]'::jsonb, '2026-01-31 18:00+01', marca);
  insert into public.nominas (owner_id, trabajador_id, anio, mes, tipo, estado, file_path, nombre_leido, dni_leido, bruto, neto, irpf, irpf_pct, ss_trabajador, ss_empresa, variables, coste_total, conceptos, publicada_at, ocr) values
    (o, t2, 2026, 2, 'mensual', 'publicada', 'demo-docs/nominas/t2-2026-02.pdf', 'Javier Ortega Prats', '38955120C', 3600, 2643, 684, 19, 273, 1350.3, 0, 4950.3, '[{"concepto":"Salario base","importe":2952},{"concepto":"Plus de convenio","importe":648},{"concepto":"Retención IRPF (19%)","importe":-684},{"concepto":"Seguridad Social trabajador (6,5%)","importe":-273}]'::jsonb, '2026-02-28 18:00+01', marca);
  insert into public.nominas (owner_id, trabajador_id, anio, mes, tipo, estado, file_path, nombre_leido, dni_leido, bruto, neto, irpf, irpf_pct, ss_trabajador, ss_empresa, variables, coste_total, conceptos, publicada_at, ocr) values
    (o, t2, 2026, 3, 'mensual', 'publicada', 'demo-docs/nominas/t2-2026-03.pdf', 'Javier Ortega Prats', '38955120C', 3600, 2643, 684, 19, 273, 1350.3, 0, 4950.3, '[{"concepto":"Salario base","importe":2952},{"concepto":"Plus de convenio","importe":648},{"concepto":"Retención IRPF (19%)","importe":-684},{"concepto":"Seguridad Social trabajador (6,5%)","importe":-273}]'::jsonb, '2026-03-31 18:00+01', marca);
  insert into public.nominas (owner_id, trabajador_id, anio, mes, tipo, estado, file_path, nombre_leido, dni_leido, bruto, neto, irpf, irpf_pct, ss_trabajador, ss_empresa, variables, coste_total, conceptos, publicada_at, ocr) values
    (o, t2, 2026, 4, 'mensual', 'publicada', 'demo-docs/nominas/t2-2026-04.pdf', 'Javier Ortega Prats', '38955120C', 3600, 2643, 684, 19, 273, 1350.3, 0, 4950.3, '[{"concepto":"Salario base","importe":2952},{"concepto":"Plus de convenio","importe":648},{"concepto":"Retención IRPF (19%)","importe":-684},{"concepto":"Seguridad Social trabajador (6,5%)","importe":-273}]'::jsonb, '2026-04-30 18:00+01', marca);
  insert into public.nominas (owner_id, trabajador_id, anio, mes, tipo, estado, file_path, nombre_leido, dni_leido, bruto, neto, irpf, irpf_pct, ss_trabajador, ss_empresa, variables, coste_total, conceptos, publicada_at, ocr) values
    (o, t2, 2026, 5, 'mensual', 'publicada', 'demo-docs/nominas/t2-2026-05.pdf', 'Javier Ortega Prats', '38955120C', 3600, 2643, 684, 19, 273, 1350.3, 0, 4950.3, '[{"concepto":"Salario base","importe":2952},{"concepto":"Plus de convenio","importe":648},{"concepto":"Retención IRPF (19%)","importe":-684},{"concepto":"Seguridad Social trabajador (6,5%)","importe":-273}]'::jsonb, '2026-05-31 18:00+01', marca);
  insert into public.nominas (owner_id, trabajador_id, anio, mes, tipo, estado, file_path, nombre_leido, dni_leido, bruto, neto, irpf, irpf_pct, ss_trabajador, ss_empresa, variables, coste_total, conceptos, publicada_at, ocr) values
    (o, t2, 2026, 6, 'mensual', 'publicada', 'demo-docs/nominas/t2-2026-06.pdf', 'Javier Ortega Prats', '38955120C', 3600, 2643, 684, 19, 273, 1350.3, 0, 4950.3, '[{"concepto":"Salario base","importe":2952},{"concepto":"Plus de convenio","importe":648},{"concepto":"Retención IRPF (19%)","importe":-684},{"concepto":"Seguridad Social trabajador (6,5%)","importe":-273}]'::jsonb, '2026-06-30 18:00+01', marca);
  insert into public.nominas (owner_id, trabajador_id, anio, mes, tipo, estado, file_path, nombre_leido, dni_leido, bruto, neto, irpf, irpf_pct, ss_trabajador, ss_empresa, variables, coste_total, conceptos, publicada_at, ocr) values
    (o, t2, 2026, 6, 'extra', 'publicada', 'demo-docs/nominas/t2-2026-06-extra.pdf', 'Javier Ortega Prats', '38955120C', 3600, 2916, 684, 19, 0, 0, 0, 3600, '[{"concepto":"Paga extraordinaria de verano","importe":3600}]'::jsonb, '2026-06-30 18:00+01', marca);
  insert into public.nominas (owner_id, trabajador_id, anio, mes, tipo, estado, file_path, nombre_leido, dni_leido, bruto, neto, irpf, irpf_pct, ss_trabajador, ss_empresa, variables, coste_total, conceptos, publicada_at, ocr) values
    (o, t2, 2026, 7, 'mensual', 'publicada', 'demo-docs/nominas/t2-2026-07.pdf', 'Javier Ortega Prats', '38955120C', 3600, 2643, 684, 19, 273, 1350.3, 0, 4950.3, '[{"concepto":"Salario base","importe":2952},{"concepto":"Plus de convenio","importe":648},{"concepto":"Retención IRPF (19%)","importe":-684},{"concepto":"Seguridad Social trabajador (6,5%)","importe":-273}]'::jsonb, '2026-07-31 18:00+01', marca);
  insert into public.nominas (owner_id, trabajador_id, anio, mes, tipo, estado, file_path, nombre_leido, dni_leido, bruto, neto, irpf, irpf_pct, ss_trabajador, ss_empresa, variables, coste_total, conceptos, publicada_at, ocr) values
    (o, t2, 2026, 8, 'mensual', 'publicada', 'demo-docs/nominas/t2-2026-08.pdf', 'Javier Ortega Prats', '38955120C', 3600, 2643, 684, 19, 273, 1350.3, 0, 4950.3, '[{"concepto":"Salario base","importe":2952},{"concepto":"Plus de convenio","importe":648},{"concepto":"Retención IRPF (19%)","importe":-684},{"concepto":"Seguridad Social trabajador (6,5%)","importe":-273}]'::jsonb, '2026-08-31 18:00+01', marca);
  insert into public.nominas (owner_id, trabajador_id, anio, mes, tipo, estado, file_path, nombre_leido, dni_leido, bruto, neto, irpf, irpf_pct, ss_trabajador, ss_empresa, variables, coste_total, conceptos, publicada_at, ocr) values
    (o, t2, 2026, 9, 'mensual', 'publicada', 'demo-docs/nominas/t2-2026-09.pdf', 'Javier Ortega Prats', '38955120C', 3600, 2643, 684, 19, 273, 1350.3, 0, 4950.3, '[{"concepto":"Salario base","importe":2952},{"concepto":"Plus de convenio","importe":648},{"concepto":"Retención IRPF (19%)","importe":-684},{"concepto":"Seguridad Social trabajador (6,5%)","importe":-273}]'::jsonb, '2026-09-30 18:00+01', marca);
  insert into public.nominas (owner_id, trabajador_id, anio, mes, tipo, estado, file_path, nombre_leido, dni_leido, bruto, neto, irpf, irpf_pct, ss_trabajador, ss_empresa, variables, coste_total, conceptos, publicada_at, ocr) values
    (o, t2, 2026, 10, 'mensual', 'publicada', 'demo-docs/nominas/t2-2026-10.pdf', 'Javier Ortega Prats', '38955120C', 3600, 2643, 684, 19, 273, 1350.3, 0, 4950.3, '[{"concepto":"Salario base","importe":2952},{"concepto":"Plus de convenio","importe":648},{"concepto":"Retención IRPF (19%)","importe":-684},{"concepto":"Seguridad Social trabajador (6,5%)","importe":-273}]'::jsonb, '2026-10-31 18:00+01', marca);
  insert into public.nominas (owner_id, trabajador_id, anio, mes, tipo, estado, file_path, nombre_leido, dni_leido, bruto, neto, irpf, irpf_pct, ss_trabajador, ss_empresa, variables, coste_total, conceptos, publicada_at, ocr) values
    (o, t3, 2026, 1, 'mensual', 'publicada', 'demo-docs/nominas/t3-2026-01.pdf', 'Lucía Fernández Gil', '53318764A', 2900, 2216.08, 464, 16, 219.92, 1087.74, 0, 3987.74, '[{"concepto":"Salario base","importe":2378},{"concepto":"Plus de convenio","importe":522},{"concepto":"Retención IRPF (16%)","importe":-464},{"concepto":"Seguridad Social trabajador (6,5%)","importe":-219.92}]'::jsonb, '2026-01-31 18:00+01', marca);
  insert into public.nominas (owner_id, trabajador_id, anio, mes, tipo, estado, file_path, nombre_leido, dni_leido, bruto, neto, irpf, irpf_pct, ss_trabajador, ss_empresa, variables, coste_total, conceptos, publicada_at, ocr) values
    (o, t3, 2026, 2, 'mensual', 'publicada', 'demo-docs/nominas/t3-2026-02.pdf', 'Lucía Fernández Gil', '53318764A', 2900, 2216.08, 464, 16, 219.92, 1087.74, 0, 3987.74, '[{"concepto":"Salario base","importe":2378},{"concepto":"Plus de convenio","importe":522},{"concepto":"Retención IRPF (16%)","importe":-464},{"concepto":"Seguridad Social trabajador (6,5%)","importe":-219.92}]'::jsonb, '2026-02-28 18:00+01', marca);
  insert into public.nominas (owner_id, trabajador_id, anio, mes, tipo, estado, file_path, nombre_leido, dni_leido, bruto, neto, irpf, irpf_pct, ss_trabajador, ss_empresa, variables, coste_total, conceptos, publicada_at, ocr) values
    (o, t3, 2026, 3, 'mensual', 'publicada', 'demo-docs/nominas/t3-2026-03.pdf', 'Lucía Fernández Gil', '53318764A', 2900, 2216.08, 464, 16, 219.92, 1087.74, 0, 3987.74, '[{"concepto":"Salario base","importe":2378},{"concepto":"Plus de convenio","importe":522},{"concepto":"Retención IRPF (16%)","importe":-464},{"concepto":"Seguridad Social trabajador (6,5%)","importe":-219.92}]'::jsonb, '2026-03-31 18:00+01', marca);
  insert into public.nominas (owner_id, trabajador_id, anio, mes, tipo, estado, file_path, nombre_leido, dni_leido, bruto, neto, irpf, irpf_pct, ss_trabajador, ss_empresa, variables, coste_total, conceptos, publicada_at, ocr) values
    (o, t3, 2026, 4, 'mensual', 'publicada', 'demo-docs/nominas/t3-2026-04.pdf', 'Lucía Fernández Gil', '53318764A', 2900, 2216.08, 464, 16, 219.92, 1087.74, 0, 3987.74, '[{"concepto":"Salario base","importe":2378},{"concepto":"Plus de convenio","importe":522},{"concepto":"Retención IRPF (16%)","importe":-464},{"concepto":"Seguridad Social trabajador (6,5%)","importe":-219.92}]'::jsonb, '2026-04-30 18:00+01', marca);
  insert into public.nominas (owner_id, trabajador_id, anio, mes, tipo, estado, file_path, nombre_leido, dni_leido, bruto, neto, irpf, irpf_pct, ss_trabajador, ss_empresa, variables, coste_total, conceptos, publicada_at, ocr) values
    (o, t3, 2026, 5, 'mensual', 'publicada', 'demo-docs/nominas/t3-2026-05.pdf', 'Lucía Fernández Gil', '53318764A', 2900, 2216.08, 464, 16, 219.92, 1087.74, 0, 3987.74, '[{"concepto":"Salario base","importe":2378},{"concepto":"Plus de convenio","importe":522},{"concepto":"Retención IRPF (16%)","importe":-464},{"concepto":"Seguridad Social trabajador (6,5%)","importe":-219.92}]'::jsonb, '2026-05-31 18:00+01', marca);
  insert into public.nominas (owner_id, trabajador_id, anio, mes, tipo, estado, file_path, nombre_leido, dni_leido, bruto, neto, irpf, irpf_pct, ss_trabajador, ss_empresa, variables, coste_total, conceptos, publicada_at, ocr) values
    (o, t3, 2026, 6, 'mensual', 'publicada', 'demo-docs/nominas/t3-2026-06.pdf', 'Lucía Fernández Gil', '53318764A', 2900, 2216.08, 464, 16, 219.92, 1087.74, 0, 3987.74, '[{"concepto":"Salario base","importe":2378},{"concepto":"Plus de convenio","importe":522},{"concepto":"Retención IRPF (16%)","importe":-464},{"concepto":"Seguridad Social trabajador (6,5%)","importe":-219.92}]'::jsonb, '2026-06-30 18:00+01', marca);
  insert into public.nominas (owner_id, trabajador_id, anio, mes, tipo, estado, file_path, nombre_leido, dni_leido, bruto, neto, irpf, irpf_pct, ss_trabajador, ss_empresa, variables, coste_total, conceptos, publicada_at, ocr) values
    (o, t3, 2026, 6, 'extra', 'publicada', 'demo-docs/nominas/t3-2026-06-extra.pdf', 'Lucía Fernández Gil', '53318764A', 2900, 2436, 464, 16, 0, 0, 0, 2900, '[{"concepto":"Paga extraordinaria de verano","importe":2900}]'::jsonb, '2026-06-30 18:00+01', marca);
  insert into public.nominas (owner_id, trabajador_id, anio, mes, tipo, estado, file_path, nombre_leido, dni_leido, bruto, neto, irpf, irpf_pct, ss_trabajador, ss_empresa, variables, coste_total, conceptos, publicada_at, ocr) values
    (o, t3, 2026, 7, 'mensual', 'publicada', 'demo-docs/nominas/t3-2026-07.pdf', 'Lucía Fernández Gil', '53318764A', 2900, 2216.08, 464, 16, 219.92, 1087.74, 0, 3987.74, '[{"concepto":"Salario base","importe":2378},{"concepto":"Plus de convenio","importe":522},{"concepto":"Retención IRPF (16%)","importe":-464},{"concepto":"Seguridad Social trabajador (6,5%)","importe":-219.92}]'::jsonb, '2026-07-31 18:00+01', marca);
  insert into public.nominas (owner_id, trabajador_id, anio, mes, tipo, estado, file_path, nombre_leido, dni_leido, bruto, neto, irpf, irpf_pct, ss_trabajador, ss_empresa, variables, coste_total, conceptos, publicada_at, ocr) values
    (o, t3, 2026, 8, 'mensual', 'publicada', 'demo-docs/nominas/t3-2026-08.pdf', 'Lucía Fernández Gil', '53318764A', 2900, 2216.08, 464, 16, 219.92, 1087.74, 0, 3987.74, '[{"concepto":"Salario base","importe":2378},{"concepto":"Plus de convenio","importe":522},{"concepto":"Retención IRPF (16%)","importe":-464},{"concepto":"Seguridad Social trabajador (6,5%)","importe":-219.92}]'::jsonb, '2026-08-31 18:00+01', marca);
  insert into public.nominas (owner_id, trabajador_id, anio, mes, tipo, estado, file_path, nombre_leido, dni_leido, bruto, neto, irpf, irpf_pct, ss_trabajador, ss_empresa, variables, coste_total, conceptos, publicada_at, ocr) values
    (o, t3, 2026, 9, 'mensual', 'publicada', 'demo-docs/nominas/t3-2026-09.pdf', 'Lucía Fernández Gil', '53318764A', 2900, 2216.08, 464, 16, 219.92, 1087.74, 0, 3987.74, '[{"concepto":"Salario base","importe":2378},{"concepto":"Plus de convenio","importe":522},{"concepto":"Retención IRPF (16%)","importe":-464},{"concepto":"Seguridad Social trabajador (6,5%)","importe":-219.92}]'::jsonb, '2026-09-30 18:00+01', marca);
  insert into public.nominas (owner_id, trabajador_id, anio, mes, tipo, estado, file_path, nombre_leido, dni_leido, bruto, neto, irpf, irpf_pct, ss_trabajador, ss_empresa, variables, coste_total, conceptos, publicada_at, ocr) values
    (o, t3, 2026, 10, 'mensual', 'publicada', 'demo-docs/nominas/t3-2026-10.pdf', 'Lucía Fernández Gil', '53318764A', 2900, 2216.08, 464, 16, 219.92, 1087.74, 0, 3987.74, '[{"concepto":"Salario base","importe":2378},{"concepto":"Plus de convenio","importe":522},{"concepto":"Retención IRPF (16%)","importe":-464},{"concepto":"Seguridad Social trabajador (6,5%)","importe":-219.92}]'::jsonb, '2026-10-31 18:00+01', marca);
  insert into public.nominas (owner_id, trabajador_id, anio, mes, tipo, estado, file_path, nombre_leido, dni_leido, bruto, neto, irpf, irpf_pct, ss_trabajador, ss_empresa, variables, coste_total, conceptos, publicada_at, ocr) values
    (o, t4, 2026, 1, 'mensual', 'publicada', 'demo-docs/nominas/t4-2026-01.pdf', 'Pau Ribas Comas', '47790311Z', 3550, 2757.5, 532.5, 15, 260, 1286, 850, 4836, '[{"concepto":"Salario base","importe":2214},{"concepto":"Plus de convenio","importe":486},{"concepto":"Comisiones por ventas","importe":850},{"concepto":"Retención IRPF (15%)","importe":-532.5},{"concepto":"Seguridad Social trabajador (6,5%)","importe":-260}]'::jsonb, '2026-01-31 18:00+01', marca);
  insert into public.nominas (owner_id, trabajador_id, anio, mes, tipo, estado, file_path, nombre_leido, dni_leido, bruto, neto, irpf, irpf_pct, ss_trabajador, ss_empresa, variables, coste_total, conceptos, publicada_at, ocr) values
    (o, t4, 2026, 2, 'mensual', 'publicada', 'demo-docs/nominas/t4-2026-02.pdf', 'Pau Ribas Comas', '47790311Z', 3250, 2522, 487.5, 15, 240.5, 1189.55, 550, 4439.55, '[{"concepto":"Salario base","importe":2214},{"concepto":"Plus de convenio","importe":486},{"concepto":"Comisiones por ventas","importe":550},{"concepto":"Retención IRPF (15%)","importe":-487.5},{"concepto":"Seguridad Social trabajador (6,5%)","importe":-240.5}]'::jsonb, '2026-02-28 18:00+01', marca);
  insert into public.nominas (owner_id, trabajador_id, anio, mes, tipo, estado, file_path, nombre_leido, dni_leido, bruto, neto, irpf, irpf_pct, ss_trabajador, ss_empresa, variables, coste_total, conceptos, publicada_at, ocr) values
    (o, t4, 2026, 3, 'mensual', 'publicada', 'demo-docs/nominas/t4-2026-03.pdf', 'Pau Ribas Comas', '47790311Z', 3000, 2325.75, 450, 15, 224.25, 1109.18, 300, 4109.18, '[{"concepto":"Salario base","importe":2214},{"concepto":"Plus de convenio","importe":486},{"concepto":"Comisiones por ventas","importe":300},{"concepto":"Retención IRPF (15%)","importe":-450},{"concepto":"Seguridad Social trabajador (6,5%)","importe":-224.25}]'::jsonb, '2026-03-31 18:00+01', marca);
  insert into public.nominas (owner_id, trabajador_id, anio, mes, tipo, estado, file_path, nombre_leido, dni_leido, bruto, neto, irpf, irpf_pct, ss_trabajador, ss_empresa, variables, coste_total, conceptos, publicada_at, ocr) values
    (o, t4, 2026, 4, 'mensual', 'publicada', 'demo-docs/nominas/t4-2026-04.pdf', 'Pau Ribas Comas', '47790311Z', 2950, 2286.5, 442.5, 15, 221, 1093.1, 250, 4043.1, '[{"concepto":"Salario base","importe":2214},{"concepto":"Plus de convenio","importe":486},{"concepto":"Comisiones por ventas","importe":250},{"concepto":"Retención IRPF (15%)","importe":-442.5},{"concepto":"Seguridad Social trabajador (6,5%)","importe":-221}]'::jsonb, '2026-04-30 18:00+01', marca);
  insert into public.nominas (owner_id, trabajador_id, anio, mes, tipo, estado, file_path, nombre_leido, dni_leido, bruto, neto, irpf, irpf_pct, ss_trabajador, ss_empresa, variables, coste_total, conceptos, publicada_at, ocr) values
    (o, t4, 2026, 5, 'mensual', 'publicada', 'demo-docs/nominas/t4-2026-05.pdf', 'Pau Ribas Comas', '47790311Z', 3250, 2522, 487.5, 15, 240.5, 1189.55, 550, 4439.55, '[{"concepto":"Salario base","importe":2214},{"concepto":"Plus de convenio","importe":486},{"concepto":"Comisiones por ventas","importe":550},{"concepto":"Retención IRPF (15%)","importe":-487.5},{"concepto":"Seguridad Social trabajador (6,5%)","importe":-240.5}]'::jsonb, '2026-05-31 18:00+01', marca);
  insert into public.nominas (owner_id, trabajador_id, anio, mes, tipo, estado, file_path, nombre_leido, dni_leido, bruto, neto, irpf, irpf_pct, ss_trabajador, ss_empresa, variables, coste_total, conceptos, publicada_at, ocr) values
    (o, t4, 2026, 6, 'mensual', 'publicada', 'demo-docs/nominas/t4-2026-06.pdf', 'Pau Ribas Comas', '47790311Z', 3250, 2522, 487.5, 15, 240.5, 1189.55, 550, 4439.55, '[{"concepto":"Salario base","importe":2214},{"concepto":"Plus de convenio","importe":486},{"concepto":"Comisiones por ventas","importe":550},{"concepto":"Retención IRPF (15%)","importe":-487.5},{"concepto":"Seguridad Social trabajador (6,5%)","importe":-240.5}]'::jsonb, '2026-06-30 18:00+01', marca);
  insert into public.nominas (owner_id, trabajador_id, anio, mes, tipo, estado, file_path, nombre_leido, dni_leido, bruto, neto, irpf, irpf_pct, ss_trabajador, ss_empresa, variables, coste_total, conceptos, publicada_at, ocr) values
    (o, t4, 2026, 6, 'extra', 'publicada', 'demo-docs/nominas/t4-2026-06-extra.pdf', 'Pau Ribas Comas', '47790311Z', 2700, 2295, 405, 15, 0, 0, 0, 2700, '[{"concepto":"Paga extraordinaria de verano","importe":2700}]'::jsonb, '2026-06-30 18:00+01', marca);
  insert into public.nominas (owner_id, trabajador_id, anio, mes, tipo, estado, file_path, nombre_leido, dni_leido, bruto, neto, irpf, irpf_pct, ss_trabajador, ss_empresa, variables, coste_total, conceptos, publicada_at, ocr) values
    (o, t4, 2026, 7, 'mensual', 'publicada', 'demo-docs/nominas/t4-2026-07.pdf', 'Pau Ribas Comas', '47790311Z', 3000, 2325.75, 450, 15, 224.25, 1109.18, 300, 4109.18, '[{"concepto":"Salario base","importe":2214},{"concepto":"Plus de convenio","importe":486},{"concepto":"Comisiones por ventas","importe":300},{"concepto":"Retención IRPF (15%)","importe":-450},{"concepto":"Seguridad Social trabajador (6,5%)","importe":-224.25}]'::jsonb, '2026-07-31 18:00+01', marca);
  insert into public.nominas (owner_id, trabajador_id, anio, mes, tipo, estado, file_path, nombre_leido, dni_leido, bruto, neto, irpf, irpf_pct, ss_trabajador, ss_empresa, variables, coste_total, conceptos, publicada_at, ocr) values
    (o, t4, 2026, 8, 'mensual', 'publicada', 'demo-docs/nominas/t4-2026-08.pdf', 'Pau Ribas Comas', '47790311Z', 3250, 2522, 487.5, 15, 240.5, 1189.55, 550, 4439.55, '[{"concepto":"Salario base","importe":2214},{"concepto":"Plus de convenio","importe":486},{"concepto":"Comisiones por ventas","importe":550},{"concepto":"Retención IRPF (15%)","importe":-487.5},{"concepto":"Seguridad Social trabajador (6,5%)","importe":-240.5}]'::jsonb, '2026-08-31 18:00+01', marca);
  insert into public.nominas (owner_id, trabajador_id, anio, mes, tipo, estado, file_path, nombre_leido, dni_leido, bruto, neto, irpf, irpf_pct, ss_trabajador, ss_empresa, variables, coste_total, conceptos, publicada_at, ocr) values
    (o, t4, 2026, 9, 'mensual', 'publicada', 'demo-docs/nominas/t4-2026-09.pdf', 'Pau Ribas Comas', '47790311Z', 3250, 2522, 487.5, 15, 240.5, 1189.55, 550, 4439.55, '[{"concepto":"Salario base","importe":2214},{"concepto":"Plus de convenio","importe":486},{"concepto":"Comisiones por ventas","importe":550},{"concepto":"Retención IRPF (15%)","importe":-487.5},{"concepto":"Seguridad Social trabajador (6,5%)","importe":-240.5}]'::jsonb, '2026-09-30 18:00+01', marca);
  insert into public.nominas (owner_id, trabajador_id, anio, mes, tipo, estado, file_path, nombre_leido, dni_leido, bruto, neto, irpf, irpf_pct, ss_trabajador, ss_empresa, variables, coste_total, conceptos, publicada_at, ocr) values
    (o, t4, 2026, 10, 'mensual', 'publicada', 'demo-docs/nominas/t4-2026-10.pdf', 'Pau Ribas Comas', '47790311Z', 3200, 2482.75, 480, 15, 237.25, 1173.47, 500, 4373.47, '[{"concepto":"Salario base","importe":2214},{"concepto":"Plus de convenio","importe":486},{"concepto":"Comisiones por ventas","importe":500},{"concepto":"Retención IRPF (15%)","importe":-480},{"concepto":"Seguridad Social trabajador (6,5%)","importe":-237.25}]'::jsonb, '2026-10-31 18:00+01', marca);
  insert into public.nominas (owner_id, trabajador_id, anio, mes, tipo, estado, file_path, nombre_leido, dni_leido, bruto, neto, irpf, irpf_pct, ss_trabajador, ss_empresa, variables, coste_total, conceptos, publicada_at, ocr) values
    (o, t5, 2026, 4, 'mensual', 'publicada', 'demo-docs/nominas/t5-2026-04.pdf', 'Sara El Amrani Torres', '49127705G', 1833.33, 1474.3, 220, 12, 139.03, 687.65, 0, 2520.98, '[{"concepto":"Salario base","importe":1503.33},{"concepto":"Plus de convenio","importe":330},{"concepto":"Retención IRPF (12%)","importe":-220},{"concepto":"Seguridad Social trabajador (6,5%)","importe":-139.03}]'::jsonb, '2026-04-30 18:00+01', marca);
  insert into public.nominas (owner_id, trabajador_id, anio, mes, tipo, estado, file_path, nombre_leido, dni_leido, bruto, neto, irpf, irpf_pct, ss_trabajador, ss_empresa, variables, coste_total, conceptos, publicada_at, ocr) values
    (o, t5, 2026, 5, 'mensual', 'publicada', 'demo-docs/nominas/t5-2026-05.pdf', 'Sara El Amrani Torres', '49127705G', 2200, 1769.17, 264, 12, 166.83, 825.18, 0, 3025.18, '[{"concepto":"Salario base","importe":1804},{"concepto":"Plus de convenio","importe":396},{"concepto":"Retención IRPF (12%)","importe":-264},{"concepto":"Seguridad Social trabajador (6,5%)","importe":-166.83}]'::jsonb, '2026-05-31 18:00+01', marca);
  insert into public.nominas (owner_id, trabajador_id, anio, mes, tipo, estado, file_path, nombre_leido, dni_leido, bruto, neto, irpf, irpf_pct, ss_trabajador, ss_empresa, variables, coste_total, conceptos, publicada_at, ocr) values
    (o, t5, 2026, 6, 'mensual', 'publicada', 'demo-docs/nominas/t5-2026-06.pdf', 'Sara El Amrani Torres', '49127705G', 2200, 1769.17, 264, 12, 166.83, 825.18, 0, 3025.18, '[{"concepto":"Salario base","importe":1804},{"concepto":"Plus de convenio","importe":396},{"concepto":"Retención IRPF (12%)","importe":-264},{"concepto":"Seguridad Social trabajador (6,5%)","importe":-166.83}]'::jsonb, '2026-06-30 18:00+01', marca);
  insert into public.nominas (owner_id, trabajador_id, anio, mes, tipo, estado, file_path, nombre_leido, dni_leido, bruto, neto, irpf, irpf_pct, ss_trabajador, ss_empresa, variables, coste_total, conceptos, publicada_at, ocr) values
    (o, t5, 2026, 6, 'extra', 'publicada', 'demo-docs/nominas/t5-2026-06-extra.pdf', 'Sara El Amrani Torres', '49127705G', 1045.3, 919.86, 125.44, 12, 0, 0, 0, 1045.3, '[{"concepto":"Paga extraordinaria de verano","importe":1045.3}]'::jsonb, '2026-06-30 18:00+01', marca);
  insert into public.nominas (owner_id, trabajador_id, anio, mes, tipo, estado, file_path, nombre_leido, dni_leido, bruto, neto, irpf, irpf_pct, ss_trabajador, ss_empresa, variables, coste_total, conceptos, publicada_at, ocr) values
    (o, t5, 2026, 7, 'mensual', 'publicada', 'demo-docs/nominas/t5-2026-07.pdf', 'Sara El Amrani Torres', '49127705G', 2200, 1769.17, 264, 12, 166.83, 825.18, 0, 3025.18, '[{"concepto":"Salario base","importe":1804},{"concepto":"Plus de convenio","importe":396},{"concepto":"Retención IRPF (12%)","importe":-264},{"concepto":"Seguridad Social trabajador (6,5%)","importe":-166.83}]'::jsonb, '2026-07-31 18:00+01', marca);
  insert into public.nominas (owner_id, trabajador_id, anio, mes, tipo, estado, file_path, nombre_leido, dni_leido, bruto, neto, irpf, irpf_pct, ss_trabajador, ss_empresa, variables, coste_total, conceptos, publicada_at, ocr) values
    (o, t5, 2026, 8, 'mensual', 'publicada', 'demo-docs/nominas/t5-2026-08.pdf', 'Sara El Amrani Torres', '49127705G', 2200, 1769.17, 264, 12, 166.83, 825.18, 0, 3025.18, '[{"concepto":"Salario base","importe":1804},{"concepto":"Plus de convenio","importe":396},{"concepto":"Retención IRPF (12%)","importe":-264},{"concepto":"Seguridad Social trabajador (6,5%)","importe":-166.83}]'::jsonb, '2026-08-31 18:00+01', marca);
  insert into public.nominas (owner_id, trabajador_id, anio, mes, tipo, estado, file_path, nombre_leido, dni_leido, bruto, neto, irpf, irpf_pct, ss_trabajador, ss_empresa, variables, coste_total, conceptos, publicada_at, ocr) values
    (o, t5, 2026, 9, 'mensual', 'publicada', 'demo-docs/nominas/t5-2026-09.pdf', 'Sara El Amrani Torres', '49127705G', 2200, 1769.17, 264, 12, 166.83, 825.18, 0, 3025.18, '[{"concepto":"Salario base","importe":1804},{"concepto":"Plus de convenio","importe":396},{"concepto":"Retención IRPF (12%)","importe":-264},{"concepto":"Seguridad Social trabajador (6,5%)","importe":-166.83}]'::jsonb, '2026-09-30 18:00+01', marca);
  insert into public.nominas (owner_id, trabajador_id, anio, mes, tipo, estado, file_path, nombre_leido, dni_leido, bruto, neto, irpf, irpf_pct, ss_trabajador, ss_empresa, variables, coste_total, conceptos, publicada_at, ocr) values
    (o, t5, 2026, 10, 'mensual', 'publicada', 'demo-docs/nominas/t5-2026-10.pdf', 'Sara El Amrani Torres', '49127705G', 2200, 1769.17, 264, 12, 166.83, 825.18, 0, 3025.18, '[{"concepto":"Salario base","importe":1804},{"concepto":"Plus de convenio","importe":396},{"concepto":"Retención IRPF (12%)","importe":-264},{"concepto":"Seguridad Social trabajador (6,5%)","importe":-166.83}]'::jsonb, '2026-10-31 18:00+01', marca);

  -- ---------------------------------------------------------- Fichas de los trabajadores: categoría y notas del asesor
  insert into public.categorias_convenio (owner_id, nombre, grupo_cotizacion, salario_min_mensual, orden) values (o, 'Jefe/a de proyecto (Área 2 · Grupo A · Nivel 1)', 1, 2650, 1) returning id into x;
  update public.trabajadores set categoria_id = x, notas_asesor = 'Revisión salarial anual en septiembre. Pide reducción de jornada a partir de 2027 (cuidado de menor): preparar anexo.' where id = t1;
  insert into public.categorias_convenio (owner_id, nombre, grupo_cotizacion, salario_min_mensual, orden) values (o, 'Analista programador/a (Área 3 · Grupo B · Nivel 1)', 2, 2050, 2) returning id into x;
  update public.trabajadores set categoria_id = x, notas_asesor = 'Teletrabajo 2 días/semana. Tiene pendiente aprobar la salida del 13/11 (olvidó fichar).' where id = t2;
  insert into public.categorias_convenio (owner_id, nombre, grupo_cotizacion, salario_min_mensual, orden) values (o, 'Programador/a (Área 3 · Grupo C · Nivel 1)', 2, 1650, 3) returning id into x;
  update public.trabajadores set categoria_id = x, notas_asesor = 'Ha pedido subir el IRPF al 18% desde diciembre: aplicar en la nómina de diciembre.' where id = t3;
  insert into public.categorias_convenio (owner_id, nombre, grupo_cotizacion, salario_min_mensual, orden) values (o, 'Técnico/a comercial (Área 3 · Grupo B · Nivel 2)', 2, 1850, 4) returning id into x;
  update public.trabajadores set categoria_id = x, notas_asesor = 'Comisiones: 3% de lo cobrado de su cartera, se pagan el mes siguiente. Revisar objetivos 2027 con la empresa.' where id = t4;
  insert into public.categorias_convenio (owner_id, nombre, grupo_cotizacion, salario_min_mensual, orden) values (o, 'Técnico/a administrativo/a (Área 4 · Grupo C · Nivel 1)', 5, 1400, 5) returning id into x;
  update public.trabajadores set categoria_id = x, notas_asesor = 'Periodo de prueba superado el 06/10/2026. Lleva la parte de RR. HH.' where id = t5;

  -- Documentos del trabajador (PDF de ejemplo en clientes.nomotax.io/demo-docs/)
  insert into public.trabajador_documentos (owner_id, trabajador_id, tipo, nombre, path, anio, subido_por, created_at) values (o, t1, 'dni', 'DNI (copia)', 'demo-docs/t1-dni.pdf', null, o, '2021-09-01 10:00+01');
  insert into public.trabajador_documentos (owner_id, trabajador_id, tipo, nombre, path, anio, subido_por, created_at) values (o, t1, 'contrato', 'Contrato de trabajo indefinido', 'demo-docs/t1-contrato.pdf', null, o, '2021-09-01 10:00+01');
  insert into public.trabajador_documentos (owner_id, trabajador_id, tipo, nombre, path, anio, subido_por, created_at) values (o, t1, 'alta_ss', 'Alta en la Seguridad Social', 'demo-docs/t1-alta-ss.pdf', null, o, '2021-09-01 10:00+01');
  insert into public.trabajador_documentos (owner_id, trabajador_id, tipo, nombre, path, anio, subido_por, created_at) values (o, t1, 'teletrabajo', 'Acuerdo de teletrabajo', 'demo-docs/t1-teletrabajo.pdf', null, o, '2021-09-01 10:00+01');
  insert into public.trabajador_documentos (owner_id, trabajador_id, tipo, nombre, path, anio, subido_por, created_at) values (o, t1, 'modelo_145', 'Modelo 145', 'demo-docs/t1-modelo-145.pdf', null, o, '2026-01-02 10:00+01');
  insert into public.trabajador_documentos (owner_id, trabajador_id, tipo, nombre, path, anio, subido_por, created_at) values (o, t1, 'certificado_retenciones', 'Certificado de retenciones 2024', 'demo-docs/t1-certificado-2024.pdf', 2024, o, '2025-01-20 10:00+01');
  insert into public.trabajador_documentos (owner_id, trabajador_id, tipo, nombre, path, anio, subido_por, created_at) values (o, t1, 'certificado_retenciones', 'Certificado de retenciones 2025', 'demo-docs/t1-certificado-2025.pdf', 2025, o, '2026-01-20 10:00+01');
  insert into public.trabajador_documentos (owner_id, trabajador_id, tipo, nombre, path, anio, subido_por, created_at) values (o, t2, 'dni', 'DNI (copia)', 'demo-docs/t2-dni.pdf', null, o, '2022-09-15 10:00+01');
  insert into public.trabajador_documentos (owner_id, trabajador_id, tipo, nombre, path, anio, subido_por, created_at) values (o, t2, 'contrato', 'Contrato de trabajo indefinido', 'demo-docs/t2-contrato.pdf', null, o, '2022-09-15 10:00+01');
  insert into public.trabajador_documentos (owner_id, trabajador_id, tipo, nombre, path, anio, subido_por, created_at) values (o, t2, 'alta_ss', 'Alta en la Seguridad Social', 'demo-docs/t2-alta-ss.pdf', null, o, '2022-09-15 10:00+01');
  insert into public.trabajador_documentos (owner_id, trabajador_id, tipo, nombre, path, anio, subido_por, created_at) values (o, t2, 'teletrabajo', 'Acuerdo de teletrabajo', 'demo-docs/t2-teletrabajo.pdf', null, o, '2022-09-15 10:00+01');
  insert into public.trabajador_documentos (owner_id, trabajador_id, tipo, nombre, path, anio, subido_por, created_at) values (o, t2, 'modelo_145', 'Modelo 145', 'demo-docs/t2-modelo-145.pdf', null, o, '2026-01-02 10:00+01');
  insert into public.trabajador_documentos (owner_id, trabajador_id, tipo, nombre, path, anio, subido_por, created_at) values (o, t2, 'certificado_retenciones', 'Certificado de retenciones 2024', 'demo-docs/t2-certificado-2024.pdf', 2024, o, '2025-01-20 10:00+01');
  insert into public.trabajador_documentos (owner_id, trabajador_id, tipo, nombre, path, anio, subido_por, created_at) values (o, t2, 'certificado_retenciones', 'Certificado de retenciones 2025', 'demo-docs/t2-certificado-2025.pdf', 2025, o, '2026-01-20 10:00+01');
  insert into public.trabajador_documentos (owner_id, trabajador_id, tipo, nombre, path, anio, subido_por, created_at) values (o, t3, 'dni', 'DNI (copia)', 'demo-docs/t3-dni.pdf', null, o, '2024-02-01 10:00+01');
  insert into public.trabajador_documentos (owner_id, trabajador_id, tipo, nombre, path, anio, subido_por, created_at) values (o, t3, 'contrato', 'Contrato de trabajo indefinido', 'demo-docs/t3-contrato.pdf', null, o, '2024-02-01 10:00+01');
  insert into public.trabajador_documentos (owner_id, trabajador_id, tipo, nombre, path, anio, subido_por, created_at) values (o, t3, 'alta_ss', 'Alta en la Seguridad Social', 'demo-docs/t3-alta-ss.pdf', null, o, '2024-02-01 10:00+01');
  insert into public.trabajador_documentos (owner_id, trabajador_id, tipo, nombre, path, anio, subido_por, created_at) values (o, t3, 'teletrabajo', 'Acuerdo de teletrabajo', 'demo-docs/t3-teletrabajo.pdf', null, o, '2024-02-01 10:00+01');
  insert into public.trabajador_documentos (owner_id, trabajador_id, tipo, nombre, path, anio, subido_por, created_at) values (o, t3, 'modelo_145', 'Modelo 145', 'demo-docs/t3-modelo-145.pdf', null, o, '2026-01-02 10:00+01');
  insert into public.trabajador_documentos (owner_id, trabajador_id, tipo, nombre, path, anio, subido_por, created_at) values (o, t3, 'certificado_retenciones', 'Certificado de retenciones 2024', 'demo-docs/t3-certificado-2024.pdf', 2024, o, '2025-01-20 10:00+01');
  insert into public.trabajador_documentos (owner_id, trabajador_id, tipo, nombre, path, anio, subido_por, created_at) values (o, t3, 'certificado_retenciones', 'Certificado de retenciones 2025', 'demo-docs/t3-certificado-2025.pdf', 2025, o, '2026-01-20 10:00+01');
  insert into public.trabajador_documentos (owner_id, trabajador_id, tipo, nombre, path, anio, subido_por, created_at) values (o, t4, 'dni', 'DNI (copia)', 'demo-docs/t4-dni.pdf', null, o, '2025-01-13 10:00+01');
  insert into public.trabajador_documentos (owner_id, trabajador_id, tipo, nombre, path, anio, subido_por, created_at) values (o, t4, 'contrato', 'Contrato de trabajo indefinido', 'demo-docs/t4-contrato.pdf', null, o, '2025-01-13 10:00+01');
  insert into public.trabajador_documentos (owner_id, trabajador_id, tipo, nombre, path, anio, subido_por, created_at) values (o, t4, 'alta_ss', 'Alta en la Seguridad Social', 'demo-docs/t4-alta-ss.pdf', null, o, '2025-01-13 10:00+01');
  insert into public.trabajador_documentos (owner_id, trabajador_id, tipo, nombre, path, anio, subido_por, created_at) values (o, t4, 'teletrabajo', 'Acuerdo de teletrabajo', 'demo-docs/t4-teletrabajo.pdf', null, o, '2025-01-13 10:00+01');
  insert into public.trabajador_documentos (owner_id, trabajador_id, tipo, nombre, path, anio, subido_por, created_at) values (o, t4, 'modelo_145', 'Modelo 145', 'demo-docs/t4-modelo-145.pdf', null, o, '2026-01-02 10:00+01');
  insert into public.trabajador_documentos (owner_id, trabajador_id, tipo, nombre, path, anio, subido_por, created_at) values (o, t4, 'certificado_retenciones', 'Certificado de retenciones 2025', 'demo-docs/t4-certificado-2025.pdf', 2025, o, '2026-01-20 10:00+01');
  insert into public.trabajador_documentos (owner_id, trabajador_id, tipo, nombre, path, anio, subido_por, created_at) values (o, t5, 'dni', 'DNI (copia)', 'demo-docs/t5-dni.pdf', null, o, '2026-04-06 10:00+01');
  insert into public.trabajador_documentos (owner_id, trabajador_id, tipo, nombre, path, anio, subido_por, created_at) values (o, t5, 'contrato', 'Contrato de trabajo indefinido', 'demo-docs/t5-contrato.pdf', null, o, '2026-04-06 10:00+01');
  insert into public.trabajador_documentos (owner_id, trabajador_id, tipo, nombre, path, anio, subido_por, created_at) values (o, t5, 'alta_ss', 'Alta en la Seguridad Social', 'demo-docs/t5-alta-ss.pdf', null, o, '2026-04-06 10:00+01');
  insert into public.trabajador_documentos (owner_id, trabajador_id, tipo, nombre, path, anio, subido_por, created_at) values (o, t5, 'teletrabajo', 'Acuerdo de teletrabajo', 'demo-docs/t5-teletrabajo.pdf', null, o, '2026-04-06 10:00+01');
  insert into public.trabajador_documentos (owner_id, trabajador_id, tipo, nombre, path, anio, subido_por, created_at) values (o, t5, 'modelo_145', 'Modelo 145', 'demo-docs/t5-modelo-145.pdf', null, o, '2026-04-06 10:00+01');

  -- Accesos de los trabajadores a la empresa: Pau es comercial y el resto empleados
  insert into public.miembros (cuenta_id, user_id, email, nombre, rol, trabajador_id, invitado_por, created_at)
    values (o, 'de300000-0000-4000-8000-000000000101', 'marta.soler@nomotaxdemo.example', 'Marta Soler Vidal', 'empleado', t1, o, '2021-09-01 09:00+01');
  insert into public.miembros (cuenta_id, user_id, email, nombre, rol, trabajador_id, invitado_por, created_at)
    values (o, 'de300000-0000-4000-8000-000000000102', 'javier.ortega@nomotaxdemo.example', 'Javier Ortega Prats', 'empleado', t2, o, '2022-09-15 09:00+01');
  insert into public.miembros (cuenta_id, user_id, email, nombre, rol, trabajador_id, invitado_por, created_at)
    values (o, 'de300000-0000-4000-8000-000000000103', 'lucia.fernandez@nomotaxdemo.example', 'Lucía Fernández Gil', 'empleado', t3, o, '2024-02-01 09:00+01');
  insert into public.miembros (cuenta_id, user_id, email, nombre, rol, trabajador_id, invitado_por, created_at)
    values (o, 'de300000-0000-4000-8000-000000000104', 'pau.ribas@nomotaxdemo.example', 'Pau Ribas Comas', 'comercial', t4, o, '2025-01-13 09:00+01');
  insert into public.miembros (cuenta_id, user_id, email, nombre, rol, trabajador_id, invitado_por, created_at)
    values (o, 'de300000-0000-4000-8000-000000000105', 'sara.el@nomotaxdemo.example', 'Sara El Amrani Torres', 'empleado', t5, o, '2026-04-06 09:00+01');
  -- Fichan con la app (columna de fichajes.sql)
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'miembros' and column_name = 'fichaje') then
    execute 'update public.miembros set fichaje = true where cuenta_id = $1 and user_id::text like ''de300000-0000-4000-8000-0000000001%''' using o;
  end if;

  -- Tickets de gasto subidos por los trabajadores (pendientes de revisar)
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, total, estado, pagado, naturaleza, file_path, subido_por, created_at, ocr) values
    (o, '2026-11-05', 'Restaurant El Racó del Port (ejemplo)', 'B08402117', 'T1000', 'Comida con cliente: Costa Brava Homes', 'viajes', 96.36, 10, 9.64, 106, 'pendiente', false, 'gasto', 'demo-docs/tickets/ticket-1.pdf', 'de300000-0000-4000-8000-000000000104', '2026-11-05 13:42+01', marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, total, estado, pagado, naturaleza, file_path, subido_por, created_at, ocr) values
    (o, '2026-11-12', 'Taxi licencia 0451 (ejemplo)', '46789012C', 'T2371', 'Taxi vuelta de reunión en Sant Cugat', 'viajes', 35, 10, 3.5, 38.5, 'pendiente', false, 'gasto', 'demo-docs/tickets/ticket-2.pdf', 'de300000-0000-4000-8000-000000000104', '2026-11-12 19:05+01', marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, total, estado, pagado, naturaleza, file_path, subido_por, created_at, ocr) values
    (o, '2026-11-19', 'Trens del Litoral (ejemplo)', 'A08518706', 'T3742', 'Tren a Girona: visita a Costa Brava Homes', 'viajes', 29.45, 10, 2.95, 32.4, 'pendiente', false, 'gasto', 'demo-docs/tickets/ticket-3.pdf', 'de300000-0000-4000-8000-000000000104', '2026-11-19 08:10+01', marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, total, estado, pagado, naturaleza, file_path, subido_por, created_at, ocr) values
    (o, '2026-11-07', 'Parking Centre Gràcia (ejemplo)', 'B08620445', 'T5113', 'Parking visita a Logística Ebro Norte', 'vehiculo', 9.83, 21, 2.07, 11.9, 'pendiente', false, 'gasto', 'demo-docs/tickets/ticket-4.pdf', 'de300000-0000-4000-8000-000000000102', '2026-11-07 18:30+01', marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, total, estado, pagado, naturaleza, file_path, subido_por, created_at, ocr) values
    (o, '2026-11-14', 'Tecnoshop Catalunya (ejemplo)', 'B08773012', 'T6484', 'Ratón y alfombrilla para teletrabajo', 'material', 41.31, 21, 8.67, 49.98, 'pendiente', false, 'gasto', 'demo-docs/tickets/ticket-5.pdf', 'de300000-0000-4000-8000-000000000103', '2026-11-14 11:20+01', marca);
  insert into public.expenses (owner_id, fecha, proveedor, proveedor_nif, numero, concepto, categoria, base, iva_pct, cuota_iva, total, estado, pagado, naturaleza, file_path, subido_por, created_at, ocr) values
    (o, '2026-11-20', 'Restaurante Jardí Eixample (ejemplo)', 'B08815904', 'T7855', 'Comida de kick-off con Grupo Hotelero', 'viajes', 95.91, 10, 9.59, 105.5, 'pendiente', false, 'gasto', 'demo-docs/tickets/ticket-6.pdf', 'de300000-0000-4000-8000-000000000101', '2026-11-20 14:15+01', marca);

  -- ---------------------------------------------------------- Registro de jornada (septiembre a hoy)
  if to_regclass('public.fichajes') is not null then
    insert into public.fichajes (owner_id, trabajador_id, tipo, momento, origen, estado, registrado_por)
    select o, (array[t1, t2, t3, t4, t5])[r.t], r.tipo, (r.dia || ' ' || r.hora)::timestamp at time zone 'Europe/Madrid', 'app', 'valido',
           (array['de300000-0000-4000-8000-000000000101'::uuid, 'de300000-0000-4000-8000-000000000102'::uuid, 'de300000-0000-4000-8000-000000000103'::uuid, 'de300000-0000-4000-8000-000000000104'::uuid, 'de300000-0000-4000-8000-000000000105'::uuid])[r.t]
    from (values
      (1, '2026-09-01', '08:52', 'entrada'),
      (1, '2026-09-01', '14:04', 'pausa'),
      (1, '2026-09-01', '14:47', 'reanudar'),
      (1, '2026-09-01', '18:21', 'salida'),
      (1, '2026-09-02', '08:51', 'entrada'),
      (1, '2026-09-02', '14:00', 'pausa'),
      (1, '2026-09-02', '14:55', 'reanudar'),
      (1, '2026-09-02', '18:18', 'salida'),
      (1, '2026-09-03', '08:56', 'entrada'),
      (1, '2026-09-03', '14:07', 'pausa'),
      (1, '2026-09-03', '14:45', 'reanudar'),
      (1, '2026-09-03', '18:10', 'salida'),
      (1, '2026-09-04', '07:58', 'entrada'),
      (1, '2026-09-04', '15:09', 'salida'),
      (1, '2026-09-07', '09:07', 'entrada'),
      (1, '2026-09-07', '14:05', 'pausa'),
      (1, '2026-09-07', '14:53', 'reanudar'),
      (1, '2026-09-07', '18:21', 'salida'),
      (1, '2026-09-08', '08:54', 'entrada'),
      (1, '2026-09-08', '14:08', 'pausa'),
      (1, '2026-09-08', '14:49', 'reanudar'),
      (1, '2026-09-08', '18:22', 'salida'),
      (1, '2026-09-09', '08:54', 'entrada'),
      (1, '2026-09-09', '14:09', 'pausa'),
      (1, '2026-09-09', '14:53', 'reanudar'),
      (1, '2026-09-09', '18:03', 'salida'),
      (1, '2026-09-10', '09:02', 'entrada'),
      (1, '2026-09-10', '14:06', 'pausa'),
      (1, '2026-09-10', '14:47', 'reanudar'),
      (1, '2026-09-10', '18:23', 'salida'),
      (1, '2026-09-14', '09:02', 'entrada'),
      (1, '2026-09-14', '14:08', 'pausa'),
      (1, '2026-09-14', '14:53', 'reanudar'),
      (1, '2026-09-14', '18:02', 'salida'),
      (1, '2026-09-15', '09:08', 'entrada'),
      (1, '2026-09-15', '14:10', 'pausa'),
      (1, '2026-09-15', '14:48', 'reanudar'),
      (1, '2026-09-15', '18:00', 'salida'),
      (1, '2026-09-16', '08:50', 'entrada'),
      (1, '2026-09-16', '14:00', 'pausa'),
      (1, '2026-09-16', '14:49', 'reanudar'),
      (1, '2026-09-16', '18:09', 'salida'),
      (1, '2026-09-17', '09:04', 'entrada'),
      (1, '2026-09-17', '14:05', 'pausa'),
      (1, '2026-09-17', '14:51', 'reanudar'),
      (1, '2026-09-17', '18:19', 'salida'),
      (1, '2026-09-18', '08:00', 'entrada'),
      (1, '2026-09-18', '15:01', 'salida'),
      (1, '2026-09-21', '09:00', 'entrada'),
      (1, '2026-09-21', '14:03', 'pausa'),
      (1, '2026-09-21', '14:50', 'reanudar'),
      (1, '2026-09-21', '18:01', 'salida'),
      (1, '2026-09-22', '08:48', 'entrada'),
      (1, '2026-09-22', '14:04', 'pausa'),
      (1, '2026-09-22', '14:47', 'reanudar'),
      (1, '2026-09-22', '18:21', 'salida'),
      (1, '2026-09-23', '08:54', 'entrada'),
      (1, '2026-09-23', '14:08', 'pausa'),
      (1, '2026-09-23', '14:49', 'reanudar'),
      (1, '2026-09-23', '18:24', 'salida'),
      (1, '2026-09-25', '08:04', 'entrada'),
      (1, '2026-09-25', '15:07', 'salida'),
      (1, '2026-09-28', '09:00', 'entrada'),
      (1, '2026-09-28', '14:08', 'pausa'),
      (1, '2026-09-28', '14:45', 'reanudar'),
      (1, '2026-09-28', '18:19', 'salida'),
      (1, '2026-09-29', '09:04', 'entrada'),
      (1, '2026-09-29', '14:08', 'pausa'),
      (1, '2026-09-29', '14:46', 'reanudar'),
      (1, '2026-09-29', '18:08', 'salida'),
      (1, '2026-09-30', '08:57', 'entrada'),
      (1, '2026-09-30', '14:02', 'pausa'),
      (1, '2026-09-30', '14:45', 'reanudar'),
      (1, '2026-09-30', '18:15', 'salida'),
      (1, '2026-10-01', '09:08', 'entrada'),
      (1, '2026-10-01', '14:01', 'pausa'),
      (1, '2026-10-01', '14:48', 'reanudar'),
      (1, '2026-10-01', '18:09', 'salida'),
      (1, '2026-10-02', '08:03', 'entrada'),
      (1, '2026-10-02', '15:00', 'salida'),
      (1, '2026-10-13', '08:47', 'entrada'),
      (1, '2026-10-13', '14:02', 'pausa'),
      (1, '2026-10-13', '14:49', 'reanudar'),
      (1, '2026-10-13', '18:16', 'salida'),
      (1, '2026-10-14', '08:49', 'entrada'),
      (1, '2026-10-14', '14:06', 'pausa'),
      (1, '2026-10-14', '14:52', 'reanudar'),
      (1, '2026-10-14', '18:16', 'salida'),
      (1, '2026-10-15', '08:50', 'entrada'),
      (1, '2026-10-15', '14:04', 'pausa'),
      (1, '2026-10-15', '14:50', 'reanudar'),
      (1, '2026-10-15', '18:09', 'salida'),
      (1, '2026-10-16', '07:54', 'entrada'),
      (1, '2026-10-16', '15:11', 'salida'),
      (1, '2026-10-19', '09:06', 'entrada'),
      (1, '2026-10-19', '14:07', 'pausa'),
      (1, '2026-10-19', '14:53', 'reanudar'),
      (1, '2026-10-19', '18:25', 'salida'),
      (1, '2026-10-20', '09:08', 'entrada'),
      (1, '2026-10-20', '14:05', 'pausa'),
      (1, '2026-10-20', '14:49', 'reanudar'),
      (1, '2026-10-20', '18:25', 'salida'),
      (1, '2026-10-21', '09:02', 'entrada'),
      (1, '2026-10-21', '14:04', 'pausa'),
      (1, '2026-10-21', '14:51', 'reanudar'),
      (1, '2026-10-21', '18:06', 'salida'),
      (1, '2026-10-22', '08:48', 'entrada'),
      (1, '2026-10-22', '14:05', 'pausa'),
      (1, '2026-10-22', '14:55', 'reanudar'),
      (1, '2026-10-22', '18:03', 'salida'),
      (1, '2026-10-23', '07:56', 'entrada'),
      (1, '2026-10-23', '15:08', 'salida'),
      (1, '2026-10-26', '08:49', 'entrada'),
      (1, '2026-10-26', '14:04', 'pausa'),
      (1, '2026-10-26', '14:53', 'reanudar'),
      (1, '2026-10-26', '18:10', 'salida'),
      (1, '2026-10-27', '08:57', 'entrada'),
      (1, '2026-10-27', '14:08', 'pausa'),
      (1, '2026-10-27', '14:53', 'reanudar'),
      (1, '2026-10-27', '18:04', 'salida'),
      (1, '2026-10-28', '09:00', 'entrada'),
      (1, '2026-10-28', '14:03', 'pausa'),
      (1, '2026-10-28', '14:49', 'reanudar'),
      (1, '2026-10-28', '18:18', 'salida'),
      (1, '2026-10-29', '08:48', 'entrada'),
      (1, '2026-10-29', '14:08', 'pausa'),
      (1, '2026-10-29', '14:55', 'reanudar'),
      (1, '2026-10-29', '18:12', 'salida'),
      (1, '2026-10-30', '07:54', 'entrada'),
      (1, '2026-10-30', '15:09', 'salida'),
      (1, '2026-11-03', '08:59', 'entrada'),
      (1, '2026-11-03', '14:04', 'pausa'),
      (1, '2026-11-03', '14:50', 'reanudar'),
      (1, '2026-11-03', '18:25', 'salida'),
      (1, '2026-11-04', '09:01', 'entrada'),
      (1, '2026-11-04', '14:04', 'pausa'),
      (1, '2026-11-04', '14:49', 'reanudar'),
      (1, '2026-11-04', '18:15', 'salida'),
      (1, '2026-11-05', '08:54', 'entrada'),
      (1, '2026-11-05', '14:00', 'pausa'),
      (1, '2026-11-05', '14:45', 'reanudar'),
      (1, '2026-11-05', '18:17', 'salida'),
      (1, '2026-11-06', '07:57', 'entrada'),
      (1, '2026-11-06', '15:08', 'salida'),
      (1, '2026-11-09', '08:55', 'entrada'),
      (1, '2026-11-09', '14:06', 'pausa'),
      (1, '2026-11-09', '14:53', 'reanudar'),
      (1, '2026-11-09', '18:04', 'salida'),
      (1, '2026-11-10', '09:09', 'entrada'),
      (1, '2026-11-10', '14:04', 'pausa'),
      (1, '2026-11-10', '14:52', 'reanudar'),
      (1, '2026-11-10', '18:24', 'salida'),
      (1, '2026-11-11', '08:50', 'entrada'),
      (1, '2026-11-11', '14:03', 'pausa'),
      (1, '2026-11-11', '14:48', 'reanudar'),
      (1, '2026-11-11', '18:06', 'salida'),
      (1, '2026-11-12', '08:55', 'entrada'),
      (1, '2026-11-12', '14:01', 'pausa'),
      (1, '2026-11-12', '14:55', 'reanudar'),
      (1, '2026-11-12', '18:09', 'salida'),
      (1, '2026-11-13', '07:54', 'entrada'),
      (1, '2026-11-13', '15:02', 'salida'),
      (1, '2026-11-16', '08:54', 'entrada'),
      (1, '2026-11-16', '14:04', 'pausa'),
      (1, '2026-11-16', '14:47', 'reanudar'),
      (1, '2026-11-16', '18:03', 'salida'),
      (1, '2026-11-17', '09:09', 'entrada'),
      (1, '2026-11-17', '14:07', 'pausa'),
      (1, '2026-11-17', '14:47', 'reanudar'),
      (1, '2026-11-17', '18:24', 'salida'),
      (1, '2026-11-18', '09:06', 'entrada'),
      (1, '2026-11-18', '14:07', 'pausa'),
      (1, '2026-11-18', '14:45', 'reanudar'),
      (1, '2026-11-18', '18:08', 'salida'),
      (1, '2026-11-19', '09:03', 'entrada'),
      (1, '2026-11-19', '14:02', 'pausa'),
      (1, '2026-11-19', '14:46', 'reanudar'),
      (1, '2026-11-19', '18:08', 'salida'),
      (1, '2026-11-20', '07:55', 'entrada'),
      (1, '2026-11-20', '15:01', 'salida'),
      (1, '2026-11-23', '09:02', 'entrada'),
      (1, '2026-11-23', '14:02', 'pausa'),
      (1, '2026-11-23', '14:50', 'reanudar'),
      (1, '2026-11-23', '18:20', 'salida'),
      (1, '2026-11-24', '08:48', 'entrada'),
      (1, '2026-11-24', '14:06', 'pausa'),
      (1, '2026-11-24', '14:47', 'reanudar'),
      (1, '2026-11-24', '18:02', 'salida'),
      (1, '2026-11-25', '08:50', 'entrada'),
      (1, '2026-11-25', '14:02', 'pausa'),
      (1, '2026-11-25', '14:48', 'reanudar'),
      (2, '2026-09-01', '08:53', 'entrada'),
      (2, '2026-09-01', '14:08', 'pausa'),
      (2, '2026-09-01', '14:54', 'reanudar'),
      (2, '2026-09-01', '18:04', 'salida'),
      (2, '2026-09-02', '08:59', 'entrada'),
      (2, '2026-09-02', '14:06', 'pausa'),
      (2, '2026-09-02', '14:47', 'reanudar'),
      (2, '2026-09-02', '18:09', 'salida'),
      (2, '2026-09-03', '08:56', 'entrada'),
      (2, '2026-09-03', '14:03', 'pausa'),
      (2, '2026-09-03', '14:45', 'reanudar'),
      (2, '2026-09-03', '18:01', 'salida'),
      (2, '2026-09-04', '07:53', 'entrada'),
      (2, '2026-09-04', '15:05', 'salida'),
      (2, '2026-09-07', '08:58', 'entrada'),
      (2, '2026-09-07', '14:05', 'pausa'),
      (2, '2026-09-07', '14:50', 'reanudar'),
      (2, '2026-09-07', '18:22', 'salida'),
      (2, '2026-09-08', '08:47', 'entrada'),
      (2, '2026-09-08', '14:07', 'pausa'),
      (2, '2026-09-08', '14:50', 'reanudar'),
      (2, '2026-09-08', '18:12', 'salida'),
      (2, '2026-09-09', '09:09', 'entrada'),
      (2, '2026-09-09', '14:06', 'pausa'),
      (2, '2026-09-09', '14:50', 'reanudar'),
      (2, '2026-09-09', '18:17', 'salida'),
      (2, '2026-09-10', '09:10', 'entrada'),
      (2, '2026-09-10', '14:04', 'pausa'),
      (2, '2026-09-10', '14:47', 'reanudar'),
      (2, '2026-09-10', '18:00', 'salida'),
      (2, '2026-09-14', '09:08', 'entrada'),
      (2, '2026-09-14', '14:01', 'pausa'),
      (2, '2026-09-14', '14:50', 'reanudar'),
      (2, '2026-09-14', '18:09', 'salida'),
      (2, '2026-09-15', '08:52', 'entrada'),
      (2, '2026-09-15', '14:02', 'pausa'),
      (2, '2026-09-15', '14:50', 'reanudar'),
      (2, '2026-09-15', '18:25', 'salida'),
      (2, '2026-09-16', '09:10', 'entrada'),
      (2, '2026-09-16', '14:10', 'pausa'),
      (2, '2026-09-16', '14:46', 'reanudar'),
      (2, '2026-09-16', '18:25', 'salida'),
      (2, '2026-09-17', '09:00', 'entrada'),
      (2, '2026-09-17', '14:02', 'pausa'),
      (2, '2026-09-17', '14:45', 'reanudar'),
      (2, '2026-09-17', '18:17', 'salida'),
      (2, '2026-09-18', '08:04', 'entrada'),
      (2, '2026-09-18', '15:03', 'salida'),
      (2, '2026-09-21', '09:02', 'entrada'),
      (2, '2026-09-21', '14:02', 'pausa'),
      (2, '2026-09-21', '14:47', 'reanudar'),
      (2, '2026-09-21', '18:23', 'salida'),
      (2, '2026-09-22', '09:03', 'entrada'),
      (2, '2026-09-22', '14:07', 'pausa'),
      (2, '2026-09-22', '14:49', 'reanudar'),
      (2, '2026-09-22', '18:20', 'salida'),
      (2, '2026-09-23', '09:04', 'entrada'),
      (2, '2026-09-23', '14:05', 'pausa'),
      (2, '2026-09-23', '14:54', 'reanudar'),
      (2, '2026-09-23', '18:18', 'salida'),
      (2, '2026-09-25', '07:58', 'entrada'),
      (2, '2026-09-25', '15:07', 'salida'),
      (2, '2026-09-28', '09:09', 'entrada'),
      (2, '2026-09-28', '14:08', 'pausa'),
      (2, '2026-09-28', '14:46', 'reanudar'),
      (2, '2026-09-28', '18:03', 'salida'),
      (2, '2026-09-29', '09:07', 'entrada'),
      (2, '2026-09-29', '14:09', 'pausa'),
      (2, '2026-09-29', '14:45', 'reanudar'),
      (2, '2026-09-29', '18:08', 'salida'),
      (2, '2026-09-30', '08:57', 'entrada'),
      (2, '2026-09-30', '14:04', 'pausa'),
      (2, '2026-09-30', '14:46', 'reanudar'),
      (2, '2026-09-30', '18:24', 'salida'),
      (2, '2026-10-01', '08:55', 'entrada'),
      (2, '2026-10-01', '14:05', 'pausa'),
      (2, '2026-10-01', '14:45', 'reanudar'),
      (2, '2026-10-01', '18:19', 'salida'),
      (2, '2026-10-02', '07:55', 'entrada'),
      (2, '2026-10-02', '15:02', 'salida'),
      (2, '2026-10-05', '08:48', 'entrada'),
      (2, '2026-10-05', '14:08', 'pausa'),
      (2, '2026-10-05', '14:50', 'reanudar'),
      (2, '2026-10-05', '18:16', 'salida'),
      (2, '2026-10-06', '09:10', 'entrada'),
      (2, '2026-10-06', '14:08', 'pausa'),
      (2, '2026-10-06', '14:49', 'reanudar'),
      (2, '2026-10-06', '18:24', 'salida'),
      (2, '2026-10-07', '09:03', 'entrada'),
      (2, '2026-10-07', '14:01', 'pausa'),
      (2, '2026-10-07', '14:55', 'reanudar'),
      (2, '2026-10-07', '18:24', 'salida'),
      (2, '2026-10-08', '08:55', 'entrada'),
      (2, '2026-10-08', '14:01', 'pausa'),
      (2, '2026-10-08', '14:48', 'reanudar'),
      (2, '2026-10-08', '18:18', 'salida'),
      (2, '2026-10-09', '08:04', 'entrada'),
      (2, '2026-10-09', '15:12', 'salida'),
      (2, '2026-10-13', '09:01', 'entrada'),
      (2, '2026-10-13', '14:01', 'pausa'),
      (2, '2026-10-13', '14:54', 'reanudar'),
      (2, '2026-10-13', '18:25', 'salida'),
      (2, '2026-10-14', '08:53', 'entrada'),
      (2, '2026-10-14', '14:01', 'pausa'),
      (2, '2026-10-14', '14:45', 'reanudar'),
      (2, '2026-10-14', '18:17', 'salida'),
      (2, '2026-10-15', '08:59', 'entrada'),
      (2, '2026-10-15', '14:04', 'pausa'),
      (2, '2026-10-15', '14:53', 'reanudar'),
      (2, '2026-10-15', '18:10', 'salida'),
      (2, '2026-10-16', '08:02', 'entrada'),
      (2, '2026-10-16', '15:05', 'salida'),
      (2, '2026-10-19', '08:57', 'entrada'),
      (2, '2026-10-19', '14:08', 'pausa'),
      (2, '2026-10-19', '14:52', 'reanudar'),
      (2, '2026-10-19', '18:17', 'salida'),
      (2, '2026-10-20', '08:49', 'entrada'),
      (2, '2026-10-20', '14:04', 'pausa'),
      (2, '2026-10-20', '14:51', 'reanudar'),
      (2, '2026-10-20', '18:21', 'salida'),
      (2, '2026-10-21', '08:54', 'entrada'),
      (2, '2026-10-21', '14:03', 'pausa'),
      (2, '2026-10-21', '14:54', 'reanudar'),
      (2, '2026-10-21', '18:15', 'salida'),
      (2, '2026-10-22', '08:53', 'entrada'),
      (2, '2026-10-22', '14:07', 'pausa'),
      (2, '2026-10-22', '14:55', 'reanudar'),
      (2, '2026-10-22', '18:11', 'salida'),
      (2, '2026-10-23', '07:59', 'entrada'),
      (2, '2026-10-23', '15:03', 'salida'),
      (2, '2026-10-26', '09:00', 'entrada'),
      (2, '2026-10-26', '14:07', 'pausa'),
      (2, '2026-10-26', '14:46', 'reanudar'),
      (2, '2026-10-26', '18:19', 'salida'),
      (2, '2026-10-27', '08:45', 'entrada'),
      (2, '2026-10-27', '14:04', 'pausa'),
      (2, '2026-10-27', '14:54', 'reanudar'),
      (2, '2026-10-27', '18:05', 'salida'),
      (2, '2026-10-28', '09:07', 'entrada'),
      (2, '2026-10-28', '14:08', 'pausa'),
      (2, '2026-10-28', '14:48', 'reanudar'),
      (2, '2026-10-28', '18:11', 'salida'),
      (2, '2026-10-29', '08:45', 'entrada'),
      (2, '2026-10-29', '14:08', 'pausa'),
      (2, '2026-10-29', '14:49', 'reanudar'),
      (2, '2026-10-29', '18:00', 'salida'),
      (2, '2026-10-30', '07:51', 'entrada'),
      (2, '2026-10-30', '15:03', 'salida'),
      (2, '2026-11-03', '08:48', 'entrada'),
      (2, '2026-11-03', '14:04', 'pausa'),
      (2, '2026-11-03', '14:49', 'reanudar'),
      (2, '2026-11-03', '18:19', 'salida'),
      (2, '2026-11-04', '09:00', 'entrada'),
      (2, '2026-11-04', '14:00', 'pausa'),
      (2, '2026-11-04', '14:45', 'reanudar'),
      (2, '2026-11-04', '18:17', 'salida'),
      (2, '2026-11-05', '09:09', 'entrada'),
      (2, '2026-11-05', '14:10', 'pausa'),
      (2, '2026-11-05', '14:50', 'reanudar'),
      (2, '2026-11-05', '18:18', 'salida'),
      (2, '2026-11-06', '07:56', 'entrada'),
      (2, '2026-11-06', '15:09', 'salida'),
      (2, '2026-11-09', '08:57', 'entrada'),
      (2, '2026-11-09', '14:03', 'pausa'),
      (2, '2026-11-09', '14:53', 'reanudar'),
      (2, '2026-11-09', '18:21', 'salida'),
      (2, '2026-11-10', '08:53', 'entrada'),
      (2, '2026-11-10', '14:05', 'pausa'),
      (2, '2026-11-10', '14:46', 'reanudar'),
      (2, '2026-11-10', '18:00', 'salida'),
      (2, '2026-11-11', '09:09', 'entrada'),
      (2, '2026-11-11', '14:04', 'pausa'),
      (2, '2026-11-11', '14:54', 'reanudar'),
      (2, '2026-11-11', '18:17', 'salida'),
      (2, '2026-11-12', '09:05', 'entrada'),
      (2, '2026-11-12', '14:01', 'pausa'),
      (2, '2026-11-12', '14:52', 'reanudar'),
      (2, '2026-11-12', '18:16', 'salida'),
      (2, '2026-11-13', '08:01', 'entrada'),
      (2, '2026-11-13', '15:12', 'salida'),
      (2, '2026-11-16', '08:51', 'entrada'),
      (2, '2026-11-16', '14:01', 'pausa'),
      (2, '2026-11-16', '14:45', 'reanudar'),
      (2, '2026-11-16', '18:14', 'salida'),
      (2, '2026-11-17', '08:49', 'entrada'),
      (2, '2026-11-17', '14:06', 'pausa'),
      (2, '2026-11-17', '14:46', 'reanudar'),
      (2, '2026-11-17', '18:05', 'salida'),
      (2, '2026-11-18', '08:48', 'entrada'),
      (2, '2026-11-18', '14:04', 'pausa'),
      (2, '2026-11-18', '14:54', 'reanudar'),
      (2, '2026-11-18', '18:07', 'salida'),
      (2, '2026-11-19', '08:54', 'entrada'),
      (2, '2026-11-19', '14:07', 'pausa'),
      (2, '2026-11-19', '14:55', 'reanudar'),
      (2, '2026-11-19', '18:08', 'salida'),
      (2, '2026-11-20', '08:02', 'entrada'),
      (2, '2026-11-20', '15:10', 'salida'),
      (2, '2026-11-23', '09:04', 'entrada'),
      (2, '2026-11-23', '14:07', 'pausa'),
      (2, '2026-11-23', '14:55', 'reanudar'),
      (2, '2026-11-23', '18:08', 'salida'),
      (2, '2026-11-24', '08:51', 'entrada'),
      (2, '2026-11-24', '14:05', 'pausa'),
      (2, '2026-11-24', '14:53', 'reanudar'),
      (2, '2026-11-24', '18:19', 'salida'),
      (2, '2026-11-25', '08:48', 'entrada'),
      (2, '2026-11-25', '14:10', 'pausa'),
      (2, '2026-11-25', '14:49', 'reanudar'),
      (3, '2026-09-01', '08:45', 'entrada'),
      (3, '2026-09-01', '14:05', 'pausa'),
      (3, '2026-09-01', '14:46', 'reanudar'),
      (3, '2026-09-01', '18:21', 'salida'),
      (3, '2026-09-02', '08:57', 'entrada'),
      (3, '2026-09-02', '14:09', 'pausa'),
      (3, '2026-09-02', '14:47', 'reanudar'),
      (3, '2026-09-02', '18:25', 'salida'),
      (3, '2026-09-03', '09:05', 'entrada'),
      (3, '2026-09-03', '14:07', 'pausa'),
      (3, '2026-09-03', '14:51', 'reanudar'),
      (3, '2026-09-03', '18:12', 'salida'),
      (3, '2026-09-04', '07:54', 'entrada'),
      (3, '2026-09-04', '15:12', 'salida'),
      (3, '2026-09-07', '09:08', 'entrada'),
      (3, '2026-09-07', '14:04', 'pausa'),
      (3, '2026-09-07', '14:55', 'reanudar'),
      (3, '2026-09-07', '18:23', 'salida'),
      (3, '2026-09-08', '08:48', 'entrada'),
      (3, '2026-09-08', '14:09', 'pausa'),
      (3, '2026-09-08', '14:53', 'reanudar'),
      (3, '2026-09-08', '18:07', 'salida'),
      (3, '2026-09-09', '09:10', 'entrada'),
      (3, '2026-09-09', '14:09', 'pausa'),
      (3, '2026-09-09', '14:51', 'reanudar'),
      (3, '2026-09-09', '18:13', 'salida'),
      (3, '2026-09-10', '08:53', 'entrada'),
      (3, '2026-09-10', '14:10', 'pausa'),
      (3, '2026-09-10', '14:53', 'reanudar'),
      (3, '2026-09-10', '18:23', 'salida'),
      (3, '2026-09-14', '09:04', 'entrada'),
      (3, '2026-09-14', '14:03', 'pausa'),
      (3, '2026-09-14', '14:49', 'reanudar'),
      (3, '2026-09-14', '18:04', 'salida'),
      (3, '2026-09-15', '09:05', 'entrada'),
      (3, '2026-09-15', '14:03', 'pausa'),
      (3, '2026-09-15', '14:50', 'reanudar'),
      (3, '2026-09-15', '18:13', 'salida'),
      (3, '2026-09-16', '08:57', 'entrada'),
      (3, '2026-09-16', '14:03', 'pausa'),
      (3, '2026-09-16', '14:46', 'reanudar'),
      (3, '2026-09-16', '18:16', 'salida'),
      (3, '2026-09-17', '08:52', 'entrada'),
      (3, '2026-09-17', '14:06', 'pausa'),
      (3, '2026-09-17', '14:55', 'reanudar'),
      (3, '2026-09-17', '18:06', 'salida'),
      (3, '2026-09-18', '07:53', 'entrada'),
      (3, '2026-09-18', '15:04', 'salida'),
      (3, '2026-09-21', '08:58', 'entrada'),
      (3, '2026-09-21', '14:05', 'pausa'),
      (3, '2026-09-21', '14:55', 'reanudar'),
      (3, '2026-09-21', '18:03', 'salida'),
      (3, '2026-09-22', '08:45', 'entrada'),
      (3, '2026-09-22', '14:09', 'pausa'),
      (3, '2026-09-22', '14:47', 'reanudar'),
      (3, '2026-09-22', '18:11', 'salida'),
      (3, '2026-09-23', '08:47', 'entrada'),
      (3, '2026-09-23', '14:02', 'pausa'),
      (3, '2026-09-23', '14:47', 'reanudar'),
      (3, '2026-09-23', '18:24', 'salida'),
      (3, '2026-09-25', '07:50', 'entrada'),
      (3, '2026-09-25', '15:04', 'salida'),
      (3, '2026-09-28', '09:01', 'entrada'),
      (3, '2026-09-28', '14:10', 'pausa'),
      (3, '2026-09-28', '14:49', 'reanudar'),
      (3, '2026-09-28', '18:04', 'salida'),
      (3, '2026-09-29', '08:50', 'entrada'),
      (3, '2026-09-29', '14:09', 'pausa'),
      (3, '2026-09-29', '14:46', 'reanudar'),
      (3, '2026-09-29', '18:06', 'salida'),
      (3, '2026-09-30', '08:47', 'entrada'),
      (3, '2026-09-30', '14:09', 'pausa'),
      (3, '2026-09-30', '14:51', 'reanudar'),
      (3, '2026-09-30', '18:00', 'salida'),
      (3, '2026-10-01', '08:49', 'entrada'),
      (3, '2026-10-01', '14:04', 'pausa'),
      (3, '2026-10-01', '14:49', 'reanudar'),
      (3, '2026-10-01', '18:11', 'salida'),
      (3, '2026-10-02', '07:51', 'entrada'),
      (3, '2026-10-02', '15:01', 'salida'),
      (3, '2026-10-05', '08:48', 'entrada'),
      (3, '2026-10-05', '14:03', 'pausa'),
      (3, '2026-10-05', '14:45', 'reanudar'),
      (3, '2026-10-05', '18:12', 'salida'),
      (3, '2026-10-06', '08:59', 'entrada'),
      (3, '2026-10-06', '14:01', 'pausa'),
      (3, '2026-10-06', '14:54', 'reanudar'),
      (3, '2026-10-06', '18:15', 'salida'),
      (3, '2026-10-07', '09:08', 'entrada'),
      (3, '2026-10-07', '14:00', 'pausa'),
      (3, '2026-10-07', '14:46', 'reanudar'),
      (3, '2026-10-07', '18:01', 'salida'),
      (3, '2026-10-08', '08:53', 'entrada'),
      (3, '2026-10-08', '14:03', 'pausa'),
      (3, '2026-10-08', '14:49', 'reanudar'),
      (3, '2026-10-08', '18:13', 'salida'),
      (3, '2026-10-09', '07:58', 'entrada'),
      (3, '2026-10-09', '15:08', 'salida'),
      (3, '2026-10-13', '08:53', 'entrada'),
      (3, '2026-10-13', '14:09', 'pausa'),
      (3, '2026-10-13', '14:52', 'reanudar'),
      (3, '2026-10-13', '18:25', 'salida'),
      (3, '2026-10-14', '09:05', 'entrada'),
      (3, '2026-10-14', '14:05', 'pausa'),
      (3, '2026-10-14', '14:48', 'reanudar'),
      (3, '2026-10-14', '18:11', 'salida'),
      (3, '2026-10-15', '08:49', 'entrada'),
      (3, '2026-10-15', '14:02', 'pausa'),
      (3, '2026-10-15', '14:47', 'reanudar'),
      (3, '2026-10-15', '18:23', 'salida'),
      (3, '2026-10-16', '07:54', 'entrada'),
      (3, '2026-10-16', '15:06', 'salida'),
      (3, '2026-10-19', '09:10', 'entrada'),
      (3, '2026-10-19', '14:01', 'pausa'),
      (3, '2026-10-19', '14:54', 'reanudar'),
      (3, '2026-10-19', '18:05', 'salida'),
      (3, '2026-10-20', '08:54', 'entrada'),
      (3, '2026-10-20', '14:04', 'pausa'),
      (3, '2026-10-20', '14:45', 'reanudar'),
      (3, '2026-10-20', '18:10', 'salida'),
      (3, '2026-10-21', '09:10', 'entrada'),
      (3, '2026-10-21', '14:08', 'pausa'),
      (3, '2026-10-21', '14:51', 'reanudar'),
      (3, '2026-10-21', '18:05', 'salida'),
      (3, '2026-10-22', '08:48', 'entrada'),
      (3, '2026-10-22', '14:03', 'pausa'),
      (3, '2026-10-22', '14:49', 'reanudar'),
      (3, '2026-10-22', '18:25', 'salida'),
      (3, '2026-10-23', '08:00', 'entrada'),
      (3, '2026-10-23', '15:12', 'salida'),
      (3, '2026-10-26', '08:59', 'entrada'),
      (3, '2026-10-26', '14:01', 'pausa'),
      (3, '2026-10-26', '14:46', 'reanudar'),
      (3, '2026-10-26', '18:02', 'salida'),
      (3, '2026-10-27', '08:59', 'entrada'),
      (3, '2026-10-27', '14:09', 'pausa'),
      (3, '2026-10-27', '14:53', 'reanudar'),
      (3, '2026-10-27', '18:18', 'salida'),
      (3, '2026-10-28', '09:02', 'entrada'),
      (3, '2026-10-28', '14:07', 'pausa'),
      (3, '2026-10-28', '14:50', 'reanudar'),
      (3, '2026-10-28', '18:25', 'salida'),
      (3, '2026-10-29', '08:49', 'entrada'),
      (3, '2026-10-29', '14:06', 'pausa'),
      (3, '2026-10-29', '14:48', 'reanudar'),
      (3, '2026-10-29', '18:12', 'salida'),
      (3, '2026-10-30', '08:01', 'entrada'),
      (3, '2026-10-30', '15:07', 'salida'),
      (3, '2026-11-09', '08:50', 'entrada'),
      (3, '2026-11-09', '14:02', 'pausa'),
      (3, '2026-11-09', '14:47', 'reanudar'),
      (3, '2026-11-09', '18:14', 'salida'),
      (3, '2026-11-10', '08:54', 'entrada'),
      (3, '2026-11-10', '14:07', 'pausa'),
      (3, '2026-11-10', '14:52', 'reanudar'),
      (3, '2026-11-10', '18:01', 'salida'),
      (3, '2026-11-11', '08:59', 'entrada'),
      (3, '2026-11-11', '14:08', 'pausa'),
      (3, '2026-11-11', '14:54', 'reanudar'),
      (3, '2026-11-11', '18:24', 'salida'),
      (3, '2026-11-12', '08:46', 'entrada'),
      (3, '2026-11-12', '14:06', 'pausa'),
      (3, '2026-11-12', '14:46', 'reanudar'),
      (3, '2026-11-12', '18:16', 'salida'),
      (3, '2026-11-13', '07:50', 'entrada'),
      (3, '2026-11-13', '15:11', 'salida'),
      (3, '2026-11-16', '09:05', 'entrada'),
      (3, '2026-11-16', '14:04', 'pausa'),
      (3, '2026-11-16', '14:53', 'reanudar'),
      (3, '2026-11-16', '18:06', 'salida'),
      (3, '2026-11-17', '08:58', 'entrada'),
      (3, '2026-11-17', '14:02', 'pausa'),
      (3, '2026-11-17', '14:52', 'reanudar'),
      (3, '2026-11-17', '18:07', 'salida'),
      (3, '2026-11-18', '08:50', 'entrada'),
      (3, '2026-11-18', '14:09', 'pausa'),
      (3, '2026-11-18', '14:45', 'reanudar'),
      (3, '2026-11-18', '18:25', 'salida'),
      (3, '2026-11-19', '08:55', 'entrada'),
      (3, '2026-11-19', '14:10', 'pausa'),
      (3, '2026-11-19', '14:46', 'reanudar'),
      (3, '2026-11-19', '18:10', 'salida'),
      (3, '2026-11-20', '07:51', 'entrada'),
      (3, '2026-11-20', '15:11', 'salida'),
      (3, '2026-11-23', '08:51', 'entrada'),
      (3, '2026-11-23', '14:10', 'pausa'),
      (3, '2026-11-23', '14:47', 'reanudar'),
      (3, '2026-11-23', '18:14', 'salida'),
      (3, '2026-11-24', '08:52', 'entrada'),
      (3, '2026-11-24', '14:07', 'pausa'),
      (3, '2026-11-24', '14:45', 'reanudar'),
      (3, '2026-11-24', '18:00', 'salida'),
      (3, '2026-11-25', '08:47', 'entrada'),
      (3, '2026-11-25', '14:06', 'pausa'),
      (3, '2026-11-25', '14:52', 'reanudar'),
      (4, '2026-09-01', '08:54', 'entrada'),
      (4, '2026-09-01', '14:10', 'pausa'),
      (4, '2026-09-01', '14:53', 'reanudar'),
      (4, '2026-09-01', '18:22', 'salida'),
      (4, '2026-09-02', '08:46', 'entrada'),
      (4, '2026-09-02', '14:05', 'pausa'),
      (4, '2026-09-02', '14:49', 'reanudar'),
      (4, '2026-09-02', '18:16', 'salida'),
      (4, '2026-09-03', '09:08', 'entrada'),
      (4, '2026-09-03', '14:02', 'pausa'),
      (4, '2026-09-03', '14:48', 'reanudar'),
      (4, '2026-09-03', '18:14', 'salida'),
      (4, '2026-09-04', '08:04', 'entrada'),
      (4, '2026-09-04', '15:04', 'salida'),
      (4, '2026-09-07', '08:50', 'entrada'),
      (4, '2026-09-07', '14:01', 'pausa'),
      (4, '2026-09-07', '14:47', 'reanudar'),
      (4, '2026-09-07', '18:17', 'salida'),
      (4, '2026-09-08', '09:02', 'entrada'),
      (4, '2026-09-08', '14:09', 'pausa'),
      (4, '2026-09-08', '14:47', 'reanudar'),
      (4, '2026-09-08', '18:05', 'salida'),
      (4, '2026-09-09', '08:54', 'entrada'),
      (4, '2026-09-09', '14:02', 'pausa'),
      (4, '2026-09-09', '14:54', 'reanudar'),
      (4, '2026-09-09', '18:00', 'salida'),
      (4, '2026-09-10', '08:59', 'entrada'),
      (4, '2026-09-10', '14:06', 'pausa'),
      (4, '2026-09-10', '14:52', 'reanudar'),
      (4, '2026-09-10', '18:11', 'salida'),
      (4, '2026-09-14', '08:59', 'entrada'),
      (4, '2026-09-14', '14:06', 'pausa'),
      (4, '2026-09-14', '14:51', 'reanudar'),
      (4, '2026-09-14', '18:25', 'salida'),
      (4, '2026-09-15', '09:05', 'entrada'),
      (4, '2026-09-15', '14:03', 'pausa'),
      (4, '2026-09-15', '14:51', 'reanudar'),
      (4, '2026-09-15', '18:02', 'salida'),
      (4, '2026-09-16', '09:03', 'entrada'),
      (4, '2026-09-16', '14:04', 'pausa'),
      (4, '2026-09-16', '14:48', 'reanudar'),
      (4, '2026-09-16', '18:10', 'salida'),
      (4, '2026-09-17', '08:50', 'entrada'),
      (4, '2026-09-17', '14:03', 'pausa'),
      (4, '2026-09-17', '14:51', 'reanudar'),
      (4, '2026-09-17', '18:02', 'salida'),
      (4, '2026-09-18', '07:53', 'entrada'),
      (4, '2026-09-18', '15:10', 'salida'),
      (4, '2026-09-21', '09:09', 'entrada'),
      (4, '2026-09-21', '14:09', 'pausa'),
      (4, '2026-09-21', '14:45', 'reanudar'),
      (4, '2026-09-21', '18:17', 'salida'),
      (4, '2026-09-22', '08:51', 'entrada'),
      (4, '2026-09-22', '14:06', 'pausa'),
      (4, '2026-09-22', '14:45', 'reanudar'),
      (4, '2026-09-22', '18:15', 'salida'),
      (4, '2026-09-23', '09:01', 'entrada'),
      (4, '2026-09-23', '14:05', 'pausa'),
      (4, '2026-09-23', '14:49', 'reanudar'),
      (4, '2026-09-23', '18:08', 'salida'),
      (4, '2026-09-25', '08:00', 'entrada'),
      (4, '2026-09-25', '15:05', 'salida'),
      (4, '2026-09-28', '08:48', 'entrada'),
      (4, '2026-09-28', '14:08', 'pausa'),
      (4, '2026-09-28', '14:51', 'reanudar'),
      (4, '2026-09-28', '18:04', 'salida'),
      (4, '2026-09-29', '08:57', 'entrada'),
      (4, '2026-09-29', '14:00', 'pausa'),
      (4, '2026-09-29', '14:49', 'reanudar'),
      (4, '2026-09-29', '18:17', 'salida'),
      (4, '2026-09-30', '08:48', 'entrada'),
      (4, '2026-09-30', '14:01', 'pausa'),
      (4, '2026-09-30', '14:50', 'reanudar'),
      (4, '2026-09-30', '18:06', 'salida'),
      (4, '2026-10-01', '08:47', 'entrada'),
      (4, '2026-10-01', '14:02', 'pausa'),
      (4, '2026-10-01', '14:53', 'reanudar'),
      (4, '2026-10-01', '18:13', 'salida'),
      (4, '2026-10-02', '07:56', 'entrada'),
      (4, '2026-10-02', '15:09', 'salida'),
      (4, '2026-10-05', '08:58', 'entrada'),
      (4, '2026-10-05', '14:06', 'pausa'),
      (4, '2026-10-05', '14:45', 'reanudar'),
      (4, '2026-10-05', '18:21', 'salida'),
      (4, '2026-10-06', '08:59', 'entrada'),
      (4, '2026-10-06', '14:09', 'pausa'),
      (4, '2026-10-06', '14:52', 'reanudar'),
      (4, '2026-10-06', '18:05', 'salida'),
      (4, '2026-10-07', '08:49', 'entrada'),
      (4, '2026-10-07', '14:03', 'pausa'),
      (4, '2026-10-07', '14:54', 'reanudar'),
      (4, '2026-10-07', '18:20', 'salida'),
      (4, '2026-10-08', '09:02', 'entrada'),
      (4, '2026-10-08', '14:01', 'pausa'),
      (4, '2026-10-08', '14:55', 'reanudar'),
      (4, '2026-10-08', '18:25', 'salida'),
      (4, '2026-10-09', '07:55', 'entrada'),
      (4, '2026-10-09', '15:09', 'salida'),
      (4, '2026-10-13', '09:10', 'entrada'),
      (4, '2026-10-13', '14:09', 'pausa'),
      (4, '2026-10-13', '14:46', 'reanudar'),
      (4, '2026-10-13', '18:09', 'salida'),
      (4, '2026-10-14', '08:46', 'entrada'),
      (4, '2026-10-14', '14:06', 'pausa'),
      (4, '2026-10-14', '14:46', 'reanudar'),
      (4, '2026-10-14', '18:23', 'salida'),
      (4, '2026-10-15', '08:46', 'entrada'),
      (4, '2026-10-15', '14:04', 'pausa'),
      (4, '2026-10-15', '14:54', 'reanudar'),
      (4, '2026-10-15', '18:24', 'salida'),
      (4, '2026-10-16', '07:54', 'entrada'),
      (4, '2026-10-16', '15:05', 'salida'),
      (4, '2026-10-19', '08:48', 'entrada'),
      (4, '2026-10-19', '14:06', 'pausa'),
      (4, '2026-10-19', '14:45', 'reanudar'),
      (4, '2026-10-19', '18:03', 'salida'),
      (4, '2026-10-20', '08:57', 'entrada'),
      (4, '2026-10-20', '14:10', 'pausa'),
      (4, '2026-10-20', '14:46', 'reanudar'),
      (4, '2026-10-20', '18:10', 'salida'),
      (4, '2026-10-21', '08:55', 'entrada'),
      (4, '2026-10-21', '14:01', 'pausa'),
      (4, '2026-10-21', '14:47', 'reanudar'),
      (4, '2026-10-21', '18:19', 'salida'),
      (4, '2026-10-22', '09:08', 'entrada'),
      (4, '2026-10-22', '14:01', 'pausa'),
      (4, '2026-10-22', '14:46', 'reanudar'),
      (4, '2026-10-22', '18:22', 'salida'),
      (4, '2026-10-23', '08:04', 'entrada'),
      (4, '2026-10-23', '15:11', 'salida'),
      (4, '2026-10-26', '08:57', 'entrada'),
      (4, '2026-10-26', '14:03', 'pausa'),
      (4, '2026-10-26', '14:50', 'reanudar'),
      (4, '2026-10-26', '18:23', 'salida'),
      (4, '2026-10-27', '08:48', 'entrada'),
      (4, '2026-10-27', '14:06', 'pausa'),
      (4, '2026-10-27', '14:49', 'reanudar'),
      (4, '2026-10-27', '18:24', 'salida'),
      (4, '2026-10-28', '09:00', 'entrada'),
      (4, '2026-10-28', '14:08', 'pausa'),
      (4, '2026-10-28', '14:46', 'reanudar'),
      (4, '2026-10-28', '18:02', 'salida'),
      (4, '2026-10-29', '09:05', 'entrada'),
      (4, '2026-10-29', '14:00', 'pausa'),
      (4, '2026-10-29', '14:46', 'reanudar'),
      (4, '2026-10-29', '18:25', 'salida'),
      (4, '2026-10-30', '07:52', 'entrada'),
      (4, '2026-10-30', '15:10', 'salida'),
      (4, '2026-11-03', '09:01', 'entrada'),
      (4, '2026-11-03', '14:07', 'pausa'),
      (4, '2026-11-03', '14:48', 'reanudar'),
      (4, '2026-11-03', '18:14', 'salida'),
      (4, '2026-11-04', '09:06', 'entrada'),
      (4, '2026-11-04', '14:00', 'pausa'),
      (4, '2026-11-04', '14:49', 'reanudar'),
      (4, '2026-11-04', '18:25', 'salida'),
      (4, '2026-11-05', '09:06', 'entrada'),
      (4, '2026-11-05', '14:06', 'pausa'),
      (4, '2026-11-05', '14:54', 'reanudar'),
      (4, '2026-11-05', '18:01', 'salida'),
      (4, '2026-11-06', '08:00', 'entrada'),
      (4, '2026-11-06', '15:06', 'salida'),
      (4, '2026-11-09', '08:51', 'entrada'),
      (4, '2026-11-09', '14:01', 'pausa'),
      (4, '2026-11-09', '14:55', 'reanudar'),
      (4, '2026-11-09', '18:00', 'salida'),
      (4, '2026-11-10', '08:55', 'entrada'),
      (4, '2026-11-10', '14:07', 'pausa'),
      (4, '2026-11-10', '14:47', 'reanudar'),
      (4, '2026-11-10', '18:02', 'salida'),
      (4, '2026-11-11', '08:59', 'entrada'),
      (4, '2026-11-11', '14:04', 'pausa'),
      (4, '2026-11-11', '14:52', 'reanudar'),
      (4, '2026-11-11', '18:02', 'salida'),
      (4, '2026-11-12', '08:52', 'entrada'),
      (4, '2026-11-12', '14:06', 'pausa'),
      (4, '2026-11-12', '14:50', 'reanudar'),
      (4, '2026-11-12', '18:23', 'salida'),
      (4, '2026-11-13', '07:50', 'entrada'),
      (4, '2026-11-13', '15:07', 'salida'),
      (4, '2026-11-16', '08:46', 'entrada'),
      (4, '2026-11-16', '14:03', 'pausa'),
      (4, '2026-11-16', '14:53', 'reanudar'),
      (4, '2026-11-16', '18:02', 'salida'),
      (4, '2026-11-17', '08:58', 'entrada'),
      (4, '2026-11-17', '14:07', 'pausa'),
      (4, '2026-11-17', '14:50', 'reanudar'),
      (4, '2026-11-17', '18:17', 'salida'),
      (4, '2026-11-18', '09:04', 'entrada'),
      (4, '2026-11-18', '14:00', 'pausa'),
      (4, '2026-11-18', '14:48', 'reanudar'),
      (4, '2026-11-18', '18:17', 'salida'),
      (4, '2026-11-19', '09:05', 'entrada'),
      (4, '2026-11-19', '14:09', 'pausa'),
      (4, '2026-11-19', '14:52', 'reanudar'),
      (4, '2026-11-19', '18:01', 'salida'),
      (4, '2026-11-20', '08:05', 'entrada'),
      (4, '2026-11-20', '15:01', 'salida'),
      (4, '2026-11-23', '09:09', 'entrada'),
      (4, '2026-11-23', '14:00', 'pausa'),
      (4, '2026-11-23', '14:45', 'reanudar'),
      (4, '2026-11-23', '18:16', 'salida'),
      (4, '2026-11-24', '09:10', 'entrada'),
      (4, '2026-11-24', '14:05', 'pausa'),
      (4, '2026-11-24', '14:55', 'reanudar'),
      (4, '2026-11-24', '18:18', 'salida'),
      (4, '2026-11-25', '08:51', 'entrada'),
      (4, '2026-11-25', '14:05', 'pausa'),
      (4, '2026-11-25', '14:54', 'reanudar'),
      (5, '2026-09-01', '08:46', 'entrada'),
      (5, '2026-09-01', '14:03', 'pausa'),
      (5, '2026-09-01', '14:46', 'reanudar'),
      (5, '2026-09-01', '18:12', 'salida'),
      (5, '2026-09-02', '08:56', 'entrada'),
      (5, '2026-09-02', '14:10', 'pausa'),
      (5, '2026-09-02', '14:48', 'reanudar'),
      (5, '2026-09-02', '18:00', 'salida'),
      (5, '2026-09-03', '08:48', 'entrada'),
      (5, '2026-09-03', '14:10', 'pausa'),
      (5, '2026-09-03', '14:47', 'reanudar'),
      (5, '2026-09-03', '18:25', 'salida'),
      (5, '2026-09-04', '08:01', 'entrada'),
      (5, '2026-09-04', '15:08', 'salida'),
      (5, '2026-09-07', '09:02', 'entrada'),
      (5, '2026-09-07', '14:01', 'pausa'),
      (5, '2026-09-07', '14:50', 'reanudar'),
      (5, '2026-09-07', '18:13', 'salida'),
      (5, '2026-09-08', '08:56', 'entrada'),
      (5, '2026-09-08', '14:01', 'pausa'),
      (5, '2026-09-08', '14:55', 'reanudar'),
      (5, '2026-09-08', '18:24', 'salida'),
      (5, '2026-09-09', '08:50', 'entrada'),
      (5, '2026-09-09', '14:00', 'pausa'),
      (5, '2026-09-09', '14:46', 'reanudar'),
      (5, '2026-09-09', '18:19', 'salida'),
      (5, '2026-09-10', '08:55', 'entrada'),
      (5, '2026-09-10', '14:01', 'pausa'),
      (5, '2026-09-10', '14:48', 'reanudar'),
      (5, '2026-09-10', '18:15', 'salida'),
      (5, '2026-09-14', '09:09', 'entrada'),
      (5, '2026-09-14', '14:09', 'pausa'),
      (5, '2026-09-14', '14:45', 'reanudar'),
      (5, '2026-09-14', '18:22', 'salida'),
      (5, '2026-09-15', '09:08', 'entrada'),
      (5, '2026-09-15', '14:01', 'pausa'),
      (5, '2026-09-15', '14:46', 'reanudar'),
      (5, '2026-09-15', '18:16', 'salida'),
      (5, '2026-09-16', '09:07', 'entrada'),
      (5, '2026-09-16', '14:02', 'pausa'),
      (5, '2026-09-16', '14:51', 'reanudar'),
      (5, '2026-09-16', '18:20', 'salida'),
      (5, '2026-09-17', '09:01', 'entrada'),
      (5, '2026-09-17', '14:02', 'pausa'),
      (5, '2026-09-17', '14:46', 'reanudar'),
      (5, '2026-09-17', '18:10', 'salida'),
      (5, '2026-09-18', '08:03', 'entrada'),
      (5, '2026-09-18', '15:10', 'salida'),
      (5, '2026-09-21', '08:56', 'entrada'),
      (5, '2026-09-21', '14:05', 'pausa'),
      (5, '2026-09-21', '14:46', 'reanudar'),
      (5, '2026-09-21', '18:11', 'salida'),
      (5, '2026-09-22', '09:09', 'entrada'),
      (5, '2026-09-22', '14:04', 'pausa'),
      (5, '2026-09-22', '14:48', 'reanudar'),
      (5, '2026-09-22', '18:25', 'salida'),
      (5, '2026-09-23', '09:04', 'entrada'),
      (5, '2026-09-23', '14:02', 'pausa'),
      (5, '2026-09-23', '14:49', 'reanudar'),
      (5, '2026-09-23', '18:24', 'salida'),
      (5, '2026-09-25', '07:50', 'entrada'),
      (5, '2026-09-25', '15:03', 'salida'),
      (5, '2026-09-28', '08:57', 'entrada'),
      (5, '2026-09-28', '14:10', 'pausa'),
      (5, '2026-09-28', '14:45', 'reanudar'),
      (5, '2026-09-28', '18:18', 'salida'),
      (5, '2026-09-29', '09:05', 'entrada'),
      (5, '2026-09-29', '14:03', 'pausa'),
      (5, '2026-09-29', '14:51', 'reanudar'),
      (5, '2026-09-29', '18:00', 'salida'),
      (5, '2026-09-30', '08:45', 'entrada'),
      (5, '2026-09-30', '14:02', 'pausa'),
      (5, '2026-09-30', '14:49', 'reanudar'),
      (5, '2026-09-30', '18:11', 'salida'),
      (5, '2026-10-01', '08:52', 'entrada'),
      (5, '2026-10-01', '14:08', 'pausa'),
      (5, '2026-10-01', '14:47', 'reanudar'),
      (5, '2026-10-01', '18:07', 'salida'),
      (5, '2026-10-02', '07:53', 'entrada'),
      (5, '2026-10-02', '15:05', 'salida'),
      (5, '2026-10-05', '08:55', 'entrada'),
      (5, '2026-10-05', '14:05', 'pausa'),
      (5, '2026-10-05', '14:50', 'reanudar'),
      (5, '2026-10-05', '18:12', 'salida'),
      (5, '2026-10-06', '08:49', 'entrada'),
      (5, '2026-10-06', '14:01', 'pausa'),
      (5, '2026-10-06', '14:54', 'reanudar'),
      (5, '2026-10-06', '18:10', 'salida'),
      (5, '2026-10-07', '08:47', 'entrada'),
      (5, '2026-10-07', '14:10', 'pausa'),
      (5, '2026-10-07', '14:47', 'reanudar'),
      (5, '2026-10-07', '18:08', 'salida'),
      (5, '2026-10-08', '09:05', 'entrada'),
      (5, '2026-10-08', '14:04', 'pausa'),
      (5, '2026-10-08', '14:52', 'reanudar'),
      (5, '2026-10-08', '18:00', 'salida'),
      (5, '2026-10-09', '07:53', 'entrada'),
      (5, '2026-10-09', '15:01', 'salida'),
      (5, '2026-10-13', '09:06', 'entrada'),
      (5, '2026-10-13', '14:07', 'pausa'),
      (5, '2026-10-13', '14:47', 'reanudar'),
      (5, '2026-10-13', '18:14', 'salida'),
      (5, '2026-10-14', '09:05', 'entrada'),
      (5, '2026-10-14', '14:04', 'pausa'),
      (5, '2026-10-14', '14:50', 'reanudar'),
      (5, '2026-10-14', '18:25', 'salida'),
      (5, '2026-10-15', '08:52', 'entrada'),
      (5, '2026-10-15', '14:01', 'pausa'),
      (5, '2026-10-15', '14:52', 'reanudar'),
      (5, '2026-10-15', '18:08', 'salida'),
      (5, '2026-10-16', '07:53', 'entrada'),
      (5, '2026-10-16', '15:01', 'salida'),
      (5, '2026-10-19', '08:47', 'entrada'),
      (5, '2026-10-19', '14:07', 'pausa'),
      (5, '2026-10-19', '14:55', 'reanudar'),
      (5, '2026-10-19', '18:04', 'salida'),
      (5, '2026-10-20', '09:03', 'entrada'),
      (5, '2026-10-20', '14:01', 'pausa'),
      (5, '2026-10-20', '14:46', 'reanudar'),
      (5, '2026-10-20', '18:13', 'salida'),
      (5, '2026-10-21', '08:51', 'entrada'),
      (5, '2026-10-21', '14:09', 'pausa'),
      (5, '2026-10-21', '14:45', 'reanudar'),
      (5, '2026-10-21', '18:25', 'salida'),
      (5, '2026-10-22', '08:48', 'entrada'),
      (5, '2026-10-22', '14:06', 'pausa'),
      (5, '2026-10-22', '14:49', 'reanudar'),
      (5, '2026-10-22', '18:10', 'salida'),
      (5, '2026-10-23', '07:52', 'entrada'),
      (5, '2026-10-23', '15:07', 'salida'),
      (5, '2026-10-26', '08:54', 'entrada'),
      (5, '2026-10-26', '14:04', 'pausa'),
      (5, '2026-10-26', '14:47', 'reanudar'),
      (5, '2026-10-26', '18:08', 'salida'),
      (5, '2026-10-27', '08:57', 'entrada'),
      (5, '2026-10-27', '14:05', 'pausa'),
      (5, '2026-10-27', '14:53', 'reanudar'),
      (5, '2026-10-27', '18:08', 'salida'),
      (5, '2026-10-28', '09:09', 'entrada'),
      (5, '2026-10-28', '14:00', 'pausa'),
      (5, '2026-10-28', '14:55', 'reanudar'),
      (5, '2026-10-28', '18:17', 'salida'),
      (5, '2026-10-29', '08:49', 'entrada'),
      (5, '2026-10-29', '14:01', 'pausa'),
      (5, '2026-10-29', '14:55', 'reanudar'),
      (5, '2026-10-29', '18:17', 'salida'),
      (5, '2026-10-30', '08:04', 'entrada'),
      (5, '2026-10-30', '15:00', 'salida'),
      (5, '2026-11-03', '08:52', 'entrada'),
      (5, '2026-11-03', '14:09', 'pausa'),
      (5, '2026-11-03', '14:46', 'reanudar'),
      (5, '2026-11-03', '18:11', 'salida'),
      (5, '2026-11-04', '09:09', 'entrada'),
      (5, '2026-11-04', '14:08', 'pausa'),
      (5, '2026-11-04', '14:48', 'reanudar'),
      (5, '2026-11-04', '18:11', 'salida'),
      (5, '2026-11-05', '08:54', 'entrada'),
      (5, '2026-11-05', '14:02', 'pausa'),
      (5, '2026-11-05', '14:54', 'reanudar'),
      (5, '2026-11-05', '18:11', 'salida'),
      (5, '2026-11-06', '07:52', 'entrada'),
      (5, '2026-11-06', '15:01', 'salida'),
      (5, '2026-11-09', '09:05', 'entrada'),
      (5, '2026-11-09', '14:10', 'pausa'),
      (5, '2026-11-09', '14:45', 'reanudar'),
      (5, '2026-11-09', '18:04', 'salida'),
      (5, '2026-11-10', '09:03', 'entrada'),
      (5, '2026-11-10', '14:05', 'pausa'),
      (5, '2026-11-10', '14:48', 'reanudar'),
      (5, '2026-11-10', '18:22', 'salida'),
      (5, '2026-11-11', '09:10', 'entrada'),
      (5, '2026-11-11', '14:05', 'pausa'),
      (5, '2026-11-11', '14:47', 'reanudar'),
      (5, '2026-11-11', '18:15', 'salida'),
      (5, '2026-11-12', '08:55', 'entrada'),
      (5, '2026-11-12', '14:02', 'pausa'),
      (5, '2026-11-12', '14:54', 'reanudar'),
      (5, '2026-11-12', '18:12', 'salida'),
      (5, '2026-11-13', '08:03', 'entrada'),
      (5, '2026-11-13', '15:06', 'salida'),
      (5, '2026-11-16', '09:08', 'entrada'),
      (5, '2026-11-16', '14:05', 'pausa'),
      (5, '2026-11-16', '14:53', 'reanudar'),
      (5, '2026-11-16', '18:23', 'salida'),
      (5, '2026-11-17', '08:59', 'entrada'),
      (5, '2026-11-17', '14:00', 'pausa'),
      (5, '2026-11-17', '14:51', 'reanudar'),
      (5, '2026-11-17', '18:19', 'salida'),
      (5, '2026-11-18', '09:00', 'entrada'),
      (5, '2026-11-18', '14:01', 'pausa'),
      (5, '2026-11-18', '14:48', 'reanudar'),
      (5, '2026-11-18', '18:03', 'salida'),
      (5, '2026-11-19', '08:57', 'entrada'),
      (5, '2026-11-19', '14:01', 'pausa'),
      (5, '2026-11-19', '14:53', 'reanudar'),
      (5, '2026-11-19', '18:14', 'salida'),
      (5, '2026-11-20', '07:56', 'entrada'),
      (5, '2026-11-20', '15:09', 'salida'),
      (5, '2026-11-23', '08:56', 'entrada'),
      (5, '2026-11-23', '14:05', 'pausa'),
      (5, '2026-11-23', '14:46', 'reanudar'),
      (5, '2026-11-23', '18:09', 'salida'),
      (5, '2026-11-24', '08:48', 'entrada'),
      (5, '2026-11-24', '14:08', 'pausa'),
      (5, '2026-11-24', '14:50', 'reanudar'),
      (5, '2026-11-24', '18:16', 'salida'),
      (5, '2026-11-25', '09:05', 'entrada'),
      (5, '2026-11-25', '14:08', 'pausa'),
      (5, '2026-11-25', '14:45', 'reanudar')
    ) as r(t, dia, hora, tipo)
    where (r.dia || ' ' || r.hora)::timestamp at time zone 'Europe/Madrid' <= now()
    order by r.dia, r.hora;
    -- Correcciones: Javier olvidó fichar la salida del viernes 13/11 (pendiente) y Lucía corrigió una entrada (aprobada)
    insert into public.fichajes (owner_id, trabajador_id, tipo, momento, origen, estado, motivo, registrado_por)
    values (o, t2, 'salida', '2026-11-13 15:02'::timestamp at time zone 'Europe/Madrid', 'correccion', 'pendiente', 'Me olvidé de fichar la salida: salí a las 15:00 como cada viernes', 'de300000-0000-4000-8000-000000000102');
    insert into public.fichajes (owner_id, trabajador_id, tipo, momento, origen, estado, motivo, registrado_por, revisado_por, revisado_at)
    values (o, t3, 'entrada', '2026-10-21 08:40'::timestamp at time zone 'Europe/Madrid', 'correccion', 'valido', 'La app no cargaba en el metro: entré a las 8:40', 'de300000-0000-4000-8000-000000000103', o, '2026-10-21 12:00+02');
  end if;

  -- ---------------------------------------------------------- Solicitud de cambio de IRPF (Lucía, pendiente)
  if to_regclass('public.solicitudes_irpf') is not null then
    insert into public.solicitudes_irpf (owner_id, trabajador_id, pct_actual, pct_solicitado, desde, comentario, estado, solicitada_por, created_at)
    values (o, t3, 16, 18, '2026-12', 'Me he comprado un piso este año y prefiero que me retengan un poco más para no pagar en la renta.', 'pendiente', 'de300000-0000-4000-8000-000000000103', '2026-11-18 09:30+01');
  end if;

  -- ---------------------------------------------------------- Impuestos
  insert into public.impuestos (owner_id, modelo, anio, periodo, resultado, importe, fecha_presentacion, notas) values (o, '303', 2026, '1T', 'ingresar', 9851.01, '2026-04-17', 'IVA repercutido 27237€ · soportado deducible 17385.99€');
  insert into public.impuestos (owner_id, modelo, anio, periodo, resultado, importe, fecha_presentacion, notas) values (o, '111', 2026, '1T', 'ingresar', 9028.5, '2026-04-17', 'Retenciones de nóminas y de profesionales');
  insert into public.impuestos (owner_id, modelo, anio, periodo, resultado, importe, fecha_presentacion, notas) values (o, '115', 2026, '1T', 'ingresar', 1824, '2026-04-17', 'Retención del alquiler de la oficina (19%)');
  insert into public.impuestos (owner_id, modelo, anio, periodo, resultado, importe, fecha_presentacion, notas) values (o, '303', 2026, '2T', 'ingresar', 18253.44, '2026-07-16', 'IVA repercutido 29757€ · soportado deducible 11503.56€');
  insert into public.impuestos (owner_id, modelo, anio, periodo, resultado, importe, fecha_presentacion, notas) values (o, '111', 2026, '2T', 'ingresar', 12326.44, '2026-07-16', 'Retenciones de nóminas y de profesionales');
  insert into public.impuestos (owner_id, modelo, anio, periodo, resultado, importe, fecha_presentacion, notas) values (o, '115', 2026, '2T', 'ingresar', 1824, '2026-07-16', 'Retención del alquiler de la oficina (19%)');
  insert into public.impuestos (owner_id, modelo, anio, periodo, resultado, importe, fecha_presentacion, notas) values (o, '303', 2026, '3T', 'ingresar', 23139.81, '2026-10-16', 'IVA repercutido 28812€ · soportado deducible 5672.19€');
  insert into public.impuestos (owner_id, modelo, anio, periodo, resultado, importe, fecha_presentacion, notas) values (o, '111', 2026, '3T', 'ingresar', 9775.5, '2026-10-16', 'Retenciones de nóminas y de profesionales');
  insert into public.impuestos (owner_id, modelo, anio, periodo, resultado, importe, fecha_presentacion, notas) values (o, '115', 2026, '3T', 'ingresar', 1824, '2026-10-16', 'Retención del alquiler de la oficina (19%)');
  insert into public.impuestos (owner_id, modelo, anio, periodo, resultado, importe, fecha_presentacion, notas) values (o, '303', 2026, '4T', 'ingresar', 14823.59, null, 'Estimación con los datos hasta noviembre. Plazo: del 1 al 30 de enero de 2027.');
  insert into public.impuestos (owner_id, modelo, anio, periodo, resultado, importe, fecha_presentacion, notas) values (o, '111', 2026, '4T', 'ingresar', 3191, null, 'Estimación con los datos hasta noviembre. Plazo: del 1 al 20 de enero de 2027.');
  insert into public.impuestos (owner_id, modelo, anio, periodo, resultado, importe, fecha_presentacion, notas) values (o, '115', 2026, '4T', 'ingresar', 1824, null, 'Estimación (incluye el alquiler de diciembre). Plazo: del 1 al 20 de enero de 2027.');
  insert into public.impuestos (owner_id, modelo, anio, periodo, resultado, importe, fecha_presentacion, notas) values (o, '202', 2026, '04', 'ingresar', 7425, '2026-04-17', '1.er pago fraccionado: 18% de la cuota del Impuesto de Sociedades 2025');
  insert into public.impuestos (owner_id, modelo, anio, periodo, resultado, importe, fecha_presentacion, notas) values (o, '202', 2026, '10', 'ingresar', 7425, '2026-10-16', '2.º pago fraccionado');
  insert into public.impuestos (owner_id, modelo, anio, periodo, resultado, importe, fecha_presentacion, notas) values (o, '202', 2026, '12', 'ingresar', 7425, null, '3.er pago fraccionado. Plazo: del 1 al 22 de diciembre.');
  insert into public.impuestos (owner_id, modelo, anio, periodo, resultado, importe, fecha_presentacion, notas) values (o, '303', 2025, '4T', 'ingresar', 18400, '2026-01-20', null);
  insert into public.impuestos (owner_id, modelo, anio, periodo, resultado, importe, fecha_presentacion, notas) values (o, '111', 2025, '4T', 'ingresar', 9850, '2026-01-20', null);
  insert into public.impuestos (owner_id, modelo, anio, periodo, resultado, importe, fecha_presentacion, notas) values (o, '115', 2025, '4T', 'ingresar', 1824, '2026-01-20', null);
  insert into public.impuestos (owner_id, modelo, anio, periodo, resultado, importe, fecha_presentacion, notas) values (o, '390', 2025, '0A', 'informativa', 0, '2026-01-26', 'Resumen anual de IVA 2025');
  insert into public.impuestos (owner_id, modelo, anio, periodo, resultado, importe, fecha_presentacion, notas) values (o, '190', 2025, '0A', 'informativa', 0, '2026-01-26', null);
  insert into public.impuestos (owner_id, modelo, anio, periodo, resultado, importe, fecha_presentacion, notas) values (o, '180', 2025, '0A', 'informativa', 0, '2026-01-26', null);
  insert into public.impuestos (owner_id, modelo, anio, periodo, resultado, importe, fecha_presentacion, notas) values (o, '347', 2025, '0A', 'informativa', 0, '2026-02-24', '9 clientes y 6 proveedores de más de 3.005,06€');
  insert into public.impuestos (owner_id, modelo, anio, periodo, resultado, importe, fecha_presentacion, notas) values (o, '349', 2026, '3T', 'informativa', 0, '2026-10-16', 'Servicios a Berliner Datenwerk GmbH');
  insert into public.impuestos (owner_id, modelo, anio, periodo, resultado, importe, fecha_presentacion, notas) values (o, 'CCAA', 2025, '0A', 'informativa', 0, '2026-07-24', 'Cuentas anuales 2025 depositadas en el Registro Mercantil');
  insert into public.impuestos (owner_id, modelo, anio, periodo, resultado, importe, fecha_presentacion, notas) values (o, '200', 2025, '0A', 'ingresar', 41250, '2026-07-20', 'Impuesto de Sociedades 2025: base imponible 165.000€ al 25%');
  insert into public.archivo (owner_id, titulo, tipo, organismo, fecha, fecha_limite, atendida, notas) values
    (o, 'Certificado de estar al corriente de obligaciones tributarias', 'certificado', 'AEAT', '2026-03-10', null, true, 'Pedido para el concurso del Ayuntamiento'),
    (o, 'Requerimiento de información: modelo 347 de 2025', 'requerimiento', 'AEAT', '2026-05-12', '2026-05-26', true, 'Contestado el 19/05 con el listado de operaciones'),
    (o, 'Certificado de estar al corriente con la Seguridad Social', 'certificado', 'TGSS', '2026-09-02', null, true, null),
    (o, 'Escritura de constitución de la sociedad', 'escritura', 'Notaría', '2019-06-14', null, true, null),
    (o, 'Contrato de alquiler de la oficina (Passeig de Gràcia)', 'contrato', null, '2024-12-20', null, true, 'Vence el 31/12/2029');

  -- ---------------------------------------------------------- Apertura y pagos (impuestos y Seguridad Social)
  insert into public.asientos_manuales (owner_id, tipo, fecha, concepto, lineas) values
    (o, 'apertura', '2026-01-01', 'Asiento de apertura del ejercicio 2026', '[{"cuenta":"572","debe":168000,"haber":0},{"cuenta":"100","debe":0,"haber":3000},{"cuenta":"112","debe":0,"haber":600},{"cuenta":"113","debe":0,"haber":86146},{"cuenta":"4750","debe":0,"haber":18400},{"cuenta":"4751","debe":0,"haber":11674},{"cuenta":"476","debe":0,"haber":6930},{"cuenta":"4752","debe":0,"haber":41250}]'::jsonb);
  insert into public.asientos_manuales (owner_id, tipo, fecha, concepto, lineas) values (o, 'manual', '2026-01-20', 'Pago AEAT · Modelo 303 4T 2025', '[{"cuenta":"4750","debe":18400,"haber":0},{"cuenta":"572","debe":0,"haber":18400}]'::jsonb);
  insert into public.asientos_manuales (owner_id, tipo, fecha, concepto, lineas) values (o, 'manual', '2026-01-20', 'Pago AEAT · Modelo 111 4T 2025', '[{"cuenta":"4751","debe":9850,"haber":0},{"cuenta":"572","debe":0,"haber":9850}]'::jsonb);
  insert into public.asientos_manuales (owner_id, tipo, fecha, concepto, lineas) values (o, 'manual', '2026-01-20', 'Pago AEAT · Modelo 115 4T 2025', '[{"cuenta":"4751","debe":1824,"haber":0},{"cuenta":"572","debe":0,"haber":1824}]'::jsonb);
  insert into public.asientos_manuales (owner_id, tipo, fecha, concepto, lineas) values (o, 'manual', '2026-01-30', 'Pago TGSS · Seguros sociales diciembre 2025', '[{"cuenta":"476","debe":6930,"haber":0},{"cuenta":"572","debe":0,"haber":6930}]'::jsonb);
  insert into public.asientos_manuales (owner_id, tipo, fecha, concepto, lineas) values (o, 'manual', '2026-07-20', 'Pago AEAT · Modelo 200 Impuesto de Sociedades 2025', '[{"cuenta":"4752","debe":41250,"haber":0},{"cuenta":"572","debe":0,"haber":41250}]'::jsonb);
  insert into public.asientos_manuales (owner_id, tipo, fecha, concepto, lineas) values (o, 'manual', '2026-04-17', 'Liquidación y pago modelo 303 1T 2026', '[{"cuenta":"477","debe":27237,"haber":0},{"cuenta":"472","debe":0,"haber":17385.99},{"cuenta":"572","debe":0,"haber":9851.01}]'::jsonb);
  insert into public.asientos_manuales (owner_id, tipo, fecha, concepto, lineas) values (o, 'manual', '2026-04-17', 'Pago AEAT · Modelo 111 1T 2026', '[{"cuenta":"4751","debe":9028.5,"haber":0},{"cuenta":"572","debe":0,"haber":9028.5}]'::jsonb);
  insert into public.asientos_manuales (owner_id, tipo, fecha, concepto, lineas) values (o, 'manual', '2026-04-17', 'Pago AEAT · Modelo 115 1T 2026', '[{"cuenta":"4751","debe":1824,"haber":0},{"cuenta":"572","debe":0,"haber":1824}]'::jsonb);
  insert into public.asientos_manuales (owner_id, tipo, fecha, concepto, lineas) values (o, 'manual', '2026-07-16', 'Liquidación y pago modelo 303 2T 2026', '[{"cuenta":"477","debe":29757,"haber":0},{"cuenta":"472","debe":0,"haber":11503.56},{"cuenta":"572","debe":0,"haber":18253.44}]'::jsonb);
  insert into public.asientos_manuales (owner_id, tipo, fecha, concepto, lineas) values (o, 'manual', '2026-07-16', 'Pago AEAT · Modelo 111 2T 2026', '[{"cuenta":"4751","debe":12326.44,"haber":0},{"cuenta":"572","debe":0,"haber":12326.44}]'::jsonb);
  insert into public.asientos_manuales (owner_id, tipo, fecha, concepto, lineas) values (o, 'manual', '2026-07-16', 'Pago AEAT · Modelo 115 2T 2026', '[{"cuenta":"4751","debe":1824,"haber":0},{"cuenta":"572","debe":0,"haber":1824}]'::jsonb);
  insert into public.asientos_manuales (owner_id, tipo, fecha, concepto, lineas) values (o, 'manual', '2026-10-16', 'Liquidación y pago modelo 303 3T 2026', '[{"cuenta":"477","debe":28812,"haber":0},{"cuenta":"472","debe":0,"haber":5672.19},{"cuenta":"572","debe":0,"haber":23139.81}]'::jsonb);
  insert into public.asientos_manuales (owner_id, tipo, fecha, concepto, lineas) values (o, 'manual', '2026-10-16', 'Pago AEAT · Modelo 111 3T 2026', '[{"cuenta":"4751","debe":9775.5,"haber":0},{"cuenta":"572","debe":0,"haber":9775.5}]'::jsonb);
  insert into public.asientos_manuales (owner_id, tipo, fecha, concepto, lineas) values (o, 'manual', '2026-10-16', 'Pago AEAT · Modelo 115 3T 2026', '[{"cuenta":"4751","debe":1824,"haber":0},{"cuenta":"572","debe":0,"haber":1824}]'::jsonb);
  insert into public.asientos_manuales (owner_id, tipo, fecha, concepto, lineas) values (o, 'manual', '2026-04-17', 'Pago AEAT · Modelo 202 1.er pago fraccionado 2026', '[{"cuenta":"473","debe":7425,"haber":0},{"cuenta":"572","debe":0,"haber":7425}]'::jsonb);
  insert into public.asientos_manuales (owner_id, tipo, fecha, concepto, lineas) values (o, 'manual', '2026-10-16', 'Pago AEAT · Modelo 202 2.º pago fraccionado 2026', '[{"cuenta":"473","debe":7425,"haber":0},{"cuenta":"572","debe":0,"haber":7425}]'::jsonb);
  insert into public.asientos_manuales (owner_id, tipo, fecha, concepto, lineas) values (o, 'manual', '2026-02-27', 'Pago TGSS · Seguros sociales enero 2026', '[{"cuenta":"476","debe":6370.81,"haber":0},{"cuenta":"572","debe":0,"haber":6370.81}]'::jsonb);
  insert into public.asientos_manuales (owner_id, tipo, fecha, concepto, lineas) values (o, 'manual', '2026-03-31', 'Pago TGSS · Seguros sociales febrero 2026', '[{"cuenta":"476","debe":6254.86,"haber":0},{"cuenta":"572","debe":0,"haber":6254.86}]'::jsonb);
  insert into public.asientos_manuales (owner_id, tipo, fecha, concepto, lineas) values (o, 'manual', '2026-04-30', 'Pago TGSS · Seguros sociales marzo 2026', '[{"cuenta":"476","debe":6158.24,"haber":0},{"cuenta":"572","debe":0,"haber":6158.24}]'::jsonb);
  insert into public.asientos_manuales (owner_id, tipo, fecha, concepto, lineas) values (o, 'manual', '2026-05-29', 'Pago TGSS · Seguros sociales abril 2026', '[{"cuenta":"476","debe":6965.59,"haber":0},{"cuenta":"572","debe":0,"haber":6965.59}]'::jsonb);
  insert into public.asientos_manuales (owner_id, tipo, fecha, concepto, lineas) values (o, 'manual', '2026-06-30', 'Pago TGSS · Seguros sociales mayo 2026', '[{"cuenta":"476","debe":7246.87,"haber":0},{"cuenta":"572","debe":0,"haber":7246.87}]'::jsonb);
  insert into public.asientos_manuales (owner_id, tipo, fecha, concepto, lineas) values (o, 'manual', '2026-07-31', 'Pago TGSS · Seguros sociales junio 2026', '[{"cuenta":"476","debe":7246.87,"haber":0},{"cuenta":"572","debe":0,"haber":7246.87}]'::jsonb);
  insert into public.asientos_manuales (owner_id, tipo, fecha, concepto, lineas) values (o, 'manual', '2026-08-31', 'Pago TGSS · Seguros sociales julio 2026', '[{"cuenta":"476","debe":7150.25,"haber":0},{"cuenta":"572","debe":0,"haber":7150.25}]'::jsonb);
  insert into public.asientos_manuales (owner_id, tipo, fecha, concepto, lineas) values (o, 'manual', '2026-09-30', 'Pago TGSS · Seguros sociales agosto 2026', '[{"cuenta":"476","debe":7246.87,"haber":0},{"cuenta":"572","debe":0,"haber":7246.87}]'::jsonb);
  insert into public.asientos_manuales (owner_id, tipo, fecha, concepto, lineas) values (o, 'manual', '2026-10-30', 'Pago TGSS · Seguros sociales septiembre 2026', '[{"cuenta":"476","debe":7246.87,"haber":0},{"cuenta":"572","debe":0,"haber":7246.87}]'::jsonb);

  raise notice 'Cuenta demo lista: NomoTax Demo, S.L. (%)', o;
end $$;

-- Comprobación: una fila con la empresa demo y sus totales
select p.nombre, p.email, p.es_demo,
  (select count(*) from public.invoices i where i.owner_id = p.id) facturas,
  (select sum(base) from public.invoices i where i.owner_id = p.id) ventas_sin_iva,
  (select count(*) from public.expenses e where e.owner_id = p.id) gastos,
  (select count(*) from public.trabajadores t where t.owner_id = p.id) trabajadores,
  (select count(*) from public.nominas n where n.owner_id = p.id) nominas,
  (select count(*) from public.trabajador_documentos d where d.owner_id = p.id) documentos,
  (select count(*) from public.miembros m where m.cuenta_id = p.id) usuarios
from public.profiles p where p.es_demo;
