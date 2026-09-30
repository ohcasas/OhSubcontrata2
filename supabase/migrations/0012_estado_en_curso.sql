-- ============================================================================
-- Estado intermedio "en_curso" para obras
-- ============================================================================
-- Hasta ahora el ciclo era: adjudicada → cerrada (un solo salto, sin
-- forma de reflejar que el trabajo está en marcha). Se añade un estado
-- intermedio para poder distinguir "adjudicada pero sin empezar" de
-- "en ejecución", antes de finalizar.
--
-- Nuevo ciclo: abierta → adjudicada → en_curso → cerrada
--                                  ↘ cancelada ↙ (desde cualquiera de las tres primeras)
--
-- finalizar_obra() ahora exige que la obra esté en_curso (antes exigía
-- adjudicada) — así que hay que pasar por "Iniciar obra" antes de poder
-- "Marcar finalizada". Es el único cambio de comportamiento; el resto de
-- la función (acreditar puntos, ledger, nivel_partner) sigue igual.

alter type estado_obra add value if not exists 'en_curso';

create or replace function finalizar_obra(p_obra_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado_obra estado_obra;
  v_puntos_bonus integer;
  v_titulo_obra text;
  v_empresa_id uuid;
  v_nuevos_puntos integer;
  v_nuevo_nivel nivel_partner;
begin
  if auth_role() not in ('admin', 'superadmin') then
    raise exception 'No autorizado';
  end if;

  select estado, puntos_bonus, titulo into v_estado_obra, v_puntos_bonus, v_titulo_obra
    from obras
    where id = p_obra_id
    for update;

  if v_estado_obra is null then
    raise exception 'Obra no encontrada';
  end if;

  if v_estado_obra = 'cerrada' then
    return; -- ya estaba finalizada, no se vuelve a acreditar
  end if;

  if v_estado_obra <> 'en_curso' then
    raise exception 'Solo se puede finalizar una obra que esté en curso';
  end if;

  select empresa_id into v_empresa_id
    from postulaciones
    where obra_id = p_obra_id and estado = 'aceptada'
    limit 1;

  if v_empresa_id is null then
    raise exception 'Esta obra no tiene ninguna postulación aceptada';
  end if;

  update obras set estado = 'cerrada', updated_at = now() where id = p_obra_id;

  update empresas_subcontratistas
    set puntos_disponibles = puntos_disponibles + coalesce(v_puntos_bonus, 0),
        obras_completadas = obras_completadas + 1,
        updated_at = now()
    where id = v_empresa_id
    returning puntos_disponibles into v_nuevos_puntos;

  if coalesce(v_puntos_bonus, 0) > 0 then
    insert into club_partner_movimientos (empresa_id, tipo, puntos, concepto, obra_id)
    values (
      v_empresa_id,
      'ganancia',
      v_puntos_bonus,
      'Obra completada: ' || coalesce(v_titulo_obra, 'obra'),
      p_obra_id
    );
  end if;

  v_nuevo_nivel := case
    when v_nuevos_puntos >= 5000 then 'platino'
    when v_nuevos_puntos >= 2500 then 'oro'
    when v_nuevos_puntos >= 1000 then 'plata'
    else 'bronce'
  end;

  update empresas_subcontratistas
    set nivel_partner = v_nuevo_nivel
    where id = v_empresa_id and nivel_partner is distinct from v_nuevo_nivel;
end;
$$;