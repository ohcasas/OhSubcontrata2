import { supabase } from './supabase';

export type EstadoPago =
  | 'pendiente' | 'retenido' | 'terminada_oficio' | 'confirmada_cliente' | 'aprobado_3b'
  | 'en_disputa' | 'liberando' | 'liberado' | 'reembolsando' | 'reembolsado' | 'fallido' | 'cancelado';

export type Pago = {
  id: string;
  obra_id: string;
  estado: EstadoPago;
  importe_cents: number;
  comision_cents: number;
  comision_pct: number | null;
  auto_confirma_at: string | null;
  disputa_motivo: string | null;
  created_at: string;
};

export type CuentaCobro = {
  activa: boolean;
  detalles_enviados: boolean;
};

const CAMPOS = 'id, obra_id, estado, importe_cents, comision_cents, comision_pct, auto_confirma_at, disputa_motivo, created_at';

/** Último pago de una obra que sigue en marcha (o el último en general). */
export async function pagoDeObra(obraId: string): Promise<Pago | null> {
  const { data, error } = await supabase
    .from('pagos')
    .select(CAMPOS)
    .eq('obra_id', obraId)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  const fila = (data as Pago[] | null)?.[0] ?? null;
  return fila;
}

/** Crea el cobro en Stripe y devuelve el secreto que necesita la hoja de pago. */
export async function iniciarPago(obraId: string): Promise<{ pagoId: string; clientSecret: string }> {
  const { data, error } = await supabase.functions.invoke('stripe-crear-pago', { body: { obra_id: obraId } });
  if (error) throw new Error(await mensajeFuncion(error));
  if (data?.error) throw new Error(data.error);
  return { pagoId: data.pago_id, clientSecret: data.client_secret };
}

export async function oficioTermina(pagoId: string): Promise<void> {
  const { error } = await supabase.rpc('pago_oficio_termina', { p_pago_id: pagoId });
  if (error) throw new Error(error.message);
}

export async function clienteConfirma(pagoId: string): Promise<void> {
  const { error } = await supabase.rpc('pago_cliente_confirma', { p_pago_id: pagoId });
  if (error) throw new Error(error.message);
}

export async function reportarProblema(pagoId: string, motivo: string): Promise<void> {
  const { error } = await supabase.rpc('pago_abrir_disputa', { p_pago_id: pagoId, p_motivo: motivo });
  if (error) throw new Error(error.message);
}

/** Cuenta de cobro del oficio: devuelve el enlace de Stripe si falta completar el alta. */
export async function prepararCuentaCobro(): Promise<{ activa: boolean; url: string | null }> {
  const { data, error } = await supabase.functions.invoke('stripe-onboarding', { body: {} });
  if (error) throw new Error(await mensajeFuncion(error));
  if (data?.error) throw new Error(data.error);
  return { activa: data.activa === true, url: data.url ?? null };
}

export async function estadoCuentaCobro(empresaId: string): Promise<CuentaCobro> {
  const { data } = await supabase
    .from('stripe_cuentas')
    .select('transferencias_activas, detalles_enviados')
    .eq('empresa_id', empresaId)
    .maybeSingle();
  return {
    activa: data?.transferencias_activas === true,
    detalles_enviados: data?.detalles_enviados === true,
  };
}

async function mensajeFuncion(error: unknown): Promise<string> {
  try {
    const ctx = (error as { context?: Response }).context;
    if (ctx) {
      const cuerpo = await ctx.json();
      if (cuerpo?.error) return String(cuerpo.error);
    }
  } catch {
    // sin detalle
  }
  return (error as { message?: string })?.message ?? 'No se ha podido completar la operación.';
}

export function formatearCents(cents: number): string {
  const [entero, dec] = (cents / 100).toFixed(2).split('.');
  return `${entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${dec} €`;
}