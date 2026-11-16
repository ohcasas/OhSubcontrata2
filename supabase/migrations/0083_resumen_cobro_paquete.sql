-- 0083 · Resumen de cobro con paquete (lo que verá el particular antes de pagar).
-- Solo lectura: no cambia datos, no envía correos, no crea tareas. Requiere 0082.
create or replace function app_resumen_cobro(p_obra_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_obra obras%rowtype;
  v_post postulaciones%rowtype;
  v_oferta bigint;
  v_extra bigint;
  v_p paquetes_particular%rowtype;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  select * into v_obra from obras where id = p_obra_id;
  if not found or v_obra.creado_por is distinct from v_uid then
    raise exception 'Solo quien publicó la obra puede ver este resumen.';
  end if;
  select * into v_post from postulaciones
    where obra_id = p_obra_id and estado = 'aceptada'
    order by updated_at desc limit 1;
  if not found then return null; end if;

  v_oferta := round(v_post.oferta_economica * 100)::bigint;
  v_extra := paquete_recargo_cents(v_oferta, v_obra.paquete_codigo);
  select * into v_p from paquetes_particular where codigo = v_obra.paquete_codigo;

  return jsonb_build_object(
    'oferta_cents', v_oferta,
    'recargo_cents', v_extra,
    'total_cents', v_oferta + v_extra,
    'paquete_codigo', case when v_extra > 0 then v_obra.paquete_codigo else null end,
    'paquete_nombre', case when v_extra > 0 then v_p.nombre else null end
  );
end;
$$;
revoke all on function app_resumen_cobro(uuid) from public, anon;
grant execute on function app_resumen_cobro(uuid) to authenticated;