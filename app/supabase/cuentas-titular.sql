-- =====================================================================
-- NomoTax · Área de clientes — VARIAS CUENTAS DEL MISMO TITULAR
-- Una persona entra con UN solo email y tiene varias cuentas: su actividad de
-- autónomo, su SL, otra SL… Cada cuenta sigue siendo un perfil con sus datos,
-- sus facturas y su contabilidad, pero las «cuentas vinculadas» no tienen login:
-- profiles.titular_id dice de quién son y esa persona es su titular (acceso total).
--
-- Las crea el asesor desde el panel («Añadir otra empresa o actividad», función
-- invitar-cliente con { titular }). Por dentro son un usuario de Supabase con un
-- email técnico que nadie usa (@sin-acceso.nomotax.io) y sin contraseña; en
-- profiles.email se guarda el email del titular, para las respuestas a facturas
-- y los avisos.
--
-- Pegar en Supabase → SQL Editor → Run, DESPUÉS de usuarios.sql y de
-- trabajador-cualquier-rol.sql. Se puede repetir sin problema.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. De quién es cada cuenta vinculada
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists titular_id uuid references public.profiles(id) on delete set null;
alter table public.profiles drop constraint if exists profiles_titular_distinto;
alter table public.profiles add constraint profiles_titular_distinto check (titular_id is null or titular_id <> id);
create index if not exists profiles_titular_idx on public.profiles(titular_id) where titular_id is not null;

-- Solo el asesor (o el SQL Editor) vincula cuentas; el titular es un cliente con login
-- propio y no puede ser a su vez una cuenta vinculada (nada de cadenas)
create or replace function public.profiles_titular_validar()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.titular_id is not distinct from (case when tg_op = 'UPDATE' then old.titular_id end) then
    return new;
  end if;
  if auth.uid() is not null and not public.is_advisor() then
    raise exception 'Solo tu asesor puede vincular cuentas';
  end if;
  if new.titular_id is not null then
    if not exists (select 1 from public.profiles p
                    where p.id = new.titular_id and p.role = 'client' and p.titular_id is null) then
      raise exception 'El titular tiene que ser un cliente con acceso propio (no otra cuenta vinculada)';
    end if;
    if exists (select 1 from public.profiles p where p.titular_id = new.id) then
      raise exception 'Esta cuenta ya es titular de otras: no puede colgar de nadie';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_titular_trg on public.profiles;
create trigger profiles_titular_trg before insert or update of titular_id on public.profiles
  for each row execute function public.profiles_titular_validar();

-- ---------------------------------------------------------------------
-- 2. ¿Eres el titular de esa cuenta? (la tuya o una vinculada a ti)
-- ---------------------------------------------------------------------
create or replace function public.es_titular(cuenta uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select auth.uid() is not null and cuenta is not null and (
    cuenta = auth.uid()
    or exists (select 1 from public.profiles p where p.id = cuenta and p.titular_id = auth.uid())
  );
$$;

-- ---------------------------------------------------------------------
-- 3. Permisos: el titular de una cuenta vinculada lo puede todo en ella
--    (mismas funciones que usuarios.sql, cambiando «cuenta = auth.uid()» por es_titular)
-- ---------------------------------------------------------------------
create or replace function public.mi_rol(cuenta uuid)
returns text
language sql stable security definer set search_path = public
as $$
  select case
    when auth.uid() is null or cuenta is null then null
    when public.es_titular(cuenta) then 'titular'
    when public.is_advisor() then 'asesor'
    else (select m.rol from public.miembros m
           where m.cuenta_id = cuenta and m.user_id = auth.uid() and m.activo)
  end;
$$;

create or replace function public.puede(cuenta uuid, modulo text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select auth.uid() is not null and cuenta is not null and (
    public.es_titular(cuenta)
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

-- Archivos (la versión de trabajador-cualquier-rol.sql, con el titular de la cuenta vinculada)
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
  if public.es_titular(v_cuenta) then return true; end if;
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

-- El titular no se da de alta como usuario de su propia cuenta vinculada (ya lo puede todo)
create or replace function public.miembros_no_titular()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (select 1 from public.profiles p where p.id = new.cuenta_id and p.titular_id = new.user_id) then
    raise exception 'Esa persona es la titular de esta cuenta: ya tiene acceso a todo';
  end if;
  return new;
end;
$$;

drop trigger if exists miembros_no_titular_trg on public.miembros;
create trigger miembros_no_titular_trg before insert on public.miembros
  for each row execute function public.miembros_no_titular();

notify pgrst, 'reload schema';
