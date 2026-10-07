-- ============================================================================
-- Alta por perfil: formulario propio de cada tipo de cuenta + documentación obligatoria
-- ============================================================================
-- Cada perfil tiene su formulario de registro (un arquitecto pide nº de colegiado y
-- colegio; una constructora, su inscripción en el REA...) y una lista de documentos
-- que hay que subir para poder verificarla. Las dos listas son TABLAS EDITABLES:
-- cambiar lo que se pide a un perfil es una línea de SQL, sin recompilar la app.
--
-- Flujo en dos tiempos (hay una razón técnica): al registrarse la persona aún no ha
-- confirmado su correo, así que no tiene sesión y el almacén no admite subidas.
--   1) Alta: formulario del perfil -> los datos viajan con el registro y se guardan.
--   2) Al confirmar el correo e iniciar sesión, su pantalla de "en revisión" le pide
--      los documentos obligatorios; el admin los revisa uno a uno.
--
-- Verificar una cuenta nueva exige tener APROBADOS los documentos obligatorios de su
-- perfil; el admin puede saltárselo (cambiar_estado_cuenta con p_forzar) dejando el
-- motivo escrito en el historial. Las cuentas que YA estaban verificadas no se tocan.
--
-- Los datos y documentos de partida son una PROPUESTA: validarlos con una gestoría.
-- Los datos de partida se insertan con "do nothing": volver a ejecutar esta migración
-- no pisa lo que se haya editado después.
--
-- Se puede ejecutar más de una vez sin problema.

-- 1) Catálogos (los puede leer cualquiera, incluso antes de registrarse: solo son etiquetas)
create table if not exists campos_registro (
  role user_role not null,
  clave text not null,
  etiqueta text not null,
  tipo text not null default 'texto' check (tipo in ('texto', 'seleccion')),
  opciones jsonb,
  obligatorio boolean not null default false,
  placeholder text,
  ayuda text,
  orden integer not null default 0,
  primary key (role, clave)
);
comment on table campos_registro is
  'Campos del formulario de alta de cada perfil. Las claves nombre_empresa y cif viajan aparte (las leen los disparadores de registro); el resto se guarda en datos_registro.';

create table if not exists documentos_requeridos (
  role user_role not null,
  tipo text not null,
  etiqueta text not null,
  descripcion text,
  obligatorio boolean not null default true,
  orden integer not null default 0,
  primary key (role, tipo)
);
comment on table documentos_requeridos is
  'Documentos que se piden a cada perfil para verificar su cuenta. Los obligatorios tienen que estar aprobados para verificarla.';

alter table campos_registro enable row level security;
alter table documentos_requeridos enable row level security;
drop policy if exists campos_registro_select on campos_registro;
create policy campos_registro_select on campos_registro for select to anon, authenticated using (true);
drop policy if exists campos_registro_admin_write on campos_registro;
create policy campos_registro_admin_write on campos_registro for all using (auth_role() in ('admin', 'superadmin'));
drop policy if exists documentos_requeridos_select on documentos_requeridos;
create policy documentos_requeridos_select on documentos_requeridos for select to anon, authenticated using (true);
drop policy if exists documentos_requeridos_admin_write on documentos_requeridos;
create policy documentos_requeridos_admin_write on documentos_requeridos for all using (auth_role() in ('admin', 'superadmin'));
grant select on campos_registro, documentos_requeridos to anon, authenticated;

-- 2) Datos del formulario (solo se escriben al registrarse, desde el disparador de abajo)
create table if not exists datos_registro (
  profile_id uuid primary key references auth.users (id) on delete cascade,
  datos jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table datos_registro enable row level security;
drop policy if exists datos_registro_select on datos_registro;
create policy datos_registro_select on datos_registro
  for select using (profile_id = auth.uid() or auth_role() in ('admin', 'superadmin'));

-- Al crearse el usuario: se guardan SOLO los campos que su perfil tiene en el catálogo, como
-- texto y con tope de longitud (nadie puede meter basura ni archivos enormes por la API).
-- Si algo falla, el registro NO se bloquea.
create or replace function guardar_datos_registro()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_datos jsonb := new.raw_user_meta_data -> 'datos_perfil';
  v_rol text := coalesce(new.raw_user_meta_data ->> 'rol_solicitado', 'subcontratista');
  v_limpio jsonb;
begin
  if v_datos is not null and jsonb_typeof(v_datos) = 'object' then
    select coalesce(jsonb_object_agg(c.clave, left(btrim(v_datos ->> c.clave), 300)), '{}'::jsonb)
      into v_limpio
      from campos_registro c
      where c.role::text = v_rol
        and c.clave not in ('nombre_empresa', 'cif')
        and nullif(btrim(v_datos ->> c.clave), '') is not null;
    if v_limpio <> '{}'::jsonb then
      insert into datos_registro (profile_id, datos) values (new.id, v_limpio) on conflict do nothing;
    end if;
  end if;
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists trg_guardar_datos_registro on auth.users;
create trigger trg_guardar_datos_registro
  after insert on auth.users
  for each row execute function guardar_datos_registro();

-- 3) Documentos subidos
create table if not exists documentos_cuenta (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid not null references auth.users (id) on delete cascade,
  tipo text not null,
  nombre_archivo text not null,
  storage_path text not null,
  tipo_mime text,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aprobado', 'rechazado')),
  motivo_rechazo text,
  revisado_por uuid references profiles (id) on delete set null,
  revisado_en timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, tipo)
);
create index if not exists idx_documentos_cuenta_profile on documentos_cuenta (profile_id);
alter table documentos_cuenta enable row level security;
drop policy if exists documentos_cuenta_select on documentos_cuenta;
create policy documentos_cuenta_select on documentos_cuenta
  for select using (profile_id = auth.uid() or auth_role() in ('admin', 'superadmin'));
-- Sin políticas de insertar ni de editar: solo se escribe con las funciones de abajo.

-- Almacén PRIVADO (solo la propia persona y el admin), 10 MB, solo PDF e imágenes
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documentos-verificacion', 'documentos-verificacion', false, 10485760,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function cuenta_pendiente()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and exists (
    select 1 from profiles where id = auth.uid() and estado_cuenta = 'pendiente'
  );
$$;

-- Subir: solo a su propia carpeta y solo mientras la cuenta está pendiente
drop policy if exists "documentos_verificacion_insert" on storage.objects;
create policy "documentos_verificacion_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documentos-verificacion'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.cuenta_pendiente()
  );
-- Ver: sus propios archivos, o todos si es admin
drop policy if exists "documentos_verificacion_select" on storage.objects;
create policy "documentos_verificacion_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documentos-verificacion'
    and ((storage.foldername(name))[1] = auth.uid()::text or auth_role() in ('admin', 'superadmin'))
  );

-- 4) Funciones
-- Lo que me piden y cómo va cada documento
create or replace function mis_documentos_requeridos()
returns table (
  tipo text, etiqueta text, descripcion text, obligatorio boolean, orden integer,
  documento_id uuid, estado text, motivo_rechazo text, nombre_archivo text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role user_role;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  select p.role into v_role from profiles p where p.id = auth.uid();
  return query
    select r.tipo, r.etiqueta, r.descripcion, r.obligatorio, r.orden,
           d.id, d.estado, d.motivo_rechazo, d.nombre_archivo
    from documentos_requeridos r
    left join documentos_cuenta d on d.profile_id = auth.uid() and d.tipo = r.tipo
    where r.role = v_role
    order by r.orden, r.tipo;
end;
$$;

-- Registrar un documento ya subido al almacén
create or replace function registrar_documento_cuenta(p_tipo text, p_nombre text, p_ruta text, p_mime text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role user_role;
  v_estado text;
  v_etiqueta text;
  v_obligatorio boolean;
  v_previo text;
  v_faltan integer;
  v_nombre text;
  v_admin record;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;
  select p.role, p.estado_cuenta into v_role, v_estado from profiles p where p.id = v_uid;
  if v_estado is distinct from 'pendiente' then
    raise exception 'Tu cuenta ya no está pendiente de verificación.';
  end if;

  select r.etiqueta, r.obligatorio into v_etiqueta, v_obligatorio
    from documentos_requeridos r where r.role = v_role and r.tipo = p_tipo;
  if v_etiqueta is null then
    raise exception 'Ese documento no se pide para tu tipo de cuenta.';
  end if;
  if p_ruta is null or left(p_ruta, length(v_uid::text) + 1) <> v_uid::text || '/' then
    raise exception 'Ruta de archivo no válida.';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'documentos-verificacion' and o.name = p_ruta) then
    raise exception 'No se encuentra el archivo subido.';
  end if;
  if nullif(btrim(coalesce(p_nombre, '')), '') is null then
    raise exception 'Falta el nombre del archivo.';
  end if;

  select d.estado into v_previo from documentos_cuenta d where d.profile_id = v_uid and d.tipo = p_tipo;
  if v_previo = 'aprobado' then
    raise exception 'Ese documento ya está aprobado.';
  end if;

  insert into documentos_cuenta (profile_id, tipo, nombre_archivo, storage_path, tipo_mime)
  values (v_uid, p_tipo, left(btrim(p_nombre), 200), p_ruta, p_mime)
  on conflict (profile_id, tipo) do update
    set nombre_archivo = excluded.nombre_archivo, storage_path = excluded.storage_path,
        tipo_mime = excluded.tipo_mime, estado = 'pendiente', motivo_rechazo = null,
        revisado_por = null, revisado_en = null, updated_at = now();

  -- Cuando ya están subidos TODOS los obligatorios, se avisa a los admin (una vez)
  select count(*) into v_faltan
    from documentos_requeridos r
    where r.role = v_role and r.obligatorio
      and not exists (select 1 from documentos_cuenta d where d.profile_id = v_uid and d.tipo = r.tipo);
  if v_obligatorio and v_faltan = 0 and (v_previo is null or v_previo = 'rechazado') then
    begin
      select p.nombre_completo into v_nombre from profiles p where p.id = v_uid;
      for v_admin in select p.id from profiles p where p.role in ('admin', 'superadmin') loop
        insert into notificaciones (user_id, tipo, titulo, cuerpo, datos)
        values (v_admin.id, 'documentacion_completa', 'Documentación lista para revisar',
                coalesce(nullif(btrim(v_nombre), ''), 'Una cuenta') || ' ha subido toda su documentación. Revísala en Conecta → Cuentas.',
                jsonb_build_object('profile_id', v_uid));
        begin
          perform enviar_push(v_admin.id, 'Documentación lista para revisar',
                              coalesce(nullif(btrim(v_nombre), ''), 'Una cuenta') || ' ha subido toda su documentación.',
                              jsonb_build_object('tipo', 'documentacion_completa'));
        exception when others then
          null;
        end;
      end loop;
    exception when others then
      null;
    end;
  end if;
end;
$$;

-- El admin aprueba o rechaza un documento (rechazar exige un motivo, que le llega a la persona)
create or replace function revisar_documento_cuenta(p_documento_id uuid, p_aprobar boolean, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := auth.uid();
  v_profile uuid;
  v_tipo text;
  v_role user_role;
  v_etiqueta text;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_cuerpo text;
begin
  if v_admin is null then
    raise exception 'No autenticado';
  end if;
  if coalesce(auth_role()::text, '') not in ('admin', 'superadmin') then
    raise exception 'No autorizado';
  end if;
  if p_aprobar is null then
    raise exception 'Indica si apruebas o rechazas el documento.';
  end if;

  select d.profile_id, d.tipo into v_profile, v_tipo
    from documentos_cuenta d where d.id = p_documento_id for update;
  if v_profile is null then
    raise exception 'Documento no encontrado';
  end if;
  if not p_aprobar and (v_motivo is null or length(v_motivo) < 3) then
    raise exception 'Escribe el motivo del rechazo (se le enviará a la persona).';
  end if;

  update documentos_cuenta
    set estado = case when p_aprobar then 'aprobado' else 'rechazado' end,
        motivo_rechazo = case when p_aprobar then null else left(v_motivo, 500) end,
        revisado_por = v_admin, revisado_en = now(), updated_at = now()
    where id = p_documento_id;

  if not p_aprobar then
    select p.role into v_role from profiles p where p.id = v_profile;
    select r.etiqueta into v_etiqueta from documentos_requeridos r where r.role = v_role and r.tipo = v_tipo;
    v_cuerpo := coalesce(v_etiqueta, v_tipo) || ': ' || v_motivo || '. Súbelo de nuevo desde la pantalla de tu cuenta.';
    insert into notificaciones (user_id, tipo, titulo, cuerpo, datos)
    values (v_profile, 'documento_rechazado', 'Documento rechazado', v_cuerpo, jsonb_build_object('tipo_documento', v_tipo));
    begin
      perform enviar_push(v_profile, 'Documento rechazado', v_cuerpo, jsonb_build_object('tipo', 'documento_rechazado'));
    exception when others then
      null;
    end;
  end if;
end;
$$;

-- Lo que el admin ve de una cuenta: cada documento pedido y, si lo hay, el subido
create or replace function documentos_de_cuenta(p_profile_id uuid)
returns table (
  tipo text, etiqueta text, descripcion text, obligatorio boolean, documento_id uuid,
  nombre_archivo text, storage_path text, tipo_mime text, estado text, motivo_rechazo text, subido_en timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role user_role;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  if coalesce(auth_role()::text, '') not in ('admin', 'superadmin') then
    raise exception 'No autorizado';
  end if;
  select p.role into v_role from profiles p where p.id = p_profile_id;
  return query
    select r.tipo, r.etiqueta, r.descripcion, r.obligatorio, d.id,
           d.nombre_archivo, d.storage_path, d.tipo_mime, d.estado, d.motivo_rechazo, d.updated_at
    from documentos_requeridos r
    left join documentos_cuenta d on d.profile_id = p_profile_id and d.tipo = r.tipo
    where r.role = v_role
    order by r.orden, r.tipo;
end;
$$;

-- Resumen para la lista del admin: cuántos obligatorios pide cada cuenta, cuántos ha subido, cuántos están aprobados
create or replace function estado_documentacion_cuentas()
returns table (profile_id uuid, requeridos integer, subidos integer, aprobados integer)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  if coalesce(auth_role()::text, '') not in ('admin', 'superadmin') then
    raise exception 'No autorizado';
  end if;
  return query
    select p.id,
           (count(r.tipo) filter (where r.obligatorio))::integer,
           (count(d.id) filter (where r.obligatorio))::integer,
           (count(d.id) filter (where r.obligatorio and d.estado = 'aprobado'))::integer
    from profiles p
    left join documentos_requeridos r on r.role = p.role
    left join documentos_cuenta d on d.profile_id = p.id and d.tipo = r.tipo
    where p.role not in ('admin', 'superadmin')
    group by p.id;
end;
$$;

-- 4b) BORRAR LA CUENTA SIN DEJAR DOCUMENTOS ATRÁS.
--     La base de datos no puede borrar archivos del almacén (Supabase bloquea el borrado
--     directo desde SQL), así que lo hace la app, en este orden:
--       1) comprobar_eliminacion_cuenta(): ¿se puede borrar? (comisiones pendientes,
--          licitaciones abiertas...). Reutiliza las mismas reglas que eliminar_mi_cuenta()
--          ejecutándola en un bloque cuyos cambios se DESHACEN al terminar: nada se borra.
--       2) la app borra los archivos de la persona del almacén (esta política se lo permite).
--       3) eliminar_mi_cuenta().
--     Así, si algo impide borrar la cuenta, los documentos no se pierden por el camino.
drop policy if exists "documentos_verificacion_delete_propio" on storage.objects;
create policy "documentos_verificacion_delete_propio" on storage.objects
  for delete to authenticated
  using (bucket_id = 'documentos-verificacion' and (storage.foldername(name))[1] = auth.uid()::text);

create or replace function comprobar_eliminacion_cuenta()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform eliminar_mi_cuenta();
    -- Si ha llegado hasta aquí, se podía borrar. Este error propio hace que PostgreSQL
    -- deshaga todo lo que acaba de hacer eliminar_mi_cuenta() dentro de este bloque.
    raise exception 'COMPROBACION_OK' using errcode = 'OH001';
  exception when sqlstate 'OH001' then
    return;
  end;
end;
$$;

-- 5) Verificar: ahora exige la documentación (ver arriba). Cambia la firma (nuevo parámetro
--    p_forzar), así que primero se borra la versión anterior.
drop function if exists cambiar_estado_cuenta(uuid, text, text);
create or replace function cambiar_estado_cuenta(
  p_profile_id uuid, p_nuevo_estado text, p_motivo text default null, p_forzar boolean default false
)
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
  v_faltan text[];
  v_motivo_historial text;
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

  -- Verificar una cuenta nueva exige tener APROBADA la documentación obligatoria de su perfil.
  -- Se puede saltar a mano (p_forzar) dejando escrito el motivo. Reactivar una cuenta que ya
  -- estuvo verificada (suspendida -> verificada) no vuelve a pedirla.
  if p_nuevo_estado = 'verificada' and v_estado_ant = 'pendiente' then
    select coalesce(array_agg(r.etiqueta order by r.orden), '{}') into v_faltan
      from documentos_requeridos r
      where r.role = v_role and r.obligatorio
        and not exists (
          select 1 from documentos_cuenta d
          where d.profile_id = p_profile_id and d.tipo = r.tipo and d.estado = 'aprobado'
        );
    if cardinality(v_faltan) > 0 then
      if p_forzar is not true then
        raise exception 'Faltan documentos obligatorios por aprobar: %.', array_to_string(v_faltan, ', ');
      elsif v_motivo is null or length(v_motivo) < 3 then
        raise exception 'Para verificar sin la documentación completa, escribe el motivo.';
      else
        v_motivo_historial := 'Verificada sin la documentación completa (' || array_to_string(v_faltan, ', ') || '): ' || v_motivo;
      end if;
    end if;
  end if;

  update profiles
    set estado_cuenta = p_nuevo_estado,
        estado_cuenta_motivo = case when p_nuevo_estado = 'suspendida' then left(v_motivo, 500) else null end,
        estado_cuenta_actualizado_en = now(),
        estado_cuenta_actualizado_por = v_admin
    where id = p_profile_id;

  insert into cuenta_historial (profile_id, estado_anterior, estado_nuevo, motivo, hecho_por)
  values (p_profile_id, v_estado_ant, p_nuevo_estado, left(coalesce(v_motivo_historial, v_motivo), 500), v_admin);

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

-- 6) Datos de partida (PROPUESTA, editable): do nothing = no pisa lo que se edite después
insert into campos_registro (role, clave, etiqueta, tipo, opciones, obligatorio, placeholder, ayuda, orden) values
  -- Arquitecto
  ('arquitecto', 'nombre_empresa', 'Nombre del estudio (si tienes)', 'texto', null, false, 'Déjalo en blanco si trabajas a título personal', null, 10),
  ('arquitecto', 'cif', 'NIF o CIF', 'texto', null, true, 'Ej: 12345678Z', null, 20),
  ('arquitecto', 'numero_colegiado', 'Número de colegiado', 'texto', null, true, null, null, 30),
  ('arquitecto', 'colegio', 'Colegio profesional', 'texto', null, true, 'Ej: COACM Albacete', null, 40),
  ('arquitecto', 'especialidad', 'Especialidad', 'seleccion', '["Proyectos de vivienda","Dirección de obra","Urbanismo","Rehabilitación","Interiorismo","Otra"]', false, null, null, 50),
  ('arquitecto', 'zona', 'Zona de trabajo', 'texto', null, false, 'Ej: Albacete y provincia', null, 60),
  ('arquitecto', 'web', 'Web o portfolio', 'texto', null, false, null, null, 70),
  -- Profesional (aparejador, ingeniero, coordinador de seguridad, topógrafo...)
  ('profesional', 'nombre_empresa', 'Nombre de tu empresa (si tienes)', 'texto', null, false, 'Déjalo en blanco si trabajas a título personal', null, 10),
  ('profesional', 'cif', 'NIF o CIF', 'texto', null, true, 'Ej: 12345678Z', null, 20),
  ('profesional', 'profesion', 'Profesión', 'seleccion', '["Aparejador / arquitecto técnico","Ingeniero","Coordinador de seguridad y salud","Topógrafo","Otra"]', true, null, null, 30),
  ('profesional', 'numero_colegiado', 'Número de colegiado', 'texto', null, true, null, null, 40),
  ('profesional', 'colegio', 'Colegio profesional', 'texto', null, true, null, null, 50),
  ('profesional', 'zona', 'Zona de trabajo', 'texto', null, false, null, null, 60),
  -- Promotor
  ('promotor', 'nombre_empresa', 'Razón social', 'texto', null, true, null, null, 10),
  ('promotor', 'cif', 'CIF', 'texto', null, true, 'Ej: B12345674', null, 20),
  ('promotor', 'tipo_promocion', 'Qué promueves', 'seleccion', '["Viviendas","Naves y uso industrial","Terciario / comercial","Mixto"]', false, null, null, 30),
  ('promotor', 'zona', 'Zona donde promueves', 'texto', null, false, null, null, 40),
  ('promotor', 'web', 'Web', 'texto', null, false, null, null, 50),
  -- Constructora
  ('constructora', 'nombre_empresa', 'Razón social', 'texto', null, true, null, null, 10),
  ('constructora', 'cif', 'CIF', 'texto', null, true, 'Ej: B12345674', null, 20),
  ('constructora', 'numero_rea', 'Nº de inscripción en el REA', 'texto', null, true, null, 'Registro de Empresas Acreditadas', 30),
  ('constructora', 'tamano', 'Tamaño de la empresa', 'seleccion', '["Autónomo","2-10 empleados","11-50 empleados","Más de 50"]', false, null, null, 40),
  ('constructora', 'zona', 'Zona de actuación', 'texto', null, false, null, null, 50),
  ('constructora', 'web', 'Web', 'texto', null, false, null, null, 60),
  -- Proveedor
  ('proveedor', 'nombre_empresa', 'Razón social', 'texto', null, true, null, null, 10),
  ('proveedor', 'cif', 'CIF', 'texto', null, true, 'Ej: B12345674', null, 20),
  ('proveedor', 'tipo_proveedor', 'Qué suministras', 'seleccion', '["Materiales","Maquinaria","Transporte","Alquiler de equipos","Otro"]', true, null, null, 30),
  ('proveedor', 'zona', 'Zona de cobertura', 'texto', null, false, null, null, 40),
  ('proveedor', 'web', 'Web', 'texto', null, false, null, null, 50),
  -- Inmobiliaria / Administrador
  ('administrador', 'tipo_entidad', 'Tipo de entidad', 'seleccion', '["Inmobiliaria","Administración pública","Administrador de fincas","Otro"]', true, null, null, 10),
  ('administrador', 'nombre_empresa', 'Nombre de la empresa u organismo', 'texto', null, true, null, null, 20),
  ('administrador', 'cif', 'CIF o NIF', 'texto', null, true, null, null, 30),
  ('administrador', 'licencia', 'Nº de licencia o registro (si aplica)', 'texto', null, false, null, null, 40),
  ('administrador', 'web', 'Web', 'texto', null, false, null, null, 50),
  -- Oficios: el formulario ya pide empresa, CIF y especialidad; esto es lo que se añade
  ('subcontratista', 'numero_rea', 'Nº de inscripción en el REA (si lo tienes)', 'texto', null, false, null, 'Registro de Empresas Acreditadas', 10),
  ('subcontratista', 'tamano', 'Tamaño de tu empresa', 'seleccion', '["Autónomo","2-5 personas","6-20 personas","Más de 20"]', false, null, null, 20),
  ('subcontratista', 'zona', 'Zona donde trabajas', 'texto', null, false, 'Ej: Albacete y provincia', null, 30)
on conflict (role, clave) do nothing;

insert into documentos_requeridos (role, tipo, etiqueta, descripcion, obligatorio, orden) values
  ('arquitecto', 'colegiacion', 'Certificado de colegiación', 'Te lo da tu colegio profesional. Tiene que estar vigente.', true, 10),
  ('arquitecto', 'seguro_rc', 'Seguro de responsabilidad civil', 'Póliza vigente o justificante de pago.', false, 20),
  ('profesional', 'colegiacion', 'Certificado de colegiación', 'Te lo da tu colegio profesional. Tiene que estar vigente.', true, 10),
  ('profesional', 'seguro_rc', 'Seguro de responsabilidad civil', 'Póliza vigente o justificante de pago.', false, 20),
  ('promotor', 'situacion_censal', 'Certificado de situación censal o tarjeta de CIF', 'Se obtiene en la sede electrónica de la Agencia Tributaria.', true, 10),
  ('promotor', 'corriente_pago', 'Certificado de estar al corriente con Hacienda y la Seguridad Social', 'Se pide en las sedes electrónicas de la Agencia Tributaria y de la Seguridad Social. Vale el más reciente.', true, 20),
  ('constructora', 'situacion_censal', 'Certificado de situación censal o tarjeta de CIF', 'Se obtiene en la sede electrónica de la Agencia Tributaria.', true, 10),
  ('constructora', 'corriente_pago', 'Certificado de estar al corriente con Hacienda y la Seguridad Social', 'Se pide en las sedes electrónicas de la Agencia Tributaria y de la Seguridad Social. Vale el más reciente.', true, 20),
  ('constructora', 'rea', 'Certificado del Registro de Empresas Acreditadas (REA)', 'Necesario para subcontratar en obras de construcción.', true, 30),
  ('constructora', 'seguro_rc', 'Seguro de responsabilidad civil', 'Póliza vigente o justificante de pago.', true, 40),
  ('proveedor', 'situacion_censal', 'Certificado de situación censal o tarjeta de CIF', 'Se obtiene en la sede electrónica de la Agencia Tributaria.', true, 10),
  ('proveedor', 'corriente_pago', 'Certificado de estar al corriente con Hacienda y la Seguridad Social', 'Se pide en las sedes electrónicas de la Agencia Tributaria y de la Seguridad Social. Vale el más reciente.', true, 20),
  ('administrador', 'situacion_censal', 'Certificado de situación censal o tarjeta de CIF', 'Se obtiene en la sede electrónica de la Agencia Tributaria.', true, 10),
  ('administrador', 'corriente_pago', 'Certificado de estar al corriente con Hacienda y la Seguridad Social', 'Se pide en las sedes electrónicas de la Agencia Tributaria y de la Seguridad Social.', false, 20),
  ('subcontratista', 'situacion_censal', 'Certificado de situación censal o tarjeta de CIF', 'Se obtiene en la sede electrónica de la Agencia Tributaria.', true, 10),
  ('subcontratista', 'corriente_pago', 'Certificado de estar al corriente con Hacienda y la Seguridad Social', 'Se pide en las sedes electrónicas de la Agencia Tributaria y de la Seguridad Social. Vale el más reciente.', true, 20),
  ('subcontratista', 'rea', 'Certificado del Registro de Empresas Acreditadas (REA)', 'Necesario para subcontratar en obras de construcción.', true, 30),
  ('subcontratista', 'seguro_rc', 'Seguro de responsabilidad civil', 'Póliza vigente o justificante de pago.', false, 40)
on conflict (role, tipo) do nothing;

-- Permisos de ejecución
revoke execute on function comprobar_eliminacion_cuenta() from public, anon;
revoke execute on function cuenta_pendiente() from public, anon;
revoke execute on function mis_documentos_requeridos() from public, anon;
revoke execute on function registrar_documento_cuenta(text, text, text, text) from public, anon;
revoke execute on function revisar_documento_cuenta(uuid, boolean, text) from public, anon;
revoke execute on function documentos_de_cuenta(uuid) from public, anon;
revoke execute on function estado_documentacion_cuentas() from public, anon;
revoke execute on function cambiar_estado_cuenta(uuid, text, text, boolean) from public, anon;
grant execute on function comprobar_eliminacion_cuenta() to authenticated;
grant execute on function cuenta_pendiente() to authenticated;
grant execute on function mis_documentos_requeridos() to authenticated;
grant execute on function registrar_documento_cuenta(text, text, text, text) to authenticated;
grant execute on function revisar_documento_cuenta(uuid, boolean, text) to authenticated;
grant execute on function documentos_de_cuenta(uuid) to authenticated;
grant execute on function estado_documentacion_cuentas() to authenticated;
grant execute on function cambiar_estado_cuenta(uuid, text, text, boolean) to authenticated;