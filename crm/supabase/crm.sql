-- =====================================================================
-- CRM NomoTax (interno, solo el asesor) — tablas
-- Ejecutar una vez en Supabase → SQL Editor. Usa is_advisor() del área de clientes.
-- Los clientes de NomoTax salen de profiles (role = 'client'); aquí solo van los externos
-- y las notas propias de cada cliente.
-- =====================================================================

create table public.crm_clientes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references public.profiles(id) on delete cascade, -- si es cliente de NomoTax
  nombre text not null default '',
  tipo text,              -- SL, LLC, autónomo, particular…
  pais text,
  nif text,
  email text,
  telefono text,
  notas text,
  created_at timestamptz not null default now()
);

create table public.crm_proyectos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  tipo text not null default 'normal' check (tipo in ('normal', 'impuestos')),
  cliente_id uuid,        -- id de crm_clientes o de profiles (opcional)
  estado text not null default 'activo' check (estado in ('activo', 'terminado')),
  modelos text[] not null default '{}', -- solo impuestos: columnas (303, 111…)
  notas text,
  created_at timestamptz not null default now()
);

-- Proyecto de impuestos: una fila por cliente; estados = {"303":"hecho","111":"pendiente",…}
create table public.crm_impuestos (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.crm_proyectos(id) on delete cascade,
  cliente_id uuid not null,
  estados jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (proyecto_id, cliente_id)
);

create table public.crm_tareas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descripcion text,
  prioridad text not null default 'media' check (prioridad in ('alta', 'media', 'baja')),
  cliente_id uuid,
  proyecto_id uuid references public.crm_proyectos(id) on delete set null,
  fecha date,
  enlaces jsonb not null default '[]',
  hecha boolean not null default false,
  hecha_at timestamptz,
  created_at timestamptz not null default now()
);
create index crm_tareas_idx on public.crm_tareas(hecha, prioridad, fecha);

do $$
declare t text;
begin
  foreach t in array array['crm_clientes', 'crm_proyectos', 'crm_impuestos', 'crm_tareas'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%s: asesor" on public.%I for all using (public.is_advisor()) with check (public.is_advisor())', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Documentos del CRM: bucket privado «crm» (solo el asesor)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('crm', 'crm', false)
on conflict (id) do nothing;

create policy "crm docs: asesor ver" on storage.objects for select using (bucket_id = 'crm' and public.is_advisor());
create policy "crm docs: asesor subir" on storage.objects for insert with check (bucket_id = 'crm' and public.is_advisor());
create policy "crm docs: asesor cambiar" on storage.objects for update using (bucket_id = 'crm' and public.is_advisor());
create policy "crm docs: asesor borrar" on storage.objects for delete using (bucket_id = 'crm' and public.is_advisor());
