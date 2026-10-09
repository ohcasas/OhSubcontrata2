/**
 * Documentos de la cuenta y de sus trabajadores (migración 0041).
 *
 * Todo pasa por funciones de Supabase (app_*) que comprueban que la cuenta es la dueña y que
 * está verificada. Los archivos van al almacén privado `documentos-verificacion`, a la carpeta
 * de la propia cuenta (igual que la pantalla de cuenta pendiente).
 */
import * as DocumentPicker from 'expo-document-picker';
import { supabase } from './supabase';
import { subirArchivoPrivado, obtenerUrlFirmada } from './storage';

const BUCKET = 'documentos-verificacion';

export type EstadoReal = 'faltante' | 'pendiente' | 'rechazado' | 'vigente' | 'por_caducar' | 'caducado';

export type DocumentoApp = {
  tipo: string;
  etiqueta: string;
  descripcion: string | null;
  obligatorio: boolean;
  orden: number;
  vigencia_meses: number;
  documento_id: string | null;
  estado: 'pendiente' | 'aprobado' | 'rechazado' | null;
  estado_real: EstadoReal;
  motivo_rechazo: string | null;
  nombre_archivo: string | null;
  storage_path: string | null;
  caduca_en: string | null;
  dias_restantes: number | null;
  puede_renovar: boolean;
  renovacion_pendiente: boolean;
  renovacion_motivo: string | null;
};

export type TrabajadorApp = {
  id: string;
  nombre: string;
  apellidos: string | null;
  dni: string;
  puesto: string | null;
  telefono: string | null;
  email: string | null;
  fecha_alta: string | null;
  activo: boolean;
  notas: string | null;
  requeridos: number;
  aprobados: number;
  pendientes: number;
  rechazados: number;
  caducados: number;
  por_caducar: number;
  faltan: number;
  semaforo: 'verde' | 'ambar' | 'rojo';
  proxima_caducidad: string | null;
};

export type DatosTrabajador = {
  nombre: string;
  apellidos: string;
  dni: string;
  puesto: string;
  telefono: string;
  email: string;
  fecha_alta: string | null;
  activo: boolean;
  notas: string;
};

export type ArchivoElegido = { uri: string; nombre: string; mimeType: string };
export type ResultadoSubida = 'nuevo' | 'reemplazo' | 'renovacion';

async function idUsuario(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  const id = data.user?.id;
  if (!id) throw new Error('No has iniciado sesión.');
  return id;
}

/** Traduce los fallos habituales a algo que se entienda. */
export function mensajeDeError(e: unknown): string {
  const obj = typeof e === 'object' && e !== null ? (e as { message?: unknown; code?: unknown }) : null;
  const mensaje = obj && typeof obj.message === 'string' ? obj.message : e instanceof Error ? e.message : String(e);
  // Los avisos que escribimos nosotros en la base de datos (raise exception) ya vienen en castellano
  if (obj && obj.code === 'P0001') return mensaje;
  const texto = mensaje.toLowerCase();
  if (texto.includes('mime') || texto.includes('not allowed') || texto.includes('invalid')) {
    return 'Ese tipo de archivo no está permitido. Sube un PDF o una foto en JPG o PNG.';
  }
  if (texto.includes('size') || texto.includes('exceed') || texto.includes('too large') || texto.includes('payload')) {
    return 'El archivo pesa más de 10 MB. Sube uno más ligero.';
  }
  if (texto.includes('network') || texto.includes('fetch')) {
    return 'No hay conexión. Comprueba internet e inténtalo de nuevo.';
  }
  return 'No se ha podido completar la operación. Inténtalo de nuevo.';
}

/** Abre el selector de archivos (PDF o imagen). Devuelve null si se cancela. */
export async function elegirArchivo(): Promise<ArchivoElegido | null> {
  const resultado = await DocumentPicker.getDocumentAsync({
    type: ['application/pdf', 'image/*'],
    copyToCacheDirectory: true,
  });
  if (resultado.canceled) return null;
  const a = resultado.assets[0];
  return { uri: a.uri, nombre: a.name, mimeType: a.mimeType ?? 'application/octet-stream' };
}

/** Sube el archivo al almacén y, si el registro falla, lo borra para no dejar archivos huérfanos. */
async function subirYRegistrar(
  archivo: ArchivoElegido,
  registrar: (ruta: string) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<ResultadoSubida> {
  const userId = await idUsuario();
  const ruta = await subirArchivoPrivado(BUCKET, userId, archivo.uri, archivo.mimeType, archivo.nombre);
  const { data, error } = await registrar(ruta);
  if (error) {
    await supabase.storage.from(BUCKET).remove([ruta]);
    throw error;
  }
  return data as ResultadoSubida;
}

// ───────────────────────── Documentos de la cuenta ─────────────────────────
export async function misDocumentos(): Promise<DocumentoApp[]> {
  const { data, error } = await supabase.rpc('app_mis_documentos');
  if (error) throw error;
  return (data as DocumentoApp[] | null) ?? [];
}

export function subirDocumentoCuenta(tipo: string, archivo: ArchivoElegido): Promise<ResultadoSubida> {
  return subirYRegistrar(archivo, (ruta) =>
    supabase.rpc('app_subir_documento_cuenta', {
      p_tipo: tipo,
      p_nombre: archivo.nombre,
      p_ruta: ruta,
      p_mime: archivo.mimeType,
    }),
  );
}

// ───────────────────────── Trabajadores ─────────────────────────
export async function misTrabajadores(): Promise<TrabajadorApp[]> {
  const { data, error } = await supabase.rpc('app_mis_trabajadores');
  if (error) throw error;
  return (data as TrabajadorApp[] | null) ?? [];
}

export async function guardarTrabajador(id: string | null, d: DatosTrabajador): Promise<string> {
  const { data, error } = await supabase.rpc('app_guardar_trabajador', {
    p_id: id,
    p_nombre: d.nombre,
    p_apellidos: d.apellidos,
    p_dni: d.dni,
    p_puesto: d.puesto,
    p_telefono: d.telefono,
    p_email: d.email,
    p_fecha_alta: d.fecha_alta,
    p_activo: d.activo,
    p_notas: d.notas,
  });
  if (error) throw error;
  return data as string;
}

export async function documentosTrabajador(trabajadorId: string): Promise<DocumentoApp[]> {
  const { data, error } = await supabase.rpc('app_documentos_trabajador', { p_trabajador_id: trabajadorId });
  if (error) throw error;
  return (data as DocumentoApp[] | null) ?? [];
}

export function subirDocumentoTrabajador(
  trabajadorId: string,
  tipo: string,
  archivo: ArchivoElegido,
): Promise<ResultadoSubida> {
  return subirYRegistrar(archivo, (ruta) =>
    supabase.rpc('app_subir_documento_trabajador', {
      p_trabajador_id: trabajadorId,
      p_tipo: tipo,
      p_nombre: archivo.nombre,
      p_ruta: ruta,
      p_mime: archivo.mimeType,
    }),
  );
}

/** Dirección temporal (5 minutos) para ver un archivo propio. */
export async function urlDeArchivo(ruta: string): Promise<string> {
  return obtenerUrlFirmada(BUCKET, ruta);
}