// Envía los correos pendientes de la cola con Resend, aplicando el diseño y las plantillas del panel.
// Se despliega SIN verificación de JWT; la protege la cabecera x-envio-secret (= ENVIO_CORREOS_SECRET).
import { clienteServicio } from "../_shared/comun.ts";

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

function rellenar(texto: string, vars: Record<string, string>, escapar: boolean): string {
  return texto.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k) => {
    const v = vars[k] ?? "";
    return escapar ? esc(v) : v;
  });
}

function html(a: Record<string, string>, cuerpo: string, boton: string | null, enlace: string): string {
  const parrafos = cuerpo.split(/\n{2,}/).map((p) =>
    `<p style="margin:0 0 14px;line-height:1.55">${p.replace(/\n/g, "<br>")}</p>`
  ).join("");
  const btn = boton && enlace
    ? `<p style="margin:22px 0 4px"><a href="${esc(enlace)}" style="background:${a.color};color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-weight:600;display:inline-block">${esc(boton)}</a></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#f3f5f9;font-family:Arial,Helvetica,sans-serif;color:#0b1f35">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="560" style="max-width:560px;background:#fff;border-radius:12px;overflow:hidden">
<tr><td style="background:${a.color};color:#fff;padding:18px 24px;font-size:18px;font-weight:700">${esc(a.cabecera)}</td></tr>
<tr><td style="padding:24px;font-size:15px">${parrafos}${btn}</td></tr>
<tr><td style="padding:16px 24px;font-size:12px;color:#6b7a8c;border-top:1px solid #e6eaf0">${esc(a.pie)}</td></tr>
</table></td></tr></table></body></html>`;
}

Deno.serve(async (req) => {
  if (req.headers.get("x-envio-secret") !== Deno.env.get("ENVIO_CORREOS_SECRET")) {
    return new Response("No autorizado", { status: 401 });
  }
  const clave = Deno.env.get("RESEND_API_KEY");
  if (!clave) return new Response("Falta RESEND_API_KEY", { status: 500 });

  const admin = clienteServicio();
  const { data: a } = await admin.from("ajustes_correo").select("*").eq("id", true).single();
  if (!a?.activo || !a.remitente_email) return new Response("correos desactivados", { status: 200 });

  const { data: cola } = await admin
    .from("cola_correos").select("*").eq("estado", "pendiente").lt("intentos", 5)
    .order("created_at").limit(20);

  let enviados = 0;
  for (const c of cola ?? []) {
    const { data: p } = await admin.from("plantillas_correo").select("*").eq("clave", c.plantilla).maybeSingle();
    if (!p || !p.activa) {
      await admin.from("cola_correos").update({ estado: "error", error: "Plantilla no disponible" }).eq("id", c.id);
      continue;
    }
    const vars = c.variables as Record<string, string>;
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${clave}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: `${a.remitente_nombre} <${a.remitente_email}>`,
          to: [c.para],
          reply_to: a.responder_a || undefined,
          subject: rellenar(p.asunto, vars, false),
          html: html(a, rellenar(p.cuerpo, vars, true), p.boton_texto, vars.enlace ?? ""),
        }),
      });
      if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 300)}`);
      await admin.from("cola_correos")
        .update({ estado: "enviado", enviado_at: new Date().toISOString(), intentos: c.intentos + 1 }).eq("id", c.id);
      enviados++;
    } catch (e) {
      const agotado = c.intentos + 1 >= 5;
      await admin.from("cola_correos").update({
        intentos: c.intentos + 1, estado: agotado ? "error" : "pendiente", error: String((e as Error).message),
      }).eq("id", c.id);
    }
  }
  return new Response(JSON.stringify({ enviados }), { status: 200 });
});