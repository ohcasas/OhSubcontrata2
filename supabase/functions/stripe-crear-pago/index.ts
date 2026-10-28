// El cliente empieza a pagar una obra. Devuelve el client_secret para la hoja de pago de la app.
import { clienteServicio, clienteUsuario, cors, json, mensajeError, stripe } from "../_shared/comun.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { obra_id } = await req.json();
    if (!obra_id) return json({ error: "Falta la obra." }, 400);

    const usuario = clienteUsuario(req);
    const { data: u } = await usuario.auth.getUser();
    if (!u?.user) return json({ error: "No autenticado" }, 401);

    // Todas las comprobaciones de negocio están en la función SQL (dueño, oferta aceptada, cuenta del oficio…)
    const { data: pago, error } = await usuario.rpc("pago_iniciar", { p_obra_id: obra_id });
    if (error) return json({ error: error.message }, 400);

    const admin = clienteServicio();
    const { data: fila } = await admin
      .from("pagos").select("stripe_payment_intent_id").eq("id", pago.pago_id).single();

    let intent;
    if (fila?.stripe_payment_intent_id) {
      intent = await stripe.paymentIntents.retrieve(fila.stripe_payment_intent_id);
      if (intent.status === "canceled") {
        // El intent antiguo ya no sirve: se crea uno nuevo (la clave de idempotencia lleva el id del viejo)
        intent = await stripe.paymentIntents.create({
          amount: pago.importe_cents,
          currency: pago.moneda,
          transfer_group: pago.transfer_group,
          automatic_payment_methods: { enabled: true },
          metadata: { pago_id: pago.pago_id, obra_id },
        }, { idempotencyKey: `pi_${pago.pago_id}_tras_${fila.stripe_payment_intent_id}` });
        const { error: e2 } = await admin.from("pagos")
          .update({ stripe_payment_intent_id: intent.id }).eq("id", pago.pago_id);
        if (e2) throw e2;
      } else if (intent.amount !== pago.importe_cents && intent.status !== "succeeded") {
        intent = await stripe.paymentIntents.update(intent.id, { amount: pago.importe_cents });
      }
    } else {
      intent = await stripe.paymentIntents.create({
        amount: pago.importe_cents,
        currency: pago.moneda,
        transfer_group: pago.transfer_group,
        automatic_payment_methods: { enabled: true },
        metadata: { pago_id: pago.pago_id, obra_id },
      }, { idempotencyKey: `pi_${pago.pago_id}` });
      await admin.from("pagos")
        .update({ stripe_payment_intent_id: intent.id }).eq("id", pago.pago_id);
    }

    return json({ pago_id: pago.pago_id, client_secret: intent.client_secret });
  } catch (e) {
    return json({ error: mensajeError(e) }, 400);
  }
});