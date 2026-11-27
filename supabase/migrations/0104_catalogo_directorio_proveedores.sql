-- 0104 · Directorio de proveedores para el catálogo de particulares.
-- Ejecutar DESPUÉS de 0094, 0101, 0102 y 0103. No enciende nada: el catálogo sigue apagado (ajustes_catalogo.activo).
-- Qué hace:
--   * Administración da de alta, edita, publica y oculta proveedores desde el panel (no se borra nada).
--   * Un proveedor solo se publica si Administración marca que tiene su consentimiento para aparecer en la app.
--   * Los datos de contacto (teléfono, email, web) solo se enseñan al cliente si Administración los marca como visibles.
--   * El cliente puede escribir a un proveedor: el mensaje llega a Administración (panel), que lo hace llegar al proveedor.
--     NO se envía ningún correo ni mensaje automático. El cliente debe aceptar que se comparta su mensaje y su teléfono.
--   * No hay puntuaciones ni ránking automático de proveedores: el orden lo decide Administración.
begin;

create table if not exists catalogo_proveedores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(btrim(nombre)) between 2 and 120),
  categoria_codigo text references catalogo_categorias (codigo) on update cascade on delete set null,
  zona text check (zona is null or length(zona) <= 120),
  descripcion text check (descripcion is null or length(descripcion) <= 600),
  telefono text check (telefono is null or telefono ~ '^[0-9+() .-]{6,25}$'),
  email text check (email is null or (length(email) <= 120 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  web text check (web is null or (length(web) <= 200 and web ~* '^https?://')),
  consentimiento boolean not null default false,
  consentimiento_en timestamptz,
  mostrar_contacto boolean not null default false,
  publicado boolean not null default false,
  orden integer not null default 0,
  creado_por uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catalogo_prov_publica_con_consentimiento check (not publicado or consentimiento),
  constraint catalogo_prov_contacto_con_consentimiento check (not mostrar_contacto or consentimiento)
);
create index if not exists idx_catalogo_prov_pub on catalogo_proveedores (publicado, categoria_codigo, orden, nombre);

create table if not exists catalogo_proveedor_mensajes (
  id uuid primary key default gen_random_uuid(),
  proveedor_id uuid not null references catalogo_proveedores (id) on delete cascade,
  usuario_id uuid not null references auth.users (id) on delete cascade,
  mensaje text not null check (length(btrim(mensaje)) between 5 and 1000 and mensaje !~ '[0-9]{13,19}'),
  acepta_compartir boolean not null check (acepta_compartir),
  estado text not null default 'nuevo' check (estado in ('nuevo', 'reenviado', 'descartado')),
  gestionado_por uuid,
  gestionado_en timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_catalogo_provmsg_estado on catalogo_proveedor_mensajes (estado, created_at desc);
create index if not exists idx_catalogo_provmsg_usuario on catalogo_proveedor_mensajes (usuario_id, created_at desc);

alter table catalogo_proveedores enable row level security;
alter table catalogo_proveedor_mensajes enable row level security;
drop policy if exists catalogo_prov_admin on catalogo_proveedores;
create policy catalogo_prov_admin on catalogo_proveedores for select to authenticated using (catalogo_es_admin());
drop policy if exists catalogo_provmsg_admin on catalogo_proveedor_mensajes;
create policy catalogo_provmsg_admin on catalogo_proveedor_mensajes for select to authenticated using (catalogo_es_admin());
drop policy if exists catalogo_provmsg_propios on catalogo_proveedor_mensajes;
create policy catalogo_provmsg_propios on catalogo_proveedor_mensajes for select to authenticated using (usuario_id = auth.uid());
revoke all on table catalogo_proveedores from anon, authenticated;
revoke all on table catalogo_proveedor_mensajes from anon, authenticated;
grant select on table catalogo_proveedores to authenticated;           -- la política solo deja ver a administración
grant select on table catalogo_proveedor_mensajes to authenticated;

drop trigger if exists trg_hist_catalogo_proveedores on catalogo_proveedores;
create trigger trg_hist_catalogo_proveedores after insert or update or delete on catalogo_proveedores
  for each row execute function trg_config_precios_historial();
drop trigger if exists trg_hist_catalogo_provmsg on catalogo_proveedor_mensajes;
create trigger trg_hist_catalogo_provmsg after insert or update or delete on catalogo_proveedor_mensajes
  for each row execute function trg_config_precios_historial();

-- ---------------------------------------------------------------------------
-- Panel: lista completa (incluye ocultos y cuántos mensajes nuevos tiene cada uno)
-- ---------------------------------------------------------------------------
create or replace function panel_prov_listar()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_out jsonb;
begin
  if not catalogo_es_admin() then raise exception 'Solo el personal de administración puede ver los proveedores.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'nombre', p.nombre, 'categoria', p.categoria_codigo, 'categoria_nombre', c.nombre, 'zona', p.zona,
      'descripcion', p.descripcion, 'telefono', p.telefono, 'email', p.email, 'web', p.web,
      'consentimiento', p.consentimiento, 'consentimiento_en', p.consentimiento_en, 'mostrar_contacto', p.mostrar_contacto,
      'publicado', p.publicado, 'orden', p.orden,
      'mensajes_nuevos', (select count(*) from catalogo_proveedor_mensajes m where m.proveedor_id = p.id and m.estado = 'nuevo'))
    order by p.orden, p.nombre), '[]'::jsonb) into v_out
  from catalogo_proveedores p left join catalogo_categorias c on c.codigo = p.categoria_codigo;
  return v_out;
end;
$$;
revoke all on function panel_prov_listar() from public, anon;
grant execute on function panel_prov_listar() to authenticated;

-- ---------------------------------------------------------------------------
-- Panel: crear o editar. Quitar el consentimiento oculta al proveedor y apaga sus datos de contacto.
-- ---------------------------------------------------------------------------
create or replace function panel_prov_guardar(
  p_id uuid, p_nombre text, p_categoria text, p_zona text, p_descripcion text,
  p_telefono text, p_email text, p_web text,
  p_consentimiento boolean, p_mostrar_contacto boolean, p_publicado boolean, p_orden integer default 0
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid := p_id; v_ant boolean;
begin
  if not catalogo_es_admin() then raise exception 'Solo el personal de administración puede guardar proveedores.'; end if;
  if p_nombre is null or length(btrim(p_nombre)) < 2 then raise exception 'Escribe el nombre del proveedor.'; end if;
  if p_categoria is not null and p_categoria <> '' and not exists (select 1 from catalogo_categorias where codigo = p_categoria) then
    raise exception 'La categoría no existe.';
  end if;
  if coalesce(p_publicado, false) and not coalesce(p_consentimiento, false) then
    raise exception 'Para publicar a un proveedor necesitas marcar que tienes su consentimiento.';
  end if;
  if coalesce(p_mostrar_contacto, false) and not coalesce(p_consentimiento, false) then
    raise exception 'Para enseñar sus datos de contacto necesitas su consentimiento.';
  end if;
  if v_id is null then
    insert into catalogo_proveedores (nombre, categoria_codigo, zona, descripcion, telefono, email, web, consentimiento, consentimiento_en,
                                      mostrar_contacto, publicado, orden, creado_por)
    values (btrim(p_nombre), nullif(p_categoria, ''), nullif(btrim(coalesce(p_zona, '')), ''), nullif(btrim(coalesce(p_descripcion, '')), ''),
            nullif(btrim(coalesce(p_telefono, '')), ''), nullif(btrim(coalesce(p_email, '')), ''), nullif(btrim(coalesce(p_web, '')), ''),
            coalesce(p_consentimiento, false), case when p_consentimiento then now() end,
            coalesce(p_mostrar_contacto, false), coalesce(p_publicado, false), coalesce(p_orden, 0), auth.uid())
    returning id into v_id;
  else
    select consentimiento into v_ant from catalogo_proveedores where id = v_id;
    if not found then raise exception 'El proveedor no existe.'; end if;
    update catalogo_proveedores set
      nombre = btrim(p_nombre), categoria_codigo = nullif(p_categoria, ''), zona = nullif(btrim(coalesce(p_zona, '')), ''),
      descripcion = nullif(btrim(coalesce(p_descripcion, '')), ''), telefono = nullif(btrim(coalesce(p_telefono, '')), ''),
      email = nullif(btrim(coalesce(p_email, '')), ''), web = nullif(btrim(coalesce(p_web, '')), ''),
      consentimiento = coalesce(p_consentimiento, false),
      consentimiento_en = case when coalesce(p_consentimiento, false) and not v_ant then now()
                               when coalesce(p_consentimiento, false) then consentimiento_en else null end,
      mostrar_contacto = coalesce(p_mostrar_contacto, false), publicado = coalesce(p_publicado, false),
      orden = coalesce(p_orden, 0), updated_at = now()
     where id = v_id;
  end if;
  return v_id;
end;
$$;
revoke all on function panel_prov_guardar(uuid, text, text, text, text, text, text, text, boolean, boolean, boolean, integer) from public, anon;
grant execute on function panel_prov_guardar(uuid, text, text, text, text, text, text, text, boolean, boolean, boolean, integer) to authenticated;

-- Publicar u ocultar rápido (el interruptor de la lista)
create or replace function panel_prov_publicar(p_id uuid, p_publicado boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not catalogo_es_admin() then raise exception 'Solo el personal de administración puede publicar proveedores.'; end if;
  update catalogo_proveedores set publicado = p_publicado, updated_at = now() where id = p_id;
  if not found then raise exception 'El proveedor no existe.'; end if;
end;
$$;
revoke all on function panel_prov_publicar(uuid, boolean) from public, anon;
grant execute on function panel_prov_publicar(uuid, boolean) to authenticated;

-- Mensajes de clientes a proveedores (para que Administración los haga llegar)
create or replace function panel_prov_mensajes()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_out jsonb;
begin
  if not catalogo_es_admin() then raise exception 'Solo el personal de administración puede ver los mensajes.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', m.id, 'estado', m.estado, 'mensaje', m.mensaje, 'creado', m.created_at,
      'proveedor_id', p.id, 'proveedor', p.nombre, 'proveedor_telefono', p.telefono, 'proveedor_email', p.email,
      'persona', pf.nombre_completo, 'telefono', pf.telefono)
    order by (m.estado = 'nuevo') desc, m.created_at desc), '[]'::jsonb) into v_out
  from catalogo_proveedor_mensajes m
  join catalogo_proveedores p on p.id = m.proveedor_id
  left join profiles pf on pf.id = m.usuario_id;
  return v_out;
end;
$$;
revoke all on function panel_prov_mensajes() from public, anon;
grant execute on function panel_prov_mensajes() to authenticated;

create or replace function panel_prov_mensaje_gestionar(p_id uuid, p_estado text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not catalogo_es_admin() then raise exception 'Solo el personal de administración puede gestionar mensajes.'; end if;
  if p_estado not in ('reenviado', 'descartado') then raise exception 'Estado no válido.'; end if;
  update catalogo_proveedor_mensajes set estado = p_estado, gestionado_por = auth.uid(), gestionado_en = now()
   where id = p_id and estado = 'nuevo';
  if not found then raise exception 'El mensaje no existe o ya estaba gestionado.'; end if;
end;
$$;
revoke all on function panel_prov_mensaje_gestionar(uuid, text) from public, anon;
grant execute on function panel_prov_mensaje_gestionar(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- App: lista pública (solo publicados; los datos de contacto solo si Administración los marcó como visibles)
-- ---------------------------------------------------------------------------
create or replace function catalogo_proveedores_listar(p_categoria text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_out jsonb;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if not catalogo_activo() then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'nombre', p.nombre, 'categoria', p.categoria_codigo, 'categoria_nombre', c.nombre,
      'zona', p.zona, 'descripcion', p.descripcion,
      'telefono', case when p.mostrar_contacto then p.telefono end,
      'email', case when p.mostrar_contacto then p.email end,
      'web', case when p.mostrar_contacto then p.web end)
    order by p.orden, p.nombre), '[]'::jsonb) into v_out
  from catalogo_proveedores p left join catalogo_categorias c on c.codigo = p.categoria_codigo
  where p.publicado and p.consentimiento and (p_categoria is null or p.categoria_codigo = p_categoria);
  return v_out;
end;
$$;
revoke all on function catalogo_proveedores_listar(text) from public, anon;
grant execute on function catalogo_proveedores_listar(text) to authenticated;

-- App: el cliente escribe a un proveedor. Llega a Administración; no se envía ningún correo.
create or replace function catalogo_proveedor_escribir(p_proveedor uuid, p_mensaje text, p_acepta boolean)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_id uuid;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  perform exigir_cuenta_activa();
  if not catalogo_activo() then raise exception 'El catálogo todavía no está disponible.'; end if;
  if not coalesce(p_acepta, false) then
    raise exception 'Para enviar el mensaje debes aceptar que se comparta con el proveedor, junto con tu teléfono.';
  end if;
  if not exists (select 1 from catalogo_proveedores where id = p_proveedor and publicado and consentimiento) then
    raise exception 'El proveedor ya no está disponible.';
  end if;
  if p_mensaje is null or length(btrim(p_mensaje)) < 5 or length(p_mensaje) > 1000 then
    raise exception 'Escribe un mensaje de entre 5 y 1000 caracteres.';
  end if;
  if p_mensaje ~ '[0-9]{13,19}' then raise exception 'No escribas números de tarjeta ni de cuenta en el mensaje.'; end if;
  if (select count(*) from catalogo_proveedor_mensajes where usuario_id = v_uid and created_at > now() - interval '24 hours') >= 5 then
    raise exception 'Has enviado muchos mensajes hoy. Inténtalo mañana.';
  end if;
  insert into catalogo_proveedor_mensajes (proveedor_id, usuario_id, mensaje, acepta_compartir)
  values (p_proveedor, v_uid, btrim(p_mensaje), true) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function catalogo_proveedor_escribir(uuid, text, boolean) from public, anon;
grant execute on function catalogo_proveedor_escribir(uuid, text, boolean) to authenticated;

commit;