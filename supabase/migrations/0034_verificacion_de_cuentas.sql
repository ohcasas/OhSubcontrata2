-- ============================================================================
-- Verificación de cuentas: pendiente / verificada / suspendida
-- ============================================================================
-- Hasta ahora cualquiera podía registrarse como Arquitecto, Promotor, etc. y
-- usar la app sin que nadie lo comprobara, y el admin solo podía borrar cuentas.
--
-- Cómo funciona:
--   - profiles.estado_cuenta: 'pendiente' | 'verificada' | 'suspendida'.
--   - Las cuentas que YA existen quedan 'verificada' (la columna se crea con ese
--     valor, que rellena las filas actuales) y a partir de ahora lo NUEVO nace
--     'pendiente' (se cambia el valor por defecto después de crearla).
--   - admin y superadmin están siempre activos, sea cual sea su estado.
--   - Una cuenta no verificada NO puede: leer licitaciones, Tablón ni Directorio
--     (que tienen presupuestos de OH y datos de contacto), ni publicar, ni
--     postularse, ni recomendar clientes. Se aplica aquí, en la base de datos,
--     no solo en la pantalla: aunque alguien llame a la API a mano, no pasa.
--   - Suspender: lo anterior + se cierran sus sesiones + no puede volver a
--     iniciar sesión (auth.users.banned_until) + desaparece lo que había
--     publicado (Tablón, ficha del Directorio y sus licitaciones ABIERTAS; las
--     que están en marcha siguen visibles para las empresas implicadas).
--   - Los usuarios solo pueden editar 4 columnas de su perfil (0016), así que
--     nadie puede aprobarse a sí mismo editando estado_cuenta.
--   - Todo cambio queda en cuenta_historial (quién, cuándo, por qué).
--   - Una cuenta suspendida SÍ puede borrarse (derecho de supresión).
--
-- Limitación conocida: un usuario suspendido conserva su sesión hasta que caduca
-- su token (como mucho 1 hora por defecto en Supabase) para las funciones que no
-- llaman a exigir_cuenta_activa() (solicitar_canje, registrar_avance_obra); las
-- lecturas y publicaciones quedan bloqueadas al instante.
--
-- Se puede ejecutar más de una vez sin problema.

-- 1) Columnas
alter table profiles add column if not exists estado_cuenta text not null default 'verificada';
alter table profiles drop constraint if exists profiles_estado_cuenta_valido;
alter table profiles add constraint profiles_estado_cuenta_valido
  check (estado_cuenta in ('pendiente', 'verificada', 'suspendida'));
alter table profiles add column if not exists estado_cuenta_motivo text;
alter table profiles add column if not exists estado_cuenta_actualizado_en timestamptz;
alter table profiles add column if not exists estado_cuenta_actualizado_por uuid references profiles (id) on delete set null;
-- Lo que se cree a partir de ahora (cualquier registro) nace pendiente de verificar
alter table profiles alter column estado_cuenta set default 'pendiente';

create table if not exists cuenta_historial (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid not null references profiles (id) on delete cascade,
  estado_anterior text,
  estado_nuevo text not null,
  motivo text,
  hecho_por uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_cuenta_historial_profile on cuenta_historial (profile_id, created_at desc);
alter table cuenta_historial enable row level security;
drop policy if exists cuenta_historial_select_admin on cuenta_historial;
create policy cuenta_historial_select_admin on cuenta_historial
  for select using (auth_role() in ('admin', 'superadmin'));

-- 2) Funciones de apoyo
create or replace function cuenta_activa()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and exists (
    select 1 from profiles
    where id = auth.uid() and (estado_cuenta = 'verificada' or role in ('admin', 'superadmin'))
  );
$$;

create or replace function cuenta_verificada(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_id is not null and exists (
    select 1 from profiles
    where id = p_id and (estado_cuenta = 'verificada' or role in ('admin', 'superadmin'))
  );
$$;

create or replace function exigir_cuenta_activa()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_estado text;
  v_role user_role;
begin
  select estado_cuenta, role into v_estado, v_role from profiles where id = auth.uid();
  if v_role in ('admin', 'superadmin') or v_estado = 'verificada' then
    return;
  end if;
  if v_estado = 'suspendida' then
    raise exception 'Tu cuenta está suspendida.';
  end if;
  raise exception 'Tu cuenta está pendiente de verificación.';
end;
$$;

-- 3) Lectura: lo que ven las cuentas activas (y de quién)
-- 3a) Licitaciones. Las abiertas de una cuenta suspendida se ocultan, salvo a las
--     empresas que ya se habían postulado (para que su lista de postulaciones no se rompa).
--     El admin las ve siempre (por obras_admin_write).
drop policy if exists obras_select_authenticated on obras;
create policy obras_select_authenticated on obras
  for select using (
    (select cuenta_activa())
    and (
      estado <> 'abierta'
      or creado_por is null
      or cuenta_verificada(creado_por)
      or exists (select 1 from postulaciones p where p.obra_id = obras.id and p.empresa_id = auth_empresa_id())
    )
  );

-- 3b) Tablón
drop policy if exists publicaciones_tablon_select on publicaciones_tablon;
create policy publicaciones_tablon_select on publicaciones_tablon
  for select using ((select cuenta_activa()) and cuenta_verificada(autor_id));

-- 3c) Directorio
drop policy if exists fichas_directorio_select on fichas_directorio;
create policy fichas_directorio_select on fichas_directorio
  for select using ((select cuenta_activa()) and cuenta_verificada(profile_id));

-- 4) Escritura: solo cuentas activas
drop policy if exists publicaciones_tablon_insert on publicaciones_tablon;
create policy publicaciones_tablon_insert on publicaciones_tablon
  for insert with check (
    (select cuenta_activa())
    and autor_id = auth.uid()
    and (
      (tipo = 'necesidad' and auth_role() in ('promotor', 'constructora'))
      or (tipo = 'aviso' and auth_role() = 'administrador')
      or auth_role() in ('admin', 'superadmin')
    )
  );

drop policy if exists publicaciones_tablon_update_own on publicaciones_tablon;
create policy publicaciones_tablon_update_own on publicaciones_tablon
  for update
  using (autor_id = auth.uid() or auth_role() in ('admin', 'superadmin'))
  with check (
    (select cuenta_activa())
    and (
      auth_role() in ('admin', 'superadmin')
      or (
        autor_id = auth.uid()
        and (
          (tipo = 'necesidad' and auth_role() in ('promotor', 'constructora'))
          or (tipo = 'aviso' and auth_role() = 'administrador')
        )
      )
    )
  );

drop policy if exists fichas_directorio_write_own on fichas_directorio;
create policy fichas_directorio_write_own on fichas_directorio
  for all using (profile_id = auth.uid())
  with check (
    (select cuenta_activa())
    and profile_id = auth.uid()
    and auth_role() in ('proveedor', 'arquitecto', 'profesional')
    and rol = auth_role()
  );

drop policy if exists postulaciones_insert on postulaciones;
create policy postulaciones_insert on postulaciones
  for insert with check (
    (select cuenta_activa())
    and empresa_id = auth_empresa_id()
    and estado = 'enviada'
    and exists (
      select 1 from obras o
      where o.id = obra_id and o.estado = 'abierta' and o.creado_por is distinct from auth.uid()
    )
  );

-- 5) Las funciones que publican o deciden también lo exigen (mismo cuerpo que antes,
--    más una línea al principio: perform exigir_cuenta_activa();)
create or replace function crear_licitacion(
  p_titulo text,
  p_descripcion text,
  p_especialidad text,
  p_ubicacion text,
  p_presupuesto numeric,
  p_dias_abierta integer,
  p_requisitos text,
  p_duracion_dias integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_ref text;
  v_intentos integer := 0;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;
  perform exigir_cuenta_activa();
  if coalesce(auth_role()::text, '') not in ('promotor', 'constructora') then
    raise exception 'No autorizado';
  end if;

  if p_titulo is null or length(trim(p_titulo)) < 3 then
    raise exception 'Escribe un título para la licitación.';
  end if;
  if length(trim(p_titulo)) > 200 then
    raise exception 'El título es demasiado largo (máximo 200 caracteres).';
  end if;
  if length(coalesce(p_descripcion, '')) > 4000 or length(coalesce(p_requisitos, '')) > 2000 then
    raise exception 'La descripción o los requisitos son demasiado largos.';
  end if;
  if p_presupuesto is null or p_presupuesto <= 0 or p_presupuesto > 999999999 then
    raise exception 'Indica un presupuesto válido (mayor que cero).';
  end if;
  if p_dias_abierta is null or p_dias_abierta < 1 or p_dias_abierta > 90 then
    raise exception 'La licitación debe estar abierta entre 1 y 90 días.';
  end if;
  if p_duracion_dias is not null and (p_duracion_dias <= 0 or p_duracion_dias > 3650) then
    raise exception 'La duración estimada no es válida.';
  end if;

  -- Freno contra abuso: no se pueden acumular licitaciones abiertas sin límite.
  if (select count(*) from obras where creado_por = v_uid and estado = 'abierta') >= 10 then
    raise exception 'Ya tienes 10 licitaciones abiertas. Cierra o cancela alguna antes de publicar otra.';
  end if;

  loop
    v_intentos := v_intentos + 1;
    v_ref := 'LIC-' || to_char(now(), 'YYYY') || '-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    begin
      insert into obras (
        referencia, titulo, descripcion, especialidad_requerida, ubicacion,
        presupuesto, moneda, puntos_bonus, duracion_dias, plazo_cierre,
        estado, requisitos, creado_por
      ) values (
        v_ref, trim(p_titulo),
        nullif(trim(coalesce(p_descripcion, '')), ''),
        nullif(trim(coalesce(p_especialidad, '')), ''),
        nullif(trim(coalesce(p_ubicacion, '')), ''),
        p_presupuesto, 'EUR', 0, p_duracion_dias,
        now() + make_interval(days => p_dias_abierta),
        'abierta',
        nullif(trim(coalesce(p_requisitos, '')), ''),
        v_uid
      )
      returning id into v_id;
      exit;
    exception when unique_violation then
      if v_intentos >= 5 then
        raise;
      end if;
    end;
  end loop;

  return v_id;
end;
$$;

create or replace function mis_licitaciones()
returns table (
  id uuid, referencia text, titulo text, estado estado_obra, presupuesto numeric,
  plazo_cierre timestamptz, created_at timestamptz, n_postulaciones bigint, n_pendientes bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  perform exigir_cuenta_activa();
  return query
    select o.id, o.referencia, o.titulo, o.estado, o.presupuesto::numeric, o.plazo_cierre, o.created_at,
           (select count(*) from postulaciones p where p.obra_id = o.id),
           (select count(*) from postulaciones p where p.obra_id = o.id and p.estado in ('enviada', 'en_revision'))
    from obras o
    where o.creado_por = auth.uid()
    order by o.created_at desc;
end;
$$;

create or replace function postulaciones_de_mi_licitacion(p_obra_id uuid)
returns table (
  id uuid, estado estado_postulacion, oferta_economica numeric, telefono_contacto text,
  disponibilidad_equipo text, motivacion text, motivo_rechazo text, created_at timestamptz,
  empresa_nombre text, empresa_especialidad text, empresa_homologada boolean,
  empresa_rating numeric, empresa_obras_completadas integer, archivos jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  perform exigir_cuenta_activa();
  if not exists (select 1 from obras o where o.id = p_obra_id and o.creado_por = auth.uid()) then
    raise exception 'No autorizado';
  end if;
  return query
    select p.id, p.estado, p.oferta_economica::numeric, p.telefono_contacto,
           p.disponibilidad_equipo, p.motivacion, p.motivo_rechazo, p.created_at,
           e.nombre, e.especialidad, e.homologado,
           e.rating_medio::numeric, e.obras_completadas::integer,
           coalesce((
             select jsonb_agg(jsonb_build_object(
               'id', a.id, 'nombre_archivo', a.nombre_archivo,
               'storage_path', a.storage_path, 'tipo_mime', a.tipo_mime))
             from postulacion_archivos a where a.postulacion_id = p.id
           ), '[]'::jsonb)
    from postulaciones p
    join empresas_subcontratistas e on e.id = p.empresa_id
    where p.obra_id = p_obra_id
    order by (p.estado = 'aceptada') desc, p.oferta_economica asc;
end;
$$;

create or replace function aceptar_postulacion_propietario(p_postulacion_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_obra_id uuid;
  v_estado estado_postulacion;
  v_estado_obra estado_obra;
  v_creador uuid;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  perform exigir_cuenta_activa();

  select p.obra_id, p.estado into v_obra_id, v_estado
    from postulaciones p where p.id = p_postulacion_id for update;
  if v_obra_id is null then
    raise exception 'Postulación no encontrada';
  end if;

  select o.estado, o.creado_por into v_estado_obra, v_creador
    from obras o where o.id = v_obra_id for update;
  if v_creador is distinct from auth.uid() then
    raise exception 'No autorizado';
  end if;

  if v_estado = 'aceptada' then
    return;
  end if;
  if v_estado_obra <> 'abierta' then
    raise exception 'Esta licitación ya no está abierta.';
  end if;
  if v_estado not in ('enviada', 'en_revision') then
    raise exception 'Esta postulación ya estaba rechazada.';
  end if;

  update postulaciones set estado = 'aceptada', updated_at = now() where id = p_postulacion_id;

  update postulaciones
    set estado = 'rechazada',
        motivo_rechazo = 'La licitación se ha adjudicado a otra empresa',
        updated_at = now()
    where obra_id = v_obra_id and id <> p_postulacion_id and estado in ('enviada', 'en_revision');

  update obras set estado = 'adjudicada', updated_at = now() where id = v_obra_id;
end;
$$;

create or replace function rechazar_postulacion_propietario(p_postulacion_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_obra_id uuid;
  v_estado estado_postulacion;
  v_creador uuid;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  perform exigir_cuenta_activa();

  select p.obra_id, p.estado into v_obra_id, v_estado
    from postulaciones p where p.id = p_postulacion_id for update;
  if v_obra_id is null then
    raise exception 'Postulación no encontrada';
  end if;

  select o.creado_por into v_creador from obras o where o.id = v_obra_id;
  if v_creador is distinct from auth.uid() then
    raise exception 'No autorizado';
  end if;

  if p_motivo is null or length(trim(p_motivo)) < 3 then
    raise exception 'Escribe el motivo del rechazo (se le enviará a la empresa).';
  end if;
  if v_estado not in ('enviada', 'en_revision') then
    raise exception 'Solo se puede rechazar una postulación que esté pendiente.';
  end if;

  update postulaciones
    set estado = 'rechazada', motivo_rechazo = left(trim(p_motivo), 500), updated_at = now()
    where id = p_postulacion_id;
end;
$$;

create or replace function cambiar_estado_licitacion(p_obra_id uuid, p_nuevo_estado estado_obra)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_creador uuid;
  v_actual estado_obra;
  v_titulo text;
  v_empresa_id uuid;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  perform exigir_cuenta_activa();

  select o.creado_por, o.estado, o.titulo into v_creador, v_actual, v_titulo
    from obras o where o.id = p_obra_id for update;
  if v_actual is null then
    raise exception 'Licitación no encontrada';
  end if;
  if v_creador is distinct from auth.uid() then
    raise exception 'No autorizado';
  end if;

  if v_actual = p_nuevo_estado then
    return;
  end if;

  -- Adjudicar se hace aceptando una postulación, no desde aquí.
  if not (
       (v_actual = 'abierta'    and p_nuevo_estado = 'cancelada')
    or (v_actual = 'adjudicada' and p_nuevo_estado in ('en_curso', 'cancelada'))
    or (v_actual = 'en_curso'   and p_nuevo_estado in ('cerrada', 'cancelada'))
  ) then
    raise exception 'No se puede pasar la licitación de % a %.', v_actual, p_nuevo_estado;
  end if;

  if p_nuevo_estado = 'cancelada' then
    -- A las empresas (incluida la adjudicada) les llega el aviso por el disparador.
    update postulaciones
      set estado = 'rechazada', motivo_rechazo = 'El propietario ha cancelado la licitación', updated_at = now()
      where obra_id = p_obra_id and estado in ('enviada', 'en_revision', 'aceptada');
  end if;

  update obras set estado = p_nuevo_estado, updated_at = now() where id = p_obra_id;

  if p_nuevo_estado in ('en_curso', 'cerrada') then
    select p.empresa_id into v_empresa_id
      from postulaciones p where p.obra_id = p_obra_id and p.estado = 'aceptada' limit 1;
    if v_empresa_id is not null then
      perform crear_notificacion(
        v_empresa_id, 'obra_estado',
        case when p_nuevo_estado = 'en_curso' then 'Obra en curso' else 'Obra finalizada' end,
        'La obra «' || coalesce(v_titulo, 'la obra') || '» ha pasado a: '
          || case when p_nuevo_estado = 'en_curso' then 'En curso' else 'Finalizada' end || '.',
        jsonb_build_object('obra_id', p_obra_id)
      );
    end if;
  end if;
end;
$$;

create or replace function crear_referencia_comercial(
  p_nombre_cliente text,
  p_telefono_cliente text,
  p_email_cliente text,
  p_consentimiento boolean
)
returns referencias_comerciales
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_referencia referencias_comerciales;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;
  perform exigir_cuenta_activa();
  if trim(coalesce(p_nombre_cliente, '')) = '' then
    raise exception 'Indica el nombre de la persona que quiere construir';
  end if;
  if p_consentimiento is distinct from true then
    raise exception 'Hace falta confirmar que la persona referida ha dado su consentimiento para ser contactada';
  end if;

  insert into referencias_comerciales (referidor_id, nombre_cliente, telefono_cliente, email_cliente, consentimiento_obtenido)
  values (v_uid, trim(p_nombre_cliente), nullif(trim(coalesce(p_telefono_cliente, '')), ''), nullif(trim(coalesce(p_email_cliente, '')), ''), true)
  returning * into v_referencia;

  return v_referencia;
end;
$$;

create or replace function aceptar_recompensa_referido(p_recompensa_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_referidor_id uuid;
  v_estado text;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;
  perform exigir_cuenta_activa();

  select referidor_id, estado into v_referidor_id, v_estado
    from recompensas_referido
    where id = p_recompensa_id
    for update;

  if v_referidor_id is null then
    raise exception 'Recompensa no encontrada';
  end if;
  if v_referidor_id <> v_uid then
    raise exception 'No autorizado';
  end if;
  if v_estado <> 'pendiente' then
    raise exception 'Esta recompensa ya se ha resuelto';
  end if;

  update recompensas_referido set estado = 'aceptada', updated_at = now() where id = p_recompensa_id;
end;
$$;

-- 6) Cambiar el estado de una cuenta (solo admin)
create or replace function cambiar_estado_cuenta(p_profile_id uuid, p_nuevo_estado text, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := auth.uid();
  v_estado_ant text;
  v_role user_role;
  v_motivo text := nullif(trim(coalesce(p_motivo, '')), '');
  v_titulo text;
  v_cuerpo text;
begin
  if v_admin is null then
    raise exception 'No autenticado';
  end if;
  if coalesce(auth_role()::text, '') not in ('admin', 'superadmin') then
    raise exception 'No autorizado';
  end if;
  if p_nuevo_estado is null or p_nuevo_estado not in ('pendiente', 'verificada', 'suspendida') then
    raise exception 'Estado no válido';
  end if;
  if p_profile_id = v_admin then
    raise exception 'No puedes cambiar el estado de tu propia cuenta.';
  end if;

  select estado_cuenta, role into v_estado_ant, v_role from profiles where id = p_profile_id for update;
  if v_role is null then
    raise exception 'Cuenta no encontrada';
  end if;
  if v_role in ('admin', 'superadmin') then
    raise exception 'No se puede cambiar el estado de una cuenta de administración.';
  end if;
  if v_estado_ant = p_nuevo_estado then
    return;
  end if;
  if p_nuevo_estado = 'suspendida' and (v_motivo is null or length(v_motivo) < 3) then
    raise exception 'Escribe el motivo de la suspensión.';
  end if;

  update profiles
    set estado_cuenta = p_nuevo_estado,
        estado_cuenta_motivo = case when p_nuevo_estado = 'suspendida' then left(v_motivo, 500) else null end,
        estado_cuenta_actualizado_en = now(),
        estado_cuenta_actualizado_por = v_admin
    where id = p_profile_id;

  insert into cuenta_historial (profile_id, estado_anterior, estado_nuevo, motivo, hecho_por)
  values (p_profile_id, v_estado_ant, p_nuevo_estado, left(v_motivo, 500), v_admin);

  if p_nuevo_estado = 'suspendida' then
    -- No puede volver a entrar, y se cierran las sesiones que tenga abiertas.
    update auth.users set banned_until = 'infinity' where id = p_profile_id;
    delete from auth.sessions where user_id = p_profile_id;
  else
    update auth.users set banned_until = null where id = p_profile_id;
  end if;

  v_titulo := case p_nuevo_estado
    when 'verificada' then 'Cuenta verificada'
    when 'suspendida' then 'Cuenta suspendida'
    else 'Cuenta en revisión'
  end;
  v_cuerpo := case p_nuevo_estado
    when 'verificada' then 'Ya hemos verificado tu cuenta. ¡Bienvenido a OH Conecta!'
    when 'suspendida' then 'Tu cuenta ha sido suspendida. Motivo: ' || v_motivo || '. Si crees que es un error, escríbenos a software@ohcasas.es.'
    else 'Hemos vuelto a poner tu cuenta en revisión. Te avisaremos cuando esté verificada.'
  end;
  insert into notificaciones (user_id, tipo, titulo, cuerpo, datos)
  values (p_profile_id, 'cuenta_estado', v_titulo, v_cuerpo, jsonb_build_object('estado', p_nuevo_estado));
  begin
    perform enviar_push(p_profile_id, v_titulo, v_cuerpo, jsonb_build_object('estado', p_nuevo_estado));
  exception when others then
    null;  -- el aviso por push es un extra: si falla, el cambio de estado se mantiene
  end;
end;
$$;

-- 7) Avisar (webhook hacia n8n/Odoo) cuando se registra una cuenta pendiente de revisar.
--    Si el webhook falla, el registro NO se bloquea.
create or replace function avisar_cuenta_pendiente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.estado_cuenta = 'pendiente' and new.role not in ('admin', 'superadmin') then
    begin
      perform disparar_webhook('cuenta.pendiente', jsonb_build_object(
        'profile_id', new.id, 'rol', new.role, 'nombre', new.nombre_completo, 'email', new.email
      ));
    exception when others then
      null;
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_avisar_cuenta_pendiente on profiles;
create trigger trg_avisar_cuenta_pendiente
  after insert on profiles
  for each row execute function avisar_cuenta_pendiente();

-- Permisos de ejecución
revoke execute on function cuenta_activa() from public, anon;
revoke execute on function cuenta_verificada(uuid) from public, anon;
revoke execute on function exigir_cuenta_activa() from public, anon;
revoke execute on function cambiar_estado_cuenta(uuid, text, text) from public, anon;
grant execute on function cuenta_activa() to authenticated;
grant execute on function cuenta_verificada(uuid) to authenticated;
grant execute on function exigir_cuenta_activa() to authenticated;
grant execute on function cambiar_estado_cuenta(uuid, text, text) to authenticated;