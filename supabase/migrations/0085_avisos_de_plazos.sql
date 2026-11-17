-- ============================================================================
-- 0085 · Avisos automáticos de plazos de obra (APAGADOS hasta que los actives)
-- ============================================================================
-- REQUISITO: haber ejecutado antes 0084 (fechas de inicio y fin) y 0016/0020 (notificaciones y push).
--
-- Qué hace
--   Cuando una obra adjudicada o en curso tiene fecha de fin pactada y aún no ha terminado, avisa:
--     · a la empresa adjudicada (oficio/subcontrata) y a quien publicó la licitación (constructora, promotora…):
--         - unos días antes del fin (por defecto 7, 3 y 1),
--         - el mismo día de la fecha de fin,
--         - cada día que pasa de retraso, indicando los días y que el retraso conlleva la penalización pactada.
--     · a la administración (campana del panel): 3 días antes, el día de fin y en hitos de retraso (1, 3, 7, 14, 21, 30, 45 y 60 días).
--   Cada aviso se manda UNA sola vez (tabla avisos_plazos_enviados).
--   Los avisos a empresas son notificaciones de la app (campana) y también PUSH al móvil. NO envía correos.
--
-- Seguridad / puesta en marcha
--   · Nace APAGADO (ajustes_avisos_plazos.activos = false): avisar_plazos() no hace nada mientras esté apagado.
--   · No se programa nada solo. El programador (pg_cron) se activa a mano, ver el final del archivo.
--   · Antes de encender, el panel (Plazos de obra) enseña exactamente qué avisos saldrían hoy.
--   · El texto de retraso menciona la penalización pactada pero NO la cobra ni la descuenta.
-- Se puede ejecutar más de una vez sin problema.

create table if not exists ajustes_avisos_plazos (
  id boolean primary key default true check (id),
  activos boolean not null default false,
  dias_antes integer[] not null default '{7,3,1}',
  updated_at timestamptz not null default now()
);
insert into ajustes_avisos_plazos (id) values (true) on conflict (id) do nothing;
alter table ajustes_avisos_plazos enable row level security;
drop policy if exists ajustes_avisos_plazos_admin on ajustes_avisos_plazos;
create policy ajustes_avisos_plazos_admin on ajustes_avisos_plazos
  for select using (coalesce(auth_role()::text, '') in ('admin', 'superadmin'));

create table if not exists avisos_plazos_enviados (
  obra_id uuid not null references obras (id) on delete cascade,
  destino text not null,           -- 'empresa:<uuid>' | 'usuario:<uuid>' | 'admin'
  tipo text not null,
  clave text not null,
  enviado_at timestamptz not null default now(),
  primary key (obra_id, destino, tipo, clave)
);
alter table avisos_plazos_enviados enable row level security;  -- sin políticas: solo las funciones internas

-- Avisos que tocan HOY y todavía no se han mandado (lo usan avisar_plazos y la vista previa del panel)
create or replace function plazos_avisos_pendientes()
returns table (
  obra_id uuid, obra text, destino text, destino_nombre text,
  tipo text, clave text, titulo text, cuerpo text, datos jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with aj as (select dias_antes from ajustes_avisos_plazos where id),
  obras_c as (
    select o.id, o.titulo::text as titulo, o.fecha_fin, o.penalizacion_diaria_pct as pct,
           (o.fecha_fin - current_date) as faltan,
           coalesce((select p.oferta_economica from postulaciones p
                      where p.obra_id = o.id and p.estado::text = 'aceptada'
                      order by p.created_at desc limit 1), o.presupuesto) as valor,
           (select p.empresa_id from postulaciones p
             where p.obra_id = o.id and p.estado::text = 'aceptada'
             order by p.created_at desc limit 1) as empresa_id,
           o.creado_por
      from obras o
     where o.fecha_fin is not null
       and o.fecha_fin_real is null
       and o.estado::text in ('adjudicada', 'en_curso')
  ),
  -- Aviso base (texto) según los días que faltan
  base as (
    select c.*,
           case
             when c.faltan > 0 and c.faltan = any (aj.dias_antes) then 'plazo_proximo'
             when c.faltan = 0 then 'plazo_hoy'
             when c.faltan < 0 then 'plazo_retraso'
           end as tipo,
           case when c.faltan > 0 then 'd' || c.faltan::text
                when c.faltan = 0 then 'hoy'
                else current_date::text end as clave
      from obras_c c cross join aj
  ),
  textos as (
    select b.*,
      case b.tipo
        when 'plazo_proximo' then 'Se acerca la fecha de fin de la obra'
        when 'plazo_hoy' then 'Hoy vence el plazo de la obra'
        else 'La obra lleva ' || (-b.faltan)::text || case when -b.faltan = 1 then ' día' else ' días' end || ' de retraso'
      end as t_titulo,
      case b.tipo
        when 'plazo_proximo' then 'Quedan ' || b.faltan::text || case when b.faltan = 1 then ' día' else ' días' end
             || ' para la fecha de fin pactada de «' || b.titulo || '» (' || to_char(b.fecha_fin, 'DD/MM/YYYY') || ').'
        when 'plazo_hoy' then 'Hoy es la fecha de fin pactada de «' || b.titulo || '». Si hay algún problema, avísalo cuanto antes.'
        else 'Han pasado ' || (-b.faltan)::text || case when -b.faltan = 1 then ' día' else ' días' end
             || ' de la fecha de fin pactada de «' || b.titulo || '».'
             || case when b.pct > 0 then ' Según lo pactado, el retraso conlleva una penalización del '
                  || replace(trim(trailing '.' from trim(trailing '0' from b.pct::text)), '.', ',') || ' % diario sobre el valor del contrato.' else '' end
      end as t_cuerpo
    from base b where b.tipo is not null
  )
  -- Empresa adjudicada
  select t.id, t.titulo, 'empresa:' || t.empresa_id::text, e.nombre::text,
         t.tipo, t.clave, t.t_titulo, t.t_cuerpo, jsonb_build_object('obra_id', t.id)
    from textos t join empresas_subcontratistas e on e.id = t.empresa_id
   where t.empresa_id is not null
     and not exists (select 1 from avisos_plazos_enviados a
                      where a.obra_id = t.id and a.destino = 'empresa:' || t.empresa_id::text and a.tipo = t.tipo and a.clave = t.clave)
  union all
  -- Quien publicó la licitación (si no es administración)
  select t.id, t.titulo, 'usuario:' || t.creado_por::text, coalesce(p.nombre_completo::text, 'Publicador'),
         t.tipo, t.clave, t.t_titulo, t.t_cuerpo, jsonb_build_object('obra_id', t.id)
    from textos t join profiles p on p.id = t.creado_por
   where t.creado_por is not null
     and p.role::text not in ('admin', 'superadmin')
     and not exists (select 1 from avisos_plazos_enviados a
                      where a.obra_id = t.id and a.destino = 'usuario:' || t.creado_por::text and a.tipo = t.tipo and a.clave = t.clave)
  union all
  -- Administración (campana del panel): 3 días antes, el día de fin y hitos de retraso
  select t.id, t.titulo, 'admin', 'Administración',
         case when t.tipo = 'plazo_retraso' then 'plazo_retraso_admin' else t.tipo || '_admin' end,
         case when t.tipo = 'plazo_retraso' then 'r' || (-t.faltan)::text else t.clave end,
         case when t.tipo = 'plazo_retraso' then 'Obra con ' || (-t.faltan)::text || case when -t.faltan = 1 then ' día' else ' días' end || ' de retraso: ' || t.titulo
              when t.tipo = 'plazo_hoy' then 'Hoy vence el plazo de «' || t.titulo || '»'
              else 'Se acerca el fin de «' || t.titulo || '»' end,
         case when t.tipo = 'plazo_retraso'
              then 'Fin pactado: ' || to_char(t.fecha_fin, 'DD/MM/YYYY') || '. Penalización estimada hasta hoy: '
                   || to_char(round(t.valor * t.pct / 100.0 * (-t.faltan), 2), 'FM999G999G990D00') || ' € (' || (t.pct * (-t.faltan))::text || ' % del contrato).'
              else t.t_cuerpo end,
         jsonb_build_object('obra_id', t.id)
    from textos t
   where (t.tipo = 'plazo_hoy'
          or (t.tipo = 'plazo_proximo' and t.faltan = 3)
          or (t.tipo = 'plazo_retraso' and (-t.faltan) in (1, 3, 7, 14, 21, 30, 45, 60)))
     and not exists (select 1 from avisos_plazos_enviados a
                      where a.obra_id = t.id and a.destino = 'admin'
                        and a.tipo = case when t.tipo = 'plazo_retraso' then 'plazo_retraso_admin' else t.tipo || '_admin' end
                        and a.clave = case when t.tipo = 'plazo_retraso' then 'r' || (-t.faltan)::text else t.clave end);
$$;

-- El trabajo diario. Devuelve cuántos avisos ha mandado. Apagado = no hace nada.
create or replace function avisar_plazos()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_n integer := 0;
  v_nuevo integer;
begin
  if not coalesce((select activos from ajustes_avisos_plazos where id), false) then
    return 0;
  end if;

  for r in select * from plazos_avisos_pendientes() loop
    insert into avisos_plazos_enviados (obra_id, destino, tipo, clave)
    values (r.obra_id, r.destino, r.tipo, r.clave)
    on conflict do nothing;
    get diagnostics v_nuevo = row_count;
    if v_nuevo = 0 then continue; end if;

    if r.destino like 'empresa:%' then
      perform crear_notificacion(substr(r.destino, 9)::uuid, r.tipo, r.titulo, r.cuerpo, r.datos);
    elsif r.destino like 'usuario:%' then
      insert into notificaciones (user_id, tipo, titulo, cuerpo, datos)
      values (substr(r.destino, 9)::uuid, r.tipo, r.titulo, r.cuerpo, r.datos);
      perform enviar_push(substr(r.destino, 9)::uuid, r.titulo, r.cuerpo, r.datos);
    else
      -- administración: solo campana del panel, sin push
      insert into notificaciones (user_id, tipo, titulo, cuerpo, datos)
      select p.id, r.tipo, r.titulo, r.cuerpo, r.datos
        from profiles p where p.role::text in ('admin', 'superadmin');
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

-- Panel: estado del interruptor y vista previa de lo que saldría hoy
create or replace function panel_avisos_plazos_estado()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v jsonb;
begin
  perform panel_exigir_admin();
  select jsonb_build_object(
           'activos', a.activos,
           'dias_antes', to_jsonb(a.dias_antes),
           'pendientes', coalesce((select jsonb_agg(to_jsonb(p) - 'datos' order by p.obra, p.destino) from plazos_avisos_pendientes() p), '[]'::jsonb),
           'enviados_total', (select count(*) from avisos_plazos_enviados)
         ) into v
    from ajustes_avisos_plazos a where a.id;
  return v;
end;
$$;

create or replace function panel_avisos_plazos_ajustar(p_activos boolean, p_dias integer[] default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform panel_exigir_admin();
  if p_dias is not null then
    if array_length(p_dias, 1) is null or array_length(p_dias, 1) > 6 or exists (select 1 from unnest(p_dias) d where d < 1 or d > 60) then
      raise exception 'Indica de 1 a 6 días de antelación, cada uno entre 1 y 60.';
    end if;
  end if;
  update ajustes_avisos_plazos
     set activos = coalesce(p_activos, activos),
         dias_antes = coalesce(p_dias, dias_antes),
         updated_at = now()
   where id;
end;
$$;

revoke all on function plazos_avisos_pendientes() from public, anon, authenticated;
revoke all on function avisar_plazos() from public, anon, authenticated;
revoke all on function panel_avisos_plazos_estado() from public, anon;
revoke all on function panel_avisos_plazos_ajustar(boolean, integer[]) from public, anon;
grant execute on function panel_avisos_plazos_estado() to authenticated;
grant execute on function panel_avisos_plazos_ajustar(boolean, integer[]) to authenticated;

-- ---------------------------------------------------------------------------
-- PROGRAMAR EL AVISO DIARIO (una sola vez, a mano, SOLO cuando hayas revisado la vista previa y encendido el interruptor)
-- ---------------------------------------------------------------------------
-- En Supabase: Database -> Extensions -> activar "pg_cron". Luego (cada día a las 7:00 UTC = 8:00 o 9:00 en España):
--
--   select cron.schedule('avisar-plazos', '0 7 * * *', $cron$ select public.avisar_plazos(); $cron$);
--
-- Para quitarlo:  select cron.unschedule('avisar-plazos');