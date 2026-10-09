-- ============================================================================
-- Licitaciones de empresas verificadas: publicación directa  +  filtro de 3B en las
-- ofertas (postulaciones) a peticiones de particulares
-- ============================================================================
-- REQUISITO: haber ejecutado antes 0042 y 0043.
--
-- 1) Una promotora o constructora con la cuenta VERIFICADA publica su licitación
--    directamente (como antes de la 0043). Solo las peticiones de PARTICULARES pasan por
--    la revisión previa de 3B. Si alguna licitación de empresa se quedó en revisión por la
--    0043, aquí se publica.
--
-- 2) Las ofertas de las empresas a una petición de particular las filtra 3B antes de que el
--    particular las vea:
--      pendiente   -> acaba de llegar; solo la ve 3B (y la empresa que la envió)
--      trasladada  -> 3B la ha pasado al particular (le llega un aviso)
--      descartada  -> 3B la rechaza con un motivo (se le explica a la empresa)
--    En licitaciones de empresas no cambia nada ('no_aplica').
--    Aunque se llame a la API a mano, el particular no puede ver, aceptar ni rechazar una
--    oferta que 3B no haya trasladado, ni cambiar el filtro él mismo.
--    Cuando el particular adjudica, se avisa al equipo para que comparta los datos de contacto
--    (panel_compartir_contacto).
--
-- Se puede ejecutar más de una vez sin problema.

-- ---------------------------------------------------------------------------
-- 1) Licitación de empresa: publicación directa
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
        estado, requisitos, creado_por,
        origen, dias_abierta, publicada_en
      ) values (
        v_ref, trim(p_titulo),
        nullif(trim(coalesce(p_descripcion, '')), ''),
        nullif(trim(coalesce(p_especialidad, '')), ''),
        nullif(trim(coalesce(p_ubicacion, '')), ''),
        p_presupuesto, 'EUR', 0, p_duracion_dias,
        now() + make_interval(days => p_dias_abierta),
        'abierta',
        nullif(trim(coalesce(p_requisitos, '')), ''),
        v_uid,
        'empresa', p_dias_abierta, now()
      )
      returning id into v_id;
      exit;
    exception when unique_violation then
      if v_intentos >= 5 then
        raise;
      end if;
    end;
  end loop;

  -- Aviso a n8n/Odoo: una empresa ha publicado una licitación
  perform disparar_webhook('licitacion.creada', jsonb_build_object(
    'obra_id', v_id, 'referencia', v_ref, 'titulo', trim(p_titulo), 'especialidad', p_especialidad,
    'ubicacion', p_ubicacion, 'presupuesto', p_presupuesto, 'dias_abierta', p_dias_abierta,
    'propietario_id', v_uid, 'estado', 'abierta', 'origen', 'empresa'
  ));

  return v_id;
end;
$$;

-- Las que la 0043 dejó en revisión (si hubiera alguna) se publican
update obras
  set estado = 'abierta', publicada_en = now(), revision_motivo = null, updated_at = now(),
      plazo_cierre = case when dias_abierta is not null then now() + make_interval(days => dias_abierta) else plazo_cierre end
  where origen = 'empresa' and estado in ('en_revision', 'pendiente_info');

-- ---------------------------------------------------------------------------
-- 2) Filtro de 3B en las ofertas a peticiones de particulares
-- ---------------------------------------------------------------------------
alter table postulaciones add column if not exists filtro_3b text not null default 'no_aplica';
alter table postulaciones drop constraint if exists postulaciones_filtro_3b_valido;
alter table postulaciones add constraint postulaciones_filtro_3b_valido
  check (filtro_3b in ('no_aplica', 'pendiente', 'trasladada', 'descartada'));
alter table postulaciones add column if not exists filtro_3b_en timestamptz;
alter table postulaciones add column if not exists filtro_3b_por uuid references profiles (id) on delete set null;

-- Al crear la oferta, el filtro lo decide la base de datos (lo que mande el cliente da igual).
-- Al editarla, solo el equipo de 3B puede tocarlo.
create or replace function postulacion_filtro_3b_antes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.filtro_3b := case
      when exists (select 1 from obras o where o.id = new.obra_id and o.origen = 'particular') then 'pendiente'
      else 'no_aplica'
    end;
  elsif new.filtro_3b is distinct from old.filtro_3b
        and auth.uid() is not null
        and coalesce(auth_role()::text, '') not in ('admin', 'superadmin') then
    raise exception 'No autorizado';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_postulacion_filtro_3b_antes on postulaciones;
create trigger trg_postulacion_filtro_3b_antes
  before insert or update on postulaciones
  for each row execute function postulacion_filtro_3b_antes();

create or replace function postulacion_pendiente_aviso()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_titulo text;
begin
  if new.filtro_3b = 'pendiente' then
    select o.titulo into v_titulo from obras o where o.id = new.obra_id;
    perform avisar_equipo('postulacion_pendiente', 'Oferta pendiente de revisar',
      'Una empresa se ha postulado a «' || coalesce(v_titulo, 'una petición') || '». Revísala antes de pasarla al particular.',
      jsonb_build_object('obra_id', new.obra_id, 'postulacion_id', new.id));
  end if;
  return new;
end;
$$;
drop trigger if exists trg_postulacion_pendiente_aviso on postulaciones;
create trigger trg_postulacion_pendiente_aviso
  after insert on postulaciones
  for each row execute function postulacion_pendiente_aviso();

-- Lo que ve quien publicó (solo ofertas que 3B ha trasladado, o de licitaciones de empresa)
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
           (select count(*) from postulaciones p where p.obra_id = o.id and p.filtro_3b in ('no_aplica', 'trasladada')),
           (select count(*) from postulaciones p where p.obra_id = o.id and p.filtro_3b in ('no_aplica', 'trasladada')
              and p.estado in ('enviada', 'en_revision'))
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
    where p.obra_id = p_obra_id and p.filtro_3b in ('no_aplica', 'trasladada')
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
  v_filtro text;
  v_estado_obra estado_obra;
  v_creador uuid;
  v_origen text;
  v_titulo text;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  perform exigir_cuenta_activa();

  select p.obra_id, p.estado, p.filtro_3b into v_obra_id, v_estado, v_filtro
    from postulaciones p where p.id = p_postulacion_id for update;
  if v_obra_id is null or v_filtro not in ('no_aplica', 'trasladada') then
    raise exception 'Postulación no encontrada';
  end if;

  select o.estado, o.creado_por, o.origen, o.titulo into v_estado_obra, v_creador, v_origen, v_titulo
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

  if v_origen = 'particular' then
    perform avisar_equipo('peticion_adjudicada', 'Petición adjudicada',
      'El particular ha elegido una oferta para «' || coalesce(v_titulo, 'su petición') || '». Comparte los datos de contacto con la empresa.',
      jsonb_build_object('obra_id', v_obra_id, 'postulacion_id', p_postulacion_id));
  end if;
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
  v_filtro text;
  v_creador uuid;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  perform exigir_cuenta_activa();

  select p.obra_id, p.estado, p.filtro_3b into v_obra_id, v_estado, v_filtro
    from postulaciones p where p.id = p_postulacion_id for update;
  if v_obra_id is null or v_filtro not in ('no_aplica', 'trasladada') then
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

-- ---------------------------------------------------------------------------
-- 3) Panel: revisar las ofertas
-- ---------------------------------------------------------------------------
create or replace function panel_postulaciones_peticiones(p_obra_id uuid default null, p_incluir_revisadas boolean default false)
returns table (
  postulacion_id uuid, obra_id uuid, obra_referencia text, obra_titulo text, obra_estado text,
  empresa_id uuid, empresa_nombre text, empresa_especialidad text, empresa_homologada boolean,
  empresa_rating numeric, empresa_obras_completadas integer,
  oferta_economica numeric, telefono_contacto text, disponibilidad_equipo text, motivacion text,
  estado text, filtro text, enviada_en timestamptz, archivos jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform panel_exigir_admin();
  return query
    select p.id, o.id, o.referencia, o.titulo, o.estado::text,
           e.id, e.nombre, e.especialidad, e.homologado,
           e.rating_medio::numeric, e.obras_completadas::integer,
           p.oferta_economica::numeric, p.telefono_contacto, p.disponibilidad_equipo, p.motivacion,
           p.estado::text, p.filtro_3b, p.created_at,
           coalesce((
             select jsonb_agg(jsonb_build_object(
               'id', a.id, 'nombre_archivo', a.nombre_archivo,
               'storage_path', a.storage_path, 'tipo_mime', a.tipo_mime))
             from postulacion_archivos a where a.postulacion_id = p.id
           ), '[]'::jsonb)
    from postulaciones p
    join obras o on o.id = p.obra_id
    join empresas_subcontratistas e on e.id = p.empresa_id
    where o.origen = 'particular'
      and (p_obra_id is null or o.id = p_obra_id)
      and (p.filtro_3b = 'pendiente' or (p_incluir_revisadas and p.filtro_3b in ('trasladada', 'descartada')))
    order by (p.filtro_3b = 'pendiente') desc, p.created_at asc;
end;
$$;

create or replace function panel_revisar_postulacion(p_postulacion_id uuid, p_accion text, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  perform panel_exigir_admin();

  select p.id, p.obra_id, p.filtro_3b, o.titulo, o.creado_por, o.estado as obra_estado
    into v
    from postulaciones p join obras o on o.id = p.obra_id
    where p.id = p_postulacion_id for update of p;
  if not found then
    raise exception 'Oferta no encontrada';
  end if;
  if v.filtro_3b <> 'pendiente' then
    raise exception 'Esta oferta ya está revisada o no necesita revisión.';
  end if;

  if p_accion = 'trasladar' then
    if v.obra_estado <> 'abierta' then
      raise exception 'La petición ya no está abierta.';
    end if;
    update postulaciones
      set filtro_3b = 'trasladada', filtro_3b_en = now(), filtro_3b_por = auth.uid(), updated_at = now()
      where id = p_postulacion_id;
    perform avisar_usuario(v.creado_por, 'nueva_oferta', 'Tienes una oferta nueva',
      'Una empresa ha enviado su oferta para «' || coalesce(v.titulo, 'tu petición') || '». Ya puedes verla.',
      jsonb_build_object('obra_id', v.obra_id, 'postulacion_id', p_postulacion_id));

  elsif p_accion = 'descartar' then
    if v_motivo is null or length(v_motivo) < 3 then
      raise exception 'Escribe el motivo (se le enviará a la empresa).';
    end if;
    update postulaciones
      set filtro_3b = 'descartada', filtro_3b_en = now(), filtro_3b_por = auth.uid(),
          estado = 'rechazada', motivo_rechazo = left(v_motivo, 500), updated_at = now()
      where id = p_postulacion_id;

  else
    raise exception 'Acción no válida (usa: trasladar o descartar).';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4) Permisos
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
revoke all on function mis_licitaciones() from public, anon;
grant execute on function mis_licitaciones() to authenticated;
revoke all on function postulaciones_de_mi_licitacion(uuid) from public, anon;
grant execute on function postulaciones_de_mi_licitacion(uuid) to authenticated;
revoke all on function aceptar_postulacion_propietario(uuid) from public, anon;
grant execute on function aceptar_postulacion_propietario(uuid) to authenticated;
revoke all on function rechazar_postulacion_propietario(uuid, text) from public, anon;
grant execute on function rechazar_postulacion_propietario(uuid, text) to authenticated;
revoke all on function postulacion_filtro_3b_antes() from public, anon, authenticated;
revoke all on function postulacion_pendiente_aviso() from public, anon, authenticated;