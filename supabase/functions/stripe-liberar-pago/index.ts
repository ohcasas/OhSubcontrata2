// Panel de 3B: liberar el pago al oficio, reembolsar al cliente o dividirlo.
// Body: { pago_id, accion: 'liberar' | 'reembolsar' | 'dividir', importe_oficio_cents?, nota? }
import { clienteServicio, clienteUsuario, cors, json, mensajeError, stripe } from "../_shared/comun.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const usuario = clienteUsuario(req);
  let pagoId: string | undefined;
  let preparado = false;
  let movido = false;
  try {
    const body = await req.json();
    pagoId = body.pago_id;

    // La función SQL comprueba que sea admin y que el estado permita la operación
    const { data: plan, error } = await usuario.rpc("panel_preparar_pago", {
      p_pago_id: body.pago_id,
      p_accion: body.accion,
      p_importe_oficio_cents: body.importe_oficio_cents ?? null,
      p_nota: body.nota ?? null,
    });
    if (error) return json({ error: error.message }, 400);
    preparado = true;

    const intent = await stripe.paymentIntents.retrieve(plan.payment_intent);
    const cargo = typeof intent.latest_charge === "string" ? intent.latest_charge : intent.latest_charge?.id;

    let transferId: string | null = null;
    let refundId: string | null = null;

    if (plan.transferir_cents > 0) {
      const t = await stripe.transfers.create({
        amount: plan.transferir_cents,
        currency: plan.moneda,
        destination: plan.cuenta_oficio,
        transfer_group: plan.transfer_group,
        source_transaction: cargo ?? undefined,
        metadata: { pago_id: plan.pago_id, comision_cents: String(plan.comision_cents) },
      }, { idempotencyKey: `transfer_${plan.pago_id}` });
      transferId = t.id;
      movido = true;
    }
    if (plan.reembolsar_cents > 0) {
      const r = await stripe.refunds.create({
        payment_intent: plan.payment_intent,
        amount: plan.reembolsar_cents,
        metadata: { pago_id: plan.pago_id },
      }, { idempotencyKey: `refund_${plan.pago_id}` });
      refundId = r.id;
      movido = true;
    }

    const admin = clienteServicio();
    // Un reparto con transferencia y reembolso queda como 'liberado'
    const { error: e2 } = await admin.rpc("pago_finalizar", {
      p_pago_id: plan.pago_id, p_transfer_id: transferId, p_refund_id: refundId,
    });
    if (e2) throw e2;
    return json({ ok: true, transfer_id: transferId, refund_id: refundId });
  } catch (e) {
    // Si Stripe falló antes de mover dinero, el pago vuelve a su estado anterior.
    // Si ya se movió dinero, se deja en 'liberando'/'reembolsando' para revisarlo a mano.
    if (preparado && !movido && pagoId) {
      await usuario.rpc("panel_deshacer_preparacion", { p_pago_id: pagoId });
    }
    return json({ error: mensajeError(e) }, 400);
  }
});