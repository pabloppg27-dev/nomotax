-- Ser trabajador no depende del rol: un administrador, socio, comercial o empleado puede tener
-- su ficha de Laboral vinculada y ver en «Mi espacio» sus nóminas, documentos y ficha, y subir sus tickets.
-- Se ejecuta pegándolo en Supabase -> SQL Editor (después de usuarios.sql). Se puede repetir sin problema.

-- 1. La ficha de trabajador ya no se borra si el rol no es «empleado»
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

  -- La ficha de trabajador se puede vincular con cualquier rol (un comercial o un admin también pueden ser trabajadores)
  if new.trabajador_id is not null and not exists (
    select 1 from public.trabajadores t where t.id = new.trabajador_id and t.owner_id = new.cuenta_id
  ) then
    raise exception 'Ese trabajador no es de esta empresa';
  end if;

  new.email := lower(trim(new.email));
  return new;
end;
$$;

-- 2. Su ficha, sea cual sea su rol
create or replace function public.mi_trabajador(cuenta uuid)
returns uuid
language sql stable security definer set search_path = public
as $$
  select m.trabajador_id from public.miembros m
   where m.cuenta_id = cuenta and m.user_id = auth.uid() and m.activo;
$$;

-- 3. Puede subir tickets de gasto quien es empleado o tiene ficha de trabajador
create or replace function public.sube_tickets(cuenta uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(public.mi_rol(cuenta), '') = 'empleado' or public.mi_trabajador(cuenta) is not null;
$$;

-- 4. Gastos: quien tiene el módulo, todo; quien sube tickets, solo los suyos y mientras están pendientes
drop policy if exists "gastos: todo" on public.expenses;
drop policy if exists "gastos: ver" on public.expenses;
drop policy if exists "gastos: crear" on public.expenses;
drop policy if exists "gastos: editar" on public.expenses;
drop policy if exists "gastos: borrar" on public.expenses;
create policy "gastos: ver" on public.expenses
  for select using (
    public.puede(owner_id, 'gastos')
    or (subido_por = auth.uid() and public.sube_tickets(owner_id))
  );
create policy "gastos: crear" on public.expenses
  for insert with check (
    public.puede(owner_id, 'gastos')
    or (public.sube_tickets(owner_id) and subido_por = auth.uid() and estado = 'pendiente')
  );
create policy "gastos: editar" on public.expenses
  for update using (
    public.puede(owner_id, 'gastos')
    or (public.sube_tickets(owner_id) and subido_por = auth.uid() and estado = 'pendiente')
  ) with check (
    public.puede(owner_id, 'gastos')
    or (public.sube_tickets(owner_id) and subido_por = auth.uid() and estado = 'pendiente')
  );
create policy "gastos: borrar" on public.expenses
  for delete using (
    public.puede(owner_id, 'gastos')
    or (public.sube_tickets(owner_id) and subido_por = auth.uid() and estado = 'pendiente')
  );

-- 5. Archivos: los tickets (carpeta gastos) los puede subir quien tiene ficha, sea cual sea su rol
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
      if not public.sube_tickets(v_cuenta) then return false; end if;
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
