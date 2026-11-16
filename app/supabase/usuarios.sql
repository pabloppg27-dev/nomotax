-- =====================================================================
-- NomoTax · Área de clientes — USUARIOS DE LA EMPRESA
-- La empresa (el titular de la cuenta) da acceso a otras personas con un rol:
--   admin     → la gestión diaria; módulo a módulo (ventas, gastos, bancos, contabilidad,
--               impuestos, laboral, nóminas, usuarios, empresa)
--   socio     → solo la «Vista de socio» (cifras, pérdidas y ganancias, balance) y Mi asesor
--   comercial → presupuestos, facturas (solo en borrador) y clientes
--   empleado  → sube sus tickets y ve sus nóminas, sus documentos y su ficha
-- El titular y el asesor lo pueden todo, como hasta ahora.
--
-- Pegar en Supabase → SQL Editor → Run (una sola vez, después de todos los anteriores).
-- Se puede volver a ejecutar: borra y recrea las reglas de acceso.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Perfiles: nuevo tipo 'member' (persona que solo entra en empresas de otros)
-- ---------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('client', 'advisor', 'member'));

-- ---------------------------------------------------------------------
-- 2. Miembros de cada empresa
-- ---------------------------------------------------------------------
create table if not exists public.miembros (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references public.profiles(id) on delete cascade,   -- la empresa
  user_id uuid not null references public.profiles(id) on delete cascade,     -- la persona
  email text not null,
  nombre text,
  rol text not null check (rol in ('admin', 'socio', 'comercial', 'empleado')),
  -- Solo para admin: qué módulos ve (true/false por módulo)
  permisos jsonb not null default '{}'::jsonb,
  -- Solo para empleado: su ficha de trabajador
  trabajador_id uuid references public.trabajadores(id) on delete set null,
  activo boolean not null default true,
  invitado_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cuenta_id, user_id),
  check (cuenta_id <> user_id)
);
create index if not exists miembros_user_idx on public.miembros(user_id) where activo;
create index if not exists miembros_cuenta_idx on public.miembros(cuenta_id);

drop trigger if exists miembros_touch on public.miembros;
create trigger miembros_touch before update on public.miembros
  for each row execute function public.touch_updated_at();

-- Módulos que se pueden activar a un admin
create or replace function public.modulos_admin()
returns text[]
language sql immutable
as $$
  select array['ventas', 'gastos', 'bancos', 'contabilidad', 'impuestos', 'laboral', 'nominas', 'usuarios', 'empresa'];
$$;

-- Ordena los datos del miembro: permisos limpios, la ficha de trabajador de la misma empresa,
-- y la empresa y la persona no se cambian nunca
create or replace function public.miembros_validar()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  limpio jsonb := '{}'::jsonb;
  m text;
begin
  if tg_op = 'UPDATE' and (new.cuenta_id is distinct from old.cuenta_id or new.user_id is distinct from old.user_id) then
    raise exception 'No se puede cambiar la empresa ni la persona de un acceso. Bórralo y crea otro.';
  end if;

  if new.rol = 'admin' then
    -- Por defecto, todo menos gestionar usuarios y los datos de la empresa
    if new.permisos is null or new.permisos = '{}'::jsonb then
      new.permisos := '{"ventas":true,"gastos":true,"bancos":true,"contabilidad":true,"impuestos":true,"laboral":true,"nominas":true,"usuarios":false,"empresa":false}'::jsonb;
    end if;
    foreach m in array public.modulos_admin() loop
      limpio := limpio || jsonb_build_object(m, coalesce((new.permisos ->> m)::boolean, false));
    end loop;
    -- La contabilidad se calcula con las facturas y los gastos: sin ellos saldría incompleta
    if (limpio ->> 'contabilidad')::boolean then
      limpio := limpio || '{"ventas":true,"gastos":true}'::jsonb;
    end if;
    new.permisos := limpio;
  else
    new.permisos := '{}'::jsonb;
  end if;

  if new.rol <> 'empleado' then
    new.trabajador_id := null;
  elsif new.trabajador_id is not null and not exists (
    select 1 from public.trabajadores t where t.id = new.trabajador_id and t.owner_id = new.cuenta_id
  ) then
    raise exception 'Ese trabajador no es de esta empresa';
  end if;

  new.email := lower(trim(new.email));
  return new;
end;
$$;

drop trigger if exists miembros_validar_trg on public.miembros;
create trigger miembros_validar_trg before insert or update on public.miembros
  for each row execute function public.miembros_validar();

-- ---------------------------------------------------------------------
-- 3. Funciones de permisos (se usan en todas las reglas de acceso)
-- ---------------------------------------------------------------------

-- Qué eres en esa empresa: titular, asesor, admin, socio, comercial, empleado (o null)
create or replace function public.mi_rol(cuenta uuid)
returns text
language sql stable security definer set search_path = public
as $$
  select case
    when auth.uid() is null or cuenta is null then null
    when cuenta = auth.uid() then 'titular'
    when public.is_advisor() then 'asesor'
    else (select m.rol from public.miembros m
           where m.cuenta_id = cuenta and m.user_id = auth.uid() and m.activo)
  end;
$$;

-- ¿Puedes usar ese módulo de esa empresa?
--   ventas, gastos, bancos, contabilidad, impuestos, laboral, nominas, usuarios, empresa,
--   asesor (Mi asesor) y socio (Vista de socio)
create or replace function public.puede(cuenta uuid, modulo text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select auth.uid() is not null and cuenta is not null and (
    cuenta = auth.uid()
    or public.is_advisor()
    or exists (
      select 1 from public.miembros m
       where m.cuenta_id = cuenta and m.user_id = auth.uid() and m.activo
         and (
           (m.rol = 'admin' and (modulo in ('asesor', 'socio') or coalesce((m.permisos ->> modulo)::boolean, false)))
           or (m.rol = 'socio' and modulo in ('asesor', 'socio'))
           or (m.rol = 'comercial' and modulo = 'ventas')
         )
    )
  );
$$;

-- ¿Puedes emitir facturas? (el comercial solo hace borradores)
create or replace function public.puede_emitir(cuenta uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.puede(cuenta, 'ventas') and coalesce(public.mi_rol(cuenta), '') <> 'comercial';
$$;

-- La ficha de trabajador del empleado que ha entrado (o null)
create or replace function public.mi_trabajador(cuenta uuid)
returns uuid
language sql stable security definer set search_path = public
as $$
  select m.trabajador_id from public.miembros m
   where m.cuenta_id = cuenta and m.user_id = auth.uid() and m.activo and m.rol = 'empleado';
$$;

-- ---------------------------------------------------------------------
-- 4. Quién ha hecho cada cosa
-- ---------------------------------------------------------------------
alter table public.invoices add column if not exists creado_por uuid references public.profiles(id) on delete set null;
alter table public.quotes   add column if not exists creado_por uuid references public.profiles(id) on delete set null;
alter table public.expenses add column if not exists subido_por uuid references public.profiles(id) on delete set null;

-- Rellena la columna indicada con quien ha iniciado sesión (no se puede falsear desde la app)
create or replace function public.poner_autor()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null then
    new := jsonb_populate_record(new, jsonb_build_object(tg_argv[0], auth.uid()));
  end if;
  return new;
end;
$$;

drop trigger if exists invoices_autor on public.invoices;
create trigger invoices_autor before insert on public.invoices
  for each row execute function public.poner_autor('creado_por');
drop trigger if exists quotes_autor on public.quotes;
create trigger quotes_autor before insert on public.quotes
  for each row execute function public.poner_autor('creado_por');
drop trigger if exists expenses_autor on public.expenses;
create trigger expenses_autor before insert on public.expenses
  for each row execute function public.poner_autor('subido_por');

-- ---------------------------------------------------------------------
-- 5. Reglas de acceso (sustituyen a «owner_id = auth.uid() or is_advisor()»)
-- ---------------------------------------------------------------------
alter table public.miembros enable row level security;

-- Miembros: cada uno ve su acceso; quien gestiona usuarios ve y edita los de su empresa.
-- Las altas se hacen con la función invitar-miembro (crea el usuario y envía el correo).
drop policy if exists "miembros: ver" on public.miembros;
drop policy if exists "miembros: editar" on public.miembros;
drop policy if exists "miembros: borrar" on public.miembros;
create policy "miembros: ver" on public.miembros
  for select using (user_id = auth.uid() or public.puede(cuenta_id, 'usuarios'));
create policy "miembros: editar" on public.miembros
  for update using (public.puede(cuenta_id, 'usuarios')) with check (public.puede(cuenta_id, 'usuarios'));
create policy "miembros: borrar" on public.miembros
  for delete using (public.puede(cuenta_id, 'usuarios'));

-- Perfiles: los miembros ven los datos de su empresa (nombre, logo… para las facturas);
-- solo los editan el titular, el asesor y el admin con «empresa»
drop policy if exists "perfiles: ver" on public.profiles;
drop policy if exists "perfiles: editar" on public.profiles;
create policy "perfiles: ver" on public.profiles
  for select using (id = auth.uid() or public.is_advisor() or public.mi_rol(id) is not null);
create policy "perfiles: editar" on public.profiles
  for update using (public.puede(id, 'empresa')) with check (public.puede(id, 'empresa'));

-- Ventas: clientes, presupuestos y facturas
drop policy if exists "contactos: todo" on public.contacts;
create policy "contactos: todo" on public.contacts
  for all using (public.puede(owner_id, 'ventas')) with check (public.puede(owner_id, 'ventas'));

drop policy if exists "presupuestos: todo" on public.quotes;
create policy "presupuestos: todo" on public.quotes
  for all using (public.puede(owner_id, 'ventas')) with check (public.puede(owner_id, 'ventas'));

drop policy if exists "facturas: ver" on public.invoices;
drop policy if exists "facturas: crear" on public.invoices;
drop policy if exists "facturas: editar" on public.invoices;
drop policy if exists "facturas: borrar" on public.invoices;
create policy "facturas: ver" on public.invoices
  for select using (public.puede(owner_id, 'ventas'));
create policy "facturas: crear" on public.invoices
  for insert with check (public.puede(owner_id, 'ventas') and (estado = 'borrador' or public.puede_emitir(owner_id)));
create policy "facturas: editar" on public.invoices
  for update using (public.puede(owner_id, 'ventas') and (estado = 'borrador' or public.puede_emitir(owner_id)))
  with check (public.puede(owner_id, 'ventas') and (estado = 'borrador' or public.puede_emitir(owner_id)));
create policy "facturas: borrar" on public.invoices
  for delete using (
    public.puede(owner_id, 'ventas')
    and (estado = 'borrador' or (origen = 'externa' and public.puede_emitir(owner_id)))
  );

-- Gastos: quien tiene el módulo, todo; el empleado, solo los tickets que sube él y mientras están pendientes
drop policy if exists "gastos: todo" on public.expenses;
drop policy if exists "gastos: ver" on public.expenses;
drop policy if exists "gastos: crear" on public.expenses;
drop policy if exists "gastos: editar" on public.expenses;
drop policy if exists "gastos: borrar" on public.expenses;
create policy "gastos: ver" on public.expenses
  for select using (
    public.puede(owner_id, 'gastos')
    or (subido_por = auth.uid() and public.mi_rol(owner_id) = 'empleado')
  );
create policy "gastos: crear" on public.expenses
  for insert with check (
    public.puede(owner_id, 'gastos')
    or (public.mi_rol(owner_id) = 'empleado' and subido_por = auth.uid() and estado = 'pendiente')
  );
create policy "gastos: editar" on public.expenses
  for update using (
    public.puede(owner_id, 'gastos')
    or (public.mi_rol(owner_id) = 'empleado' and subido_por = auth.uid() and estado = 'pendiente')
  ) with check (
    public.puede(owner_id, 'gastos')
    or (public.mi_rol(owner_id) = 'empleado' and subido_por = auth.uid() and estado = 'pendiente')
  );
create policy "gastos: borrar" on public.expenses
  for delete using (
    public.puede(owner_id, 'gastos')
    or (public.mi_rol(owner_id) = 'empleado' and subido_por = auth.uid() and estado = 'pendiente')
  );

-- Bancos
-- (solo si ya existe extractos_bancarios: si no, se salta)
do $$
begin
  if to_regclass('public.extractos_bancarios') is not null then
    execute $q$drop policy if exists "extractos: ver" on public.extractos_bancarios$q$;
    execute $q$drop policy if exists "extractos: subir" on public.extractos_bancarios$q$;
    execute $q$drop policy if exists "extractos: borrar" on public.extractos_bancarios$q$;
    execute $q$
    create policy "extractos: ver" on public.extractos_bancarios
      for select using (public.puede(owner_id, 'bancos'))
    $q$;
    execute $q$
    create policy "extractos: subir" on public.extractos_bancarios
      for insert with check (public.puede(owner_id, 'bancos'))
    $q$;
    execute $q$
    create policy "extractos: borrar" on public.extractos_bancarios
      for delete using (
        public.is_advisor()
        or (public.puede(owner_id, 'bancos') and subido_por = auth.uid() and not conciliado)
      )
    $q$;
  end if;
end $$;

-- Contabilidad (apertura, asientos manuales e inmovilizado: solo lectura; los edita el asesor)
-- (solo si ya existen asientos_manuales, inmovilizados: si no, se salta)
do $$
begin
  if to_regclass('public.asientos_manuales') is not null and to_regclass('public.inmovilizados') is not null then
    execute $q$drop policy if exists "asientos manuales: ver" on public.asientos_manuales$q$;
    execute $q$
    create policy "asientos manuales: ver" on public.asientos_manuales
      for select using (public.puede(owner_id, 'contabilidad'))
    $q$;
    execute $q$drop policy if exists "inmovilizado: ver" on public.inmovilizados$q$;
    execute $q$
    create policy "inmovilizado: ver" on public.inmovilizados
      for select using (public.puede(owner_id, 'contabilidad') or public.puede(owner_id, 'gastos'))
    $q$;
  end if;
end $$;

-- Impuestos y archivo de documentos
-- (solo si ya existen impuestos, archivo: si no, se salta)
do $$
begin
  if to_regclass('public.impuestos') is not null and to_regclass('public.archivo') is not null then
    execute $q$drop policy if exists "impuestos: ver" on public.impuestos$q$;
    execute $q$
    create policy "impuestos: ver" on public.impuestos
      for select using (public.puede(owner_id, 'impuestos'))
    $q$;
    execute $q$drop policy if exists "archivo: ver" on public.archivo$q$;
    execute $q$drop policy if exists "archivo: subir" on public.archivo$q$;
    execute $q$drop policy if exists "archivo: borrar" on public.archivo$q$;
    execute $q$
    create policy "archivo: ver" on public.archivo
      for select using (public.puede(owner_id, 'impuestos'))
    $q$;
    execute $q$
    create policy "archivo: subir" on public.archivo
      for insert with check (public.puede(owner_id, 'impuestos'))
    $q$;
    execute $q$
    create policy "archivo: borrar" on public.archivo
      for delete using (public.is_advisor() or (public.puede(owner_id, 'impuestos') and subido_por = auth.uid()))
    $q$;
  end if;
end $$;

-- Laboral
drop policy if exists "perfil laboral: ver" on public.perfil_laboral;
create policy "perfil laboral: ver" on public.perfil_laboral
  for select using (public.puede(owner_id, 'laboral'));
drop policy if exists "centros: ver" on public.centros_trabajo;
create policy "centros: ver" on public.centros_trabajo
  for select using (public.puede(owner_id, 'laboral'));
drop policy if exists "categorias: ver" on public.categorias_convenio;
create policy "categorias: ver" on public.categorias_convenio
  for select using (public.puede(owner_id, 'laboral'));

drop policy if exists "trabajadores: ver" on public.trabajadores;
drop policy if exists "trabajadores: solicitar" on public.trabajadores;
drop policy if exists "trabajadores: editar" on public.trabajadores;
drop policy if exists "trabajadores: cancelar" on public.trabajadores;
create policy "trabajadores: ver" on public.trabajadores
  for select using (public.puede(owner_id, 'laboral') or id = public.mi_trabajador(owner_id));
create policy "trabajadores: solicitar" on public.trabajadores
  for insert with check (public.puede(owner_id, 'laboral'));
create policy "trabajadores: editar" on public.trabajadores
  for update using ((public.puede(owner_id, 'laboral') and estado = 'solicitada') or public.is_advisor())
  with check (public.puede(owner_id, 'laboral'));
create policy "trabajadores: cancelar" on public.trabajadores
  for delete using ((public.puede(owner_id, 'laboral') and estado = 'solicitada') or public.is_advisor());

drop policy if exists "documentos trabajador: ver" on public.trabajador_documentos;
drop policy if exists "documentos trabajador: subir" on public.trabajador_documentos;
drop policy if exists "documentos trabajador: borrar" on public.trabajador_documentos;
create policy "documentos trabajador: ver" on public.trabajador_documentos
  for select using (public.puede(owner_id, 'laboral') or trabajador_id = public.mi_trabajador(owner_id));
create policy "documentos trabajador: subir" on public.trabajador_documentos
  for insert with check (public.puede(owner_id, 'laboral'));
create policy "documentos trabajador: borrar" on public.trabajador_documentos
  for delete using ((public.puede(owner_id, 'laboral') and subido_por = auth.uid()) or public.is_advisor());

-- Nóminas: las sube el asesor; las publicadas las ve quien tiene «nóminas» y cada empleado las suyas
drop policy if exists "nominas: ver publicadas" on public.nominas;
create policy "nominas: ver publicadas" on public.nominas
  for select using (
    public.is_advisor()
    or (estado = 'publicada' and (public.puede(owner_id, 'nominas') or trabajador_id = public.mi_trabajador(owner_id)))
  );

-- Mi asesor (llamadas y citas): titular, admins y socios
-- (solo si ya existe llamadas: si no, se salta)
do $$
begin
  if to_regclass('public.llamadas') is not null then
    execute $q$drop policy if exists "llamadas: ver" on public.llamadas$q$;
    execute $q$drop policy if exists "llamadas: pedir" on public.llamadas$q$;
    execute $q$
    create policy "llamadas: ver" on public.llamadas
      for select using (public.puede(owner_id, 'asesor'))
    $q$;
    execute $q$
    create policy "llamadas: pedir" on public.llamadas
      for insert with check ((public.puede(owner_id, 'asesor') and estado = 'pendiente') or public.is_advisor())
    $q$;
  end if;
end $$;

-- Facturas de NomoTax a la empresa (botón «Facturación» de Mi perfil)
-- (solo si ya existe facturas_plan: si no, se salta)
do $$
begin
  if to_regclass('public.facturas_plan') is not null then
    execute $q$drop policy if exists "facturas_plan: ver" on public.facturas_plan$q$;
    execute $q$
    create policy "facturas_plan: ver" on public.facturas_plan
      for select using (public.puede(cliente_id, 'empresa'))
    $q$;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 6. Archivos (bucket «documentos»): {empresa}/{carpeta}/…
--   gastos → gastos · facturas → ventas · bancos → bancos · impuestos, archivo → impuestos
--   laboral/nominas → nóminas · laboral/{trabajador} → laboral · logo → lo ven todos los miembros
-- ---------------------------------------------------------------------
create or replace function public.puede_archivo(p_nombre text, p_accion text)
returns boolean
language plpgsql stable security definer set search_path = public
as $$
declare
  v_partes text[] := storage.foldername(p_nombre);
  v_cuenta uuid;
  v_rol text;
begin
  if auth.uid() is null then return false; end if;
  if public.is_advisor() then return true; end if;
  begin
    v_cuenta := v_partes[1]::uuid;
  exception when others then
    return false;
  end;
  if v_cuenta = auth.uid() then return true; end if;
  v_rol := public.mi_rol(v_cuenta);
  if v_rol is null then return false; end if;

  case v_partes[2]
    when 'logo' then
      return p_accion = 'ver' or public.puede(v_cuenta, 'empresa');
    when 'facturas' then
      return public.puede(v_cuenta, 'ventas');
    when 'gastos' then
      if public.puede(v_cuenta, 'gastos') then return true; end if;
      if v_rol <> 'empleado' then return false; end if;
      if p_accion = 'subir' then return true; end if;
      return exists (
        select 1 from public.expenses e
         where e.owner_id = v_cuenta and e.file_path = p_nombre and e.subido_por = auth.uid()
           and (p_accion = 'ver' or e.estado = 'pendiente')
      );
    when 'bancos' then
      return public.puede(v_cuenta, 'bancos');
    when 'impuestos', 'archivo' then
      return public.puede(v_cuenta, 'impuestos');
    when 'laboral' then
      if v_partes[3] = 'nominas' then
        return p_accion = 'ver' and (
          public.puede(v_cuenta, 'nominas')
          or exists (
            select 1 from public.nominas n
             where n.owner_id = v_cuenta and n.file_path = p_nombre and n.estado = 'publicada'
               and n.trabajador_id = public.mi_trabajador(v_cuenta)
          )
        );
      end if;
      if public.puede(v_cuenta, 'laboral') then return true; end if;
      return p_accion = 'ver' and v_partes[3] = public.mi_trabajador(v_cuenta)::text;
    else
      return false;
  end case;
end;
$$;

drop policy if exists "documentos: ver" on storage.objects;
drop policy if exists "documentos: subir" on storage.objects;
drop policy if exists "documentos: actualizar" on storage.objects;
drop policy if exists "documentos: borrar" on storage.objects;
create policy "documentos: ver" on storage.objects
  for select using (bucket_id = 'documentos' and public.puede_archivo(name, 'ver'));
create policy "documentos: subir" on storage.objects
  for insert with check (bucket_id = 'documentos' and public.puede_archivo(name, 'subir'));
create policy "documentos: actualizar" on storage.objects
  for update using (bucket_id = 'documentos' and public.puede_archivo(name, 'editar'));
create policy "documentos: borrar" on storage.objects
  for delete using (bucket_id = 'documentos' and public.puede_archivo(name, 'borrar'));

-- ---------------------------------------------------------------------
-- 7. Nóminas en totales por mes (sin nombres ni sueldos de nadie).
--    Para la contabilidad de un admin sin el módulo «nóminas».
-- ---------------------------------------------------------------------
create or replace function public.nominas_agregadas(cuenta uuid)
returns table (
  anio int, mes int, bruto numeric, ss_trabajador numeric, ss_empresa numeric,
  irpf numeric, neto numeric, coste_total numeric, nominas int
)
language sql stable security definer set search_path = public
as $$
  select n.anio, n.mes,
         sum(n.bruto), sum(n.ss_trabajador), sum(n.ss_empresa),
         sum(n.irpf), sum(n.neto), sum(n.coste_total), count(*)::int
    from public.nominas n
   where n.owner_id = cuenta and n.estado = 'publicada'
     and public.puede(cuenta, 'contabilidad')
   group by n.anio, n.mes
   order by n.anio, n.mes;
$$;

-- Avisos en tiempo real (la pantalla de Usuarios se actualiza sola)
do $$
begin
  alter publication supabase_realtime add table public.miembros;
exception when duplicate_object then null;
end $$;

-- Que la API vea la tabla y las columnas nuevas al momento
notify pgrst, 'reload schema';
