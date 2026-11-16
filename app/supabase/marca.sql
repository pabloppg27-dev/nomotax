-- Color de marca del cliente para sus facturas y presupuestos (franja superior
-- y caja del total del PDF). Vacío = lima de NomoTax. Formato #RRGGBB.
alter table public.profiles
  add column if not exists color_marca text
  check (color_marca is null or color_marca ~ '^#[0-9A-Fa-f]{6}$');
