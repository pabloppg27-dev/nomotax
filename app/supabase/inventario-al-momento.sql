-- =====================================================================
-- NomoTax · Inventario: pasar la variación de existencias a «al momento»
-- Solo hace falta si ya se ejecutó la primera versión de inventario.sql
-- (la que ponía 'trimestral' por defecto). Ejecutar una vez en Supabase → SQL Editor.
-- =====================================================================
alter table public.profiles alter column existencias_periodo set default 'momento';
alter table public.profiles drop constraint if exists profiles_existencias_periodo_check;
alter table public.profiles add constraint profiles_existencias_periodo_check
  check (existencias_periodo in ('momento', 'mensual', 'trimestral', 'anual', 'no'));
-- Todas las cuentas que tenían el valor por defecto pasan a «al momento»
update public.profiles set existencias_periodo = 'momento' where existencias_periodo = 'trimestral';
