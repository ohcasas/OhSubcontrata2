// El oficio abre (o retoma) el alta de su cuenta de cobro en Stripe.
// Devuelve { url } para abrir en el navegador, y el estado actual de la cuenta.
//
// Usa Accounts v2 de Stripe (POST /v2/core/accounts), el método que Stripe
// exige para las integraciones Connect nuevas. La cuenta del oficio recibe
// transferencias de la plataforma (configuración "recipient"); 3B nunca
// retiene el dinero: solo lo mueve cuando se aprueba la liberación.
import { clienteServicio, clienteUsuario, cors, json, mensajeError } from "../_shared/comun.ts";

// La API v2 se pide con una versión explícita. Se prueban en orden por si una
// de ellas no estuviera aceptada todavía en la cuenta.
const VERSIONES = ["2026-09-30.preview", "2026-09-30.endive"];

// deno-lint-ignore no-explicit-any
async function stripeV2(metodo: "GET" | "POST", ruta: string, cuerpo?: unknown, idempotencia?: string): Promise<any> {
  const clave = Deno.env.get("STRIPE_SECRET_KEY");
  if (!clave) throw new Error("Falta el secreto STRIPE_SECRET_KEY en Supabase.");

  let ultimoError = "";
  for (const version of VERSIONES) {
    const cabeceras: Record<string, string> = {
      Authorization: `Bearer ${clave}`,
      "Stripe-Version": version,
    };
    if (cuerpo !== undefined) cabeceras["Content-Type"] = "application/json";
    if (idempotencia) cabeceras["Idempotency-Key"] = idempotencia;

    const r = await fetch(`https://api.stripe.com${ruta}`, {
      method: metodo,
      headers: cabeceras,
      body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
    });
    const texto = await r.text();
    let datos: Record<string, unknown> = {};
    try { datos = JSON.parse(texto); } catch { /* respuesta no JSON */ }
    if (r.ok) return datos;

    // deno-lint-ignore no-explicit-any
    const err = (datos as any)?.error ?? {};
    ultimoError = err.message ?? texto.slice(0, 300) ?? `Stripe respondió ${r.status}`;
    const esProblemaDeVersion = /version/i.test(ultimoError) || /api[_ ]version/i.test(String(err.code ?? ""));
    if (!esProblemaDeVersion) throw new Error(ultimoError);
  }
  throw new Error(ultimoError || "Stripe rechazó la versión de la API.");
}

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
      const { data: empresa } = await admin
        .from("empresas_subcontratistas").select("*").eq("id", perfil.empresa_id).maybeSingle();
      // deno-lint-ignore no-explicit-any
      const e = (empresa ?? {}) as any;
      const nombre = String(e.nombre_comercial ?? e.razon_social ?? e.nombre ?? "Oficio 3B Conecta").slice(0, 100);

      const cuenta = await stripeV2("POST", "/v2/core/accounts", {
        contact_email: perfil.email ?? u.user.email ?? undefined,
        display_name: nombre,
        dashboard: "express",
        identity: { country: "es" },
        defaults: {
          responsibilities: { fees_collector: "application", losses_collector: "application" },
        },
        configuration: {
          recipient: {
            capabilities: { stripe_balance: { stripe_transfers: { requested: true } } },
          },
        },
        include: ["configuration.recipient", "identity", "requirements"],
      }, `cuenta_v2_${perfil.empresa_id}`);

      accountId = cuenta.id as string;
      await admin.from("stripe_cuentas").insert({
        empresa_id: perfil.empresa_id, stripe_account_id: accountId,
      });
    }

    // Estado actual de la cuenta
    const consulta = new URLSearchParams();
    consulta.append("include", "configuration.recipient");
    consulta.append("include", "requirements");
    const cuenta = await stripeV2("GET", `/v2/core/accounts/${accountId}?${consulta.toString()}`);

    const estadoTransferencias =
      cuenta?.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status;
    const activa = estadoTransferencias === "active";
    // deno-lint-ignore no-explicit-any
    const pendientes = ((cuenta?.requirements?.entries ?? []) as any[]).filter((x) =>
      ["currently_due", "past_due"].includes(x?.minimum_deadline?.status)
    );
    const detallesEnviados = activa || pendientes.length === 0;

    await admin.from("stripe_cuentas").update({
      detalles_enviados: detallesEnviados,
      cobros_activos: false,
      transferencias_activas: activa,
      updated_at: new Date().toISOString(),
    }).eq("empresa_id", perfil.empresa_id);

    if (activa) return json({ activa: true, url: null });

    const enlace = await stripeV2("POST", "/v2/core/account_links", {
      account: accountId,
      use_case: {
        type: "account_onboarding",
        account_onboarding: {
          return_url: return_url ?? `${base}/?stripe=ok`,
          refresh_url: refresh_url ?? `${base}/?stripe=reintentar`,
        },
      },
    });
    return json({ activa: false, url: enlace.url });
  } catch (e) {
    return json({ error: mensajeError(e) }, 400);
  }
});