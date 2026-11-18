-- ============================================================================
-- 0089 · Resumen diario para administración (Telegram + campana)
-- ============================================================================
-- REQUISITO: 0090 (Telegram bonito) aplicada antes.  0086 (avisos al admin), 0087 (Telegram), 0084/0088 (plazos).
--
-- Qué hace
--   Una vez al día manda UN resumen con lo que está pendiente:
--     · cuentas por verificar,
--     · peticiones de particulares por revisar (y cuántas vencen en 1 día o menos o ya han vencido),
--     · documentos por revisar,
--     · obras con retraso sobre la fecha de fin pactada,
--     · obras en las que la empresa avisó de que terminó y falta confirmar.
--   Si no hay nada pendiente, no manda nada.
--   Llega por Telegram y a la campana del panel. No manda push al móvil para no molestar a diario. No envía correos.
--
-- Protección de datos
--   · El resumen lleva solo números y el enlace al panel: ningún nombre, correo ni teléfono.
--   · Solo va a administración.
--   · Un fallo al enviar nunca rompe nada.
--
-- Ver cómo quedaría hoy sin enviar nada:   select avisar_resumen_diario(true);
-- Se puede ejecutar más de una vez sin problema. El aviso diario se programa a mano al final del archivo.

alter table ajustes_avisos_admin add column if not exists resumen_diario boolean not null default true;

create or replace function avisar_resumen_diario(p_simular boolean default false)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cuentas integer;
  v_pet integer;
  v_pet_urgentes integer;
  v_pet_vencidas integer;
  v_docs integer;
  v_retraso integer;
  v_fin integer;
  v_lineas text[] := '{}';
  v_texto text;
  v_url text;
  v_det text;
  v_tg text;
  v_urg text;
  r record;
begin
  if not p_simular and not coalesce((select resumen_diario from ajustes_avisos_admin where id), true) then
    return null;
  end if;

  select count(*) into v_cuentas from profiles p
   where p.estado_cuenta = 'pendiente' and p.role::text not in ('admin', 'superadmin');

  select count(*),
         count(*) filter (where o.revisar_antes_de <= now() + interval '1 day'),
         count(*) filter (where o.revisar_antes_de < now())
    into v_pet, v_pet_urgentes, v_pet_vencidas
    from obras o where o.origen = 'particular' and o.estado::text = 'en_revision';

  select (select count(*) from documentos_cuenta where estado = 'pendiente')
       + (select count(*) from documentos_trabajador where estado = 'pendiente') into v_docs;

  select count(*) into v_retraso from obras o
   where o.fecha_fin is not null and o.fecha_fin < current_date and o.fecha_fin_real is null
     and o.fin_declarado_en is null and o.estado::text in ('adjudicada', 'en_curso');

  select count(*) into v_fin from obras o
   where o.fin_declarado_en is not null and o.fecha_fin_real is null and o.estado::text in ('adjudicada', 'en_curso');

  if v_cuentas > 0 then
    v_lineas := v_lineas || (v_cuentas || case when v_cuentas = 1 then ' cuenta por verificar' else ' cuentas por verificar' end);
  end if;
  if v_pet > 0 then
    v_det := '';
    if v_pet_vencidas > 0 then
      v_det := v_pet_vencidas || ' con el plazo vencido';
    end if;
    if v_pet_urgentes > v_pet_vencidas then
      v_det := v_det || case when v_det = '' then '' else ' y ' end || (v_pet_urgentes - v_pet_vencidas) || ' que vence en 1 día o menos';
    end if;
    v_lineas := v_lineas || (v_pet || case when v_pet = 1 then ' petición por revisar' else ' peticiones por revisar' end
                             || case when v_det = '' then '' else ' (' || v_det || ')' end);
  end if;
  if v_docs > 0 then
    v_lineas := v_lineas || (v_docs || case when v_docs = 1 then ' documento por revisar' else ' documentos por revisar' end);
  end if;
  if v_retraso > 0 then
    v_lineas := v_lineas || (v_retraso || case when v_retraso = 1 then ' obra con retraso' else ' obras con retraso' end);
  end if;
  if v_fin > 0 then
    v_lineas := v_lineas || (v_fin || case when v_fin = 1 then ' obra con aviso de fin por confirmar' else ' obras con aviso de fin por confirmar' end);
  end if;

  if array_length(v_lineas, 1) is null then
    return null;   -- nada pendiente: no se molesta
  end if;

  v_texto := 'Resumen de 3B Conecta, ' || to_char(current_date, 'DD/MM/YYYY') || E':\n• ' || array_to_string(v_lineas, E'\n• ');
  if p_simular then
    return v_texto;
  end if;

  begin
    for r in select id from profiles where role::text in ('admin', 'superadmin') loop
      insert into notificaciones (user_id, tipo, titulo, cuerpo, datos)
      values (r.id, 'resumen_diario', 'Resumen del día: ' || array_length(v_lineas, 1) || case when array_length(v_lineas, 1) = 1 then ' tema pendiente' else ' temas pendientes' end,
              array_to_string(v_lineas, E'\n'), jsonb_build_object('enlace', '#/panel'));
    end loop;
  exception when others then null;
  end;

  begin
    select panel_url into v_url from ajustes_telegram where id;
    v_tg := '';
    if v_cuentas > 0 then v_tg := v_tg || E'\n👤 <b>' || v_cuentas || '</b>' || case when v_cuentas = 1 then ' cuenta por verificar' else ' cuentas por verificar' end; end if;
    if v_pet > 0 then v_tg := v_tg || E'\n📝 <b>' || v_pet || '</b>' || case when v_pet = 1 then ' petición por revisar' else ' peticiones por revisar' end; end if;
    if v_docs > 0 then v_tg := v_tg || E'\n📄 <b>' || v_docs || '</b>' || case when v_docs = 1 then ' documento por revisar' else ' documentos por revisar' end; end if;
    if v_retraso > 0 then v_tg := v_tg || E'\n🚧 <b>' || v_retraso || '</b>' || case when v_retraso = 1 then ' obra con retraso' else ' obras con retraso' end; end if;
    if v_fin > 0 then v_tg := v_tg || E'\n🏁 <b>' || v_fin || '</b>' || case when v_fin = 1 then ' aviso de fin por confirmar' else ' avisos de fin por confirmar' end; end if;
    v_urg := '';
    if v_pet_vencidas > 0 then v_urg := '🔴 ' || v_pet_vencidas || case when v_pet_vencidas = 1 then ' petición con el plazo vencido' else ' peticiones con el plazo vencido' end; end if;
    if v_pet_urgentes > v_pet_vencidas then
      v_urg := v_urg || case when v_urg = '' then '' else E'\n' end || '🟠 ' || (v_pet_urgentes - v_pet_vencidas)
               || case when v_pet_urgentes - v_pet_vencidas = 1 then ' petición vence' else ' peticiones vencen' end || ' en 1 día o menos';
    end if;
    perform enviar_telegram(
      E'📋 <b>Resumen de 3B Conecta</b>\n<i>' || fecha_es(current_date) || E'</i>\n━━━━━━━━━━━━━━━━━━━━━━' || v_tg
        || case when v_urg = '' then '' else E'\n<blockquote>' || v_urg || '</blockquote>' end,
      jsonb_build_array(jsonb_build_object('t', '🏠 Abrir el panel', 'e', '#/panel'),
                        jsonb_build_object('t', '📋 Ver peticiones', 'e', '#/peticiones')));
  exception when others then null;
  end;
  return v_texto;
end;
$$;
revoke all on function avisar_resumen_diario(boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- PROGRAMARLO (una vez, a mano). Lunes a viernes a las 7:30 UTC (8:30 o 9:30 en España).
-- Antes, prueba:  select avisar_resumen_diario(true);   -- te enseña el texto sin enviar nada
-- En Supabase: Database -> Extensions -> activar "pg_cron". Después:
--
--   select cron.schedule('resumen-diario-admin', '30 7 * * 1-5', $cron$ select public.avisar_resumen_diario(); $cron$);
--
-- Para quitarlo:  select cron.unschedule('resumen-diario-admin');
-- Para apagarlo sin quitar la programación:  update ajustes_avisos_admin set resumen_diario = false where id;