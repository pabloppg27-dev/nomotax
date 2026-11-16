-- NomoTax · Área de clientes — plan contratado por cada cliente
-- Pegar en Supabase → SQL Editor → Run (una sola vez).

alter table public.profiles
  add column if not exists plan text
  check (plan is null or plan in (
    'empresa_base', 'empresa_smart', 'empresa_max',
    'autonomo_core', 'autonomo_plus', 'autonomo_pro'
  ));

-- El plan solo lo cambia el asesor (o el SQL Editor), nunca el propio cliente
create or replace function public.protect_plan()
returns trigger
language plpgsql
as $$
begin
  if new.plan is distinct from old.plan
     and auth.uid() is not null
     and not public.is_advisor() then
    raise exception 'Solo tu asesor puede cambiar el plan';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_plan on public.profiles;
create trigger profiles_protect_plan
  before update on public.profiles
  for each row execute function public.protect_plan();

-- Que la API vea la columna nueva al momento
notify pgrst, 'reload schema';
