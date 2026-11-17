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
-- 4. Quién puede verlo: titular, asesor y los administradores con el módulo «empresa»
--    (es dinero: por defecto un admin NO lo ve hasta que se le activa «Datos de la empresa y plan»).
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
      for select using (public.puede(owner_id, 'empresa'));
    create policy "tarjetas: ver" on public.tarjetas
      for select using (public.puede(owner_id, 'empresa'));
    create policy "tarjetas_mov: ver" on public.tarjetas_movimientos
      for select using (public.puede(owner_id, 'empresa'));
  else
    create policy "stripe_cuentas: ver" on public.stripe_cuentas
      for select using (
        owner_id = auth.uid()
        or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'advisor')
      );
    create policy "tarjetas: ver" on public.tarjetas
      for select using (
        owner_id = auth.uid()
        or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'advisor')
      );
    create policy "tarjetas_mov: ver" on public.tarjetas_movimientos
      for select using (
        owner_id = auth.uid()
        or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'advisor')
      );
  end if;
end $$;

-- Sin políticas de insert/update/delete: solo las funciones (clave secreta) escriben.
