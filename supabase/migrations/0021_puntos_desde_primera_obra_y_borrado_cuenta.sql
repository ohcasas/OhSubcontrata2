-- ============================================================================
-- 1. Puntos y desbloqueo del Club Partner desde la 1ª obra (antes: 3ª)
-- ============================================================================
-- Se cambia una sola constante en cada una de las dos funciones. El resto
-- del cuerpo es idéntico al de 0018 (se redefine entera porque en PL/pgSQL
-- no se puede tocar solo una línea de una función ya creada).
--
-- Con umbral 1: la 1ª obra que se marca como finalizada ya acredita sus
-- puntos, y el Club OH Partner queda desbloqueado (deja de aparecer el
-- panel de "Llevas X de Y obras completadas"). Solo se ve bloqueado para
-- una empresa que todavía no ha finalizado ninguna obra (0 completadas).

create or replace function cambiar_estado_obra(p_obra_id uuid, p_nuevo_estado estado_obra)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c_obras_para_puntos constant integer := 1;  -- antes 3: ahora se acredita desde la 1ª obra
  c_dias_pago constant integer := 2;
  v_estado_actual estado_obra;
  v_puntos_bonus integer;
  v_titulo text;
  v_empresa_id uuid;
  v_nombre_empresa text;
  v_neto_previo integer := 0;
  v_puntos_disp integer := 0;
  v_puntos_tot integer := 0;
  v_obras_completadas integer := 0;
  v_nivel_anterior nivel_partner;
  v_nivel_nuevo nivel_partner;
  v_nueva_cuenta integer;
  v_a_acreditar integer := 0;
  v_titulo_notif text;
  v_cuerpo text;
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
    return;
  end if;

  select empresa_id into v_empresa_id
    from postulaciones
    where obra_id = p_obra_id and estado = 'aceptada'
    limit 1;

  if p_nuevo_estado in ('adjudicada', 'en_curso', 'cerrada') and v_empresa_id is null then
    raise exception 'Esta obra no tiene ninguna postulación aceptada. Acepta primero una postulación.';
  end if;

  if v_empresa_id is not null then
    select nombre into v_nombre_empresa from empresas_subcontratistas where id = v_empresa_id;

    select coalesce(sum(puntos), 0) into v_neto_previo
      from club_partner_movimientos
      where obra_id = p_obra_id
        and empresa_id = v_empresa_id
        and tipo in ('ganancia', 'ajuste');

    select puntos_disponibles, puntos_totales, obras_completadas, nivel_partner
      into v_puntos_disp, v_puntos_tot, v_obras_completadas, v_nivel_anterior
      from empresas_subcontratistas
      where id = v_empresa_id
      for update;
  end if;

  if v_estado_actual = 'cerrada' and v_empresa_id is not null then
    if v_neto_previo > 0 then
      if v_puntos_disp < v_neto_previo then
        raise exception 'No se puede revertir: la empresa ya ha canjeado parte de los puntos de esta obra (% pts acreditados, % disponibles).',
          v_neto_previo, v_puntos_disp;
      end if;

      update empresas_subcontratistas
        set puntos_disponibles = puntos_disponibles - v_neto_previo,
            puntos_totales = greatest(puntos_totales - v_neto_previo, 0),
            updated_at = now()
        where id = v_empresa_id;

      insert into club_partner_movimientos (empresa_id, tipo, puntos, concepto, obra_id)
      values (
        v_empresa_id, 'ajuste', -v_neto_previo,
        'Reversión: la obra deja de estar finalizada (' || coalesce(v_titulo, 'obra') || ')',
        p_obra_id
      );

      perform crear_notificacion(
        v_empresa_id, 'obra_revertida',
        'Obra reabierta: puntos revertidos',
        'La obra «' || coalesce(v_titulo, 'obra') || '» ya no figura como finalizada y se han revertido ' || v_neto_previo || ' puntos.',
        jsonb_build_object('obra_id', p_obra_id)
      );
    end if;

    update empresas_subcontratistas
      set obras_completadas = greatest(obras_completadas - 1, 0),
          updated_at = now()
      where id = v_empresa_id;
  end if;

  if p_nuevo_estado = 'cerrada' then
    v_nueva_cuenta := v_obras_completadas + 1;

    if v_nueva_cuenta >= c_obras_para_puntos then
      v_a_acreditar := greatest(coalesce(v_puntos_bonus, 0) - v_neto_previo, 0);
    end if;

    update empresas_subcontratistas
      set puntos_disponibles = puntos_disponibles + v_a_acreditar,
          puntos_totales = puntos_totales + v_a_acreditar,
          obras_completadas = obras_completadas + 1,
          updated_at = now()
      where id = v_empresa_id;

    if v_a_acreditar > 0 then
      insert into club_partner_movimientos (empresa_id, tipo, puntos, concepto, obra_id)
      values (v_empresa_id, 'ganancia', v_a_acreditar, 'Obra completada: ' || coalesce(v_titulo, 'obra'), p_obra_id);
    end if;

    if v_a_acreditar > 0 then
      v_titulo_notif := 'Obra finalizada: +' || v_a_acreditar || ' puntos';
      v_cuerpo := 'Has completado «' || coalesce(v_titulo, 'la obra') || '» y se han acreditado ' || v_a_acreditar || ' puntos Club OH.';
    elsif v_nueva_cuenta < c_obras_para_puntos then
      v_titulo_notif := 'Obra finalizada';
      v_cuerpo := 'Has completado «' || coalesce(v_titulo, 'la obra') || '». Llevas ' || v_nueva_cuenta || ' de ' || c_obras_para_puntos
        || ' obras para desbloquear los puntos y las recompensas del Club OH Partner.';
    else
      v_titulo_notif := 'Obra finalizada';
      v_cuerpo := 'Has completado «' || coalesce(v_titulo, 'la obra') || '».';
    end if;

    if v_nueva_cuenta = c_obras_para_puntos then
      v_cuerpo := v_cuerpo || ' ¡Has desbloqueado el Club OH Partner!';
    end if;

    v_cuerpo := v_cuerpo || ' En un plazo de ' || c_dias_pago || ' días comenzará el proceso de pago de la obra.';

    perform crear_notificacion(
      v_empresa_id, 'obra_finalizada', v_titulo_notif, v_cuerpo,
      jsonb_build_object('obra_id', p_obra_id, 'puntos', v_a_acreditar)
    );
  end if;

  if p_nuevo_estado = 'abierta' and v_empresa_id is not null then
    update postulaciones
      set estado = 'enviada', updated_at = now()
      where obra_id = p_obra_id and estado = 'aceptada';
  end if;

  if v_empresa_id is not null
     and (v_estado_actual = 'cerrada' or p_nuevo_estado = 'cerrada') then
    select puntos_totales into v_puntos_tot
      from empresas_subcontratistas where id = v_empresa_id;

    v_nivel_nuevo := nivel_por_puntos(v_puntos_tot);

    if v_nivel_nuevo is distinct from v_nivel_anterior then
      update empresas_subcontratistas set nivel_partner = v_nivel_nuevo where id = v_empresa_id;

      if v_nivel_nuevo > v_nivel_anterior then
        perform crear_notificacion(
          v_empresa_id, 'nivel_subido',
          '¡Subes de nivel!',
          'Enhorabuena: ahora eres Socio ' || initcap(v_nivel_nuevo::text) || ' del Club OH Partner. Se desbloquean nuevas recompensas.',
          jsonb_build_object('nivel', v_nivel_nuevo)
        );
      end if;
    end if;
  end if;

  update obras set estado = p_nuevo_estado, updated_at = now() where id = p_obra_id;

  -- Webhook: uno por cada estado relevante para Odoo. 'cancelada' y
  -- 'adjudicada'/'en_curso'/'cerrada' son los que de verdad interesan para
  -- facturación/seguimiento; 'abierta' (reapertura) no dispara nada.
  if p_nuevo_estado in ('adjudicada', 'en_curso', 'cerrada', 'cancelada') then
    perform disparar_webhook(
      case p_nuevo_estado
        when 'adjudicada' then 'obra.adjudicada'
        when 'en_curso' then 'obra.en_curso'
        when 'cerrada' then 'obra.finalizada'
        when 'cancelada' then 'obra.cancelada'
      end,
      jsonb_build_object(
        'obra_id', p_obra_id,
        'obra_titulo', v_titulo,
        'empresa_id', v_empresa_id,
        'empresa_nombre', v_nombre_empresa,
        'puntos_acreditados', v_a_acreditar
      )
    );
  end if;
end;
$$;


grant execute on function cambiar_estado_obra(uuid, estado_obra) to authenticated;

create or replace function solicitar_canje(p_recompensa_id uuid)
returns canjes
language plpgsql
security definer
set search_path = public
as $$
declare
  c_obras_para_canje constant integer := 1;  -- antes 3: ahora se desbloquea desde la 1ª obra
  v_empresa_id uuid;
  v_nombre_empresa text;
  v_puntos_disponibles integer;
  v_obras_completadas integer;
  v_nivel nivel_partner;
  v_puntos_requeridos integer;
  v_activo boolean;
  v_nombre text;
  v_nivel_minimo nivel_partner;
  v_canje canjes;
begin
  v_empresa_id := auth_empresa_id();
  if v_empresa_id is null then
    raise exception 'El usuario no está vinculado a ninguna empresa';
  end if;

  select puntos_requeridos, activo, nombre, nivel_minimo
    into v_puntos_requeridos, v_activo, v_nombre, v_nivel_minimo
  from recompensas_catalogo
  where id = p_recompensa_id;

  if v_puntos_requeridos is null then
    raise exception 'Recompensa no encontrada';
  end if;
  if not v_activo then
    raise exception 'Esta recompensa ya no está disponible';
  end if;

  select puntos_disponibles, obras_completadas, nivel_partner, nombre
    into v_puntos_disponibles, v_obras_completadas, v_nivel, v_nombre_empresa
  from empresas_subcontratistas
  where id = v_empresa_id
  for update;

  if v_obras_completadas < c_obras_para_canje then
    raise exception 'El canje de puntos se desbloquea al completar % obras (llevas %)',
      c_obras_para_canje, v_obras_completadas;
  end if;
  if v_nivel < v_nivel_minimo then
    raise exception 'Esta recompensa requiere nivel %', initcap(v_nivel_minimo::text);
  end if;
  if v_puntos_disponibles < v_puntos_requeridos then
    raise exception 'No tienes suficientes puntos para este canje';
  end if;

  update empresas_subcontratistas
    set puntos_disponibles = puntos_disponibles - v_puntos_requeridos
    where id = v_empresa_id;

  insert into club_partner_movimientos (empresa_id, tipo, puntos, concepto)
  values (v_empresa_id, 'canje', -v_puntos_requeridos, 'Canje: ' || v_nombre);

  insert into canjes (empresa_id, recompensa_id, puntos_gastados, estado)
  values (v_empresa_id, p_recompensa_id, v_puntos_requeridos, 'pendiente')
  returning * into v_canje;

  perform disparar_webhook('canje.solicitado', jsonb_build_object(
    'canje_id', v_canje.id,
    'empresa_id', v_empresa_id,
    'empresa_nombre', v_nombre_empresa,
    'recompensa_id', p_recompensa_id,
    'recompensa_nombre', v_nombre,
    'puntos_gastados', v_puntos_requeridos
  ));

  return v_canje;
end;
$$;


grant execute on function solicitar_canje(uuid) to authenticated;

-- ============================================================================
-- 2. Borrado de cuenta (requisito de Google Play)
-- ============================================================================
-- Arregla primero una relación que, si no se toca, impediría borrar a
-- cualquier usuario que ya hubiera registrado algún avance de obra: la
-- fila de avances_obra se queda (es un dato de la obra, no personal), pero
-- deja de señalar a quién la escribió.
alter table avances_obra drop constraint if exists avances_obra_usuario_id_fkey;
alter table avances_obra add constraint avances_obra_usuario_id_fkey
  foreign key (usuario_id) references profiles (id) on delete set null;

-- Borra la cuenta del usuario que llama a la función (nunca la de otro:
-- siempre usa auth.uid(), nunca un id que venga como parámetro). Borrar la
-- fila de auth.users arrastra en cascada (on delete cascade, ya definido
-- desde 0001) el borrado de profiles — con él, nombre, teléfono, bio y
-- avatar — y de notificaciones/push_tokens (0016/0020).
--
-- Restringida a subcontratistas: el botón "Eliminar mi cuenta" solo existe
-- en el Perfil del subcontratista, sin ningún equivalente para el admin.
-- Este bloqueo es el que impide que, aun llamando a la función a mano (por
-- API, sin pasar por ningún botón), un admin se borre a sí mismo sin darse
-- cuenta de que podría quedarse sin nadie con acceso al panel. Si alguna
-- vez hace falta borrar una cuenta de admin, es un caso a mano en Supabase,
-- no algo para dejar en autoservicio.
--
-- Lo que NO se borra: la empresa (empresas_subcontratistas), sus obras,
-- postulaciones, puntos y canjes. Esos son datos del NEGOCIO/la empresa,
-- no datos personales de la persona que se da de baja, y OH Casas necesita
-- conservarlos igual que conservaría la contabilidad si un empleado se va.
--
-- Nota técnica: esta función solo puede borrar de auth.users porque se
-- crea con el usuario con el que se ejecuta este script en el SQL Editor
-- (normalmente con permisos de propietario del proyecto). Si al probarla
-- diera un error de permiso sobre auth.users, avisa: hay una alternativa
-- (una Edge Function con la service role key) que se monta aparte.
create or replace function eliminar_mi_cuenta()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role user_role;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  select role into v_role from profiles where id = v_uid;
  if v_role is distinct from 'subcontratista' then
    raise exception 'Esta función solo está disponible para cuentas de subcontratista. Para dar de baja una cuenta de administrador, hazlo directamente desde Supabase.';
  end if;

  delete from notificaciones where user_id = v_uid;
  delete from push_tokens where user_id = v_uid;

  delete from auth.users where id = v_uid;
end;
$$;

grant execute on function eliminar_mi_cuenta() to authenticated;