-- =====================================================================
-- NomoTax · Área de clientes — IMPUESTOS Y ARCHIVO
-- Impuestos presentados (los sube el asesor) y archivo de documentos
-- (notificaciones, requerimientos, certificados…: los suben ambos).
-- =====================================================================

create table public.impuestos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  modelo text not null,                                   -- 303, 111, 130, 200…
  anio int not null,
  periodo text not null,                                  -- 1T, 2T, 3T, 4T, 0A (anual) o mes 01-12
  resultado text not null default 'ingresar'
    check (resultado in ('ingresar', 'devolver', 'compensar', 'cero', 'informativa')),
  importe numeric(12,2) not null default 0,
  fecha_presentacion date,
  file_path text,
  notas text,
  created_at timestamptz not null default now()
);
create index impuestos_owner_idx on public.impuestos(owner_id, anio);

create table public.archivo (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  titulo text not null,
  tipo text not null default 'notificacion'
    check (tipo in ('notificacion', 'requerimiento', 'certificado', 'escritura', 'contrato', 'otro')),
  organismo text,                                         -- AEAT, Seguridad Social, Ayuntamiento…
  fecha date not null default current_date,
  fecha_limite date,                                      -- plazo para contestar, si lo hay
  atendida boolean not null default false,
  file_path text,
  notas text,
  subido_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index archivo_owner_idx on public.archivo(owner_id, fecha);

alter table public.impuestos enable row level security;
alter table public.archivo enable row level security;

create policy "impuestos: ver" on public.impuestos
  for select using (owner_id = auth.uid() or public.is_advisor());
create policy "impuestos: asesor" on public.impuestos
  for all using (public.is_advisor()) with check (public.is_advisor());

create policy "archivo: ver" on public.archivo
  for select using (owner_id = auth.uid() or public.is_advisor());
create policy "archivo: subir" on public.archivo
  for insert with check (owner_id = auth.uid() or public.is_advisor());
create policy "archivo: asesor edita" on public.archivo
  for update using (public.is_advisor()) with check (public.is_advisor());
create policy "archivo: borrar" on public.archivo
  for delete using (public.is_advisor() or (owner_id = auth.uid() and subido_por = auth.uid()));

do $$
declare t text;
begin
  foreach t in array array['impuestos', 'archivo']
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
