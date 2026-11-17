-- Borra las facturas de PRUEBA de la facturación automática (serie PRUEBA):
-- la factura de la cuenta emisora, el gasto del cliente y su registro. No toca nada más.
delete from public.facturas_plan where invoice_id in (select id from public.invoices where serie = 'PRUEBA');
delete from public.expenses where numero like 'PRUEBA%';
delete from public.invoices where serie = 'PRUEBA';
