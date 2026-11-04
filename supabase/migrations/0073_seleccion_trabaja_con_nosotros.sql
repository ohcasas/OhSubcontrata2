-- ============================================================================
-- 0073 · «Trabaja con nosotros» — selección y contratación (fase 1: base de datos)
-- ============================================================================
-- · Mismo sistema de acceso (Supabase Auth). NO se crea ningún disparador sobre
--   auth.users: el candidato se da de alta llamando a sel_registrar_candidato()
--   tras iniciar sesión, así que registrarse no crea perfiles, empresas,
--   suscripciones ni registros del marketplace.
-- · Roles de selección en tabla propia (seleccion_usuarios). No se toca
--   profiles.role ni el enum user_role. Un admin del marketplace NO tiene
--   acceso a selección salvo que se le asigne un rol aquí.
-- · El superadministrador de selección se asigna de forma explícita y queda
--   registrado (sel_iniciar_superadmin / sel_asignar_rol → seleccion_auditoria).
-- · Ninguna decisión de contratación se toma ni se propone automáticamente a
--   partir de puntuaciones: los cambios de estado los hace siempre una persona,
--   con motivo, y quedan en un historial inmutable.
-- · No hay borrado automático: sel_candidatos_caducados() solo LISTA. El plazo
--   de conservación (12 meses) es configurable y está pendiente de validación legal.
-- · Los avisos usan seleccion_notificaciones (notificaciones y push_tokens
--   dependen de profiles, y un candidato no puede tener perfil).
-- · No envía correos, no crea tareas programadas, no toca datos existentes.
-- Idempotente: se puede ejecutar más de una vez.

-- ----------------------------------------------------------------------------
-- 1) Tablas
-- ----------------------------------------------------------------------------
create table if not exists seleccion_usuarios (
  user_id uuid primary key references auth.users (id) on delete cascade,
  rol text not null check (rol in ('entrevistador', 'responsable', 'superadmin')),
  activo boolean not null default true,
  nombre text,
  asignado_por uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists seleccion_candidatos (
  user_id uuid primary key references auth.users (id) on delete cascade,
  nombre_completo text not null check (length(btrim(nombre_completo)) between 2 and 120),
  email text not null,
  telefono text check (telefono is null or length(telefono) <= 30),
  localidad text check (localidad is null or length(localidad) <= 120),
  resumen text check (resumen is null or length(resumen) <= 2000),
  cv_path text,
  consentimiento_version text not null,
  consentimiento_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists seleccion_ofertas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null check (length(btrim(titulo)) between 3 and 160),
  descripcion text not null default '',
  ubicacion text,
  modalidad text not null default 'presencial' check (modalidad in ('presencial', 'remoto', 'hibrido')),
  tipo_contrato text,
  estado text not null default 'borrador' check (estado in ('borrador', 'abierta', 'pausada', 'cerrada')),
  preguntas jsonb not null default '[]'::jsonb,
  plantilla boolean not null default false,
  duplicada_de uuid references seleccion_ofertas (id) on delete set null,
  creada_por uuid,
  publicada_at timestamptz,
  cerrada_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists seleccion_candidaturas (
  id uuid primary key default gen_random_uuid(),
  oferta_id uuid not null references seleccion_ofertas (id) on delete restrict,
  candidato_id uuid not null references seleccion_candidatos (user_id) on delete cascade,
  estado text not null default 'recibida' check (estado in (
    'recibida', 'en_revision', 'preseleccionada', 'entrevista_programada', 'entrevista_realizada',
    'en_decision', 'oferta_enviada', 'contratada', 'rechazada', 'retirada', 'descartada_por_caducidad')),
  respuestas jsonb not null default '{}'::jsonb,
  carta text check (carta is null or length(carta) <= 4000),
  responsable_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (oferta_id, candidato_id)
);
create index if not exists idx_sel_candidaturas_candidato on seleccion_candidaturas (candidato_id);
create index if not exists idx_sel_candidaturas_oferta on seleccion_candidaturas (oferta_id, estado);

create table if not exists seleccion_historial (
  id bigint generated always as identity primary key,
  candidatura_id uuid not null references seleccion_candidaturas (id) on delete cascade,
  estado_anterior text,
  estado_nuevo text not null,
  motivo text,
  actor_id uuid,
  at timestamptz not null default now()
);
create index if not exists idx_sel_historial_cand on seleccion_historial (candidatura_id, at);

create table if not exists seleccion_entrevistas (
  id uuid primary key default gen_random_uuid(),
  candidatura_id uuid not null references seleccion_candidaturas (id) on delete cascade,
  fecha_hora timestamptz not null,
  duracion_min integer not null default 45 check (duracion_min between 5 and 480),
  modalidad text not null default 'videollamada' check (modalidad in ('presencial', 'videollamada', 'telefono')),
  lugar_enlace text,
  estado text not null default 'programada' check (estado in ('programada', 'realizada', 'cancelada', 'reprogramada')),
  motivo_cambio text,
  reprogramada_de uuid references seleccion_entrevistas (id) on delete set null,
  creada_por uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_sel_entrevistas_cand on seleccion_entrevistas (candidatura_id);

create table if not exists seleccion_entrevistadores (
  entrevista_id uuid not null references seleccion_entrevistas (id) on delete cascade,
  user_id uuid not null,
  primary key (entrevista_id, user_id)
);
create index if not exists idx_sel_entrevistadores_user on seleccion_entrevistadores (user_id);

create table if not exists seleccion_evaluaciones (
  id uuid primary key default gen_random_uuid(),
  entrevista_id uuid not null references seleccion_entrevistas (id) on delete cascade,
  candidatura_id uuid not null references seleccion_candidaturas (id) on delete cascade,
  evaluador_id uuid not null,
  c_conocimientos smallint check (c_conocimientos between 1 and 5),
  c_experiencia smallint check (c_experiencia between 1 and 5),
  c_comunicacion smallint check (c_comunicacion between 1 and 5),
  c_encaje smallint check (c_encaje between 1 and 5),
  c_motivacion smallint check (c_motivacion between 1 and 5),
  valoracion_global smallint check (valoracion_global between 1 and 5),
  recomendacion text check (recomendacion in ('contratar', 'dudoso', 'no_recomendar')),
  comentarios text check (comentarios is null or length(comentarios) <= 4000),
  cerrada boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entrevista_id, evaluador_id)
);

create table if not exists seleccion_notas_privadas (
  id uuid primary key default gen_random_uuid(),
  candidatura_id uuid not null references seleccion_candidaturas (id) on delete cascade,
  autor_id uuid not null,
  texto text not null check (length(btrim(texto)) between 1 and 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_sel_notas_cand on seleccion_notas_privadas (candidatura_id);

create table if not exists seleccion_mensajes (
  id bigint generated always as identity primary key,
  candidatura_id uuid not null references seleccion_candidaturas (id) on delete cascade,
  autor_id uuid not null,
  de_candidato boolean not null,
  texto text not null check (length(btrim(texto)) between 1 and 4000),
  leido_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_sel_mensajes_cand on seleccion_mensajes (candidatura_id, created_at);

create table if not exists seleccion_notificaciones (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  tipo text not null,
  titulo text not null,
  cuerpo text,
  datos jsonb not null default '{}'::jsonb,
  leida boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_sel_notif_user on seleccion_notificaciones (user_id, created_at desc);

create table if not exists seleccion_solicitudes_datos (
  id uuid primary key default gen_random_uuid(),
  candidato_id uuid not null references seleccion_candidatos (user_id) on delete cascade,
  tipo text not null check (tipo in ('acceso', 'rectificacion', 'supresion')),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'en_curso', 'resuelta', 'rechazada')),
  detalle text check (detalle is null or length(detalle) <= 2000),
  respuesta text,
  solicitada_at timestamptz not null default now(),
  resuelta_at timestamptz,
  resuelta_por uuid
);

create table if not exists seleccion_auditoria (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid,
  accion text not null,
  entidad text not null,
  entidad_id text,
  detalle jsonb not null default '{}'::jsonb
);
create index if not exists idx_sel_auditoria_ent on seleccion_auditoria (entidad, entidad_id, at);

create table if not exists seleccion_config (
  clave text primary key,
  valor jsonb not null,
  updated_at timestamptz not null default now()
);
insert into seleccion_config (clave, valor) values
  ('conservacion_meses', '12'::jsonb),
  ('borrado_automatico_activo', 'false'::jsonb),
  ('politica_validada_legalmente', 'false'::jsonb)
on conflict (clave) do nothing;

-- ----------------------------------------------------------------------------
-- 2) Funciones auxiliares de rol y visibilidad
-- ----------------------------------------------------------------------------
create or replace function sel_rol_actual()
returns text language sql stable security definer set search_path = public as $$
  select rol from seleccion_usuarios where user_id = auth.uid() and activo
$$;

create or replace function sel_es_equipo()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from seleccion_usuarios where user_id = auth.uid() and activo)
$$;

create or replace function sel_es_responsable()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from seleccion_usuarios where user_id = auth.uid() and activo and rol in ('responsable', 'superadmin'))
$$;

create or replace function sel_es_superadmin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from seleccion_usuarios where user_id = auth.uid() and activo and rol = 'superadmin')
$$;

create or replace function sel_exigir_equipo()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if not sel_es_equipo() then raise exception 'No autorizado'; end if;
end $$;

create or replace function sel_exigir_responsable()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if not sel_es_responsable() then raise exception 'No autorizado'; end if;
end $$;

create or replace function sel_exigir_superadmin()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if not sel_es_superadmin() then raise exception 'No autorizado'; end if;
end $$;

-- ¿La persona actual puede ver esta candidatura? (candidato: la suya; responsable: todas; entrevistador: las suyas)
create or replace function sel_puede_ver_candidatura(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    exists (select 1 from seleccion_candidaturas c where c.id = p_id and c.candidato_id = auth.uid())
    or sel_es_responsable()
    or exists (
      select 1 from seleccion_entrevistadores ee
      join seleccion_entrevistas e on e.id = ee.entrevista_id
      where ee.user_id = auth.uid() and e.candidatura_id = p_id and sel_es_equipo())
  )
$$;

-- ¿Puede ver el perfil y los documentos de este candidato?
create or replace function sel_puede_ver_candidato(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    p_user = auth.uid()
    or sel_es_responsable()
    or (sel_es_equipo() and exists (
      select 1 from seleccion_candidaturas c
      join seleccion_entrevistas e on e.candidatura_id = c.id
      join seleccion_entrevistadores ee on ee.entrevista_id = e.id
      where c.candidato_id = p_user and ee.user_id = auth.uid()))
  )
$$;

-- Auditoría interna (no ejecutable por clientes)
create or replace function sel_auditar(p_accion text, p_entidad text, p_entidad_id text, p_detalle jsonb)
returns void language sql security definer set search_path = public as $$
  insert into seleccion_auditoria (actor_id, accion, entidad, entidad_id, detalle)
  values (auth.uid(), p_accion, p_entidad, p_entidad_id, coalesce(p_detalle, '{}'::jsonb))
$$;

create or replace function sel_avisar(p_user uuid, p_tipo text, p_titulo text, p_cuerpo text, p_datos jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user is null then return; end if;
  insert into seleccion_notificaciones (user_id, tipo, titulo, cuerpo, datos)
  values (p_user, p_tipo, p_titulo, p_cuerpo, coalesce(p_datos, '{}'::jsonb));
exception when others then null;
end $$;

create or replace function sel_avisar_responsables(p_tipo text, p_titulo text, p_cuerpo text, p_datos jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select user_id from seleccion_usuarios where activo and rol in ('responsable', 'superadmin') loop
    perform sel_avisar(r.user_id, p_tipo, p_titulo, p_cuerpo, p_datos);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 3) Disparadores: inmutabilidad, historial y auditoría
-- ----------------------------------------------------------------------------
create or replace function sel_tocar_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

do $$
declare t text;
begin
  foreach t in array array['seleccion_usuarios', 'seleccion_candidatos', 'seleccion_ofertas', 'seleccion_candidaturas',
                           'seleccion_entrevistas', 'seleccion_evaluaciones', 'seleccion_notas_privadas'] loop
    execute format('drop trigger if exists trg_%s_upd on %s', t, t);
    execute format('create trigger trg_%s_upd before update on %s for each row execute function sel_tocar_updated_at()', t, t);
  end loop;
end $$;

-- Historial y auditoría: no se modifican; el historial solo se borra cuando ya no existe su candidatura
-- (supresión del candidato por derecho de supresión).
create or replace function sel_historial_inmutable()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from seleccion_candidaturas where id = old.candidatura_id) then
    return old;
  end if;
  raise exception 'El historial de selección no se modifica ni se borra.';
end $$;

drop trigger if exists trg_sel_historial_inmutable on seleccion_historial;
create trigger trg_sel_historial_inmutable before update or delete on seleccion_historial
  for each row execute function sel_historial_inmutable();

create or replace function sel_auditoria_inmutable()
returns trigger language plpgsql as $$
begin raise exception 'La auditoría de selección no se modifica ni se borra.'; end $$;

drop trigger if exists trg_sel_auditoria_inmutable on seleccion_auditoria;
create trigger trg_sel_auditoria_inmutable before update or delete on seleccion_auditoria
  for each row execute function sel_auditoria_inmutable();

drop trigger if exists trg_sel_auditoria_truncate on seleccion_auditoria;
create trigger trg_sel_auditoria_truncate before truncate on seleccion_auditoria
  for each statement execute function sel_auditoria_inmutable();

drop trigger if exists trg_sel_historial_truncate on seleccion_historial;
create trigger trg_sel_historial_truncate before truncate on seleccion_historial
  for each statement execute function sel_auditoria_inmutable();

-- Los mensajes no se editan (solo se marca leido_at) y solo se borran con su candidatura.
create or replace function sel_mensajes_inmutables()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from seleccion_candidaturas where id = old.candidatura_id) then return old; end if;
    raise exception 'Los mensajes de selección no se borran.';
  end if;
  if new.texto is distinct from old.texto or new.autor_id is distinct from old.autor_id
     or new.candidatura_id is distinct from old.candidatura_id or new.de_candidato is distinct from old.de_candidato
     or new.created_at is distinct from old.created_at then
    raise exception 'Los mensajes de selección no se editan.';
  end if;
  return new;
end $$;

drop trigger if exists trg_sel_mensajes_inmutables on seleccion_mensajes;
create trigger trg_sel_mensajes_inmutables before update or delete on seleccion_mensajes
  for each row execute function sel_mensajes_inmutables();

-- Todo cambio de estado de una candidatura (venga de donde venga) queda en el historial
create or replace function sel_registrar_estado()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into seleccion_historial (candidatura_id, estado_anterior, estado_nuevo, motivo, actor_id)
    values (new.id, null, new.estado, 'Candidatura recibida', auth.uid());
  elsif new.estado is distinct from old.estado then
    insert into seleccion_historial (candidatura_id, estado_anterior, estado_nuevo, motivo, actor_id)
    values (new.id, old.estado, new.estado, nullif(current_setting('seleccion.motivo', true), ''), auth.uid());
    perform sel_auditar('cambio_estado_candidatura', 'candidatura', new.id::text,
      jsonb_build_object('de', old.estado, 'a', new.estado));
  end if;
  return new;
end $$;

drop trigger if exists trg_sel_candidaturas_estado on seleccion_candidaturas;
create trigger trg_sel_candidaturas_estado after insert or update of estado on seleccion_candidaturas
  for each row execute function sel_registrar_estado();

-- Las evaluaciones se auditan (puntuaciones y recomendación; NO el texto de los comentarios)
create or replace function sel_auditar_evaluacion()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform sel_auditar(case when tg_op = 'INSERT' then 'evaluacion_creada' else 'evaluacion_modificada' end,
    'evaluacion', new.id::text,
    jsonb_build_object('candidatura', new.candidatura_id, 'evaluador', new.evaluador_id,
      'c', jsonb_build_array(new.c_conocimientos, new.c_experiencia, new.c_comunicacion, new.c_encaje, new.c_motivacion),
      'global', new.valoracion_global, 'recomendacion', new.recomendacion, 'cerrada', new.cerrada));
  return new;
end $$;

drop trigger if exists trg_sel_evaluaciones_audit on seleccion_evaluaciones;
create trigger trg_sel_evaluaciones_audit after insert or update on seleccion_evaluaciones
  for each row execute function sel_auditar_evaluacion();

-- Una evaluación cerrada no se modifica (solo se reabre con sel_reabrir_evaluacion)
create or replace function sel_evaluacion_cerrada()
returns trigger language plpgsql as $$
begin
  if old.cerrada and new.cerrada and current_setting('seleccion.reabriendo', true) is distinct from 'on' then
    raise exception 'La evaluación está cerrada. Pide al responsable que la reabra.';
  end if;
  if new.entrevista_id is distinct from old.entrevista_id or new.evaluador_id is distinct from old.evaluador_id
     or new.candidatura_id is distinct from old.candidatura_id then
    raise exception 'No se puede cambiar a quién ni de qué entrevista es la evaluación.';
  end if;
  return new;
end $$;

drop trigger if exists trg_sel_evaluaciones_cerrada on seleccion_evaluaciones;
create trigger trg_sel_evaluaciones_cerrada before update on seleccion_evaluaciones
  for each row execute function sel_evaluacion_cerrada();

-- Las ofertas: auditar cambios de estado y poner fechas
create or replace function sel_oferta_estado()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.creada_por := coalesce(new.creada_por, auth.uid());
    return new;
  end if;
  if new.estado is distinct from old.estado then
    if new.estado = 'abierta' and new.publicada_at is null then new.publicada_at := now(); end if;
    if new.estado = 'cerrada' then new.cerrada_at := now(); end if;
    if new.estado <> 'cerrada' then new.cerrada_at := null; end if;
    perform sel_auditar('cambio_estado_oferta', 'oferta', new.id::text, jsonb_build_object('de', old.estado, 'a', new.estado));
  end if;
  return new;
end $$;

drop trigger if exists trg_sel_oferta_estado on seleccion_ofertas;
create trigger trg_sel_oferta_estado before insert or update on seleccion_ofertas
  for each row execute function sel_oferta_estado();

-- El candidato no puede cambiar su identidad ni su consentimiento por la vía directa
create or replace function sel_candidato_protegido()
returns trigger language plpgsql as $$
begin
  if new.user_id is distinct from old.user_id or new.email is distinct from old.email
     or new.consentimiento_version is distinct from old.consentimiento_version
     or new.consentimiento_at is distinct from old.consentimiento_at then
    raise exception 'Estos datos no se cambian por esta vía.';
  end if;
  return new;
end $$;

drop trigger if exists trg_sel_candidato_protegido on seleccion_candidatos;
create trigger trg_sel_candidato_protegido before update on seleccion_candidatos
  for each row execute function sel_candidato_protegido();

-- Una candidatura no cambia de oferta ni de candidato
create or replace function sel_candidatura_protegida()
returns trigger language plpgsql as $$
begin
  if new.oferta_id is distinct from old.oferta_id or new.candidato_id is distinct from old.candidato_id then
    raise exception 'No se puede cambiar la oferta ni el candidato de una candidatura.';
  end if;
  return new;
end $$;

drop trigger if exists trg_sel_candidatura_protegida on seleccion_candidaturas;
create trigger trg_sel_candidatura_protegida before update on seleccion_candidaturas
  for each row execute function sel_candidatura_protegida();

-- ----------------------------------------------------------------------------
-- 4) Restricciones adicionales
-- ----------------------------------------------------------------------------
alter table seleccion_ofertas drop constraint if exists seleccion_ofertas_plantilla_borrador;
alter table seleccion_ofertas add constraint seleccion_ofertas_plantilla_borrador check (not plantilla or estado = 'borrador');

alter table seleccion_candidatos drop constraint if exists seleccion_candidatos_cv_propio;
alter table seleccion_candidatos add constraint seleccion_candidatos_cv_propio
  check (cv_path is null or cv_path like user_id::text || '/%');

-- ----------------------------------------------------------------------------
-- 5) Roles del equipo (asignación explícita y registrada)
-- ----------------------------------------------------------------------------
create or replace function sel_iniciar_superadmin()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if coalesce(auth_role()::text, '') <> 'superadmin' then
    raise exception 'Solo el superadmin del marketplace puede iniciar el superadministrador de selección.';
  end if;
  if exists (select 1 from seleccion_usuarios where rol = 'superadmin' and activo and user_id <> auth.uid()) then
    raise exception 'Ya hay un superadministrador de selección. Pídele que te asigne el rol.';
  end if;
  insert into seleccion_usuarios (user_id, rol, activo, nombre, asignado_por)
  values (auth.uid(), 'superadmin', true, (select nombre_completo from profiles where id = auth.uid()), auth.uid())
  on conflict (user_id) do update set rol = 'superadmin', activo = true;
  perform sel_auditar('superadmin_iniciado', 'rol', auth.uid()::text, jsonb_build_object('rol', 'superadmin', 'origen', 'superadmin del marketplace'));
end $$;

create or replace function sel_asignar_rol(p_user uuid, p_rol text, p_activo boolean default true, p_nombre text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform sel_exigir_responsable();
  if p_rol not in ('entrevistador', 'responsable', 'superadmin') then raise exception 'Rol no válido'; end if;
  if p_user = auth.uid() then raise exception 'No puedes cambiar tu propio rol.'; end if;
  if not exists (select 1 from auth.users where id = p_user) then raise exception 'No existe esa cuenta.'; end if;
  if exists (select 1 from seleccion_candidatos where user_id = p_user) then
    raise exception 'Esa cuenta es de un candidato. El equipo debe usar una cuenta distinta.';
  end if;
  -- un responsable solo gestiona entrevistadores; responsables y superadmins los asigna el superadministrador
  if not sel_es_superadmin() then
    if p_rol <> 'entrevistador' or exists (select 1 from seleccion_usuarios where user_id = p_user and rol <> 'entrevistador') then
      raise exception 'Solo el superadministrador puede gestionar responsables y superadministradores.';
    end if;
  end if;
  if not p_activo and exists (select 1 from seleccion_usuarios where user_id = p_user and rol = 'superadmin' and activo)
     and (select count(*) from seleccion_usuarios where rol = 'superadmin' and activo) <= 1 then
    raise exception 'No se puede desactivar al último superadministrador.';
  end if;
  insert into seleccion_usuarios (user_id, rol, activo, nombre, asignado_por)
  values (p_user, p_rol, p_activo, p_nombre, auth.uid())
  on conflict (user_id) do update set rol = excluded.rol, activo = excluded.activo,
    nombre = coalesce(excluded.nombre, seleccion_usuarios.nombre), asignado_por = auth.uid();
  perform sel_auditar('rol_asignado', 'rol', p_user::text, jsonb_build_object('rol', p_rol, 'activo', p_activo));
end $$;

-- ----------------------------------------------------------------------------
-- 6) Candidatos y candidaturas
-- ----------------------------------------------------------------------------
create or replace function sel_registrar_candidato(p_nombre text, p_telefono text, p_localidad text, p_resumen text,
                                                   p_version_consentimiento text, p_acepta boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_email text;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if p_acepta is distinct from true then raise exception 'Necesitamos tu consentimiento para tratar tus datos y poder valorar tu candidatura.'; end if;
  if coalesce(btrim(p_version_consentimiento), '') = '' then raise exception 'Falta la versión del texto de privacidad.'; end if;
  if exists (select 1 from profiles where id = auth.uid()) then
    raise exception 'Esta cuenta ya se usa en 3B Conecta como usuario. Para candidaturas usa otro correo.';
  end if;
  if exists (select 1 from seleccion_usuarios where user_id = auth.uid()) then
    raise exception 'Esta cuenta pertenece al equipo de selección.';
  end if;
  if exists (select 1 from seleccion_candidatos where user_id = auth.uid()) then
    raise exception 'Ya estás registrado como candidato.';
  end if;
  select email into v_email from auth.users where id = auth.uid();
  insert into seleccion_candidatos (user_id, nombre_completo, email, telefono, localidad, resumen, consentimiento_version)
  values (auth.uid(), p_nombre, coalesce(v_email, ''), nullif(btrim(p_telefono), ''), nullif(btrim(p_localidad), ''),
          nullif(btrim(p_resumen), ''), btrim(p_version_consentimiento));
end $$;

create or replace function sel_postular(p_oferta uuid, p_respuestas jsonb default '{}'::jsonb, p_carta text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_titulo text;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if not exists (select 1 from seleccion_candidatos where user_id = auth.uid()) then
    raise exception 'Completa primero tu perfil de candidato.';
  end if;
  select titulo into v_titulo from seleccion_ofertas where id = p_oferta and estado = 'abierta' and not plantilla;
  if v_titulo is null then raise exception 'Esta oferta no está abierta.'; end if;
  if length(coalesce(p_respuestas, '{}'::jsonb)::text) > 20000 then raise exception 'Las respuestas son demasiado largas.'; end if;
  begin
    insert into seleccion_candidaturas (oferta_id, candidato_id, respuestas, carta)
    values (p_oferta, auth.uid(), coalesce(p_respuestas, '{}'::jsonb), nullif(btrim(p_carta), ''))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'Ya te has presentado a esta oferta.';
  end;
  perform sel_avisar_responsables('nueva_candidatura', 'Nueva candidatura', 'Hay una candidatura nueva para «' || v_titulo || '».',
    jsonb_build_object('candidatura_id', v_id));
  perform sel_avisar(auth.uid(), 'candidatura_recibida', 'Hemos recibido tu candidatura',
    'Tu candidatura para «' || v_titulo || '» ha llegado. Te avisaremos de cualquier novedad.', jsonb_build_object('candidatura_id', v_id));
  return v_id;
end $$;

create or replace function sel_retirar_candidatura(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_estado text;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  select estado into v_estado from seleccion_candidaturas where id = p_id and candidato_id = auth.uid();
  if v_estado is null then raise exception 'Candidatura no encontrada'; end if;
  if v_estado in ('contratada', 'rechazada', 'retirada', 'descartada_por_caducidad') then
    raise exception 'Esta candidatura ya está cerrada.';
  end if;
  perform set_config('seleccion.motivo', 'Retirada por el candidato', true);
  update seleccion_candidaturas set estado = 'retirada' where id = p_id;
  perform sel_avisar_responsables('candidatura_retirada', 'Candidatura retirada', 'Un candidato ha retirado su candidatura.', jsonb_build_object('candidatura_id', p_id));
end $$;

create or replace function sel_cambiar_estado(p_id uuid, p_estado text, p_motivo text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_old text; v_cand uuid;
begin
  perform sel_exigir_responsable();
  select estado, candidato_id into v_old, v_cand from seleccion_candidaturas where id = p_id;
  if v_old is null then raise exception 'Candidatura no encontrada'; end if;
  if p_estado = v_old then return; end if;
  if p_estado not in ('recibida', 'en_revision', 'preseleccionada', 'entrevista_programada', 'entrevista_realizada',
                      'en_decision', 'oferta_enviada', 'contratada', 'rechazada', 'descartada_por_caducidad') then
    raise exception 'Estado no válido (la retirada solo la hace el candidato).';
  end if;
  -- Decisiones: siempre con motivo escrito por una persona
  if p_estado in ('oferta_enviada', 'contratada', 'rechazada', 'descartada_por_caducidad') and length(btrim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'Escribe el motivo de la decisión.';
  end if;
  -- Reabrir una candidatura cerrada: solo el superadministrador y con motivo
  if v_old in ('contratada', 'rechazada', 'retirada', 'descartada_por_caducidad') then
    if not sel_es_superadmin() then raise exception 'Solo el superadministrador puede reabrir una candidatura cerrada.'; end if;
    if length(btrim(coalesce(p_motivo, ''))) < 3 then raise exception 'Escribe el motivo de la reapertura.'; end if;
  end if;
  perform set_config('seleccion.motivo', coalesce(btrim(p_motivo), ''), true);
  update seleccion_candidaturas set estado = p_estado where id = p_id;
  perform sel_avisar(v_cand, 'candidatura_estado', 'Tu candidatura ha cambiado de estado',
    'Entra en tu portal para ver cómo va.', jsonb_build_object('candidatura_id', p_id));
end $$;

create or replace function sel_asignar_responsable(p_id uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform sel_exigir_responsable();
  if p_user is not null and not exists (select 1 from seleccion_usuarios where user_id = p_user and activo and rol in ('responsable', 'superadmin')) then
    raise exception 'Esa persona no es responsable de selección.';
  end if;
  update seleccion_candidaturas set responsable_id = p_user where id = p_id;
  perform sel_auditar('responsable_asignado', 'candidatura', p_id::text, jsonb_build_object('responsable', p_user));
end $$;

-- ----------------------------------------------------------------------------
-- 7) Ofertas (abrir, pausar, cerrar, duplicar)
-- ----------------------------------------------------------------------------
create or replace function sel_cambiar_estado_oferta(p_id uuid, p_estado text)
returns void language plpgsql security definer set search_path = public as $$
declare v_old text; v_plantilla boolean;
begin
  perform sel_exigir_responsable();
  if p_estado not in ('borrador', 'abierta', 'pausada', 'cerrada') then raise exception 'Estado no válido'; end if;
  select estado, plantilla into v_old, v_plantilla from seleccion_ofertas where id = p_id;
  if v_old is null then raise exception 'Oferta no encontrada'; end if;
  if v_plantilla then raise exception 'Una plantilla no se publica: duplícala primero.'; end if;
  if p_estado = 'borrador' and v_old <> 'borrador' then raise exception 'Una oferta publicada no vuelve a borrador: ciérrala o duplícala.'; end if;
  update seleccion_ofertas set estado = p_estado where id = p_id;
end $$;

create or replace function sel_duplicar_oferta(p_id uuid, p_titulo text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform sel_exigir_responsable();
  insert into seleccion_ofertas (titulo, descripcion, ubicacion, modalidad, tipo_contrato, preguntas, duplicada_de, estado, plantilla, creada_por)
  select coalesce(nullif(btrim(p_titulo), ''), titulo || ' (copia)'), descripcion, ubicacion, modalidad, tipo_contrato, preguntas, id, 'borrador', false, auth.uid()
  from seleccion_ofertas where id = p_id
  returning id into v_id;
  if v_id is null then raise exception 'Oferta no encontrada'; end if;
  perform sel_auditar('oferta_duplicada', 'oferta', v_id::text, jsonb_build_object('origen', p_id));
  return v_id;
end $$;

-- ----------------------------------------------------------------------------
-- 8) Entrevistas (varias por candidatura; cancelar o reprogramar NO descarta al candidato)
-- ----------------------------------------------------------------------------
create or replace function sel_crear_entrevista(p_candidatura uuid, p_fecha timestamptz, p_duracion integer,
                                                p_modalidad text, p_lugar text, p_entrevistadores uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_estado text; v_cand uuid; u uuid;
begin
  perform sel_exigir_responsable();
  select estado, candidato_id into v_estado, v_cand from seleccion_candidaturas where id = p_candidatura;
  if v_estado is null then raise exception 'Candidatura no encontrada'; end if;
  if v_estado in ('contratada', 'rechazada', 'retirada', 'descartada_por_caducidad') then raise exception 'La candidatura está cerrada.'; end if;
  if p_fecha is null or p_fecha < now() then raise exception 'La fecha de la entrevista debe ser futura.'; end if;
  if coalesce(array_length(p_entrevistadores, 1), 0) = 0 then raise exception 'Asigna al menos un entrevistador.'; end if;
  foreach u in array p_entrevistadores loop
    if not exists (select 1 from seleccion_usuarios where user_id = u and activo) then
      raise exception 'Uno de los entrevistadores no pertenece al equipo de selección.';
    end if;
  end loop;
  insert into seleccion_entrevistas (candidatura_id, fecha_hora, duracion_min, modalidad, lugar_enlace, creada_por)
  values (p_candidatura, p_fecha, coalesce(p_duracion, 45), coalesce(p_modalidad, 'videollamada'), nullif(btrim(p_lugar), ''), auth.uid())
  returning id into v_id;
  insert into seleccion_entrevistadores (entrevista_id, user_id)
  select v_id, x from (select distinct unnest(p_entrevistadores) x) s;
  -- Única transición automática: de las fases iniciales a «entrevista programada». Nunca descarta a nadie.
  if v_estado in ('recibida', 'en_revision', 'preseleccionada') then
    perform set_config('seleccion.motivo', 'Entrevista programada', true);
    update seleccion_candidaturas set estado = 'entrevista_programada' where id = p_candidatura;
  end if;
  perform sel_avisar(v_cand, 'entrevista', 'Tienes una entrevista', 'Consulta la fecha y los detalles en tu portal.',
    jsonb_build_object('candidatura_id', p_candidatura, 'entrevista_id', v_id));
  foreach u in array p_entrevistadores loop
    perform sel_avisar(u, 'entrevista_asignada', 'Entrevista asignada', 'Se te ha asignado una entrevista.', jsonb_build_object('entrevista_id', v_id));
  end loop;
  perform sel_auditar('entrevista_creada', 'entrevista', v_id::text, jsonb_build_object('candidatura', p_candidatura, 'fecha', p_fecha));
  return v_id;
end $$;

create or replace function sel_reprogramar_entrevista(p_id uuid, p_fecha timestamptz, p_motivo text,
                                                      p_lugar text default null, p_entrevistadores uuid[] default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare e seleccion_entrevistas%rowtype; v_new uuid; v_cand uuid;
begin
  perform sel_exigir_responsable();
  select * into e from seleccion_entrevistas where id = p_id;
  if e.id is null then raise exception 'Entrevista no encontrada'; end if;
  if e.estado <> 'programada' then raise exception 'Solo se reprograma una entrevista programada.'; end if;
  if p_fecha is null or p_fecha < now() then raise exception 'La nueva fecha debe ser futura.'; end if;
  update seleccion_entrevistas set estado = 'reprogramada', motivo_cambio = nullif(btrim(p_motivo), '') where id = p_id;
  insert into seleccion_entrevistas (candidatura_id, fecha_hora, duracion_min, modalidad, lugar_enlace, reprogramada_de, creada_por)
  values (e.candidatura_id, p_fecha, e.duracion_min, e.modalidad, coalesce(nullif(btrim(p_lugar), ''), e.lugar_enlace), e.id, auth.uid())
  returning id into v_new;
  if p_entrevistadores is null then
    insert into seleccion_entrevistadores (entrevista_id, user_id) select v_new, user_id from seleccion_entrevistadores where entrevista_id = p_id;
  else
    insert into seleccion_entrevistadores (entrevista_id, user_id)
    select v_new, x from (select distinct unnest(p_entrevistadores) x) s
    where exists (select 1 from seleccion_usuarios where user_id = s.x and activo);
  end if;
  select candidato_id into v_cand from seleccion_candidaturas where id = e.candidatura_id;
  perform sel_avisar(v_cand, 'entrevista', 'Tu entrevista ha cambiado de fecha', 'Consulta la nueva fecha en tu portal.',
    jsonb_build_object('candidatura_id', e.candidatura_id, 'entrevista_id', v_new));
  perform sel_auditar('entrevista_reprogramada', 'entrevista', v_new::text, jsonb_build_object('anterior', p_id, 'fecha', p_fecha));
  return v_new;
end $$;

create or replace function sel_cancelar_entrevista(p_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare e seleccion_entrevistas%rowtype; v_cand uuid;
begin
  perform sel_exigir_responsable();
  select * into e from seleccion_entrevistas where id = p_id;
  if e.id is null then raise exception 'Entrevista no encontrada'; end if;
  if e.estado <> 'programada' then raise exception 'Solo se cancela una entrevista programada.'; end if;
  update seleccion_entrevistas set estado = 'cancelada', motivo_cambio = nullif(btrim(p_motivo), '') where id = p_id;
  select candidato_id into v_cand from seleccion_candidaturas where id = e.candidatura_id;
  perform sel_avisar(v_cand, 'entrevista', 'Tu entrevista se ha cancelado', 'Nos pondremos en contacto contigo para concretar otra fecha.',
    jsonb_build_object('candidatura_id', e.candidatura_id));
  perform sel_auditar('entrevista_cancelada', 'entrevista', p_id::text, jsonb_build_object('candidatura', e.candidatura_id));
end $$;

create or replace function sel_marcar_entrevista_realizada(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare e seleccion_entrevistas%rowtype;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  select * into e from seleccion_entrevistas where id = p_id;
  if e.id is null then raise exception 'Entrevista no encontrada'; end if;
  if not (sel_es_responsable() or (sel_es_equipo() and exists (select 1 from seleccion_entrevistadores where entrevista_id = p_id and user_id = auth.uid()))) then
    raise exception 'No autorizado';
  end if;
  if e.estado <> 'programada' then raise exception 'Solo se marca como realizada una entrevista programada.'; end if;
  update seleccion_entrevistas set estado = 'realizada' where id = p_id;
  perform sel_auditar('entrevista_realizada', 'entrevista', p_id::text, '{}'::jsonb);
end $$;

-- ----------------------------------------------------------------------------
-- 9) Evaluaciones (5 criterios + global + recomendación). No deciden nada por sí solas.
-- ----------------------------------------------------------------------------
create or replace function sel_guardar_evaluacion(p_entrevista uuid, p_conocimientos smallint, p_experiencia smallint,
  p_comunicacion smallint, p_encaje smallint, p_motivacion smallint, p_global smallint, p_recomendacion text,
  p_comentarios text, p_cerrar boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare e seleccion_entrevistas%rowtype; v_id uuid;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  select * into e from seleccion_entrevistas where id = p_entrevista;
  if e.id is null then raise exception 'Entrevista no encontrada'; end if;
  if not (sel_es_equipo() and exists (select 1 from seleccion_entrevistadores where entrevista_id = p_entrevista and user_id = auth.uid())) then
    raise exception 'Solo evalúan las personas asignadas a la entrevista.';
  end if;
  if e.estado <> 'realizada' then raise exception 'La entrevista aún no está marcada como realizada.'; end if;
  if p_cerrar and (p_conocimientos is null or p_experiencia is null or p_comunicacion is null or p_encaje is null
                   or p_motivacion is null or p_global is null or p_recomendacion is null) then
    raise exception 'Para cerrar la evaluación rellena los cinco criterios, la valoración global y la recomendación.';
  end if;
  insert into seleccion_evaluaciones (entrevista_id, candidatura_id, evaluador_id, c_conocimientos, c_experiencia, c_comunicacion,
    c_encaje, c_motivacion, valoracion_global, recomendacion, comentarios, cerrada)
  values (p_entrevista, e.candidatura_id, auth.uid(), p_conocimientos, p_experiencia, p_comunicacion, p_encaje, p_motivacion,
          p_global, p_recomendacion, nullif(btrim(p_comentarios), ''), coalesce(p_cerrar, false))
  on conflict (entrevista_id, evaluador_id) do update set
    c_conocimientos = excluded.c_conocimientos, c_experiencia = excluded.c_experiencia, c_comunicacion = excluded.c_comunicacion,
    c_encaje = excluded.c_encaje, c_motivacion = excluded.c_motivacion, valoracion_global = excluded.valoracion_global,
    recomendacion = excluded.recomendacion, comentarios = excluded.comentarios, cerrada = excluded.cerrada
  returning id into v_id;
  return v_id;
end $$;

create or replace function sel_reabrir_evaluacion(p_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform sel_exigir_responsable();
  if length(btrim(coalesce(p_motivo, ''))) < 3 then raise exception 'Escribe el motivo de la reapertura.'; end if;
  update seleccion_evaluaciones set cerrada = false where id = p_id and cerrada;
  if not found then raise exception 'Evaluación no encontrada o ya abierta.'; end if;
  perform sel_auditar('evaluacion_reabierta', 'evaluacion', p_id::text, jsonb_build_object('motivo', btrim(p_motivo)));
end $$;

-- ----------------------------------------------------------------------------
-- 10) Mensajes
-- ----------------------------------------------------------------------------
create or replace function sel_enviar_mensaje(p_candidatura uuid, p_texto text)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_cand uuid; v_id bigint;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  select candidato_id into v_cand from seleccion_candidaturas where id = p_candidatura;
  if v_cand is null then raise exception 'Candidatura no encontrada'; end if;
  if v_cand = auth.uid() then
    insert into seleccion_mensajes (candidatura_id, autor_id, de_candidato, texto) values (p_candidatura, auth.uid(), true, p_texto) returning id into v_id;
    perform sel_avisar_responsables('mensaje_candidato', 'Mensaje de un candidato', 'Tienes un mensaje nuevo.', jsonb_build_object('candidatura_id', p_candidatura));
  elsif sel_es_responsable() then
    insert into seleccion_mensajes (candidatura_id, autor_id, de_candidato, texto) values (p_candidatura, auth.uid(), false, p_texto) returning id into v_id;
    perform sel_avisar(v_cand, 'mensaje', 'Tienes un mensaje nuevo', 'Entra en tu portal para leerlo.', jsonb_build_object('candidatura_id', p_candidatura));
  else
    raise exception 'No autorizado';
  end if;
  return v_id;
end $$;

create or replace function sel_marcar_leidos(p_candidatura uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_cand uuid;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  select candidato_id into v_cand from seleccion_candidaturas where id = p_candidatura;
  if v_cand = auth.uid() then
    update seleccion_mensajes set leido_at = now() where candidatura_id = p_candidatura and not de_candidato and leido_at is null;
  elsif sel_es_responsable() then
    update seleccion_mensajes set leido_at = now() where candidatura_id = p_candidatura and de_candidato and leido_at is null;
  else
    raise exception 'No autorizado';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 11) Métricas del dashboard
-- ----------------------------------------------------------------------------
create or replace function sel_metricas()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  perform sel_exigir_responsable();
  select jsonb_build_object(
    'candidaturas_por_estado', coalesce((select jsonb_object_agg(estado, n) from (select estado, count(*) n from seleccion_candidaturas group by 1) x), '{}'::jsonb),
    'ofertas_por_estado', coalesce((select jsonb_object_agg(estado, n) from (select estado, count(*) n from seleccion_ofertas where not plantilla group by 1) x), '{}'::jsonb),
    'candidaturas_por_oferta', coalesce((select jsonb_agg(jsonb_build_object('oferta_id', o.id, 'titulo', o.titulo, 'estado', o.estado,
        'candidaturas', (select count(*) from seleccion_candidaturas c where c.oferta_id = o.id),
        'contratadas', (select count(*) from seleccion_candidaturas c where c.oferta_id = o.id and c.estado = 'contratada')) order by o.created_at desc)
      from seleccion_ofertas o where not o.plantilla), '[]'::jsonb),
    'entrevistas_proximas_7d', (select count(*) from seleccion_entrevistas where estado = 'programada' and fecha_hora between now() and now() + interval '7 days'),
    'entrevistas_vencidas_sin_realizar', (select count(*) from seleccion_entrevistas where estado = 'programada' and fecha_hora < now()),
    'evaluaciones_pendientes', (select count(*) from seleccion_entrevistadores ee join seleccion_entrevistas e on e.id = ee.entrevista_id
        where e.estado = 'realizada' and not exists (select 1 from seleccion_evaluaciones v where v.entrevista_id = e.id and v.evaluador_id = ee.user_id and v.cerrada)),
    'dias_medios_hasta_contratacion', (select round(avg(extract(epoch from (h.at - c.created_at)) / 86400)::numeric, 1)
        from seleccion_candidaturas c join seleccion_historial h on h.candidatura_id = c.id and h.estado_nuevo = 'contratada' where c.estado = 'contratada'),
    'sin_movimiento_14d', (select count(*) from seleccion_candidaturas where estado not in ('contratada', 'rechazada', 'retirada', 'descartada_por_caducidad') and updated_at < now() - interval '14 days'),
    'mensajes_sin_leer_del_candidato', (select count(*) from seleccion_mensajes where de_candidato and leido_at is null),
    'solicitudes_datos_pendientes', (select count(*) from seleccion_solicitudes_datos where estado in ('pendiente', 'en_curso')),
    'candidatos_total', (select count(*) from seleccion_candidatos)
  ) into r;
  return r;
end $$;

-- ----------------------------------------------------------------------------
-- 12) Derechos de protección de datos (acceso, rectificación, supresión). SIN borrado automático.
-- ----------------------------------------------------------------------------
create or replace function sel_solicitar_derecho(p_tipo text, p_detalle text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if not exists (select 1 from seleccion_candidatos where user_id = auth.uid()) then raise exception 'No eres candidato.'; end if;
  if p_tipo not in ('acceso', 'rectificacion', 'supresion') then raise exception 'Tipo de solicitud no válido'; end if;
  insert into seleccion_solicitudes_datos (candidato_id, tipo, detalle) values (auth.uid(), p_tipo, nullif(btrim(p_detalle), '')) returning id into v_id;
  perform sel_auditar('solicitud_datos', 'solicitud', v_id::text, jsonb_build_object('tipo', p_tipo));
  perform sel_avisar_responsables('solicitud_datos', 'Solicitud de protección de datos', 'Un candidato ha enviado una solicitud de ' || p_tipo || '.', jsonb_build_object('solicitud_id', v_id));
  return v_id;
end $$;

create or replace function sel_resolver_solicitud(p_id uuid, p_estado text, p_respuesta text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_cand uuid;
begin
  perform sel_exigir_responsable();
  if p_estado not in ('en_curso', 'resuelta', 'rechazada') then raise exception 'Estado no válido'; end if;
  if p_estado in ('resuelta', 'rechazada') and length(btrim(coalesce(p_respuesta, ''))) < 3 then raise exception 'Escribe la respuesta al candidato.'; end if;
  update seleccion_solicitudes_datos set estado = p_estado, respuesta = nullif(btrim(p_respuesta), ''),
    resuelta_at = case when p_estado in ('resuelta', 'rechazada') then now() else null end,
    resuelta_por = case when p_estado in ('resuelta', 'rechazada') then auth.uid() else null end
  where id = p_id returning candidato_id into v_cand;
  if v_cand is null then raise exception 'Solicitud no encontrada'; end if;
  perform sel_auditar('solicitud_resuelta', 'solicitud', p_id::text, jsonb_build_object('estado', p_estado));
  perform sel_avisar(v_cand, 'solicitud_datos', 'Tu solicitud de datos tiene respuesta', 'Consúltala en tu portal.', jsonb_build_object('solicitud_id', p_id));
end $$;

-- Derecho de acceso: copia de los datos del candidato. No incluye notas privadas ni evaluaciones internas
-- (criterio pendiente de validación legal).
create or replace function sel_exportar_datos(p_candidato uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user uuid := coalesce(p_candidato, auth.uid()); r jsonb;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if v_user <> auth.uid() then perform sel_exigir_responsable(); end if;
  if not exists (select 1 from seleccion_candidatos where user_id = v_user) then raise exception 'Candidato no encontrado'; end if;
  select jsonb_build_object(
    'generado', now(),
    'perfil', (select to_jsonb(c) - 'user_id' from seleccion_candidatos c where c.user_id = v_user),
    'candidaturas', coalesce((select jsonb_agg(jsonb_build_object('oferta', o.titulo, 'estado', c.estado, 'respuestas', c.respuestas,
        'carta', c.carta, 'fecha', c.created_at,
        'cambios_de_estado', (select coalesce(jsonb_agg(jsonb_build_object('de', h.estado_anterior, 'a', h.estado_nuevo, 'fecha', h.at) order by h.at), '[]'::jsonb) from seleccion_historial h where h.candidatura_id = c.id),
        'entrevistas', (select coalesce(jsonb_agg(jsonb_build_object('fecha', e.fecha_hora, 'modalidad', e.modalidad, 'estado', e.estado) order by e.fecha_hora), '[]'::jsonb) from seleccion_entrevistas e where e.candidatura_id = c.id),
        'mensajes', (select coalesce(jsonb_agg(jsonb_build_object('de_candidato', m.de_candidato, 'texto', m.texto, 'fecha', m.created_at) order by m.created_at), '[]'::jsonb) from seleccion_mensajes m where m.candidatura_id = c.id)))
      from seleccion_candidaturas c join seleccion_ofertas o on o.id = c.oferta_id where c.candidato_id = v_user), '[]'::jsonb),
    'solicitudes', coalesce((select jsonb_agg(to_jsonb(s) - 'candidato_id') from seleccion_solicitudes_datos s where s.candidato_id = v_user), '[]'::jsonb)
  ) into r;
  perform sel_auditar('exportacion_datos', 'candidato', v_user::text, jsonb_build_object('solicitante', auth.uid()));
  return r;
end $$;

create or replace function sel_rutas_archivos(p_user uuid)
returns table (ruta text) language plpgsql stable security definer set search_path = public as $$
begin
  perform sel_exigir_responsable();
  return query select o.name from storage.objects o where o.bucket_id = 'seleccion-cv' and (storage.foldername(o.name))[1] = p_user::text;
end $$;

-- Supresión: solo el superadministrador. Los archivos se borran ANTES con la API de Storage
-- (borrar filas de storage.objects por SQL dejaría el archivo en el almacenamiento).
create or replace function sel_suprimir_candidato(p_user uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  perform sel_exigir_superadmin();
  if length(btrim(coalesce(p_motivo, ''))) < 3 then raise exception 'Escribe el motivo de la supresión.'; end if;
  if not exists (select 1 from seleccion_candidatos where user_id = p_user) then raise exception 'Candidato no encontrado'; end if;
  if exists (select 1 from storage.objects where bucket_id = 'seleccion-cv' and (storage.foldername(name))[1] = p_user::text) then
    raise exception 'Borra antes los archivos del candidato con la API de Storage.';
  end if;
  select count(*) into v_n from seleccion_candidaturas where candidato_id = p_user;
  perform sel_auditar('candidato_suprimido', 'candidato', p_user::text, jsonb_build_object('candidaturas', v_n, 'motivo', btrim(p_motivo)));
  delete from seleccion_notificaciones where user_id = p_user;
  delete from seleccion_candidatos where user_id = p_user;
end $$;

-- Candidatos sin actividad más allá del plazo configurado. SOLO LISTA; no borra nada.
create or replace function sel_candidatos_caducados()
returns table (user_id uuid, nombre_completo text, ultimo_movimiento timestamptz, meses_sin_movimiento numeric)
language plpgsql stable security definer set search_path = public as $$
declare v_meses integer;
begin
  perform sel_exigir_responsable();
  select coalesce((valor #>> '{}')::integer, 12) into v_meses from seleccion_config where clave = 'conservacion_meses';
  return query
  select c.user_id, c.nombre_completo, u.ult,
         round((extract(epoch from (now() - u.ult)) / 2629800)::numeric, 1)
  from seleccion_candidatos c
  cross join lateral (select greatest(c.updated_at, coalesce((select max(a.updated_at) from seleccion_candidaturas a where a.candidato_id = c.user_id), c.updated_at),
        coalesce((select max(m.created_at) from seleccion_mensajes m join seleccion_candidaturas a on a.id = m.candidatura_id where a.candidato_id = c.user_id), c.updated_at)) ult) u
  where u.ult < now() - make_interval(months => v_meses)
  order by u.ult;
end $$;

create or replace function sel_actualizar_config(p_clave text, p_valor jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform sel_exigir_superadmin();
  if p_clave <> 'conservacion_meses' then
    raise exception 'Este ajuste no se cambia aquí: el borrado automático y la validación legal no están habilitados en esta fase.';
  end if;
  if jsonb_typeof(p_valor) <> 'number' or (p_valor #>> '{}')::numeric not between 1 and 60 or (p_valor #>> '{}')::numeric <> trunc((p_valor #>> '{}')::numeric) then
    raise exception 'El plazo son meses enteros, de 1 a 60.';
  end if;
  update seleccion_config set valor = p_valor, updated_at = now() where clave = p_clave;
  perform sel_auditar('config_cambiada', 'config', p_clave, jsonb_build_object('valor', p_valor));
end $$;

-- ----------------------------------------------------------------------------
-- 13) Vistas
-- ----------------------------------------------------------------------------
-- Ofertas publicadas (lo único que se ve sin sesión)
create or replace view seleccion_ofertas_publicas as
  select id, titulo, descripcion, ubicacion, modalidad, tipo_contrato, preguntas, publicada_at
  from seleccion_ofertas where estado = 'abierta' and not plantilla;

-- Entrevistas del propio candidato (sin motivos internos)
-- Candidaturas propias con el título de la oferta (la oferta puede estar ya cerrada y la tabla de ofertas es solo del equipo).
create or replace view seleccion_mis_candidaturas as
  select c.id, c.oferta_id, o.titulo as oferta_titulo, o.ubicacion, o.modalidad, o.preguntas, c.estado, c.created_at, c.updated_at
  from seleccion_candidaturas c join seleccion_ofertas o on o.id = c.oferta_id
  where c.candidato_id = auth.uid();

create or replace view seleccion_mis_entrevistas as
  select e.id, e.candidatura_id, e.fecha_hora, e.duracion_min, e.modalidad, e.lugar_enlace, e.estado
  from seleccion_entrevistas e join seleccion_candidaturas c on c.id = e.candidatura_id
  where c.candidato_id = auth.uid() and e.estado in ('programada', 'realizada', 'cancelada');

-- ----------------------------------------------------------------------------
-- 14) RLS
-- ----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['seleccion_usuarios', 'seleccion_candidatos', 'seleccion_ofertas', 'seleccion_candidaturas', 'seleccion_historial',
    'seleccion_entrevistas', 'seleccion_entrevistadores', 'seleccion_evaluaciones', 'seleccion_notas_privadas', 'seleccion_mensajes',
    'seleccion_notificaciones', 'seleccion_solicitudes_datos', 'seleccion_auditoria', 'seleccion_config'] loop
    execute format('alter table %s enable row level security', t);
  end loop;
end $$;

drop policy if exists sel_usuarios_select on seleccion_usuarios;
create policy sel_usuarios_select on seleccion_usuarios for select using (user_id = auth.uid() or sel_es_responsable());

drop policy if exists sel_candidatos_select on seleccion_candidatos;
create policy sel_candidatos_select on seleccion_candidatos for select using (sel_puede_ver_candidato(user_id));
drop policy if exists sel_candidatos_update on seleccion_candidatos;
create policy sel_candidatos_update on seleccion_candidatos for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists sel_ofertas_select on seleccion_ofertas;
create policy sel_ofertas_select on seleccion_ofertas for select using (sel_es_equipo());
drop policy if exists sel_ofertas_insert on seleccion_ofertas;
create policy sel_ofertas_insert on seleccion_ofertas for insert with check (sel_es_responsable());
drop policy if exists sel_ofertas_update on seleccion_ofertas;
create policy sel_ofertas_update on seleccion_ofertas for update using (sel_es_responsable()) with check (sel_es_responsable());
drop policy if exists sel_ofertas_delete on seleccion_ofertas;
create policy sel_ofertas_delete on seleccion_ofertas for delete using (sel_es_responsable());

drop policy if exists sel_candidaturas_select on seleccion_candidaturas;
create policy sel_candidaturas_select on seleccion_candidaturas for select using (sel_puede_ver_candidatura(id));

-- El candidato NO ve el historial interno (motivos); el equipo sí, según la misma visibilidad que la candidatura
drop policy if exists sel_historial_select on seleccion_historial;
create policy sel_historial_select on seleccion_historial for select using (sel_es_equipo() and sel_puede_ver_candidatura(candidatura_id));

drop policy if exists sel_entrevistas_select on seleccion_entrevistas;
create policy sel_entrevistas_select on seleccion_entrevistas for select using (
  sel_es_responsable()
  or (sel_es_equipo() and exists (select 1 from seleccion_entrevistadores ee where ee.entrevista_id = seleccion_entrevistas.id and ee.user_id = auth.uid()))
);

drop policy if exists sel_entrevistadores_select on seleccion_entrevistadores;
create policy sel_entrevistadores_select on seleccion_entrevistadores for select using (sel_es_responsable() or user_id = auth.uid());

-- Evaluaciones: cada entrevistador ve las suyas; responsable y superadministrador ven todas. El candidato nunca.
drop policy if exists sel_evaluaciones_select on seleccion_evaluaciones;
create policy sel_evaluaciones_select on seleccion_evaluaciones for select using (sel_es_equipo() and (evaluador_id = auth.uid() or sel_es_responsable()));

-- Notas privadas: aisladas por autor; el responsable y el superadministrador pueden LEER (supervisión) pero no editar las de otros
drop policy if exists sel_notas_select on seleccion_notas_privadas;
create policy sel_notas_select on seleccion_notas_privadas for select using (sel_es_equipo() and (autor_id = auth.uid() or sel_es_responsable()));
drop policy if exists sel_notas_insert on seleccion_notas_privadas;
create policy sel_notas_insert on seleccion_notas_privadas for insert
  with check (sel_es_equipo() and autor_id = auth.uid() and sel_puede_ver_candidatura(candidatura_id));
drop policy if exists sel_notas_update on seleccion_notas_privadas;
create policy sel_notas_update on seleccion_notas_privadas for update using (sel_es_equipo() and autor_id = auth.uid()) with check (autor_id = auth.uid());
drop policy if exists sel_notas_delete on seleccion_notas_privadas;
create policy sel_notas_delete on seleccion_notas_privadas for delete using (sel_es_equipo() and autor_id = auth.uid());

drop policy if exists sel_mensajes_select on seleccion_mensajes;
create policy sel_mensajes_select on seleccion_mensajes for select
  using (exists (select 1 from seleccion_candidaturas c where c.id = candidatura_id and c.candidato_id = auth.uid()) or sel_es_responsable());

drop policy if exists sel_notif_select on seleccion_notificaciones;
create policy sel_notif_select on seleccion_notificaciones for select using (user_id = auth.uid());
drop policy if exists sel_notif_update on seleccion_notificaciones;
create policy sel_notif_update on seleccion_notificaciones for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists sel_solicitudes_select on seleccion_solicitudes_datos;
create policy sel_solicitudes_select on seleccion_solicitudes_datos for select using (candidato_id = auth.uid() or sel_es_responsable());

drop policy if exists sel_auditoria_select on seleccion_auditoria;
create policy sel_auditoria_select on seleccion_auditoria for select using (sel_es_responsable());

drop policy if exists sel_config_select on seleccion_config;
create policy sel_config_select on seleccion_config for select using (sel_es_equipo());

-- ----------------------------------------------------------------------------
-- 15) Privilegios de tabla: nada para anon; mínimos para authenticated (RLS decide el resto)
-- ----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['seleccion_usuarios', 'seleccion_candidatos', 'seleccion_ofertas', 'seleccion_candidaturas', 'seleccion_historial',
    'seleccion_entrevistas', 'seleccion_entrevistadores', 'seleccion_evaluaciones', 'seleccion_notas_privadas', 'seleccion_mensajes',
    'seleccion_notificaciones', 'seleccion_solicitudes_datos', 'seleccion_auditoria', 'seleccion_config'] loop
    execute format('revoke all on %s from public, anon, authenticated', t);
    execute format('grant select on %s to authenticated', t);
  end loop;
end $$;
grant update (nombre_completo, telefono, localidad, resumen, cv_path) on seleccion_candidatos to authenticated;
grant insert, update, delete on seleccion_ofertas to authenticated;
grant insert, update, delete on seleccion_notas_privadas to authenticated;
grant update (leida) on seleccion_notificaciones to authenticated;

revoke all on seleccion_ofertas_publicas, seleccion_mis_entrevistas, seleccion_mis_candidaturas from public, anon, authenticated;
grant select on seleccion_ofertas_publicas to anon, authenticated;
grant select on seleccion_mis_entrevistas to authenticated;
grant select on seleccion_mis_candidaturas to authenticated;

-- ----------------------------------------------------------------------------
-- 16) Privilegios de funciones
-- ----------------------------------------------------------------------------
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as firma, p.proname from pg_proc p
           where p.pronamespace = 'public'::regnamespace and p.proname like 'sel\_%' loop
    execute format('revoke all on function %s from public, anon, authenticated', f.firma);
    if f.proname not in ('sel_auditar', 'sel_avisar', 'sel_avisar_responsables', 'sel_tocar_updated_at', 'sel_historial_inmutable',
        'sel_auditoria_inmutable', 'sel_mensajes_inmutables', 'sel_registrar_estado', 'sel_auditar_evaluacion', 'sel_evaluacion_cerrada',
        'sel_oferta_estado', 'sel_candidato_protegido', 'sel_candidatura_protegida') then
      execute format('grant execute on function %s to authenticated', f.firma);
    end if;
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 17) Storage privado para los CV
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('seleccion-cv', 'seleccion-cv', false, 5242880,
  array['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do update set public = false, file_size_limit = 5242880,
  allowed_mime_types = array['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];

create or replace function sel_puede_ver_ruta(p_ruta text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v uuid;
begin
  begin v := (storage.foldername(p_ruta))[1]::uuid; exception when others then return false; end;
  return sel_puede_ver_candidato(v);
end $$;
revoke all on function sel_puede_ver_ruta(text) from public, anon;
grant execute on function sel_puede_ver_ruta(text) to authenticated;

drop policy if exists seleccion_cv_select on storage.objects;
create policy seleccion_cv_select on storage.objects for select
  using (bucket_id = 'seleccion-cv' and sel_puede_ver_ruta(name));
drop policy if exists seleccion_cv_insert on storage.objects;
create policy seleccion_cv_insert on storage.objects for insert
  with check (bucket_id = 'seleccion-cv' and (storage.foldername(name))[1] = auth.uid()::text
              and exists (select 1 from seleccion_candidatos where user_id = auth.uid()));
drop policy if exists seleccion_cv_update on storage.objects;
create policy seleccion_cv_update on storage.objects for update
  using (bucket_id = 'seleccion-cv' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'seleccion-cv' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists seleccion_cv_delete on storage.objects;
create policy seleccion_cv_delete on storage.objects for delete
  using (bucket_id = 'seleccion-cv' and ((storage.foldername(name))[1] = auth.uid()::text or sel_es_superadmin()));