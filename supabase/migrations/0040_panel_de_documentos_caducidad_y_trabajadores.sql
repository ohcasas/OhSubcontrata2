-- ============================================================================
-- Panel de documentación: caducidad a 2 meses, trabajadores, historial y registro de actividad
-- ============================================================================
-- Prepara la base de datos para la web de gestión de documentos (docs/panel/index.html).
-- NO cambia lo que hace hoy la app: las funciones de la 0036 (registrar_documento_cuenta,
-- revisar_documento_cuenta, documentos_de_cuenta, estado_documentacion_cuentas) siguen igual.
-- Lo nuevo se engancha con disparadores y funciones propias (las que empiezan por panel_).
--
-- 1) CADUCIDAD. Cada documento pedido tiene una vigencia en meses (por defecto 2, como se ha
--    decidido). Al aprobar un documento se rellena solo la fecha de caducidad (hoy + vigencia).
--    El panel la puede cambiar a mano. Un documento aprobado con la fecha pasada se considera
--    CADUCADO. No se suspende ninguna cuenta automáticamente: solo se avisa y se ve en el panel.
-- 2) TRABAJADORES. Cada cuenta puede tener trabajadores, y cada trabajador sus documentos (DNI,
--    alta en la Seguridad Social, formación PRL, aptitud médica, EPIs).
-- 3) HISTORIAL. Al subir un archivo nuevo en lugar de otro, el anterior se guarda en
--    documentos_historial (el archivo sigue en el almacén).
-- 4) ACTIVIDAD. registro_actividad apunta quién subió, aprobó o rechazó qué y cuándo.
-- 5) AVISOS. avisar_caducidades() avisa a la cuenta a los 15 y 7 días y el día que caduca, y
--    dispara el webhook documento.caduca. Se programa con pg_cron (ver el final del archivo).
-- 6) SUBIDA DEL EQUIPO. El equipo puede subir archivos en nombre de una cuenta (cuando los
--    mandan por correo) y aprobarlos en el mismo paso.
--
-- Se puede ejecutar más de una vez sin problema.

-- ---------------------------------------------------------------------------
-- 0) Comprobador de admin (lo usan todas las funciones del panel)
-- ---------------------------------------------------------------------------
create or replace function panel_exigir_admin()
returns void
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
end;
$$;

-- Estado "real" de un documento: faltante / pendiente / rechazado / vigente / por_caducar / caducado
create or replace function panel_estado_doc(p_estado text, p_caduca date)
returns text
language sql
stable
as $$
  select case
    when p_estado is null then 'faltante'
    when p_estado = 'aprobado' and p_caduca is not null and p_caduca < current_date then 'caducado'
    when p_estado = 'aprobado' and p_caduca is not null and p_caduca <= current_date + 15 then 'por_caducar'
    when p_estado = 'aprobado' then 'vigente'
    else p_estado
  end;
$$;

-- ---------------------------------------------------------------------------
-- 1) Caducidad
-- ---------------------------------------------------------------------------
alter table documentos_requeridos add column if not exists vigencia_meses integer not null default 2;
alter table documentos_requeridos drop constraint if exists documentos_requeridos_vigencia_valida;
alter table documentos_requeridos add constraint documentos_requeridos_vigencia_valida check (vigencia_meses >= 0);
comment on column documentos_requeridos.vigencia_meses is
  'Meses que vale un documento aprobado. 0 = no caduca.';

alter table documentos_cuenta add column if not exists caduca_en date;

-- ---------------------------------------------------------------------------
-- 2) Trabajadores y sus documentos
-- ---------------------------------------------------------------------------
create table if not exists trabajadores (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid not null references auth.users (id) on delete cascade,
  nombre text not null,
  apellidos text,
  dni text not null,
  puesto text,
  telefono text,
  email text,
  fecha_alta date,
  activo boolean not null default true,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, dni)
);
create index if not exists idx_trabajadores_profile on trabajadores (profile_id);
alter table trabajadores enable row level security;
drop policy if exists trabajadores_select on trabajadores;
create policy trabajadores_select on trabajadores
  for select using (profile_id = auth.uid() or auth_role() in ('admin', 'superadmin'));
-- Sin políticas de insertar ni de editar: solo se escribe con las funciones panel_*.

create table if not exists documentos_trabajador_requeridos (
  tipo text primary key,
  etiqueta text not null,
  descripcion text,
  obligatorio boolean not null default true,
  orden integer not null default 0,
  vigencia_meses integer not null default 2 check (vigencia_meses >= 0)
);
alter table documentos_trabajador_requeridos enable row level security;
drop policy if exists doc_trab_req_select on documentos_trabajador_requeridos;
create policy doc_trab_req_select on documentos_trabajador_requeridos for select to authenticated using (true);
drop policy if exists doc_trab_req_admin_write on documentos_trabajador_requeridos;
create policy doc_trab_req_admin_write on documentos_trabajador_requeridos
  for all using (auth_role() in ('admin', 'superadmin')) with check (auth_role() in ('admin', 'superadmin'));

insert into documentos_trabajador_requeridos (tipo, etiqueta, descripcion, obligatorio, orden, vigencia_meses) values
  ('dni', 'DNI o NIE', 'Copia por las dos caras, en vigor.', true, 10, 2),
  ('alta_ss', 'Alta en la Seguridad Social', 'Informe de situación de alta o último TC2 donde aparezca la persona.', true, 20, 2),
  ('formacion_prl', 'Formación en prevención de riesgos laborales', 'Certificado de la formación de su puesto.', true, 30, 2),
  ('aptitud_medica', 'Aptitud médica', 'Certificado de aptitud del reconocimiento médico.', true, 40, 2),
  ('entrega_epis', 'Entrega de equipos de protección (EPIs)', 'Recibo firmado de entrega de los EPIs.', false, 50, 2)
on conflict (tipo) do nothing;

create table if not exists documentos_trabajador (
  id uuid primary key default uuid_generate_v4(),
  trabajador_id uuid not null references trabajadores (id) on delete cascade,
  tipo text not null,
  nombre_archivo text not null,
  storage_path text not null,
  tipo_mime text,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aprobado', 'rechazado')),
  motivo_rechazo text,
  revisado_por uuid references profiles (id) on delete set null,
  revisado_en timestamptz,
  caduca_en date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trabajador_id, tipo)
);
create index if not exists idx_documentos_trabajador_trab on documentos_trabajador (trabajador_id);
alter table documentos_trabajador enable row level security;
drop policy if exists documentos_trabajador_select on documentos_trabajador;
create policy documentos_trabajador_select on documentos_trabajador
  for select using (
    auth_role() in ('admin', 'superadmin')
    or exists (select 1 from trabajadores t where t.id = trabajador_id and t.profile_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- 3) Historial de archivos y 4) registro de actividad
-- ---------------------------------------------------------------------------
create table if not exists documentos_historial (
  id uuid primary key default uuid_generate_v4(),
  origen text not null check (origen in ('cuenta', 'trabajador')),
  profile_id uuid,
  trabajador_id uuid,
  tipo text not null,
  nombre_archivo text,
  storage_path text,
  estado text,
  motivo_rechazo text,
  revisado_por uuid,
  revisado_en timestamptz,
  caduca_en date,
  subido_en timestamptz,
  archivado_en timestamptz not null default now()
);
create index if not exists idx_documentos_historial_profile on documentos_historial (profile_id, archivado_en desc);
create index if not exists idx_documentos_historial_trab on documentos_historial (trabajador_id, archivado_en desc);
alter table documentos_historial enable row level security;
drop policy if exists documentos_historial_select on documentos_historial;
create policy documentos_historial_select on documentos_historial
  for select using (auth_role() in ('admin', 'superadmin'));

create table if not exists registro_actividad (
  id uuid primary key default uuid_generate_v4(),
  quien uuid,
  accion text not null,
  origen text,
  documento_id uuid,
  profile_id uuid,
  trabajador_id uuid,
  tipo text,
  detalle jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_registro_actividad_fecha on registro_actividad (created_at desc);
create index if not exists idx_registro_actividad_profile on registro_actividad (profile_id, created_at desc);
alter table registro_actividad enable row level security;
drop policy if exists registro_actividad_select on registro_actividad;
create policy registro_actividad_select on registro_actividad
  for select using (auth_role() in ('admin', 'superadmin'));

-- Disparador común a documentos_cuenta y documentos_trabajador
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
    insert into registro_actividad (quien, accion, origen, documento_id, profile_id, trabajador_id, tipo, detalle)
    values (coalesce(auth.uid(), v_profile), 'documento_subido', v_origen, new.id, v_profile, v_trab, new.tipo,
            jsonb_build_object('archivo', new.nombre_archivo, 'sustituye_a', old.nombre_archivo));
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

drop trigger if exists trg_documento_ciclo_cuenta on documentos_cuenta;
create trigger trg_documento_ciclo_cuenta
  before insert or update on documentos_cuenta
  for each row execute function trg_documento_ciclo();
drop trigger if exists trg_documento_ciclo_trabajador on documentos_trabajador;
create trigger trg_documento_ciclo_trabajador
  before insert or update on documentos_trabajador
  for each row execute function trg_documento_ciclo();

-- ---------------------------------------------------------------------------
-- 5) Lecturas del panel
-- ---------------------------------------------------------------------------
-- Una fila por cuenta, con el estado de su documentación y la de sus trabajadores
create or replace function panel_empresas()
returns table (
  profile_id uuid, nombre_completo text, email text, telefono text, role text, estado_cuenta text,
  empresa text, cif text, requeridos integer, aprobados integer, pendientes integer, rechazados integer,
  caducados integer, por_caducar integer, faltan integer, trabajadores integer, trab_incidencias integer,
  semaforo text, proxima_caducidad date
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform panel_exigir_admin();
  return query
  with filas as (
    select p.id as pid, r.obligatorio, d.caduca_en, panel_estado_doc(d.estado, d.caduca_en) as est
    from profiles p
    join documentos_requeridos r on r.role = p.role
    left join documentos_cuenta d on d.profile_id = p.id and d.tipo = r.tipo
    where p.role not in ('admin', 'superadmin')
  ),
  doc as (
    select pid,
      (count(*) filter (where obligatorio))::integer as req,
      (count(*) filter (where obligatorio and est in ('vigente', 'por_caducar')))::integer as ok,
      (count(*) filter (where est = 'pendiente'))::integer as pend,
      (count(*) filter (where est = 'rechazado'))::integer as rech,
      (count(*) filter (where est = 'caducado'))::integer as cad,
      (count(*) filter (where est = 'por_caducar'))::integer as porcad,
      (count(*) filter (where obligatorio and est = 'faltante'))::integer as falt,
      min(caduca_en) filter (where est in ('vigente', 'por_caducar')) as prox
    from filas group by pid
  ),
  filas_t as (
    select t.id as tid, t.profile_id as pid, r.obligatorio, panel_estado_doc(d.estado, d.caduca_en) as est
    from trabajadores t
    cross join documentos_trabajador_requeridos r
    left join documentos_trabajador d on d.trabajador_id = t.id and d.tipo = r.tipo
    where t.activo
  ),
  trab as (
    select pid, count(distinct tid)::integer as n,
      (count(distinct tid) filter (where (obligatorio and est in ('faltante', 'rechazado', 'caducado'))
                                      or est in ('rechazado', 'caducado')))::integer as inc
    from filas_t group by pid
  )
  select b.id, b.nombre_completo, b.email, b.telefono, b.role::text, b.estado_cuenta,
         e.nombre, e.cif,
         coalesce(doc.req, 0), coalesce(doc.ok, 0), coalesce(doc.pend, 0), coalesce(doc.rech, 0),
         coalesce(doc.cad, 0), coalesce(doc.porcad, 0), coalesce(doc.falt, 0),
         coalesce(trab.n, 0), coalesce(trab.inc, 0),
         case
           when coalesce(doc.cad, 0) > 0 or coalesce(doc.rech, 0) > 0 or coalesce(trab.inc, 0) > 0 then 'rojo'
           when coalesce(doc.falt, 0) > 0 or coalesce(doc.pend, 0) > 0 or coalesce(doc.porcad, 0) > 0 then 'ambar'
           else 'verde'
         end,
         doc.prox
  from profiles b
  left join empresas_subcontratistas e on e.id = b.empresa_id
  left join doc on doc.pid = b.id
  left join trab on trab.pid = b.id
  where b.role not in ('admin', 'superadmin')
  order by b.nombre_completo;
end;
$$;

-- Documentos de una cuenta (lo pedido y, si lo hay, lo subido)
create or replace function panel_documentos_cuenta(p_profile_id uuid)
returns table (
  tipo text, etiqueta text, descripcion text, obligatorio boolean, vigencia_meses integer, documento_id uuid,
  nombre_archivo text, storage_path text, tipo_mime text, estado text, estado_real text, motivo_rechazo text,
  caduca_en date, subido_en timestamptz
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
           d.motivo_rechazo, d.caduca_en, d.updated_at
    from documentos_requeridos r
    left join documentos_cuenta d on d.profile_id = p_profile_id and d.tipo = r.tipo
    where r.role = v_role
    order by r.orden, r.tipo;
end;
$$;

-- Trabajadores (de una cuenta, o de todas si no se indica)
create or replace function panel_trabajadores(p_profile_id uuid default null)
returns table (
  id uuid, profile_id uuid, cuenta text, empresa text, nombre text, apellidos text, dni text, puesto text,
  telefono text, email text, fecha_alta date, activo boolean, notas text,
  requeridos integer, aprobados integer, pendientes integer, rechazados integer, caducados integer,
  por_caducar integer, faltan integer, semaforo text, proxima_caducidad date
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform panel_exigir_admin();
  return query
  with filas as (
    select t.id as tid, r.obligatorio, d.caduca_en, panel_estado_doc(d.estado, d.caduca_en) as est
    from trabajadores t
    cross join documentos_trabajador_requeridos r
    left join documentos_trabajador d on d.trabajador_id = t.id and d.tipo = r.tipo
    where p_profile_id is null or t.profile_id = p_profile_id
  ),
  agg as (
    select tid,
      (count(*) filter (where obligatorio))::integer as req,
      (count(*) filter (where obligatorio and est in ('vigente', 'por_caducar')))::integer as ok,
      (count(*) filter (where est = 'pendiente'))::integer as pend,
      (count(*) filter (where est = 'rechazado'))::integer as rech,
      (count(*) filter (where est = 'caducado'))::integer as cad,
      (count(*) filter (where est = 'por_caducar'))::integer as porcad,
      (count(*) filter (where obligatorio and est = 'faltante'))::integer as falt,
      min(caduca_en) filter (where est in ('vigente', 'por_caducar')) as prox
    from filas group by tid
  )
  select t.id, t.profile_id, p.nombre_completo, e.nombre, t.nombre, t.apellidos, t.dni, t.puesto,
         t.telefono, t.email, t.fecha_alta, t.activo, t.notas,
         coalesce(a.req, 0), coalesce(a.ok, 0), coalesce(a.pend, 0), coalesce(a.rech, 0), coalesce(a.cad, 0),
         coalesce(a.porcad, 0), coalesce(a.falt, 0),
         case
           when coalesce(a.cad, 0) > 0 or coalesce(a.rech, 0) > 0 or coalesce(a.falt, 0) > 0 then 'rojo'
           when coalesce(a.pend, 0) > 0 or coalesce(a.porcad, 0) > 0 then 'ambar'
           else 'verde'
         end,
         a.prox
  from trabajadores t
  join profiles p on p.id = t.profile_id
  left join empresas_subcontratistas e on e.id = p.empresa_id
  left join agg a on a.tid = t.id
  where p_profile_id is null or t.profile_id = p_profile_id
  order by t.activo desc, t.apellidos nulls last, t.nombre;
end;
$$;

create or replace function panel_documentos_trabajador(p_trabajador_id uuid)
returns table (
  tipo text, etiqueta text, descripcion text, obligatorio boolean, vigencia_meses integer, documento_id uuid,
  nombre_archivo text, storage_path text, tipo_mime text, estado text, estado_real text, motivo_rechazo text,
  caduca_en date, subido_en timestamptz
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
           d.motivo_rechazo, d.caduca_en, d.updated_at
    from documentos_trabajador_requeridos r
    left join documentos_trabajador d on d.trabajador_id = p_trabajador_id and d.tipo = r.tipo
    order by r.orden, r.tipo;
end;
$$;

-- Cola de revisión: todo lo pendiente (de cuentas y de trabajadores), lo más antiguo primero
create or replace function panel_cola_revision()
returns table (
  origen text, documento_id uuid, profile_id uuid, trabajador_id uuid, cuenta text, empresa text,
  trabajador text, tipo text, etiqueta text, nombre_archivo text, storage_path text, subido_en timestamptz
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
           x.tipo, x.etiqueta, x.nombre_archivo, x.storage_path, x.subido_en
    from (
      select 'cuenta'::text as origen, d.id as documento_id, d.profile_id, null::uuid as trabajador_id,
             p.nombre_completo as cuenta, e.nombre as empresa, null::text as trabajador, d.tipo,
             coalesce(r.etiqueta, d.tipo) as etiqueta, d.nombre_archivo, d.storage_path, d.updated_at as subido_en
        from documentos_cuenta d
        join profiles p on p.id = d.profile_id
        left join empresas_subcontratistas e on e.id = p.empresa_id
        left join documentos_requeridos r on r.role = p.role and r.tipo = d.tipo
        where d.estado = 'pendiente'
      union all
      select 'trabajador', d.id, t.profile_id, t.id, p.nombre_completo, e.nombre,
             btrim(t.nombre || ' ' || coalesce(t.apellidos, '')), d.tipo,
             coalesce(r.etiqueta, d.tipo), d.nombre_archivo, d.storage_path, d.updated_at
        from documentos_trabajador d
        join trabajadores t on t.id = d.trabajador_id
        join profiles p on p.id = t.profile_id
        left join empresas_subcontratistas e on e.id = p.empresa_id
        left join documentos_trabajador_requeridos r on r.tipo = d.tipo
        where d.estado = 'pendiente'
    ) x
    order by x.subido_en;
end;
$$;

-- Historial de archivos de un documento (de cuenta o de trabajador)
create or replace function panel_historial_documento(p_origen text, p_profile_id uuid, p_trabajador_id uuid, p_tipo text)
returns table (
  id uuid, nombre_archivo text, storage_path text, estado text, motivo_rechazo text, revisado_en timestamptz,
  caduca_en date, subido_en timestamptz, archivado_en timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform panel_exigir_admin();
  return query
    select h.id, h.nombre_archivo, h.storage_path, h.estado, h.motivo_rechazo, h.revisado_en, h.caduca_en,
           h.subido_en, h.archivado_en
    from documentos_historial h
    where h.origen = p_origen and h.tipo = p_tipo
      and ((p_origen = 'cuenta' and h.profile_id = p_profile_id) or (p_origen = 'trabajador' and h.trabajador_id = p_trabajador_id))
    order by h.archivado_en desc;
end;
$$;

-- Registro de actividad (todo, o solo el de una cuenta)
create or replace function panel_actividad(p_limite integer default 100, p_profile_id uuid default null)
returns table (
  id uuid, created_at timestamptz, accion text, origen text, tipo text, etiqueta text, quien_nombre text,
  cuenta text, trabajador text, detalle jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform panel_exigir_admin();
  return query
    select a.id, a.created_at, a.accion, a.origen, a.tipo,
           coalesce(r1.etiqueta, r2.etiqueta, a.tipo), q.nombre_completo, c.nombre_completo,
           btrim(t.nombre || ' ' || coalesce(t.apellidos, '')), a.detalle
    from registro_actividad a
    left join profiles q on q.id = a.quien
    left join profiles c on c.id = a.profile_id
    left join trabajadores t on t.id = a.trabajador_id
    left join documentos_requeridos r1 on a.origen = 'cuenta' and r1.role = c.role and r1.tipo = a.tipo
    left join documentos_trabajador_requeridos r2 on a.origen = 'trabajador' and r2.tipo = a.tipo
    where p_profile_id is null or a.profile_id = p_profile_id
    order by a.created_at desc
    limit least(greatest(coalesce(p_limite, 100), 1), 500);
end;
$$;

-- Contadores de la portada
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
    'por_revisar', (select count(*) from documentos_cuenta where estado = 'pendiente')
                 + (select count(*) from documentos_trabajador where estado = 'pendiente'),
    'caducados', (select count(*) from documentos_cuenta where estado = 'aprobado' and caduca_en < current_date)
               + (select count(*) from documentos_trabajador where estado = 'aprobado' and caduca_en < current_date),
    'caducan_pronto', (select count(*) from documentos_cuenta where estado = 'aprobado' and caduca_en between current_date and current_date + 15)
                    + (select count(*) from documentos_trabajador where estado = 'aprobado' and caduca_en between current_date and current_date + 15)
  ) into v;
  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6) Escrituras del panel
-- ---------------------------------------------------------------------------
create or replace function panel_guardar_trabajador(
  p_id uuid, p_profile_id uuid, p_nombre text, p_apellidos text, p_dni text, p_puesto text,
  p_telefono text, p_email text, p_fecha_alta date, p_activo boolean, p_notas text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_dni text := upper(regexp_replace(coalesce(p_dni, ''), '[\s.-]', '', 'g'));
begin
  perform panel_exigir_admin();
  if nullif(btrim(coalesce(p_nombre, '')), '') is null then
    raise exception 'Escribe el nombre del trabajador.';
  end if;
  if v_dni = '' then
    raise exception 'Escribe el DNI o NIE del trabajador.';
  end if;
  if p_id is null then
    if p_profile_id is null or not exists (select 1 from profiles where id = p_profile_id) then
      raise exception 'Elige la cuenta a la que pertenece.';
    end if;
    if exists (select 1 from trabajadores where profile_id = p_profile_id and dni = v_dni) then
      raise exception 'Esa cuenta ya tiene un trabajador con ese DNI.';
    end if;
    insert into trabajadores (profile_id, nombre, apellidos, dni, puesto, telefono, email, fecha_alta, activo, notas)
    values (p_profile_id, btrim(p_nombre), nullif(btrim(coalesce(p_apellidos, '')), ''), v_dni,
            nullif(btrim(coalesce(p_puesto, '')), ''), nullif(btrim(coalesce(p_telefono, '')), ''),
            nullif(btrim(coalesce(p_email, '')), ''), p_fecha_alta, coalesce(p_activo, true),
            nullif(btrim(coalesce(p_notas, '')), ''))
    returning id into v_id;
  else
    if exists (select 1 from trabajadores t where t.profile_id = (select profile_id from trabajadores where id = p_id)
               and t.dni = v_dni and t.id <> p_id) then
      raise exception 'Esa cuenta ya tiene otro trabajador con ese DNI.';
    end if;
    update trabajadores set
      nombre = btrim(p_nombre), apellidos = nullif(btrim(coalesce(p_apellidos, '')), ''), dni = v_dni,
      puesto = nullif(btrim(coalesce(p_puesto, '')), ''), telefono = nullif(btrim(coalesce(p_telefono, '')), ''),
      email = nullif(btrim(coalesce(p_email, '')), ''), fecha_alta = p_fecha_alta,
      activo = coalesce(p_activo, true), notas = nullif(btrim(coalesce(p_notas, '')), ''), updated_at = now()
    where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'Trabajador no encontrado';
    end if;
  end if;
  return v_id;
end;
$$;

-- El equipo sube un archivo en nombre de una cuenta o de un trabajador (y, si quiere, lo aprueba ya)
create or replace function panel_subir_documento(
  p_tipo text, p_profile_id uuid, p_trabajador_id uuid, p_nombre text, p_ruta text, p_mime text,
  p_aprobar boolean default false, p_caduca_en date default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := auth.uid();
  v_profile uuid := p_profile_id;
  v_role user_role;
  v_id uuid;
begin
  perform panel_exigir_admin();
  if p_trabajador_id is not null then
    select t.profile_id into v_profile from trabajadores t where t.id = p_trabajador_id;
    if v_profile is null then
      raise exception 'Trabajador no encontrado';
    end if;
    if not exists (select 1 from documentos_trabajador_requeridos r where r.tipo = p_tipo) then
      raise exception 'Ese documento no se pide a los trabajadores.';
    end if;
  else
    select p.role into v_role from profiles p where p.id = v_profile;
    if v_role is null then
      raise exception 'Cuenta no encontrada';
    end if;
    if not exists (select 1 from documentos_requeridos r where r.role = v_role and r.tipo = p_tipo) then
      raise exception 'Ese documento no se pide a este tipo de cuenta.';
    end if;
  end if;
  if p_ruta is null or left(p_ruta, length(v_profile::text) + 1) <> v_profile::text || '/' then
    raise exception 'Ruta de archivo no válida.';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'documentos-verificacion' and o.name = p_ruta) then
    raise exception 'No se encuentra el archivo subido.';
  end if;
  if nullif(btrim(coalesce(p_nombre, '')), '') is null then
    raise exception 'Falta el nombre del archivo.';
  end if;

  if p_trabajador_id is not null then
    insert into documentos_trabajador (trabajador_id, tipo, nombre_archivo, storage_path, tipo_mime)
    values (p_trabajador_id, p_tipo, left(btrim(p_nombre), 200), p_ruta, p_mime)
    on conflict (trabajador_id, tipo) do update
      set nombre_archivo = excluded.nombre_archivo, storage_path = excluded.storage_path, tipo_mime = excluded.tipo_mime,
          estado = 'pendiente', motivo_rechazo = null, revisado_por = null, revisado_en = null, updated_at = now()
    returning id into v_id;
    if p_aprobar then
      update documentos_trabajador
        set estado = 'aprobado', revisado_por = v_admin, revisado_en = now(), motivo_rechazo = null,
            caduca_en = p_caduca_en, updated_at = now()
        where id = v_id;
    end if;
  else
    insert into documentos_cuenta (profile_id, tipo, nombre_archivo, storage_path, tipo_mime)
    values (v_profile, p_tipo, left(btrim(p_nombre), 200), p_ruta, p_mime)
    on conflict (profile_id, tipo) do update
      set nombre_archivo = excluded.nombre_archivo, storage_path = excluded.storage_path, tipo_mime = excluded.tipo_mime,
          estado = 'pendiente', motivo_rechazo = null, revisado_por = null, revisado_en = null, updated_at = now()
    returning id into v_id;
    if p_aprobar then
      update documentos_cuenta
        set estado = 'aprobado', revisado_por = v_admin, revisado_en = now(), motivo_rechazo = null,
            caduca_en = p_caduca_en, updated_at = now()
        where id = v_id;
    end if;
  end if;
  return v_id;
end;
$$;

-- Aprobar o rechazar el documento de un trabajador (los de cuenta usan revisar_documento_cuenta)
create or replace function panel_revisar_documento_trabajador(p_documento_id uuid, p_aprobar boolean, p_motivo text default null,
                                                              p_caduca_en date default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := auth.uid();
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_profile uuid;
  v_etiqueta text;
  v_tipo text;
  v_nombre text;
  v_cuerpo text;
begin
  perform panel_exigir_admin();
  if p_aprobar is null then
    raise exception 'Indica si apruebas o rechazas el documento.';
  end if;
  select t.profile_id, d.tipo, btrim(t.nombre || ' ' || coalesce(t.apellidos, ''))
    into v_profile, v_tipo, v_nombre
    from documentos_trabajador d join trabajadores t on t.id = d.trabajador_id
    where d.id = p_documento_id for update of d;
  if v_profile is null then
    raise exception 'Documento no encontrado';
  end if;
  if not p_aprobar and (v_motivo is null or length(v_motivo) < 3) then
    raise exception 'Escribe el motivo del rechazo.';
  end if;

  update documentos_trabajador
    set estado = case when p_aprobar then 'aprobado' else 'rechazado' end,
        motivo_rechazo = case when p_aprobar then null else left(v_motivo, 500) end,
        caduca_en = case when p_aprobar then p_caduca_en else caduca_en end,
        revisado_por = v_admin, revisado_en = now(), updated_at = now()
    where id = p_documento_id;

  if not p_aprobar then
    select r.etiqueta into v_etiqueta from documentos_trabajador_requeridos r where r.tipo = v_tipo;
    v_cuerpo := coalesce(v_etiqueta, v_tipo) || ' de ' || v_nombre || ': ' || v_motivo || '.';
    insert into notificaciones (user_id, tipo, titulo, cuerpo, datos)
    values (v_profile, 'documento_rechazado', 'Documento de un trabajador rechazado', v_cuerpo,
            jsonb_build_object('tipo_documento', v_tipo));
    begin
      perform enviar_push(v_profile, 'Documento de un trabajador rechazado', v_cuerpo, jsonb_build_object('tipo', 'documento_rechazado'));
    exception when others then
      null;
    end;
  end if;
end;
$$;

-- Cambiar la fecha de caducidad de un documento aprobado
create or replace function panel_fijar_caducidad(p_origen text, p_documento_id uuid, p_fecha date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform panel_exigir_admin();
  if p_origen = 'trabajador' then
    update documentos_trabajador set caduca_en = p_fecha, updated_at = now() where id = p_documento_id and estado = 'aprobado';
  elsif p_origen = 'cuenta' then
    update documentos_cuenta set caduca_en = p_fecha, updated_at = now() where id = p_documento_id and estado = 'aprobado';
  else
    raise exception 'Origen no válido.';
  end if;
  if not found then
    raise exception 'Solo se puede fijar la caducidad de un documento aprobado.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7) Avisos de caducidad (15 días, 7 días y el día que caduca)
-- ---------------------------------------------------------------------------
create table if not exists avisos_caducidad (
  origen text not null,
  documento_id uuid not null,
  caduca_en date not null,
  umbral integer not null,
  enviado_en timestamptz not null default now(),
  primary key (origen, documento_id, caduca_en, umbral)
);
alter table avisos_caducidad enable row level security;
drop policy if exists avisos_caducidad_select on avisos_caducidad;
create policy avisos_caducidad_select on avisos_caducidad for select using (auth_role() in ('admin', 'superadmin'));

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
      where d.estado = 'aprobado' and d.caduca_en is not null and d.caduca_en <= current_date + 15
    union all
    select 'trabajador', d.id, t.profile_id, t.id, d.tipo, d.caduca_en, coalesce(r.etiqueta, d.tipo),
           btrim(t.nombre || ' ' || coalesce(t.apellidos, ''))
      from documentos_trabajador d
      join trabajadores t on t.id = d.trabajador_id
      left join documentos_trabajador_requeridos r on r.tipo = d.tipo
      where d.estado = 'aprobado' and t.activo and d.caduca_en is not null and d.caduca_en <= current_date + 15
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
-- 8) Almacén: el equipo puede subir y borrar archivos de cualquier cuenta
-- ---------------------------------------------------------------------------
drop policy if exists "documentos_verificacion_admin_insert" on storage.objects;
create policy "documentos_verificacion_admin_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documentos-verificacion' and auth_role() in ('admin', 'superadmin'));
drop policy if exists "documentos_verificacion_admin_delete" on storage.objects;
create policy "documentos_verificacion_admin_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'documentos-verificacion' and auth_role() in ('admin', 'superadmin'));

-- ---------------------------------------------------------------------------
-- 9) Permisos: las funciones del panel solo las puede llamar quien haya iniciado sesión (y dentro
--    comprueban que sea admin); avisar_caducidades solo la ejecuta el programador (pg_cron).
-- ---------------------------------------------------------------------------
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as firma
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname like 'panel\_%'
  loop
    execute format('revoke all on function %s from public, anon', f.firma);
    execute format('grant execute on function %s to authenticated', f.firma);
  end loop;
end;
$$;
revoke all on function avisar_caducidades() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 10) PROGRAMAR EL AVISO DIARIO (una sola vez, a mano)
-- ---------------------------------------------------------------------------
-- En Supabase: Database -> Extensions -> activar "pg_cron". Luego ejecutar esto (cada día a las 7:00 UTC):
--
--   select cron.schedule('avisar-caducidades', '0 7 * * *', $cron$ select avisar_caducidades(); $cron$);
--
-- Para probarlo sin esperar:  select avisar_caducidades();
-- Para quitarlo:              select cron.unschedule('avisar-caducidades');