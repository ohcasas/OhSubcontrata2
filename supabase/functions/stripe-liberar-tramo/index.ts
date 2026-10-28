// Panel de 3B: liberar al oficio un tramo de una obra pagada por tramos.
// Body: { tramo_id }
import { clienteServicio, clienteUsuario, cors, json, mensajeError, stripe } from "../_shared/comun.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const usuario = clienteUsuario(req);
  let tramoId: string | undefined;
  let preparado = false;
  let movido = false;
  try {
    const body = await req.json();
    tramoId = body.tramo_id;
    if (!tramoId) return json({ error: "Falta el tramo." }, 400);

    // La función SQL comprueba que sea admin y que el tramo esté confirmado por el cliente
    const { data: plan, error } = await usuario.rpc("panel_preparar_tramo", { p_tramo_id: tramoId });
    if (error) return json({ error: error.message }, 400);
    preparado = true;

    const intent = await stripe.paymentIntents.retrieve(plan.payment_intent);
    const cargo = typeof intent.latest_charge === "string" ? intent.latest_charge : intent.latest_charge?.id;

    let transferId: string | null = null;
    if (plan.transferir_cents > 0) {
      const t = await stripe.transfers.create({
        amount: plan.transferir_cents,
        currency: plan.moneda,
        destination: plan.cuenta_oficio,
        transfer_group: plan.transfer_group,
        source_transaction: cargo ?? undefined,
        metadata: { pago_id: plan.pago_id, tramo_id: plan.tramo_id, comision_cents: String(plan.comision_cents) },
      }, { idempotencyKey: `transfer_tramo_${plan.tramo_id}` });
      transferId = t.id;
      movido = true;
    }

    const admin = clienteServicio();
    const { error: e2 } = await admin.rpc("tramo_finalizar", { p_tramo_id: plan.tramo_id, p_transfer_id: transferId });
    if (e2) throw e2;
    return json({ ok: true, transfer_id: transferId });
  } catch (e) {
    // Si Stripe falló antes de mover dinero, el tramo vuelve a su estado anterior.
    // Si ya se movió dinero, se deja en 'liberando' para revisarlo a mano.
    if (preparado && !movido && tramoId) {
      await usuario.rpc("panel_deshacer_tramo", { p_tramo_id: tramoId });
    }
    return json({ error: mensajeError(e) }, 400);
  }
});