-- 0064 · Denunciar contenido y bloquear usuarios
-- · Cualquier cuenta puede denunciar una publicación del tablón, una ficha del directorio, una obra o a un usuario.
-- · Cualquier cuenta puede bloquear a otro usuario (salvo al equipo de 3B): la app deja de mostrarle su contenido.
-- · El equipo de 3B ve las denuncias en el panel y las resuelve (descartar, revisado o eliminar el contenido).

-- ---------------------------------------------------------------------------
-- Tablas (solo se tocan a través de las funciones de abajo)
-- ---------------------------------------------------------------------------
create table if not exists reportes_contenido (
  id uuid primary key default gen_random_uuid(),
  reportante_id uuid not null references profiles (id) on delete cascade,
  tipo text not null check (tipo in ('publicacion_tablon', 'ficha_directorio', 'obra', 'usuario')),
  objeto_id uuid not null,
  usuario_denunciado_id uuid references profiles (id) on delete set null,
  motivo text not null check (motivo in ('ofensivo', 'spam', 'engano', 'inapropiado', 'otro')),
  detalle text check (detalle is null or char_length(detalle) <= 1000),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'revisado', 'descartado', 'accion_tomada')),
  nota_admin text,
  resuelto_por uuid references profiles (id) on delete set null,
  resuelto_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_reportes_estado on reportes_contenido (estado, created_at desc);
create unique index if not exists uq_reporte_pendiente
  on reportes_contenido (reportante_id, tipo, objeto_id) where estado = 'pendiente';

create table if not exists bloqueos_usuario (
  bloqueador_id uuid not null references profiles (id) on delete cascade,
  bloqueado_id uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (bloqueador_id, bloqueado_id),
  check (bloqueador_id <> bloqueado_id)
);

alter table reportes_contenido enable row level security;
alter table bloqueos_usuario enable row level security;
revoke all on reportes_contenido, bloqueos_usuario from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Funciones de la app
-- ---------------------------------------------------------------------------
create or replace function app_reportar(p_tipo text, p_objeto_id uuid, p_motivo text, p_detalle text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_denunciado uuid;
  v_existe boolean;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if p_tipo not in ('publicacion_tablon', 'ficha_directorio', 'obra', 'usuario') then
    raise exception 'Tipo de contenido no válido.';
  end if;
  if p_motivo not in ('ofensivo', 'spam', 'engano', 'inapropiado', 'otro') then
    raise exception 'Elige un motivo.';
  end if;
  if p_detalle is not null and char_length(p_detalle) > 1000 then
    raise exception 'El detalle es demasiado largo (máximo 1000 caracteres).';
  end if;

  if p_tipo = 'publicacion_tablon' then
    select autor_id into v_denunciado from publicaciones_tablon where id = p_objeto_id;
    v_existe := found;
  elsif p_tipo = 'ficha_directorio' then
    select profile_id into v_denunciado from fichas_directorio where profile_id = p_objeto_id;
    v_existe := found;
  elsif p_tipo = 'obra' then
    select creado_por into v_denunciado from obras where id = p_objeto_id;
    v_existe := found;
  else
    select id into v_denunciado from profiles where id = p_objeto_id;
    v_existe := found;
  end if;
  if not v_existe then raise exception 'Ese contenido ya no existe.'; end if;
  if v_denunciado = v_uid then raise exception 'No puedes denunciar tu propio contenido.'; end if;

  if (select count(*) from reportes_contenido where reportante_id = v_uid and created_at > now() - interval '1 day') >= 20 then
    raise exception 'Has enviado muchas denuncias hoy. Inténtalo mañana.';
  end if;

  insert into reportes_contenido (reportante_id, tipo, objeto_id, usuario_denunciado_id, motivo, detalle)
  values (v_uid, p_tipo, p_objeto_id, v_denunciado, p_motivo, nullif(btrim(p_detalle), ''))
  on conflict do nothing;   -- ya hay una denuncia pendiente tuya sobre lo mismo
end;
$$;

create or replace function app_bloquear(p_usuario_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if p_usuario_id is null or p_usuario_id = v_uid then raise exception 'No puedes bloquearte a ti mismo.'; end if;
  if not exists (select 1 from profiles where id = p_usuario_id) then raise exception 'Ese usuario no existe.'; end if;
  if exists (select 1 from profiles where id = p_usuario_id and role::text in ('admin', 'superadmin', 'administrador')) then
    raise exception 'No se puede bloquear al equipo de 3B. Si hay un problema, denúncialo.';
  end if;
  insert into bloqueos_usuario (bloqueador_id, bloqueado_id) values (v_uid, p_usuario_id) on conflict do nothing;
end;
$$;

create or replace function app_desbloquear(p_usuario_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  delete from bloqueos_usuario where bloqueador_id = auth.uid() and bloqueado_id = p_usuario_id;
end;
$$;

create or replace function app_mis_bloqueos()
returns table (usuario_id uuid, nombre text, desde timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  return query
    select b.bloqueado_id,
           coalesce(nullif(e.nombre, ''), nullif(p.nombre_completo, ''), 'Usuario'),
           b.created_at
      from bloqueos_usuario b
      join profiles p on p.id = b.bloqueado_id
      left join empresas_subcontratistas e on e.id = p.empresa_id
     where b.bloqueador_id = auth.uid()
     order by b.created_at desc;
end;
$$;

-- ---------------------------------------------------------------------------
-- Panel de 3B
-- ---------------------------------------------------------------------------
create or replace function panel_reportes(p_estado text default null)
returns table (
  id uuid, tipo text, objeto_id uuid, objeto_titulo text, motivo text, detalle text, estado text,
  nota_admin text, created_at timestamptz, resuelto_at timestamptz,
  reportante_nombre text, reportante_email text, denunciado_id uuid, denunciado_nombre text, denunciado_email text,
  total_pendientes_objeto bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform panel_exigir_admin();
  return query
    select r.id, r.tipo, r.objeto_id,
           case r.tipo
             when 'publicacion_tablon' then (select t.titulo from publicaciones_tablon t where t.id = r.objeto_id)
             when 'ficha_directorio' then (select f.nombre_mostrar from fichas_directorio f where f.profile_id = r.objeto_id)
             when 'obra' then (select o.titulo from obras o where o.id = r.objeto_id)
             else (select pu.nombre_completo from profiles pu where pu.id = r.objeto_id)
           end,
           r.motivo, r.detalle, r.estado, r.nota_admin, r.created_at, r.resuelto_at,
           pr.nombre_completo, au.email::text, r.usuario_denunciado_id, pd.nombre_completo, ad.email::text,
           (select count(*) from reportes_contenido x where x.tipo = r.tipo and x.objeto_id = r.objeto_id and x.estado = 'pendiente')
      from reportes_contenido r
      left join profiles pr on pr.id = r.reportante_id
      left join auth.users au on au.id = r.reportante_id
      left join profiles pd on pd.id = r.usuario_denunciado_id
      left join auth.users ad on ad.id = r.usuario_denunciado_id
     where p_estado is null or r.estado = p_estado
     order by (r.estado = 'pendiente') desc, r.created_at desc;
end;
$$;

create or replace function panel_resolver_reporte(p_id uuid, p_accion text, p_nota text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r reportes_contenido;
  v_estado text;
begin
  perform panel_exigir_admin();
  select * into r from reportes_contenido where id = p_id;
  if not found then raise exception 'Esa denuncia ya no existe.'; end if;
  if p_accion not in ('descartar', 'revisado', 'eliminar_contenido') then
    raise exception 'Acción no válida.';
  end if;

  if p_accion = 'eliminar_contenido' then
    if r.tipo = 'publicacion_tablon' then
      delete from publicaciones_tablon where id = r.objeto_id;
    elsif r.tipo = 'ficha_directorio' then
      delete from fichas_directorio where profile_id = r.objeto_id;
    else
      raise exception 'Este tipo de contenido se gestiona desde su propia sección (Obras o Cuentas).';
    end if;
    v_estado := 'accion_tomada';
  else
    v_estado := case p_accion when 'descartar' then 'descartado' else 'revisado' end;
  end if;

  -- Se resuelven juntas todas las denuncias pendientes sobre lo mismo.
  update reportes_contenido
     set estado = v_estado, nota_admin = nullif(btrim(p_nota), ''), resuelto_por = auth.uid(), resuelto_at = now()
   where tipo = r.tipo and objeto_id = r.objeto_id and estado = 'pendiente';
end;
$$;

revoke all on function app_reportar(text, uuid, text, text), app_bloquear(uuid), app_desbloquear(uuid),
  app_mis_bloqueos(), panel_reportes(text), panel_resolver_reporte(uuid, text, text) from public, anon;
grant execute on function app_reportar(text, uuid, text, text), app_bloquear(uuid), app_desbloquear(uuid),
  app_mis_bloqueos(), panel_reportes(text), panel_resolver_reporte(uuid, text, text) to authenticated;