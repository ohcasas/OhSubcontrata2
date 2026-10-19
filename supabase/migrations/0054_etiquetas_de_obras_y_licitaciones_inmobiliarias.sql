-- ============================================================================
-- Etiquetas de oficios para clasificar obras (+ las inmobiliarias publican licitaciones)
-- ============================================================================
-- REQUISITO: haber ejecutado antes 0043, 0044 y 0053.
--
-- Qué hace:
--   1) Tabla de etiquetas (demoliciones, fontanería...) con 16 etiquetas iniciales.
--   2) Cada obra/licitación puede llevar hasta 5 etiquetas.
--   3) Cada empresa (oficio) puede marcar hasta 8 etiquetas = a qué se dedica, para
--      que la app le enseñe primero las obras que le encajan.
--   4) Quién crea etiquetas nuevas:
--        - El equipo de 3B (admin / superadmin): al momento.
--        - Promotoras, constructoras e inmobiliarias: las PROPONEN y 3B las revisa en
--          el panel. Mientras tanto la etiqueta propuesta solo la ve quien la propuso
--          (y 3B), y solo la puede poner en sus propias obras. Si 3B la rechaza, se
--          quita de esas obras y se le explica el motivo.
--   5) Las inmobiliarias (rol 'administrador') pueden publicar licitaciones, igual que
--      promotoras y constructoras.
--   6) Panel: panel_etiquetas, panel_revisar_etiqueta, panel_crear_etiqueta,
--      panel_editar_etiqueta, panel_archivar_etiqueta.
--
-- NO se tocan: puntos del Club, comisiones, la revisión previa de particulares ni
-- las funciones de adjudicar o cerrar obras.
--
-- Se puede ejecutar más de una vez sin problema.

-- ---------------------------------------------------------------------------
-- 0) Normalizar un nombre (sin tildes, minúsculas, un solo espacio) para detectar duplicados
-- ---------------------------------------------------------------------------
create or replace function normalizar_etiqueta(p text)
returns text
language sql
immutable
as $$
  select lower(trim(regexp_replace(
    translate(coalesce(p, ''), 'áéíóúüñÁÉÍÓÚÜÑàèìòùÀÈÌÒÙ', 'aeiouunAEIOUUNaeiouAEIOU'),
    '\s+', ' ', 'g')));
$$;

-- ---------------------------------------------------------------------------
-- 1) Tablas
-- ---------------------------------------------------------------------------
create table if not exists etiquetas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  nombre_norm text generated always as (normalizar_etiqueta(nombre)) stored,
  icono text,                                   -- clave del icono en la app (p. ej. 'fontaneria'); vacío = icono genérico
  estado text not null default 'propuesta',     -- activa | propuesta | rechazada | archivada
  orden integer not null default 1000,
  propuesta_por uuid references profiles (id) on delete set null,
  revisada_por uuid references profiles (id) on delete set null,
  revisada_en timestamptz,
  motivo_rechazo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint etiquetas_estado_valido check (estado in ('activa', 'propuesta', 'rechazada', 'archivada')),
  constraint etiquetas_nombre_valido check (length(trim(nombre)) between 3 and 30)
);

-- No puede haber dos etiquetas vivas con el mismo nombre (sin contar tildes ni mayúsculas)
create unique index if not exists etiquetas_nombre_unico
  on etiquetas (nombre_norm) where estado in ('activa', 'propuesta', 'archivada');

create table if not exists obras_etiquetas (
  obra_id uuid not null references obras (id) on delete cascade,
  etiqueta_id uuid not null references etiquetas (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (obra_id, etiqueta_id)
);
create index if not exists idx_obras_etiquetas_etiqueta on obras_etiquetas (etiqueta_id);

create table if not exists empresa_etiquetas (
  empresa_id uuid not null references empresas_subcontratistas (id) on delete cascade,
  etiqueta_id uuid not null references etiquetas (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (empresa_id, etiqueta_id)
);
create index if not exists idx_empresa_etiquetas_etiqueta on empresa_etiquetas (etiqueta_id);

-- ---------------------------------------------------------------------------
-- 2) Quién lee qué (RLS). Escribir: solo mediante las funciones de más abajo.
-- ---------------------------------------------------------------------------
alter table etiquetas enable row level security;
alter table obras_etiquetas enable row level security;
alter table empresa_etiquetas enable row level security;

drop policy if exists etiquetas_select on etiquetas;
create policy etiquetas_select on etiquetas
  for select using (
    coalesce(auth_role()::text, '') in ('admin', 'superadmin')
    or (
      (select cuenta_activa())
      and (estado in ('activa', 'archivada') or propuesta_por = auth.uid())
    )
  );

drop policy if exists etiquetas_admin on etiquetas;
create policy etiquetas_admin on etiquetas
  for all
  using (coalesce(auth_role()::text, '') in ('admin', 'superadmin'))
  with check (coalesce(auth_role()::text, '') in ('admin', 'superadmin'));

-- Las etiquetas de una obra se ven si se ve la obra Y la etiqueta (las dos con sus propias reglas).
-- Así una etiqueta propuesta y aún sin aprobar no aparece a nadie más que a quien la propuso.
drop policy if exists obras_etiquetas_select on obras_etiquetas;
create policy obras_etiquetas_select on obras_etiquetas
  for select using (
    coalesce(auth_role()::text, '') in ('admin', 'superadmin')
    or (
      exists (select 1 from obras o where o.id = obras_etiquetas.obra_id)
      and exists (select 1 from etiquetas e where e.id = obras_etiquetas.etiqueta_id)
    )
  );

drop policy if exists obras_etiquetas_admin on obras_etiquetas;
create policy obras_etiquetas_admin on obras_etiquetas
  for all
  using (coalesce(auth_role()::text, '') in ('admin', 'superadmin'))
  with check (coalesce(auth_role()::text, '') in ('admin', 'superadmin'));

drop policy if exists empresa_etiquetas_select on empresa_etiquetas;
create policy empresa_etiquetas_select on empresa_etiquetas
  for select using (
    empresa_id = auth_empresa_id()
    or coalesce(auth_role()::text, '') in ('admin', 'superadmin')
  );

drop policy if exists empresa_etiquetas_admin on empresa_etiquetas;
create policy empresa_etiquetas_admin on empresa_etiquetas
  for all
  using (coalesce(auth_role()::text, '') in ('admin', 'superadmin'))
  with check (coalesce(auth_role()::text, '') in ('admin', 'superadmin'));

-- Sin escritura directa desde la app: todo pasa por las funciones
revoke all on etiquetas, obras_etiquetas, empresa_etiquetas from anon;
revoke insert, update, delete, truncate on etiquetas, obras_etiquetas, empresa_etiquetas from authenticated;
grant select on etiquetas, obras_etiquetas, empresa_etiquetas to authenticated;

-- ---------------------------------------------------------------------------
-- 3) Las 16 etiquetas iniciales (activas, con su icono)
-- ---------------------------------------------------------------------------
insert into etiquetas (nombre, icono, estado, orden, revisada_en)
select v.nombre, v.icono, 'activa', v.orden, now()
from (values
  ('Demoliciones', 'demoliciones', 10),
  ('Excavaciones', 'excavaciones', 20),
  ('Estructuristas', 'estructuristas', 30),
  ('Pladuristas', 'pladuristas', 40),
  ('Carpinerías', 'carpinerias', 50),
  ('Fontanería', 'fontaneria', 60),
  ('Climatización', 'climatizacion', 70),
  ('Electricistas', 'electricistas', 80),
  ('Pintores', 'pintores', 90),
  ('Impermeabilizadores', 'impermeabilizadores', 100),
  ('Albañilería', 'albanileria', 110),
  ('Jardinería', 'jardineria', 120),
  ('Gestión de residuos', 'residuos', 130),
  ('Piscinas', 'piscinas', 140),
  ('Mudanzas', 'mudanzas', 150),
  ('Transportes', 'transportes', 160)
) as v(nombre, icono, orden)
where not exists (
  select 1 from etiquetas e
  where e.nombre_norm = normalizar_etiqueta(v.nombre) and e.estado in ('activa', 'propuesta', 'archivada')
);

-- Lo que ya existía como texto libre ("especialidad") pasa a etiquetas si coincide con una
insert into obras_etiquetas (obra_id, etiqueta_id)
select o.id, e.id
from obras o
join etiquetas e on e.nombre_norm = normalizar_etiqueta(o.especialidad_requerida) and e.estado = 'activa'
on conflict do nothing;

insert into empresa_etiquetas (empresa_id, etiqueta_id)
select s.id, e.id
from empresas_subcontratistas s
join etiquetas e on e.nombre_norm = normalizar_etiqueta(s.especialidad) and e.estado = 'activa'
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 4) Proponer / crear una etiqueta nueva
-- ---------------------------------------------------------------------------
-- Devuelve el id. Si ya existe una activa con ese nombre, devuelve la que ya existe
-- (la app la marca y no se crea un duplicado).
create or replace function proponer_etiqueta(p_nombre text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_rol text;
  v_admin boolean;
  v_nombre text;
  v_ex record;
  v_id uuid;
  v_quien text;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;
  perform exigir_cuenta_activa();
  v_rol := coalesce(auth_role()::text, '');
  if v_rol not in ('promotor', 'constructora', 'administrador', 'admin', 'superadmin') then
    raise exception 'No autorizado';
  end if;
  v_admin := v_rol in ('admin', 'superadmin');

  v_nombre := regexp_replace(trim(coalesce(p_nombre, '')), '\s+', ' ', 'g');
  if length(v_nombre) < 3 or length(v_nombre) > 30 then
    raise exception 'El nombre de la etiqueta debe tener entre 3 y 30 caracteres.';
  end if;
  if v_nombre !~ '^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9 /.-]+$' then
    raise exception 'El nombre de la etiqueta solo puede llevar letras, números, espacios, / . y -.';
  end if;

  select e.id, e.estado, e.propuesta_por into v_ex
    from etiquetas e
    where e.nombre_norm = normalizar_etiqueta(v_nombre) and e.estado in ('activa', 'propuesta', 'archivada')
    limit 1;
  if found then
    if v_ex.estado = 'activa' then
      return v_ex.id;
    elsif v_ex.estado = 'propuesta' and v_ex.propuesta_por = v_uid then
      return v_ex.id;
    elsif v_ex.estado = 'propuesta' then
      raise exception 'Ya hay una propuesta igual en revisión. Prueba de nuevo cuando 3B la haya revisado.';
    else
      raise exception 'Esa etiqueta existe, pero está desactivada. Escribe a 3B si la necesitas.';
    end if;
  end if;

  if not v_admin
     and (select count(*) from etiquetas where propuesta_por = v_uid and estado = 'propuesta') >= 5 then
    raise exception 'Ya tienes 5 etiquetas en revisión. Espera a que 3B las revise.';
  end if;

  begin
    insert into etiquetas (nombre, estado, orden, propuesta_por, revisada_por, revisada_en)
    values (v_nombre,
            case when v_admin then 'activa' else 'propuesta' end,
            1000, v_uid,
            case when v_admin then v_uid end,
            case when v_admin then now() end)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'Ya existe una etiqueta con ese nombre.';
  end;

  if not v_admin then
    select coalesce(e.nombre, p.nombre_completo, 'Una cuenta') into v_quien
      from profiles p left join empresas_subcontratistas e on e.id = p.empresa_id
      where p.id = v_uid;
    perform avisar_equipo('etiqueta_propuesta', 'Etiqueta nueva por revisar',
      v_quien || ' propone la etiqueta «' || v_nombre || '». Revísala en el panel (Etiquetas).',
      jsonb_build_object('etiqueta_id', v_id));
  end if;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5) Poner etiquetas a una obra o licitación (sustituye las que tenía)
-- ---------------------------------------------------------------------------
create or replace function asignar_etiquetas_obra(p_obra_id uuid, p_etiquetas uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_rol text;
  v_admin boolean;
  v_owner uuid;
  v_estado text;
  v_ids uuid[];
  v_validas integer;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;
  perform exigir_cuenta_activa();
  v_rol := coalesce(auth_role()::text, '');
  v_admin := v_rol in ('admin', 'superadmin');

  select o.creado_por, o.estado::text into v_owner, v_estado from obras o where o.id = p_obra_id;
  if v_estado is null then
    raise exception 'Obra no encontrada';
  end if;
  if not v_admin and (v_owner is distinct from v_uid or v_rol not in ('promotor', 'constructora', 'administrador')) then
    raise exception 'No autorizado';
  end if;
  if v_estado in ('cerrada', 'cancelada', 'rechazada') then
    raise exception 'No se pueden cambiar las etiquetas de una obra cerrada o cancelada.';
  end if;

  select coalesce(array_agg(distinct x), '{}') into v_ids from unnest(coalesce(p_etiquetas, '{}')) as x;
  if cardinality(v_ids) > 5 then
    raise exception 'Una obra puede llevar como máximo 5 etiquetas.';
  end if;

  select count(*) into v_validas
    from etiquetas e
    where e.id = any (v_ids)
      and (e.estado = 'activa' or (e.estado = 'propuesta' and (e.propuesta_por = v_uid or v_admin)));
  if v_validas <> cardinality(v_ids) then
    raise exception 'Alguna etiqueta ya no está disponible. Vuelve a elegirlas.';
  end if;

  delete from obras_etiquetas where obra_id = p_obra_id and etiqueta_id <> all (v_ids);
  insert into obras_etiquetas (obra_id, etiqueta_id)
    select p_obra_id, x from unnest(v_ids) as x
    on conflict do nothing;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6) "A qué me dedico": las etiquetas de mi empresa (oficios y demás perfiles con ficha)
-- ---------------------------------------------------------------------------
create or replace function guardar_mis_etiquetas(p_etiquetas uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_empresa uuid := auth_empresa_id();
  v_rol text;
  v_ids uuid[];
  v_validas integer;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;
  perform exigir_cuenta_activa();
  v_rol := coalesce(auth_role()::text, '');
  if v_empresa is null or v_rol in ('particular', 'tecnico', 'admin', 'superadmin') then
    raise exception 'Esta opción no está disponible para tu tipo de cuenta.';
  end if;

  select coalesce(array_agg(distinct x), '{}') into v_ids from unnest(coalesce(p_etiquetas, '{}')) as x;
  if cardinality(v_ids) > 8 then
    raise exception 'Puedes marcar como máximo 8 etiquetas.';
  end if;

  select count(*) into v_validas from etiquetas e where e.id = any (v_ids) and e.estado = 'activa';
  if v_validas <> cardinality(v_ids) then
    raise exception 'Alguna etiqueta ya no está disponible. Vuelve a elegirlas.';
  end if;

  delete from empresa_etiquetas where empresa_id = v_empresa and etiqueta_id <> all (v_ids);
  insert into empresa_etiquetas (empresa_id, etiqueta_id)
    select v_empresa, x from unnest(v_ids) as x
    on conflict do nothing;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7) Las inmobiliarias (rol 'administrador') también publican licitaciones
-- ---------------------------------------------------------------------------
-- 7a) Publicar. Mismo cuerpo que en 0044, con 'administrador' en la lista de roles.
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
  if coalesce(auth_role()::text, '') not in ('promotor', 'constructora', 'administrador') then
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

  perform disparar_webhook('licitacion.creada', jsonb_build_object(
    'obra_id', v_id, 'referencia', v_ref, 'titulo', trim(p_titulo), 'especialidad', p_especialidad,
    'ubicacion', p_ubicacion, 'presupuesto', p_presupuesto, 'dias_abierta', p_dias_abierta,
    'propietario_id', v_uid, 'estado', 'abierta', 'origen', 'empresa'
  ));

  return v_id;
end;
$$;

-- 7b) Avisar al dueño cuando alguien se postula (mismo cuerpo que en 0033, con 'administrador')
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
    where o.id = new.obra_id and pr.role in ('promotor', 'constructora', 'administrador');

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

-- 7c) Avisos de aceptada/rechazada (mismo cuerpo que en 0033, con 'administrador')
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

  select o.titulo, (pr.role in ('promotor', 'constructora', 'administrador')), coalesce(e.nombre, pr.nombre_completo)
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

-- ---------------------------------------------------------------------------
-- 8) Panel de 3B
-- ---------------------------------------------------------------------------
-- 8a) Lista completa (las propuestas pendientes primero)
create or replace function panel_etiquetas()
returns table (
  id uuid, nombre text, icono text, estado text, orden integer,
  propuesta_por uuid, propuesta_por_nombre text, propuesta_por_email text,
  created_at timestamptz, revisada_en timestamptz, motivo_rechazo text,
  n_obras bigint, n_empresas bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform panel_exigir_admin();
  return query
    select e.id, e.nombre, e.icono, e.estado, e.orden,
           e.propuesta_por, coalesce(s.nombre, p.nombre_completo), p.email,
           e.created_at, e.revisada_en, e.motivo_rechazo,
           (select count(*) from obras_etiquetas oe where oe.etiqueta_id = e.id),
           (select count(*) from empresa_etiquetas ee where ee.etiqueta_id = e.id)
    from etiquetas e
    left join profiles p on p.id = e.propuesta_por
    left join empresas_subcontratistas s on s.id = p.empresa_id
    order by (e.estado = 'propuesta') desc,
             (e.estado = 'activa') desc,
             e.orden, e.nombre;
end;
$$;

-- 8b) Aprobar o rechazar una propuesta (al aprobar se puede corregir el nombre)
create or replace function panel_revisar_etiqueta(
  p_id uuid, p_aprobar boolean, p_motivo text default null, p_nombre text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := auth.uid();
  v_e record;
  v_nombre text;
begin
  perform panel_exigir_admin();
  select * into v_e from etiquetas where id = p_id for update;
  if not found then
    raise exception 'Etiqueta no encontrada';
  end if;
  if v_e.estado <> 'propuesta' then
    raise exception 'Esta etiqueta ya estaba revisada.';
  end if;

  if p_aprobar then
    v_nombre := v_e.nombre;
    if p_nombre is not null and length(trim(p_nombre)) > 0 then
      v_nombre := regexp_replace(trim(p_nombre), '\s+', ' ', 'g');
      if length(v_nombre) < 3 or length(v_nombre) > 30 then
        raise exception 'El nombre debe tener entre 3 y 30 caracteres.';
      end if;
    end if;
    begin
      update etiquetas
        set nombre = v_nombre, estado = 'activa', revisada_por = v_admin, revisada_en = now(),
            motivo_rechazo = null, updated_at = now()
        where id = p_id;
    exception when unique_violation then
      raise exception 'Ya existe otra etiqueta con ese nombre.';
    end;
    perform avisar_usuario(v_e.propuesta_por, 'etiqueta_aprobada', 'Etiqueta aprobada',
      'La etiqueta «' || v_nombre || '» ya está disponible para todos.',
      jsonb_build_object('etiqueta_id', p_id));
  else
    if p_motivo is null or length(trim(p_motivo)) < 3 then
      raise exception 'Escribe el motivo del rechazo (se le explicará a quien la propuso).';
    end if;
    update etiquetas
      set estado = 'rechazada', revisada_por = v_admin, revisada_en = now(),
          motivo_rechazo = left(trim(p_motivo), 300), updated_at = now()
      where id = p_id;
    delete from obras_etiquetas where etiqueta_id = p_id;
    perform avisar_usuario(v_e.propuesta_por, 'etiqueta_rechazada', 'Etiqueta no aprobada',
      'La etiqueta «' || v_e.nombre || '» no se ha aprobado. Motivo: ' || left(trim(p_motivo), 300) || '.',
      jsonb_build_object('etiqueta_id', p_id));
  end if;

  insert into registro_actividad (quien, accion, origen, tipo, detalle)
  values (v_admin, case when p_aprobar then 'etiqueta.aprobada' else 'etiqueta.rechazada' end, 'panel', 'etiqueta',
          jsonb_build_object('etiqueta', v_e.nombre, 'motivo', p_motivo));
end;
$$;

-- 8c) Crear una etiqueta directamente (queda activa)
create or replace function panel_crear_etiqueta(p_nombre text, p_icono text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  perform panel_exigir_admin();
  v_id := proponer_etiqueta(p_nombre);
  if p_icono is not null and length(trim(p_icono)) > 0 then
    update etiquetas set icono = left(trim(p_icono), 40), updated_at = now() where id = v_id and icono is null;
  end if;
  insert into registro_actividad (quien, accion, origen, tipo, detalle)
  values (auth.uid(), 'etiqueta.creada', 'panel', 'etiqueta', jsonb_build_object('etiqueta', p_nombre));
  return v_id;
end;
$$;

-- 8d) Renombrar, cambiar icono u orden
create or replace function panel_editar_etiqueta(p_id uuid, p_nombre text, p_icono text, p_orden integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre text;
begin
  perform panel_exigir_admin();
  v_nombre := regexp_replace(trim(coalesce(p_nombre, '')), '\s+', ' ', 'g');
  if length(v_nombre) < 3 or length(v_nombre) > 30 then
    raise exception 'El nombre debe tener entre 3 y 30 caracteres.';
  end if;
  if p_orden is null or p_orden < 0 or p_orden > 100000 then
    raise exception 'El orden no es válido.';
  end if;
  begin
    update etiquetas
      set nombre = v_nombre, icono = nullif(left(trim(coalesce(p_icono, '')), 40), ''),
          orden = p_orden, updated_at = now()
      where id = p_id;
  exception when unique_violation then
    raise exception 'Ya existe otra etiqueta con ese nombre.';
  end;
  if not found then
    raise exception 'Etiqueta no encontrada';
  end if;
  insert into registro_actividad (quien, accion, origen, tipo, detalle)
  values (auth.uid(), 'etiqueta.editada', 'panel', 'etiqueta', jsonb_build_object('etiqueta', v_nombre));
end;
$$;

-- 8e) Desactivar / reactivar (las obras que ya la llevan la conservan; no se puede elegir de nuevo)
create or replace function panel_archivar_etiqueta(p_id uuid, p_archivar boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre text;
begin
  perform panel_exigir_admin();
  update etiquetas
    set estado = case when p_archivar then 'archivada' else 'activa' end, updated_at = now()
    where id = p_id and estado in ('activa', 'archivada')
    returning nombre into v_nombre;
  if not found then
    raise exception 'Solo se pueden desactivar o reactivar etiquetas aprobadas.';
  end if;
  insert into registro_actividad (quien, accion, origen, tipo, detalle)
  values (auth.uid(), case when p_archivar then 'etiqueta.desactivada' else 'etiqueta.reactivada' end,
          'panel', 'etiqueta', jsonb_build_object('etiqueta', v_nombre));
end;
$$;

-- ---------------------------------------------------------------------------
-- 9) Permisos de ejecución
-- ---------------------------------------------------------------------------
revoke execute on function proponer_etiqueta(text) from public, anon;
revoke execute on function asignar_etiquetas_obra(uuid, uuid[]) from public, anon;
revoke execute on function guardar_mis_etiquetas(uuid[]) from public, anon;
revoke execute on function crear_licitacion(text, text, text, text, numeric, integer, text, integer) from public, anon;
revoke execute on function panel_etiquetas() from public, anon;
revoke execute on function panel_revisar_etiqueta(uuid, boolean, text, text) from public, anon;
revoke execute on function panel_crear_etiqueta(text, text) from public, anon;
revoke execute on function panel_editar_etiqueta(uuid, text, text, integer) from public, anon;
revoke execute on function panel_archivar_etiqueta(uuid, boolean) from public, anon;

grant execute on function proponer_etiqueta(text) to authenticated;
grant execute on function asignar_etiquetas_obra(uuid, uuid[]) to authenticated;
grant execute on function guardar_mis_etiquetas(uuid[]) to authenticated;
grant execute on function crear_licitacion(text, text, text, text, numeric, integer, text, integer) to authenticated;
grant execute on function panel_etiquetas() to authenticated;
grant execute on function panel_revisar_etiqueta(uuid, boolean, text, text) to authenticated;
grant execute on function panel_crear_etiqueta(text, text) to authenticated;
grant execute on function panel_editar_etiqueta(uuid, text, text, integer) to authenticated;
grant execute on function panel_archivar_etiqueta(uuid, boolean) to authenticated;