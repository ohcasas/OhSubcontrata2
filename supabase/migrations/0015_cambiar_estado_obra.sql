-- ============================================================================
-- cambiar_estado_obra(): un único camino, con reglas, para cambiar el estado
-- de una obra desde el panel de admin.
-- ============================================================================
-- Problema que resuelve: el estado de la obra y el de su postulación podían
-- descuadrarse (p.ej. postulación "aceptada" con la obra "abierta" o
-- "cancelada"), porque cada botón del panel hacía su propia actualización
-- directa. Y con la obra en un estado "raro", ningún botón permitía llegar a
-- "finalizada", así que los puntos no se podían acreditar.
--
-- Reglas:
--  * adjudicada / en_curso / cerrada  → exigen una postulación aceptada.
--  * cerrada (finalizada)             → acredita los puntos de la obra a la
--                                       empresa adjudicataria y suma 1 obra
--                                       completada. IDEMPOTENTE: si ya se
--                                       acreditaron (y no se revirtieron), no
--                                       se vuelven a acreditar.
--  * salir de cerrada                 → revierte los puntos acreditados
--                                       (movimiento 'ajuste' negativo en el
--                                       libro de puntos) y resta la obra
--                                       completada.
--  * abierta                          → si había postulación aceptada, vuelve
--                                       a "enviada" (la obra se reabre a
--                                       concurso).
--  * cancelada                        → siempre permitido.
--
-- Los umbrales de nivel siguen siendo los de finalizar_obra() (1000/2500/5000).

create or replace function cambiar_estado_obra(p_obra_id uuid, p_nuevo_estado estado_obra)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado_actual estado_obra;
  v_puntos_bonus integer;
  v_titulo text;
  v_empresa_id uuid;
  v_neto_previo integer := 0;
  v_puntos_actuales integer;
  v_a_mover integer;
  v_nuevos_puntos integer;
  v_nuevo_nivel nivel_partner;
begin
  if auth_role() not in ('admin', 'superadmin') then
    raise exception 'No autorizado';
  end if;

  select estado, puntos_bonus, titulo
    into v_estado_actual, v_puntos_bonus, v_titulo
    from obras
    where id = p_obra_id
    for update;

  if v_estado_actual is null then
    raise exception 'Obra no encontrada';
  end if;

  if v_estado_actual = p_nuevo_estado then
    return; -- ya estaba en ese estado
  end if;

  select empresa_id into v_empresa_id
    from postulaciones
    where obra_id = p_obra_id and estado = 'aceptada'
    limit 1;

  if p_nuevo_estado in ('adjudicada', 'en_curso', 'cerrada') and v_empresa_id is null then
    raise exception 'Esta obra no tiene ninguna postulación aceptada. Acepta primero una postulación.';
  end if;

  if v_empresa_id is not null then
    -- Puntos netos ya acreditados por esta obra a esa empresa
    -- (ganancias menos reversiones).
    select coalesce(sum(puntos), 0) into v_neto_previo
      from club_partner_movimientos
      where obra_id = p_obra_id
        and empresa_id = v_empresa_id
        and tipo in ('ganancia', 'ajuste');
  end if;

  -- Salir de "cerrada": revertir lo acreditado.
  if v_estado_actual = 'cerrada' and v_empresa_id is not null then
    if v_neto_previo > 0 then
      select puntos_disponibles into v_puntos_actuales
        from empresas_subcontratistas
        where id = v_empresa_id
        for update;

      -- Si la empresa ya canjeó parte de esos puntos, solo se puede revertir
      -- lo que le queda (el resto se descontaría de puntos que ya no tiene).
      v_a_mover := least(v_neto_previo, v_puntos_actuales);
      if v_a_mover > 0 then
        update empresas_subcontratistas
          set puntos_disponibles = puntos_disponibles - v_a_mover,
              updated_at = now()
          where id = v_empresa_id;

        insert into club_partner_movimientos (empresa_id, tipo, puntos, concepto, obra_id)
        values (
          v_empresa_id,
          'ajuste',
          -v_a_mover,
          'Reversión: la obra deja de estar finalizada (' || coalesce(v_titulo, 'obra') || ')',
          p_obra_id
        );
      end if;
    end if;

    update empresas_subcontratistas
      set obras_completadas = greatest(obras_completadas - 1, 0),
          updated_at = now()
      where id = v_empresa_id;
  end if;

  -- Entrar en "cerrada": acreditar lo que falte por acreditar.
  if p_nuevo_estado = 'cerrada' then
    v_a_mover := greatest(coalesce(v_puntos_bonus, 0) - v_neto_previo, 0);

    update empresas_subcontratistas
      set puntos_disponibles = puntos_disponibles + v_a_mover,
          obras_completadas = obras_completadas + 1,
          updated_at = now()
      where id = v_empresa_id;

    if v_a_mover > 0 then
      insert into club_partner_movimientos (empresa_id, tipo, puntos, concepto, obra_id)
      values (
        v_empresa_id,
        'ganancia',
        v_a_mover,
        'Obra completada: ' || coalesce(v_titulo, 'obra'),
        p_obra_id
      );
    end if;
  end if;

  -- Reabrir a concurso: la postulación aceptada vuelve a estar pendiente.
  if p_nuevo_estado = 'abierta' and v_empresa_id is not null then
    update postulaciones
      set estado = 'enviada', updated_at = now()
      where obra_id = p_obra_id and estado = 'aceptada';
  end if;

  -- Recalcular el nivel si los puntos se han movido.
  if v_empresa_id is not null
     and (v_estado_actual = 'cerrada' or p_nuevo_estado = 'cerrada') then
    select puntos_disponibles into v_nuevos_puntos
      from empresas_subcontratistas
      where id = v_empresa_id;

    v_nuevo_nivel := case
      when v_nuevos_puntos >= 5000 then 'platino'
      when v_nuevos_puntos >= 2500 then 'oro'
      when v_nuevos_puntos >= 1000 then 'plata'
      else 'bronce'
    end;

    update empresas_subcontratistas
      set nivel_partner = v_nuevo_nivel
      where id = v_empresa_id and nivel_partner is distinct from v_nuevo_nivel;
  end if;

  update obras set estado = p_nuevo_estado, updated_at = now() where id = p_obra_id;
end;
$$;

grant execute on function cambiar_estado_obra(uuid, estado_obra) to authenticated;

-- ============================================================================
-- Reparación de datos ya descuadrados
-- ============================================================================
-- Obras que siguen "abiertas" aunque ya tienen una postulación aceptada
-- (datos de prueba, o restos de cuando cada botón actualizaba por su cuenta):
-- pasan a "adjudicada", que es lo que son. No se tocan las canceladas ni las
-- cerradas: esas pueden ser decisiones deliberadas, y ahora el panel permite
-- corregirlas a mano.
update obras o
  set estado = 'adjudicada', updated_at = now()
  where o.estado = 'abierta'
    and exists (
      select 1 from postulaciones p
      where p.obra_id = o.id and p.estado = 'aceptada'
    );