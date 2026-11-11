-- ============================================================================
-- 0078 · Bolsa de empleo: perfil profesional del candidato y bolsa consultable
-- ============================================================================
-- Se apoya en «Trabaja con nosotros» (0073). Mismas reglas:
-- · Solo el candidato edita su perfil. Solo responsables y superadministrador de
--   selección consultan la bolsa. Un admin del marketplace NO tiene acceso.
-- · Estar en la bolsa exige un consentimiento propio y distinto del de la candidatura,
--   que el candidato puede retirar cuando quiera (sel_salir_bolsa).
-- · La búsqueda NO puntúa, NO ordena por mérito y NO propone a nadie: solo filtra por
--   datos objetivos (oficio, provincia, años, formación). Ninguna decisión de contratación
--   se toma ni se sugiere automáticamente; las decisiones las toma siempre una persona.
-- · Los datos de contacto no salen en la búsqueda: solo al abrir una ficha, y cada
--   ficha abierta queda en la auditoría.
-- · Los candidatos cuyo último movimiento supera el plazo de conservación configurado
--   dejan de aparecer en la búsqueda. NO se borra nada: no hay borrado automático hasta
--   validar legalmente el plazo y la política de privacidad.
-- · Formación y certificaciones: solo se DECLARAN en texto (sin archivos adjuntos).
-- · No envía correos, no crea tareas programadas, no toca datos existentes.
-- Idempotente: se puede ejecutar más de una vez.

-- ----------------------------------------------------------------------------
-- 1) Tablas
-- ----------------------------------------------------------------------------
create table if not exists seleccion_perfil_profesional (
  user_id uuid primary key references seleccion_candidatos (user_id) on delete cascade,
  oficios text[] not null default '{}' check (cardinality(oficios) <= 5),
  anios_experiencia smallint check (anios_experiencia is null or anios_experiencia between 0 and 60),
  provincias text[] not null default '{}' check (cardinality(provincias) <= 10),
  disponibilidad text check (disponibilidad is null or disponibilidad in ('inmediata', 'un_mes', 'a_consultar')),
  tiene_vehiculo boolean not null default false,
  en_bolsa boolean not null default false,
  bolsa_consentimiento_version text,
  bolsa_consentimiento_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists seleccion_formacion (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references seleccion_candidatos (user_id) on delete cascade,
  tipo text not null check (tipo in ('curso', 'certificacion')),
  nombre text not null check (length(btrim(nombre)) between 2 and 150),
  entidad text check (entidad is null or length(entidad) <= 150),
  anio smallint check (anio is null or anio between 1950 and 2100),
  created_at timestamptz not null default now()
);
create index if not exists seleccion_formacion_user_idx on seleccion_formacion (user_id);

-- ----------------------------------------------------------------------------
-- 2) RLS y privilegios: el candidato solo LEE lo suyo; todo se escribe con funciones
-- ----------------------------------------------------------------------------
alter table seleccion_perfil_profesional enable row level security;
alter table seleccion_formacion enable row level security;

drop policy if exists sel_perfil_prof_select on seleccion_perfil_profesional;
create policy sel_perfil_prof_select on seleccion_perfil_profesional for select using (user_id = auth.uid());
drop policy if exists sel_formacion_select on seleccion_formacion;
create policy sel_formacion_select on seleccion_formacion for select using (user_id = auth.uid());

revoke all on seleccion_perfil_profesional, seleccion_formacion from public, anon, authenticated;
grant select on seleccion_perfil_profesional, seleccion_formacion to authenticated;

-- ----------------------------------------------------------------------------
-- 3) El candidato guarda su perfil profesional (y su formación completa)
-- ----------------------------------------------------------------------------
create or replace function sel_guardar_perfil_profesional(
  p_oficios text[], p_anios integer, p_provincias text[], p_disponibilidad text, p_vehiculo boolean, p_formacion jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_oficios text[];
  v_prov text[];
  f jsonb;
  v_tipo text; v_nombre text; v_entidad text; v_anio integer;
  v_n integer := 0;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if not exists (select 1 from seleccion_candidatos where user_id = auth.uid()) then raise exception 'No eres candidato.'; end if;

  -- Sin repetidos aunque cambien las mayúsculas ('Encofrador' y 'encofrador' son lo mismo)
  select coalesce(array_agg(d.v order by d.v), '{}') into v_oficios
    from (select distinct on (lower(btrim(x))) btrim(x) as v from unnest(coalesce(p_oficios, '{}')) x where btrim(x) <> '' order by lower(btrim(x)), btrim(x)) d;
  select coalesce(array_agg(d.v order by d.v), '{}') into v_prov
    from (select distinct on (lower(btrim(x))) btrim(x) as v from unnest(coalesce(p_provincias, '{}')) x where btrim(x) <> '' order by lower(btrim(x)), btrim(x)) d;
  if cardinality(v_oficios) > 5 then raise exception 'Indica como máximo 5 oficios.'; end if;
  if cardinality(v_prov) > 10 then raise exception 'Indica como máximo 10 provincias.'; end if;
  if exists (select 1 from unnest(v_oficios) x where length(x) > 60) or exists (select 1 from unnest(v_prov) x where length(x) > 60) then
    raise exception 'Un oficio o una provincia es demasiado largo.';
  end if;
  if p_anios is not null and p_anios not between 0 and 60 then raise exception 'Los años de experiencia van de 0 a 60.'; end if;
  if p_disponibilidad is not null and p_disponibilidad not in ('inmediata', 'un_mes', 'a_consultar') then raise exception 'Disponibilidad no válida.'; end if;
  if p_formacion is not null and jsonb_typeof(p_formacion) <> 'array' then raise exception 'La formación no tiene un formato válido.'; end if;
  if coalesce(jsonb_array_length(p_formacion), 0) > 20 then raise exception 'Puedes indicar hasta 20 cursos o certificaciones.'; end if;

  insert into seleccion_perfil_profesional (user_id, oficios, anios_experiencia, provincias, disponibilidad, tiene_vehiculo, updated_at)
  values (auth.uid(), v_oficios, p_anios, v_prov, p_disponibilidad, coalesce(p_vehiculo, false), now())
  on conflict (user_id) do update set oficios = excluded.oficios, anios_experiencia = excluded.anios_experiencia,
    provincias = excluded.provincias, disponibilidad = excluded.disponibilidad, tiene_vehiculo = excluded.tiene_vehiculo, updated_at = now();

  delete from seleccion_formacion where user_id = auth.uid();
  for f in select * from jsonb_array_elements(coalesce(p_formacion, '[]'::jsonb)) loop
    v_tipo := f ->> 'tipo';
    v_nombre := btrim(coalesce(f ->> 'nombre', ''));
    v_entidad := nullif(btrim(coalesce(f ->> 'entidad', '')), '');
    v_anio := nullif(btrim(coalesce(f ->> 'anio', '')), '')::integer;
    if v_tipo not in ('curso', 'certificacion') then raise exception 'Tipo de formación no válido.'; end if;
    if length(v_nombre) < 2 or length(v_nombre) > 150 then raise exception 'El nombre de cada curso o certificación debe tener entre 2 y 150 caracteres.'; end if;
    if v_entidad is not null and length(v_entidad) > 150 then raise exception 'La entidad es demasiado larga.'; end if;
    if v_anio is not null and v_anio not between 1950 and 2100 then raise exception 'El año no es válido.'; end if;
    insert into seleccion_formacion (user_id, tipo, nombre, entidad, anio) values (auth.uid(), v_tipo, v_nombre, v_entidad, v_anio);
    v_n := v_n + 1;
  end loop;

  -- Cuenta como movimiento del candidato para el plazo de conservación
  update seleccion_candidatos set updated_at = now() where user_id = auth.uid();
  -- Si ya estaba en la bolsa y se queda sin oficio, sale de ella
  if cardinality(v_oficios) = 0 then
    update seleccion_perfil_profesional set en_bolsa = false, bolsa_consentimiento_version = null, bolsa_consentimiento_at = null where user_id = auth.uid() and en_bolsa;
  end if;
end $$;

create or replace function sel_mi_perfil_profesional()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if not exists (select 1 from seleccion_candidatos where user_id = auth.uid()) then raise exception 'No eres candidato.'; end if;
  return jsonb_build_object(
    'perfil', (select to_jsonb(p) - 'user_id' from seleccion_perfil_profesional p where p.user_id = auth.uid()),
    'formacion', coalesce((select jsonb_agg(jsonb_build_object('tipo', f.tipo, 'nombre', f.nombre, 'entidad', f.entidad, 'anio', f.anio) order by f.created_at, f.id)
                           from seleccion_formacion f where f.user_id = auth.uid()), '[]'::jsonb));
end $$;

-- ----------------------------------------------------------------------------
-- 4) Entrar y salir de la bolsa (consentimiento propio, retirable)
-- ----------------------------------------------------------------------------
create or replace function sel_entrar_bolsa(p_version_consentimiento text, p_acepta boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if not exists (select 1 from seleccion_candidatos where user_id = auth.uid()) then raise exception 'No eres candidato.'; end if;
  if p_acepta is distinct from true then raise exception 'Necesitamos tu consentimiento para incluirte en la bolsa de empleo.'; end if;
  if coalesce(btrim(p_version_consentimiento), '') = '' then raise exception 'Falta la versión del texto de la bolsa.'; end if;
  if not exists (select 1 from seleccion_perfil_profesional where user_id = auth.uid() and cardinality(oficios) >= 1) then
    raise exception 'Indica al menos un oficio en tu perfil profesional antes de entrar en la bolsa.';
  end if;
  update seleccion_perfil_profesional set en_bolsa = true, bolsa_consentimiento_version = btrim(p_version_consentimiento),
    bolsa_consentimiento_at = now(), updated_at = now() where user_id = auth.uid();
  update seleccion_candidatos set updated_at = now() where user_id = auth.uid();
  perform sel_auditar('bolsa_entrada', 'candidato', auth.uid()::text, jsonb_build_object('version', btrim(p_version_consentimiento)));
end $$;

create or replace function sel_salir_bolsa()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if not exists (select 1 from seleccion_candidatos where user_id = auth.uid()) then raise exception 'No eres candidato.'; end if;
  update seleccion_perfil_profesional set en_bolsa = false, bolsa_consentimiento_version = null, bolsa_consentimiento_at = null, updated_at = now()
  where user_id = auth.uid() and en_bolsa;
  perform sel_auditar('bolsa_salida', 'candidato', auth.uid()::text, '{}'::jsonb);
end $$;

-- ----------------------------------------------------------------------------
-- 5) Consulta de la bolsa (solo responsable o superadministrador de selección)
-- ----------------------------------------------------------------------------
-- Filtra por datos objetivos. No puntúa, no ordena por mérito. Sin datos de contacto.
create or replace function sel_bolsa_buscar(p_oficio text default null, p_provincia text default null,
                                            p_min_anios integer default null, p_formacion text default null, p_limite integer default 50)
returns table (user_id uuid, nombre_completo text, localidad text, oficios text[], anios_experiencia smallint, provincias text[],
               disponibilidad text, tiene_vehiculo boolean, formacion jsonb, actualizado timestamptz)
language plpgsql security definer set search_path = public as $$
declare v_meses integer; v_lim integer := least(greatest(coalesce(p_limite, 50), 1), 100);
begin
  perform sel_exigir_responsable();
  select coalesce((valor #>> '{}')::integer, 12) into v_meses from seleccion_config where clave = 'conservacion_meses';
  v_meses := coalesce(v_meses, 12);
  perform sel_auditar('bolsa_busqueda', 'bolsa', null, jsonb_build_object('oficio', p_oficio, 'provincia', p_provincia, 'min_anios', p_min_anios, 'formacion', p_formacion));
  return query
  select c.user_id, c.nombre_completo, c.localidad, p.oficios, p.anios_experiencia, p.provincias, p.disponibilidad, p.tiene_vehiculo,
    coalesce((select jsonb_agg(jsonb_build_object('tipo', f.tipo, 'nombre', f.nombre, 'entidad', f.entidad, 'anio', f.anio) order by f.created_at, f.id)
              from seleccion_formacion f where f.user_id = c.user_id), '[]'::jsonb),
    p.updated_at
  from seleccion_perfil_profesional p
  join seleccion_candidatos c on c.user_id = p.user_id
  where p.en_bolsa
    and c.updated_at >= now() - make_interval(months => v_meses)
    and (nullif(btrim(p_oficio), '') is null or exists (select 1 from unnest(p.oficios) o where o ilike '%' || btrim(p_oficio) || '%'))
    and (nullif(btrim(p_provincia), '') is null or exists (select 1 from unnest(p.provincias) o where o ilike '%' || btrim(p_provincia) || '%'))
    and (p_min_anios is null or coalesce(p.anios_experiencia, 0) >= p_min_anios)
    and (nullif(btrim(p_formacion), '') is null or exists (select 1 from seleccion_formacion f where f.user_id = c.user_id and f.nombre ilike '%' || btrim(p_formacion) || '%'))
  order by p.updated_at desc, c.user_id
  limit v_lim;
end $$;

-- Ficha con datos de contacto: cada apertura queda auditada
create or replace function sel_bolsa_ficha(p_user uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_meses integer; r jsonb;
begin
  perform sel_exigir_responsable();
  select coalesce((valor #>> '{}')::integer, 12) into v_meses from seleccion_config where clave = 'conservacion_meses';
  v_meses := coalesce(v_meses, 12);
  if not exists (select 1 from seleccion_perfil_profesional p join seleccion_candidatos c on c.user_id = p.user_id
                 where p.user_id = p_user and p.en_bolsa and c.updated_at >= now() - make_interval(months => v_meses)) then
    raise exception 'Este candidato no está en la bolsa.';
  end if;
  select jsonb_build_object(
    'nombre_completo', c.nombre_completo, 'email', c.email, 'telefono', c.telefono, 'localidad', c.localidad, 'resumen', c.resumen,
    'tiene_cv', c.cv_path is not null,
    'oficios', p.oficios, 'anios_experiencia', p.anios_experiencia, 'provincias', p.provincias, 'disponibilidad', p.disponibilidad,
    'tiene_vehiculo', p.tiene_vehiculo, 'en_bolsa_desde', p.bolsa_consentimiento_at,
    'formacion', coalesce((select jsonb_agg(jsonb_build_object('tipo', f.tipo, 'nombre', f.nombre, 'entidad', f.entidad, 'anio', f.anio) order by f.created_at, f.id)
                           from seleccion_formacion f where f.user_id = c.user_id), '[]'::jsonb))
  into r from seleccion_candidatos c join seleccion_perfil_profesional p on p.user_id = c.user_id where c.user_id = p_user;
  perform sel_auditar('bolsa_ficha_vista', 'candidato', p_user::text, '{}'::jsonb);
  return r;
end $$;

-- ----------------------------------------------------------------------------
-- 6) Derecho de acceso: la copia de datos incluye el perfil profesional y la bolsa
-- ----------------------------------------------------------------------------
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
    'perfil_profesional', (select to_jsonb(p) - 'user_id' from seleccion_perfil_profesional p where p.user_id = v_user),
    'formacion', coalesce((select jsonb_agg(jsonb_build_object('tipo', f.tipo, 'nombre', f.nombre, 'entidad', f.entidad, 'anio', f.anio) order by f.created_at, f.id)
                           from seleccion_formacion f where f.user_id = v_user), '[]'::jsonb),
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

-- ----------------------------------------------------------------------------
-- 7) Privilegios de funciones (nada para anon; las nuevas, solo para sesión iniciada)
-- ----------------------------------------------------------------------------
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as firma from pg_proc p
           where p.pronamespace = 'public'::regnamespace
             and p.proname in ('sel_guardar_perfil_profesional', 'sel_mi_perfil_profesional', 'sel_entrar_bolsa', 'sel_salir_bolsa',
                               'sel_bolsa_buscar', 'sel_bolsa_ficha', 'sel_exportar_datos') loop
    execute format('revoke all on function %s from public, anon, authenticated', f.firma);
    execute format('grant execute on function %s to authenticated', f.firma);
  end loop;
end $$;