-- ============================================================================
-- Renovar documentos y gestionar trabajadores DESDE LA APP
-- ============================================================================
-- Requiere la 0040. No cambia nada de lo que ya funciona (la pantalla de cuenta pendiente sigue
-- usando mis_documentos_requeridos y registrar_documento_cuenta).
--
-- 1) RENOVACIONES. Una cuenta VERIFICADA puede subir documentos desde la app:
--      - si el documento aún no existe, se crea (pendiente de revisión);
--      - si está pendiente, rechazado o caducado, el archivo nuevo lo sustituye (pendiente de revisión);
--      - si está aprobado y le quedan 15 días o menos, el archivo nuevo se guarda como RENOVACIÓN
--        (columnas renov_*) y el documento antiguo SIGUE VIGENTE hasta que el equipo apruebe el nuevo;
--      - si está aprobado y le quedan más de 15 días, no se deja renovar todavía.
--    Al aprobar la renovación, el archivo antiguo pasa al historial y la caducidad se recalcula
--    (hoy + vigencia, o la fecha que ponga el equipo). Si se rechaza, el antiguo sigue vigente y la
--    cuenta recibe el motivo.
-- 2) TRABAJADORES. Cada cuenta da de alta a sus trabajadores y sube sus documentos. Solo ve y toca
--    los suyos (las funciones comprueban que la cuenta sea la dueña).
-- 3) PANEL. El panel ve las renovaciones pendientes en "Por revisar" y las aprueba o rechaza con
--    panel_resolver_renovacion().
--
-- Se puede ejecutar más de una vez sin problema.

-- ---------------------------------------------------------------------------
-- 0) Columnas de renovación pendiente
-- ---------------------------------------------------------------------------
alter table documentos_cuenta
  add column if not exists renov_nombre text,
  add column if not exists renov_path text,
  add column if not exists renov_mime text,
  add column if not exists renov_en timestamptz,
  add column if not exists renov_motivo text;
alter table documentos_trabajador
  add column if not exists renov_nombre text,
  add column if not exists renov_path text,
  add column if not exists renov_mime text,
  add column if not exists renov_en timestamptz,
  add column if not exists renov_motivo text;

-- ---------------------------------------------------------------------------
-- 1) Disparador: no duplicar el registro al aprobar una renovación y limpiar renovaciones obsoletas
-- ---------------------------------------------------------------------------
create or replace function trg_documento_ciclo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_origen text := case when tg_table_name = 'documentos_trabajador' then 'trabajador' else 'cuenta' end;
  v_trab uuid;
  v_profile uuid;
  v_vig integer;
begin
  if v_origen = 'trabajador' then
    v_trab := new.trabajador_id;
    select t.profile_id into v_profile from trabajadores t where t.id = v_trab;
  else
    v_profile := new.profile_id;
  end if;

  if tg_op = 'INSERT' then
    insert into registro_actividad (quien, accion, origen, documento_id, profile_id, trabajador_id, tipo, detalle)
    values (coalesce(auth.uid(), v_profile), 'documento_subido', v_origen, new.id, v_profile, v_trab, new.tipo,
            jsonb_build_object('archivo', new.nombre_archivo));
    return new;
  end if;

  -- Archivo nuevo en lugar de otro: se guarda el anterior y se borra la caducidad
  if new.storage_path is distinct from old.storage_path then
    insert into documentos_historial (origen, profile_id, trabajador_id, tipo, nombre_archivo, storage_path, estado,
                                      motivo_rechazo, revisado_por, revisado_en, caduca_en, subido_en)
    values (v_origen, v_profile, v_trab, old.tipo, old.nombre_archivo, old.storage_path, old.estado,
            old.motivo_rechazo, old.revisado_por, old.revisado_en, old.caduca_en, old.updated_at);
    if new.caduca_en is not distinct from old.caduca_en then
      new.caduca_en := null;
    end if;
    -- Si el archivo nuevo es la renovación que se acaba de aprobar, ya se registró al subirla
    if not (old.renov_path is not null and new.storage_path = old.renov_path) then
      insert into registro_actividad (quien, accion, origen, documento_id, profile_id, trabajador_id, tipo, detalle)
      values (coalesce(auth.uid(), v_profile), 'documento_subido', v_origen, new.id, v_profile, v_trab, new.tipo,
              jsonb_build_object('archivo', new.nombre_archivo, 'sustituye_a', old.nombre_archivo));
    end if;
    -- Si se cambia el archivo por otra vía, una renovación pendiente deja de tener sentido
    if old.renov_path is not null and new.renov_path is not distinct from old.renov_path then
      new.renov_nombre := null;
      new.renov_path := null;
      new.renov_mime := null;
      new.renov_en := null;
    end if;
  end if;

  if new.estado is distinct from old.estado and new.estado in ('aprobado', 'rechazado') then
    if new.estado = 'aprobado' and new.caduca_en is null then
      if v_origen = 'trabajador' then
        select r.vigencia_meses into v_vig from documentos_trabajador_requeridos r where r.tipo = new.tipo;
      else
        select r.vigencia_meses into v_vig
          from documentos_requeridos r join profiles p on p.role = r.role
          where p.id = new.profile_id and r.tipo = new.tipo;
      end if;
      v_vig := coalesce(v_vig, 2);
      if v_vig > 0 then
        new.caduca_en := (current_date + make_interval(months => v_vig))::date;
      end if;
    end if;
    insert into registro_actividad (quien, accion, origen, documento_id, profile_id, trabajador_id, tipo, detalle)
    values (coalesce(new.revisado_por, auth.uid()),
            case when new.estado = 'aprobado' then 'documento_aprobado' else 'documento_rechazado' end,
            v_origen, new.id, v_profile, v_trab, new.tipo,
            jsonb_build_object('motivo', new.motivo_rechazo, 'caduca_en', new.caduca_en));
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) Ayudas internas
-- ---------------------------------------------------------------------------
-- Cuenta verificada (para la política del almacén)
create or replace function cuenta_verificada()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and exists (
    select 1 from profiles where id = auth.uid() and estado_cuenta = 'verificada'
  );
$$;

-- Quien llama tiene que haber iniciado sesión con una cuenta verificada; devuelve su id
create or replace function app_exigir_cuenta_activa()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_estado text;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;
  select p.estado_cuenta into v_estado from profiles p where p.id = v_uid;
  if v_estado is distinct from 'verificada' then
    raise exception 'Tu cuenta tiene que estar verificada.';
  end if;
  return v_uid;
end;
$$;

-- Aviso (notificación + push) a todo el equipo
create or replace function avisar_equipo_documentos(p_titulo text, p_cuerpo text, p_datos jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin record;
begin
  for v_admin in select p.id from profiles p where p.role in ('admin', 'superadmin') loop
    begin
      insert into notificaciones (user_id, tipo, titulo, cuerpo, datos)
      values (v_admin.id, 'documento_renovado', p_titulo, p_cuerpo, coalesce(p_datos, '{}'::jsonb));
      begin
        perform enviar_push(v_admin.id, p_titulo, p_cuerpo, jsonb_build_object('tipo', 'documento_renovado'));
      exception when others then
        null;
      end;
    exception when others then
      null;
    end;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3) Almacén: una cuenta verificada puede subir a su propia carpeta
--    (la política de la 0036 solo deja subir mientras la cuenta está pendiente)
-- ---------------------------------------------------------------------------
drop policy if exists "documentos_verificacion_insert_verificada" on storage.objects;
create policy "documentos_verificacion_insert_verificada" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documentos-verificacion'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.cuenta_verificada()
  );

-- ---------------------------------------------------------------------------
-- 4) App: documentos de la cuenta
-- ---------------------------------------------------------------------------
create or replace function app_mis_documentos()
returns table (
  tipo text, etiqueta text, descripcion text, obligatorio boolean, orden integer, vigencia_meses integer,
  documento_id uuid, estado text, estado_real text, motivo_rechazo text, nombre_archivo text, storage_path text,
  caduca_en date, dias_restantes integer, puede_renovar boolean, renovacion_pendiente boolean, renovacion_motivo text
)
language plpgsql
stable
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
  select p.role into v_role from profiles p where p.id = v_uid;
  return query
    select r.tipo, r.etiqueta, r.descripcion, r.obligatorio, r.orden, r.vigencia_meses,
           d.id, d.estado, x.e, d.motivo_rechazo, d.nombre_archivo, d.storage_path,
           d.caduca_en,
           case when d.caduca_en is null then null else (d.caduca_en - current_date)::integer end,
           (x.e <> 'vigente' and d.renov_path is null),
           (d.renov_path is not null),
           d.renov_motivo
    from documentos_requeridos r
    left join documentos_cuenta d on d.profile_id = v_uid and d.tipo = r.tipo
    left join lateral (select panel_estado_doc(d.estado, d.caduca_en) as e) x on true
    where r.role = v_role
    order by r.orden, r.tipo;
end;
$$;

-- Subir un documento de la cuenta. Devuelve 'nuevo', 'reemplazo' o 'renovacion'.
create or replace function app_subir_documento_cuenta(p_tipo text, p_nombre text, p_ruta text, p_mime text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := app_exigir_cuenta_activa();
  v_role user_role;
  v_etiqueta text;
  v_quien text;
  v_nombre text := left(btrim(coalesce(p_nombre, '')), 200);
  d record;
  v_est text;
begin
  select p.role, p.nombre_completo into v_role, v_quien from profiles p where p.id = v_uid;
  select r.etiqueta into v_etiqueta from documentos_requeridos r where r.role = v_role and r.tipo = p_tipo;
  if v_etiqueta is null then
    raise exception 'Ese documento no se pide para tu tipo de cuenta.';
  end if;
  if p_ruta is null or left(p_ruta, length(v_uid::text) + 1) <> v_uid::text || '/' then
    raise exception 'Ruta de archivo no válida.';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'documentos-verificacion' and o.name = p_ruta) then
    raise exception 'No se encuentra el archivo subido.';
  end if;
  if v_nombre = '' then
    raise exception 'Falta el nombre del archivo.';
  end if;

  select x.id, x.estado, x.caduca_en, x.renov_path into d
    from documentos_cuenta x where x.profile_id = v_uid and x.tipo = p_tipo for update;

  if not found then
    insert into documentos_cuenta (profile_id, tipo, nombre_archivo, storage_path, tipo_mime)
    values (v_uid, p_tipo, v_nombre, p_ruta, p_mime);
    return 'nuevo';
  end if;

  v_est := panel_estado_doc(d.estado, d.caduca_en);
  if v_est = 'vigente' then
    if d.caduca_en is null then
      raise exception 'Este documento no caduca.';
    end if;
    raise exception 'Este documento está en vigor. Podrás renovarlo cuando falten 15 días o menos para que caduque.';
  end if;
  if d.renov_path is not null then
    raise exception 'Ya has subido una renovación y está en revisión.';
  end if;

  if v_est = 'por_caducar' then
    update documentos_cuenta
      set renov_nombre = v_nombre, renov_path = p_ruta, renov_mime = p_mime, renov_en = now(), renov_motivo = null
      where id = d.id;
    insert into registro_actividad (quien, accion, origen, documento_id, profile_id, tipo, detalle)
    values (v_uid, 'documento_subido', 'cuenta', d.id, v_uid, p_tipo,
            jsonb_build_object('archivo', v_nombre, 'renovacion', true));
    perform avisar_equipo_documentos(
      'Renovación de documento',
      coalesce(nullif(btrim(v_quien), ''), 'Una cuenta') || ' ha subido la renovación de ' || v_etiqueta || '.',
      jsonb_build_object('profile_id', v_uid, 'tipo_documento', p_tipo));
    return 'renovacion';
  end if;

  -- pendiente, rechazado o caducado: el archivo nuevo sustituye al anterior
  update documentos_cuenta
    set nombre_archivo = v_nombre, storage_path = p_ruta, tipo_mime = p_mime, estado = 'pendiente',
        motivo_rechazo = null, revisado_por = null, revisado_en = null, caduca_en = null,
        renov_nombre = null, renov_path = null, renov_mime = null, renov_en = null, renov_motivo = null,
        updated_at = now()
    where id = d.id;
  return 'reemplazo';
end;
$$;

-- ---------------------------------------------------------------------------
-- 5) App: trabajadores
-- ---------------------------------------------------------------------------
create or replace function app_mis_trabajadores()
returns table (
  id uuid, nombre text, apellidos text, dni text, puesto text, telefono text, email text, fecha_alta date,
  activo boolean, notas text, requeridos integer, aprobados integer, pendientes integer, rechazados integer,
  caducados integer, por_caducar integer, faltan integer, semaforo text, proxima_caducidad date
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;
  return query
  with filas as (
    select t.id as tid, r.obligatorio, d.caduca_en, panel_estado_doc(d.estado, d.caduca_en) as est
    from trabajadores t
    cross join documentos_trabajador_requeridos r
    left join documentos_trabajador d on d.trabajador_id = t.id and d.tipo = r.tipo
    where t.profile_id = v_uid
  ),
  agg as (
    select f.tid,
      (count(*) filter (where f.obligatorio))::integer as req,
      (count(*) filter (where f.obligatorio and f.est in ('vigente', 'por_caducar')))::integer as ok,
      (count(*) filter (where f.est = 'pendiente'))::integer as pend,
      (count(*) filter (where f.est = 'rechazado'))::integer as rech,
      (count(*) filter (where f.est = 'caducado'))::integer as cad,
      (count(*) filter (where f.est = 'por_caducar'))::integer as porcad,
      (count(*) filter (where f.obligatorio and f.est = 'faltante'))::integer as falt,
      min(f.caduca_en) filter (where f.est in ('vigente', 'por_caducar')) as prox
    from filas f group by f.tid
  )
  select t.id, t.nombre, t.apellidos, t.dni, t.puesto, t.telefono, t.email, t.fecha_alta, t.activo, t.notas,
         coalesce(a.req, 0), coalesce(a.ok, 0), coalesce(a.pend, 0), coalesce(a.rech, 0), coalesce(a.cad, 0),
         coalesce(a.porcad, 0), coalesce(a.falt, 0),
         case
           when coalesce(a.cad, 0) > 0 or coalesce(a.rech, 0) > 0 or coalesce(a.falt, 0) > 0 then 'rojo'
           when coalesce(a.pend, 0) > 0 or coalesce(a.porcad, 0) > 0 then 'ambar'
           else 'verde'
         end,
         a.prox
  from trabajadores t
  left join agg a on a.tid = t.id
  where t.profile_id = v_uid
  order by t.activo desc, t.apellidos nulls last, t.nombre;
end;
$$;

create or replace function app_guardar_trabajador(
  p_id uuid, p_nombre text, p_apellidos text, p_dni text, p_puesto text,
  p_telefono text, p_email text, p_fecha_alta date, p_activo boolean, p_notas text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := app_exigir_cuenta_activa();
  v_id uuid;
  v_dni text := upper(regexp_replace(coalesce(p_dni, ''), '[\s.-]', '', 'g'));
begin
  if nullif(btrim(coalesce(p_nombre, '')), '') is null then
    raise exception 'Escribe el nombre del trabajador.';
  end if;
  if v_dni !~ '^[A-Z0-9]{6,15}$' then
    raise exception 'Escribe un DNI o NIE válido.';
  end if;
  if p_id is null then
    if exists (select 1 from trabajadores t where t.profile_id = v_uid and t.dni = v_dni) then
      raise exception 'Ya tienes un trabajador con ese DNI.';
    end if;
    insert into trabajadores (profile_id, nombre, apellidos, dni, puesto, telefono, email, fecha_alta, activo, notas)
    values (v_uid, btrim(p_nombre), nullif(btrim(coalesce(p_apellidos, '')), ''), v_dni,
            nullif(btrim(coalesce(p_puesto, '')), ''), nullif(btrim(coalesce(p_telefono, '')), ''),
            nullif(btrim(coalesce(p_email, '')), ''), p_fecha_alta, coalesce(p_activo, true),
            nullif(btrim(coalesce(p_notas, '')), ''))
    returning id into v_id;
  else
    if exists (select 1 from trabajadores t where t.profile_id = v_uid and t.dni = v_dni and t.id <> p_id) then
      raise exception 'Ya tienes otro trabajador con ese DNI.';
    end if;
    update trabajadores set
      nombre = btrim(p_nombre), apellidos = nullif(btrim(coalesce(p_apellidos, '')), ''), dni = v_dni,
      puesto = nullif(btrim(coalesce(p_puesto, '')), ''), telefono = nullif(btrim(coalesce(p_telefono, '')), ''),
      email = nullif(btrim(coalesce(p_email, '')), ''), fecha_alta = p_fecha_alta,
      activo = coalesce(p_activo, true), notas = nullif(btrim(coalesce(p_notas, '')), ''), updated_at = now()
    where id = p_id and profile_id = v_uid
    returning id into v_id;
    if v_id is null then
      raise exception 'Trabajador no encontrado';
    end if;
  end if;
  return v_id;
end;
$$;

create or replace function app_documentos_trabajador(p_trabajador_id uuid)
returns table (
  tipo text, etiqueta text, descripcion text, obligatorio boolean, orden integer, vigencia_meses integer,
  documento_id uuid, estado text, estado_real text, motivo_rechazo text, nombre_archivo text, storage_path text,
  caduca_en date, dias_restantes integer, puede_renovar boolean, renovacion_pendiente boolean, renovacion_motivo text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;
  if not exists (select 1 from trabajadores t where t.id = p_trabajador_id and t.profile_id = v_uid) then
    raise exception 'Trabajador no encontrado';
  end if;
  return query
    select r.tipo, r.etiqueta, r.descripcion, r.obligatorio, r.orden, r.vigencia_meses,
           d.id, d.estado, x.e, d.motivo_rechazo, d.nombre_archivo, d.storage_path,
           d.caduca_en,
           case when d.caduca_en is null then null else (d.caduca_en - current_date)::integer end,
           (x.e <> 'vigente' and d.renov_path is null),
           (d.renov_path is not null),
           d.renov_motivo
    from documentos_trabajador_requeridos r
    left join documentos_trabajador d on d.trabajador_id = p_trabajador_id and d.tipo = r.tipo
    left join lateral (select panel_estado_doc(d.estado, d.caduca_en) as e) x on true
    order by r.orden, r.tipo;
end;
$$;

create or replace function app_subir_documento_trabajador(p_trabajador_id uuid, p_tipo text, p_nombre text, p_ruta text, p_mime text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := app_exigir_cuenta_activa();
  v_etiqueta text;
  v_nombre text := left(btrim(coalesce(p_nombre, '')), 200);
  v_trab text;
  v_quien text;
  d record;
  v_est text;
begin
  select btrim(t.nombre || ' ' || coalesce(t.apellidos, '')) into v_trab
    from trabajadores t where t.id = p_trabajador_id and t.profile_id = v_uid;
  if v_trab is null then
    raise exception 'Trabajador no encontrado';
  end if;
  select r.etiqueta into v_etiqueta from documentos_trabajador_requeridos r where r.tipo = p_tipo;
  if v_etiqueta is null then
    raise exception 'Ese documento no se pide a los trabajadores.';
  end if;
  if p_ruta is null or left(p_ruta, length(v_uid::text) + 1) <> v_uid::text || '/' then
    raise exception 'Ruta de archivo no válida.';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'documentos-verificacion' and o.name = p_ruta) then
    raise exception 'No se encuentra el archivo subido.';
  end if;
  if v_nombre = '' then
    raise exception 'Falta el nombre del archivo.';
  end if;
  select p.nombre_completo into v_quien from profiles p where p.id = v_uid;

  select x.id, x.estado, x.caduca_en, x.renov_path into d
    from documentos_trabajador x where x.trabajador_id = p_trabajador_id and x.tipo = p_tipo for update;

  if not found then
    insert into documentos_trabajador (trabajador_id, tipo, nombre_archivo, storage_path, tipo_mime)
    values (p_trabajador_id, p_tipo, v_nombre, p_ruta, p_mime);
    return 'nuevo';
  end if;

  v_est := panel_estado_doc(d.estado, d.caduca_en);
  if v_est = 'vigente' then
    if d.caduca_en is null then
      raise exception 'Este documento no caduca.';
    end if;
    raise exception 'Este documento está en vigor. Podrás renovarlo cuando falten 15 días o menos para que caduque.';
  end if;
  if d.renov_path is not null then
    raise exception 'Ya has subido una renovación y está en revisión.';
  end if;

  if v_est = 'por_caducar' then
    update documentos_trabajador
      set renov_nombre = v_nombre, renov_path = p_ruta, renov_mime = p_mime, renov_en = now(), renov_motivo = null
      where id = d.id;
    insert into registro_actividad (quien, accion, origen, documento_id, profile_id, trabajador_id, tipo, detalle)
    values (v_uid, 'documento_subido', 'trabajador', d.id, v_uid, p_trabajador_id, p_tipo,
            jsonb_build_object('archivo', v_nombre, 'renovacion', true));
    perform avisar_equipo_documentos(
      'Renovación de documento',
      coalesce(nullif(btrim(v_quien), ''), 'Una cuenta') || ' ha subido la renovación de ' || v_etiqueta || ' de ' || v_trab || '.',
      jsonb_build_object('profile_id', v_uid, 'trabajador_id', p_trabajador_id, 'tipo_documento', p_tipo));
    return 'renovacion';
  end if;

  update documentos_trabajador
    set nombre_archivo = v_nombre, storage_path = p_ruta, tipo_mime = p_mime, estado = 'pendiente',
        motivo_rechazo = null, revisado_por = null, revisado_en = null, caduca_en = null,
        renov_nombre = null, renov_path = null, renov_mime = null, renov_en = null, renov_motivo = null,
        updated_at = now()
    where id = d.id;
  return 'reemplazo';
end;
$$;

-- ---------------------------------------------------------------------------
-- 6) Panel: ver y resolver renovaciones
-- ---------------------------------------------------------------------------
drop function if exists panel_documentos_cuenta(uuid);
create function panel_documentos_cuenta(p_profile_id uuid)
returns table (
  tipo text, etiqueta text, descripcion text, obligatorio boolean, vigencia_meses integer, documento_id uuid,
  nombre_archivo text, storage_path text, tipo_mime text, estado text, estado_real text, motivo_rechazo text,
  caduca_en date, subido_en timestamptz,
  renov_nombre text, renov_path text, renov_mime text, renov_en timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role user_role;
begin
  perform panel_exigir_admin();
  select p.role into v_role from profiles p where p.id = p_profile_id;
  return query
    select r.tipo, r.etiqueta, r.descripcion, r.obligatorio, r.vigencia_meses, d.id,
           d.nombre_archivo, d.storage_path, d.tipo_mime, d.estado, panel_estado_doc(d.estado, d.caduca_en),
           d.motivo_rechazo, d.caduca_en, d.updated_at,
           d.renov_nombre, d.renov_path, d.renov_mime, d.renov_en
    from documentos_requeridos r
    left join documentos_cuenta d on d.profile_id = p_profile_id and d.tipo = r.tipo
    where r.role = v_role
    order by r.orden, r.tipo;
end;
$$;

drop function if exists panel_documentos_trabajador(uuid);
create function panel_documentos_trabajador(p_trabajador_id uuid)
returns table (
  tipo text, etiqueta text, descripcion text, obligatorio boolean, vigencia_meses integer, documento_id uuid,
  nombre_archivo text, storage_path text, tipo_mime text, estado text, estado_real text, motivo_rechazo text,
  caduca_en date, subido_en timestamptz,
  renov_nombre text, renov_path text, renov_mime text, renov_en timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform panel_exigir_admin();
  return query
    select r.tipo, r.etiqueta, r.descripcion, r.obligatorio, r.vigencia_meses, d.id,
           d.nombre_archivo, d.storage_path, d.tipo_mime, d.estado, panel_estado_doc(d.estado, d.caduca_en),
           d.motivo_rechazo, d.caduca_en, d.updated_at,
           d.renov_nombre, d.renov_path, d.renov_mime, d.renov_en
    from documentos_trabajador_requeridos r
    left join documentos_trabajador d on d.trabajador_id = p_trabajador_id and d.tipo = r.tipo
    order by r.orden, r.tipo;
end;
$$;

-- Cola de revisión: lo pendiente y las renovaciones pendientes, lo más antiguo primero
drop function if exists panel_cola_revision();
create function panel_cola_revision()
returns table (
  origen text, documento_id uuid, profile_id uuid, trabajador_id uuid, cuenta text, empresa text,
  trabajador text, tipo text, etiqueta text, nombre_archivo text, storage_path text, subido_en timestamptz,
  renovacion boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform panel_exigir_admin();
  return query
    select x.origen, x.documento_id, x.profile_id, x.trabajador_id, x.cuenta, x.empresa, x.trabajador,
           x.tipo, x.etiqueta, x.nombre_archivo, x.storage_path, x.subido_en, x.renovacion
    from (
      select 'cuenta'::text as origen, d.id as documento_id, d.profile_id, null::uuid as trabajador_id,
             p.nombre_completo as cuenta, e.nombre as empresa, null::text as trabajador, d.tipo,
             coalesce(r.etiqueta, d.tipo) as etiqueta, d.nombre_archivo, d.storage_path, d.updated_at as subido_en,
             false as renovacion
        from documentos_cuenta d
        join profiles p on p.id = d.profile_id
        left join empresas_subcontratistas e on e.id = p.empresa_id
        left join documentos_requeridos r on r.role = p.role and r.tipo = d.tipo
        where d.estado = 'pendiente'
      union all
      select 'cuenta', d.id, d.profile_id, null::uuid, p.nombre_completo, e.nombre, null::text, d.tipo,
             coalesce(r.etiqueta, d.tipo), d.renov_nombre, d.renov_path, d.renov_en, true
        from documentos_cuenta d
        join profiles p on p.id = d.profile_id
        left join empresas_subcontratistas e on e.id = p.empresa_id
        left join documentos_requeridos r on r.role = p.role and r.tipo = d.tipo
        where d.renov_path is not null
      union all
      select 'trabajador', d.id, t.profile_id, t.id, p.nombre_completo, e.nombre,
             btrim(t.nombre || ' ' || coalesce(t.apellidos, '')), d.tipo,
             coalesce(r.etiqueta, d.tipo), d.nombre_archivo, d.storage_path, d.updated_at, false
        from documentos_trabajador d
        join trabajadores t on t.id = d.trabajador_id
        join profiles p on p.id = t.profile_id
        left join empresas_subcontratistas e on e.id = p.empresa_id
        left join documentos_trabajador_requeridos r on r.tipo = d.tipo
        where d.estado = 'pendiente'
      union all
      select 'trabajador', d.id, t.profile_id, t.id, p.nombre_completo, e.nombre,
             btrim(t.nombre || ' ' || coalesce(t.apellidos, '')), d.tipo,
             coalesce(r.etiqueta, d.tipo), d.renov_nombre, d.renov_path, d.renov_en, true
        from documentos_trabajador d
        join trabajadores t on t.id = d.trabajador_id
        join profiles p on p.id = t.profile_id
        left join empresas_subcontratistas e on e.id = p.empresa_id
        left join documentos_trabajador_requeridos r on r.tipo = d.tipo
        where d.renov_path is not null
    ) x
    order by x.subido_en;
end;
$$;

-- Contadores de la portada (por revisar incluye las renovaciones)
create or replace function panel_resumen()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  perform panel_exigir_admin();
  select jsonb_build_object(
    'cuentas', (select count(*) from panel_empresas()),
    'rojo', (select count(*) from panel_empresas() e where e.semaforo = 'rojo'),
    'ambar', (select count(*) from panel_empresas() e where e.semaforo = 'ambar'),
    'verde', (select count(*) from panel_empresas() e where e.semaforo = 'verde'),
    'cuentas_pendientes', (select count(*) from profiles p where p.estado_cuenta = 'pendiente' and p.role not in ('admin', 'superadmin')),
    'trabajadores', (select count(*) from trabajadores t where t.activo),
    'por_revisar', (select count(*) from documentos_cuenta where estado = 'pendiente' or renov_path is not null)
                 + (select count(*) from documentos_trabajador where estado = 'pendiente' or renov_path is not null),
    'caducados', (select count(*) from documentos_cuenta where estado = 'aprobado' and caduca_en < current_date)
               + (select count(*) from documentos_trabajador where estado = 'aprobado' and caduca_en < current_date),
    'caducan_pronto', (select count(*) from documentos_cuenta where estado = 'aprobado' and caduca_en between current_date and current_date + 15)
                    + (select count(*) from documentos_trabajador where estado = 'aprobado' and caduca_en between current_date and current_date + 15)
  ) into v;
  return v;
end;
$$;

-- Aprobar o rechazar una renovación (de cuenta o de trabajador)
create or replace function panel_resolver_renovacion(p_origen text, p_documento_id uuid, p_aprobar boolean,
                                                     p_motivo text default null, p_caduca_en date default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := auth.uid();
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_profile uuid;
  v_trab uuid;
  v_tipo text;
  v_path text;
  v_etiqueta text;
  v_vig integer;
  v_fecha date;
  v_quien text;
  v_titulo text;
  v_cuerpo text;
begin
  perform panel_exigir_admin();
  if p_aprobar is null then
    raise exception 'Indica si apruebas o rechazas la renovación.';
  end if;
  if p_origen not in ('cuenta', 'trabajador') then
    raise exception 'Origen no válido.';
  end if;
  if not p_aprobar and (v_motivo is null or length(v_motivo) < 3) then
    raise exception 'Escribe el motivo del rechazo (se le enviará a la cuenta).';
  end if;

  if p_origen = 'cuenta' then
    select d.profile_id, d.tipo, d.renov_path into v_profile, v_tipo, v_path
      from documentos_cuenta d where d.id = p_documento_id for update;
    select r.etiqueta, r.vigencia_meses into v_etiqueta, v_vig
      from documentos_requeridos r join profiles p on p.role = r.role
      where p.id = v_profile and r.tipo = v_tipo;
  else
    select t.profile_id, t.id, d.tipo, d.renov_path,
           btrim(t.nombre || ' ' || coalesce(t.apellidos, ''))
      into v_profile, v_trab, v_tipo, v_path, v_quien
      from documentos_trabajador d join trabajadores t on t.id = d.trabajador_id
      where d.id = p_documento_id for update of d;
    select r.etiqueta, r.vigencia_meses into v_etiqueta, v_vig
      from documentos_trabajador_requeridos r where r.tipo = v_tipo;
  end if;
  if v_profile is null then
    raise exception 'Documento no encontrado';
  end if;
  if v_path is null then
    raise exception 'Este documento no tiene ninguna renovación pendiente.';
  end if;
  v_etiqueta := coalesce(v_etiqueta, v_tipo);
  v_vig := coalesce(v_vig, 2);

  if p_aprobar then
    v_fecha := coalesce(p_caduca_en, case when v_vig > 0 then (current_date + make_interval(months => v_vig))::date end);
    if p_origen = 'cuenta' then
      -- 1) el archivo nuevo pasa a ser el vigente (el disparador archiva el anterior)
      update documentos_cuenta
        set nombre_archivo = renov_nombre, storage_path = renov_path, tipo_mime = renov_mime, estado = 'aprobado',
            motivo_rechazo = null, revisado_por = v_admin, revisado_en = now(),
            renov_nombre = null, renov_path = null, renov_mime = null, renov_en = null, renov_motivo = null,
            updated_at = now()
        where id = p_documento_id;
      -- 2) la caducidad nueva (aparte, porque el disparador borra la caducidad al cambiar de archivo)
      update documentos_cuenta set caduca_en = v_fecha where id = p_documento_id;
    else
      update documentos_trabajador
        set nombre_archivo = renov_nombre, storage_path = renov_path, tipo_mime = renov_mime, estado = 'aprobado',
            motivo_rechazo = null, revisado_por = v_admin, revisado_en = now(),
            renov_nombre = null, renov_path = null, renov_mime = null, renov_en = null, renov_motivo = null,
            updated_at = now()
        where id = p_documento_id;
      update documentos_trabajador set caduca_en = v_fecha where id = p_documento_id;
    end if;
    insert into registro_actividad (quien, accion, origen, documento_id, profile_id, trabajador_id, tipo, detalle)
    values (v_admin, 'documento_aprobado', p_origen, p_documento_id, v_profile, v_trab, v_tipo,
            jsonb_build_object('caduca_en', v_fecha, 'renovacion', true));
    v_titulo := 'Renovación aprobada';
    v_cuerpo := v_etiqueta || case when v_quien is null then '' else ' de ' || v_quien end
                || ': renovación aprobada' || case when v_fecha is null then '.' else '. Vale hasta el ' || to_char(v_fecha, 'DD/MM/YYYY') || '.' end;
  else
    if p_origen = 'cuenta' then
      update documentos_cuenta
        set renov_nombre = null, renov_path = null, renov_mime = null, renov_en = null,
            renov_motivo = left(v_motivo, 500), updated_at = now()
        where id = p_documento_id;
    else
      update documentos_trabajador
        set renov_nombre = null, renov_path = null, renov_mime = null, renov_en = null,
            renov_motivo = left(v_motivo, 500), updated_at = now()
        where id = p_documento_id;
    end if;
    insert into registro_actividad (quien, accion, origen, documento_id, profile_id, trabajador_id, tipo, detalle)
    values (v_admin, 'documento_rechazado', p_origen, p_documento_id, v_profile, v_trab, v_tipo,
            jsonb_build_object('motivo', left(v_motivo, 500), 'renovacion', true));
    v_titulo := 'Renovación rechazada';
    v_cuerpo := v_etiqueta || case when v_quien is null then '' else ' de ' || v_quien end
                || ': ' || v_motivo || '. El documento anterior sigue vigente; sube la renovación de nuevo.';
  end if;

  begin
    insert into notificaciones (user_id, tipo, titulo, cuerpo, datos)
    values (v_profile, case when p_aprobar then 'documento_aprobado' else 'documento_rechazado' end, v_titulo, v_cuerpo,
            jsonb_build_object('tipo_documento', v_tipo));
    begin
      perform enviar_push(v_profile, v_titulo, v_cuerpo,
                          jsonb_build_object('tipo', case when p_aprobar then 'documento_aprobado' else 'documento_rechazado' end));
    exception when others then
      null;
    end;
  exception when others then
    null;
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7) Avisos de caducidad: no avisar de lo que ya tiene una renovación en revisión
-- ---------------------------------------------------------------------------
create or replace function avisar_caducidades()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  f record;
  v_umbral integer;
  v_dias integer;
  v_filas integer;
  v_total integer := 0;
  v_titulo text;
  v_cuerpo text;
  v_quien text;
begin
  for f in
    select 'cuenta'::text as origen, d.id as documento_id, d.profile_id, null::uuid as trabajador_id, d.tipo, d.caduca_en,
           coalesce(r.etiqueta, d.tipo) as etiqueta, null::text as trabajador
      from documentos_cuenta d
      join profiles p on p.id = d.profile_id
      left join documentos_requeridos r on r.role = p.role and r.tipo = d.tipo
      where d.estado = 'aprobado' and d.renov_path is null and d.caduca_en is not null and d.caduca_en <= current_date + 15
    union all
    select 'trabajador', d.id, t.profile_id, t.id, d.tipo, d.caduca_en, coalesce(r.etiqueta, d.tipo),
           btrim(t.nombre || ' ' || coalesce(t.apellidos, ''))
      from documentos_trabajador d
      join trabajadores t on t.id = d.trabajador_id
      left join documentos_trabajador_requeridos r on r.tipo = d.tipo
      where d.estado = 'aprobado' and d.renov_path is null and t.activo and d.caduca_en is not null and d.caduca_en <= current_date + 15
  loop
    v_dias := f.caduca_en - current_date;
    v_umbral := case when v_dias <= 0 then 0 when v_dias <= 7 then 7 else 15 end;
    insert into avisos_caducidad (origen, documento_id, caduca_en, umbral)
    values (f.origen, f.documento_id, f.caduca_en, v_umbral)
    on conflict do nothing;
    get diagnostics v_filas = row_count;
    if v_filas = 0 then
      continue;
    end if;
    v_total := v_total + 1;
    v_quien := case when f.trabajador is null then f.etiqueta else f.etiqueta || ' de ' || f.trabajador end;
    v_titulo := case when v_dias <= 0 then 'Documento caducado' else 'Documento a punto de caducar' end;
    v_cuerpo := v_quien || case
      when v_dias < 0 then ' caducó el ' || to_char(f.caduca_en, 'DD/MM/YYYY') || '. Hay que renovarlo.'
      when v_dias = 0 then ' caduca hoy. Hay que renovarlo.'
      else ' caduca el ' || to_char(f.caduca_en, 'DD/MM/YYYY') || ' (en ' || v_dias || ' días).'
    end;
    begin
      insert into notificaciones (user_id, tipo, titulo, cuerpo, datos)
      values (f.profile_id, 'documento_caducidad', v_titulo, v_cuerpo,
              jsonb_build_object('tipo_documento', f.tipo, 'caduca_en', f.caduca_en));
      begin
        perform enviar_push(f.profile_id, v_titulo, v_cuerpo, jsonb_build_object('tipo', 'documento_caducidad'));
      exception when others then
        null;
      end;
    exception when others then
      null;
    end;
    perform disparar_webhook('documento.caduca', jsonb_build_object(
      'origen', f.origen, 'profile_id', f.profile_id, 'trabajador_id', f.trabajador_id, 'tipo', f.tipo,
      'documento', v_quien, 'caduca_en', f.caduca_en, 'dias_restantes', v_dias
    ));
  end loop;
  return v_total;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8) Permisos
-- ---------------------------------------------------------------------------
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as firma
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and (p.proname like 'panel\_%' or p.proname like 'app\_%')
  loop
    execute format('revoke all on function %s from public, anon', f.firma);
    execute format('grant execute on function %s to authenticated', f.firma);
  end loop;
end;
$$;
revoke all on function avisar_caducidades() from public, anon, authenticated;
revoke all on function avisar_equipo_documentos(text, text, jsonb) from public, anon, authenticated;