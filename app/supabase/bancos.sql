-- =====================================================================
-- NomoTax · Área de clientes — EXTRACTOS BANCARIOS (conciliación)
-- El cliente sube el extracto que le da su banco (PDF, CSV o Excel) de
-- un mes, un trimestre, un año o un periodo a medida. El asesor lo
-- revisa y lo marca como conciliado.
-- Ejecutar una vez en Supabase → SQL Editor.
-- =====================================================================

create table if not exists public.extractos_bancarios (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  banco text not null,                                    -- CaixaBank, BBVA, Revolut…
  cuenta text,                                            -- últimos dígitos del IBAN (opcional)
  desde date not null,
  hasta date not null,
  formato text not null check (formato in ('pdf', 'csv', 'excel')),
  nombre_archivo text,                                    -- nombre original del archivo
  file_path text not null,
  conciliado boolean not null default false,              -- lo marca el asesor
  notas text,
  subido_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (hasta >= desde)
);
create index if not exists extractos_bancarios_owner_idx on public.extractos_bancarios(owner_id, desde);

alter table public.extractos_bancarios enable row level security;

create policy "extractos: ver" on public.extractos_bancarios
  for select using (owner_id = auth.uid() or public.is_advisor());
create policy "extractos: subir" on public.extractos_bancarios
  for insert with check (owner_id = auth.uid() or public.is_advisor());
create policy "extractos: asesor edita" on public.extractos_bancarios
  for update using (public.is_advisor()) with check (public.is_advisor());
create policy "extractos: borrar" on public.extractos_bancarios
  for delete using (public.is_advisor() or (owner_id = auth.uid() and subido_por = auth.uid() and not conciliado));

-- El almacén de documentos acepta también CSV y Excel (hasta ahora solo PDF e imágenes)
update storage.buckets
set allowed_mime_types = array[
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp',
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]
where id = 'documentos';

-- Avisos en tiempo real (pantalla de contabilidad y copia a las carpetas del asesor)
do $$
begin
  alter publication supabase_realtime add table public.extractos_bancarios;
exception when duplicate_object then null;
end $$;
