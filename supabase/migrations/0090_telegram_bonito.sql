-- ============================================================================
-- 0090 · Avisos de Telegram bonitos y detallados
-- ============================================================================
-- REQUISITO: 0086 y 0087 aplicadas. Ejecutar ANTES de la 0089 (si ya la ejecutaste, vuelve a ejecutarla despues).
--
-- Que cambia
--   Antes:  "Cuenta nueva por verificar" + una direccion suelta.
--   Ahora:  icono, titulo en negrita, linea separadora, detalle, hora y un BOTON que lleva a la pantalla correcta.
--   Nuevo:  aviso diario de peticiones con 2 dias o mas sin respuesta (hay que programarlo a mano, ver el final).
--
-- Proteccion de datos (se mantiene)
--   El mensaje NO lleva nombres, correos, telefonos ni direcciones de nadie: solo tipo de aviso, recuentos y el boton.
--   Los datos personales se ven unicamente dentro del panel, con tu sesion.
--   Si la direccion del panel no esta configurada, el mensaje se envia igualmente, sin boton.
-- Se puede ejecutar mas de una vez sin problema.

-- Escapa los caracteres especiales del formato de Telegram
create or replace function tg_esc(p text)
returns text language sql immutable as $$
  select replace(replace(replace(coalesce(p, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;')
$$;

-- Fecha en castellano: "miercoles, 18 de noviembre"
create or replace function fecha_es(p date, p_con_dia boolean default true)
returns text language sql immutable as $$
  select case when p_con_dia then (array['domingo','lunes','martes','miércoles','jueves','viernes','sábado'])[extract(dow from p)::int + 1] || ', ' else '' end
         || extract(day from p)::int || ' de '
         || (array['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'])[extract(month from p)::int]
$$;

-- Mensaje en formato enriquecido (negrita, cursiva, citas) con botones opcionales.
-- p_texto debe venir ya en formato HTML de Telegram (usa tg_esc para el texto variable).
-- p_botones: lista de botones en una fila, p. ej. [{"t":"Abrir el panel","e":"#/panel"}]
drop function if exists enviar_telegram(text);
drop function if exists enviar_telegram(text, text, text);
create or replace function enviar_telegram(p_texto text, p_botones jsonb default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  a record;
  v_base text;
  v_fila jsonb := '[]'::jsonb;
  v_url text;
  x jsonb;
  v_body jsonb;
begin
  select * into a from ajustes_telegram where id;
  if not coalesce(a.activo, false) or a.bot_token is null or a.chat_id is null then
    return;
  end if;

  v_body := jsonb_build_object('chat_id', a.chat_id, 'text', p_texto, 'parse_mode', 'HTML', 'disable_web_page_preview', true);

  v_base := coalesce(a.panel_url, '');
  -- Telegram rechaza TODO el mensaje si un boton lleva una direccion no valida: solo se ponen si es de verdad una direccion
  if p_botones is not null and v_base ~ '^https://' and v_base not ilike '%TU-DIRECCION%' then
    for x in select * from jsonb_array_elements(p_botones) loop
      v_url := v_base || coalesce(x->>'e', '');
      v_fila := v_fila || jsonb_build_object('text', x->>'t', 'url', v_url);
    end loop;
    if jsonb_array_length(v_fila) > 0 then
      v_body := v_body || jsonb_build_object('reply_markup', jsonb_build_object('inline_keyboard', jsonb_build_array(v_fila)));
    end if;
  end if;

  perform net.http_post(
    url := 'https://api.telegram.org/bot' || a.bot_token || '/sendMessage',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := v_body
  );
exception when others then
  null;
end;
$$;
revoke all on function enviar_telegram(text, jsonb) from public, anon, authenticated;

-- Nucleo de avisos: campana + push + n8n + Telegram bonito
drop function if exists avisar_admins(text, text, text, text);
create or replace function avisar_admins(p_tipo text, p_titulo text, p_cuerpo text, p_enlace text, p_detalle_tg text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_push boolean;
  v_icono text;
  v_boton text;
  v_tit text;
  v_det text;
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
  exception when others then
    null;
  end;

  begin
    v_icono := case p_tipo
      when 'cuenta_nueva' then '👤'
      when 'peticion_nueva' then '📝'
      when 'documento_subido' then '📄'
      when 'peticion_sin_respuesta' then '⚠️'
      when 'obra_terminada' then '🏁'
      else '🔔' end;
    v_boton := case p_tipo
      when 'cuenta_nueva' then '🔍 Revisar cuenta'
      when 'peticion_nueva' then '📋 Ver petición'
      when 'documento_subido' then '✅ Revisar documentos'
      when 'peticion_sin_respuesta' then '📋 Abrir peticiones'
      when 'obra_terminada' then '📅 Confirmar fin de obra'
      else '🏠 Abrir en el panel' end;
    v_tit := case p_tipo when 'obra_terminada' then 'Aviso de obra terminada' else p_titulo end;
    v_det := coalesce(p_detalle_tg,
      case p_tipo when 'obra_terminada'
        then E'🏗 Una empresa avisa de que ha terminado una obra\n📅 Falta confirmar la fecha real de fin' end);
    perform enviar_telegram(
      v_icono || ' <b>' || tg_esc(v_tit) || E'</b>\n' || '━━━━━━━━━━━━━━━━━━━━━━'
        || coalesce(E'\n' || v_det, '')
        || E'\n\n🕐 <i>' || to_char(now() at time zone 'Europe/Madrid', 'DD/MM/YYYY · HH24:MI') || '</i>',
      jsonb_build_array(jsonb_build_object('t', v_boton, 'e', p_enlace)));
  exception when others then
    null;
  end;
end;
$$;
revoke all on function avisar_admins(text, text, text, text, text) from public, anon, authenticated;

-- 1) Cuenta nueva
create or replace function trg_aviso_cuenta_nueva()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
  v_tipo text;
begin
  begin
    if new.role::text not in ('admin', 'superadmin')
       and coalesce(new.estado_cuenta, 'pendiente') = 'pendiente'
       and coalesce((select cuenta_nueva from ajustes_avisos_admin where id), true) then
      select count(*) into v_n from profiles
       where estado_cuenta = 'pendiente' and role::text not in ('admin', 'superadmin');
      v_tipo := initcap(replace(new.role::text, '_', ' '));
      perform avisar_admins(
        'cuenta_nueva',
        'Cuenta nueva por verificar',
        coalesce(nullif(new.nombre_completo, ''), 'Alguien') || ' se ha registrado como ' || new.role::text || '.',
        '#/empresas?f=pendiente',
        '🏷 <b>Tipo de cuenta:</b> ' || tg_esc(v_tipo) || E'\n⏳ <b>Estado:</b> pendiente de verificar'
          || E'\n📥 <b>Pendientes en total:</b> ' || greatest(v_n, 1));
    end if;
  exception when others then null;
  end;
  return new;
end;
$$;

-- 2) Peticion nueva de un particular
create or replace function trg_aviso_peticion_nueva()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
begin
  begin
    if new.origen = 'particular' and new.estado::text = 'en_revision'
       and coalesce((select peticion_nueva from ajustes_avisos_admin where id), true) then
      select count(*) into v_n from obras where origen = 'particular' and estado::text = 'en_revision';
      perform avisar_admins(
        'peticion_nueva',
        'Petición nueva por revisar',
        coalesce(new.titulo::text, 'Petición') || '. Respuesta en 3 días laborables.',
        '#/peticiones',
        E'🏠 <b>Origen:</b> Particular'
          || case when new.revisar_antes_de is not null
                  then E'\n⏰ <b>Responder antes del:</b> ' || fecha_es((new.revisar_antes_de at time zone 'Europe/Madrid')::date)
                  else '' end
          || E'\n📥 <b>Por revisar en total:</b> ' || greatest(v_n, 1)
          || E'\n<blockquote>Quedan 3 días laborables para responder.</blockquote>');
    end if;
  exception when others then null;
  end;
  return new;
end;
$$;

-- 3) Documento subido a revisar
create or replace function trg_aviso_documento_subido()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
begin
  begin
    if new.estado = 'pendiente'
       and (tg_op = 'INSERT' or new.storage_path is distinct from old.storage_path)
       and coalesce((select documento_subido from ajustes_avisos_admin where id), true) then
      select count(*) into v_n from documentos_cuenta where estado = 'pendiente';
      perform avisar_admins(
        'documento_subido',
        'Documento por revisar',
        'Se ha subido un documento (' || coalesce(new.tipo, 'sin tipo') || ') pendiente de revisión.',
        '#/revision',
        '📎 <b>Tipo:</b> ' || tg_esc(initcap(replace(coalesce(new.tipo::text, 'sin tipo'), '_', ' ')))
          || E'\n📥 <b>Por revisar en total:</b> ' || greatest(v_n, 1));
    end if;
  exception when others then null;
  end;
  return new;
end;
$$;

-- 4) Peticiones de particulares que llevan 2 dias o mas sin respuesta (para ejecutar una vez al dia)
create or replace function avisar_peticiones_sin_respuesta()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
  v_max int;
  v_vencen int;
begin
  select count(*),
         max(extract(day from now() - coalesce(o.revision_enviada_en, o.created_at))::int),
         count(*) filter (where o.revisar_antes_de is not null and o.revisar_antes_de <= now() + interval '1 day')
    into v_n, v_max, v_vencen
    from obras o
   where o.origen = 'particular' and o.estado::text = 'en_revision'
     and coalesce(o.revision_enviada_en, o.created_at) <= now() - interval '2 days';

  if coalesce(v_n, 0) = 0 then
    return null;   -- nada atrasado: no se molesta
  end if;

  perform avisar_admins(
    'peticion_sin_respuesta',
    case when v_n = 1 then 'Petición sin respuesta' else 'Peticiones sin respuesta' end,
    v_n || case when v_n = 1 then ' petición lleva ' else ' peticiones llevan ' end || 'más de 2 días sin respuesta.',
    '#/peticiones',
    '🏠 <b>' || v_n || '</b>' || case when v_n = 1 then ' petición lleva ' else ' peticiones llevan ' end
      || '<b>2 días o más</b> sin respuesta'
      || case when v_vencen > 0 then E'\n⏰ ' || v_vencen || case when v_vencen = 1 then ' vence' else ' vencen' end || ' hoy o mañana' else '' end
      || E'\n<blockquote>Responder hoy evita que se pase el plazo de 3 días laborables.</blockquote>');
  return v_n || ' avisadas';
end;
$$;
revoke all on function avisar_peticiones_sin_respuesta() from public, anon, authenticated;

-- Para activarlo cada dia laborable a las 8:00 (hora peninsular en invierno = 7:00 UTC), a mano y una sola vez:
--   select cron.schedule('peticiones-sin-respuesta', '0 7 * * 1-5', $cron$ select public.avisar_peticiones_sin_respuesta(); $cron$);
-- Para quitarlo:  select cron.unschedule('peticiones-sin-respuesta');
-- Para ver que mandaria hoy sin esperar:  select avisar_peticiones_sin_respuesta();   (SI hay alguna, avisa de verdad)

-- ---------------------------------------------------------------------------
-- DIRECCION DEL PANEL (a mano, una vez). Ahora mismo pone "TU-DIRECCION-DEL-PANEL": por eso el mensaje no traia boton.
-- Sustituyela por la direccion real donde abres el panel (termina en /index.html):
--   update ajustes_telegram set panel_url = 'https://DIRECCION-REAL/index.html', updated_at = now() where id;
-- Prueba:  select avisar_admins('cuenta_nueva', 'Prueba de aviso', 'Prueba', '#/empresas?f=pendiente', E'🏷 <b>Tipo de cuenta:</b> Particular\n⏳ <b>Estado:</b> pendiente de verificar');
--   (esta prueba tambien llega a la campana y al movil de los administradores)
-- ---------------------------------------------------------------------------