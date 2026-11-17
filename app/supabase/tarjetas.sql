-- NomoTax · Tarjetas de empresa (Stripe Connect + Issuing).
-- Funciona con o sin supabase/usuarios.sql (si existe puede(), la usa). Pegar en Supabase → SQL Editor → Run
-- (una sola vez; se puede repetir sin problema).
--
-- Cada empresa cliente tiene su propia cuenta conectada de Stripe (stripe_cuentas). Las tarjetas que emite
-- (tarjetas) y sus movimientos (tarjetas_movimientos) se guardan aquí para enseñarlos sin llamar a Stripe.
-- La app SOLO LEE estas tablas: las escribe la función «tarjetas» y el webhook «stripe-webhook» con la clave
-- secreta de Supabase, así que nadie puede inventarse una tarjeta o un saldo desde el navegador.

-- ---------------------------------------------------------------------
-- 1. Cuenta de Stripe de cada empresa
-- ---------------------------------------------------------------------
create table if not exists public.stripe_cuentas (
  owner_id uuid primary key references public.profiles(id) on delete cascade,
  stripe_account_id text not null unique,
  -- pendiente: falta completar el alta · activa: puede emitir tarjetas · restringida: Stripe pide más datos
  estado text not null default 'pendiente' check (estado in ('pendiente', 'activa', 'restringida')),
  emision_activa boolean not null default false,      -- capacidad card_issuing
  requisitos jsonb not null default '[]'::jsonb,      -- lo que Stripe todavía pide
  titular_id text,                                    -- cardholder de Stripe de la empresa
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 2. Tarjetas
-- ---------------------------------------------------------------------
create table if not exists public.tarjetas (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  stripe_card_id text not null unique,
  alias text not null check (char_length(alias) between 1 and 60),       -- «Viajes», «Publicidad»…
  titular_nombre text not null check (char_length(titular_nombre) between 2 and 26),
  tipo text not null default 'virtual' check (tipo in ('virtual', 'fisica')),
  ultimos4 text not null check (ultimos4 ~ '^[0-9]{4}$'),
  marca text not null default 'Visa',
  exp_mes int check (exp_mes between 1 and 12),
  exp_anio int,
  estado text not null default 'activa' check (estado in ('activa', 'congelada', 'cancelada')),
  limite_mensual numeric(12, 2) check (limite_mensual is null or limite_mensual >= 0),   -- euros; null = sin límite propio
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tarjetas_owner_idx on public.tarjetas(owner_id, created_at desc);

-- ---------------------------------------------------------------------
-- 3. Movimientos (autorizaciones y compras)
-- ---------------------------------------------------------------------
create table if not exists public.tarjetas_movimientos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  tarjeta_id uuid references public.tarjetas(id) on delete set null,
  stripe_id text not null unique,                      -- iauth_… o ipi_…
  importe numeric(12, 2) not null,                     -- en euros, positivo = gasto
  moneda text not null default 'EUR',
  comercio text,
  categoria text,
  estado text not null default 'aprobada' check (estado in ('aprobada', 'rechazada', 'pendiente', 'reembolsada')),
  motivo text,                                         -- por qué se rechazó
  fecha timestamptz not null default now()
);
create index if not exists tarjetas_mov_owner_idx on public.tarjetas_movimientos(owner_id, fecha desc);

-- ---------------------------------------------------------------------
-- 3b. Tarjeta asignada a un usuario de la empresa (para que la vea en «Mi tarjeta»)
-- ---------------------------------------------------------------------
alter table public.tarjetas add column if not exists user_id uuid references public.profiles(id) on delete set null;
create index if not exists tarjetas_user_idx on public.tarjetas(user_id) where user_id is not null;

-- Nuevo permiso de administración «tarjetas» (crear tarjetas, límites y asignarlas). Si usuarios.sql está
-- instalado, se añade a la lista de módulos que se pueden activar a un admin.
create or replace function public.modulos_admin()
returns text[]
language sql immutable
as $$
  select array['ventas', 'gastos', 'bancos', 'contabilidad', 'impuestos', 'laboral', 'nominas', 'usuarios', 'empresa', 'tarjetas'];
$$;

-- ---------------------------------------------------------------------
-- 4. Quién puede verlo:
--    · gestionar (todas las tarjetas, saldo, cuenta): titular, asesor y admins con el módulo «tarjetas»
--    · cada persona ve además SUS tarjetas y sus movimientos
-- ---------------------------------------------------------------------
alter table public.stripe_cuentas enable row level security;
alter table public.tarjetas enable row level security;
alter table public.tarjetas_movimientos enable row level security;

drop policy if exists "stripe_cuentas: ver" on public.stripe_cuentas;
drop policy if exists "tarjetas: ver" on public.tarjetas;
drop policy if exists "tarjetas_mov: ver" on public.tarjetas_movimientos;

do $$
begin
  if exists (select 1 from pg_proc where proname = 'puede' and pronamespace = 'public'::regnamespace) then
    create policy "stripe_cuentas: ver" on public.stripe_cuentas
      for select using (public.puede(owner_id, 'tarjetas'));
    create policy "tarjetas: ver" on public.tarjetas
      for select using (public.puede(owner_id, 'tarjetas') or user_id = auth.uid());
    create policy "tarjetas_mov: ver" on public.tarjetas_movimientos
      for select using (
        public.puede(owner_id, 'tarjetas')
        or exists (select 1 from public.tarjetas t where t.id = tarjeta_id and t.user_id = auth.uid())
      );
  else
    create policy "stripe_cuentas: ver" on public.stripe_cuentas
      for select using (
        owner_id = auth.uid()
        or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'advisor')
      );
    create policy "tarjetas: ver" on public.tarjetas
      for select using (
        owner_id = auth.uid() or user_id = auth.uid()
        or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'advisor')
      );
    create policy "tarjetas_mov: ver" on public.tarjetas_movimientos
      for select using (
        owner_id = auth.uid()
        or exists (select 1 from public.tarjetas t where t.id = tarjeta_id and t.user_id = auth.uid())
        or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'advisor')
      );
  end if;
end $$;

-- Sin políticas de insert/update/delete: solo las funciones (clave secreta) escriben.

-- ---------------------------------------------------------------------
-- 5. Tarjetas asignadas a una persona y máximo por compra (se puede repetir)
-- ---------------------------------------------------------------------
alter table public.tarjetas add column if not exists trabajador_id uuid references public.trabajadores(id) on delete set null;
alter table public.tarjetas add column if not exists asignada_a text check (asignada_a is null or char_length(asignada_a) between 2 and 26);
alter table public.tarjetas add column if not exists limite_compra numeric(12, 2) check (limite_compra is null or limite_compra >= 0);
