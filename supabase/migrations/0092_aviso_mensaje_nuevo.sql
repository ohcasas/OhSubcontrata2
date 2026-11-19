-- ============================================================================
-- 0092 · Aviso a administración cuando alguien escribe al chat de Administración
-- ============================================================================
-- REQUISITO: 0066 (chat), 0086 (avisos al admin), 0090 (Telegram con formato).
--
-- Qué hace
--   Cuando una cuenta escribe en su chat con «Administración 3B Conecta», se avisa a administración:
--     · en la campana del panel (con el enlace directo a esa conversación),
--     · por Telegram, con el mismo formato que los demás avisos y un botón «Abrir mensajes».
--   El aviso al móvil (notificación push) ya lo manda el propio chat: aquí no se duplica.
--
-- Protección de datos
--   · Telegram NO lleva nombres ni el texto del mensaje: solo el tipo de cuenta, si es texto, foto o audio, y el botón.
--     El contenido y el nombre se ven únicamente dentro del panel, con tu sesión.
--   · Solo cuenta lo que escribe el USUARIO a Administración. Lo que escribe el equipo no genera aviso,
--     y los chats privados entre usuarios no se miran ni se avisan nunca.
--   · Anti-saturación: si la misma persona manda varios mensajes seguidos, solo se avisa del primero
--     (hasta que pasen 10 minutos desde su mensaje anterior).
--   · Si el aviso falla, el mensaje se envía igualmente.
--   · No se envían correos.
-- Se puede ejecutar más de una vez sin problema.

alter table ajustes_avisos_admin add column if not exists mensaje_nuevo boolean not null default true;

create or replace function trg_aviso_mensaje_nuevo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  c chat_conversaciones%rowtype;
  v_rol text;
  v_pend integer;
  v_clase text;
  r record;
begin
  begin
    if new.emisor_id is null then return new; end if;
    if not coalesce((select mensaje_nuevo from ajustes_avisos_admin where id), true) then return new; end if;

    select * into c from chat_conversaciones where id = new.conversacion_id;
    -- Solo el chat de soporte, y solo cuando escribe el usuario (no el equipo)
    if not found or c.tipo <> 'soporte' or new.emisor_id is distinct from c.usuario_a then return new; end if;
    if chat_es_equipo(new.emisor_id) then return new; end if;

    -- Varios mensajes seguidos: solo se avisa del primero
    if exists (select 1 from chat_mensajes m
                where m.conversacion_id = new.conversacion_id and m.emisor_id = new.emisor_id
                  and m.id <> new.id and m.created_at > now() - interval '10 minutes') then
      return new;
    end if;

    select initcap(replace(p.role::text, '_', ' ')) into v_rol from profiles p where p.id = new.emisor_id;
    select count(*) into v_pend
      from chat_conversaciones cc
     where cc.tipo = 'soporte'
       and exists (select 1 from chat_mensajes m where m.conversacion_id = cc.id and m.emisor_id = cc.usuario_a
                    and m.created_at > coalesce(cc.equipo_leido_hasta, '-infinity'::timestamptz));
    v_clase := case new.tipo when 'imagen' then 'Foto' when 'audio' then 'Mensaje de voz' else 'Mensaje de texto' end;

    -- Campana del panel (sin push: el chat ya lo manda)
    for r in select id from profiles where role::text in ('admin', 'superadmin') loop
      insert into notificaciones (user_id, tipo, titulo, cuerpo, datos)
      values (r.id, 'mensaje_nuevo', 'Mensaje nuevo en Administración',
              coalesce(chat_nombre(new.emisor_id), 'Alguien') || ' ha escrito a Administración (' || lower(v_clase) || ').',
              jsonb_build_object('enlace', '#/mensajes?c=' || new.conversacion_id::text));
    end loop;

    -- Telegram: sin nombre ni texto
    perform enviar_telegram(
      E'💬 <b>Mensaje nuevo en Administración</b>\n━━━━━━━━━━━━━━━━━━━━━━\n'
        || E'🏷 <b>De:</b> ' || tg_esc(coalesce(v_rol, 'Cuenta')) || E'\n'
        || E'📎 <b>Tipo:</b> ' || v_clase || E'\n'
        || E'📥 <b>Conversaciones por responder:</b> ' || greatest(v_pend, 1)
        || E'\n\n🕐 <i>' || to_char(now() at time zone 'Europe/Madrid', 'DD/MM/YYYY · HH24:MI') || '</i>',
      jsonb_build_array(jsonb_build_object('t', '💬 Abrir mensajes', 'e', '#/mensajes?c=' || new.conversacion_id::text)));
  exception when others then
    null;   -- avisar nunca debe impedir que el mensaje se envíe
  end;
  return new;
end;
$$;

drop trigger if exists aviso_mensaje_nuevo on chat_mensajes;
create trigger aviso_mensaje_nuevo after insert on chat_mensajes
  for each row execute function trg_aviso_mensaje_nuevo();

-- ---------------------------------------------------------------------------
-- Para apagarlo:   update ajustes_avisos_admin set mensaje_nuevo = false where id;
-- Para encenderlo: update ajustes_avisos_admin set mensaje_nuevo = true where id;
-- ---------------------------------------------------------------------------