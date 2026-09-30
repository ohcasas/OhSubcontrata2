-- Recreación aislada de aceptar_postulacion().
--
-- Esto es justo el primer bloque de 0005_aceptar_postulacion_rpc.sql,
-- SIN el bloque de finalizar_obra() que también trae ese archivo — esa
-- función ya está en su versión buena (la que exige 'en_curso', de la
-- migración 0012) y no queremos pisarla con la versión antigua que
-- exigía 'adjudicada'.

create or replace function aceptar_postulacion(p_postulacion_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado_actual estado_postulacion;
  v_obra_id uuid;
begin
  if auth_role() not in ('admin', 'superadmin') then
    raise exception 'No autorizado';
  end if;

  select estado, obra_id into v_estado_actual, v_obra_id
    from postulaciones
    where id = p_postulacion_id
    for update;

  if v_estado_actual is null then
    raise exception 'Postulación no encontrada';
  end if;

  if v_estado_actual = 'aceptada' then
    return; -- ya se había aceptado antes
  end if;

  update postulaciones set estado = 'aceptada', updated_at = now()
    where id = p_postulacion_id;

  -- El resto de postulaciones pendientes a la misma obra quedan
  -- descartadas: solo una empresa ejecuta cada obra.
  update postulaciones
    set estado = 'rechazada', updated_at = now()
    where obra_id = v_obra_id
      and id <> p_postulacion_id
      and estado in ('enviada', 'en_revision');

  update obras set estado = 'adjudicada', updated_at = now()
    where id = v_obra_id and estado is distinct from 'adjudicada';
end;
$$;