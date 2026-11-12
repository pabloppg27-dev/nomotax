-- =====================================================================
-- NomoTax · Área de clientes — FACTURAS EN OTRAS MONEDAS
-- Todo se contabiliza en euros con el cambio oficial del BCE del día de la
-- factura. Aquí se guarda la moneda original, su total y el cambio aplicado.
-- =====================================================================
alter table public.expenses
  add column if not exists moneda text not null default 'EUR',
  add column if not exists importe_original numeric(14,2),
  add column if not exists tipo_cambio numeric(14,6),        -- 1 EUR = tipo_cambio moneda
  add column if not exists fecha_cambio date;                -- día del cambio del BCE aplicado

alter table public.invoices
  add column if not exists moneda text not null default 'EUR',
  add column if not exists importe_original numeric(14,2),
  add column if not exists tipo_cambio numeric(14,6),
  add column if not exists fecha_cambio date;
