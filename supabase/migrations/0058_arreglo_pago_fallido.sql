-- Arreglo del pago con tarjeta rechazada (B1)
--
-- Antes: al rechazarse una tarjeta el pago pasaba a "fallido". Si el cliente reintentaba con otra tarjeta
-- en la misma hoja de pago, Stripe cobraba pero la app ignoraba el cobro (solo aceptaba "pendiente"),
-- y si volvía a pagar se creaba otro pago: doble cobro.
--
-- Ahora: un rechazo de tarjeta deja el pago en "pendiente" (el cliente puede reintentar con el mismo intent),
-- y si por cualquier motivo llega un cobro correcto para un pago que estaba "fallido", también se acepta.

create or replace function pago_marcar_fallido(p_payment_intent text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- No cambiamos el estado: el pago sigue pendiente y el cliente puede reintentarlo.
  update pagos set updated_at = now()
   where stripe_payment_intent_id = p_payment_intent and estado = 'pendiente';
end;
$$;

create or replace function pago_marcar_retenido(p_payment_intent text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pago pagos%rowtype;
  v_titulo text;
begin
  select * into v_pago from pagos where stripe_payment_intent_id = p_payment_intent for update;
  if not found or v_pago.estado not in ('pendiente', 'fallido') then
    return;  -- evento repetido o pago desconocido
  end if;
  update pagos set estado = 'retenido', pagado_at = now(), updated_at = now() where id = v_pago.id;

  select titulo into v_titulo from obras where id = v_pago.obra_id;
  perform crear_notificacion(v_pago.empresa_id, 'pago_retenido',
    'Pago asegurado',
    'El cliente ha pagado la obra "' || coalesce(v_titulo, '') || '". El dinero queda retenido y se te liberará al terminar y verificar el trabajo.',
    jsonb_build_object('obra_id', v_pago.obra_id, 'pago_id', v_pago.id));
  perform avisar_usuario(v_pago.cliente_id, 'pago_retenido',
    'Pago realizado',
    'Tu pago de la obra "' || coalesce(v_titulo, '') || '" está retenido de forma segura. Solo se entrega al oficio cuando confirmes que el trabajo está bien.',
    jsonb_build_object('obra_id', v_pago.obra_id, 'pago_id', v_pago.id));
end;
$$;

revoke all on function pago_marcar_retenido(text) from public, anon, authenticated;
revoke all on function pago_marcar_fallido(text) from public, anon, authenticated;
grant execute on function pago_marcar_retenido(text) to service_role;
grant execute on function pago_marcar_fallido(text) to service_role;