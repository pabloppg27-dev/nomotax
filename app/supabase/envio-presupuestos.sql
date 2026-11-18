-- NomoTax · Envío de presupuestos por email (botón «Enviar por email» del presupuesto).
-- Necesita antes supabase/envio-facturas.sql. Pegar en Supabase → SQL Editor → Run (una sola vez; se puede repetir).
--
-- Lo envía la función enviar-factura (con quote_id), con el mismo remitente, límite diario y registro que las facturas.

-- Último envío de cada presupuesto (se ve en el presupuesto: «Enviado el … a …»)
alter table public.quotes add column if not exists enviado_at timestamptz;
alter table public.quotes add column if not exists enviado_a text;

-- El registro de envíos sirve también para presupuestos: una fila lleva la factura o el presupuesto
alter table public.envios_factura alter column invoice_id drop not null;
alter table public.envios_factura add column if not exists quote_id uuid references public.quotes(id) on delete set null;
create index if not exists envios_factura_quote on public.envios_factura (quote_id, created_at desc);
