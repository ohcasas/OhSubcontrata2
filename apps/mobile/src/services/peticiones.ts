/**
 * Peticiones de particulares y visitas técnicas (migraciones 0042 a 0044).
 *
 * Todo pasa por funciones de Supabase (app_*) que comprueban quién llama. Las fotos de las
 * visitas van al almacén privado `visitas-tecnicas`, a la carpeta del propio técnico.
 */
import * as DocumentPicker from 'expo-document-picker';
import { supabase } from './supabase';
import { subirArchivoPrivado, obtenerUrlFirmada } from './storage';

const BUCKET_FOTOS = 'visitas-tecnicas';

export type Peticion = {
  id: string;
  referencia: string;
  titulo: string;
  estado: string;
  origen: string;
  ubicacion: string | null;
  revision_motivo: string | null;
  revisar_antes_de: string | null;
  publicada_en: string | null;
  created_at: string;
  visita_estado: string | null;
  visita_fecha: string | null;
};

export type DatosPeticion = {
  titulo: string;
  descripcion: string;
  especialidad: string;
  municipio: string;
  direccion: string;
  telefono: string;
  presupuesto: number;
  dias: number;
  requisitos: string;
  aceptaContacto: boolean;
  aceptaVisita: boolean;
};

export type Visita = {
  visita_id: string;
  obra_id: string;
  referencia: string;
  titulo: string;
  descripcion: string | null;
  ubicacion: string | null;
  direccion: string | null;
  contacto_nombre: string | null;
  contacto_telefono: string | null;
  estado: 'asignada' | 'agendada' | 'realizada' | 'cancelada';
  fecha_visita: string | null;
  resultado: 'apto' | 'ajustar' | 'no_apto' | null;
  informe: string | null;
  fotos: string[];
};

export type ResultadoVisita = 'apto' | 'ajustar' | 'no_apto';
export type FotoElegida = { uri: string; nombre: string; mimeType: string };

/** Traduce los fallos habituales. Los avisos que escribimos en la base de datos (P0001) se muestran tal cual. */
export function mensajeDeError(e: unknown): string {
  const obj = typeof e === 'object' && e !== null ? (e as { message?: unknown; code?: unknown }) : null;
  const mensaje = obj && typeof obj.message === 'string' ? obj.message : e instanceof Error ? e.message : String(e);
  if (obj && obj.code === 'P0001') return mensaje;
  const texto = mensaje.toLowerCase();
  if (texto.includes('mime') || texto.includes('not allowed') || texto.includes('invalid')) {
    return 'Ese tipo de archivo no está permitido. Usa fotos en JPG, PNG o WEBP.';
  }
  if (texto.includes('size') || texto.includes('exceed') || texto.includes('too large') || texto.includes('payload')) {
    return 'Una foto pesa más de 10 MB. Usa una más ligera.';
  }
  if (texto.includes('network') || texto.includes('fetch')) {
    return 'No hay conexión. Comprueba internet e inténtalo de nuevo.';
  }
  return 'No se ha podido completar la operación. Inténtalo de nuevo.';
}

// ───────────────────────── Particular (y empresas): mis peticiones ─────────────────────────
export async function misPeticiones(): Promise<Peticion[]> {
  const { data, error } = await supabase.rpc('app_mis_peticiones');
  if (error) throw error;
  return (data as Peticion[] | null) ?? [];
}

export async function crearPeticion(d: DatosPeticion): Promise<string> {
  const { data, error } = await supabase.rpc('app_crear_peticion_particular', {
    p_titulo: d.titulo,
    p_descripcion: d.descripcion,
    p_especialidad: d.especialidad,
    p_municipio: d.municipio,
    p_direccion: d.direccion,
    p_telefono: d.telefono,
    p_presupuesto: d.presupuesto,
    p_dias_abierta: d.dias,
    p_requisitos: d.requisitos,
    p_acepta_contacto: d.aceptaContacto,
    p_acepta_visita: d.aceptaVisita,
  });
  if (error) throw error;
  return data as string;
}

export async function responderInfo(obraId: string, mensaje: string, descripcion: string | null): Promise<void> {
  const { error } = await supabase.rpc('app_responder_info_peticion', {
    p_obra_id: obraId,
    p_mensaje: mensaje,
    p_descripcion: descripcion,
  });
  if (error) throw error;
}

// ───────────────────────── Técnico: visitas ─────────────────────────
export async function misVisitas(): Promise<Visita[]> {
  const { data, error } = await supabase.rpc('app_tecnico_mis_visitas');
  if (error) throw error;
  return (data as Visita[] | null) ?? [];
}

export async function agendarVisita(visitaId: string, fecha: Date): Promise<void> {
  const { error } = await supabase.rpc('app_tecnico_agendar_visita', {
    p_visita_id: visitaId,
    p_fecha: fecha.toISOString(),
  });
  if (error) throw error;
}

/** Abre la galería para elegir una foto (JPG, PNG o WEBP). Devuelve null si se cancela. */
export async function elegirFoto(): Promise<FotoElegida | null> {
  const r = await DocumentPicker.getDocumentAsync({
    type: ['image/jpeg', 'image/png', 'image/webp'],
    copyToCacheDirectory: true,
  });
  if (r.canceled) return null;
  const a = r.assets[0];
  return { uri: a.uri, nombre: a.name, mimeType: a.mimeType ?? 'image/jpeg' };
}

/** Sube las fotos y registra el informe. Si el registro falla, borra las fotos subidas. */
export async function registrarInforme(
  visitaId: string,
  resultado: ResultadoVisita,
  informe: string,
  fotos: FotoElegida[],
): Promise<void> {
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id;
  if (!userId) throw new Error('No has iniciado sesión.');

  const rutas: string[] = [];
  try {
    for (const f of fotos) {
      rutas.push(await subirArchivoPrivado(BUCKET_FOTOS, userId, f.uri, f.mimeType, f.nombre));
    }
    const { error } = await supabase.rpc('app_tecnico_registrar_informe', {
      p_visita_id: visitaId,
      p_resultado: resultado,
      p_informe: informe,
      p_fotos: rutas,
    });
    if (error) throw error;
  } catch (e) {
    if (rutas.length > 0) await supabase.storage.from(BUCKET_FOTOS).remove(rutas);
    throw e;
  }
}

/** Dirección temporal para ver una foto de una visita. */
export async function urlDeFoto(ruta: string): Promise<string> {
  return obtenerUrlFirmada(BUCKET_FOTOS, ruta);
}