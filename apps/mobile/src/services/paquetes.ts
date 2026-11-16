import { supabase } from './supabase';

export type Paquete = {
  codigo: string;
  nombre: string;
  descripcion: string;
  extra_pct: number;
  extra_min_cents: number;
  extra_max_cents: number;
  servicios: string[];
  plazo_revision_horas: number | null;
  recomendado: boolean;
};

export type ResumenCobro = {
  oferta_cents: number;
  recargo_cents: number;
  total_cents: number;
  paquete_codigo: string | null;
  paquete_nombre: string | null;
};

/**
 * Paquetes disponibles para particulares. Devuelve una lista vacía mientras el interruptor
 * «paquetes_activos» esté apagado en el panel (o si falla la consulta): la app se ve como siempre.
 */
export async function paquetesDisponibles(): Promise<Paquete[]> {
  try {
    const { data, error } = await supabase.rpc('app_paquetes');
    if (error) return [];
    return ((data as Paquete[] | null) ?? []).map((p) => ({
      ...p,
      extra_pct: Number(p.extra_pct),
      extra_min_cents: Number(p.extra_min_cents),
      extra_max_cents: Number(p.extra_max_cents),
      servicios: Array.isArray(p.servicios) ? p.servicios : [],
    }));
  } catch {
    return [];
  }
}

export async function elegirPaquete(obraId: string, codigo: string): Promise<void> {
  const { error } = await supabase.rpc('app_elegir_paquete', { p_obra_id: obraId, p_codigo: codigo });
  if (error) throw new Error(error.message);
}

/** Desglose oferta + extra + total antes de pagar. null si no hay oferta aceptada o falla. */
export async function resumenCobro(obraId: string): Promise<ResumenCobro | null> {
  try {
    const { data, error } = await supabase.rpc('app_resumen_cobro', { p_obra_id: obraId });
    if (error || data === null) return null;
    return data as ResumenCobro;
  } catch {
    return null;
  }
}

/** Texto corto del extra: «Gratis», «3 % (mín. 70 €, máx. 400 €)». */
export function textoExtra(p: Paquete): string {
  if (p.extra_pct <= 0) return 'Sin extra';
  const eur = (c: number) => `${Math.round(c / 100)} €`;
  return `${String(p.extra_pct).replace('.', ',')} % · mín. ${eur(p.extra_min_cents)} · máx. ${eur(p.extra_max_cents)}`;
}