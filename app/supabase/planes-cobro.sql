-- NomoTax · Área de clientes — modalidad de pago, próximo cobro y precio personalizado del plan
-- Pegar en Supabase → SQL Editor → Run (una sola vez, después de planes.sql).

alter table public.profiles
  add column if not exists plan_periodo text not null default 'mensual'
    check (plan_periodo in ('mensual', 'anual')),
  add column if not exists plan_proximo_cobro date,
  -- null = precio de tarifa. Si hay valor, es €/mes o €/año según plan_periodo (sin IVA)
  add column if not exists plan_precio numeric(10,2) check (plan_precio is null or plan_precio >= 0);

-- Plan, modalidad, fecha y precio solo los cambia el asesor (o el SQL Editor)
create or replace function public.protect_plan()
returns trigger
language plpgsql
as $$
begin
  if (new.plan is distinct from old.plan
      or new.plan_periodo is distinct from old.plan_periodo
      or new.plan_proximo_cobro is distinct from old.plan_proximo_cobro
      or new.plan_precio is distinct from old.plan_precio)
     and auth.uid() is not null
     and not public.is_advisor() then
    raise exception 'Solo tu asesor puede cambiar el plan';
  end if;
  return new;
end;
$$;

-- Que la API vea las columnas nuevas al momento
notify pgrst, 'reload schema';
