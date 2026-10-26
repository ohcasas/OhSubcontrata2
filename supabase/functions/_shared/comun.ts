// Utilidades compartidas por las funciones de Stripe.
import Stripe from "npm:stripe@17.7.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

// El cliente de Stripe se crea la primera vez que se usa, para que una clave ausente
// dé un mensaje claro en vez de tumbar la función al arrancar.
let _stripe: Stripe | null = null;
function crearStripe(): Stripe {
  const clave = Deno.env.get("STRIPE_SECRET_KEY");
  if (!clave) throw new Error("Falta el secreto STRIPE_SECRET_KEY en Supabase.");
  if (!_stripe) _stripe = new Stripe(clave, { httpClient: Stripe.createFetchHttpClient() });
  return _stripe;
}
export const stripe = new Proxy({} as Stripe, {
  get: (_t, prop) => (crearStripe() as unknown as Record<string | symbol, unknown>)[prop],
});

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

// Cliente con los permisos de la persona que llama (respeta RLS y las comprobaciones de las RPC)
export function clienteUsuario(req: Request) {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
  );
}

// Cliente con permisos totales: solo para lo que el usuario no puede hacer por sí mismo
export function clienteServicio() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

export function mensajeError(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return "Error inesperado";
}