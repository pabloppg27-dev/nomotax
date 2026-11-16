-- NomoTax · Área de clientes — facturación automática mensual de NomoTax a sus clientes
-- Pegar en Supabase → SQL Editor → Run. El envío diario se activa aparte, con facturacion-automatica-cron.sql,
-- después de probar la función en modo simulación.

-- 1. Email al que el cliente quiere recibir las facturas (si está vacío, el de su cuenta)
alter table public.profiles add column if not exists email_facturacion text;

-- 2. Registro de lo facturado: una factura por cliente y periodo, nunca dos
create table if not exists public.facturas_plan (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.profiles(id) on delete cascade,
  periodo date not null,
  invoice_id uuid references public.invoices(id) on delete set null,
  expense_id uuid references public.expenses(id) on delete set null,
  email text,
  enviada_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  unique (cliente_id, periodo)
);
alter table public.facturas_plan enable row level security;
-- Cada cliente ve su historial de facturación (botón «Facturación» en Mi perfil); el asesor, todo
drop policy if exists "facturas_plan: asesor" on public.facturas_plan;
drop policy if exists "facturas_plan: ver" on public.facturas_plan;
create policy "facturas_plan: ver" on public.facturas_plan
  for select using (cliente_id = auth.uid() or public.is_advisor());

notify pgrst, 'reload schema';
