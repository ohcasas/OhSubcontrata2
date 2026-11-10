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

/** Resultado de iniciar el pago: o hay secreto para la hoja de pago, o falta firmar el encargo. */
export type InicioPago =
  | { requiereFirma: false; pagoId: string; clientSecret: string }
  | { requiereFirma: true; pagoId: string; contratoId: string };

/** Crea el cobro en Stripe y devuelve el secreto que necesita la hoja de pago.
 *  Si el cliente aún no ha firmado el encargo, devuelve requiereFirma. */
export async function iniciarPago(obraId: string): Promise<InicioPago> {
  const { data, error } = await supabase.functions.invoke('stripe-crear-pago', { body: { obra_id: obraId } });
  if (error) throw new Error(await mensajeFuncion(error));
  if (data?.error) throw new Error(data.error);
  if (data?.requiere_firma === true) {
    return { requiereFirma: true, pagoId: data.pago_id, contratoId: data.contrato_id };
  }
  return { requiereFirma: false, pagoId: data.pago_id, clientSecret: data.client_secret };
}

export type TipoContrato = 'encargo' | 'conformidad';

export type Contrato = {
  id: string;
  tipo: TipoContrato;
  estado: 'pendiente' | 'firmado' | 'tacito' | 'anulado';
  titulo: string;
  cuerpo: string;
  hash: string;
  firmado_at: string | null;
  firmante_nombre: string | null;
  tramo_id: string | null;
};

/** Contrato que el cliente tiene que leer y firmar (o null si no hay plantilla activa). */
export async function contratoObtener(pagoId: string, tipo: TipoContrato, tramoId?: string): Promise<Contrato | null> {
  const { data, error } = await supabase.rpc('contrato_obtener', {
    p_pago_id: pagoId,
    p_tipo: tipo,
    p_tramo_id: tramoId ?? null,
  });
  if (error) throw new Error(error.message);
  return (data as Contrato | null) ?? null;
}

/** Firma electrónica simple. Con la conformidad, la obra o el tramo se confirma en el mismo paso. */
export async function firmarContrato(contratoId: string, nombre: string, acepto: boolean): Promise<void> {
  const { error } = await supabase.rpc('firmar_contrato', {
    p_contrato_id: contratoId,
    p_nombre: nombre,
    p_acepto: acepto,
  });
  if (error) throw new Error(error.message);
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

/** El cliente cancela un pago que todavía no ha pagado (anula también el cobro en Stripe). */
export async function cancelarPago(pagoId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('stripe-cancelar-pago', { body: { pago_id: pagoId } });
  if (error) throw new Error(await mensajeFuncion(error));
  if (data?.error) throw new Error(data.error);
}

/** Cliente u oficio piden devolver el pago. No mueve dinero: se congela y 3B decide. */
export async function solicitarReembolso(pagoId: string, motivo: string): Promise<void> {
  const { error } = await supabase.rpc('pago_solicitar_reembolso', { p_pago_id: pagoId, p_motivo: motivo });
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Historial de pagos y contratos firmados
// ---------------------------------------------------------------------------

export type TramoResumen = {
  id: string;
  orden: number;
  titulo: string;
  pct: number;
  importe_cents: number;
  estado: EstadoTramo;
  liberado_at: string | null;
  /** Solo en el historial del oficio */
  comision_cents?: number;
  neto_cents?: number;
};

export type ResumenPago = {
  pago_id: string;
  obra_id: string;
  obra_titulo: string | null;
  estado: EstadoPago;
  con_tramos: boolean;
  importe_cents: number;
  creado_at: string;
  pagado_at: string | null;
  liberado_at: string | null;
  importe_reembolso_cents: number | null;
  reembolso_solicitado_at: string | null;
  tramos: TramoResumen[];
  /** Solo en el historial del oficio (comisión de 3B ya descontada en neto) */
  comision_pct?: number | null;
  comision_cents?: number;
  neto_cents?: number;
  cobrado_cents?: number;
  retenido_cents?: number;
  comision_cobrada_cents?: number;
  /** Solo en el historial del cliente: lo ya entregado al oficio */
  entregado_cents?: number;
};

export type HistorialOficio = {
  cobrado_cents: number;
  retenido_cents: number;
  comision_cents: number;
  pagos: ResumenPago[];
};

export async function historialOficio(): Promise<HistorialOficio> {
  const { data, error } = await supabase.rpc('oficio_historial_pagos');
  if (error) throw new Error(error.message);
  return data as HistorialOficio;
}

export async function historialCliente(): Promise<ResumenPago[]> {
  const { data, error } = await supabase.rpc('cliente_historial_pagos');
  if (error) throw new Error(error.message);
  return ((data as { pagos?: ResumenPago[] } | null)?.pagos) ?? [];
}

export type ContratoFirmado = {
  id: string;
  tipo: TipoContrato;
  estado: 'firmado' | 'tacito';
  titulo: string;
  cuerpo: string;
  hash: string;
  firmante_nombre: string | null;
  firmado_at: string | null;
  tramo_titulo: string | null;
  created_at: string;
};

/** Contratos firmados de un pago (los puede ver el cliente y el oficio de ese pago). */
export async function contratosDePago(pagoId: string): Promise<ContratoFirmado[]> {
  const { data, error } = await supabase.rpc('contratos_de_pago', { p_pago_id: pagoId });
  if (error) throw new Error(error.message);
  return (data as ContratoFirmado[] | null) ?? [];
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