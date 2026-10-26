// Avisos de Stripe: pago realizado, pago fallido y cambios en las cuentas de los oficios.
// Se despliega SIN verificación de JWT (Stripe no lleva sesión): la firma protege la entrada.
import { clienteServicio, stripe } from "../_shared/comun.ts";

Deno.serve(async (req) => {
  const firma = req.headers.get("stripe-signature");
  const secreto = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!firma || !secreto) return new Response("Falta la firma", { status: 400 });

  let evento;
  try {
    evento = await stripe.webhooks.constructEventAsync(await req.text(), firma, secreto);
  } catch (_e) {
    return new Response("Firma no válida", { status: 400 });
  }

  const admin = clienteServicio();

  // Idempotencia: si el evento ya se procesó, respondemos OK sin repetirlo
  const { error: dup } = await admin.from("stripe_eventos").insert({ id: evento.id, tipo: evento.type });
  if (dup) return new Response("ya procesado", { status: 200 });

  try {
    if (evento.type === "payment_intent.succeeded") {
      const pi = evento.data.object;
      await admin.rpc("pago_marcar_retenido", { p_payment_intent: pi.id });
    } else if (evento.type === "payment_intent.payment_failed") {
      const pi = evento.data.object;
      await admin.rpc("pago_marcar_fallido", { p_payment_intent: pi.id });
    } else if (evento.type === "account.updated") {
      const c = evento.data.object;
      // Las cuentas nuevas son Accounts v2: su estado real lo lee stripe-onboarding.
      // Aquí solo se sube a "activa" si Stripe lo confirma; nunca se baja.
      if (c.capabilities?.transfers === "active") {
        await admin.from("stripe_cuentas").update({
          detalles_enviados: true,
          transferencias_activas: true,
          updated_at: new Date().toISOString(),
        }).eq("stripe_account_id", c.id);
      }
    }
    return new Response("ok", { status: 200 });
  } catch (e) {
    // Si falla, olvidamos el evento para que Stripe lo reintente
    await admin.from("stripe_eventos").delete().eq("id", evento.id);
    return new Response("error", { status: 500 });
  }
});