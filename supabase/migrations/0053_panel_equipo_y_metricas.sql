-- ============================================================================
-- Panel: equipo de administración y métricas
-- ============================================================================
-- EQUIPO (solo superadmin puede dar de alta, cambiar o quitar administradores;
-- cualquier admin puede ver la lista):
--   panel_administradores()                 lista del equipo
--   panel_crear_admin(correo, nombre, rol)  da de alta a alguien como admin o superadmin
--   panel_cambiar_rol_admin(id, rol)        pasa a alguien de admin a superadmin o al revés
--   panel_quitar_admin(id)                  da de baja la cuenta de un administrador
-- Para dar de alta a una persona nueva, primero se crea su usuario en Supabase
-- (Authentication → Add user), igual que con los técnicos; después se le da el rol aquí.
-- Nadie puede cambiarse el rol ni quitarse a sí mismo, así que siempre queda
-- al menos un superadmin.
--
-- MÉTRICAS: panel_metricas() devuelve en una sola llamada las cifras de cuentas,
-- obras, referidos y club de puntos que muestra la sección Métricas.
-- Se puede ejecutar más de una vez sin problema.

create or replace function panel_exigir_superadmin()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  if coalesce(auth_role()::text, '') <> 'superadmin' then
    raise exception 'Solo un superadmin puede gestionar el equipo de administración.';
  end if;
end;
$$;
revoke execute on function panel_exigir_superadmin() from public, anon;
grant execute on function panel_exigir_superadmin() to authenticated;

create or replace function panel_administradores()
returns table (profile_id uuid, nombre_completo text, email text, role text, alta timestamptz, ultimo_acceso timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform panel_exigir_admin();
  return query
  select p.id, p.nombre_completo, coalesce(p.email, u.email::text), p.role::text, p.created_at, u.last_sign_in_at
  from profiles p
  left join auth.users u on u.id = p.id
  where p.role in ('admin', 'superadmin')
  order by (p.role = 'superadmin') desc, p.nombre_completo;
end;
$$;
revoke execute on function panel_administradores() from public, anon;
grant execute on function panel_administradores() to authenticated;

create or replace function panel_crear_admin(p_email text, p_nombre text, p_rol text default 'admin')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_role user_role;
  v_estado text;
  v_nombre text := nullif(btrim(coalesce(p_nombre, '')), '');
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  perform panel_exigir_superadmin();

  if p_rol not in ('admin', 'superadmin') then
    raise exception 'El rol tiene que ser admin o superadmin.';
  end if;

  select u.id into v_id from auth.users u where lower(u.email) = v_email;
  if v_id is null then
    raise exception 'No hay ninguna cuenta con ese correo. Créala antes en Supabase (Authentication → Add user).';
  end if;

  select role, estado_cuenta into v_role, v_estado from profiles where id = v_id;
  if found then
    if v_role in ('admin', 'superadmin') then
      raise exception 'Esa persona ya es administradora.';
    end if;
    if v_role <> 'subcontratista' or v_estado <> 'pendiente' then
      raise exception 'Esa cuenta ya se usa como cuenta de la app. Usa un correo nuevo para la persona administradora.';
    end if;
    update profiles
       set role = p_rol::user_role, estado_cuenta = 'verificada',
           nombre_completo = coalesce(v_nombre, nombre_completo)
     where id = v_id;
  else
    if v_nombre is null then
      raise exception 'Escribe el nombre de la persona.';
    end if;
    insert into profiles (id, role, nombre_completo, email, estado_cuenta)
    values (v_id, p_rol::user_role, v_nombre, v_email, 'verificada');
  end if;

  insert into registro_actividad (quien, accion, origen, profile_id, tipo, detalle)
  values (auth.uid(), 'equipo.alta', 'panel', v_id, p_rol, jsonb_build_object('correo', v_email, 'rol', p_rol));
  return v_id;
end;
$$;
revoke execute on function panel_crear_admin(text, text, text) from public, anon;
grant execute on function panel_crear_admin(text, text, text) to authenticated;

create or replace function panel_cambiar_rol_admin(p_profile_id uuid, p_rol text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role user_role;
begin
  perform panel_exigir_superadmin();
  if p_rol not in ('admin', 'superadmin') then
    raise exception 'El rol tiene que ser admin o superadmin.';
  end if;
  if p_profile_id = auth.uid() then
    raise exception 'No puedes cambiar tu propio rol.';
  end if;
  select role into v_role from profiles where id = p_profile_id;
  if v_role is null or v_role not in ('admin', 'superadmin') then
    raise exception 'Esa persona no es administradora.';
  end if;
  update profiles set role = p_rol::user_role where id = p_profile_id;
  insert into registro_actividad (quien, accion, origen, profile_id, tipo, detalle)
  values (auth.uid(), 'equipo.rol', 'panel', p_profile_id, p_rol, jsonb_build_object('rol_anterior', v_role::text, 'rol', p_rol));
end;
$$;
revoke execute on function panel_cambiar_rol_admin(uuid, text) from public, anon;
grant execute on function panel_cambiar_rol_admin(uuid, text) to authenticated;

create or replace function panel_quitar_admin(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role user_role;
  v_nombre text;
  v_email text;
begin
  perform panel_exigir_superadmin();
  if p_profile_id = auth.uid() then
    raise exception 'No puedes darte de baja a ti misma desde el panel.';
  end if;
  select role, nombre_completo, email into v_role, v_nombre, v_email from profiles where id = p_profile_id;
  if v_role is null or v_role not in ('admin', 'superadmin') then
    raise exception 'Esa persona no es administradora.';
  end if;

  insert into registro_actividad (quien, accion, origen, tipo, detalle)
  values (auth.uid(), 'equipo.baja', 'panel', v_role::text, jsonb_build_object('nombre', v_nombre, 'correo', v_email));

  delete from notificaciones where user_id = p_profile_id;
  delete from push_tokens where user_id = p_profile_id;
  delete from auth.users where id = p_profile_id;
end;
$$;
revoke execute on function panel_quitar_admin(uuid) from public, anon;
grant execute on function panel_quitar_admin(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Métricas
-- ---------------------------------------------------------------------------
create or replace function panel_metricas()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_meses timestamptz[];
  r jsonb;
begin
  perform panel_exigir_admin();

  select array_agg(m order by m) into v_meses
  from generate_series(date_trunc('month', now()) - interval '11 months', date_trunc('month', now()), interval '1 month') m;

  select jsonb_build_object(
    'cuentas', jsonb_build_object(
      'total', (select count(*) from profiles where role not in ('admin', 'superadmin')),
      'por_estado', (select coalesce(jsonb_object_agg(k, n), '{}'::jsonb)
                       from (select estado_cuenta as k, count(*) as n from profiles where role not in ('admin', 'superadmin') group by 1) x),
      'por_perfil', (select coalesce(jsonb_object_agg(k, n), '{}'::jsonb)
                       from (select role::text as k, count(*) as n from profiles where role not in ('admin', 'superadmin') group by 1) x),
      'horas_verificacion', (
        select round(avg(extract(epoch from (h.primera - p.created_at)) / 3600)::numeric, 1)
        from profiles p
        join lateral (select min(c.created_at) as primera from cuenta_historial c
                       where c.profile_id = p.id and c.estado_nuevo = 'verificada') h on true
        where p.role not in ('admin', 'superadmin', 'tecnico') and h.primera is not null and h.primera >= p.created_at),
      'altas_mes', (select jsonb_agg(jsonb_build_object('mes', to_char(m, 'YYYY-MM'),
                       'n', (select count(*) from profiles p where p.role not in ('admin', 'superadmin') and date_trunc('month', p.created_at) = m)) order by m)
                    from unnest(v_meses) m)
    ),
    'obras', jsonb_build_object(
      'por_estado', (select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) from (select estado::text as k, count(*) as n from obras group by 1) x),
      'por_origen', (select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) from (select coalesce(origen, 'empresa') as k, count(*) as n from obras group by 1) x),
      'publicadas_mes', (select jsonb_agg(jsonb_build_object('mes', to_char(m, 'YYYY-MM'),
                       'n', (select count(*) from obras o where date_trunc('month', o.created_at) = m)) order by m)
                    from unnest(v_meses) m),
      'postulaciones', (select count(*) from postulaciones),
      'postulaciones_aceptadas', (select count(*) from postulaciones where estado = 'aceptada'),
      'media_postulaciones_por_obra', (select round(count(*)::numeric / nullif((select count(*) from obras where coalesce(origen, 'empresa') = 'empresa'), 0), 1) from postulaciones),
      'presupuesto_en_marcha', (select coalesce(sum(presupuesto), 0) from obras where estado::text in ('adjudicada', 'en_curso')),
      'presupuesto_cerrado', (select coalesce(sum(presupuesto), 0) from obras where estado::text = 'cerrada'),
      'oferta_aceptada', (select coalesce(sum(oferta_economica), 0) from postulaciones where estado = 'aceptada')
    ),
    'referidos', jsonb_build_object(
      'total', (select count(*) from referencias_comerciales),
      'por_estado', (select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) from (select estado as k, count(*) as n from referencias_comerciales group by 1) x),
      'ventas', (select count(*) from referencias_comerciales where estado in ('venta', 'comision_disponible')),
      'importe_ventas', (select coalesce(sum(precio_venta), 0) from referencias_comerciales where estado in ('venta', 'comision_disponible')),
      'comisiones_n', (select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) from (select estado as k, count(*) as n from recompensas_referido group by 1) x),
      'comisiones_importe', (select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) from (select estado as k, sum(importe) as n from recompensas_referido group by 1) x)
    ),
    'club', jsonb_build_object(
      'canjes', (select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) from (select estado::text as k, count(*) as n from canjes group by 1) x),
      'puntos_canjeados', (select coalesce(sum(puntos_gastados), 0) from canjes where estado::text = 'completado'),
      'empresas_con_puntos', (select count(*) from empresas_subcontratistas where puntos_disponibles > 0)
    )
  ) into r;
  return r;
end;
$$;
revoke execute on function panel_metricas() from public, anon;
grant execute on function panel_metricas() to authenticated;