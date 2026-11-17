-- ============================================================================
-- 0084 · Fechas de inicio y fin de obra + penalización por retraso (SOLO CÁLCULO)
-- ============================================================================
-- Qué añade (todo aditivo; no toca pagos, comisiones ni ninguna función existente):
--   1) obras.fecha_fin (fin pactado), fecha_inicio_real, fecha_fin_real y penalizacion_diaria_pct (por defecto 2).
--      obras.fecha_inicio ya existía y pasa a ser el inicio pactado.
--   2) panel_plazos_obras(): lista las obras con retraso en días y la penalización ESTIMADA.
--   3) panel_guardar_plazos(): guarda las fechas y el % diario (solo administración).
-- Cláusula: «El retraso sobre las fechas de inicio y fin pactadas conlleva una penalización del 2 % diario
-- sobre el valor total del contrato.»
-- IMPORTANTE: esto solo CALCULA y MUESTRA. No cobra, no descuenta y no retiene nada automáticamente.
-- Pendiente de validación legal antes de aplicarla en un pago (a los 50 días de retraso llega al 100 %).
-- Se puede ejecutar más de una vez sin problema.

alter table obras add column if not exists fecha_fin date;
alter table obras add column if not exists fecha_inicio_real date;
alter table obras add column if not exists fecha_fin_real date;
alter table obras add column if not exists penalizacion_diaria_pct numeric(5,2) not null default 2;

alter table obras drop constraint if exists obras_penalizacion_pct_rango;
alter table obras add constraint obras_penalizacion_pct_rango
  check (penalizacion_diaria_pct >= 0 and penalizacion_diaria_pct <= 100);
alter table obras drop constraint if exists obras_fechas_orden;
alter table obras add constraint obras_fechas_orden
  check (fecha_inicio is null or fecha_fin is null or fecha_fin >= fecha_inicio) not valid;

comment on column obras.fecha_inicio is 'Fecha de inicio pactada.';
comment on column obras.fecha_fin is 'Fecha de fin pactada.';
comment on column obras.penalizacion_diaria_pct is 'Penalización por cada día de retraso, en % del valor total del contrato. Solo se calcula y se muestra; no se cobra sola.';

create or replace function panel_plazos_obras()
returns table (
  id uuid, referencia text, titulo text, estado text, origen text,
  fecha_inicio date, fecha_fin date, fecha_inicio_real date, fecha_fin_real date,
  penalizacion_diaria_pct numeric,
  valor_contrato numeric, valor_origen text,
  dias_retraso integer, dias_retraso_inicio integer,
  penalizacion_estimada numeric, penalizacion_pct_total numeric
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
           o.fecha_inicio, o.fecha_fin, o.fecha_inicio_real, o.fecha_fin_real, o.penalizacion_diaria_pct,
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
              else round(c.penalizacion_diaria_pct * c.retraso, 2) end
    from calc c
   where c.estado <> 'cancelada'
   order by (c.fecha_fin is null), c.retraso desc nulls last, c.fecha_fin
   limit 500;
end;
$$;

create or replace function panel_guardar_plazos(
  p_obra_id uuid,
  p_inicio date,
  p_fin date,
  p_inicio_real date default null,
  p_fin_real date default null,
  p_pct numeric default 2
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform panel_exigir_admin();
  if p_pct is null or p_pct < 0 or p_pct > 100 then
    raise exception 'La penalización diaria debe estar entre 0 y 100 %%.';
  end if;
  if p_inicio is not null and p_fin is not null and p_fin < p_inicio then
    raise exception 'La fecha de fin no puede ser anterior a la de inicio.';
  end if;
  if p_inicio_real is not null and p_fin_real is not null and p_fin_real < p_inicio_real then
    raise exception 'El fin real no puede ser anterior al inicio real.';
  end if;
  update obras
     set fecha_inicio = p_inicio,
         fecha_fin = p_fin,
         fecha_inicio_real = p_inicio_real,
         fecha_fin_real = p_fin_real,
         penalizacion_diaria_pct = p_pct,
         updated_at = now()
   where id = p_obra_id;
  if not found then
    raise exception 'La obra no existe.';
  end if;
end;
$$;

revoke all on function panel_plazos_obras() from public, anon;
revoke all on function panel_guardar_plazos(uuid, date, date, date, date, numeric) from public, anon;
grant execute on function panel_plazos_obras() to authenticated;
grant execute on function panel_guardar_plazos(uuid, date, date, date, date, numeric) to authenticated;