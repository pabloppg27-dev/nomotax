-- =====================================================================
-- NomoTax · Área de clientes — CUENTAS BANCARIAS EN VARIAS MONEDAS
-- Configuración → «Cuentas bancarias»: cuentas en euros, dólares, libras…
-- Al facturar se elige en qué moneda sale la factura y qué cuentas aparecen
-- para el cobro. Lo que se teclea va en euros; si la factura es en otra
-- moneda, se convierte al cambio del BCE del día de la factura.
-- La contabilidad sigue siempre en euros (base, cuota_iva, total…).
-- Pegar en Supabase → SQL Editor → Run (una sola vez).
-- =====================================================================

-- Cuentas de la empresa: [{ id, moneda, alias, banco, titular, iban, numero, codigo_local, swift, direccion_banco, predeterminada }]
alter table public.profiles
  add column if not exists cuentas_bancarias jsonb not null default '[]'::jsonb;

-- La cuenta que ya tenía cada uno en «IBAN para cobros» pasa a ser su cuenta en euros por defecto
update public.profiles
   set cuentas_bancarias = jsonb_build_array(jsonb_build_object(
         'id', gen_random_uuid(),
         'moneda', 'EUR',
         'alias', 'Cuenta principal',
         'iban', upper(trim(iban)),
         'predeterminada', true))
 where coalesce(trim(iban), '') <> ''
   and cuentas_bancarias = '[]'::jsonb;

-- Factura: moneda en la que sale y cuentas que aparecen para cobrarla (copia, por si luego cambian)
alter table public.invoices
  add column if not exists moneda text not null default 'EUR',
  add column if not exists importe_original numeric(14,2),   -- total en la moneda de la factura
  add column if not exists tipo_cambio numeric(14,6),        -- 1 EUR = tipo_cambio moneda (BCE)
  add column if not exists fecha_cambio date,                -- día del cambio del BCE aplicado
  add column if not exists cuentas_cobro jsonb;

-- Una factura emitida tampoco puede cambiar de moneda, de cambio ni de cuentas de cobro
create or replace function public.invoices_cobro_bloqueado()
returns trigger
language plpgsql
as $$
begin
  if old.origen = 'app' and old.estado <> 'borrador' and (
       new.moneda is distinct from old.moneda
    or new.importe_original is distinct from old.importe_original
    or new.tipo_cambio is distinct from old.tipo_cambio
    or new.fecha_cambio is distinct from old.fecha_cambio
    or new.cuentas_cobro is distinct from old.cuentas_cobro
  ) then
    raise exception 'Una factura emitida no se puede modificar. Haz una factura rectificativa.';
  end if;
  return new;
end;
$$;

drop trigger if exists invoices_cobro_bloqueado on public.invoices;
create trigger invoices_cobro_bloqueado
  before update on public.invoices
  for each row execute function public.invoices_cobro_bloqueado();

-- Comprobación: cuántas cuentas tienen ya su cuenta en euros
select count(*) filter (where jsonb_array_length(cuentas_bancarias) > 0) as con_cuentas, count(*) as total
  from public.profiles;
