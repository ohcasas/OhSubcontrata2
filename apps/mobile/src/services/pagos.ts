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
  /** true = el dinero se libera al oficio por tramos (ver Tramo) */
  con_tramos: boolean;
};

export type EstadoTramo = 'pendiente' | 'terminado_oficio' | 'confirmado_cliente' | 'liberando' | 'liberado' | 'cerrado';

export type Tramo = {
  id: string;
  pago_id: string;
  orden: number;
  titulo: string;
  pct: number;
  importe_cents: number;
  estado: EstadoTramo;
  auto_confirma_at: string | null;
};

/** Un tramo del calendario de cobro que el oficio propone en su oferta. */
export type PlanTramo = { titulo: string; pct: number };

export const PLANES_PAGO: { clave: string; nombre: string; tramos: PlanTramo[] | null }[] = [
  { clave: 'unico', nombre: 'Un solo pago al terminar la obra', tramos: null },
  {
    clave: '50_50',
    nombre: '2 tramos: 50 % + 50 %',
    tramos: [{ titulo: 'Mitad de la obra', pct: 50 }, { titulo: 'Obra terminada', pct: 50 }],
  },
  {
    clave: '30_40_30',
    nombre: '3 tramos: 30 % + 40 % + 30 %',
    tramos: [{ titulo: 'Inicio de obra', pct: 30 }, { titulo: 'Obra a la mitad', pct: 40 }, { titulo: 'Obra terminada', pct: 30 }],
  },
  {
    clave: '25x4',
    nombre: '4 tramos: 25 % cada uno',
    tramos: [
      { titulo: 'Primer cuarto', pct: 25 }, { titulo: 'Mitad de obra', pct: 25 },
      { titulo: 'Tres cuartos', pct: 25 }, { titulo: 'Obra terminada', pct: 25 },
    ],
  },
];

/** "30 % · 40 % · 30 %" o null si el plan es un único pago. */
export function resumenPlan(plan: PlanTramo[] | null | undefined): string | null {
  if (!plan || plan.length < 2) return null;
  return plan.map((t) => `${String(t.pct).replace('.', ',')} %`).join(' · ');
}

export type CuentaCobro = {
  activa: boolean;
  detalles_enviados: boolean;
};

const CAMPOS = 'id, obra_id, estado, importe_cents, comision_cents, comision_pct, auto_confirma_at, disputa_motivo, created_at, con_tramos';

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

/** Tramos de un pago por tramos, en orden. */
export async function tramosDePago(pagoId: string): Promise<Tramo[]> {
  const { data, error } = await supabase
    .from('pago_tramos')
    .select('id, pago_id, orden, titulo, pct, importe_cents, estado, auto_confirma_at')
    .eq('pago_id', pagoId)
    .order('orden', { ascending: true });
  if (error) throw new Error(error.message);
  return (data as Tramo[] | null) ?? [];
}

export async function oficioTerminaTramo(tramoId: string): Promise<void> {
  const { error } = await supabase.rpc('tramo_oficio_termina', { p_tramo_id: tramoId });
  if (error) throw new Error(error.message);
}

export async function clienteConfirmaTramo(tramoId: string): Promise<void> {
  const { error } = await supabase.rpc('tramo_cliente_confirma', { p_tramo_id: tramoId });
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