-- =====================================================================
-- NomoTax · Área de clientes — INVENTARIO (existencias por referencia)
--
-- El stock se calcula al vuelo, como la contabilidad (src/lib/inventario.ts):
--   + líneas de las facturas de compra revisadas (expenses.lineas, las lee la IA)
--   − líneas de las facturas emitidas con producto (invoices.lineas[].producto_id)
--   ± ajustes: stock inicial, recuentos, mermas (stock_ajustes)
-- Valoración a coste medio ponderado. El motor contable hace solo el asiento de
-- variación de existencias (300/610, 310/611…): al momento, con cada documento
-- (por defecto), o al cierre de cada mes, trimestre o año (profiles.existencias_periodo).
--
-- Ejecutar una vez en Supabase → SQL Editor (después de usuarios.sql).
-- =====================================================================

-- Cuándo se contabiliza la variación de existencias: 'momento' = con cada compra, venta o ajuste;
-- o al cierre de cada mes, trimestre o año; 'no' = nunca
alter table public.profiles add column if not exists existencias_periodo text not null default 'momento';
alter table public.profiles alter column existencias_periodo set default 'momento';
alter table public.profiles drop constraint if exists profiles_existencias_periodo_check;
alter table public.profiles add constraint profiles_existencias_periodo_check
  check (existencias_periodo in ('momento', 'mensual', 'trimestral', 'anual', 'no'));

-- Catálogo de productos (referencias)
create table if not exists public.productos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  referencia text,                                             -- código del proveedor o propio (SKU)
  nombre text not null,
  tipo text not null default 'mercaderias'
    check (tipo in ('mercaderias', 'materias_primas', 'otros_aprovisionamientos', 'productos_terminados')),
  unidad text not null default 'ud',
  precio_venta numeric(12,4),
  iva numeric(5,2) not null default 21,                        -- IVA de venta (%)
  activo boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.productos add column if not exists iva numeric(5,2) not null default 21;
create index if not exists productos_owner_idx on public.productos(owner_id);
create unique index if not exists productos_referencia_uq
  on public.productos(owner_id, lower(referencia))
  where referencia is not null and referencia <> '';

-- Líneas de la factura de compra: [{referencia, descripcion, cantidad, importe, producto_id}]
alter table public.expenses add column if not exists lineas jsonb;

-- Ajustes de stock: inicial, recuento (diferencia con el teórico), merma, otros
create table if not exists public.stock_ajustes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  producto_id uuid not null references public.productos(id) on delete cascade,
  fecha date not null,
  cantidad numeric(14,3) not null,                             -- + entra, − sale
  coste_unitario numeric(12,4),                                -- solo entradas con coste propio (stock inicial); si no, coste medio
  motivo text not null default 'ajuste' check (motivo in ('inicial', 'recuento', 'merma', 'ajuste')),
  notas text,
  creado_por uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists stock_ajustes_owner_idx on public.stock_ajustes(owner_id, fecha);

alter table public.productos enable row level security;
alter table public.stock_ajustes enable row level security;

-- Productos: los ve quien factura, sube gastos o lleva la contabilidad; los crea y edita quien sube gastos o lleva la contabilidad
drop policy if exists "productos: ver" on public.productos;
drop policy if exists "productos: editar" on public.productos;
create policy "productos: ver" on public.productos
  for select using (public.puede(owner_id, 'ventas') or public.puede(owner_id, 'gastos') or public.puede(owner_id, 'contabilidad'));
create policy "productos: editar" on public.productos
  for all using (public.puede(owner_id, 'gastos') or public.puede(owner_id, 'contabilidad'))
  with check (public.puede(owner_id, 'gastos') or public.puede(owner_id, 'contabilidad'));

drop policy if exists "ajustes stock: ver" on public.stock_ajustes;
drop policy if exists "ajustes stock: editar" on public.stock_ajustes;
create policy "ajustes stock: ver" on public.stock_ajustes
  for select using (public.puede(owner_id, 'gastos') or public.puede(owner_id, 'contabilidad'));
create policy "ajustes stock: editar" on public.stock_ajustes
  for all using (public.puede(owner_id, 'gastos') or public.puede(owner_id, 'contabilidad'))
  with check (public.puede(owner_id, 'gastos') or public.puede(owner_id, 'contabilidad'));

-- Solo el asesor decide cada cuánto se contabiliza la variación de existencias
create or replace function public.profiles_existencias_proteger()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null and not public.is_advisor()
     and new.existencias_periodo is distinct from old.existencias_periodo then
    raise exception 'Solo tu asesor puede cambiar cada cuándo se contabilizan las existencias';
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_existencias_proteger_trg on public.profiles;
create trigger profiles_existencias_proteger_trg before update on public.profiles
  for each row execute function public.profiles_existencias_proteger();

-- Avisos en tiempo real (la pestaña Contabilidad se recalcula sola)
do $$
declare t text;
begin
  foreach t in array array['productos', 'stock_ajustes']
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
