-- NomoTax · numeración continua por serie (sin año), para seguir una numeración que viene de fuera de la app.
-- Ej.: profiles.numeracion_continua = {"NT": 217} → la siguiente factura de la serie NT es NT0218, NT0219…
-- Las series que no estén en ese JSON siguen como siempre: F2026-0001 (por año).
-- Pegar en Supabase → SQL Editor → Run (una sola vez).

alter table public.profiles add column if not exists numeracion_continua jsonb;

create or replace function public.invoices_emitir()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  anio int;
  p public.profiles;
  desde int;
begin
  -- Una factura de la app ya emitida no se puede modificar (solo marcar cobrada / contabilizada)
  if tg_op = 'UPDATE' and old.origen = 'app' and old.estado <> 'borrador' then
    if new.numero is distinct from old.numero
       or new.serie is distinct from old.serie
       or new.fecha is distinct from old.fecha
       or new.lineas is distinct from old.lineas
       or new.cliente is distinct from old.cliente
       or new.total is distinct from old.total
       or new.base is distinct from old.base
       or new.cuota_iva is distinct from old.cuota_iva
       or new.cuota_irpf is distinct from old.cuota_irpf
       or new.tipo is distinct from old.tipo
       or new.rectifica_id is distinct from old.rectifica_id
       or new.causa_rectificacion is distinct from old.causa_rectificacion
       or new.motivo_rectificacion is distinct from old.motivo_rectificacion
       or new.estado = 'borrador' then
      raise exception 'Una factura emitida no se puede modificar. Haz una factura rectificativa.';
    end if;
    return new;
  end if;

  if new.origen = 'app' and new.estado in ('emitida', 'cobrada') and new.numero is null then
    if new.tipo = 'rectificativa' then
      if new.rectifica_id is null then
        raise exception 'La rectificativa tiene que indicar qué factura rectifica.';
      end if;
      if coalesce(trim(new.motivo_rectificacion), '') = '' or new.causa_rectificacion is null then
        raise exception 'Indica la causa y el motivo de la rectificación.';
      end if;
      if not exists (
        select 1 from public.invoices o
         where o.id = new.rectifica_id and o.owner_id = new.owner_id and o.estado <> 'borrador'
      ) then
        raise exception 'Solo se puede rectificar una factura emitida.';
      end if;
    end if;

    select * into p from public.profiles where id = new.owner_id;
    desde := (p.numeracion_continua ->> new.serie)::int;
    perform pg_advisory_xact_lock(hashtext('i' || new.owner_id::text || new.serie));

    if desde is not null then
      -- Numeración continua: sigue después del último número emitido fuera de la app (NT0217 → NT0218)
      select greatest(coalesce(max(num), 0), desde) + 1 into new.num
        from public.invoices
       where owner_id = new.owner_id and serie = new.serie and origen = 'app';
      new.numero := new.serie || lpad(new.num::text, 4, '0');
    else
      anio := extract(year from new.fecha)::int;
      select coalesce(max(num), 0) + 1 into new.num
        from public.invoices
       where owner_id = new.owner_id and serie = new.serie and origen = 'app'
         and extract(year from fecha)::int = anio;
      new.numero := new.serie || anio || '-' || lpad(new.num::text, 4, '0');
    end if;

    new.emitida_at := now();
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

-- Tu perfil emisor: la última factura NT emitida fuera de la app fue la NT0217
update public.profiles
   set numeracion_continua = coalesce(numeracion_continua, '{}'::jsonb) || '{"NT": 217}'::jsonb
 where lower(email) = 'info@nomotax.io';

-- Comprobación: debe salir una fila con {"NT": 217} y serie_factura = NT
select email, serie_factura, numeracion_continua from public.profiles where lower(email) = 'info@nomotax.io';
