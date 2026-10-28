-- B4: contracargos (disputas del banco) y reembolsos hechos fuera de la app
--
-- Antes: si el cliente pedía un contracargo a su banco, o alguien reembolsaba desde el panel de Stripe,
-- la app no se enteraba y 3B podía liberar dinero que ya no tenía.
--
-- Ahora el webhook avisa a esta función, que congela el pago ("en_disputa") y avisa al equipo.
-- Si el dinero ya se liberó, no se puede congelar: solo se avisa al equipo con un mensaje claro.

create or replace function pago_alerta_stripe(p_payment_intent text, p_tipo text, p_detalle text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pago pagos%rowtype;
  v_titulo text;
  v_motivo text;
begin
  if p_payment_intent is null then
    return;
  end if;
  select * into v_pago from pagos where stripe_payment_intent_id = p_payment_intent for update;
  if not found then
    return;  -- cobro que no es de ninguna obra de la app
  end if;

  v_motivo := case p_tipo
    when 'contracargo' then 'Contracargo abierto en Stripe por el banco del cliente'
    else 'Reembolso hecho desde el panel de Stripe'
  end || coalesce(' (' || p_detalle || ')', '');

  select titulo into v_titulo from obras where id = v_pago.obra_id;

  -- Reembolsos de la propia app y pagos ya cerrados: no hay nada que congelar ni que avisar
  if p_tipo = 'reembolso_externo' and v_pago.estado in ('reembolsando', 'reembolsado', 'liberando', 'liberado') then
    return;
  end if;
  if v_pago.estado in ('pendiente', 'fallido', 'cancelado') then
    return;
  end if;

  if v_pago.estado in ('retenido', 'terminada_oficio', 'confirmada_cliente', 'aprobado_3b') then
    update pagos
       set estado_previo_disputa = estado,
           estado = 'en_disputa',
           disputa_motivo = left(v_motivo, 2000),
           disputa_at = now(),
           updated_at = now()
     where id = v_pago.id;
    perform avisar_equipo('pago_disputa',
      'Urgente: ' || case p_tipo when 'contracargo' then 'contracargo en un pago' else 'reembolso externo en un pago' end,
      v_motivo || '. Obra "' || coalesce(v_titulo, '') || '". El pago queda congelado hasta que lo revise 3B.',
      jsonb_build_object('obra_id', v_pago.obra_id, 'pago_id', v_pago.id));
  elsif v_pago.estado = 'en_disputa' then
    update pagos
       set disputa_motivo = left(coalesce(disputa_motivo || E'\n', '') || v_motivo, 2000), updated_at = now()
     where id = v_pago.id;
    perform avisar_equipo('pago_disputa',
      'Urgente: aviso de Stripe en un pago en disputa',
      v_motivo || '. Obra "' || coalesce(v_titulo, '') || '".',
      jsonb_build_object('obra_id', v_pago.obra_id, 'pago_id', v_pago.id));
  else
    -- 'liberando' o 'liberado' con contracargo: el dinero ya salió hacia el oficio
    update pagos
       set resolucion_nota = left(coalesce(resolucion_nota || E'\n', '') || v_motivo, 2000), updated_at = now()
     where id = v_pago.id;
    perform avisar_equipo('pago_disputa',
      'Urgente: contracargo con el dinero ya liberado',
      v_motivo || '. Obra "' || coalesce(v_titulo, '') || '". El dinero ya se entregó al oficio: responde a la disputa en Stripe antes de la fecha límite.',
      jsonb_build_object('obra_id', v_pago.obra_id, 'pago_id', v_pago.id));
  end if;
end;
$$;

revoke all on function pago_alerta_stripe(text, text, text) from public, anon, authenticated;
grant execute on function pago_alerta_stripe(text, text, text) to service_role;