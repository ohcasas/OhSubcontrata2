// SOLO LECTURA. Consulta en Odoo Online el estado de la factura de 3B anotada en un plazo.
// Body: { plazo_id }. No escribe en Odoo ni en Supabase: devuelve los datos para que el panel los muestre
// y sea una persona de administracion quien marque la comision como cobrada.
// Secretos necesarios (Supabase > Edge Functions > Secrets): ODOO_URL, ODOO_DB, ODOO_LOGIN, ODOO_API_KEY.
// Usa la clave de API de un usuario tecnico de SOLO LECTURA en Contabilidad. Nunca la contrasena de una persona.
import { clienteServicio, clienteUsuario, cors, json, mensajeError } from "../_shared/comun.ts";

async function odoo(base: string, servicio: string, metodo: string, args: unknown[]) {
  const r = await fetch(`${base}/jsonrpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: { service: servicio, method: metodo, args }, id: 1 }),
  });
  if (!r.ok) throw new Error(`Odoo respondio ${r.status}.`);
  const j = await r.json();
  if (j.error) throw new Error("Odoo rechazo la consulta: " + (j.error.data?.message ?? j.error.message ?? "error"));
  return j.result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { plazo_id } = await req.json();
    if (!plazo_id) return json({ error: "Falta el plazo." }, 400);

    const usuario = clienteUsuario(req);
    const { data: u } = await usuario.auth.getUser();
    if (!u?.user) return json({ error: "No autenticado" }, 401);
    // Esta funcion SQL solo deja pasar a administracion (lanza error si no lo es)
    const { error: ea } = await usuario.rpc("panel_ct_resumen");
    if (ea) return json({ error: "Solo el personal de administración." }, 403);

    const url = (Deno.env.get("ODOO_URL") ?? "").replace(/\/+$/, "");
    const db = Deno.env.get("ODOO_DB");
    const login = Deno.env.get("ODOO_LOGIN");
    const clave = Deno.env.get("ODOO_API_KEY");
    if (!url || !db || !login || !clave) return json({ error: "Faltan los secretos de Odoo en Supabase." }, 500);
    if (!/^https:\/\/[a-z0-9-]+\.odoo\.com$/i.test(url)) return json({ error: "ODOO_URL debe ser https://tuempresa.odoo.com" }, 500);

    const { data: plazo, error: ep } = await clienteServicio().from("obra_plazos")
      .select("id, factura_numero, comision_contrata_cents, comision_sub_cents, total_cents").eq("id", plazo_id).maybeSingle();
    if (ep || !plazo) return json({ error: "El plazo no existe." }, 404);
    if (!plazo.factura_numero) return json({ error: "Este plazo todavía no tiene número de factura." }, 400);

    const uid = await odoo(url, "common", "authenticate", [db, login, clave, {}]);
    if (!uid) return json({ error: "Odoo no acepta el usuario o la clave de API." }, 502);

    const filas = await odoo(url, "object", "execute_kw", [db, uid, clave, "account.move", "search_read",
      [[["name", "=", plazo.factura_numero], ["move_type", "=", "out_invoice"]]],
      { fields: ["name", "state", "payment_state", "amount_untaxed", "amount_total", "invoice_date", "partner_id"], limit: 2 }]);

    if (!filas.length) return json({ encontrada: false, factura_numero: plazo.factura_numero });
    if (filas.length > 1) return json({ error: "Hay varias facturas con ese número en Odoo. Revísalo a mano." }, 409);
    const f = filas[0];
    const total = Number(plazo.total_cents) / 100;
    const comision = (Number(plazo.comision_contrata_cents) + Number(plazo.comision_sub_cents)) / 100;
    return json({
      encontrada: true,
      factura_numero: f.name,
      estado: f.state,                 // draft | posted | cancel
      pago: f.payment_state,           // not_paid | in_payment | paid | partial | reversed
      cliente: Array.isArray(f.partner_id) ? f.partner_id[1] : null,
      base_imponible: f.amount_untaxed,
      total: f.amount_total,
      fecha: f.invoice_date,
      total_esperado_sin_iva: total,
      comision_esperada: comision,
      // La factura puede ser por el total del plazo o solo por las comisiones: vale cualquiera de las dos
      coincide_importe: [total, comision].some((x) => Math.abs(Number(f.amount_untaxed) - x) < 0.005),
    });
  } catch (e) {
    return json({ error: mensajeError(e) }, 400);
  }
});