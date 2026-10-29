-- ============================================================================
-- Interruptor de pagos controlado desde el panel + métricas de pagos
-- ============================================================================
-- REQUISITO: haber ejecutado antes 0056 y 0060.
--
-- 1) ajustes_pagos.pagos_activos: activa o desactiva los pagos en la app desde el panel
--    (Pagos > Pagos en la app). Sin tocar el código ni compilar otra versión.
--    Mientras esté desactivado, los clientes y oficios no ven nada de pagos.
--    Los administradores sí los ven siempre, para poder probarlos.
-- 2) panel_metricas_pagos(): cifras para el panel (cobrado, retenido, entregado, comisiones…).
--
-- Se puede ejecutar más de una vez sin problema.

alter table ajustes_pagos add column if not exists pagos_activos boolean not null default false;

-- ¿Se muestran los pagos a quien pregunta? (lo usa la app y la función de cobro)
create or replace function pagos_activos()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select pagos_activos from ajustes_pagos where id), false)
      or coalesce(auth_role()::text, '') in ('admin', 'superadmin');
$$;
revoke all on function pagos_activos() from public, anon;
grant execute on function pagos_activos() to authenticated;

create or replace function panel_activar_pagos(p_activos boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform panel_exigir_admin();
  update ajustes_pagos set pagos_activos = coalesce(p_activos, false), updated_at = now() where id;
end;
$$;
revoke all on function panel_activar_pagos(boolean) from public, anon;
grant execute on function panel_activar_pagos(boolean) to authenticated;

-- Ajustes del panel: se añade el interruptor
create or replace function panel_ajustes_pagos()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_a ajustes_pagos%rowtype;
begin
  perform panel_exigir_admin();
  select * into v_a from ajustes_pagos where id;
  return jsonb_build_object(
    'comision_general_pct', v_a.comision_general_pct,
    'dias_confirmacion', v_a.dias_confirmacion,
    'pagos_activos', v_a.pagos_activos
  );
end;
$$;

-- Métricas de pagos
create or replace function panel_metricas_pagos()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v jsonb;
  v_meses jsonb;
  v_prevista bigint;
  v_general numeric;
  v_en_tramos bigint;
begin
  perform panel_exigir_admin();
  select comision_general_pct into v_general from ajustes_pagos where id;

  select coalesce(sum(calcular_comision_cents(importe_cents - liberado_cents, coalesce(comision_pct, v_general))), 0)
    into v_prevista
    from pagos
   where estado in ('retenido', 'terminada_oficio', 'confirmada_cliente', 'aprobado_3b', 'en_disputa');

  select coalesce(sum(t.comision_cents), 0) into v_en_tramos
    from pago_tramos t join pagos p on p.id = t.pago_id
   where t.estado = 'liberado' and p.estado in ('retenido', 'en_disputa');

  select jsonb_build_object(
    'n_pagos', count(*) filter (where estado not in ('pendiente', 'fallido', 'cancelado')),
    'n_obras_pagadas', count(distinct obra_id) filter (where estado not in ('pendiente', 'fallido', 'cancelado')),
    'cobrado_cents', coalesce(sum(importe_cents) filter (where estado not in ('pendiente', 'fallido', 'cancelado')), 0),
    'retenido_cents', coalesce(sum(importe_cents - liberado_cents) filter (
        where estado in ('retenido', 'terminada_oficio', 'confirmada_cliente', 'aprobado_3b', 'en_disputa', 'liberando', 'reembolsando')), 0),
    'entregado_oficio_cents', coalesce(sum(case
        when estado in ('liberado', 'reembolsado') then coalesce(importe_oficio_cents, 0)
        when estado in ('retenido', 'en_disputa') then liberado_cents
        else 0 end), 0),
    'reembolsado_cents', coalesce(sum(importe_reembolso_cents) filter (where estado in ('liberado', 'reembolsado')), 0),
    'comision_cobrada_cents', coalesce(sum(comision_cents) filter (where estado in ('liberado', 'reembolsado')), 0) + v_en_tramos,
    'comision_prevista_cents', v_prevista,
    'en_disputa_n', count(*) filter (where estado = 'en_disputa'),
    'por_aprobar_n', count(*) filter (where estado = 'confirmada_cliente')
                     + (select count(*) from pago_tramos t join pagos p2 on p2.id = t.pago_id
                         where t.estado = 'confirmado_cliente' and p2.estado = 'retenido'),
    'ticket_medio_cents', coalesce(round(avg(importe_cents) filter (where estado not in ('pendiente', 'fallido', 'cancelado'))), 0),
    'dias_medio_liberacion', round((avg(extract(epoch from (liberado_at - pagado_at)) / 86400.0)
                                    filter (where estado = 'liberado' and liberado_at is not null and pagado_at is not null))::numeric, 1)
  ) into v from pagos;

  select coalesce(jsonb_agg(jsonb_build_object(
      'mes', to_char(m, 'YYYY-MM'),
      'cobrado_cents', coalesce((select sum(importe_cents) from pagos
                                  where pagado_at >= m and pagado_at < m + interval '1 month'
                                    and estado not in ('pendiente', 'fallido', 'cancelado')), 0),
      'comision_cents', coalesce((select sum(comision_cents) from pagos
                                   where liberado_at >= m and liberado_at < m + interval '1 month'
                                     and estado = 'liberado'), 0)
    ) order by m), '[]'::jsonb)
    into v_meses
    from generate_series(date_trunc('month', now()) - interval '5 months', date_trunc('month', now()), interval '1 month') m;

  return v || jsonb_build_object('por_mes', v_meses);
end;
$$;
revoke all on function panel_metricas_pagos() from public, anon;
grant execute on function panel_metricas_pagos() to authenticated;