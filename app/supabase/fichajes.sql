-- =====================================================================
-- NomoTax · Área de clientes — REGISTRO DE JORNADA (FICHAJE)
-- Art. 34.9 del Estatuto de los Trabajadores (RDL 8/2019): registro diario con la hora de
-- inicio y fin de cada trabajador, conservado 4 años, a disposición del trabajador, sus
-- representantes y la Inspección de Trabajo.
--
-- Garantías:
--   · La hora la pone el servidor (now()), nunca el móvil.
--   · Nada se borra ni se edita: lo bloquea la base de datos. Solo cambia el estado de una
--     corrección pendiente (aprobar/rechazar), y queda quién y cuándo.
--   · Una corrección es un registro nuevo con motivo; si anula otro, el original se conserva.
--   · No se puede borrar un trabajador con fichajes (hay que conservarlos 4 años).
--
-- Pegar en Supabase → SQL Editor → Run (después de usuarios.sql). Se puede volver a ejecutar.
-- =====================================================================

-- Qué personas fichan: se marca en Usuarios
alter table public.miembros add column if not exists fichaje boolean not null default false;

create table if not exists public.fichajes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  trabajador_id uuid not null references public.trabajadores(id) on delete restrict,
  tipo text not null check (tipo in ('entrada', 'pausa', 'reanudar', 'salida')),
  momento timestamptz not null,
  origen text not null check (origen in ('app', 'correccion')),
  estado text not null default 'valido' check (estado in ('valido', 'pendiente', 'rechazado')),
  motivo text,
  anula_id uuid references public.fichajes(id) on delete restrict,
  registrado_por uuid references public.profiles(id) on delete set null,
  revisado_por uuid references public.profiles(id) on delete set null,
  revisado_at timestamptz,
  created_at timestamptz not null default now(),
  check (origen = 'app' or coalesce(trim(motivo), '') <> '')
);
create index if not exists fichajes_trab_idx on public.fichajes(trabajador_id, momento);
create index if not exists fichajes_owner_idx on public.fichajes(owner_id, momento);

-- Inalterable: no se borra nunca; solo se resuelve una corrección pendiente
create or replace function public.fichajes_inalterable()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'El registro de jornada no se puede borrar (se conserva 4 años)';
  end if;
  if old.estado <> 'pendiente' or new.estado not in ('valido', 'rechazado')
     or (to_jsonb(new) - array['estado', 'revisado_por', 'revisado_at'])
        is distinct from (to_jsonb(old) - array['estado', 'revisado_por', 'revisado_at']) then
    raise exception 'El registro de jornada no se puede modificar: haz una corrección';
  end if;
  return new;
end;
$$;

drop trigger if exists fichajes_inalterable_trg on public.fichajes;
create trigger fichajes_inalterable_trg before update or delete on public.fichajes
  for each row execute function public.fichajes_inalterable();

alter table public.fichajes enable row level security;

-- Ver: quien lleva Laboral en la empresa, y cada trabajador lo suyo. Escribir: solo con las funciones de abajo.
drop policy if exists fichajes_ver on public.fichajes;
create policy fichajes_ver on public.fichajes for select using (
  public.puede(owner_id, 'laboral')
  or exists (select 1 from public.miembros m
             where m.cuenta_id = fichajes.owner_id and m.user_id = auth.uid() and m.activo
               and m.trabajador_id = fichajes.trabajador_id)
);

-- Último estado válido del trabajador hoy en adelante: 'fuera', 'dentro' o 'pausa'
create or replace function public.fichaje_estado(p_trabajador uuid)
returns text
language sql stable security definer set search_path = public
as $$
  select case (select f.tipo from public.fichajes f
               where f.trabajador_id = p_trabajador and f.estado = 'valido'
                 and f.momento > now() - interval '24 hours'
                 and not exists (select 1 from public.fichajes a
                                 where a.anula_id = f.id and a.estado = 'valido')
               order by f.momento desc limit 1)
    when 'entrada' then 'dentro'
    when 'reanudar' then 'dentro'
    when 'pausa' then 'pausa'
    else 'fuera'
  end;
$$;

-- Fichar ahora (botón del trabajador). La hora es la del servidor.
create or replace function public.fichar(p_cuenta uuid, p_tipo text)
returns public.fichajes
language plpgsql security definer set search_path = public
as $$
declare
  v_trab uuid;
  v_estado text;
  r public.fichajes;
begin
  select m.trabajador_id into v_trab from public.miembros m
   where m.cuenta_id = p_cuenta and m.user_id = auth.uid() and m.activo and m.fichaje;
  if v_trab is null then
    raise exception 'No tienes activado el fichaje en esta empresa';
  end if;
  v_estado := public.fichaje_estado(v_trab);
  if (p_tipo = 'entrada' and v_estado <> 'fuera')
     or (p_tipo = 'pausa' and v_estado <> 'dentro')
     or (p_tipo = 'reanudar' and v_estado <> 'pausa')
     or (p_tipo = 'salida' and v_estado = 'fuera') then
    raise exception 'Ese fichaje no toca ahora (estás %)', v_estado;
  end if;
  insert into public.fichajes (owner_id, trabajador_id, tipo, momento, origen, estado, registrado_por)
  values (p_cuenta, v_trab, p_tipo, now(), 'app', 'valido', auth.uid())
  returning * into r;
  return r;
end;
$$;

-- Corrección (olvido de fichar, hora mal…). Si la hace quien lleva Laboral, vale ya;
-- si la pide el trabajador, queda pendiente hasta que la aprueben.
create or replace function public.corregir_fichaje(
  p_cuenta uuid, p_trabajador uuid, p_tipo text, p_momento timestamptz, p_motivo text, p_anula uuid default null)
returns public.fichajes
language plpgsql security definer set search_path = public
as $$
declare
  v_admin boolean := public.puede(p_cuenta, 'laboral');
  r public.fichajes;
begin
  if not v_admin and not exists (
    select 1 from public.miembros m where m.cuenta_id = p_cuenta and m.user_id = auth.uid()
      and m.activo and m.fichaje and m.trabajador_id = p_trabajador) then
    raise exception 'No puedes corregir los fichajes de esta persona';
  end if;
  if not exists (select 1 from public.trabajadores t where t.id = p_trabajador and t.owner_id = p_cuenta) then
    raise exception 'Ese trabajador no es de esta empresa';
  end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Pon el motivo de la corrección'; end if;
  if p_momento > now() then raise exception 'No se puede fichar en el futuro'; end if;
  if p_anula is not null and not exists (
    select 1 from public.fichajes f where f.id = p_anula and f.trabajador_id = p_trabajador) then
    raise exception 'El fichaje a anular no es de este trabajador';
  end if;
  insert into public.fichajes (owner_id, trabajador_id, tipo, momento, origen, estado, motivo, anula_id,
                               registrado_por, revisado_por, revisado_at)
  values (p_cuenta, p_trabajador, p_tipo, p_momento, 'correccion',
          case when v_admin then 'valido' else 'pendiente' end, trim(p_motivo), p_anula, auth.uid(),
          case when v_admin then auth.uid() end, case when v_admin then now() end)
  returning * into r;
  return r;
end;
$$;

-- Aprobar o rechazar una corrección pendiente
create or replace function public.resolver_fichaje(p_id uuid, p_aprobar boolean)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_owner uuid;
begin
  select owner_id into v_owner from public.fichajes where id = p_id and estado = 'pendiente';
  if v_owner is null then raise exception 'No hay ninguna corrección pendiente con ese id'; end if;
  if not public.puede(v_owner, 'laboral') then raise exception 'No puedes aprobar correcciones'; end if;
  update public.fichajes
     set estado = case when p_aprobar then 'valido' else 'rechazado' end,
         revisado_por = auth.uid(), revisado_at = now()
   where id = p_id;
end;
$$;

revoke all on function public.fichar(uuid, text) from public;
revoke all on function public.corregir_fichaje(uuid, uuid, text, timestamptz, text, uuid) from public;
revoke all on function public.resolver_fichaje(uuid, boolean) from public;
grant execute on function public.fichar(uuid, text) to authenticated;
grant execute on function public.corregir_fichaje(uuid, uuid, text, timestamptz, text, uuid) to authenticated;
grant execute on function public.resolver_fichaje(uuid, boolean) to authenticated;
