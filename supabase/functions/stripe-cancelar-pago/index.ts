// El cliente cancela un pago que todavía no ha pagado. Anula el cobro en Stripe y marca el pago como cancelado.
// Body: { pago_id }. No mueve dinero: si el cobro ya se había completado, Stripe lo rechaza y el pago se queda como está.
import { clienteServicio, clienteUsuario, cors, json, mensajeError, stripe } from "../_shared/comun.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { pago_id } = await req.json();
    if (!pago_id) return json({ error: "Falta el pago." }, 400);

    const usuario = clienteUsuario(req);
    const { data: u } = await usuario.auth.getUser();
    if (!u?.user) return json({ error: "No autenticado" }, 401);

    // La función SQL comprueba que sea el cliente del pago y que siga pendiente
    const { data: plan, error } = await usuario.rpc("pago_cancelar_preparar", { p_pago_id: pago_id });
    if (error) return json({ error: error.message }, 400);

    if (plan.payment_intent) {
      try {
        await stripe.paymentIntents.cancel(plan.payment_intent);
      } catch (e) {
        // Si el cobro ya salió bien o ya estaba anulado, se mira el estado real antes de decidir
        const intent = await stripe.paymentIntents.retrieve(plan.payment_intent);
        if (intent.status === "succeeded" || intent.status === "processing") {
          return json({ error: "El pago ya se ha completado o se está procesando. Actualiza la pantalla." }, 409);
        }
        if (intent.status !== "canceled") throw e;
      }
    }

    const { error: e2 } = await clienteServicio().rpc("pago_cancelar_confirmar", { p_pago_id: pago_id });
    if (e2) throw e2;
    return json({ ok: true });
  } catch (e) {
    return json({ error: mensajeError(e) }, 400);
  }
});