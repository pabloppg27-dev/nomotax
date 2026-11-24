-- =====================================================================
-- Strobo Films ↔ Jordi Albiol Barroso
--
--   1. Datos de Strobo Films, S.L.U. (B05816970) sacados de su 036 de alta (26/10/2026):
--      se ponen en su propio perfil (solo donde esté vacío) y en su ficha de cliente
--      dentro de la cuenta de autónomo de Jordi.
--   2. Todos los clientes de la cuenta de autónomo de Jordi se copian a Strobo Films
--      (los que ya estén en Strobo con el mismo NIF o nombre no se repiten; Strobo no
--      se copia a sí misma).
--
-- Requiere cuentas-titular.sql, carga-jordi-albiol.sql y carga-jordi-historico.sql.
-- Ejecutar en Supabase → SQL Editor. Se puede repetir.
-- =====================================================================
do $$
declare
  t uuid;   -- Strobo Films (el login heyjordialbiol@gmail.com)
  j uuid;   -- cuenta de autónomo de Jordi
  s_nif constant text := 'B05816970';
  s_nombre constant text := 'Strobo Films, S.L.U.';
  s_dir constant text := 'Calle San Francisco, 80 B, 2.º A';
  s_cp constant text := '12500';
  s_ciudad constant text := 'Vinaròs';
  s_prov constant text := 'Castellón';
  copiados int;
begin
  select id into t from public.profiles
   where lower(email) = 'heyjordialbiol@gmail.com' and titular_id is null;
  if t is null then
    raise exception 'No encuentro la cuenta de Strobo Films (login heyjordialbiol@gmail.com)';
  end if;

  select id into j from public.profiles
   where titular_id = t and upper(nif) = '20487493J';
  if j is null then
    raise exception 'No encuentro la cuenta de autónomo de Jordi: ejecuta antes carga-jordi-albiol.sql';
  end if;

  -- 1a. Perfil de Strobo: NIF y domicilio fiscal (no pisa lo que ya tenga)
  update public.profiles set
    nif = coalesce(nullif(nif, ''), s_nif),
    direccion = coalesce(nullif(direccion, ''), s_dir),
    cp = coalesce(nullif(cp, ''), s_cp),
    ciudad = coalesce(nullif(ciudad, ''), s_ciudad),
    provincia = coalesce(nullif(provincia, ''), s_prov),
    pais = coalesce(nullif(pais, ''), 'España')
  where id = t;

  -- 1b. Strobo como cliente de Jordi, con sus datos completos
  if exists (select 1 from public.contacts where owner_id = j and (upper(nif) = s_nif or nombre ilike '%strobo%')) then
    update public.contacts set
      nombre = s_nombre,
      nif = s_nif,
      direccion = s_dir,
      cp = s_cp,
      ciudad = s_ciudad,
      provincia = s_prov,
      pais = 'España'
     where owner_id = j and (upper(nif) = s_nif or nombre ilike '%strobo%');
  else
    insert into public.contacts (owner_id, nombre, nif, email, direccion, cp, ciudad, provincia, pais, notas)
    select j, s_nombre, s_nif, p.email, s_dir, s_cp, s_ciudad, s_prov, 'España',
           'Sociedad de Jordi (socio único y administrador). Facturas por servicios profesionales: IVA 21% e IRPF 15% (Strobo lo ingresa en su 111). Operación vinculada: a valor de mercado.'
      from public.profiles p where p.id = t;
  end if;

  -- 2. Clientes de Jordi → Strobo (todos los campos de la ficha; sin duplicar por NIF o nombre)
  insert into public.contacts (owner_id, nombre, nif, email, telefono, direccion, cp, ciudad, provincia, pais, notas)
  select t, c.nombre, c.nif, c.email, c.telefono, c.direccion, c.cp, c.ciudad, c.provincia, c.pais, c.notas
    from public.contacts c
   where c.owner_id = j
     and upper(coalesce(c.nif, '')) <> s_nif
     and c.nombre not ilike '%strobo%'
     and not exists (
       select 1 from public.contacts d
        where d.owner_id = t
          and ((coalesce(c.nif, '') <> '' and upper(d.nif) = upper(c.nif))
               or upper(trim(d.nombre)) = upper(trim(c.nombre))));
  get diagnostics copiados = row_count;

  raise notice 'Listo: % clientes copiados de Jordi a Strobo Films; Strobo (%) queda como cliente de Jordi.', copiados, s_nif;
end $$;

-- Comprobación: clientes de cada cuenta
select p.nombre as cuenta, count(c.id) as clientes,
       bool_or(c.nif = 'B05816970') as tiene_a_strobo
  from public.profiles p
  left join public.contacts c on c.owner_id = p.id
 where lower(p.email) = 'heyjordialbiol@gmail.com'
 group by p.nombre, p.titular_id
 order by p.titular_id nulls first;
