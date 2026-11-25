-- =====================================================================
-- NomoTax · Inventario: IVA de venta de cada producto (precio con IVA y margen
-- en el informe del producto). Solo hace falta si ya se ejecutó inventario.sql.
-- Ejecutar una vez en Supabase → SQL Editor.
-- =====================================================================
alter table public.productos add column if not exists iva numeric(5,2) not null default 21;
