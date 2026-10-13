-- 0048: webhooks del flujo de peticiones de particulares (hacia n8n → Odoo)
-- Cada evento sale con disparar_webhook() y solo se envía si hay una fila activa en webhooks_config
-- para ese evento; mientras no la haya, no ocurre nada. Si algo falla aquí, NUNCA se bloquea la operación real.
-- Se hacen con triggers sobre las tablas, así no se tocan las funciones de 0043 y 0044.
-- PRIVACIDAD: ningún evento lleva nombre, teléfono, correo ni dirección del particular
-- (eso vive en obras_privado y no sale de la base de datos). Solo identificadores y datos de la obra.
-- Ejecutar DESPUÉS de la 0047.

-- 1) 3B decide sobre una petición (publicar, pedir información, visita, rechazar)
create or replace function wh_peticion_decidida()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref text;
  v_titulo text;
  v_origen text;
begin
  select referencia, titulo, origen into v_ref, v_titulo, v_origen from obras where id = new.obra_id;
  if v_origen = 'particular' then
    perform disparar_webhook('peticion.decidida', jsonb_build_object(
      'obra_id', new.obra_id, 'referencia', v_ref, 'titulo', v_titulo,
      'estado_anterior', new.estado_anterior, 'estado_nuevo', new.estado_nuevo, 'motivo', new.motivo
    ));
  end if;
  return new;
exception when others then
  return new;
end;
$$;
drop trigger if exists trg_wh_peticion_decidida on obra_revision_historial;
create trigger trg_wh_peticion_decidida after insert on obra_revision_historial
  for each row execute function wh_peticion_decidida();

-- 2) Visitas técnicas: asignada, agendada, realizada, cancelada
create or replace function wh_visita()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref text;
  v_evento text;
begin
  select referencia into v_ref from obras where id = new.obra_id;

  if tg_op = 'INSERT' then
    v_evento := 'visita.asignada';
  elsif new.estado is distinct from old.estado then
    v_evento := case new.estado
      when 'agendada' then 'visita.agendada'
      when 'realizada' then 'visita.realizada'
      when 'cancelada' then 'visita.cancelada'
      else null end;
  end if;

  if v_evento is not null then
    perform disparar_webhook(v_evento, jsonb_build_object(
      'visita_id', new.id, 'obra_id', new.obra_id, 'referencia', v_ref, 'tecnico_id', new.tecnico_id,
      'estado', new.estado, 'fecha_visita', new.fecha_visita, 'resultado', new.resultado
    ));
  end if;
  return new;
exception when others then
  return new;
end;
$$;
drop trigger if exists trg_wh_visita on visitas_tecnicas;
create trigger trg_wh_visita after insert or update of estado on visitas_tecnicas
  for each row execute function wh_visita();

-- 3) Ofertas a peticiones de particulares: llega una pendiente de filtrar; 3B la traslada o la descarta
create or replace function wh_oferta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref text;
  v_evento text;
begin
  if tg_op = 'INSERT' then
    if new.filtro_3b = 'pendiente' then v_evento := 'oferta.pendiente'; end if;
  elsif new.filtro_3b is distinct from old.filtro_3b then
    v_evento := case new.filtro_3b
      when 'trasladada' then 'oferta.trasladada'
      when 'descartada' then 'oferta.descartada'
      else null end;
  end if;

  if v_evento is not null then
    select referencia into v_ref from obras where id = new.obra_id;
    perform disparar_webhook(v_evento, jsonb_build_object(
      'postulacion_id', new.id, 'obra_id', new.obra_id, 'referencia', v_ref,
      'empresa_id', new.empresa_id, 'filtro_3b', new.filtro_3b
    ));
  end if;
  return new;
exception when others then
  return new;
end;
$$;
drop trigger if exists trg_wh_oferta on postulaciones;
create trigger trg_wh_oferta after insert or update of filtro_3b on postulaciones
  for each row execute function wh_oferta();

-- 4) El particular adjudica: 3B tiene que compartir sus datos de contacto con la empresa elegida
create or replace function wh_peticion_adjudicada()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa uuid;
begin
  if new.origen = 'particular' and new.estado::text = 'adjudicada' and old.estado::text is distinct from 'adjudicada' then
    select p.empresa_id into v_empresa from postulaciones p where p.obra_id = new.id and p.estado::text = 'aceptada' limit 1;
    perform disparar_webhook('peticion.adjudicada', jsonb_build_object(
      'obra_id', new.id, 'referencia', new.referencia, 'titulo', new.titulo, 'empresa_id', v_empresa
    ));
  end if;
  return new;
exception when others then
  return new;
end;
$$;
drop trigger if exists trg_wh_peticion_adjudicada on obras;
create trigger trg_wh_peticion_adjudicada after update of estado on obras
  for each row execute function wh_peticion_adjudicada();

-- Estas funciones solo las ejecutan los triggers
revoke all on function wh_peticion_decidida() from public, anon, authenticated;
revoke all on function wh_visita() from public, anon, authenticated;
revoke all on function wh_oferta() from public, anon, authenticated;
revoke all on function wh_peticion_adjudicada() from public, anon, authenticated;