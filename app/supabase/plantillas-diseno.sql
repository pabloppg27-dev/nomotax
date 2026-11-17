-- NomoTax · Diseño de los correos de cada empresa (Configuración → Plantillas → Diseño).
-- Colores de la cabecera y del botón de entrada. Vacío = negro de NomoTax. Formato #RRGGBB.
-- El acento (franja, etiqueta, caja del total) es el color de marca de siempre (profiles.color_marca, supabase/marca.sql).
-- Pegar en Supabase → SQL Editor → Run (una sola vez; se puede repetir sin problema).
alter table public.profiles
  add column if not exists color_cabecera text
  check (color_cabecera is null or color_cabecera ~ '^#[0-9A-Fa-f]{6}$');
alter table public.profiles
  add column if not exists color_boton text
  check (color_boton is null or color_boton ~ '^#[0-9A-Fa-f]{6}$');
