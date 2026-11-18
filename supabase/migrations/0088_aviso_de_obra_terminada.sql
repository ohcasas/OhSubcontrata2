-- ============================================================================
-- 0088 · La empresa avisa de que ha terminado la obra
-- ============================================================================
-- REQUISITO: 0084, 0085, 0086 (y 0087 si la aplicaste).
--
-- Qué hace
--   · La empresa adjudicada puede pulsar "Avisar de que he terminado" en la app (necesita la versión nueva de la app).
--   · Eso NO cierra la obra ni fija la fecha real de fin: solo deja constancia de que la empresa avisó y cuándo.
--     La fecha real de fin y el cierre los confirma una persona de administración en el panel (Plazos de obra -> Fechas).
--     Así nada se decide solo, y una empresa no puede evitar una penalización declarándose terminada.
--   · Al avisar: llega un aviso a administración (campana, móvil y Telegram si lo tienes) y a quien publicó la obra.
--   · Mientras haya un aviso de fin pendiente de confirmar, se detienen los avisos de plazo (0085) de esa obra.
--   · El panel muestra en Plazos de obra qué obras tienen aviso de fin pendiente.
-- Se puede ejecutar más de una vez sin problema.

alter table obras add column if not exists fin_declarado_en timestamptz;
alter table obras add column if not exists fin_declarado_por uuid references profiles (id) on delete set null;
comment on column obras.fin_declarado_en is 'Momento en que la empresa adjudicada avisó de que había terminado. No cierra la obra: la fecha real de fin la confirma administración.';

-- La empresa adjudicada avisa. Solo ella, solo sobre su obra, una vez.
create or replace function declarar_obra_terminada(p_obra_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_empresa uuid;
  v_obra record;
begin
  if v_uid is null then
    raise exception 'Inicia sesión para continuar.';
  end if;
  select empresa_id into v_empresa from profiles where id = v_uid;
  if v_empresa is null then
    raise exception 'Tu usuario no está vinculado a ninguna empresa.';
  end if;
  select o.id, o.titulo::text as titulo, o.estado::text as estado, o.creado_por, o.fin_declarado_en, o.fecha_fin_real
    into v_obra from obras o where o.id = p_obra_id for update;
  if not found then
    raise exception 'No se encuentra la obra.';
  end if;
  if not exists (select 1 from postulaciones p
                  where p.obra_id = p_obra_id and p.empresa_id = v_empresa and p.estado::text = 'aceptada') then
    raise exception 'Solo la empresa adjudicada puede avisar de que ha terminado.';
  end if;
  if v_obra.estado not in ('adjudicada', 'en_curso') or v_obra.fecha_fin_real is not null then
    raise exception 'Esta obra ya no está en curso.';
  end if;
  if v_obra.fin_declarado_en is not null then
    raise exception 'Ya avisaste de que esta obra está terminada. Administración la revisará.';
  end if;

  update obras set fin_declarado_en = now(), fin_declarado_por = v_uid where id = p_obra_id;

  begin
    perform avisar_admins('obra_terminada', 'Una empresa avisa de que ha terminado una obra',
      '«' || v_obra.titulo || '»: revisa y confirma la fecha real de fin.', '#/plazos');
    if v_obra.creado_por is not null
       and not exists (select 1 from profiles pr where pr.id = v_obra.creado_por and pr.role::text in ('admin', 'superadmin')) then
      insert into notificaciones (user_id, tipo, titulo, cuerpo, datos)
      values (v_obra.creado_por, 'obra_terminada', 'La empresa avisa de que ha terminado la obra',
              '«' || v_obra.titulo || '». 3B Conecta lo revisará y confirmará.', jsonb_build_object('obra_id', p_obra_id));
      perform enviar_push(v_obra.creado_por, 'La empresa avisa de que ha terminado la obra',
              '«' || v_obra.titulo || '». 3B Conecta lo revisará y confirmará.', jsonb_build_object('obra_id', p_obra_id));
    end if;
  exception when others then
    null;  -- avisar nunca debe impedir registrar el aviso
  end;
end;
$$;
revoke all on function declarar_obra_terminada(uuid) from public, anon;
grant execute on function declarar_obra_terminada(uuid) to authenticated;

-- Los avisos de plazo (0085) se detienen mientras haya un aviso de fin pendiente de confirmar
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
       and o.fin_declarado_en is null
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
revoke all on function plazos_avisos_pendientes() from public, anon, authenticated;

-- Panel: la lista de plazos incluye el aviso de fin
drop function if exists panel_plazos_obras();
create or replace function panel_plazos_obras()
returns table (
  id uuid, referencia text, titulo text, estado text, origen text,
  fecha_inicio date, fecha_fin date, fecha_inicio_real date, fecha_fin_real date,
  penalizacion_diaria_pct numeric,
  valor_contrato numeric, valor_origen text,
  dias_retraso integer, dias_retraso_inicio integer,
  penalizacion_estimada numeric, penalizacion_pct_total numeric,
  fin_declarado_en timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform panel_exigir_admin();
  return query
  with base as (
    select o.id, o.referencia::text as referencia, o.titulo::text as titulo, o.estado::text as estado, o.origen::text as origen,
           o.fecha_inicio, o.fecha_fin, o.fecha_inicio_real, o.fecha_fin_real, o.penalizacion_diaria_pct, o.fin_declarado_en,
           coalesce(
             (select p.oferta_economica from postulaciones p
               where p.obra_id = o.id and p.estado::text = 'aceptada'
               order by p.created_at desc limit 1),
             o.presupuesto) as valor,
           case when exists (select 1 from postulaciones p where p.obra_id = o.id and p.estado::text = 'aceptada')
                then 'oferta aceptada' else 'presupuesto' end as origen_valor
      from obras o
  ), calc as (
    select b.*,
           case
             when b.fecha_fin is null then null
             when b.fecha_fin_real is not null then greatest(0, b.fecha_fin_real - b.fecha_fin)
             when b.estado in ('adjudicada', 'en_curso') then greatest(0, current_date - b.fecha_fin)
             else 0
           end as retraso,
           case
             when b.fecha_inicio is null then null
             when b.fecha_inicio_real is not null then greatest(0, b.fecha_inicio_real - b.fecha_inicio)
             when b.estado = 'adjudicada' then greatest(0, current_date - b.fecha_inicio)
             else 0
           end as retraso_ini
      from base b
  )
  select c.id, c.referencia, c.titulo, c.estado, c.origen,
         c.fecha_inicio, c.fecha_fin, c.fecha_inicio_real, c.fecha_fin_real, c.penalizacion_diaria_pct,
         c.valor, c.origen_valor,
         c.retraso::integer, c.retraso_ini::integer,
         case when c.retraso is null then null
              else round(c.valor * c.penalizacion_diaria_pct / 100.0 * c.retraso, 2) end,
         case when c.retraso is null then null
              else round(c.penalizacion_diaria_pct * c.retraso, 2) end,
         c.fin_declarado_en
    from calc c
   where c.estado <> 'cancelada'
   order by (c.fecha_fin is null), c.retraso desc nulls last, c.fecha_fin
   limit 500;
end;
$$;
revoke all on function panel_plazos_obras() from public, anon;
grant execute on function panel_plazos_obras() to authenticated;
