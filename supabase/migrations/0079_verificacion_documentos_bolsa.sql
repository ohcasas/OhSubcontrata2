-- 0079_verificacion_documentos_bolsa.sql
-- Verificación de candidatos por documentación + documentos (fotos/PDF) en la ficha.
--
-- Qué hace
--  · El candidato se registra como "pendiente". Hasta que 3B verifique su documentación
--    (que envía por correo en PDF) solo ve un aviso: no puede postular, escribir mensajes,
--    guardar su perfil profesional ni entrar en la bolsa.
--  · Un responsable verifica o rechaza desde el panel (queda auditado y el candidato recibe un aviso interno).
--  · Los candidatos verificados son los únicos que aparecen en las búsquedas de la bolsa.
--  · Ficha con documentos: el equipo sube fotos y PDF (bucket privado "seleccion-docs").
--  · Panel: listado agrupado por oficio (sel_bolsa_panel) y ficha completa (sel_candidato_ficha).
--  · No envía correos, no crea tareas programadas, no borra nada. Las decisiones siguen siendo humanas:
--    no hay puntuaciones automáticas.
-- Idempotente: se puede ejecutar más de una vez.

-- ----------------------------------------------------------------------------
-- 1) Verificación en el candidato
-- ----------------------------------------------------------------------------
alter table seleccion_candidatos add column if not exists verificacion text not null default 'pendiente';
alter table seleccion_candidatos add column if not exists verificado_at timestamptz;
alter table seleccion_candidatos add column if not exists verificado_por uuid;
alter table seleccion_candidatos add column if not exists verificacion_nota text;
alter table seleccion_candidatos drop constraint if exists seleccion_candidatos_verificacion_chk;
alter table seleccion_candidatos add constraint seleccion_candidatos_verificacion_chk
  check (verificacion in ('pendiente', 'verificado', 'rechazado'));
alter table seleccion_candidatos drop constraint if exists seleccion_candidatos_nota_chk;
alter table seleccion_candidatos add constraint seleccion_candidatos_nota_chk
  check (verificacion_nota is null or length(verificacion_nota) <= 500);

-- El candidato no puede cambiar su verificación (las columnas editables ya están limitadas por permisos;
-- esto lo refuerza por si algún día se amplían).
create or replace function sel_candidato_protegido()
returns trigger language plpgsql as $$
begin
  if new.user_id is distinct from old.user_id or new.email is distinct from old.email
     or new.consentimiento_version is distinct from old.consentimiento_version
     or new.consentimiento_at is distinct from old.consentimiento_at then
    raise exception 'Estos datos no se cambian por esta vía.';
  end if;
  if (new.verificacion is distinct from old.verificacion or new.verificado_at is distinct from old.verificado_at
      or new.verificado_por is distinct from old.verificado_por or new.verificacion_nota is distinct from old.verificacion_nota)
     and current_setting('seleccion.verificando', true) is distinct from 'on' then
    raise exception 'La verificación solo la gestiona el equipo de 3B.';
  end if;
  return new;
end $$;

create or replace function sel_exigir_verificado()
returns void language plpgsql stable security definer set search_path = public as $$
declare v text;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  select verificacion into v from seleccion_candidatos where user_id = auth.uid();
  if v is null then return; end if;  -- sin ficha de candidato: lo resuelve cada función
  if v <> 'verificado' then
    raise exception 'Tu documentación aún no está verificada. Envíala por correo a 3B y te avisaremos cuando puedas acceder.';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 2) Documentos de la ficha (fotos y PDF subidos por el equipo)
-- ----------------------------------------------------------------------------
create table if not exists seleccion_documentos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references seleccion_candidatos (user_id) on delete cascade,
  tipo text not null check (tipo in ('foto', 'pdf')),
  nombre text not null check (length(btrim(nombre)) between 1 and 160),
  ruta text not null unique,
  subido_por uuid,
  created_at timestamptz not null default now(),
  check (ruta like user_id::text || '/%')
);
create index if not exists idx_sel_documentos_user on seleccion_documentos (user_id, created_at);

alter table seleccion_documentos enable row level security;
drop policy if exists sel_documentos_select on seleccion_documentos;
create policy sel_documentos_select on seleccion_documentos for select
  using (sel_es_responsable() or user_id = auth.uid());
revoke all on seleccion_documentos from public, anon, authenticated;
grant select on seleccion_documentos to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('seleccion-docs', 'seleccion-docs', false, 10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 10485760,
  allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

drop policy if exists seleccion_docs_select on storage.objects;
create policy seleccion_docs_select on storage.objects for select
  using (bucket_id = 'seleccion-docs' and sel_puede_ver_ruta(name));
drop policy if exists seleccion_docs_insert on storage.objects;
create policy seleccion_docs_insert on storage.objects for insert
  with check (bucket_id = 'seleccion-docs' and sel_es_responsable()
              and exists (select 1 from seleccion_candidatos where user_id::text = (storage.foldername(name))[1]));
drop policy if exists seleccion_docs_delete on storage.objects;
create policy seleccion_docs_delete on storage.objects for delete
  using (bucket_id = 'seleccion-docs' and sel_es_responsable());

-- Registra un archivo ya subido a "seleccion-docs/<candidato>/<archivo>"
create or replace function sel_registrar_documento(p_user uuid, p_tipo text, p_nombre text, p_ruta text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform sel_exigir_responsable();
  if not exists (select 1 from seleccion_candidatos where user_id = p_user) then raise exception 'Candidato no encontrado'; end if;
  if p_tipo not in ('foto', 'pdf') then raise exception 'Tipo de documento no válido'; end if;
  if p_ruta is null or p_ruta not like p_user::text || '/%' then raise exception 'Ruta no válida'; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'seleccion-docs' and name = p_ruta) then
    raise exception 'El archivo no se ha subido';
  end if;
  if (select count(*) from seleccion_documentos where user_id = p_user) >= 30 then
    raise exception 'Máximo 30 documentos por ficha.';
  end if;
  insert into seleccion_documentos (user_id, tipo, nombre, ruta, subido_por)
  values (p_user, p_tipo, left(btrim(p_nombre), 160), p_ruta, auth.uid()) returning id into v_id;
  perform sel_auditar('documento_subido', 'candidato', p_user::text, jsonb_build_object('documento', v_id, 'tipo', p_tipo));
  return v_id;
end $$;

-- Quita el registro y devuelve la ruta para que el panel borre el archivo del almacenamiento
create or replace function sel_eliminar_documento(p_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare d seleccion_documentos;
begin
  perform sel_exigir_responsable();
  select * into d from seleccion_documentos where id = p_id;
  if not found then raise exception 'Documento no encontrado'; end if;
  delete from seleccion_documentos where id = p_id;
  perform sel_auditar('documento_eliminado', 'candidato', d.user_id::text, jsonb_build_object('documento', p_id, 'tipo', d.tipo));
  return d.ruta;
end $$;

-- ----------------------------------------------------------------------------
-- 3) Verificar / rechazar / volver a pendiente
-- ----------------------------------------------------------------------------
create or replace function sel_verificar_candidato(p_user uuid, p_estado text, p_nota text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_prev text;
begin
  perform sel_exigir_responsable();
  if p_estado not in ('verificado', 'rechazado', 'pendiente') then raise exception 'Estado no válido'; end if;
  select verificacion into v_prev from seleccion_candidatos where user_id = p_user;
  if v_prev is null then raise exception 'Candidato no encontrado'; end if;
  perform set_config('seleccion.verificando', 'on', true);
  update seleccion_candidatos set verificacion = p_estado,
    verificado_at = case when p_estado = 'pendiente' then null else now() end,
    verificado_por = case when p_estado = 'pendiente' then null else auth.uid() end,
    verificacion_nota = nullif(left(btrim(coalesce(p_nota, '')), 500), '')
  where user_id = p_user;
  -- si deja de estar verificado, sale de la bolsa (no se muestra a nadie)
  if p_estado <> 'verificado' then
    update seleccion_perfil_profesional set en_bolsa = false where user_id = p_user and en_bolsa;
  end if;
  perform sel_auditar('verificacion_candidato', 'candidato', p_user::text,
    jsonb_build_object('de', v_prev, 'a', p_estado));
  if p_estado = 'verificado' then
    perform sel_avisar(p_user, 'verificacion', 'Documentación verificada',
      'Ya puedes acceder a tu panel: completa tu perfil profesional y entra en la bolsa de empleo.', '{}'::jsonb);
  elsif p_estado = 'rechazado' then
    perform sel_avisar(p_user, 'verificacion', 'Documentación no verificada',
      coalesce(nullif(btrim(p_nota), ''), 'No hemos podido verificar tu documentación. Escríbenos para revisarlo.'), '{}'::jsonb);
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 4) Funciones existentes: solo candidatos verificados
-- ----------------------------------------------------------------------------
create or replace function sel_postular(p_oferta uuid, p_respuestas jsonb default '{}'::jsonb, p_carta text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_titulo text;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  perform sel_exigir_verificado();
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


create or replace function sel_enviar_mensaje(p_candidatura uuid, p_texto text)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_cand uuid; v_id bigint;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  select candidato_id into v_cand from seleccion_candidaturas where id = p_candidatura;
  if v_cand is null then raise exception 'Candidatura no encontrada'; end if;
  if v_cand = auth.uid() then
    perform sel_exigir_verificado();
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
  perform sel_exigir_verificado();
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


create or replace function sel_entrar_bolsa(p_version_consentimiento text, p_acepta boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  perform sel_exigir_verificado();
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
  where p.en_bolsa and c.verificacion = 'verificado'
    and c.updated_at >= now() - make_interval(months => v_meses)
    and (nullif(btrim(p_oficio), '') is null or exists (select 1 from unnest(p.oficios) o where o ilike '%' || btrim(p_oficio) || '%'))
    and (nullif(btrim(p_provincia), '') is null or exists (select 1 from unnest(p.provincias) o where o ilike '%' || btrim(p_provincia) || '%'))
    and (p_min_anios is null or coalesce(p.anios_experiencia, 0) >= p_min_anios)
    and (nullif(btrim(p_formacion), '') is null or exists (select 1 from seleccion_formacion f where f.user_id = c.user_id and f.nombre ilike '%' || btrim(p_formacion) || '%'))
  order by p.updated_at desc, c.user_id
  limit v_lim;
end $$;


create or replace function sel_bolsa_ficha(p_user uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_meses integer; r jsonb;
begin
  perform sel_exigir_responsable();
  select coalesce((valor #>> '{}')::integer, 12) into v_meses from seleccion_config where clave = 'conservacion_meses';
  v_meses := coalesce(v_meses, 12);
  if not exists (select 1 from seleccion_perfil_profesional p join seleccion_candidatos c on c.user_id = p.user_id
                 where p.user_id = p_user and p.en_bolsa and c.verificacion = 'verificado' and c.updated_at >= now() - make_interval(months => v_meses)) then
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
    'verificacion', (select jsonb_build_object('estado', c.verificacion, 'fecha', c.verificado_at) from seleccion_candidatos c where c.user_id = v_user),
    'documentos', coalesce((select jsonb_agg(jsonb_build_object('tipo', d.tipo, 'nombre', d.nombre, 'fecha', d.created_at) order by d.created_at) from seleccion_documentos d where d.user_id = v_user), '[]'::jsonb),
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
  return query select o.name from storage.objects o
    where o.bucket_id in ('seleccion-cv', 'seleccion-docs') and (storage.foldername(o.name))[1] = p_user::text;
end $$;


create or replace function sel_suprimir_candidato(p_user uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  perform sel_exigir_superadmin();
  if length(btrim(coalesce(p_motivo, ''))) < 3 then raise exception 'Escribe el motivo de la supresión.'; end if;
  if not exists (select 1 from seleccion_candidatos where user_id = p_user) then raise exception 'Candidato no encontrado'; end if;
  if exists (select 1 from storage.objects where bucket_id in ('seleccion-cv', 'seleccion-docs') and (storage.foldername(name))[1] = p_user::text) then
    raise exception 'Borra antes los archivos del candidato con la API de Storage.';
  end if;
  select count(*) into v_n from seleccion_candidaturas where candidato_id = p_user;
  perform sel_auditar('candidato_suprimido', 'candidato', p_user::text, jsonb_build_object('candidaturas', v_n, 'motivo', btrim(p_motivo)));
  delete from seleccion_notificaciones where user_id = p_user;
  delete from seleccion_candidatos where user_id = p_user;
end $$;


-- ----------------------------------------------------------------------------
-- 5) Panel: listado por oficio y ficha completa (solo responsables)
-- ----------------------------------------------------------------------------
create or replace function sel_bolsa_panel(p_estado text default null)
returns table (user_id uuid, nombre_completo text, email text, telefono text, localidad text, oficios text[],
               anios_experiencia int, en_bolsa boolean, verificacion text, num_documentos bigint, updated_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  perform sel_exigir_responsable();
  if p_estado is not null and p_estado not in ('pendiente', 'verificado', 'rechazado') then raise exception 'Estado no válido'; end if;
  perform sel_auditar('listado_bolsa_panel', 'candidato', '*', jsonb_build_object('estado', p_estado));
  return query
  select c.user_id, c.nombre_completo, c.email, c.telefono, c.localidad,
         coalesce(p.oficios, '{}'::text[]), p.anios_experiencia::int, coalesce(p.en_bolsa, false), c.verificacion,
         (select count(*) from seleccion_documentos d where d.user_id = c.user_id), c.updated_at
  from seleccion_candidatos c left join seleccion_perfil_profesional p on p.user_id = c.user_id
  where p_estado is null or c.verificacion = p_estado
  order by c.nombre_completo;
end $$;

create or replace function sel_candidato_ficha(p_user uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  perform sel_exigir_responsable();
  if not exists (select 1 from seleccion_candidatos where user_id = p_user) then raise exception 'Candidato no encontrado'; end if;
  perform sel_auditar('ficha_candidato_panel', 'candidato', p_user::text, '{}'::jsonb);
  select jsonb_build_object(
    'candidato', (select jsonb_build_object('user_id', c.user_id, 'nombre_completo', c.nombre_completo, 'email', c.email,
        'telefono', c.telefono, 'localidad', c.localidad, 'resumen', c.resumen, 'cv_path', c.cv_path,
        'verificacion', c.verificacion, 'verificado_at', c.verificado_at, 'verificacion_nota', c.verificacion_nota,
        'registrado', c.created_at, 'actualizado', c.updated_at) from seleccion_candidatos c where c.user_id = p_user),
    'perfil', (select to_jsonb(p) - 'user_id' from seleccion_perfil_profesional p where p.user_id = p_user),
    'formacion', coalesce((select jsonb_agg(jsonb_build_object('tipo', f.tipo, 'nombre', f.nombre, 'entidad', f.entidad, 'anio', f.anio) order by f.created_at, f.id)
                           from seleccion_formacion f where f.user_id = p_user), '[]'::jsonb),
    'documentos', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'tipo', d.tipo, 'nombre', d.nombre, 'ruta', d.ruta, 'fecha', d.created_at) order by d.created_at)
                            from seleccion_documentos d where d.user_id = p_user), '[]'::jsonb)
  ) into r;
  return r;
end $$;

-- ----------------------------------------------------------------------------
-- 6) Privilegios de funciones
-- ----------------------------------------------------------------------------
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as firma from pg_proc p
           where p.pronamespace = 'public'::regnamespace
             and p.proname in ('sel_exigir_verificado', 'sel_registrar_documento', 'sel_eliminar_documento', 'sel_verificar_candidato',
                               'sel_postular', 'sel_enviar_mensaje', 'sel_guardar_perfil_profesional', 'sel_entrar_bolsa',
                               'sel_bolsa_buscar', 'sel_bolsa_ficha', 'sel_exportar_datos', 'sel_rutas_archivos',
                               'sel_suprimir_candidato', 'sel_bolsa_panel', 'sel_candidato_ficha') loop
    execute format('revoke all on function %s from public, anon, authenticated', f.firma);
    execute format('grant execute on function %s to authenticated', f.firma);
  end loop;
end $$;