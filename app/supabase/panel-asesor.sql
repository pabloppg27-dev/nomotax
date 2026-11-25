-- =====================================================================
-- NomoTax · Panel del asesor
--   1) Peticiones de los clientes al asesor (renta, certificado, consulta, nota…)
--      Se piden desde «Mi asesor» y llegan a la Bandeja del panel.
--   2) Régimen fiscal de cada cliente (profiles.fiscal): lo pone solo el asesor
--      en Panel → Clientes → «Régimen fiscal» (módulos, recargo, REBU…).
-- Ejecutar una vez en Supabase → SQL Editor (después de usuarios.sql).
-- =====================================================================

-- 1) Peticiones ---------------------------------------------------------
create table if not exists public.peticiones (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  tipo text not null check (tipo in ('renta', 'certificado', 'consulta', 'documento', 'nota', 'otro')),
  texto text,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'hecha')),
  respuesta text,
  pedida_por uuid default auth.uid() references public.profiles(id) on delete set null,
  resuelta_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists peticiones_estado_idx on public.peticiones(estado, created_at desc);
create index if not exists peticiones_owner_idx on public.peticiones(owner_id, created_at desc);

alter table public.peticiones enable row level security;

-- Ver y pedir: quien puede usar «Mi asesor» en esa empresa (titular, admins, socios) y el asesor
drop policy if exists "peticiones: ver" on public.peticiones;
create policy "peticiones: ver" on public.peticiones
  for select using (public.puede(owner_id, 'asesor'));

drop policy if exists "peticiones: pedir" on public.peticiones;
create policy "peticiones: pedir" on public.peticiones
  for insert with check (public.puede(owner_id, 'asesor') and (estado = 'pendiente' or public.is_advisor()));

-- Marcar como hecha o responder: solo el asesor
drop policy if exists "peticiones: asesor" on public.peticiones;
create policy "peticiones: asesor" on public.peticiones
  for update using (public.is_advisor()) with check (public.is_advisor());

drop policy if exists "peticiones: borrar" on public.peticiones;
create policy "peticiones: borrar" on public.peticiones
  for delete using (public.is_advisor() or (estado = 'pendiente' and pedida_por = auth.uid()));

-- 2) Régimen fiscal ----------------------------------------------------
-- { forma, irpf, is, iva: [...], roi, redeme, sii }  (ver src/lib/regimenFiscal.ts)
alter table public.profiles add column if not exists fiscal jsonb;

create or replace function public.protect_fiscal()
returns trigger
language plpgsql
as $$
begin
  if new.fiscal is distinct from old.fiscal
     and auth.uid() is not null
     and not public.is_advisor() then
    raise exception 'Solo tu asesor puede cambiar el régimen fiscal';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_fiscal on public.profiles;
create trigger profiles_protect_fiscal
  before update on public.profiles
  for each row execute function public.protect_fiscal();

notify pgrst, 'reload schema';
