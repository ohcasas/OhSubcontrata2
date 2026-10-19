// El oficio abre (o retoma) el alta de su cuenta de cobro en Stripe.
// Devuelve { url } para abrir en el navegador, y el estado actual de la cuenta.
import { clienteServicio, clienteUsuario, cors, json, mensajeError, stripe } from "../_shared/comun.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const usuario = clienteUsuario(req);
    const { data: u } = await usuario.auth.getUser();
    if (!u?.user) return json({ error: "No autenticado" }, 401);

    const admin = clienteServicio();
    const { data: perfil } = await admin
      .from("profiles").select("empresa_id, email").eq("id", u.user.id).single();
    if (!perfil?.empresa_id) return json({ error: "Tu cuenta no tiene una empresa asociada." }, 400);

    const { return_url, refresh_url } = await req.json().catch(() => ({}));
    const base = Deno.env.get("APP_URL") ?? "https://example.invalid";

    const { data: existente } = await admin
      .from("stripe_cuentas").select("stripe_account_id").eq("empresa_id", perfil.empresa_id).maybeSingle();

    let accountId = existente?.stripe_account_id as string | undefined;
    if (!accountId) {
      const cuenta = await stripe.accounts.create({
        type: "express",
        country: "ES",
        email: perfil.email ?? undefined,
        capabilities: { transfers: { requested: true } },
        metadata: { empresa_id: perfil.empresa_id },
      }, { idempotencyKey: `cuenta_${perfil.empresa_id}` });
      accountId = cuenta.id;
      await admin.from("stripe_cuentas").insert({
        empresa_id: perfil.empresa_id, stripe_account_id: accountId,
      });
    }

    const cuenta = await stripe.accounts.retrieve(accountId);
    const activa = cuenta.payouts_enabled === true && cuenta.capabilities?.transfers === "active";
    await admin.from("stripe_cuentas").update({
      detalles_enviados: cuenta.details_submitted ?? false,
      cobros_activos: cuenta.charges_enabled ?? false,
      transferencias_activas: activa,
      updated_at: new Date().toISOString(),
    }).eq("empresa_id", perfil.empresa_id);

    if (activa) return json({ activa: true, url: null });

    const enlace = await stripe.accountLinks.create({
      account: accountId,
      type: "account_onboarding",
      return_url: return_url ?? `${base}/?stripe=ok`,
      refresh_url: refresh_url ?? `${base}/?stripe=reintentar`,
    });
    return json({ activa: false, url: enlace.url });
  } catch (e) {
    return json({ error: mensajeError(e) }, 400);
  }
});