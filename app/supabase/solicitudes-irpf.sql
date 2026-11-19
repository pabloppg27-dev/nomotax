-- =====================================================================
-- Solicitudes de cambio de retención de IRPF (art. 88.5 RIRPF)
-- El trabajador pide una retención mayor desde «Mi ficha»; quien lleva
-- Laboral (o el asesor) la marca como aplicada o rechazada.
-- Ejecutar una vez en Supabase → SQL Editor (después de usuarios.sql).
-- =====================================================================
alter table public.trabajadores add column if not exists irpf_pct numeric(5,2);

create table if not exists public.solicitudes_irpf (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  trabajador_id uuid not null references public.trabajadores(id) on delete cascade,
  pct_actual numeric(5,2),
  pct_solicitado numeric(5,2) not null check (pct_solicitado > 0 and pct_solicitado <= 47),
  desde text not null,                 -- 'AAAA-MM': primera nómina en la que se aplica
  comentario text,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aplicada', 'rechazada')),
  respuesta text,
  solicitada_por uuid default auth.uid() references public.profiles(id) on delete set null,
  resuelta_por uuid references public.profiles(id) on delete set null,
  resuelta_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists solicitudes_irpf_trab_idx on public.solicitudes_irpf(trabajador_id, created_at desc);

alter table public.solicitudes_irpf enable row level security;

drop policy if exists "solicitudes irpf: ver" on public.solicitudes_irpf;
create policy "solicitudes irpf: ver" on public.solicitudes_irpf
  for select using (public.is_advisor() or public.puede(owner_id, 'laboral') or trabajador_id = public.mi_trabajador(owner_id));

-- El trabajador solo pide para sí mismo, y siempre como pendiente
drop policy if exists "solicitudes irpf: pedir" on public.solicitudes_irpf;
create policy "solicitudes irpf: pedir" on public.solicitudes_irpf
  for insert with check (
    estado = 'pendiente'
    and (trabajador_id = public.mi_trabajador(owner_id) or public.puede(owner_id, 'laboral') or public.is_advisor())
  );

drop policy if exists "solicitudes irpf: resolver" on public.solicitudes_irpf;
create policy "solicitudes irpf: resolver" on public.solicitudes_irpf
  for update using (public.is_advisor() or public.puede(owner_id, 'laboral'));
