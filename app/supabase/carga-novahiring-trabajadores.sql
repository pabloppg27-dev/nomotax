-- =====================================================================
-- Alta de trabajadores de NOVA HIRING, S.L. (B75773119)
-- Fuente: contratos de Adrià Calvet y Roger Franch, y proyecto formativo de Nico Paniello
-- (Nico ya no está en prácticas: indefinido con 40.000€ brutos/año, según Pablo).
-- IRPF: % de la nómina de septiembre 2026 (listado de retenciones del gestor anterior).
-- Todos a 12 pagas, jornada completa 40 h, híbrido, Convenio TIC.
-- Ejecutar en Supabase → SQL Editor. Si el DNI ya existe en la empresa, actualiza sus datos.
-- =====================================================================
-- Retención de IRPF actual de cada trabajador (la fija el asesor; sale en su ficha)
alter table public.trabajadores add column if not exists irpf_pct numeric(5,2);
-- Condiciones del contrato en campos propios (salen en la ficha y en «Mi ficha»)
alter table public.trabajadores add column if not exists convenio text;
alter table public.trabajadores add column if not exists clasificacion text;
alter table public.trabajadores add column if not exists prueba_meses int;
alter table public.trabajadores add column if not exists vacaciones_dias int;
alter table public.trabajadores add column if not exists vacaciones_nota text;

do $$
declare
  o uuid;
  n int;
  t record;
begin
  select count(*), min(id::text)::uuid into n, o from public.profiles
   where nif = 'B75773119' or nombre ilike '%nova%hiring%';
  if n <> 1 then
    raise exception 'Se esperaba 1 cuenta de Nova Hiring y hay %', n;
  end if;

  for t in
    select * from (values
      ('Adrià Calvet Calderón', '41568656C', '171056549075', date '2001-11-16', 'C/ Nou 11 1r, 17600 Figueres', null::text,
       'Grado universitario', date '2026-04-07', 'Full Stack Developer', 2500.00, 16.42, 'Área 3 · Grupo C · Nivel III (Programador Junior)', 6),
      ('Roger Franch Carreras', '47999578G', '081232258865', date '1991-08-18', 'Carrer de Vistalegre 10, 08391 Tiana', null,
       null, date '2026-07-13', 'Operations Manager', 3333.33, 19.36, 'Área 4 · Grupo B · Nivel 1', 6),
      ('Nicolás Paniello Jiménez', '48270098K', '081420912448', null, 'Av. Barberà 172, 1.º 2.ª A, 08203 Sabadell', '628666048',
       'Grado universitario', date '2026-09-01', 'Marketing y ventas', 3333.33, 14.09, null::text, 6)
    ) as v(nombre, dni, nss, nac, dom, tel, estudios, inicio, puesto, bruto, irpf, clasif, prueba)
  loop
    update public.trabajadores set
      nombre = t.nombre, nss = t.nss,
      fecha_nacimiento = coalesce(t.nac, fecha_nacimiento),
      domicilio = coalesce(t.dom, domicilio), telefono = coalesce(t.tel, telefono),
      nivel_estudios = coalesce(t.estudios, nivel_estudios),
      fecha_inicio = t.inicio, puesto = t.puesto, tipo_contrato = 'indefinido',
      jornada = 'completa', horas_semana = 40, teletrabajo = true,
      salario_bruto_mensual = t.bruto, pagas = 12, irpf_pct = t.irpf, observaciones = null,
      convenio = 'Convenio TIC', clasificacion = t.clasif, prueba_meses = t.prueba,
      vacaciones_dias = 25, vacaciones_nota = '24 + 1 por cumpleaños',
      estado = 'alta'
     where owner_id = o and upper(dni) = t.dni;
    if not found then
      insert into public.trabajadores (owner_id, estado, nombre, dni, nss, fecha_nacimiento, domicilio, telefono,
        nivel_estudios, fecha_inicio, puesto, tipo_contrato, jornada, horas_semana, teletrabajo,
        salario_bruto_mensual, pagas, irpf_pct, convenio, clasificacion, prueba_meses, vacaciones_dias, vacaciones_nota)
      values (o, 'alta', t.nombre, t.dni, t.nss, t.nac, t.dom, t.tel,
        t.estudios, t.inicio, t.puesto, 'indefinido', 'completa', 40, true,
        t.bruto, 12, t.irpf, 'Convenio TIC', t.clasif, t.prueba, 25, '24 + 1 por cumpleaños');
    end if;
  end loop;

  -- Convenio de la empresa (solo si está vacío)
  insert into public.perfil_laboral (owner_id, convenio_nombre, periodo_prueba, pagas_convenio, horas_semana_convenio)
  values (o, 'Convenio Estatal de Consultoría, Tecnologías de la Información y Estudios de Mercado (TIC)', '6 meses', 12, 40)
  on conflict (owner_id) do update set
    convenio_nombre = coalesce(public.perfil_laboral.convenio_nombre, excluded.convenio_nombre);

  raise notice 'Nova Hiring: 3 trabajadores de alta (Adrià 30.000€, Roger 40.000€, Nico 40.000€ brutos/año)';
end $$;
