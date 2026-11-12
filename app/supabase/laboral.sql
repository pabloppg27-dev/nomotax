-- =====================================================================
-- NomoTax · Área de clientes — módulo LABORAL
-- Centros de trabajo, convenio, categorías, trabajadores, documentos y nóminas.
-- Ejecutar una vez en Supabase → SQL Editor (después de schema.sql).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Perfil laboral de la empresa (lo rellena el asesor)
-- ---------------------------------------------------------------------
create table public.perfil_laboral (
  owner_id uuid primary key references public.profiles(id) on delete cascade,
  convenio_nombre text,
  convenio_codigo text,
  periodo_prueba text,
  pagas_convenio int not null default 14 check (pagas_convenio in (12, 14, 15, 16)),
  horas_semana_convenio numeric(5,2) not null default 40,
  notas text,
  updated_at timestamptz not null default now()
);
create trigger perfil_laboral_touch before update on public.perfil_laboral
  for each row execute function public.touch_updated_at();

create table public.centros_trabajo (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  nombre text not null,
  direccion text,
  cp text,
  ciudad text,
  provincia text,
  ccc text,                                   -- código de cuenta de cotización
  created_at timestamptz not null default now()
);
create index centros_owner_idx on public.centros_trabajo(owner_id);

create table public.categorias_convenio (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  nombre text not null,
  grupo_cotizacion int check (grupo_cotizacion between 1 and 11),
  salario_min_mensual numeric(10,2),          -- bruto mensual a jornada completa, según el convenio
  orden int not null default 0,
  created_at timestamptz not null default now()
);
create index categorias_owner_idx on public.categorias_convenio(owner_id);

-- ---------------------------------------------------------------------
-- Trabajadores (nacen como solicitud de alta del cliente)
-- ---------------------------------------------------------------------
create table public.trabajadores (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  estado text not null default 'solicitada'
    check (estado in ('solicitada', 'en_tramite', 'alta', 'baja')),
  -- datos personales
  nombre text not null,
  dni text not null,
  dni_caducidad date,
  nss text,
  nss_tramitar boolean not null default false,
  fecha_nacimiento date,
  domicilio text,
  telefono text,
  iban text,
  nivel_estudios text,
  -- contrato
  fecha_inicio date not null,
  centro_id uuid references public.centros_trabajo(id) on delete set null,
  puesto text,
  tipo_contrato text not null,
  fecha_fin date,
  motivo_temporal text,
  sustituye_a text,
  jornada text not null default 'completa' check (jornada in ('completa', 'parcial')),
  horas_semana numeric(5,2),
  horario text,
  teletrabajo boolean not null default false,
  salario_bruto_mensual numeric(10,2) not null,
  pagas int not null default 14 check (pagas in (12, 14)),
  observaciones text,
  -- lo decide el asesor
  categoria_id uuid references public.categorias_convenio(id) on delete set null,
  notas_asesor text,
  fecha_baja date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index trabajadores_owner_idx on public.trabajadores(owner_id, estado);
create trigger trabajadores_touch before update on public.trabajadores
  for each row execute function public.touch_updated_at();

-- El cliente no puede cambiar el estado, la categoría ni las notas del asesor
create or replace function public.trabajadores_proteger()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null and not public.is_advisor() then
    if tg_op = 'INSERT' then
      new.estado := 'solicitada';
      new.categoria_id := null;
      new.notas_asesor := null;
    elsif new.estado is distinct from old.estado
       or new.categoria_id is distinct from old.categoria_id
       or new.notas_asesor is distinct from old.notas_asesor
       or new.fecha_baja is distinct from old.fecha_baja then
      raise exception 'Solo tu asesor puede cambiar el estado del trabajador';
    end if;
  end if;
  return new;
end;
$$;
create trigger trabajadores_proteger_trg before insert or update on public.trabajadores
  for each row execute function public.trabajadores_proteger();

create table public.trabajador_documentos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  trabajador_id uuid not null references public.trabajadores(id) on delete cascade,
  tipo text not null default 'otro'
    check (tipo in ('dni', 'contrato', 'alta_ss', 'teletrabajo', 'modelo_145', 'otro')),
  nombre text,
  path text not null,
  subido_por uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index trabajador_docs_idx on public.trabajador_documentos(trabajador_id);

-- ---------------------------------------------------------------------
-- Nóminas (las sube el asesor; el cliente solo ve las publicadas)
-- ---------------------------------------------------------------------
create table public.nominas (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  trabajador_id uuid references public.trabajadores(id) on delete set null,
  anio int not null,
  mes int not null check (mes between 1 and 12),
  tipo text not null default 'mensual' check (tipo in ('mensual', 'extra', 'finiquito', 'atrasos', 'otro')),
  estado text not null default 'borrador' check (estado in ('borrador', 'publicada')),
  file_path text not null,
  nombre_leido text,
  dni_leido text,
  bruto numeric(10,2) not null default 0,
  neto numeric(10,2) not null default 0,
  irpf numeric(10,2) not null default 0,
  irpf_pct numeric(5,2),
  ss_trabajador numeric(10,2) not null default 0,
  ss_empresa numeric(10,2) not null default 0,
  variables numeric(10,2) not null default 0,
  coste_total numeric(10,2) not null default 0,
  conceptos jsonb,
  ocr jsonb,
  publicada_at timestamptz,
  created_at timestamptz not null default now()
);
create index nominas_owner_idx on public.nominas(owner_id, anio, mes);
create index nominas_trabajador_idx on public.nominas(trabajador_id, anio, mes);

-- ---------------------------------------------------------------------
-- Seguridad por filas
-- ---------------------------------------------------------------------
alter table public.perfil_laboral        enable row level security;
alter table public.centros_trabajo       enable row level security;
alter table public.categorias_convenio   enable row level security;
alter table public.trabajadores          enable row level security;
alter table public.trabajador_documentos enable row level security;
alter table public.nominas               enable row level security;

-- Empresa: el cliente lo ve, el asesor lo edita
create policy "perfil laboral: ver" on public.perfil_laboral
  for select using (owner_id = auth.uid() or public.is_advisor());
create policy "perfil laboral: asesor" on public.perfil_laboral
  for all using (public.is_advisor()) with check (public.is_advisor());

create policy "centros: ver" on public.centros_trabajo
  for select using (owner_id = auth.uid() or public.is_advisor());
create policy "centros: asesor" on public.centros_trabajo
  for all using (public.is_advisor()) with check (public.is_advisor());

create policy "categorias: ver" on public.categorias_convenio
  for select using (owner_id = auth.uid() or public.is_advisor());
create policy "categorias: asesor" on public.categorias_convenio
  for all using (public.is_advisor()) with check (public.is_advisor());

-- Trabajadores: el cliente solicita y puede corregir/cancelar mientras está «solicitada»
create policy "trabajadores: ver" on public.trabajadores
  for select using (owner_id = auth.uid() or public.is_advisor());
create policy "trabajadores: solicitar" on public.trabajadores
  for insert with check (owner_id = auth.uid() or public.is_advisor());
create policy "trabajadores: editar" on public.trabajadores
  for update using ((owner_id = auth.uid() and estado = 'solicitada') or public.is_advisor())
  with check (owner_id = auth.uid() or public.is_advisor());
create policy "trabajadores: cancelar" on public.trabajadores
  for delete using ((owner_id = auth.uid() and estado = 'solicitada') or public.is_advisor());

create policy "documentos trabajador: ver" on public.trabajador_documentos
  for select using (owner_id = auth.uid() or public.is_advisor());
create policy "documentos trabajador: subir" on public.trabajador_documentos
  for insert with check (owner_id = auth.uid() or public.is_advisor());
create policy "documentos trabajador: borrar" on public.trabajador_documentos
  for delete using ((owner_id = auth.uid() and subido_por = auth.uid()) or public.is_advisor());

create policy "nominas: ver publicadas" on public.nominas
  for select using ((owner_id = auth.uid() and estado = 'publicada') or public.is_advisor());
create policy "nominas: asesor" on public.nominas
  for all using (public.is_advisor()) with check (public.is_advisor());
