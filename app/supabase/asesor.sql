-- =====================================================================
-- NomoTax · Área de clientes — «MI ASESOR»: llamadas y citas pedidas por los clientes
-- Ejecutar una vez en Supabase → SQL Editor.
-- =====================================================================

create table public.llamadas (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  tipo text not null check (tipo in ('llamame', 'cita')),
  inicio timestamptz,                       -- solo en citas
  modalidad text check (modalidad in ('meet', 'telefono')),
  telefono text,
  tema text,
  franja text,                              -- «llámame»: mejor momento
  meet_link text,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'hecha')),
  created_at timestamptz not null default now()
);
create index llamadas_estado_idx on public.llamadas(estado, created_at desc);
create index llamadas_owner_idx on public.llamadas(owner_id, created_at desc);

alter table public.llamadas enable row level security;

create policy "llamadas: ver" on public.llamadas
  for select using (owner_id = auth.uid() or public.is_advisor());
create policy "llamadas: pedir" on public.llamadas
  for insert with check ((owner_id = auth.uid() and estado = 'pendiente') or public.is_advisor());
create policy "llamadas: asesor" on public.llamadas
  for update using (public.is_advisor()) with check (public.is_advisor());
create policy "llamadas: borrar" on public.llamadas
  for delete using (public.is_advisor());
