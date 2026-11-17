-- Documentos del trabajador: certificado de retenciones (IRPF) anual, con su año.
-- Se ejecuta pegándolo en Supabase -> SQL Editor. Se puede repetir sin problema.

alter table public.trabajador_documentos add column if not exists anio int;

alter table public.trabajador_documentos drop constraint if exists trabajador_documentos_tipo_check;
alter table public.trabajador_documentos
  add constraint trabajador_documentos_tipo_check
  check (tipo in ('dni', 'contrato', 'alta_ss', 'teletrabajo', 'modelo_145', 'certificado_retenciones', 'otro'));
