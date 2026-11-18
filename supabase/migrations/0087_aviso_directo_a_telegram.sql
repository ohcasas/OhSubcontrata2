-- ============================================================================
-- 0087 · Avisos a administración directos a Telegram (gratis, sin n8n)
-- ============================================================================
-- REQUISITO: 0086 aplicada.
--
-- Qué hace
--   Supabase manda el aviso directamente a tu Telegram mediante tu bot, sin pasar por n8n ni ningún otro servicio.
--   Mismos avisos que 0086: cuenta nueva por verificar, petición nueva y documento subido.
--
-- Protección de datos
--   · El mensaje lleva SOLO el título genérico y el enlace al panel (nada de nombres, correos ni teléfonos).
--   · El token del bot se guarda en una tabla SIN ninguna política de lectura: ni el panel ni la app pueden leerla.
--     Solo se ve desde el SQL Editor de Supabase.
--   · Si Telegram falla, el registro o la subida del documento siguen funcionando.
--   · Nace APAGADO: no manda nada hasta que ejecutes el paso de configuración del final.
-- Se puede ejecutar más de una vez sin problema.

create table if not exists ajustes_telegram (
  id boolean primary key default true check (id),
  activo boolean not null default false,
  bot_token text,
  chat_id text,
  panel_url text,
  updated_at timestamptz not null default now()
);
insert into ajustes_telegram (id) values (true) on conflict (id) do nothing;
alter table ajustes_telegram enable row level security;   -- sin políticas: solo el SQL Editor

create or replace function enviar_telegram(p_texto text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  a record;
begin
  select * into a from ajustes_telegram where id;
  if not coalesce(a.activo, false) or a.bot_token is null or a.chat_id is null then
    return;
  end if;
  perform net.http_post(
    url := 'https://api.telegram.org/bot' || a.bot_token || '/sendMessage',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('chat_id', a.chat_id, 'text', p_texto, 'disable_web_page_preview', true)
  );
exception when others then
  null;
end;
$$;
revoke all on function enviar_telegram(text) from public, anon, authenticated;

-- Mismo avisar_admins de la 0086, con Telegram añadido
create or replace function avisar_admins(p_tipo text, p_titulo text, p_cuerpo text, p_enlace text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_push boolean;
  v_url text;
begin
  begin
    select push_movil into v_push from ajustes_avisos_admin where id;
    for r in select id from profiles where role::text in ('admin', 'superadmin') loop
      insert into notificaciones (user_id, tipo, titulo, cuerpo, datos)
      values (r.id, p_tipo, p_titulo, p_cuerpo, jsonb_build_object('enlace', p_enlace));
      if coalesce(v_push, true) then
        perform enviar_push(r.id, p_titulo, p_cuerpo, jsonb_build_object('enlace', p_enlace));
      end if;
    end loop;
    perform disparar_webhook('panel.aviso', jsonb_build_object('tipo', p_tipo, 'titulo', p_titulo, 'enlace', p_enlace));
    select panel_url into v_url from ajustes_telegram where id;
    perform enviar_telegram(p_titulo || coalesce(E'\n' || nullif(coalesce(v_url, '') || coalesce(p_enlace, ''), ''), ''));
  exception when others then
    null;
  end;
end;
$$;
revoke all on function avisar_admins(text, text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- CONFIGURAR (una vez, a mano en el SQL Editor; sustituye los 3 valores)
-- ---------------------------------------------------------------------------
--   update ajustes_telegram set
--     bot_token = 'EL_TOKEN_QUE_TE_DA_BOTFATHER',
--     chat_id   = 'TU_NUMERO_DE_CHAT',
--     panel_url = 'https://TU-DIRECCION-DEL-PANEL/index.html',
--     activo    = true,
--     updated_at = now()
--   where id;
--
-- Para apagarlo:  update ajustes_telegram set activo = false where id;
-- Para probarlo:  select enviar_telegram('Prueba de 3B Conecta');