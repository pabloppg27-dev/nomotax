-- NomoTax · Correo de cada empresa: su propio servidor SMTP y las plantillas de los correos.
-- Funciona con o sin supabase/usuarios.sql (si existe puede(), la usa). Después de envio-facturas.sql.
-- Pegar en Supabase → SQL Editor → Run (una sola vez; se puede repetir sin problema).
--
-- Configuración → Correo: si la empresa conecta su SMTP (y la prueba sale bien), TODOS sus correos
-- (facturas, accesos y, más adelante, nóminas y presupuestos) salen desde su propio email.
-- Si no, desde info@nomotax.io con su nombre y «Responder a» la empresa.
-- La contraseña va cifrada (AES-GCM, secreto SMTP_CLAVE de las funciones) en smtp_claves, que nadie puede
-- leer desde la app: solo las funciones smtp-config, enviar-factura e invitar-miembro, con la clave secreta.

-- Plantillas de los correos (Configuración → Plantillas): accesos, nóminas y presupuestos.
-- (La de facturas ya está en envio-facturas.sql: correo_asunto y correo_mensaje.) Vacío = la de por defecto.
alter table public.profiles add column if not exists acceso_asunto text check (char_length(acceso_asunto) <= 200);
alter table public.profiles add column if not exists acceso_mensaje text check (char_length(acceso_mensaje) <= 5000);
alter table public.profiles add column if not exists nomina_asunto text check (char_length(nomina_asunto) <= 200);
alter table public.profiles add column if not exists nomina_mensaje text check (char_length(nomina_mensaje) <= 5000);
alter table public.profiles add column if not exists presupuesto_asunto text check (char_length(presupuesto_asunto) <= 200);
alter table public.profiles add column if not exists presupuesto_mensaje text check (char_length(presupuesto_mensaje) <= 5000);

-- Servidor de correo de la empresa (sin la contraseña)
create table if not exists public.smtp_empresas (
  owner_id uuid primary key references public.profiles(id) on delete cascade,
  proveedor text not null default 'otro',
  host text not null,
  puerto int not null check (puerto in (25, 465, 587, 2525)),
  seguridad text not null check (seguridad in ('ssl', 'starttls')),
  usuario text not null,
  remitente_email text not null check (remitente_email ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  remitente_nombre text,
  -- Solo se activa cuando la prueba de conexión sale bien
  activo boolean not null default false,
  verificado_at timestamptz,
  ultimo_error text,
  updated_at timestamptz not null default now()
);

-- La contraseña, cifrada. Sin ninguna política: la app no la puede ni leer ni escribir.
create table if not exists public.smtp_claves (
  owner_id uuid primary key references public.smtp_empresas(owner_id) on delete cascade,
  clave_cifrada text not null
);
alter table public.smtp_claves enable row level security;

alter table public.smtp_empresas enable row level security;
drop policy if exists "smtp: ver" on public.smtp_empresas;
-- Ver la configuración (sin contraseña): quien gestiona los datos de la empresa. Se cambia solo con la función smtp-config.
do $$
begin
  if exists (select 1 from pg_proc where proname = 'puede' and pronamespace = 'public'::regnamespace) then
    create policy "smtp: ver" on public.smtp_empresas
      for select using (public.puede(owner_id, 'empresa') or public.puede(owner_id, 'ventas'));
  else
    create policy "smtp: ver" on public.smtp_empresas
      for select using (
        owner_id = auth.uid()
        or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'advisor')
      );
  end if;
end $$;
