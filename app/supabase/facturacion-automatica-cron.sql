-- NomoTax · activa la facturación automática: cada día a las 07:00 (Madrid, invierno; 08:00 en verano)
-- llama a la Edge Function facturar-planes. Ejecutar DESPUÉS de facturacion-automatica.sql y de probar la función.
-- CAMBIA_ESTO = la misma clave que el secreto CRON_SECRET (el comando de copiar ya la pone).

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('facturar-planes') where exists (select 1 from cron.job where jobname = 'facturar-planes');
select cron.schedule(
  'facturar-planes',
  '0 6 * * *',
  $$
  select net.http_post(
    url := 'https://oepixesrcjbpsqsjroam.supabase.co/functions/v1/facturar-planes',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'CAMBIA_ESTO'),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

-- Para pararla: select cron.unschedule('facturar-planes');
