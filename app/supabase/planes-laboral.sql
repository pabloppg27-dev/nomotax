-- NomoTax · Área de clientes — laboral en el plan: nóminas al mes y precio por nómina
-- Pegar en Supabase → SQL Editor → Run (una sola vez, después de planes-cobro.sql).

alter table public.profiles
  add column if not exists plan_nominas integer not null default 0 check (plan_nominas >= 0),
  -- null = tarifa de la web (1 → 25€, 2–9 → 18€, 10+ → 12€ por nómina y mes)
  add column if not exists plan_nomina_precio numeric(10,2) check (plan_nomina_precio is null or plan_nomina_precio >= 0);

-- Todo lo del plan solo lo cambia el asesor (o el SQL Editor)
create or replace function public.protect_plan()
returns trigger
language plpgsql
as $$
begin
  if (new.plan is distinct from old.plan
      or new.plan_periodo is distinct from old.plan_periodo
      or new.plan_proximo_cobro is distinct from old.plan_proximo_cobro
      or new.plan_precio is distinct from old.plan_precio
      or new.plan_nominas is distinct from old.plan_nominas
      or new.plan_nomina_precio is distinct from old.plan_nomina_precio)
     and auth.uid() is not null
     and not public.is_advisor() then
    raise exception 'Solo tu asesor puede cambiar el plan';
  end if;
  return new;
end;
$$;

notify pgrst, 'reload schema';
