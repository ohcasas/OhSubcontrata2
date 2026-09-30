-- ============================================================================
-- 0016 — FASE A
--   1. Endurecimiento de permisos (3 agujeros de seguridad)
--   2. Notificaciones (bandeja dentro de la app; el push llegará en la fase B)
--   3. Guardar ofertas + recordatorios
--   4. Motivo de rechazo
--   5. Puntos: se ganan desde la 3ª obra; el rango depende de los puntos TOTALES
--   6. Recompensas por rango + gestión de canjes
-- Es re-ejecutable: todo usa "if not exists" / "or replace" / "drop if exists".
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. SEGURIDAD
-- ----------------------------------------------------------------------------

-- 1a) profiles: la política de UPDATE dejaba a cualquier usuario editar su fila
-- ENTERA, incluido `role` (hacerse admin) y `empresa_id` (colarse en otra
-- empresa y sus puntos). Ahora solo puede tocar estas cuatro columnas.
revoke update on profiles from anon, authenticated;
grant update (nombre_completo, telefono, bio, avatar_url) on profiles to authenticated;

drop policy if exists profiles_update_own on profiles;
create policy profiles_update_own on profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- 1b) postulaciones: se podía insertar una postulación ya con estado
-- 'aceptada', o a una obra cerrada. Ahora solo 'enviada' y a obras abiertas.
drop policy if exists postulaciones_insert on postulaciones;
create policy postulaciones_insert on postulaciones
  for insert with check (
    empresa_id = auth_empresa_id()
    and estado = 'enviada'
    and exists (select 1 from obras o where o.id = obra_id and o.estado = 'abierta')
  );

-- 1c) canjes: la propia empresa podía insertar canjes a mano, saltándose
-- solicitar_canje() (que es quien descuenta los puntos). Se quita: el canje
-- solo se crea por la función.
drop policy if exists canjes_insert on canjes;

-- 1d) documentos: la empresa solo puede subir documentos "pendiente de
-- revisión"; marcarlos como vigentes es cosa del admin.
drop policy if exists documentos_write on documentos_homologacion;
create policy documentos_write on documentos_homologacion
  for insert with check (
    (empresa_id = auth_empresa_id() and estado = 'pendiente_revision')
    or auth_role() in ('admin', 'superadmin')
  );

-- ----------------------------------------------------------------------------
-- 2. NOTIFICACIONES
-- ----------------------------------------------------------------------------
create table if not exists notificaciones (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles (id) on delete cascade,
  tipo text not null,
  titulo text not null,
  cuerpo text not null,
  datos jsonb not null default '{}'::jsonb,
  leida boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_notificaciones_user on notificaciones (user_id, created_at desc);

alter table notificaciones enable row level security;

drop policy if exists notificaciones_select on notificaciones;
create policy notificaciones_select on notificaciones
  for select using (user_id = auth.uid());

drop policy if exists notificaciones_update on notificaciones;
create policy notificaciones_update on notificaciones
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Nadie inserta desde la app; solo las funciones del servidor. Y lo único que
-- el usuario puede modificar de una notificación es marcarla como leída.
revoke insert, delete on notificaciones from anon, authenticated;
revoke update on notificaciones from anon, authenticated;
grant update (leida) on notificaciones to authenticated;

-- Crea la notificación para todos los usuarios de una empresa. Uso interno:
-- se quita el permiso de ejecución a los usuarios para que nadie pueda
-- mandarle notificaciones falsas a otro.
create or replace function crear_notificacion(
  p_empresa_id uuid,
  p_tipo text,
  p_titulo text,
  p_cuerpo text,
  p_datos jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into notificaciones (user_id, tipo, titulo, cuerpo, datos)
  select p.id, p_tipo, p_titulo, p_cuerpo, p_datos
  from profiles p
  where p.empresa_id = p_empresa_id;
end;
$$;

revoke execute on function crear_notificacion(uuid, text, text, text, jsonb) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. GUARDAR OFERTAS + RECORDATORIOS
-- ----------------------------------------------------------------------------
create table if not exists obras_guardadas (
  empresa_id uuid not null references empresas_subcontratistas (id) on delete cascade,
  obra_id uuid not null references obras (id) on delete cascade,
  recordatorio_72h boolean not null default false,
  recordatorio_24h boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (empresa_id, obra_id)
);

alter table obras_guardadas enable row level security;

drop policy if exists guardadas_select on obras_guardadas;
create policy guardadas_select on obras_guardadas
  for select using (empresa_id = auth_empresa_id());

drop policy if exists guardadas_insert on obras_guardadas;
create policy guardadas_insert on obras_guardadas
  for insert with check (empresa_id = auth_empresa_id());

drop policy if exists guardadas_delete on obras_guardadas;
create policy guardadas_delete on obras_guardadas
  for delete using (empresa_id = auth_empresa_id());

-- Recordatorio de ofertas guardadas que no se han postulado y están a punto
-- de cerrar: uno a las 72 h y otro a las 24 h (cada uno se manda una sola
-- vez). Lo ejecuta un programador cada hora (ver 0017).
create or replace function enviar_recordatorios_ofertas()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_horas numeric;
  v_enviados integer := 0;
begin
  for r in
    select g.empresa_id, g.obra_id, o.titulo, o.plazo_cierre,
           g.recordatorio_72h, g.recordatorio_24h
    from obras_guardadas g
    join obras o on o.id = g.obra_id
    where o.estado = 'abierta'
      and o.plazo_cierre is not null
      and o.plazo_cierre > now()
      and o.plazo_cierre <= now() + interval '72 hours'
      and not exists (
        select 1 from postulaciones p
        where p.obra_id = g.obra_id and p.empresa_id = g.empresa_id
      )
  loop
    v_horas := extract(epoch from (r.plazo_cierre - now())) / 3600;

    if v_horas <= 24 and not r.recordatorio_24h then
      perform crear_notificacion(
        r.empresa_id, 'recordatorio_oferta',
        'Última llamada: la licitación cierra pronto',
        'Queda menos de 24 horas para postular a «' || r.titulo || '», que tienes guardada.',
        jsonb_build_object('obra_id', r.obra_id)
      );
      update obras_guardadas set recordatorio_24h = true, recordatorio_72h = true
        where empresa_id = r.empresa_id and obra_id = r.obra_id;
      v_enviados := v_enviados + 1;
    elsif v_horas > 24 and not r.recordatorio_72h then
      perform crear_notificacion(
        r.empresa_id, 'recordatorio_oferta',
        'Una oferta guardada está a punto de cerrar',
        '«' || r.titulo || '» cierra en unas ' || round(v_horas)::int || ' horas. Todavía puedes postular.',
        jsonb_build_object('obra_id', r.obra_id)
      );
      update obras_guardadas set recordatorio_72h = true
        where empresa_id = r.empresa_id and obra_id = r.obra_id;
      v_enviados := v_enviados + 1;
    end if;
  end loop;

  return v_enviados;
end;
$$;

revoke execute on function enviar_recordatorios_ofertas() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. MOTIVO DE RECHAZO + AVISOS AL ACEPTAR / RECHAZAR
-- ----------------------------------------------------------------------------
alter table postulaciones add column if not exists motivo_rechazo text;

create or replace function notificar_cambio_postulacion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_titulo_obra text;
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
  elsif new.estado = 'rechazada' then
    perform crear_notificacion(
      new.empresa_id, 'postulacion_rechazada',
      'Postulación no seleccionada',
      'Tu postulación a «' || coalesce(v_titulo_obra, 'la obra') || '» no ha sido seleccionada. Motivo: '
        || coalesce(nullif(trim(new.motivo_rechazo), ''), 'no especificado') || '.',
      jsonb_build_object('obra_id', new.obra_id, 'postulacion_id', new.id)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notificar_postulacion on postulaciones;
create trigger trg_notificar_postulacion
  after update of estado on postulaciones
  for each row execute function notificar_cambio_postulacion();

-- aceptar_postulacion(): igual que la de 0014, pero las postulaciones que se
-- descartan automáticamente ahora llevan su motivo.
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
    return;
  end if;

  update postulaciones set estado = 'aceptada', updated_at = now()
    where id = p_postulacion_id;

  update postulaciones
    set estado = 'rechazada',
        motivo_rechazo = 'La obra se ha adjudicado a otra empresa',
        updated_at = now()
    where obra_id = v_obra_id
      and id <> p_postulacion_id
      and estado in ('enviada', 'en_revision');

  update obras set estado = 'adjudicada', updated_at = now()
    where id = v_obra_id and estado is distinct from 'adjudicada';
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. PUNTOS: RANGO POR PUNTOS TOTALES + PUNTOS DESDE LA 3ª OBRA
-- ----------------------------------------------------------------------------
-- puntos_disponibles = saldo canjeable (baja al canjear).
-- puntos_totales     = puntos ganados en total (NUNCA baja al canjear). El rango
--                      se calcula con este, para que gastar puntos no penalice.
alter table empresas_subcontratistas add column if not exists puntos_totales integer not null default 0;

-- Rellenado inicial: lo ganado según el libro de puntos, o el saldo actual si
-- es mayor (datos de prueba metidos a mano sin movimiento).
do $$
begin
  if not exists (
    select 1 from empresas_subcontratistas where puntos_totales > 0
  ) then
    update empresas_subcontratistas e
      set puntos_totales = greatest(
        coalesce((
          select sum(m.puntos) from club_partner_movimientos m
          where m.empresa_id = e.id and m.tipo in ('ganancia', 'ajuste')
        ), 0),
        e.puntos_disponibles
      );
  end if;
end $$;

-- Umbrales de rango (espejo de constants/niveles.ts en la app).
create or replace function nivel_por_puntos(p integer)
returns nivel_partner
language sql
immutable
as $$
  select case
    when p >= 5000 then 'platino'::nivel_partner
    when p >= 2500 then 'oro'::nivel_partner
    when p >= 1000 then 'plata'::nivel_partner
    else 'bronce'::nivel_partner
  end;
$$;

update empresas_subcontratistas
  set nivel_partner = nivel_por_puntos(puntos_totales)
  where nivel_partner is distinct from nivel_por_puntos(puntos_totales);

-- cambiar_estado_obra(): la de 0015, ahora con
--   * puntos solo a partir de la 3ª obra completada,
--   * puntos_totales y rango calculado sobre ellos,
--   * notificaciones (obra finalizada, obra revertida, subida de nivel),
--   * y sin revertir si la empresa ya canjeó esos puntos.
create or replace function cambiar_estado_obra(p_obra_id uuid, p_nuevo_estado estado_obra)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c_obras_para_puntos constant integer := 3;  -- se puntúa desde la 3ª obra
  c_dias_pago constant integer := 2;          -- plazo de pago anunciado al usuario
  v_estado_actual estado_obra;
  v_puntos_bonus integer;
  v_titulo text;
  v_empresa_id uuid;
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

  -- Salir de "cerrada": revertir lo acreditado.
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

  -- Entrar en "cerrada": acreditar (solo desde la 3ª obra) lo que falte.
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

  -- Reabrir a concurso: la postulación aceptada vuelve a estar pendiente.
  if p_nuevo_estado = 'abierta' and v_empresa_id is not null then
    update postulaciones
      set estado = 'enviada', updated_at = now()
      where obra_id = p_obra_id and estado = 'aceptada';
  end if;

  -- Rango: se calcula con los puntos TOTALES.
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
end;
$$;

grant execute on function cambiar_estado_obra(uuid, estado_obra) to authenticated;

-- ----------------------------------------------------------------------------
-- 6. RECOMPENSAS POR RANGO + GESTIÓN DE CANJES
-- ----------------------------------------------------------------------------
-- Cada recompensa tiene un nivel mínimo para poder canjearla. Por defecto se
-- deduce de su coste (mismos umbrales que los rangos); el admin lo ajusta
-- desde la pantalla de Recompensas.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'recompensas_catalogo' and column_name = 'nivel_minimo'
  ) then
    alter table recompensas_catalogo add column nivel_minimo nivel_partner not null default 'bronce';
    update recompensas_catalogo set nivel_minimo = nivel_por_puntos(puntos_requeridos);
  end if;
end $$;

-- solicitar_canje(): la de 0003 + (a) el Club se desbloquea al completar 3
-- obras y (b) la recompensa exige su nivel mínimo.
create or replace function solicitar_canje(p_recompensa_id uuid)
returns canjes
language plpgsql
security definer
set search_path = public
as $$
declare
  c_obras_para_canje constant integer := 3;
  v_empresa_id uuid;
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

  select puntos_disponibles, obras_completadas, nivel_partner
    into v_puntos_disponibles, v_obras_completadas, v_nivel
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

  return v_canje;
end;
$$;

grant execute on function solicitar_canje(uuid) to authenticated;

-- resolver_canje(): el admin marca un canje pendiente como completado
-- (entregado) o cancelado (se devuelven los puntos). Avisa a la empresa.
create or replace function resolver_canje(p_canje_id uuid, p_nuevo_estado estado_canje)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa_id uuid;
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

  select c.empresa_id, c.estado, c.puntos_gastados, r.nombre
    into v_empresa_id, v_estado_actual, v_puntos, v_nombre
    from canjes c
    join recompensas_catalogo r on r.id = c.recompensa_id
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
end;
$$;

grant execute on function resolver_canje(uuid, estado_canje) to authenticated;