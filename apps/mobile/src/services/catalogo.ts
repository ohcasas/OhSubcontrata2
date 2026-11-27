/**
 * Catálogo de precios para particulares (migración 0094).
 *
 * Cada línea del pedido lleva su propio «con / sin materiales» (migración 0103).
 * Todo pasa por funciones de Supabase que comprueban quién llama. El servidor calcula la estimación con los
 * precios publicados por Administración: esta app NUNCA envía precios, solo partidas, acabado y cantidad.
 * Mientras el catálogo esté apagado en Supabase (ajustes_catalogo.activo), no se muestra nada.
 */
import { supabase } from './supabase';

export type Modalidad = 'mano_obra_materiales' | 'solo_mano_obra';
export type Acabado = 'unico' | 'basico' | 'medio' | 'alto';

export type CategoriaCatalogo = {
  codigo: string;
  nombre: string;
  icono: string;
  es_formulario: boolean;
  orden: number;
};

export type PrecioPartida = {
  acabado: Acabado;
  modalidad: Modalidad;
  bajo: number;
  ref: number;
  alto: number;
};

export type PartidaCatalogo = {
  id: string;
  categoria: string;
  subcategoria: string | null;
  nombre: string;
  descripcion: string;
  incluye: string | null;
  unidad: string;
  cantidad_defecto: number;
  cantidad_min: number;
  cantidad_max: number;
  /** Icono propio de la partida (lo elige Administración); si falta se usa el de la categoría. */
  icono?: string | null;
  precios: PrecioPartida[] | null;
};

/** Lo único que se envía al servidor de cada partida de la cesta. */
export type LineaCesta = {
  partida_id: string;
  nombre: string;
  unidad: string;
  acabado: Acabado;
  /** Con o sin materiales, elegido en CADA línea (migración 0103). */
  modalidad: Modalidad;
  /** Modalidades que tienen precio publicado para este acabado (para poder cambiar en la cesta). */
  modalidades: Modalidad[];
  cantidad: number;
  cantidad_min: number;
  cantidad_max: number;
  icono?: string | null;
  categoria?: string;
};

export type LineaEstimada = {
  partida_id: string;
  nombre: string;
  unidad: string;
  acabado: Acabado;
  modalidad?: Modalidad;
  cantidad: number;
  precio_bajo: number | null;
  precio_alto: number | null;
  subtotal_bajo: number | null;
  subtotal_alto: number | null;
  sin_precio: boolean;
};

export type Estimacion = {
  lineas: LineaEstimada[];
  total_bajo: number;
  total_alto: number;
  parcial: boolean;
};

export type TipoTrabajo = 'reforma' | 'ampliacion' | 'exterior' | 'reparacion' | 'otro';
export type PlazoProyecto = 'urgente' | '1_mes' | '3_meses' | 'sin_prisa';

export const ETIQUETA_ACABADO: Record<Acabado, string> = {
  unico: 'Único',
  basico: 'Básico',
  medio: 'Medio',
  alto: 'Alto',
};

/** ¿Está encendido el catálogo? Si la función no existe todavía o falla, se considera apagado. */
export async function catalogoActivo(): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('catalogo_activo');
    return !error && data === true;
  } catch {
    return false;
  }
}

export async function listarCategorias(): Promise<CategoriaCatalogo[]> {
  const { data, error } = await supabase
    .from('catalogo_categorias')
    .select('codigo, nombre, icono, es_formulario, orden')
    .eq('activa', true)
    .order('orden', { ascending: true });
  if (error) throw error;
  return (data ?? []) as CategoriaCatalogo[];
}

export async function listarPartidas(categoria: string): Promise<PartidaCatalogo[]> {
  const { data, error } = await supabase.rpc('catalogo_listar', { p_categoria: categoria, p_busqueda: null });
  if (error) throw error;
  return (Array.isArray(data) ? data : []) as PartidaCatalogo[];
}

/** Lo único que viaja al servidor de cada línea: partida, acabado, con/sin materiales y cantidad (nunca precios). */
const lineasParaServidor = (lineas: LineaCesta[]) =>
  lineas.map((l) => ({ partida_id: l.partida_id, acabado: l.acabado, modalidad: l.modalidad, cantidad: l.cantidad }));

export async function estimarCesta(lineas: LineaCesta[]): Promise<Estimacion> {
  const { data, error } = await supabase.rpc('catalogo_estimar', {
    p_lineas: lineasParaServidor(lineas),
    p_modalidad: null,
  });
  if (error) throw error;
  return data as Estimacion;
}

export async function enviarSolicitudCatalogo(lineas: LineaCesta[]): Promise<string> {
  const { data, error } = await supabase.rpc('catalogo_enviar_solicitud', {
    p_tipo: 'catalogo',
    p_modalidad: null,
    p_lineas: lineasParaServidor(lineas),
  });
  if (error) throw error;
  return data as string;
}

export async function enviarSolicitudPersonalizada(datos: {
  descripcion: string;
  tipoTrabajo: TipoTrabajo | null;
  superficie: number | null;
  plazo: PlazoProyecto | null;
}): Promise<string> {
  const { data, error } = await supabase.rpc('catalogo_enviar_solicitud', {
    p_tipo: 'personalizado',
    p_descripcion: datos.descripcion,
    p_tipo_trabajo: datos.tipoTrabajo,
    p_superficie: datos.superficie,
    p_plazo: datos.plazo,
  });
  if (error) throw error;
  return data as string;
}
/** Un proveedor escribe a 3B Conecta sobre una partida (o en general). No se envía ningún correo: lo ve Administración en el panel. */
export async function contactarCatalogo(partidaId: string | null, mensaje: string): Promise<string> {
  const { data, error } = await supabase.rpc('catalogo_contactar', { p_partida: partidaId, p_mensaje: mensaje });
  if (error) throw error;
  return data as string;
}