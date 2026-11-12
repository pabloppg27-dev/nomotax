-- =====================================================================
-- NomoTax · Área de clientes — CONTABILIDAD Y AMORTIZACIONES
-- Los asientos se calculan a partir de los documentos (facturas, gastos,
-- nóminas) y de estas tablas: apertura/asientos manuales e inmovilizado.
-- Ejecutar una vez en Supabase → SQL Editor.
-- =====================================================================

-- Cobros y pagos (tesorería)
alter table public.invoices add column if not exists fecha_cobro date;

alter table public.expenses
  add column if not exists pagado boolean not null default true,
  add column if not exists fecha_pago date,
  add column if not exists cuenta text,                       -- cuenta contable elegida por el asesor
  add column if not exists naturaleza text not null default 'gasto'
    check (naturaleza in ('gasto', 'inversion')),             -- lo que propone la IA
  add column if not exists revision text
    check (revision in ('pendiente', 'gasto', 'inmovilizado')); -- revisión de posible amortización

-- Asientos manuales y de apertura (los mete el asesor)
create table public.asientos_manuales (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  tipo text not null default 'manual' check (tipo in ('apertura', 'manual')),
  fecha date not null,
  concepto text not null,
  lineas jsonb not null default '[]'::jsonb,                  -- [{cuenta, debe, haber}]
  created_at timestamptz not null default now()
);
create index asientos_manuales_owner_idx on public.asientos_manuales(owner_id, fecha);

-- Inmovilizado y su amortización
create table public.inmovilizados (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  expense_id uuid references public.expenses(id) on delete set null,
  nombre text not null,
  tipo text not null,                                         -- clave de la tabla de amortización
  cuenta text not null,                                       -- 21x / 20x
  cuenta_amortizacion text not null,                          -- 281x / 280x
  valor numeric(12,2) not null,
  fecha_inicio date not null,                                 -- puesta en funcionamiento
  coeficiente numeric(5,2) not null,                          -- % anual
  fecha_baja date,
  created_at timestamptz not null default now()
);
create index inmovilizados_owner_idx on public.inmovilizados(owner_id);

alter table public.asientos_manuales enable row level security;
alter table public.inmovilizados enable row level security;

create policy "asientos manuales: ver" on public.asientos_manuales
  for select using (owner_id = auth.uid() or public.is_advisor());
create policy "asientos manuales: asesor" on public.asientos_manuales
  for all using (public.is_advisor()) with check (public.is_advisor());

create policy "inmovilizado: ver" on public.inmovilizados
  for select using (owner_id = auth.uid() or public.is_advisor());
create policy "inmovilizado: asesor" on public.inmovilizados
  for all using (public.is_advisor()) with check (public.is_advisor());

-- El cliente no puede decidir la cuenta ni la revisión de amortización
create or replace function public.expenses_proteger()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null and not public.is_advisor() then
    if tg_op = 'INSERT' then
      new.cuenta := null;
    elsif new.cuenta is distinct from old.cuenta
       or (new.revision is distinct from old.revision and new.revision in ('gasto', 'inmovilizado')) then
      raise exception 'Solo tu asesor puede cambiar la cuenta contable o la revisión de amortización';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists expenses_proteger_trg on public.expenses;
create trigger expenses_proteger_trg before insert or update on public.expenses
  for each row execute function public.expenses_proteger();

-- Avisos en tiempo real (para la copia automática en las carpetas del asesor)
do $$
declare t text;
begin
  foreach t in array array['invoices', 'expenses', 'nominas', 'asientos_manuales', 'inmovilizados', 'trabajadores', 'profiles']
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
