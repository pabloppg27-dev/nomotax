-- =====================================================================
-- NomoTax · Usuarios con rol COMERCIAL: solo ven lo suyo
-- Sus facturas, sus presupuestos y sus clientes (los que ha dado de alta él
-- o con los que tiene alguna factura o presupuesto). No ven lo del resto del equipo.
-- El titular, el asesor, los admin y los socios lo siguen viendo todo.
-- Requiere usuarios.sql. Ejecutar en Supabase → SQL Editor. Se puede repetir.
-- =====================================================================

-- Quién dio de alta cada cliente (como ya pasa con facturas y presupuestos)
alter table public.contacts add column if not exists creado_por uuid references public.profiles(id) on delete set null;
drop trigger if exists contacts_autor on public.contacts;
create trigger contacts_autor before insert on public.contacts
  for each row execute function public.poner_autor('creado_por');

-- Reglas «restrictivas»: se suman a las que ya hay (no dan acceso nuevo, solo lo recortan al comercial)
drop policy if exists "comercial: sus facturas" on public.invoices;
create policy "comercial: sus facturas" on public.invoices as restrictive for all
  using (public.mi_rol(owner_id) is distinct from 'comercial' or creado_por = auth.uid());

drop policy if exists "comercial: sus presupuestos" on public.quotes;
create policy "comercial: sus presupuestos" on public.quotes as restrictive for all
  using (public.mi_rol(owner_id) is distinct from 'comercial' or creado_por = auth.uid());

drop policy if exists "comercial: sus clientes" on public.contacts;
create policy "comercial: sus clientes" on public.contacts as restrictive for all
  using (
    public.mi_rol(owner_id) is distinct from 'comercial'
    or creado_por = auth.uid()
    or exists (select 1 from public.invoices i where i.contact_id = contacts.id and i.creado_por = auth.uid())
    or exists (select 1 from public.quotes q where q.contact_id = contacts.id and q.creado_por = auth.uid())
  );
