-- 0081 · Panel: listado de obras con su comisión (propia y aplicable) para fijarla obra a obra.
-- Solo LECTURA. Para guardar se usa la función que ya existe: panel_guardar_comision('obra', id, pct).
create or replace function panel_obras_comision()
returns table (
  id uuid, titulo text, origen text, estado text, created_at timestamptz,
  comision_propia numeric, comision_general numeric, comision_aplicable numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_general numeric;
begin
  perform panel_exigir_admin();
  select a.comision_general_pct into v_general from ajustes_pagos a where a.id;
  return query
    select o.id, o.titulo::text, o.origen::text, o.estado::text, o.created_at,
           o.comision_pct, v_general,
           comision_aplicable(o.id, null)
      from obras o
     order by o.created_at desc
     limit 500;
end;
$$;
revoke all on function panel_obras_comision() from public, anon;
grant execute on function panel_obras_comision() to authenticated;