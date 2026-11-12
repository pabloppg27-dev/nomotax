-- NomoTax · Área de clientes — fecha en que se envió el correo de bienvenida
alter table public.profiles add column if not exists bienvenida_enviada_at timestamptz;
