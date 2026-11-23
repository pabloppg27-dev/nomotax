-- CRM NomoTax · Reuniones (dictadas o a mano). Ejecutar una vez en Supabase → SQL Editor (después de crm.sql).
create table if not exists public.crm_reuniones (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descripcion text,
  cliente_id uuid,                -- id de crm_clientes o de profiles (opcional)
  proyecto_id uuid references public.crm_proyectos(id) on delete set null,
  inicio timestamptz not null,
  duracion int not null default 60, -- minutos
  email text,                     -- invitado (recibe la invitación de Google)
  meet boolean not null default true,
  meet_url text,
  evento_id text,                 -- id del evento en Google Calendar
  evento_url text,
  notas text,
  created_at timestamptz not null default now()
);
create index if not exists crm_reuniones_idx on public.crm_reuniones(inicio);
alter table public.crm_reuniones enable row level security;
drop policy if exists "crm_reuniones: asesor" on public.crm_reuniones;
create policy "crm_reuniones: asesor" on public.crm_reuniones for all using (public.is_advisor()) with check (public.is_advisor());
