-- NomoTax · Envío de facturas por email a los clientes de cada empresa.
-- Funciona con o sin supabase/usuarios.sql (si existe puede(), la usa).
-- Pegar en Supabase → SQL Editor → Run (una sola vez).
--
-- El correo lo manda la función enviar-factura desde invoice@nomotax.io con el nombre de la empresa
-- («Empresa vía NomoTax»). Las respuestas van a profiles.email_respuesta (o al email de la cuenta).

-- Plantilla del correo y a dónde llegan las respuestas (Configuración → Envío de facturas)
alter table public.profiles add column if not exists email_respuesta text
  check (email_respuesta is null or email_respuesta ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$');
-- Vacío = textos por defecto (src/lib/correoFactura.ts)
alter table public.profiles add column if not exists correo_asunto text check (char_length(correo_asunto) <= 200);
alter table public.profiles add column if not exists correo_mensaje text check (char_length(correo_mensaje) <= 5000);
-- Copia oculta del envío al email de respuestas
alter table public.profiles add column if not exists correo_copia boolean not null default false;

-- Último envío de cada factura (se puede tocar con la factura emitida: no está en el bloqueo de invoices_emitir)
alter table public.invoices add column if not exists enviada_at timestamptz;
alter table public.invoices add column if not exists enviada_a text;

-- Registro de envíos: lo escribe solo la función (clave secreta). Sirve de historial y de límite diario.
create table if not exists public.envios_factura (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  enviado_por uuid references public.profiles(id) on delete set null,
  para text[] not null,
  cc text[] not null default '{}',
  asunto text not null,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists envios_factura_owner_fecha on public.envios_factura (owner_id, created_at desc);
create index if not exists envios_factura_invoice on public.envios_factura (invoice_id, created_at desc);

alter table public.envios_factura enable row level security;
drop policy if exists "envíos: ver" on public.envios_factura;
-- Con usuarios.sql: quien ve las ventas de la empresa. Sin él: el titular y el asesor.
do $$
begin
  if exists (select 1 from pg_proc where proname = 'puede' and pronamespace = 'public'::regnamespace) then
    create policy "envíos: ver" on public.envios_factura
      for select using (public.puede(owner_id, 'ventas'));
  else
    create policy "envíos: ver" on public.envios_factura
      for select using (
        owner_id = auth.uid()
        or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'advisor')
      );
  end if;
end $$;
-- Sin políticas de insert/update/delete: solo la función enviar-factura escribe.
