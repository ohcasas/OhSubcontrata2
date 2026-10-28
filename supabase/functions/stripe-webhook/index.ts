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
  // Solo el código 23505 (clave repetida) significa "ya procesado"; cualquier otro fallo hace que Stripe reintente.
  const { error: dup } = await admin.from("stripe_eventos").insert({ id: evento.id, tipo: evento.type });
  if (dup) {
    if (dup.code === "23505") return new Response("ya procesado", { status: 200 });
    return new Response("error al registrar el evento", { status: 500 });
  }

  try {
    if (evento.type === "payment_intent.succeeded") {
      const pi = evento.data.object;
      const { error } = await admin.rpc("pago_marcar_retenido", { p_payment_intent: pi.id });
      if (error) throw error;
    } else if (evento.type === "payment_intent.payment_failed") {
      const pi = evento.data.object;
      const { error } = await admin.rpc("pago_marcar_fallido", { p_payment_intent: pi.id });
      if (error) throw error;
    } else if (evento.type === "charge.dispute.created") {
      // El banco del cliente ha abierto un contracargo: congelamos el pago y avisamos al equipo
      const d = evento.data.object;
      const pi = typeof d.payment_intent === "string" ? d.payment_intent : d.payment_intent?.id;
      const { error } = await admin.rpc("pago_alerta_stripe", {
        p_payment_intent: pi ?? null, p_tipo: "contracargo", p_detalle: d.reason ?? null,
      });
      if (error) throw error;
    } else if (evento.type === "charge.refunded") {
      // Reembolso hecho fuera de la app (los de la app ya los tiene controlados el pago)
      const c = evento.data.object;
      const pi = typeof c.payment_intent === "string" ? c.payment_intent : c.payment_intent?.id;
      const { error } = await admin.rpc("pago_alerta_stripe", {
        p_payment_intent: pi ?? null, p_tipo: "reembolso_externo", p_detalle: null,
      });
      if (error) throw error;
    } else if (evento.type === "account.updated") {
      const c = evento.data.object;
      // Las cuentas nuevas son Accounts v2: su estado real lo lee stripe-onboarding.
      // Aquí solo se sube a "activa" si Stripe lo confirma; nunca se baja.
      if (c.capabilities?.transfers === "active") {
        const { error } = await admin.from("stripe_cuentas").update({
          detalles_enviados: true,
          transferencias_activas: true,
          updated_at: new Date().toISOString(),
        }).eq("stripe_account_id", c.id);
        if (error) throw error;
      }
    }
    return new Response("ok", { status: 200 });
  } catch (e) {
    // Si falla, olvidamos el evento para que Stripe lo reintente
    await admin.from("stripe_eventos").delete().eq("id", evento.id);
    return new Response("error", { status: 500 });
  }
});