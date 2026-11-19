-- ============================================================================
-- 0091 · Comisión también al contratante (a quien paga la obra), además de la de la subcontrata
-- ============================================================================
-- REQUISITO: 0056/0060 (pagos), 0062 (ajustes_pagos), 0070, 0082 y 0083 (paquetes y resumen de cobro).
--
-- Qué hace
--   Hoy el pago funciona así: quien contrata paga el precio de la oferta y la subcontrata cobra ese precio MENOS su comisión.
--   Con esto se añade, de forma opcional, una segunda comisión a quien contrata (OH Casas o la empresa que sea):
--       Contratante paga  =  precio de la oferta  +  su comisión
--       Subcontrata cobra =  precio de la oferta  -  su comisión          (igual que ahora)
--       Plataforma ingresa = comisión de la subcontrata + comisión del contratante
--   Ejemplo con 10.000 EUR y 15 % a cada lado: el contratante paga 11.500, la subcontrata cobra 8.500, la plataforma ingresa 3.000.
--
-- Cómo está pensado (para que no cambie nada hasta que tú lo decidas)
--   · Nace APAGADO (comision_contratante_activa = false) y con 0 %: mientras tanto el cobro es exactamente el de hoy.
--   · Solo se aplica a obras de empresas. Las obras de particulares siguen con su paquete (0082).
--   · Tiene el mismo orden de prioridad que la comisión de la subcontrata: porcentaje de la obra > porcentaje general.
--     Para una obra de OH Casas sin comisión al contratante, se pone 0 % en esa obra.
--   · Se cobra como un recargo encima de la oferta, con el mismo mecanismo que el extra de los paquetes: si hay
--     reembolso al contratante, se le devuelve también esta comisión entera. Si se rechaza o cancela, no se cobra.
--   · El pago de la subcontrata no cambia.
--   · Los pagos (pagos_activos) siguen apagados: esto no cobra nada por sí solo.
-- Se puede ejecutar más de una vez sin problema.

alter table ajustes_pagos add column if not exists comision_contratante_activa boolean not null default false;
alter table ajustes_pagos add column if not exists comision_contratante_pct numeric(5,2) not null default 0
  check (comision_contratante_pct >= 0 and comision_contratante_pct <= 30);
alter table obras add column if not exists comision_contratante_pct numeric(5,2)
  check (comision_contratante_pct is null or (comision_contratante_pct >= 0 and comision_contratante_pct <= 30));
alter table pagos add column if not exists comision_contratante_cents bigint not null default 0
  check (comision_contratante_cents >= 0);

-- Comisión al contratante en céntimos (0 si está apagado, si la obra es de un particular o si no hay porcentaje)
create or replace function comision_contratante_cents(p_obra_id uuid, p_importe_cents bigint)
returns bigint
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_a ajustes_pagos%rowtype;
  v_o obras%rowtype;
  v_pct numeric;
begin
  select * into v_a from ajustes_pagos where id;
  if not coalesce(v_a.comision_contratante_activa, false) then return 0; end if;
  select * into v_o from obras where id = p_obra_id;
  if not found or v_o.origen = 'particular' then return 0; end if;
  v_pct := coalesce(v_o.comision_contratante_pct, v_a.comision_contratante_pct, 0);
  return calcular_comision_cents(p_importe_cents, v_pct);
end;
$$;
revoke all on function comision_contratante_cents(uuid, bigint) from public, anon, authenticated;

-- El cobro: pago_iniciar igual que en la 0082, con la comisión del contratante sumada al recargo
create or replace function pago_iniciar(p_obra_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_obra obras%rowtype;
  v_post postulaciones%rowtype;
  v_cuenta stripe_cuentas%rowtype;
  v_cents bigint;
  v_pct numeric;
  v_pago pagos%rowtype;
  e jsonb;
  v_i integer;
  v_n integer;
  v_resto bigint;
  v_tramo bigint;
  v_recargo bigint := 0;
  v_paq bigint := 0;
  v_con bigint := 0;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;
  perform exigir_cuenta_activa();

  select * into v_obra from obras where id = p_obra_id;
  if not found then
    raise exception 'La obra no existe.';
  end if;
  if v_obra.creado_por is distinct from v_uid then
    raise exception 'Solo quien publicó la obra puede pagarla.';
  end if;
  if v_obra.estado not in ('adjudicada', 'en_curso') then
    raise exception 'La obra todavía no tiene una oferta aceptada.';
  end if;

  select * into v_post from postulaciones
    where obra_id = p_obra_id and estado = 'aceptada'
    order by updated_at desc limit 1;
  if not found then
    raise exception 'No hay una oferta aceptada para esta obra.';
  end if;

  select * into v_cuenta from stripe_cuentas where empresa_id = v_post.empresa_id;
  if not found or not v_cuenta.transferencias_activas then
    raise exception 'El oficio todavía no ha configurado su cuenta de cobro. Avisaremos cuando pueda recibir el pago.';
  end if;

  v_cents := round(v_post.oferta_economica * 100)::bigint;
  if v_cents <= 0 then
    raise exception 'El importe de la oferta no es válido.';
  end if;
  v_pct := comision_aplicable(p_obra_id, v_post.empresa_id);
  v_paq := paquete_recargo_cents(v_cents, v_obra.paquete_codigo);
  v_con := comision_contratante_cents(p_obra_id, v_cents);   -- 0 mientras el interruptor esté apagado
  v_recargo := v_paq + v_con;

  select * into v_pago from pagos
    where obra_id = p_obra_id and estado not in ('fallido', 'cancelado', 'reembolsado');
  if found then
    if v_pago.estado <> 'pendiente' then
      raise exception 'Esta obra ya está pagada.';
    end if;
    update pagos
       set importe_cents = v_cents,
           empresa_id = v_post.empresa_id,
           postulacion_id = v_post.id,
           comision_pct = v_pct,
           comision_cents = calcular_comision_cents(v_cents, v_pct),
           recargo_cents = v_recargo,
           comision_contratante_cents = v_con,
           paquete_codigo = case when v_paq > 0 then v_obra.paquete_codigo else null end,
           updated_at = now()
     where id = v_pago.id
     returning * into v_pago;
  else
    insert into pagos (obra_id, postulacion_id, empresa_id, cliente_id, importe_cents,
                       comision_pct, comision_cents, transfer_group, recargo_cents, comision_contratante_cents, paquete_codigo)
    values (p_obra_id, v_post.id, v_post.empresa_id, v_uid, v_cents,
            v_pct, calcular_comision_cents(v_cents, v_pct), 'obra_' || p_obra_id::text,
            v_recargo, v_con, case when v_paq > 0 then v_obra.paquete_codigo else null end)
    returning * into v_pago;
  end if;

  -- Tramos: se rehacen mientras el pago esté pendiente (el importe o el plan pueden haber cambiado)
  delete from pago_tramos where pago_id = v_pago.id;
  if v_post.plan_pagos is not null then
    v_n := jsonb_array_length(v_post.plan_pagos);
    v_resto := v_cents;
    v_i := 0;
    for e in select * from jsonb_array_elements(v_post.plan_pagos) loop
      v_i := v_i + 1;
      if v_i < v_n then
        v_tramo := round(v_cents * (e ->> 'pct')::numeric / 100.0)::bigint;
        v_resto := v_resto - v_tramo;
      else
        v_tramo := v_resto;                        -- el último absorbe el redondeo
      end if;
      insert into pago_tramos (pago_id, orden, titulo, pct, importe_cents)
      values (v_pago.id, v_i, trim(e ->> 'titulo'), (e ->> 'pct')::numeric, v_tramo);
    end loop;
    update pagos set con_tramos = true where id = v_pago.id;
  else
    update pagos set con_tramos = false where id = v_pago.id;
  end if;

  return jsonb_build_object(
    'pago_id', v_pago.id,
    'importe_cents', v_pago.importe_cents,
    'recargo_cents', v_pago.recargo_cents,
    'comision_contratante_cents', v_pago.comision_contratante_cents,
    'cobrar_cents', v_pago.importe_cents + v_pago.recargo_cents,
    'moneda', v_pago.moneda,
    'transfer_group', v_pago.transfer_group,
    'cuenta_oficio', v_cuenta.stripe_account_id
  );
end;
$$;

-- El resumen que ve quien paga (0083), con la comisión de servicio visible y aparte
create or replace function app_resumen_cobro(p_obra_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_obra obras%rowtype;
  v_post postulaciones%rowtype;
  v_oferta bigint;
  v_extra bigint;
  v_con bigint;
  v_p paquetes_particular%rowtype;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  select * into v_obra from obras where id = p_obra_id;
  if not found or v_obra.creado_por is distinct from v_uid then
    raise exception 'Solo quien publicó la obra puede ver este resumen.';
  end if;
  select * into v_post from postulaciones
    where obra_id = p_obra_id and estado = 'aceptada'
    order by updated_at desc limit 1;
  if not found then return null; end if;

  v_oferta := round(v_post.oferta_economica * 100)::bigint;
  v_extra := paquete_recargo_cents(v_oferta, v_obra.paquete_codigo);
  v_con := comision_contratante_cents(p_obra_id, v_oferta);
  select * into v_p from paquetes_particular where codigo = v_obra.paquete_codigo;

  return jsonb_build_object(
    'oferta_cents', v_oferta,
    'recargo_cents', v_extra + v_con,
    'comision_servicio_cents', v_con,
    'total_cents', v_oferta + v_extra + v_con,
    'paquete_codigo', case when v_extra > 0 then v_obra.paquete_codigo else null end,
    'paquete_nombre', case when v_extra > 0 then v_p.nombre else null end
  );
end;
$$;

revoke all on function pago_iniciar(uuid) from public, anon;
grant execute on function pago_iniciar(uuid) to authenticated;
revoke all on function app_resumen_cobro(uuid) from public, anon;
grant execute on function app_resumen_cobro(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Panel (solo administración)
-- ---------------------------------------------------------------------------
create or replace function panel_comision_contratante_estado()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  perform panel_exigir_admin();
  select jsonb_build_object('activa', a.comision_contratante_activa, 'pct_general', a.comision_contratante_pct,
                            'comision_subcontrata_general', a.comision_general_pct,
                            'obras_con_pct_propio', (select count(*) from obras where comision_contratante_pct is not null))
    into v from ajustes_pagos a where a.id;
  return v;
end;
$$;

-- Enciende o apaga y fija el porcentaje general (0 a 30)
create or replace function panel_comision_contratante_ajustar(p_activa boolean, p_pct numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform panel_exigir_admin();
  if p_pct is not null and (p_pct < 0 or p_pct > 30) then
    raise exception 'La comisión al contratante tiene que estar entre 0 y 30.';
  end if;
  update ajustes_pagos set
    comision_contratante_activa = coalesce(p_activa, comision_contratante_activa),
    comision_contratante_pct = coalesce(p_pct, comision_contratante_pct),
    updated_at = now()
  where id;
end;
$$;

-- Porcentaje propio de una obra (null = usa el general; 0 = sin comisión al contratante, p. ej. obras de OH Casas)
create or replace function panel_comision_contratante_obra(p_obra_id uuid, p_pct numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform panel_exigir_admin();
  if p_pct is not null and (p_pct < 0 or p_pct > 30) then
    raise exception 'La comisión al contratante tiene que estar entre 0 y 30.';
  end if;
  if exists (select 1 from pagos where obra_id = p_obra_id and estado not in ('pendiente', 'fallido', 'cancelado')) then
    raise exception 'Esta obra ya tiene un pago cobrado: no se puede cambiar su comisión.';
  end if;
  update obras set comision_contratante_pct = p_pct, updated_at = now() where id = p_obra_id;
end;
$$;

-- Simulador: solo calcula, no guarda ni cobra nada. Importes en euros.
create or replace function panel_simular_comision_doble(p_importe numeric, p_pct_subcontrata numeric, p_pct_contratante numeric)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  c bigint := round(p_importe * 100)::bigint;
  s bigint; k bigint;
begin
  perform panel_exigir_admin();
  if p_importe is null or p_importe <= 0 then raise exception 'Escribe un importe mayor que 0.'; end if;
  s := calcular_comision_cents(c, p_pct_subcontrata);
  k := calcular_comision_cents(c, p_pct_contratante);
  return jsonb_build_object(
    'oferta', c / 100.0,
    'comision_subcontrata', s / 100.0,
    'comision_contratante', k / 100.0,
    'paga_el_contratante', (c + k) / 100.0,
    'cobra_la_subcontrata', (c - s) / 100.0,
    'ingresa_la_plataforma', (s + k) / 100.0,
    'porcentaje_sobre_oferta', case when c > 0 then round((s + k) * 100.0 / c, 2) else 0 end,
    'aviso', 'Antes de las tarifas de Stripe y de impuestos (IVA). Es solo una simulación.');
end;
$$;

revoke all on function panel_comision_contratante_estado() from public, anon;
revoke all on function panel_comision_contratante_ajustar(boolean, numeric) from public, anon;
revoke all on function panel_comision_contratante_obra(uuid, numeric) from public, anon;
revoke all on function panel_simular_comision_doble(numeric, numeric, numeric) from public, anon;
grant execute on function panel_comision_contratante_estado() to authenticated;
grant execute on function panel_comision_contratante_ajustar(boolean, numeric) to authenticated;
grant execute on function panel_comision_contratante_obra(uuid, numeric) to authenticated;
grant execute on function panel_simular_comision_doble(numeric, numeric, numeric) to authenticated;

-- Listado para el panel: porcentaje propio de cada obra (solo lectura)
create or replace function panel_obras_comision_contratante()
returns table (id uuid, comision_propia numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  perform panel_exigir_admin();
  return query select o.id, o.comision_contratante_pct from obras o order by o.created_at desc limit 500;
end;
$$;
revoke all on function panel_obras_comision_contratante() from public, anon;
grant execute on function panel_obras_comision_contratante() to authenticated;

-- ---------------------------------------------------------------------------
-- COMANDOS (a mano, en el SQL Editor)
-- ---------------------------------------------------------------------------
-- Ver cuánto saldría con 10.000 EUR, 15 % a la subcontrata y 15 % al contratante (no cambia nada):
--   select panel_simular_comision_doble(10000, 15, 15);
-- Encender con 15 % general (solo afecta a pagos NUEVOS de obras de empresas y solo cuando los pagos estén activos):
--   update ajustes_pagos set comision_contratante_activa = true, comision_contratante_pct = 15, updated_at = now() where id;
-- Obra de OH Casas sin comision al contratante:
--   update obras set comision_contratante_pct = 0 where id = 'ID-DE-LA-OBRA';
-- Apagar de nuevo:
--   update ajustes_pagos set comision_contratante_activa = false, updated_at = now() where id;