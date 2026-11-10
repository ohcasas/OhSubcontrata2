-- ============================================================================
-- 0076 · Historial de pagos, contratos visibles, cancelar y pedir reembolso desde la app
-- ============================================================================
-- REQUISITOS: haber ejecutado antes 0056, 0057, 0058, 0060 y 0074 (y 0075 si ya la tienes).
-- Se puede ejecutar más de una vez sin problema. No toca dinero ni envía correos.
--
-- Qué añade
--   1) oficio_historial_pagos()      Lo que ha cobrado, lo retenido y la comisión, con fechas (solo el oficio dueño).
--   2) cliente_historial_pagos()     Los pagos del cliente (sin comisiones).
--   3) contratos_de_pago(pago)       Contratos firmados de un pago, para el cliente y el oficio (sin IP ni dispositivo).
--   4) pago_cancelar_preparar/_confirmar   El cliente cancela un pago que aún no ha pagado (la Edge Function
--                                          stripe-cancelar-pago anula el cobro en Stripe).
--   5) pago_solicitar_reembolso()    Cliente u oficio piden devolver el pago: se congela y avisa a 3B. NO mueve dinero:
--                                    el reembolso lo ejecuta 3B desde el panel (Pagos → «Devolver todo al cliente»).
--   6) Aviso al oficio cuando se reembolsa un pago (también si se hizo desde el panel de Stripe).
--   7) panel_contrato_detalle()      Texto completo y datos de firma, para la pestaña Contratos del panel.
--   8) Plantillas de correo de los avisos nuevos (solo salen si el correo está activado en el panel).

-- ---------------------------------------------------------------------------
-- 0) Columnas nuevas
-- ---------------------------------------------------------------------------
alter table pagos add column if not exists reembolso_solicitado_at timestamptz;
alter table pagos add column if not exists reembolso_solicitado_por uuid references profiles (id) on delete set null;

-- ---------------------------------------------------------------------------
-- 1) Resumen de un pago (interno): importes netos, comisión y tramos
-- ---------------------------------------------------------------------------
create or replace function pago_resumen_json(p_pago_id uuid, p_con_comision boolean)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  p pagos%rowtype;
  v_titulo text;
  v_pagado boolean;
  v_bruto bigint;
  v_com bigint;
  v_neto bigint;
  v_cobrado bigint := 0;
  v_retenido bigint := 0;
  v_comision_total bigint := 0;
  v_entregado bigint := 0;
  v_com_cobrada bigint := 0;
  v_neto_total bigint := 0;
  v_tramos jsonb := '[]'::jsonb;
  t record;
  v_t_com bigint;
begin
  select * into p from pagos where id = p_pago_id;
  if not found then
    return null;
  end if;
  select titulo into v_titulo from obras where id = p.obra_id;
  v_pagado := p.estado in ('retenido', 'terminada_oficio', 'confirmada_cliente', 'aprobado_3b', 'liberando', 'en_disputa');

  if p.con_tramos then
    for t in select * from pago_tramos where pago_id = p.id order by orden loop
      v_t_com := case when t.estado = 'liberado' then t.comision_cents
                      else calcular_comision_cents(t.importe_cents, p.comision_pct) end;
      if t.estado <> 'cerrado' then
        v_neto_total := v_neto_total + (t.importe_cents - v_t_com);
        v_comision_total := v_comision_total + v_t_com;
      end if;
      if t.estado = 'liberado' then
        v_entregado := v_entregado + t.importe_cents;
        v_com_cobrada := v_com_cobrada + v_t_com;
        v_cobrado := v_cobrado + (t.importe_cents - v_t_com);
      elsif t.estado <> 'cerrado' and v_pagado then
        v_retenido := v_retenido + (t.importe_cents - v_t_com);
      end if;
      v_tramos := v_tramos || jsonb_build_array(
        jsonb_build_object(
          'id', t.id, 'orden', t.orden, 'titulo', t.titulo, 'pct', t.pct,
          'importe_cents', t.importe_cents, 'estado', t.estado, 'liberado_at', t.liberado_at
        ) || case when p_con_comision
                  then jsonb_build_object('comision_cents', v_t_com, 'neto_cents', t.importe_cents - v_t_com)
                  else '{}'::jsonb end);
    end loop;
  else
    v_bruto := case when p.estado = 'reembolsado' then 0 else coalesce(p.importe_oficio_cents, p.importe_cents) end;
    v_com := case when p.estado = 'liberado' then p.comision_cents else calcular_comision_cents(v_bruto, p.comision_pct) end;
    v_neto := v_bruto - v_com;
    v_neto_total := v_neto;
    v_comision_total := v_com;
    if p.estado = 'liberado' then
      v_entregado := v_bruto;
      v_com_cobrada := v_com;
      v_cobrado := v_neto;
    elsif v_pagado then
      v_retenido := v_neto;
    end if;
  end if;

  return jsonb_build_object(
           'pago_id', p.id, 'obra_id', p.obra_id, 'obra_titulo', v_titulo, 'estado', p.estado,
           'con_tramos', p.con_tramos, 'importe_cents', p.importe_cents,
           'creado_at', p.created_at, 'pagado_at', p.pagado_at, 'liberado_at', p.liberado_at,
           'importe_reembolso_cents', p.importe_reembolso_cents,
           'reembolso_solicitado_at', p.reembolso_solicitado_at,
           'tramos', v_tramos
         )
         || case when p_con_comision
                 then jsonb_build_object(
                        'comision_pct', p.comision_pct, 'comision_cents', v_comision_total,
                        'neto_cents', v_neto_total, 'cobrado_cents', v_cobrado, 'retenido_cents', v_retenido,
                        'comision_cobrada_cents', v_com_cobrada)
                 else jsonb_build_object('entregado_cents', v_entregado)
            end;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) Historial del oficio
-- ---------------------------------------------------------------------------
create or replace function oficio_historial_pagos()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_emp uuid := auth_empresa_id();
  v_pagos jsonb := '[]'::jsonb;
  v_item jsonb;
  r record;
  v_cobrado bigint := 0;
  v_retenido bigint := 0;
  v_comision bigint := 0;
begin
  if auth.uid() is null or v_emp is null then
    raise exception 'No autorizado';
  end if;
  for r in
    select id from pagos
     where empresa_id = v_emp and estado not in ('cancelado', 'fallido')
     order by created_at desc
     limit 200
  loop
    v_item := pago_resumen_json(r.id, true);
    v_pagos := v_pagos || jsonb_build_array(v_item);
    v_cobrado := v_cobrado + coalesce((v_item ->> 'cobrado_cents')::bigint, 0);
    v_retenido := v_retenido + coalesce((v_item ->> 'retenido_cents')::bigint, 0);
    v_comision := v_comision + coalesce((v_item ->> 'comision_cobrada_cents')::bigint, 0);
  end loop;
  return jsonb_build_object(
    'cobrado_cents', v_cobrado,
    'retenido_cents', v_retenido,
    'comision_cents', v_comision,
    'pagos', v_pagos
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 3) Historial del cliente (sin comisiones)
-- ---------------------------------------------------------------------------
create or replace function cliente_historial_pagos()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_pagos jsonb := '[]'::jsonb;
  r record;
begin
  if auth.uid() is null then
    raise exception 'No autorizado';
  end if;
  for r in
    select id from pagos
     where cliente_id = auth.uid() and estado not in ('cancelado')
     order by created_at desc
     limit 200
  loop
    v_pagos := v_pagos || jsonb_build_array(pago_resumen_json(r.id, false));
  end loop;
  return jsonb_build_object('pagos', v_pagos);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4) Contratos de un pago, para las dos partes (sin IP ni dispositivo)
-- ---------------------------------------------------------------------------
create or replace function contratos_de_pago(p_pago_id uuid)
returns table (
  id uuid, tipo text, estado text, titulo text, cuerpo text, hash text,
  firmante_nombre text, firmado_at timestamptz, tramo_titulo text, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_pago pagos%rowtype;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  select * into v_pago from pagos where pagos.id = p_pago_id;
  if not found
     or (v_pago.cliente_id is distinct from auth.uid()
         and v_pago.empresa_id is distinct from auth_empresa_id()
         and coalesce(auth_role()::text, '') not in ('admin', 'superadmin')) then
    raise exception 'No autorizado';
  end if;
  return query
    select c.id, c.tipo, c.estado, c.titulo, c.cuerpo, c.hash, c.firmante_nombre, c.firmado_at,
           t.titulo, c.created_at
      from contratos c
      left join pago_tramos t on t.id = c.tramo_id
     where c.pago_id = p_pago_id and c.estado in ('firmado', 'tacito')
     order by c.created_at;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5) Cancelar un pago que todavía no se ha pagado
-- ---------------------------------------------------------------------------
-- Paso 1 (el cliente, desde la app): comprueba que puede cancelar y devuelve el cobro de Stripe a anular.
create or replace function pago_cancelar_preparar(p_pago_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pago pagos%rowtype;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  select * into v_pago from pagos where id = p_pago_id;
  if not found or v_pago.cliente_id is distinct from auth.uid() then
    raise exception 'No autorizado';
  end if;
  if v_pago.estado <> 'pendiente' then
    raise exception 'Este pago ya no se puede cancelar desde aquí. Si ya está pagado, usa «Solicitar reembolso».';
  end if;
  return jsonb_build_object('pago_id', v_pago.id, 'payment_intent', v_pago.stripe_payment_intent_id);
end;
$$;

-- Paso 2 (solo la Edge Function, con la clave de servicio): marca el pago como cancelado.
create or replace function pago_cancelar_confirmar(p_pago_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update pagos
     set estado = 'cancelado', stripe_payment_intent_id = null, updated_at = now()
   where id = p_pago_id and estado = 'pendiente';
end;
$$;

-- ---------------------------------------------------------------------------
-- 6) Pedir un reembolso (cliente u oficio). No mueve dinero: congela el pago y avisa a 3B.
-- ---------------------------------------------------------------------------
create or replace function pago_solicitar_reembolso(p_pago_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pago pagos%rowtype;
  v_titulo text;
  v_es_cliente boolean;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  if p_motivo is null or length(trim(p_motivo)) < 10 then
    raise exception 'Cuéntanos el motivo (mínimo 10 caracteres).';
  end if;
  select * into v_pago from pagos where id = p_pago_id for update;
  if not found
     or (v_pago.cliente_id is distinct from auth.uid() and v_pago.empresa_id is distinct from auth_empresa_id()) then
    raise exception 'No autorizado';
  end if;
  if v_pago.estado not in ('retenido', 'terminada_oficio', 'confirmada_cliente', 'aprobado_3b') then
    raise exception 'No se puede pedir un reembolso en este estado del pago.';
  end if;
  v_es_cliente := v_pago.cliente_id = auth.uid();

  update pagos
     set estado_previo_disputa = estado,
         estado = 'en_disputa',
         disputa_motivo = left('Solicitud de reembolso: ' || trim(p_motivo), 2000),
         disputa_por = auth.uid(),
         disputa_at = now(),
         reembolso_solicitado_at = now(),
         reembolso_solicitado_por = auth.uid(),
         updated_at = now()
   where id = v_pago.id;

  select titulo into v_titulo from obras where id = v_pago.obra_id;
  perform avisar_equipo('pago_reembolso_solicitado',
    'Reembolso solicitado',
    case when v_es_cliente then 'El cliente' else 'El oficio' end
      || ' ha pedido devolver el pago de la obra "' || coalesce(v_titulo, '')
      || '". El pago está congelado. Decide en Pagos → En disputa.',
    jsonb_build_object('obra_id', v_pago.obra_id, 'pago_id', v_pago.id));
  if v_es_cliente then
    perform crear_notificacion(v_pago.empresa_id, 'pago_reembolso_solicitado',
      'El cliente pide un reembolso',
      'El cliente ha pedido devolver el pago de la obra "' || coalesce(v_titulo, '') || '". El pago queda congelado y 3B lo revisará.',
      jsonb_build_object('obra_id', v_pago.obra_id, 'pago_id', v_pago.id));
  else
    perform avisar_usuario(v_pago.cliente_id, 'pago_reembolso_solicitado',
      'El oficio propone devolverte el pago',
      'El oficio ha pedido devolverte el pago de la obra "' || coalesce(v_titulo, '') || '". El pago queda congelado y 3B lo revisará.',
      jsonb_build_object('obra_id', v_pago.obra_id, 'pago_id', v_pago.id));
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7) Aviso al oficio cuando se reembolsa su pago (desde la app o desde Stripe)
-- ---------------------------------------------------------------------------
create or replace function trg_pagos_aviso_reembolso_oficio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_titulo text;
begin
  select titulo into v_titulo from obras where id = new.obra_id;
  perform crear_notificacion(new.empresa_id, 'pago_reembolsado_oficio',
    'Pago devuelto al cliente',
    'El pago de la obra "' || coalesce(v_titulo, '') || '" se ha devuelto al cliente.',
    jsonb_build_object('obra_id', new.obra_id, 'pago_id', new.id));
  return new;
exception when others then
  return new;   -- un fallo de aviso nunca debe impedir el movimiento del pago
end;
$$;
drop trigger if exists trg_pagos_aviso_reembolso_oficio on pagos;
create trigger trg_pagos_aviso_reembolso_oficio
  after update of estado on pagos
  for each row
  when (new.estado = 'reembolsado' and old.estado is distinct from 'reembolsado')
  execute function trg_pagos_aviso_reembolso_oficio();

-- ---------------------------------------------------------------------------
-- 8) Panel: detalle completo de un contrato (texto, huella, datos de firma)
-- ---------------------------------------------------------------------------
create or replace function panel_contrato_detalle(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r record;
begin
  perform panel_exigir_admin();
  select c.id, c.tipo, c.estado, c.titulo, c.cuerpo, c.hash, c.plantilla_version, c.firmante_nombre,
         c.firmado_at, c.firmado_ip, c.firmado_agente, c.nota, c.created_at,
         o.titulo as obra_titulo, o.referencia as obra_referencia, t.titulo as tramo_titulo,
         pr.email as cliente_email, e.nombre as empresa_nombre, e.cif as empresa_cif
    into r
    from contratos c
    join pagos p on p.id = c.pago_id
    left join obras o on o.id = p.obra_id
    left join pago_tramos t on t.id = c.tramo_id
    left join profiles pr on pr.id = c.cliente_id
    left join empresas_subcontratistas e on e.id = c.empresa_id
   where c.id = p_id;
  if not found then
    raise exception 'El contrato no existe.';
  end if;
  return to_jsonb(r);
end;
$$;

-- ---------------------------------------------------------------------------
-- 9) Plantillas de correo de los avisos nuevos (no se envía nada mientras el correo esté desactivado)
-- ---------------------------------------------------------------------------
insert into plantillas_correo (clave, nombre, asunto, cuerpo, boton_texto) values
 ('pago_reembolso_solicitado', 'Reembolso solicitado', '{{titulo}}', E'Hola {{nombre}},\n\n{{cuerpo}}', 'Ver el detalle'),
 ('pago_reembolsado_oficio', 'Pago devuelto al cliente (aviso al oficio)', '{{titulo}}', E'Hola {{nombre}},\n\n{{cuerpo}}', 'Abrir 3B Conecta')
on conflict (clave) do nothing;

-- ---------------------------------------------------------------------------
-- 10) Permisos
-- ---------------------------------------------------------------------------
revoke all on function pago_resumen_json(uuid, boolean) from public, anon, authenticated;
revoke all on function oficio_historial_pagos() from public, anon;
revoke all on function cliente_historial_pagos() from public, anon;
revoke all on function contratos_de_pago(uuid) from public, anon;
revoke all on function pago_cancelar_preparar(uuid) from public, anon;
revoke all on function pago_cancelar_confirmar(uuid) from public, anon, authenticated;
revoke all on function pago_solicitar_reembolso(uuid, text) from public, anon;
revoke all on function trg_pagos_aviso_reembolso_oficio() from public, anon, authenticated;
revoke all on function panel_contrato_detalle(uuid) from public, anon;
grant execute on function oficio_historial_pagos() to authenticated;
grant execute on function cliente_historial_pagos() to authenticated;
grant execute on function contratos_de_pago(uuid) to authenticated;
grant execute on function pago_cancelar_preparar(uuid) to authenticated;
grant execute on function pago_cancelar_confirmar(uuid) to service_role;
grant execute on function pago_solicitar_reembolso(uuid, text) to authenticated;
grant execute on function panel_contrato_detalle(uuid) to authenticated;