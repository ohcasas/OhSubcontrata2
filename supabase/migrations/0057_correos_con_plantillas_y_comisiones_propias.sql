-- ============================================================================
-- Correos con plantillas editables  +  comisiones propias por empresa u obra (panel)
-- ============================================================================
-- REQUISITO: haber ejecutado antes 0056.
--
-- CORREOS
--   Cada aviso de la app (tabla notificaciones) puede enviarse también por correo si existe
--   una plantilla ACTIVA para su tipo. 3B edita desde el panel (sección "Correos"):
--     - el diseño general: nombre del remitente, color, cabecera, pie, enlace a la app
--     - el asunto, el texto y el botón de cada plantilla
--   Variables que se pueden usar en asunto y texto:
--     {{nombre}} {{titulo}} {{cuerpo}} {{obra}} {{importe}} {{enlace}}
--   Los correos se guardan en una cola (cola_correos) y los envía la Edge Function
--   "enviar-correos" (Resend). Mientras el envío no esté activado en el panel, no sale nada.
--
-- COMISIONES PROPIAS
--   Lista y edición, desde el panel, de las comisiones que se saltan la general.
--
-- Se puede ejecutar más de una vez sin problema.

-- ---------------------------------------------------------------------------
-- 1) Ajustes del correo (una sola fila)
-- ---------------------------------------------------------------------------
create table if not exists ajustes_correo (
  id boolean primary key default true check (id),
  activo boolean not null default false,
  remitente_nombre text not null default '3B Conecta',
  remitente_email text,                       -- debe ser de un dominio verificado en Resend
  responder_a text,
  color text not null default '#0057FF' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  cabecera text not null default '3B Conecta',
  pie text not null default 'Has recibido este correo porque tienes una cuenta en 3B Conecta.',
  app_url text,                               -- enlace del botón por defecto
  funcion_url text,                           -- URL de la Edge Function enviar-correos
  secreto_envio text,                         -- el mismo valor que ENVIO_CORREOS_SECRET en Supabase
  updated_at timestamptz not null default now()
);
insert into ajustes_correo (id) values (true) on conflict (id) do nothing;
alter table ajustes_correo enable row level security;
drop policy if exists ajustes_correo_admin on ajustes_correo;
create policy ajustes_correo_admin on ajustes_correo
  for select using (coalesce(auth_role()::text, '') in ('admin', 'superadmin'));

-- ---------------------------------------------------------------------------
-- 2) Plantillas (una por tipo de aviso)
-- ---------------------------------------------------------------------------
create table if not exists plantillas_correo (
  clave text primary key,                     -- = tipo de la notificación
  nombre text not null,
  asunto text not null,
  cuerpo text not null,
  boton_texto text,
  activa boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table plantillas_correo enable row level security;
drop policy if exists plantillas_correo_admin on plantillas_correo;
create policy plantillas_correo_admin on plantillas_correo
  for select using (coalesce(auth_role()::text, '') in ('admin', 'superadmin'));

insert into plantillas_correo (clave, nombre, asunto, cuerpo, boton_texto) values
 ('pago_retenido', 'Pago realizado y retenido', '{{titulo}}', E'Hola {{nombre}},\n\n{{cuerpo}}', 'Abrir 3B Conecta'),
 ('pago_obra_terminada', 'Obra terminada: el cliente debe revisarla', '{{titulo}}', E'Hola {{nombre}},\n\n{{cuerpo}}', 'Revisar la obra'),
 ('pago_confirmado_cliente', 'El cliente ha confirmado la obra', '{{titulo}}', E'Hola {{nombre}},\n\n{{cuerpo}}', 'Abrir 3B Conecta'),
 ('pago_pendiente_aprobar', 'Pago listo para aprobar (equipo 3B)', '{{titulo}}', E'Hola {{nombre}},\n\n{{cuerpo}}', 'Abrir el panel'),
 ('pago_disputa', 'Problema reportado en un pago', '{{titulo}}', E'Hola {{nombre}},\n\n{{cuerpo}}', 'Ver el detalle'),
 ('pago_liberado', 'Pago liberado', '{{titulo}}', E'Hola {{nombre}},\n\n{{cuerpo}}', 'Abrir 3B Conecta'),
 ('pago_reembolsado', 'Pago reembolsado', '{{titulo}}', E'Hola {{nombre}},\n\n{{cuerpo}}', 'Abrir 3B Conecta')
on conflict (clave) do nothing;

-- ---------------------------------------------------------------------------
-- 3) Cola de envío
-- ---------------------------------------------------------------------------
create table if not exists cola_correos (
  id uuid primary key default uuid_generate_v4(),
  para text not null,
  plantilla text not null,
  variables jsonb not null default '{}'::jsonb,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'enviado', 'error')),
  intentos integer not null default 0,
  error text,
  created_at timestamptz not null default now(),
  enviado_at timestamptz
);
create index if not exists idx_cola_correos_pendiente on cola_correos (created_at) where estado = 'pendiente';
alter table cola_correos enable row level security;

-- Avisa a la Edge Function de que hay correos pendientes (nunca rompe la operación real)
create or replace function disparar_envio_correos()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  a ajustes_correo%rowtype;
begin
  select * into a from ajustes_correo where id;
  if not a.activo or a.funcion_url is null or a.funcion_url = '' then
    return;
  end if;
  perform net.http_post(
    url := a.funcion_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-envio-secret', coalesce(a.secreto_envio, '')),
    body := '{}'::jsonb
  );
exception when others then
  null;
end;
$$;

create or replace function trg_cola_correos_disparar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform disparar_envio_correos();
  return null;
end;
$$;
drop trigger if exists trg_cola_correos_after_insert on cola_correos;
create trigger trg_cola_correos_after_insert
  after insert on cola_correos
  for each statement execute function trg_cola_correos_disparar();

-- Cada aviso de la app con plantilla activa genera un correo
create or replace function encolar_correo_de_notificacion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  a ajustes_correo%rowtype;
  v_email text;
  v_nombre text;
  v_obra text;
  v_importe text;
begin
  select * into a from ajustes_correo where id;
  if not a.activo then
    return new;
  end if;
  if not exists (select 1 from plantillas_correo where clave = new.tipo and activa) then
    return new;
  end if;
  select email, split_part(nombre_completo, ' ', 1) into v_email, v_nombre from profiles where id = new.user_id;
  if v_email is null or v_email = '' then
    return new;
  end if;
  if new.datos ? 'obra_id' then
    select titulo into v_obra from obras where id = (new.datos->>'obra_id')::uuid;
  end if;
  if new.datos ? 'pago_id' then
    select replace(replace(replace(to_char(importe_cents / 100.0, 'FM999,999,990.00'), ',', '#'), '.', ','), '#', '.') || ' €' into v_importe
      from pagos where id = (new.datos->>'pago_id')::uuid;
  end if;
  insert into cola_correos (para, plantilla, variables)
  values (v_email, new.tipo, jsonb_build_object(
    'nombre', coalesce(v_nombre, ''), 'titulo', new.titulo, 'cuerpo', new.cuerpo,
    'obra', coalesce(v_obra, ''), 'importe', coalesce(v_importe, ''), 'enlace', coalesce(a.app_url, '')));
  return new;
exception when others then
  return new;   -- el correo nunca debe impedir que se cree el aviso
end;
$$;
drop trigger if exists trg_notificaciones_correo on notificaciones;
create trigger trg_notificaciones_correo
  after insert on notificaciones
  for each row execute function encolar_correo_de_notificacion();

do $$
begin
  perform cron.unschedule('reintentar_correos');
exception when others then null;
end $$;
do $$
begin
  perform cron.schedule('reintentar_correos', '*/5 * * * *', 'select public.disparar_envio_correos()');
exception when others then
  raise notice 'pg_cron no disponible: los correos se envían al crearse, pero no se reintentan solos.';
end $$;

-- ---------------------------------------------------------------------------
-- 4) Panel: correos
-- ---------------------------------------------------------------------------
create or replace function panel_correos()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  a ajustes_correo%rowtype;
begin
  perform panel_exigir_admin();
  select * into a from ajustes_correo where id;
  return jsonb_build_object(
    'ajustes', jsonb_build_object(
      'activo', a.activo, 'remitente_nombre', a.remitente_nombre, 'remitente_email', a.remitente_email,
      'responder_a', a.responder_a, 'color', a.color, 'cabecera', a.cabecera, 'pie', a.pie,
      'app_url', a.app_url, 'funcion_url', a.funcion_url, 'tiene_secreto', coalesce(a.secreto_envio, '') <> ''),
    'plantillas', coalesce((select jsonb_agg(to_jsonb(p) order by p.nombre) from plantillas_correo p), '[]'::jsonb),
    'pendientes', (select count(*) from cola_correos where estado = 'pendiente'),
    'con_error', (select count(*) from cola_correos where estado = 'error')
  );
end;
$$;

create or replace function panel_guardar_ajustes_correo(
  p_activo boolean, p_remitente_nombre text, p_remitente_email text, p_responder_a text,
  p_color text, p_cabecera text, p_pie text, p_app_url text, p_funcion_url text, p_secreto text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform panel_exigir_admin();
  if p_color is null or p_color !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'El color debe tener el formato #RRGGBB.';
  end if;
  if p_activo and (coalesce(trim(p_remitente_email), '') = '' or coalesce(trim(p_funcion_url), '') = '') then
    raise exception 'Para activar los correos hacen falta el correo remitente y la dirección de la función de envío.';
  end if;
  update ajustes_correo
     set activo = p_activo,
         remitente_nombre = coalesce(nullif(trim(p_remitente_nombre), ''), '3B Conecta'),
         remitente_email = nullif(trim(p_remitente_email), ''),
         responder_a = nullif(trim(p_responder_a), ''),
         color = p_color,
         cabecera = coalesce(nullif(trim(p_cabecera), ''), '3B Conecta'),
         pie = coalesce(p_pie, ''),
         app_url = nullif(trim(p_app_url), ''),
         funcion_url = nullif(trim(p_funcion_url), ''),
         secreto_envio = case when p_secreto is null or p_secreto = '' then secreto_envio else p_secreto end,
         updated_at = now()
   where id;
end;
$$;

create or replace function panel_guardar_plantilla(
  p_clave text, p_asunto text, p_cuerpo text, p_boton_texto text, p_activa boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform panel_exigir_admin();
  if coalesce(trim(p_asunto), '') = '' or length(p_asunto) > 200 then
    raise exception 'El asunto es obligatorio (máximo 200 caracteres).';
  end if;
  if coalesce(trim(p_cuerpo), '') = '' or length(p_cuerpo) > 5000 then
    raise exception 'El texto es obligatorio (máximo 5000 caracteres).';
  end if;
  update plantillas_correo
     set asunto = trim(p_asunto), cuerpo = p_cuerpo, boton_texto = nullif(trim(p_boton_texto), ''),
         activa = p_activa, updated_at = now()
   where clave = p_clave;
  if not found then
    raise exception 'La plantilla no existe.';
  end if;
end;
$$;

-- Envía una prueba a tu propio correo con datos de ejemplo
create or replace function panel_correo_prueba(p_clave text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_nombre text;
  a ajustes_correo%rowtype;
begin
  perform panel_exigir_admin();
  select * into a from ajustes_correo where id;
  if not a.activo then
    raise exception 'Activa primero los correos en los ajustes.';
  end if;
  select email, split_part(nombre_completo, ' ', 1) into v_email, v_nombre from profiles where id = auth.uid();
  if coalesce(v_email, '') = '' then
    raise exception 'Tu cuenta no tiene correo.';
  end if;
  insert into cola_correos (para, plantilla, variables)
  values (v_email, p_clave, jsonb_build_object(
    'nombre', coalesce(v_nombre, ''), 'titulo', '[Prueba] Aviso de ejemplo',
    'cuerpo', 'Este es un texto de ejemplo para ver cómo queda el correo.',
    'obra', 'Reforma de cocina (ejemplo)', 'importe', '1.500,00 €', 'enlace', coalesce(a.app_url, '')));
end;
$$;

-- ---------------------------------------------------------------------------
-- 5) Panel: comisiones propias
-- ---------------------------------------------------------------------------
create or replace function panel_comisiones_propias()
returns table (tipo text, id uuid, nombre text, comision_pct numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform panel_exigir_admin();
  return query
    select 'empresa'::text, e.id, e.nombre, e.comision_pct from empresas_subcontratistas e where e.comision_pct is not null
    union all
    select 'obra'::text, o.id, o.titulo, o.comision_pct from obras o where o.comision_pct is not null
    order by 1, 3;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6) Permisos
-- ---------------------------------------------------------------------------
revoke all on function disparar_envio_correos() from public, anon, authenticated;
revoke all on function trg_cola_correos_disparar() from public, anon, authenticated;
revoke all on function encolar_correo_de_notificacion() from public, anon, authenticated;
grant execute on function disparar_envio_correos() to service_role;

revoke all on function panel_correos() from public, anon;
revoke all on function panel_guardar_ajustes_correo(boolean, text, text, text, text, text, text, text, text, text) from public, anon;
revoke all on function panel_guardar_plantilla(text, text, text, text, boolean) from public, anon;
revoke all on function panel_correo_prueba(text) from public, anon;
revoke all on function panel_comisiones_propias() from public, anon;
grant execute on function panel_correos() to authenticated;
grant execute on function panel_guardar_ajustes_correo(boolean, text, text, text, text, text, text, text, text, text) to authenticated;
grant execute on function panel_guardar_plantilla(text, text, text, text, boolean) to authenticated;
grant execute on function panel_correo_prueba(text) to authenticated;
grant execute on function panel_comisiones_propias() to authenticated;