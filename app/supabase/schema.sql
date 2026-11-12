-- =====================================================================
-- NomoTax · Área de clientes — esquema de base de datos
-- Cómo usarlo: Supabase → SQL Editor → New query → pegar entero → Run.
-- Se puede ejecutar una sola vez sobre un proyecto vacío.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Perfiles: uno por usuario. role = 'client' (cliente) o 'advisor' (asesor)
-- ---------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'client' check (role in ('client', 'advisor')),
  nombre text,
  nif text,
  direccion text,
  cp text,
  ciudad text,
  provincia text,
  pais text default 'España',
  telefono text,
  iban text,
  logo_path text,
  serie_factura text not null default 'F',
  serie_presupuesto text not null default 'P',
  pie_factura text,
  created_at timestamptz not null default now()
);

create or replace function public.is_advisor()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'advisor');
$$;

-- Crea el perfil automáticamente al dar de alta un usuario
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, nombre)
  values (new.id, new.email, new.raw_user_meta_data ->> 'nombre')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Nadie puede cambiarse el rol a sí mismo (solo el asesor o el SQL Editor)
create or replace function public.protect_role()
returns trigger
language plpgsql
as $$
begin
  if new.role is distinct from old.role
     and auth.uid() is not null
     and not public.is_advisor() then
    raise exception 'No tienes permiso para cambiar el rol';
  end if;
  return new;
end;
$$;

create trigger profiles_protect_role
  before update on public.profiles
  for each row execute function public.protect_role();

-- ---------------------------------------------------------------------
-- updated_at genérico
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Clientes del cliente (agenda para facturar)
-- ---------------------------------------------------------------------
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  nombre text not null,
  nif text,
  email text,
  telefono text,
  direccion text,
  cp text,
  ciudad text,
  provincia text,
  pais text default 'España',
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index contacts_owner_idx on public.contacts(owner_id);
create trigger contacts_touch before update on public.contacts
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- Presupuestos
-- ---------------------------------------------------------------------
create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  cliente jsonb not null default '{}'::jsonb,       -- copia de los datos del cliente
  serie text not null default 'P',
  num int,
  numero text,
  fecha date not null default current_date,
  valido_hasta date,
  lineas jsonb not null default '[]'::jsonb,
  base numeric(12,2) not null default 0,
  cuota_iva numeric(12,2) not null default 0,
  irpf_pct numeric(5,2) not null default 0,
  cuota_irpf numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  estado text not null default 'borrador'
    check (estado in ('borrador', 'enviado', 'aceptado', 'rechazado', 'facturado')),
  notas text,
  invoice_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, numero)
);
create index quotes_owner_idx on public.quotes(owner_id, fecha desc);
create trigger quotes_touch before update on public.quotes
  for each row execute function public.touch_updated_at();

-- Numeración de presupuestos: P2026-001, P2026-002…
create or replace function public.quotes_numerar()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  anio int := extract(year from new.fecha)::int;
begin
  if new.numero is null then
    perform pg_advisory_xact_lock(hashtext('q' || new.owner_id::text || new.serie));
    select coalesce(max(num), 0) + 1 into new.num
      from public.quotes
     where owner_id = new.owner_id and serie = new.serie
       and extract(year from fecha)::int = anio;
    new.numero := new.serie || anio || '-' || lpad(new.num::text, 3, '0');
  end if;
  return new;
end;
$$;

create trigger quotes_numerar_trg before insert on public.quotes
  for each row execute function public.quotes_numerar();

-- ---------------------------------------------------------------------
-- Facturas emitidas (ingresos)
--   origen 'app'      → creada en la app (borrador → emitida → cobrada)
--   origen 'externa'  → subida desde otro programa (con su propio número)
-- ---------------------------------------------------------------------
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  quote_id uuid references public.quotes(id) on delete set null,
  origen text not null default 'app' check (origen in ('app', 'externa')),
  cliente jsonb not null default '{}'::jsonb,       -- copia de los datos del cliente
  emisor jsonb,                                      -- copia de tus datos al emitir
  serie text not null default 'F',
  num int,
  numero text,
  fecha date not null default current_date,
  vencimiento date,
  lineas jsonb not null default '[]'::jsonb,
  base numeric(12,2) not null default 0,
  cuota_iva numeric(12,2) not null default 0,
  irpf_pct numeric(5,2) not null default 0,
  cuota_irpf numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  estado text not null default 'borrador'
    check (estado in ('borrador', 'emitida', 'cobrada')),
  notas text,
  file_path text,
  ocr jsonb,
  contabilizado boolean not null default false,
  emitida_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index invoices_owner_idx on public.invoices(owner_id, fecha desc);
create unique index invoices_numero_app_uniq on public.invoices(owner_id, numero)
  where origen = 'app' and numero is not null;
create trigger invoices_touch before update on public.invoices
  for each row execute function public.touch_updated_at();

alter table public.quotes
  add constraint quotes_invoice_fk foreign key (invoice_id)
  references public.invoices(id) on delete set null;

-- Al emitir: asigna número correlativo (F2026-0001), guarda tus datos y bloquea la factura
create or replace function public.invoices_emitir()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  anio int;
  p public.profiles;
begin
  -- Una factura de la app ya emitida no se puede modificar (solo marcar cobrada / contabilizada)
  if tg_op = 'UPDATE' and old.origen = 'app' and old.estado <> 'borrador' then
    if new.numero is distinct from old.numero
       or new.fecha is distinct from old.fecha
       or new.lineas is distinct from old.lineas
       or new.cliente is distinct from old.cliente
       or new.total is distinct from old.total
       or new.base is distinct from old.base
       or new.cuota_iva is distinct from old.cuota_iva
       or new.cuota_irpf is distinct from old.cuota_irpf
       or new.estado = 'borrador' then
      raise exception 'Una factura emitida no se puede modificar. Haz una factura rectificativa.';
    end if;
    return new;
  end if;

  if new.origen = 'app' and new.estado in ('emitida', 'cobrada') and new.numero is null then
    anio := extract(year from new.fecha)::int;
    perform pg_advisory_xact_lock(hashtext('i' || new.owner_id::text || new.serie));
    select coalesce(max(num), 0) + 1 into new.num
      from public.invoices
     where owner_id = new.owner_id and serie = new.serie and origen = 'app'
       and extract(year from fecha)::int = anio;
    new.numero := new.serie || anio || '-' || lpad(new.num::text, 4, '0');
    new.emitida_at := now();
    select * into p from public.profiles where id = new.owner_id;
    new.emisor := jsonb_build_object(
      'nombre', p.nombre, 'nif', p.nif, 'direccion', p.direccion, 'cp', p.cp,
      'ciudad', p.ciudad, 'provincia', p.provincia, 'pais', p.pais,
      'email', p.email, 'telefono', p.telefono, 'iban', p.iban,
      'logo_path', p.logo_path, 'pie_factura', p.pie_factura
    );
  end if;
  return new;
end;
$$;

create trigger invoices_emitir_trg before insert or update on public.invoices
  for each row execute function public.invoices_emitir();

-- ---------------------------------------------------------------------
-- Gastos (facturas recibidas)
--   estado 'pendiente' → subida, falta que el cliente revise lo leído
--   estado 'revisado'  → datos confirmados
-- ---------------------------------------------------------------------
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  fecha date,
  proveedor text,
  proveedor_nif text,
  numero text,
  concepto text,
  categoria text not null default 'otros',
  base numeric(12,2) not null default 0,
  iva_pct numeric(5,2),
  cuota_iva numeric(12,2) not null default 0,
  irpf_pct numeric(5,2),
  cuota_irpf numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'revisado')),
  file_path text,
  ocr jsonb,
  contabilizado boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index expenses_owner_idx on public.expenses(owner_id, fecha desc);
create trigger expenses_touch before update on public.expenses
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- Seguridad por filas: cada cliente ve lo suyo; el asesor lo ve todo
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.contacts enable row level security;
alter table public.quotes   enable row level security;
alter table public.invoices enable row level security;
alter table public.expenses enable row level security;

create policy "perfiles: ver" on public.profiles
  for select using (id = auth.uid() or public.is_advisor());
create policy "perfiles: editar" on public.profiles
  for update using (id = auth.uid() or public.is_advisor())
  with check (id = auth.uid() or public.is_advisor());

create policy "contactos: todo" on public.contacts
  for all using (owner_id = auth.uid() or public.is_advisor())
  with check (owner_id = auth.uid() or public.is_advisor());

create policy "presupuestos: todo" on public.quotes
  for all using (owner_id = auth.uid() or public.is_advisor())
  with check (owner_id = auth.uid() or public.is_advisor());

create policy "facturas: ver" on public.invoices
  for select using (owner_id = auth.uid() or public.is_advisor());
create policy "facturas: crear" on public.invoices
  for insert with check (owner_id = auth.uid() or public.is_advisor());
create policy "facturas: editar" on public.invoices
  for update using (owner_id = auth.uid() or public.is_advisor())
  with check (owner_id = auth.uid() or public.is_advisor());
-- Solo se borran borradores o facturas subidas; el asesor puede borrar cualquiera
create policy "facturas: borrar" on public.invoices
  for delete using (
    (owner_id = auth.uid() and (estado = 'borrador' or origen = 'externa'))
    or public.is_advisor()
  );

create policy "gastos: todo" on public.expenses
  for all using (owner_id = auth.uid() or public.is_advisor())
  with check (owner_id = auth.uid() or public.is_advisor());

-- ---------------------------------------------------------------------
-- Archivos: bucket privado "documentos", una carpeta por usuario
--   {usuario}/gastos/…  {usuario}/facturas/…  {usuario}/logo/…
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documentos', 'documentos', false, 15728640,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "documentos: ver" on storage.objects
  for select using (
    bucket_id = 'documentos'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_advisor())
  );
create policy "documentos: subir" on storage.objects
  for insert with check (
    bucket_id = 'documentos'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_advisor())
  );
create policy "documentos: actualizar" on storage.objects
  for update using (
    bucket_id = 'documentos'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_advisor())
  );
create policy "documentos: borrar" on storage.objects
  for delete using (
    bucket_id = 'documentos'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_advisor())
  );

-- =====================================================================
-- Después de crear tu usuario (Authentication → Users → Add user),
-- ejecuta esto para hacerte asesor:
--
--   update public.profiles set role = 'advisor' where email = 'TU-EMAIL';
-- =====================================================================
