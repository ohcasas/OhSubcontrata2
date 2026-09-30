-- ============================================================================
-- Notificaciones push de verdad (Expo Push Service)
-- ============================================================================
-- Hasta ahora `crear_notificacion()` solo guardaba el aviso en la tabla
-- `notificaciones` (la campana dentro de la app). Esto añade el envío real
-- al móvil: cada usuario registra el token de su dispositivo, y cada vez que
-- se crea una notificación se manda también por push a todos sus tokens.
--
-- Se envía contra el propio servicio de Expo (https://exp.host/...), que ya
-- sabe hablar con FCM (Android) y APNs (iOS) — no hace falta llamar a
-- Firebase directamente desde aquí. Usa pg_net (ya activada para los
-- webhooks de 0018), así que es asíncrono y nunca bloquea la operación real.

create table if not exists push_tokens (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles (id) on delete cascade,
  token text not null,
  plataforma text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, token)
);

comment on table push_tokens is
  'Token de push (Expo) de cada dispositivo donde un usuario ha iniciado sesión. Un usuario puede tener varios (varios móviles).';

alter table push_tokens enable row level security;

drop policy if exists push_tokens_own on push_tokens;
create policy push_tokens_own on push_tokens
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create trigger trg_push_tokens_updated_at before update on push_tokens
  for each row execute function set_updated_at();

-- Envía un push a todos los dispositivos de un usuario. Uso interno de
-- crear_notificacion(); no se expone a la app.
create or replace function enviar_push(p_user_id uuid, p_titulo text, p_cuerpo text, p_datos jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in select token from push_tokens where user_id = p_user_id
  loop
    perform net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Accept', 'application/json'),
      body := jsonb_build_array(jsonb_build_object(
        'to', r.token,
        'title', p_titulo,
        'body', p_cuerpo,
        'data', p_datos
      ))
    );
  end loop;
exception
  when others then
    -- Igual que disparar_webhook(): un fallo al mandar el push (token
    -- caducado, Expo caído...) nunca debe romper la notificación real.
    null;
end;
$$;

revoke execute on function enviar_push(uuid, text, text, jsonb) from public, anon, authenticated;

-- crear_notificacion(): igual que en 0016, pero ahora también dispara el
-- push de verdad a cada usuario, además de guardar el aviso en la campana.
create or replace function crear_notificacion(
  p_empresa_id uuid,
  p_tipo text,
  p_titulo text,
  p_cuerpo text,
  p_datos jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in select p.id from profiles p where p.empresa_id = p_empresa_id
  loop
    insert into notificaciones (user_id, tipo, titulo, cuerpo, datos)
    values (r.id, p_tipo, p_titulo, p_cuerpo, p_datos);

    perform enviar_push(r.id, p_titulo, p_cuerpo, p_datos);
  end loop;
end;
$$;

revoke execute on function crear_notificacion(uuid, text, text, text, jsonb) from public, anon, authenticated;