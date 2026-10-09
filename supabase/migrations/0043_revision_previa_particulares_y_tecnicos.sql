-- ============================================================================
-- Revisión previa de toda petición/licitación + perfil Particular + visitas técnicas
-- ============================================================================
-- REQUISITO: haber ejecutado antes, SOLO, el 0042 (crea los valores nuevos).
--
-- Qué cambia:
--   - NADA se publica directamente. Una licitación de una promotora/constructora o la
--     petición de un particular nace "en_revision" y solo la ven quien la envió, el equipo
--     de 3B (admin) y, si hay visita, el técnico asignado.
--   - 3B decide (panel_revisar_peticion): publicar | pedir_info | visita | rechazar.
--       publicar   -> "abierta" (empieza a contar el plazo de días) y se avisa a quien la envió
--       pedir_info -> "pendiente_info"; quien la envió responde y vuelve a "en_revision"
--       visita     -> se asigna un técnico; sigue "en_revision" hasta que 3B decida
--       rechazar   -> "rechazada" con el motivo escrito
--   - Compromiso de respuesta: 3 días laborables (sábados y domingos no cuentan; los
--     festivos sí, de momento). La fecha límite se guarda y el panel marca las vencidas.
--   - Particular: alta ligera (sin CIF). Sus datos personales (nombre, teléfono, correo,
--     dirección) NO van en la licitación: viven aparte (obras_privado) y solo los ven él,
--     3B, el técnico de su visita y las empresas a las que 3B se los comparta.
--     La licitación pública solo lleva el municipio.
--   - Técnico: perfil nuevo, interno o externo (profiles.tecnico_externo). Solo ve las
--     visitas que se le asignan. Rellena un informe con fotos y marca Apto / Ajustar / No apto.
--     Las fotos van a un almacén privado propio.
--   - Si un particular borra su cuenta, se borran también sus datos personales de la petición.
--
-- Fuera de esta migración (hay que decidirlo): que 3B filtre las postulaciones antes de
-- que el particular las vea. Hoy el propietario ve las postulaciones directamente.
--
-- Se puede ejecutar más de una vez sin problema.

-- ---------------------------------------------------------------------------
-- 1) Columnas nuevas
-- ---------------------------------------------------------------------------
alter table obras add column if not exists origen text not null default 'empresa';
alter table obras drop constraint if exists obras_origen_valido;
alter table obras add constraint obras_origen_valido check (origen in ('empresa', 'particular'));
alter table obras add column if not exists dias_abierta integer;
alter table obras add column if not exists revision_motivo text;
alter table obras add column if not exists revision_enviada_en timestamptz;
alter table obras add column if not exists revisar_antes_de timestamptz;
alter table obras add column if not exists publicada_en timestamptz;

alter table profiles add column if not exists tecnico_externo boolean not null default false;

-- ---------------------------------------------------------------------------
-- 2) Tablas
-- ---------------------------------------------------------------------------
-- Historial de la revisión (quién, cuándo, qué decidió y por qué)
create table if not exists obra_revision_historial (
  id uuid primary key default uuid_generate_v4(),
  obra_id uuid not null references obras (id) on delete cascade,
  estado_anterior text,
  estado_nuevo text,
  motivo text,
  hecho_por uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_obra_revision_historial on obra_revision_historial (obra_id, created_at desc);
alter table obra_revision_historial enable row level security;
drop policy if exists obra_revision_historial_select on obra_revision_historial;
create policy obra_revision_historial_select on obra_revision_historial
  for select using (auth_role() in ('admin', 'superadmin'));

-- Datos personales de una petición de particular
create table if not exists obras_privado (
  obra_id uuid primary key references obras (id) on delete cascade,
  nombre text,
  telefono text,
  email text,
  direccion text,
  acepta_contacto boolean not null default false,
  acepta_visita boolean not null default false,
  created_at timestamptz not null default now()
);
alter table obras_privado enable row level security;

-- Empresas a las que 3B ha decidido enseñar los datos de contacto
create table if not exists obras_privado_acceso (
  obra_id uuid not null references obras (id) on delete cascade,
  empresa_id uuid not null,
  concedido_por uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (obra_id, empresa_id)
);
alter table obras_privado_acceso enable row level security;
drop policy if exists obras_privado_acceso_select on obras_privado_acceso;
create policy obras_privado_acceso_select on obras_privado_acceso
  for select using (auth_role() in ('admin', 'superadmin'));

-- Visitas técnicas
create table if not exists visitas_tecnicas (
  id uuid primary key default uuid_generate_v4(),
  obra_id uuid not null references obras (id) on delete cascade,
  tecnico_id uuid not null references profiles (id) on delete restrict,
  asignada_por uuid references profiles (id) on delete set null,
  estado text not null default 'asignada' check (estado in ('asignada', 'agendada', 'realizada', 'cancelada')),
  fecha_visita timestamptz,
  resultado text check (resultado in ('apto', 'ajustar', 'no_apto')),
  informe text,
  fotos text[] not null default '{}',
  realizada_en timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_visitas_tecnicas_obra on visitas_tecnicas (obra_id);
create index if not exists idx_visitas_tecnicas_tecnico on visitas_tecnicas (tecnico_id, estado);
alter table visitas_tecnicas enable row level security;
drop policy if exists visitas_tecnicas_select on visitas_tecnicas;
create policy visitas_tecnicas_select on visitas_tecnicas
  for select using (tecnico_id = auth.uid() or auth_role() in ('admin', 'superadmin'));
-- Sin políticas de escribir: solo con las funciones de más abajo.

-- ---------------------------------------------------------------------------
-- 3) Ayudas internas
-- ---------------------------------------------------------------------------
-- Suma días laborables (lunes a viernes) en hora de Madrid
create or replace function sumar_dias_laborables(p_desde timestamptz, p_dias integer)
returns timestamptz
language plpgsql
stable
as $$
declare
  v timestamptz := p_desde;
  n integer := 0;
begin
  while n < p_dias loop
    v := v + interval '1 day';
    if extract(isodow from (v at time zone 'Europe/Madrid')) < 6 then
      n := n + 1;
    end if;
  end loop;
  return v;
end;
$$;

-- Aviso (notificación + push) a una persona
create or replace function avisar_usuario(p_user uuid, p_tipo text, p_titulo text, p_cuerpo text, p_datos jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user is null then
    return;
  end if;
  begin
    insert into notificaciones (user_id, tipo, titulo, cuerpo, datos)
    values (p_user, p_tipo, p_titulo, p_cuerpo, coalesce(p_datos, '{}'::jsonb));
    begin
      perform enviar_push(p_user, p_titulo, p_cuerpo, jsonb_build_object('tipo', p_tipo));
    exception when others then
      null;
    end;
  exception when others then
    null;
  end;
end;
$$;

-- Aviso a todo el equipo de 3B
create or replace function avisar_equipo(p_tipo text, p_titulo text, p_cuerpo text, p_datos jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin record;
begin
  for v_admin in select p.id from profiles p where p.role in ('admin', 'superadmin') loop
    perform avisar_usuario(v_admin.id, p_tipo, p_titulo, p_cuerpo, p_datos);
  end loop;
end;
$$;

create or replace function registrar_revision(p_obra uuid, p_anterior text, p_nuevo text, p_motivo text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into obra_revision_historial (obra_id, estado_anterior, estado_nuevo, motivo, hecho_por)
  values (p_obra, p_anterior, p_nuevo, p_motivo, auth.uid());
$$;

-- ¿Puede esta persona ver los datos personales de la petición?
create or replace function puede_ver_datos_privados(p_obra uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and (
    auth_role() in ('admin', 'superadmin')
    or exists (select 1 from obras o where o.id = p_obra and o.creado_por = auth.uid())
    or exists (select 1 from visitas_tecnicas v
               where v.obra_id = p_obra and v.tecnico_id = auth.uid() and v.estado in ('asignada', 'agendada', 'realizada'))
    or exists (select 1 from obras_privado_acceso a where a.obra_id = p_obra and a.empresa_id = auth_empresa_id())
  );
$$;

drop policy if exists obras_privado_select on obras_privado;
create policy obras_privado_select on obras_privado
  for select using (puede_ver_datos_privados(obra_id));

-- Si la persona borra su cuenta, se borran sus datos personales de las peticiones
create or replace function borrar_datos_privados_de_cuenta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from obras_privado where obra_id in (select id from obras where creado_por = old.id);
  -- Una petición de particular sin dueño no tiene sentido: se cancela (no queda abierta ni en revisión)
  update obras set estado = 'cancelada', updated_at = now()
    where creado_por = old.id and origen = 'particular' and estado in ('en_revision', 'pendiente_info', 'abierta');
  return old;
end;
$$;
drop trigger if exists trg_borrar_datos_privados on profiles;
create trigger trg_borrar_datos_privados
  before delete on profiles
  for each row execute function borrar_datos_privados_de_cuenta();

-- ---------------------------------------------------------------------------
-- 4) Quién ve qué en "obras"
-- ---------------------------------------------------------------------------
-- Lo que está en revisión (o rechazado) solo lo ve quien lo envió y el técnico de su
-- visita; el admin lo ve siempre (obras_admin_write). El resto, igual que antes (0034).
drop policy if exists obras_select_authenticated on obras;
create policy obras_select_authenticated on obras
  for select using (
    (select cuenta_activa())
    and (
      creado_por = auth.uid()
      or exists (
        select 1 from visitas_tecnicas v
        where v.obra_id = obras.id and v.tecnico_id = auth.uid() and v.estado in ('asignada', 'agendada', 'realizada')
      )
      or (
        estado not in ('en_revision', 'pendiente_info', 'rechazada')
        and (
          estado <> 'abierta'
          or creado_por is null
          or cuenta_verificada(creado_por)
          or exists (select 1 from postulaciones p where p.obra_id = obras.id and p.empresa_id = auth_empresa_id())
        )
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 5) Almacén privado de fotos de las visitas
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('visitas-tecnicas', 'visitas-tecnicas', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "visitas_tecnicas_insert" on storage.objects;
create policy "visitas_tecnicas_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'visitas-tecnicas'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.auth_role() = 'tecnico'
  );
drop policy if exists "visitas_tecnicas_select" on storage.objects;
create policy "visitas_tecnicas_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'visitas-tecnicas'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.auth_role() in ('admin', 'superadmin'))
  );

-- ---------------------------------------------------------------------------
-- 6) Formulario de alta del perfil Particular (editable desde la tabla, como los demás)
-- ---------------------------------------------------------------------------
insert into campos_registro (role, clave, etiqueta, tipo, obligatorio, placeholder, ayuda, orden) values
  ('particular', 'telefono', 'Teléfono de contacto', 'texto', true, '600 000 000',
   'Solo lo usa 3B para llamarte si necesita más detalles de tu petición.', 10),
  ('particular', 'municipio', 'Municipio', 'texto', true, 'Ej.: Albacete',
   'Dónde está la obra o reforma.', 20)
on conflict (role, clave) do nothing;
-- Un particular no sube documentos de empresa: 3B verifica su cuenta contactando con él.

-- ---------------------------------------------------------------------------
-- 7) Enviar: licitación de empresa (misma firma que antes) y petición de particular
-- ---------------------------------------------------------------------------
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

  -- Frenos contra abuso
  if (select count(*) from obras where creado_por = v_uid and estado = 'abierta') >= 10 then
    raise exception 'Ya tienes 10 licitaciones abiertas. Cierra o cancela alguna antes de publicar otra.';
  end if;
  if (select count(*) from obras where creado_por = v_uid and estado in ('en_revision', 'pendiente_info')) >= 5 then
    raise exception 'Ya tienes 5 licitaciones en revisión. Espera a que 3B las revise antes de enviar otra.';
  end if;

  loop
    v_intentos := v_intentos + 1;
    v_ref := 'LIC-' || to_char(now(), 'YYYY') || '-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    begin
      insert into obras (
        referencia, titulo, descripcion, especialidad_requerida, ubicacion,
        presupuesto, moneda, puntos_bonus, duracion_dias, plazo_cierre,
        estado, requisitos, creado_por,
        origen, dias_abierta, revision_enviada_en, revisar_antes_de
      ) values (
        v_ref, trim(p_titulo),
        nullif(trim(coalesce(p_descripcion, '')), ''),
        nullif(trim(coalesce(p_especialidad, '')), ''),
        nullif(trim(coalesce(p_ubicacion, '')), ''),
        p_presupuesto, 'EUR', 0, p_duracion_dias,
        now() + make_interval(days => p_dias_abierta),   -- se vuelve a calcular al publicar
        'en_revision',
        nullif(trim(coalesce(p_requisitos, '')), ''),
        v_uid,
        'empresa', p_dias_abierta, now(), sumar_dias_laborables(now(), 3)
      )
      returning id into v_id;
      exit;
    exception when unique_violation then
      if v_intentos >= 5 then
        raise;
      end if;
    end;
  end loop;

  perform registrar_revision(v_id, null, 'en_revision', 'Enviada para revisión');
  perform avisar_equipo('peticion_revision', 'Licitación pendiente de revisar',
    '«' || trim(p_titulo) || '» espera revisión de 3B.', jsonb_build_object('obra_id', v_id));
  perform disparar_webhook('licitacion.creada', jsonb_build_object(
    'obra_id', v_id, 'referencia', v_ref, 'titulo', trim(p_titulo), 'especialidad', p_especialidad,
    'ubicacion', p_ubicacion, 'presupuesto', p_presupuesto, 'dias_abierta', p_dias_abierta,
    'propietario_id', v_uid, 'estado', 'en_revision', 'origen', 'empresa'
  ));

  return v_id;
end;
$$;

create or replace function app_crear_peticion_particular(
  p_titulo text,
  p_descripcion text,
  p_especialidad text,
  p_municipio text,
  p_direccion text,
  p_telefono text,
  p_presupuesto numeric,
  p_dias_abierta integer,
  p_requisitos text,
  p_acepta_contacto boolean,
  p_acepta_visita boolean
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
  v_nombre text;
  v_email text;
  v_tel text := regexp_replace(coalesce(p_telefono, ''), '[^0-9+]', '', 'g');
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;
  perform exigir_cuenta_activa();
  if coalesce(auth_role()::text, '') <> 'particular' then
    raise exception 'No autorizado';
  end if;

  if p_titulo is null or length(trim(p_titulo)) < 3 then
    raise exception 'Escribe un título para tu petición.';
  end if;
  if length(trim(p_titulo)) > 200 then
    raise exception 'El título es demasiado largo (máximo 200 caracteres).';
  end if;
  if length(coalesce(p_descripcion, '')) < 20 then
    raise exception 'Cuéntanos con algo más de detalle qué necesitas (al menos 20 caracteres).';
  end if;
  if length(coalesce(p_descripcion, '')) > 4000 or length(coalesce(p_requisitos, '')) > 2000 then
    raise exception 'La descripción o los requisitos son demasiado largos.';
  end if;
  if p_municipio is null or length(trim(p_municipio)) < 2 or length(trim(p_municipio)) > 120 then
    raise exception 'Indica el municipio de la obra.';
  end if;
  if p_direccion is null or length(trim(p_direccion)) < 5 or length(trim(p_direccion)) > 250 then
    raise exception 'Indica la dirección de la obra. No se publica: solo la ve 3B.';
  end if;
  if length(v_tel) < 9 or length(v_tel) > 16 then
    raise exception 'Indica un teléfono de contacto válido.';
  end if;
  if p_presupuesto is null or p_presupuesto <= 0 or p_presupuesto > 999999999 then
    raise exception 'Indica un presupuesto orientativo (mayor que cero).';
  end if;
  if p_dias_abierta is null or p_dias_abierta < 1 or p_dias_abierta > 90 then
    raise exception 'La petición debe estar abierta entre 1 y 90 días.';
  end if;
  if coalesce(p_acepta_contacto, false) is not true then
    raise exception 'Necesitamos tu permiso para contactar contigo y poder revisar la petición.';
  end if;

  if (select count(*) from obras where creado_por = v_uid and estado in ('en_revision', 'pendiente_info')) >= 3 then
    raise exception 'Ya tienes 3 peticiones en revisión. Espera a que 3B las revise antes de enviar otra.';
  end if;
  if (select count(*) from obras where creado_por = v_uid and estado = 'abierta') >= 5 then
    raise exception 'Ya tienes 5 peticiones abiertas. Cierra o cancela alguna antes de enviar otra.';
  end if;

  select nullif(btrim(p.nombre_completo), ''), p.email into v_nombre, v_email from profiles p where p.id = v_uid;

  loop
    v_intentos := v_intentos + 1;
    v_ref := 'PET-' || to_char(now(), 'YYYY') || '-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    begin
      insert into obras (
        referencia, titulo, descripcion, especialidad_requerida, ubicacion,
        presupuesto, moneda, puntos_bonus, plazo_cierre,
        estado, requisitos, creado_por,
        origen, dias_abierta, revision_enviada_en, revisar_antes_de
      ) values (
        v_ref, trim(p_titulo), trim(p_descripcion),
        nullif(trim(coalesce(p_especialidad, '')), ''),
        trim(p_municipio),
        p_presupuesto, 'EUR', 0,
        now() + make_interval(days => p_dias_abierta),
        'en_revision',
        nullif(trim(coalesce(p_requisitos, '')), ''),
        v_uid,
        'particular', p_dias_abierta, now(), sumar_dias_laborables(now(), 3)
      )
      returning id into v_id;
      exit;
    exception when unique_violation then
      if v_intentos >= 5 then
        raise;
      end if;
    end;
  end loop;

  insert into obras_privado (obra_id, nombre, telefono, email, direccion, acepta_contacto, acepta_visita)
  values (v_id, v_nombre, v_tel, v_email, trim(p_direccion), true, coalesce(p_acepta_visita, false));

  perform registrar_revision(v_id, null, 'en_revision', 'Enviada para revisión por un particular');
  perform avisar_equipo('peticion_revision', 'Petición de particular pendiente',
    '«' || trim(p_titulo) || '» (' || trim(p_municipio) || ') espera revisión de 3B.', jsonb_build_object('obra_id', v_id));
  -- Al webhook no viajan datos personales
  perform disparar_webhook('peticion.creada', jsonb_build_object(
    'obra_id', v_id, 'referencia', v_ref, 'titulo', trim(p_titulo), 'municipio', trim(p_municipio),
    'presupuesto', p_presupuesto, 'propietario_id', v_uid, 'estado', 'en_revision', 'origen', 'particular'
  ));

  return v_id;
end;
$$;

-- Quien la envió responde a lo que 3B le pidió (y, si quiere, corrige la descripción)
create or replace function app_responder_info_peticion(p_obra_id uuid, p_mensaje text, p_descripcion text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_obra record;
  v_msg text := nullif(btrim(coalesce(p_mensaje, '')), '');
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;
  perform exigir_cuenta_activa();
  select o.id, o.titulo, o.estado, o.creado_por into v_obra from obras o where o.id = p_obra_id for update;
  if not found or v_obra.creado_por is distinct from v_uid then
    raise exception 'Petición no encontrada';
  end if;
  if v_obra.estado <> 'pendiente_info' then
    raise exception 'Esta petición no está esperando información.';
  end if;
  if v_msg is null or length(v_msg) < 3 then
    raise exception 'Escribe la respuesta para 3B.';
  end if;
  if length(v_msg) > 2000 or length(coalesce(p_descripcion, '')) > 4000 then
    raise exception 'El texto es demasiado largo.';
  end if;

  update obras
    set estado = 'en_revision',
        descripcion = coalesce(nullif(btrim(coalesce(p_descripcion, '')), ''), descripcion),
        revision_motivo = null,
        revisar_antes_de = sumar_dias_laborables(now(), 3),
        updated_at = now()
    where id = p_obra_id;
  perform registrar_revision(p_obra_id, 'pendiente_info', 'en_revision', 'Respuesta: ' || v_msg);
  perform avisar_equipo('peticion_revision', 'Respuesta recibida',
    'Han respondido a la petición «' || coalesce(v_obra.titulo, '') || '».', jsonb_build_object('obra_id', p_obra_id));
end;
$$;

-- Mis licitaciones / peticiones con su estado de revisión
create or replace function app_mis_peticiones()
returns table (
  id uuid, referencia text, titulo text, estado text, origen text, ubicacion text,
  revision_motivo text, revisar_antes_de timestamptz, publicada_en timestamptz, created_at timestamptz,
  visita_estado text, visita_fecha timestamptz
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
  return query
    select o.id, o.referencia, o.titulo, o.estado::text, o.origen, o.ubicacion,
           o.revision_motivo, o.revisar_antes_de, o.publicada_en, o.created_at,
           v.estado, v.fecha_visita
    from obras o
    left join lateral (
      select vt.estado, vt.fecha_visita from visitas_tecnicas vt
      where vt.obra_id = o.id and vt.estado <> 'cancelada' order by vt.created_at desc limit 1
    ) v on true
    where o.creado_por = auth.uid()
    order by o.created_at desc;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8) Panel: cola de revisión y decisiones de 3B
-- ---------------------------------------------------------------------------
create or replace function panel_cola_peticiones()
returns table (
  obra_id uuid, referencia text, titulo text, origen text, estado text,
  solicitante_id uuid, solicitante_nombre text, solicitante_rol text,
  solicitante_email text, solicitante_telefono text, direccion text,
  ubicacion text, presupuesto numeric, descripcion text, requisitos text, especialidad text,
  enviada_en timestamptz, revisar_antes_de timestamptz, vencida boolean, motivo text,
  acepta_visita boolean,
  visita_id uuid, visita_estado text, visita_fecha timestamptz, visita_resultado text,
  visita_informe text, visita_fotos text[], tecnico_nombre text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform panel_exigir_admin();
  return query
    select o.id, o.referencia, o.titulo, o.origen, o.estado::text,
           o.creado_por, coalesce(pr.nombre_completo, op.nombre), pr.role::text,
           coalesce(pr.email, op.email), coalesce(op.telefono, pr.telefono), op.direccion,
           o.ubicacion, o.presupuesto::numeric, o.descripcion, o.requisitos, o.especialidad_requerida,
           o.revision_enviada_en, o.revisar_antes_de,
           (o.revisar_antes_de is not null and o.revisar_antes_de < now() and o.estado = 'en_revision'),
           o.revision_motivo,
           coalesce(op.acepta_visita, true),
           v.id, v.estado, v.fecha_visita, v.resultado, v.informe, v.fotos, tp.nombre_completo
    from obras o
    left join profiles pr on pr.id = o.creado_por
    left join obras_privado op on op.obra_id = o.id
    left join lateral (
      select vt.* from visitas_tecnicas vt
      where vt.obra_id = o.id and vt.estado <> 'cancelada' order by vt.created_at desc limit 1
    ) v on true
    left join profiles tp on tp.id = v.tecnico_id
    where o.estado in ('en_revision', 'pendiente_info')
    order by (o.estado = 'en_revision') desc, o.revisar_antes_de asc nulls last, o.created_at asc;
end;
$$;

create or replace function panel_revisar_peticion(
  p_obra_id uuid,
  p_accion text,
  p_motivo text default null,
  p_tecnico_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_obra record;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_ant text;
  v_acepta boolean;
  v_tec record;
  v_visita_id uuid;
begin
  perform panel_exigir_admin();

  select o.id, o.titulo, o.estado, o.creado_por, o.origen, o.dias_abierta, o.plazo_cierre
    into v_obra from obras o where o.id = p_obra_id for update;
  if not found then
    raise exception 'Petición no encontrada';
  end if;
  if v_obra.estado not in ('en_revision', 'pendiente_info') then
    raise exception 'Esta petición no está en revisión (estado: %).', v_obra.estado;
  end if;
  v_ant := v_obra.estado::text;

  if p_accion = 'publicar' then
    if v_obra.estado <> 'en_revision' then
      raise exception 'Está esperando información de quien la envió.';
    end if;
    if exists (select 1 from visitas_tecnicas where obra_id = p_obra_id and estado in ('asignada', 'agendada')) then
      raise exception 'Hay una visita técnica pendiente. Espera al informe antes de publicar.';
    end if;
    if (select vt.resultado from visitas_tecnicas vt
        where vt.obra_id = p_obra_id and vt.estado = 'realizada' order by vt.realizada_en desc nulls last limit 1) = 'no_apto' then
      raise exception 'El técnico marcó la visita como NO APTA. Rechaza la petición o pide información.';
    end if;
    update obras
      set estado = 'abierta', publicada_en = now(), revision_motivo = null, updated_at = now(),
          plazo_cierre = case when v_obra.dias_abierta is not null
                              then now() + make_interval(days => v_obra.dias_abierta) else plazo_cierre end
      where id = p_obra_id;
    perform registrar_revision(p_obra_id, v_ant, 'abierta', coalesce(v_motivo, 'Publicada'));
    perform avisar_usuario(v_obra.creado_por, 'peticion_publicada', 'Tu petición ya está publicada',
      '«' || coalesce(v_obra.titulo, '') || '» ya es visible para las empresas.', jsonb_build_object('obra_id', p_obra_id));
    perform disparar_webhook('licitacion.estado', jsonb_build_object(
      'obra_id', p_obra_id, 'titulo', v_obra.titulo, 'estado_anterior', v_ant, 'estado_nuevo', 'abierta', 'origen', v_obra.origen));

  elsif p_accion = 'pedir_info' then
    if v_obra.estado <> 'en_revision' then
      raise exception 'Ya se pidió información y se está esperando la respuesta.';
    end if;
    if v_motivo is null or length(v_motivo) < 5 then
      raise exception 'Escribe qué información hace falta.';
    end if;
    update obras set estado = 'pendiente_info', revision_motivo = left(v_motivo, 1000), updated_at = now() where id = p_obra_id;
    perform registrar_revision(p_obra_id, v_ant, 'pendiente_info', v_motivo);
    perform avisar_usuario(v_obra.creado_por, 'peticion_info', '3B necesita más información',
      left(v_motivo, 200), jsonb_build_object('obra_id', p_obra_id));

  elsif p_accion = 'visita' then
    if v_obra.estado <> 'en_revision' then
      raise exception 'Solo se puede asignar una visita a una petición en revisión.';
    end if;
    select p.id, p.role, p.estado_cuenta, p.nombre_completo into v_tec from profiles p where p.id = p_tecnico_id;
    if not found or v_tec.role <> 'tecnico' or v_tec.estado_cuenta <> 'verificada' then
      raise exception 'Elige un técnico con la cuenta verificada.';
    end if;
    select coalesce(op.acepta_visita, true) into v_acepta from (select 1) x left join obras_privado op on op.obra_id = p_obra_id;
    if v_obra.origen = 'particular' and v_acepta is not true then
      raise exception 'El solicitante no ha autorizado la visita a su domicilio.';
    end if;
    if exists (select 1 from visitas_tecnicas where obra_id = p_obra_id and estado in ('asignada', 'agendada')) then
      raise exception 'Ya hay una visita técnica pendiente.';
    end if;
    insert into visitas_tecnicas (obra_id, tecnico_id, asignada_por) values (p_obra_id, p_tecnico_id, auth.uid())
      returning id into v_visita_id;
    perform registrar_revision(p_obra_id, v_ant, v_ant, 'Visita técnica asignada a ' || coalesce(v_tec.nombre_completo, 'un técnico'));
    perform avisar_usuario(p_tecnico_id, 'visita_asignada', 'Nueva visita técnica',
      'Tienes una visita asignada: «' || coalesce(v_obra.titulo, '') || '».', jsonb_build_object('visita_id', v_visita_id, 'obra_id', p_obra_id));
    perform avisar_usuario(v_obra.creado_por, 'peticion_visita', 'Un técnico visitará la obra',
      'Para revisar «' || coalesce(v_obra.titulo, '') || '», un técnico de 3B se pondrá en contacto contigo para acordar la visita.',
      jsonb_build_object('obra_id', p_obra_id));

  elsif p_accion = 'rechazar' then
    if v_motivo is null or length(v_motivo) < 5 then
      raise exception 'Escribe el motivo del rechazo.';
    end if;
    update visitas_tecnicas set estado = 'cancelada', updated_at = now()
      where obra_id = p_obra_id and estado in ('asignada', 'agendada');
    update obras set estado = 'rechazada', revision_motivo = left(v_motivo, 1000), updated_at = now() where id = p_obra_id;
    perform registrar_revision(p_obra_id, v_ant, 'rechazada', v_motivo);
    perform avisar_usuario(v_obra.creado_por, 'peticion_rechazada', 'No hemos podido publicar tu petición',
      left(v_motivo, 200), jsonb_build_object('obra_id', p_obra_id));
    perform disparar_webhook('licitacion.estado', jsonb_build_object(
      'obra_id', p_obra_id, 'titulo', v_obra.titulo, 'estado_anterior', v_ant, 'estado_nuevo', 'rechazada', 'origen', v_obra.origen));

  else
    raise exception 'Acción no válida (usa: publicar, pedir_info, visita o rechazar).';
  end if;
end;
$$;

-- Historial de una petición
create or replace function panel_historial_peticion(p_obra_id uuid)
returns table (cuando timestamptz, quien text, estado_anterior text, estado_nuevo text, motivo text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform panel_exigir_admin();
  return query
    select h.created_at, p.nombre_completo, h.estado_anterior, h.estado_nuevo, h.motivo
    from obra_revision_historial h
    left join profiles p on p.id = h.hecho_por
    where h.obra_id = p_obra_id
    order by h.created_at desc;
end;
$$;

-- Técnicos
create or replace function panel_tecnicos()
returns table (id uuid, nombre text, email text, externo boolean, estado_cuenta text, visitas_abiertas bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform panel_exigir_admin();
  return query
    select p.id, p.nombre_completo, p.email, p.tecnico_externo, p.estado_cuenta,
           (select count(*) from visitas_tecnicas v where v.tecnico_id = p.id and v.estado in ('asignada', 'agendada'))
    from profiles p where p.role = 'tecnico' order by p.nombre_completo;
end;
$$;

-- Convertir una cuenta NUEVA en técnico (se crea primero el usuario en Supabase > Authentication)
create or replace function panel_marcar_tecnico(p_profile_id uuid, p_externo boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role user_role;
  v_estado text;
begin
  perform panel_exigir_admin();
  select role, estado_cuenta into v_role, v_estado from profiles where id = p_profile_id;
  if not found then
    raise exception 'No existe esa cuenta.';
  end if;
  if v_role in ('admin', 'superadmin') then
    raise exception 'No se puede convertir en técnico a un administrador.';
  end if;
  if v_role not in ('tecnico', 'subcontratista') or (v_role = 'subcontratista' and v_estado <> 'pendiente') then
    raise exception 'Solo se puede marcar como técnico una cuenta nueva (pendiente) o ya técnica.';
  end if;
  update profiles
    set role = 'tecnico', tecnico_externo = coalesce(p_externo, false), estado_cuenta = 'verificada',
        estado_cuenta_actualizado_en = now(), estado_cuenta_actualizado_por = auth.uid()
    where id = p_profile_id;
  insert into cuenta_historial (profile_id, estado_anterior, estado_nuevo, motivo, hecho_por)
  values (p_profile_id, v_estado, 'verificada',
          'Alta como técnico ' || case when coalesce(p_externo, false) then 'externo' else 'interno' end, auth.uid());
end;
$$;

-- Enseñar los datos de contacto de una petición a una empresa (decisión de 3B)
create or replace function panel_compartir_contacto(p_obra_id uuid, p_empresa_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform panel_exigir_admin();
  if not exists (select 1 from obras_privado where obra_id = p_obra_id) then
    raise exception 'Esa petición no tiene datos de contacto de un particular.';
  end if;
  insert into obras_privado_acceso (obra_id, empresa_id, concedido_por)
  values (p_obra_id, p_empresa_id, auth.uid())
  on conflict do nothing;
  perform registrar_revision(p_obra_id, null, null, 'Datos de contacto compartidos con la empresa ' || p_empresa_id::text);
end;
$$;

-- ---------------------------------------------------------------------------
-- 9) App del técnico
-- ---------------------------------------------------------------------------
create or replace function app_tecnico_exigir()
returns uuid
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
  if coalesce(auth_role()::text, '') <> 'tecnico' then
    raise exception 'No autorizado';
  end if;
  if not exists (select 1 from profiles where id = v_uid and estado_cuenta = 'verificada') then
    raise exception 'Tu cuenta tiene que estar verificada.';
  end if;
  return v_uid;
end;
$$;

create or replace function app_tecnico_mis_visitas()
returns table (
  visita_id uuid, obra_id uuid, referencia text, titulo text, descripcion text, ubicacion text,
  direccion text, contacto_nombre text, contacto_telefono text,
  estado text, fecha_visita timestamptz, resultado text, informe text, fotos text[]
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := app_tecnico_exigir();
begin
  return query
    select v.id, o.id, o.referencia, o.titulo, o.descripcion, o.ubicacion,
           op.direccion, op.nombre, op.telefono,
           v.estado, v.fecha_visita, v.resultado, v.informe, v.fotos
    from visitas_tecnicas v
    join obras o on o.id = v.obra_id
    left join obras_privado op on op.obra_id = o.id
    where v.tecnico_id = v_uid and v.estado <> 'cancelada'
    order by (v.estado in ('asignada', 'agendada')) desc, v.fecha_visita asc nulls last, v.created_at desc;
end;
$$;

create or replace function app_tecnico_agendar_visita(p_visita_id uuid, p_fecha timestamptz)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := app_tecnico_exigir();
  v record;
begin
  select vt.id, vt.obra_id, vt.estado, o.titulo, o.creado_por into v
    from visitas_tecnicas vt join obras o on o.id = vt.obra_id
    where vt.id = p_visita_id and vt.tecnico_id = v_uid for update of vt;
  if not found then
    raise exception 'Visita no encontrada';
  end if;
  if v.estado not in ('asignada', 'agendada') then
    raise exception 'Esta visita ya no se puede cambiar.';
  end if;
  if p_fecha is null or p_fecha < now() - interval '1 hour' or p_fecha > now() + interval '90 days' then
    raise exception 'Elige una fecha válida.';
  end if;
  update visitas_tecnicas set estado = 'agendada', fecha_visita = p_fecha, updated_at = now() where id = p_visita_id;
  perform avisar_usuario(v.creado_por, 'visita_agendada', 'Visita técnica acordada',
    'La visita para «' || coalesce(v.titulo, '') || '» es el ' || to_char(p_fecha at time zone 'Europe/Madrid', 'DD/MM/YYYY "a las" HH24:MI') || '.',
    jsonb_build_object('obra_id', v.obra_id));
  perform avisar_equipo('visita_agendada', 'Visita agendada',
    '«' || coalesce(v.titulo, '') || '»: ' || to_char(p_fecha at time zone 'Europe/Madrid', 'DD/MM/YYYY HH24:MI'),
    jsonb_build_object('obra_id', v.obra_id));
end;
$$;

create or replace function app_tecnico_registrar_informe(
  p_visita_id uuid, p_resultado text, p_informe text, p_fotos text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := app_tecnico_exigir();
  v record;
  f text;
begin
  select vt.id, vt.obra_id, vt.estado, o.titulo into v
    from visitas_tecnicas vt join obras o on o.id = vt.obra_id
    where vt.id = p_visita_id and vt.tecnico_id = v_uid for update of vt;
  if not found then
    raise exception 'Visita no encontrada';
  end if;
  if v.estado not in ('asignada', 'agendada') then
    raise exception 'Esta visita ya tiene informe o está cancelada.';
  end if;
  if p_resultado is null or p_resultado not in ('apto', 'ajustar', 'no_apto') then
    raise exception 'Elige el resultado: apto, ajustar o no apto.';
  end if;
  if p_informe is null or length(btrim(p_informe)) < 20 then
    raise exception 'Escribe el informe (al menos 20 caracteres).';
  end if;
  if length(p_informe) > 5000 then
    raise exception 'El informe es demasiado largo.';
  end if;
  if coalesce(array_length(p_fotos, 1), 0) > 12 then
    raise exception 'Máximo 12 fotos.';
  end if;
  foreach f in array coalesce(p_fotos, '{}'::text[]) loop
    if f is null or left(f, length(v_uid::text) + 1) <> v_uid::text || '/' then
      raise exception 'Foto no válida.';
    end if;
  end loop;

  update visitas_tecnicas
    set estado = 'realizada', resultado = p_resultado, informe = btrim(p_informe),
        fotos = coalesce(p_fotos, '{}'::text[]), realizada_en = now(), updated_at = now()
    where id = p_visita_id;
  perform registrar_revision(v.obra_id, 'en_revision', 'en_revision', 'Visita realizada. Resultado: ' || p_resultado);
  perform avisar_equipo('visita_realizada', 'Informe de visita recibido',
    '«' || coalesce(v.titulo, '') || '»: ' || case p_resultado when 'apto' then 'APTA' when 'ajustar' then 'A AJUSTAR' else 'NO APTA' end || '.',
    jsonb_build_object('obra_id', v.obra_id, 'visita_id', p_visita_id));
end;
$$;

-- ---------------------------------------------------------------------------
-- 10) Permisos
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
revoke all on function crear_licitacion(text, text, text, text, numeric, integer, text, integer) from public, anon;
grant execute on function crear_licitacion(text, text, text, text, numeric, integer, text, integer) to authenticated;
revoke all on function sumar_dias_laborables(timestamptz, integer) from public, anon;
revoke all on function avisar_usuario(uuid, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function avisar_equipo(text, text, text, jsonb) from public, anon, authenticated;
revoke all on function registrar_revision(uuid, text, text, text) from public, anon, authenticated;
revoke all on function puede_ver_datos_privados(uuid) from public, anon;
grant execute on function puede_ver_datos_privados(uuid) to authenticated;
revoke all on function borrar_datos_privados_de_cuenta() from public, anon, authenticated;