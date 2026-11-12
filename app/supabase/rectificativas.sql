-- =====================================================================
-- NomoTax · Área de clientes — FACTURAS RECTIFICATIVAS
-- Las facturas emitidas no se borran nunca: se corrigen con una rectificativa
-- (serie propia, art. 6 y 15 del Reglamento de facturación, RD 1619/2012).
-- Ejecutar una vez en Supabase → SQL Editor.
-- =====================================================================

alter table public.profiles
  add column if not exists serie_rectificativa text not null default 'R';

alter table public.invoices
  add column if not exists tipo text not null default 'ordinaria'
    check (tipo in ('ordinaria', 'rectificativa')),
  add column if not exists rectifica_id uuid references public.invoices(id) on delete restrict,
  add column if not exists rectifica_numero text,
  add column if not exists rectifica_fecha date,
  add column if not exists causa_rectificacion text
    check (causa_rectificacion in ('R1', 'R2', 'R3', 'R4')),
  add column if not exists motivo_rectificacion text;

create index if not exists invoices_rectifica_idx on public.invoices(rectifica_id);

-- Emisión, numeración y bloqueo (ahora también de los datos de la rectificación)
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

-- Nadie puede borrar una factura emitida desde la app, ni siquiera el asesor.
-- (Solo se permite desde el SQL Editor / borrado de la cuenta, donde no hay usuario.)
create or replace function public.invoices_no_borrar()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null and old.origen = 'app' and old.estado <> 'borrador' then
    raise exception 'Una factura emitida no se puede borrar. Haz una factura rectificativa.';
  end if;
  return old;
end;
$$;

drop trigger if exists invoices_no_borrar_trg on public.invoices;
create trigger invoices_no_borrar_trg before delete on public.invoices
  for each row execute function public.invoices_no_borrar();

-- La política de borrado ya no tiene excepción para el asesor con las emitidas
drop policy if exists "facturas: borrar" on public.invoices;
create policy "facturas: borrar" on public.invoices
  for delete using (
    (owner_id = auth.uid() or public.is_advisor())
    and (estado = 'borrador' or origen = 'externa')
  );
