-- ============================================================================
-- Webhooks salientes (para n8n → Odoo)
-- ============================================================================
-- Objetivo: dejar el "enganche" ya puesto en el código para que, cuando se
-- publique la app y se quiera automatizar con n8n, conectar Odoo sea pegar
-- una URL en una tabla — sin tocar ni una línea de código de la app ni de
-- estas funciones.
--
-- Cómo funciona:
--   1. `webhooks_config` guarda, por tipo de evento, la URL de n8n a la que
--      avisar (puede haber varias URLs para el mismo evento).
--   2. `disparar_webhook(evento, payload)` mira esa tabla y hace un POST con
--      el payload en JSON a cada URL activa para ese evento. Usa `pg_net`
--      (ya viene con Supabase), que es asíncrono: no espera respuesta ni
--      bloquea la transacción real.
--   3. Se ha enganchado una llamada a `disparar_webhook()` en cada punto
--      donde ya pasan estas cosas: alta de empresa, nueva postulación,
--      postulación aceptada/rechazada, obra adjudicada/en curso/finalizada/
--      cancelada, canje solicitado/completado/cancelado.
--   4. Mientras `webhooks_config` esté vacía (el estado por defecto), no se
--      envía nada — cero cambio de comportamiento hasta que se rellene.
--
-- Blindaje importante: un fallo de red, una URL caída o que la extensión
-- `pg_net` no esté activada NUNCA debe romper la acción real del usuario
-- (aceptar una postulación, finalizar una obra...). Por eso todo el cuerpo
-- de `disparar_webhook()` está protegido con `exception when others` — si
-- algo falla al avisar a n8n, se ignora en silencio y la operación de
-- negocio sigue su curso con normalidad.
--
-- Para conectar un evento con n8n más adelante, solo hay que ejecutar:
--   insert into webhooks_config (evento, url, secreto)
--   values ('obra.finalizada', 'https://<tu-n8n>/webhook/xxxx', 'un-secreto-largo');
-- El secreto (opcional) llega en la cabecera X-Webhook-Secret, para que el
-- workflow de n8n pueda comprobar que la llamada viene de verdad de Supabase.

create extension if not exists pg_net;

create table if not exists webhooks_config (
  id uuid primary key default uuid_generate_v4(),
  evento text not null,
  url text not null,
  secreto text,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table webhooks_config is
  'URLs de n8n a avisar por evento de negocio (integración con Odoo). Vacía por defecto: sin URLs configuradas, no se envía nada.';
comment on column webhooks_config.evento is
  'Identificador del evento, p.ej. "empresa.registrada", "postulacion.creada", "postulacion.aceptada", "postulacion.rechazada", "obra.adjudicada", "obra.en_curso", "obra.finalizada", "obra.cancelada", "canje.solicitado", "canje.completado", "canje.cancelado".';

alter table webhooks_config enable row level security;

drop policy if exists webhooks_config_admin on webhooks_config;
create policy webhooks_config_admin on webhooks_config
  for all using (auth_role() in ('admin', 'superadmin'))
  with check (auth_role() in ('admin', 'superadmin'));

-- Función central: dispara el webhook de un evento a todas sus URLs activas.
-- Uso interno de las funciones de negocio; no se expone a la app (revoke al final).
create or replace function disparar_webhook(p_evento text, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select url, secreto from webhooks_config where evento = p_evento and activo
  loop
    perform net.http_post(
      url := r.url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Webhook-Secret', coalesce(r.secreto, '')
      ),
      body := jsonb_build_object(
        'evento', p_evento,
        'fecha', now(),
        'datos', p_payload
      )
    );
  end loop;
exception
  when others then
    -- Un fallo aquí (pg_net no activada, URL caída, lo que sea) nunca debe
    -- tumbar la operación real del usuario. Se ignora en silencio.
    null;
end;
$$;

revoke execute on function disparar_webhook(text, jsonb) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- Enganches en las funciones de negocio ya existentes
-- ----------------------------------------------------------------------------

-- 1) Empresa registrada (0007_profiles_email.sql)
create or replace function handle_new_subcontratista()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre_empresa text;
  v_cif text;
  v_especialidad text;
  v_nombre_completo text;
  v_telefono text;
  v_empresa_id uuid;
begin
  v_nombre_empresa := new.raw_user_meta_data ->> 'nombre_empresa';
  v_cif := new.raw_user_meta_data ->> 'cif';
  v_especialidad := new.raw_user_meta_data ->> 'especialidad';
  v_nombre_completo := coalesce(new.raw_user_meta_data ->> 'nombre_completo', new.email);
  v_telefono := new.raw_user_meta_data ->> 'telefono';

  if v_nombre_empresa is null then
    return new;
  end if;

  if exists (select 1 from empresas_subcontratistas where cif = v_cif) then
    raise exception 'CIF_DUPLICADO';
  end if;

  insert into empresas_subcontratistas (nombre, cif, especialidad, homologado)
  values (v_nombre_empresa, v_cif, v_especialidad, false)
  returning id into v_empresa_id;

  insert into profiles (id, role, nombre_completo, telefono, email, empresa_id)
  values (new.id, 'subcontratista', v_nombre_completo, v_telefono, new.email, v_empresa_id);

  perform disparar_webhook('empresa.registrada', jsonb_build_object(
    'empresa_id', v_empresa_id,
    'nombre', v_nombre_empresa,
    'cif', v_cif,
    'especialidad', v_especialidad,
    'contacto_nombre', v_nombre_completo,
    'contacto_telefono', v_telefono,
    'contacto_email', new.email
  ));

  return new;
end;
$$;

-- 2) Nueva postulación recibida
create or replace function notificar_nueva_postulacion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_titulo_obra text;
  v_nombre_empresa text;
begin
  select titulo into v_titulo_obra from obras where id = new.obra_id;
  select nombre into v_nombre_empresa from empresas_subcontratistas where id = new.empresa_id;

  perform disparar_webhook('postulacion.creada', jsonb_build_object(
    'postulacion_id', new.id,
    'obra_id', new.obra_id,
    'obra_titulo', v_titulo_obra,
    'empresa_id', new.empresa_id,
    'empresa_nombre', v_nombre_empresa,
    'oferta_economica', new.oferta_economica
  ));

  return new;
end;
$$;

drop trigger if exists trg_notificar_nueva_postulacion on postulaciones;
create trigger trg_notificar_nueva_postulacion
  after insert on postulaciones
  for each row execute function notificar_nueva_postulacion();

-- 3) Postulación aceptada / rechazada (0016: notificar_cambio_postulacion)
create or replace function notificar_cambio_postulacion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_titulo_obra text;
  v_nombre_empresa text;
begin
  if new.estado is not distinct from old.estado then
    return new;
  end if;

  select titulo into v_titulo_obra from obras where id = new.obra_id;

  if new.estado = 'aceptada' then
    perform crear_notificacion(
      new.empresa_id, 'postulacion_aceptada',
      'Postulación aceptada',
      'Tu postulación a «' || coalesce(v_titulo_obra, 'la obra') || '» ha sido aceptada y la obra te ha sido adjudicada. Nos pondremos en contacto contigo por teléfono para coordinar los siguientes pasos.',
      jsonb_build_object('obra_id', new.obra_id, 'postulacion_id', new.id)
    );

    select nombre into v_nombre_empresa from empresas_subcontratistas where id = new.empresa_id;
    perform disparar_webhook('postulacion.aceptada', jsonb_build_object(
      'postulacion_id', new.id,
      'obra_id', new.obra_id,
      'obra_titulo', v_titulo_obra,
      'empresa_id', new.empresa_id,
      'empresa_nombre', v_nombre_empresa,
      'oferta_economica', new.oferta_economica
    ));
  elsif new.estado = 'rechazada' then
    perform crear_notificacion(
      new.empresa_id, 'postulacion_rechazada',
      'Postulación no seleccionada',
      'Tu postulación a «' || coalesce(v_titulo_obra, 'la obra') || '» no ha sido seleccionada. Motivo: '
        || coalesce(nullif(trim(new.motivo_rechazo), ''), 'no especificado') || '.',
      jsonb_build_object('obra_id', new.obra_id, 'postulacion_id', new.id)
    );

    select nombre into v_nombre_empresa from empresas_subcontratistas where id = new.empresa_id;
    perform disparar_webhook('postulacion.rechazada', jsonb_build_object(
      'postulacion_id', new.id,
      'obra_id', new.obra_id,
      'obra_titulo', v_titulo_obra,
      'empresa_id', new.empresa_id,
      'empresa_nombre', v_nombre_empresa,
      'motivo_rechazo', new.motivo_rechazo
    ));
  end if;

  return new;
end;
$$;

-- 4) Cambios de estado de obra (0016: cambiar_estado_obra) — se añade el
-- disparo de webhook justo al final, sobre el estado ya guardado, sin tocar
-- ninguna otra parte de la lógica de puntos/nivel ya existente.
create or replace function cambiar_estado_obra(p_obra_id uuid, p_nuevo_estado estado_obra)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c_obras_para_puntos constant integer := 3;
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

-- 5) Canje solicitado (0016: solicitar_canje)
create or replace function solicitar_canje(p_recompensa_id uuid)
returns canjes
language plpgsql
security definer
set search_path = public
as $$
declare
  c_obras_para_canje constant integer := 3;
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

-- 6) Canje resuelto (0016: resolver_canje)
create or replace function resolver_canje(p_canje_id uuid, p_nuevo_estado estado_canje)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa_id uuid;
  v_nombre_empresa text;
  v_estado_actual estado_canje;
  v_puntos integer;
  v_nombre text;
begin
  if auth_role() not in ('admin', 'superadmin') then
    raise exception 'No autorizado';
  end if;
  if p_nuevo_estado = 'pendiente' then
    raise exception 'Un canje solo puede resolverse como completado o cancelado';
  end if;

  select c.empresa_id, c.estado, c.puntos_gastados, r.nombre, e.nombre
    into v_empresa_id, v_estado_actual, v_puntos, v_nombre, v_nombre_empresa
    from canjes c
    join recompensas_catalogo r on r.id = c.recompensa_id
    join empresas_subcontratistas e on e.id = c.empresa_id
    where c.id = p_canje_id
    for update of c;

  if v_empresa_id is null then
    raise exception 'Canje no encontrado';
  end if;
  if v_estado_actual <> 'pendiente' then
    raise exception 'Este canje ya está resuelto';
  end if;

  update canjes set estado = p_nuevo_estado, updated_at = now() where id = p_canje_id;

  if p_nuevo_estado = 'cancelado' then
    update empresas_subcontratistas
      set puntos_disponibles = puntos_disponibles + v_puntos, updated_at = now()
      where id = v_empresa_id;

    insert into club_partner_movimientos (empresa_id, tipo, puntos, concepto)
    values (v_empresa_id, 'ajuste', v_puntos, 'Devolución: canje cancelado (' || v_nombre || ')');

    perform crear_notificacion(
      v_empresa_id, 'canje_cancelado',
      'Canje cancelado',
      'Tu canje «' || v_nombre || '» se ha cancelado y se te han devuelto ' || v_puntos || ' puntos.',
      jsonb_build_object('canje_id', p_canje_id)
    );
  else
    perform crear_notificacion(
      v_empresa_id, 'canje_completado',
      'Canje completado',
      'Tu canje «' || v_nombre || '» se ha completado.',
      jsonb_build_object('canje_id', p_canje_id)
    );
  end if;

  perform disparar_webhook(
    case p_nuevo_estado when 'completado' then 'canje.completado' else 'canje.cancelado' end,
    jsonb_build_object(
      'canje_id', p_canje_id,
      'empresa_id', v_empresa_id,
      'empresa_nombre', v_nombre_empresa,
      'recompensa_nombre', v_nombre,
      'puntos', v_puntos
    )
  );
end;
$$;