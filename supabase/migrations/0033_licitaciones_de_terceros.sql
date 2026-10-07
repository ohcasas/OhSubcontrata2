-- ============================================================================
-- Licitaciones de promotoras y constructoras (OH como intermediario)
-- ============================================================================
-- Hasta ahora solo OH publicaba licitaciones. A partir de aquí, las cuentas de
-- tipo 'promotor' y 'constructora' pueden publicar las suyas, recibir
-- postulaciones de oficios y de otras constructoras, adjudicar y seguir la obra.
--
-- Decisiones de diseño:
--   - NO se tocan las funciones de admin (aceptar_postulacion, cambiar_estado_obra,
--     solicitar_canje...). Todo lo nuevo son funciones aparte para el dueño de la
--     licitación, así lo que ya funciona queda exactamente igual.
--   - Quién es el dueño: obras.creado_por (la columna ya existía). Las obras de OH
--     tienen ahí al admin que las creó (o NULL, las más antiguas).
--   - Las licitaciones de terceros NO dan puntos del Club ni cuentan como obra
--     completada: se crean con puntos_bonus = 0 y la función del dueño no toca los
--     contadores. Si dieran puntos, una constructora podría inventarse una obra,
--     adjudicársela a un conocido y generarle premios canjeables a cargo de OH.
--   - El dueño NO lee las tablas de postulaciones ni de empresas directamente (con
--     RLS eso daría acceso a TODAS las columnas, incluidos los puntos del Club de la
--     empresa). Lo ve a través de funciones que devuelven solo lo necesario.
--   - Un dueño no puede postularse a su propia licitación.
--
-- Se puede ejecutar más de una vez sin problema.

-- 1) Un usuario que ha publicado licitaciones tiene que poder borrar su cuenta:
--    sin esto, la clave foránea lo impedía. Las obras se quedan (sin dueño).
alter table obras drop constraint if exists obras_creado_por_fkey;
alter table obras add constraint obras_creado_por_fkey
  foreign key (creado_por) references profiles (id) on delete set null;

-- 2) Publicar una licitación
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

-- 3) Mis licitaciones, con el número de postulaciones
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
  return query
    select o.id, o.referencia, o.titulo, o.estado, o.presupuesto::numeric, o.plazo_cierre, o.created_at,
           (select count(*) from postulaciones p where p.obra_id = o.id),
           (select count(*) from postulaciones p where p.obra_id = o.id and p.estado in ('enviada', 'en_revision'))
    from obras o
    where o.creado_por = auth.uid()
    order by o.created_at desc;
end;
$$;

-- 4) Postulaciones de una de mis licitaciones (solo lo necesario de cada empresa)
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

-- 5) Adjudicar: mismo efecto que aceptar_postulacion (admin), pero para el dueño.
--    El aviso a las empresas lo manda el disparador notificar_cambio_postulacion.
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

-- 6) Rechazar una postulación, con motivo (le llega a la empresa)
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

-- 7) Ciclo de vida de la licitación (sin puntos ni contadores del Club)
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

-- 8) Avisar al dueño cuando alguien se postula a su licitación
create or replace function notificar_postulacion_a_propietario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_titulo text;
  v_empresa_dueno uuid;
  v_nombre_empresa text;
begin
  select o.titulo, pr.empresa_id into v_titulo, v_empresa_dueno
    from obras o
    join profiles pr on pr.id = o.creado_por
    where o.id = new.obra_id and pr.role in ('promotor', 'constructora');

  if v_empresa_dueno is not null then
    select nombre into v_nombre_empresa from empresas_subcontratistas where id = new.empresa_id;
    perform crear_notificacion(
      v_empresa_dueno, 'nueva_postulacion',
      'Nueva postulación',
      'La empresa «' || coalesce(v_nombre_empresa, 'una empresa') || '» se ha postulado a «'
        || coalesce(v_titulo, 'tu licitación') || '».',
      jsonb_build_object('obra_id', new.obra_id, 'postulacion_id', new.id)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notificar_postulacion_propietario on postulaciones;
create trigger trg_notificar_postulacion_propietario
  after insert on postulaciones
  for each row execute function notificar_postulacion_a_propietario();

-- 9) El aviso de "aceptada" decía "Nos pondremos en contacto contigo": falso si la
--    licitación es de una constructora. Mismo cuerpo que en 0018, con el texto
--    adaptado cuando el dueño es un tercero.
create or replace function notificar_cambio_postulacion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_titulo_obra text;
  v_nombre_empresa text;
  v_tercero boolean;
  v_propietario text;
begin
  if new.estado is not distinct from old.estado then
    return new;
  end if;

  select o.titulo, (pr.role in ('promotor', 'constructora')), coalesce(e.nombre, pr.nombre_completo)
    into v_titulo_obra, v_tercero, v_propietario
    from obras o
    left join profiles pr on pr.id = o.creado_por
    left join empresas_subcontratistas e on e.id = pr.empresa_id
    where o.id = new.obra_id;
  v_tercero := coalesce(v_tercero, false);

  if new.estado = 'aceptada' then
    perform crear_notificacion(
      new.empresa_id, 'postulacion_aceptada',
      'Postulación aceptada',
      'Tu postulación a «' || coalesce(v_titulo_obra, 'la obra') || '» ha sido aceptada y la obra te ha sido adjudicada. '
        || case when v_tercero
             then coalesce(v_propietario, 'El propietario') || ' se pondrá en contacto contigo para coordinar los siguientes pasos.'
             else 'Nos pondremos en contacto contigo por teléfono para coordinar los siguientes pasos.'
           end,
      jsonb_build_object('obra_id', new.obra_id, 'postulacion_id', new.id)
    );

    select nombre into v_nombre_empresa from empresas_subcontratistas where id = new.empresa_id;
    perform disparar_webhook('postulacion.aceptada', jsonb_build_object(
      'postulacion_id', new.id,
      'obra_id', new.obra_id,
      'obra_titulo', v_titulo_obra,
      'empresa_id', new.empresa_id,
      'empresa_nombre', v_nombre_empresa,
      'oferta_economica', new.oferta_economica
    ));
  elsif new.estado = 'rechazada' then
    perform crear_notificacion(
      new.empresa_id, 'postulacion_rechazada',
      'Postulación no seleccionada',
      'Tu postulación a «' || coalesce(v_titulo_obra, 'la obra') || '» no ha sido seleccionada. Motivo: '
        || coalesce(nullif(trim(new.motivo_rechazo), ''), 'no especificado') || '.',
      jsonb_build_object('obra_id', new.obra_id, 'postulacion_id', new.id)
    );

    select nombre into v_nombre_empresa from empresas_subcontratistas where id = new.empresa_id;
    perform disparar_webhook('postulacion.rechazada', jsonb_build_object(
      'postulacion_id', new.id,
      'obra_id', new.obra_id,
      'obra_titulo', v_titulo_obra,
      'empresa_id', new.empresa_id,
      'empresa_nombre', v_nombre_empresa,
      'motivo_rechazo', new.motivo_rechazo
    ));
  end if;

  return new;
end;
$$;

-- 10) Permisos de datos
-- 10a) Nadie se postula a su propia licitación (antes solo se exigía empresa propia y obra abierta)
drop policy if exists postulaciones_insert on postulaciones;
create policy postulaciones_insert on postulaciones
  for insert with check (
    empresa_id = auth_empresa_id()
    and estado = 'enviada'
    and exists (
      select 1 from obras o
      where o.id = obra_id and o.estado = 'abierta' and o.creado_por is distinct from auth.uid()
    )
  );

-- 10b) El dueño ve el progreso que registra la empresa adjudicada
drop policy if exists avances_obra_select_propietario on avances_obra;
create policy avances_obra_select_propietario on avances_obra
  for select using (
    exists (select 1 from obras o where o.id = obra_id and o.creado_por = auth.uid())
  );

-- 10c) El dueño puede abrir (con enlace firmado) los archivos adjuntos de las
--      postulaciones a SUS licitaciones, y solo esos archivos concretos (la ruta
--      del almacén va por empresa, no por obra, así que se comprueba fichero a fichero).
create or replace function propietario_puede_ver_archivo(p_ruta text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and exists (
    select 1
    from postulacion_archivos pa
    join postulaciones p on p.id = pa.postulacion_id
    join obras o on o.id = p.obra_id
    where pa.storage_path = p_ruta and o.creado_por = auth.uid()
  );
$$;

drop policy if exists "postulacion_archivos_storage_propietario" on storage.objects;
create policy "postulacion_archivos_storage_propietario" on storage.objects
  for select
  using (bucket_id = 'postulacion-archivos' and public.propietario_puede_ver_archivo(name));

-- 11) Borrar la cuenta: ahora también se bloquea si hay licitaciones activas
create or replace function eliminar_mi_cuenta()
returns void
language plpgsql
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

  select role into v_role from profiles where id = v_uid;
  if v_role is null or v_role in ('admin', 'superadmin') then
    raise exception 'Esta función solo está disponible para cuentas de usuario. Para dar de baja una cuenta de administración de OH, hazlo directamente desde Supabase.';
  end if;

  if exists (
    select 1 from recompensas_referido
    where referidor_id = v_uid and estado in ('pendiente', 'aceptada')
  ) then
    raise exception 'Tienes comisiones pendientes de cobro. Escribe a software@ohcasas.es antes de eliminar tu cuenta.';
  end if;

  -- Una licitación abierta o en marcha no puede quedarse sin dueño: hay empresas
  -- postuladas o trabajando en ella. Primero hay que cancelarla o finalizarla.
  if exists (
    select 1 from obras
    where creado_por = v_uid and estado in ('abierta', 'adjudicada', 'en_curso')
  ) then
    raise exception 'Tienes licitaciones abiertas o en marcha. Cancélalas o finalízalas antes de eliminar tu cuenta.';
  end if;

  delete from notificaciones where user_id = v_uid;
  delete from push_tokens where user_id = v_uid;

  delete from auth.users where id = v_uid;
end;
$$;

-- Permisos de ejecución
revoke execute on function crear_licitacion(text, text, text, text, numeric, integer, text, integer) from public, anon;
revoke execute on function mis_licitaciones() from public, anon;
revoke execute on function postulaciones_de_mi_licitacion(uuid) from public, anon;
revoke execute on function aceptar_postulacion_propietario(uuid) from public, anon;
revoke execute on function rechazar_postulacion_propietario(uuid, text) from public, anon;
revoke execute on function cambiar_estado_licitacion(uuid, estado_obra) from public, anon;
revoke execute on function propietario_puede_ver_archivo(text) from public, anon;
revoke execute on function eliminar_mi_cuenta() from public, anon;
grant execute on function crear_licitacion(text, text, text, text, numeric, integer, text, integer) to authenticated;
grant execute on function mis_licitaciones() to authenticated;
grant execute on function postulaciones_de_mi_licitacion(uuid) to authenticated;
grant execute on function aceptar_postulacion_propietario(uuid) to authenticated;
grant execute on function rechazar_postulacion_propietario(uuid, text) to authenticated;
grant execute on function cambiar_estado_licitacion(uuid, estado_obra) to authenticated;
grant execute on function propietario_puede_ver_archivo(text) to authenticated;
grant execute on function eliminar_mi_cuenta() to authenticated;