-- =====================================================================
-- NomoTax · Área de clientes — AUSENCIAS: vacaciones, permisos y bajas
--
--   · El trabajador pide vacaciones o un permiso desde «Mi espacio → Ausencias»; la empresa
--     (quien lleva Laboral) lo aprueba o lo rechaza en «Laboral → Ausencias».
--   · Las bajas no se aprueban: se comunican y quedan registradas (el parte es opcional: desde el
--     1/4/2023 la Seguridad Social se lo manda a la empresa, RD 1060/2022).
--   · Lo que apunta la empresa vale ya (aprobada).
--   · Nada se borra: se anula y queda constancia. Solo se cambia con las funciones de abajo.
--   · Festivos locales de cada empresa (los 2 de su municipio): tabla festivos_empresa.
--     Los nacionales y autonómicos están en la app (src/lib/festivosDatos.ts, del BOE).
--
-- Pegar en Supabase → SQL Editor → Run (después de fichajes.sql y cuentas-titular.sql).
-- Se puede volver a ejecutar.
-- =====================================================================

-- Días de vacaciones del contrato (ya los usa la ficha del trabajador)
alter table public.trabajadores add column if not exists vacaciones_dias int;
alter table public.trabajadores add column if not exists vacaciones_nota text;

-- ---------------------------------------------------------------------
-- 1. Ausencias
-- ---------------------------------------------------------------------
create table if not exists public.ausencias (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  trabajador_id uuid not null references public.trabajadores(id) on delete restrict,
  tipo text not null check (tipo in ('vacaciones', 'permiso', 'baja')),
  subtipo text,
  desde date not null,
  hasta date,                       -- solo una baja puede quedar abierta (sin fecha de alta)
  motivo text,
  archivo_path text,                -- justificante o parte (opcional)
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aprobada', 'rechazada', 'anulada')),
  respuesta text,                   -- motivo del rechazo o de la anulación
  solicitado_por uuid references public.profiles(id) on delete set null,
  revisado_por uuid references public.profiles(id) on delete set null,
  revisado_at timestamptz,
  asesor_visto boolean not null default false,   -- bajas: el asesor ya la tiene en cuenta para la nómina
  created_at timestamptz not null default now(),
  check (hasta is null or hasta >= desde),
  check (hasta is not null or tipo = 'baja')
);
create index if not exists ausencias_trab_idx on public.ausencias(trabajador_id, desde);
create index if not exists ausencias_owner_idx on public.ausencias(owner_id, estado);

-- No se borra nunca
create or replace function public.ausencias_no_borrar()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Las ausencias no se borran: se anulan y queda constancia';
end;
$$;
drop trigger if exists ausencias_no_borrar_trg on public.ausencias;
create trigger ausencias_no_borrar_trg before delete on public.ausencias
  for each row execute function public.ausencias_no_borrar();

alter table public.ausencias enable row level security;

-- Ver: quien lleva Laboral (y el asesor) y cada trabajador las suyas. Escribir: solo con las funciones.
drop policy if exists ausencias_ver on public.ausencias;
create policy ausencias_ver on public.ausencias for select using (
  public.puede(owner_id, 'laboral') or trabajador_id = public.mi_trabajador(owner_id)
);

-- ¿Se solapa con otra ausencia vigente del mismo trabajador?
create or replace function public.ausencia_solapa(p_trabajador uuid, p_desde date, p_hasta date, p_excepto uuid default null)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.ausencias a
     where a.trabajador_id = p_trabajador and a.estado in ('pendiente', 'aprobada')
       and a.id is distinct from p_excepto
       and a.desde <= coalesce(p_hasta, 'infinity'::date)
       and coalesce(a.hasta, 'infinity'::date) >= p_desde
  );
$$;

-- Pedir (trabajador) o apuntar (empresa) una ausencia
create or replace function public.pedir_ausencia(
  p_cuenta uuid, p_trabajador uuid, p_tipo text, p_subtipo text, p_desde date, p_hasta date,
  p_motivo text default null, p_archivo text default null)
returns public.ausencias
language plpgsql security definer set search_path = public
as $$
declare
  v_admin boolean := public.puede(p_cuenta, 'laboral');
  v_estado text;
  r public.ausencias;
begin
  if not v_admin and public.mi_trabajador(p_cuenta) is distinct from p_trabajador then
    raise exception 'Solo puedes pedir ausencias para ti';
  end if;
  if not exists (select 1 from public.trabajadores t where t.id = p_trabajador and t.owner_id = p_cuenta) then
    raise exception 'Ese trabajador no es de esta empresa';
  end if;
  if p_tipo not in ('vacaciones', 'permiso', 'baja') then raise exception 'Tipo de ausencia no válido'; end if;
  if p_desde is null then raise exception 'Pon el primer día'; end if;
  if p_hasta is null and p_tipo <> 'baja' then raise exception 'Pon el último día'; end if;
  if p_hasta is not null and p_hasta < p_desde then raise exception 'El último día no puede ser anterior al primero'; end if;
  if p_hasta is not null and p_hasta - p_desde > 366 then raise exception 'Como mucho, un año seguido'; end if;
  if p_tipo = 'permiso' and coalesce(trim(p_motivo), '') = '' and coalesce(p_subtipo, 'otro') = 'otro' then
    raise exception 'Explica el motivo del permiso';
  end if;
  if p_archivo is not null and p_archivo not like p_cuenta::text || '/laboral/' || p_trabajador::text || '/ausencias/%' then
    raise exception 'Justificante no válido';
  end if;
  if public.ausencia_solapa(p_trabajador, p_desde, p_hasta) then
    raise exception 'Ya hay otra ausencia en esas fechas';
  end if;

  -- La baja se comunica (no se aprueba) y lo que apunta la empresa vale ya
  v_estado := case when v_admin or p_tipo = 'baja' then 'aprobada' else 'pendiente' end;
  insert into public.ausencias (owner_id, trabajador_id, tipo, subtipo, desde, hasta, motivo, archivo_path, estado,
                                solicitado_por, revisado_por, revisado_at)
  values (p_cuenta, p_trabajador, p_tipo, nullif(trim(coalesce(p_subtipo, '')), ''), p_desde, p_hasta,
          nullif(trim(coalesce(p_motivo, '')), ''), p_archivo, v_estado, auth.uid(),
          case when v_admin then auth.uid() end, case when v_admin then now() end)
  returning * into r;
  return r;
end;
$$;

-- Aprobar o rechazar (empresa)
create or replace function public.resolver_ausencia(p_id uuid, p_aprobar boolean, p_respuesta text default null)
returns public.ausencias
language plpgsql security definer set search_path = public
as $$
declare
  a public.ausencias;
begin
  select * into a from public.ausencias where id = p_id;
  if a.id is null or a.estado <> 'pendiente' then raise exception 'Esa solicitud ya no está pendiente'; end if;
  if not public.puede(a.owner_id, 'laboral') then raise exception 'No puedes aprobar ausencias'; end if;
  update public.ausencias
     set estado = case when p_aprobar then 'aprobada' else 'rechazada' end,
         respuesta = nullif(trim(coalesce(p_respuesta, '')), ''),
         revisado_por = auth.uid(), revisado_at = now()
   where id = p_id
  returning * into a;
  return a;
end;
$$;

-- Anular: el trabajador, lo suyo mientras está pendiente; la empresa, cualquiera (con motivo si ya estaba aprobada)
create or replace function public.anular_ausencia(p_id uuid, p_motivo text default null)
returns public.ausencias
language plpgsql security definer set search_path = public
as $$
declare
  a public.ausencias;
  v_admin boolean;
begin
  select * into a from public.ausencias where id = p_id;
  if a.id is null or a.estado not in ('pendiente', 'aprobada') then raise exception 'Esa ausencia ya no se puede anular'; end if;
  v_admin := public.puede(a.owner_id, 'laboral');
  if not v_admin then
    if a.trabajador_id is distinct from public.mi_trabajador(a.owner_id) then raise exception 'No puedes anular esta ausencia'; end if;
    if a.estado <> 'pendiente' then raise exception 'Ya está aprobada: pide a la empresa que la anule'; end if;
  elsif a.estado = 'aprobada' and coalesce(trim(p_motivo), '') = '' then
    raise exception 'Pon el motivo de la anulación';
  end if;
  update public.ausencias
     set estado = 'anulada', respuesta = nullif(trim(coalesce(p_motivo, '')), ''),
         revisado_por = auth.uid(), revisado_at = now()
   where id = p_id
  returning * into a;
  return a;
end;
$$;

-- Fecha de alta de una baja abierta (trabajador o empresa)
create or replace function public.cerrar_baja(p_id uuid, p_hasta date)
returns public.ausencias
language plpgsql security definer set search_path = public
as $$
declare
  a public.ausencias;
begin
  select * into a from public.ausencias where id = p_id;
  if a.id is null or a.tipo <> 'baja' or a.estado <> 'aprobada' or a.hasta is not null then
    raise exception 'Esa baja no está abierta';
  end if;
  if not public.puede(a.owner_id, 'laboral') and a.trabajador_id is distinct from public.mi_trabajador(a.owner_id) then
    raise exception 'No puedes cambiar esta baja';
  end if;
  if p_hasta is null or p_hasta < a.desde then raise exception 'El último día de baja no puede ser anterior al primero'; end if;
  if public.ausencia_solapa(a.trabajador_id, a.desde, p_hasta, a.id) then raise exception 'Se solapa con otra ausencia'; end if;
  update public.ausencias set hasta = p_hasta where id = p_id returning * into a;
  return a;
end;
$$;

-- Añadir el justificante o el parte después
create or replace function public.adjuntar_ausencia(p_id uuid, p_archivo text)
returns public.ausencias
language plpgsql security definer set search_path = public
as $$
declare
  a public.ausencias;
begin
  select * into a from public.ausencias where id = p_id;
  if a.id is null then raise exception 'No existe esa ausencia'; end if;
  if not public.puede(a.owner_id, 'laboral') and a.trabajador_id is distinct from public.mi_trabajador(a.owner_id) then
    raise exception 'No puedes cambiar esta ausencia';
  end if;
  if a.archivo_path is not null then raise exception 'Ya tiene un justificante'; end if;
  if p_archivo is null or p_archivo not like a.owner_id::text || '/laboral/' || a.trabajador_id::text || '/ausencias/%' then
    raise exception 'Justificante no válido';
  end if;
  update public.ausencias set archivo_path = p_archivo where id = p_id returning * into a;
  return a;
end;
$$;

-- El asesor ya ha visto la baja (sale en su Bandeja hasta entonces)
create or replace function public.baja_vista(p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_advisor() then raise exception 'Solo el asesor'; end if;
  update public.ausencias set asesor_visto = true where id = p_id;
end;
$$;

-- Lo único que se cambia fuera de esas funciones: nada (sin políticas de insert/update/delete)
revoke all on function public.pedir_ausencia(uuid, uuid, text, text, date, date, text, text) from public;
revoke all on function public.resolver_ausencia(uuid, boolean, text) from public;
revoke all on function public.anular_ausencia(uuid, text) from public;
revoke all on function public.cerrar_baja(uuid, date) from public;
revoke all on function public.adjuntar_ausencia(uuid, text) from public;
revoke all on function public.baja_vista(uuid) from public;
grant execute on function public.pedir_ausencia(uuid, uuid, text, text, date, date, text, text) to authenticated;
grant execute on function public.resolver_ausencia(uuid, boolean, text) to authenticated;
grant execute on function public.anular_ausencia(uuid, text) to authenticated;
grant execute on function public.cerrar_baja(uuid, date) to authenticated;
grant execute on function public.adjuntar_ausencia(uuid, text) to authenticated;
grant execute on function public.baja_vista(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 2. Festivos locales de cada empresa (los 2 de su municipio, o los que diga su convenio)
-- ---------------------------------------------------------------------
create table if not exists public.festivos_empresa (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  fecha date not null,
  nombre text not null,
  created_at timestamptz not null default now(),
  unique (owner_id, fecha)
);
alter table public.festivos_empresa enable row level security;

drop policy if exists festivos_ver on public.festivos_empresa;
create policy festivos_ver on public.festivos_empresa for select using (
  public.puede(owner_id, 'laboral') or public.mi_trabajador(owner_id) is not null
);
drop policy if exists festivos_crear on public.festivos_empresa;
create policy festivos_crear on public.festivos_empresa for insert with check (public.puede(owner_id, 'laboral'));
drop policy if exists festivos_borrar on public.festivos_empresa;
create policy festivos_borrar on public.festivos_empresa for delete using (public.puede(owner_id, 'laboral'));

-- ---------------------------------------------------------------------
-- 3. Archivos: el trabajador puede subir su justificante en <empresa>/laboral/<su ficha>/ausencias/…
--    (misma función que cuentas-titular.sql, con esa línea de más)
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
      if v_partes[3] is distinct from public.mi_trabajador(v_cuenta)::text then return false; end if;
      return p_accion = 'ver' or (p_accion = 'subir' and v_partes[4] = 'ausencias');
    else
      return false;
  end case;
end;
$$;

notify pgrst, 'reload schema';
