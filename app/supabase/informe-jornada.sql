-- =====================================================================
-- NomoTax · INFORME SEMANAL DE JORNADA
-- Cada lunes, la Edge Function «jornada» manda a cada trabajador que ficha el resumen de su semana
-- (lo fichado frente a su jornada, días sin fichar o sin salida, vacaciones/permisos/bajas/festivos)
-- y al propietario y a quien lleva Laboral el resumen del equipo.
--
-- Se activa por empresa (lo hace el asesor): perfil_laboral.informe_jornada = true.
-- Pegar en Supabase → SQL Editor → Run, DESPUÉS de ausencias.sql y de publicar la función «jornada».
-- CAMBIA_ESTO = la misma clave que el secreto CRON_SECRET (~/.nomotax-cron-secret).
-- Se puede volver a ejecutar.
-- =====================================================================

alter table public.perfil_laboral add column if not exists informe_jornada boolean not null default false;

-- Registro de envíos: uno por empresa, semana y destinatario (así nunca se manda dos veces)
create table if not exists public.informes_jornada (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  semana date not null,                         -- lunes de la semana del informe
  trabajador_id uuid references public.trabajadores(id) on delete set null,   -- null = informe del equipo
  email text not null,
  remitente text,
  error text,
  created_at timestamptz not null default now(),
  unique (owner_id, semana, email)
);
alter table public.informes_jornada enable row level security;
drop policy if exists informes_jornada_ver on public.informes_jornada;
create policy informes_jornada_ver on public.informes_jornada for select using (public.puede(owner_id, 'laboral'));

-- El informe lo activa el asesor (el cliente puede ver el perfil laboral, no cambiarlo: laboral.sql)

-- Primera empresa: NOVA HIRING, S.L.
insert into public.perfil_laboral (owner_id, informe_jornada)
select p.id, true from public.profiles p where p.nif = 'B75773119'
on conflict (owner_id) do update set informe_jornada = true;

-- CRON
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Lunes a las 08:00 de Madrid todo el año: pg_cron va en UTC, así que se llama a las 06:00 y a las 07:00 UTC
-- y la función solo envía en la que en Madrid son las 8 (las 07:00 UTC en invierno, las 06:00 en verano).
select cron.unschedule('informe-jornada') where exists (select 1 from cron.job where jobname = 'informe-jornada');
select cron.schedule(
  'informe-jornada',
  '0 6,7 * * 1',
  $$
  select net.http_post(
    url := 'https://oepixesrcjbpsqsjroam.supabase.co/functions/v1/jornada',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'CAMBIA_ESTO'),
    body := '{"accion":"informe"}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
-- FIN CRON

-- Para pararlo: select cron.unschedule('informe-jornada');
notify pgrst, 'reload schema';
