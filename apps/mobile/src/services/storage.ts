import { supabase } from './supabase';

/**
 * Sube una imagen local (la URI que devuelve expo-image-picker) a un
 * bucket público de Supabase Storage y devuelve su URL pública.
 *
 * Usa fetch(uri).arrayBuffer() en vez de pasar el Blob directamente al
 * cliente de Supabase: en React Native, el Blob que devuelve fetch para
 * una URI local no sube bien con supabase-js (problema conocido del
 * entorno RN, no de Supabase) — convertirlo a ArrayBuffer primero lo evita.
 */
export async function subirImagenPublica(
  bucket: string,
  carpeta: string,
  uriLocal: string,
  mimeType: string = 'image/jpeg',
): Promise<string> {
  const respuesta = await fetch(uriLocal);
  const arrayBuffer = await respuesta.arrayBuffer();

  const extension = mimeType.split('/')[1] ?? 'jpg';
  const nombreArchivo = `${carpeta}/${Date.now()}-${Math.round(Math.random() * 1e9)}.${extension}`;

  const { error } = await supabase.storage
    .from(bucket)
    .upload(nombreArchivo, arrayBuffer, { contentType: mimeType, upsert: false });

  if (error) {
    throw error;
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(nombreArchivo);
  return data.publicUrl;
}

/**
 * Sube un archivo cualquiera (PDF, imagen, lo que sea) a un bucket
 * PRIVADO y devuelve la ruta guardada (no una URL — un bucket privado no
 * tiene URL pública). Esa ruta es lo que se guarda en la base de datos
 * (columna `storage_path`); para verlo luego hay que pedir una URL
 * firmada con `obtenerUrlFirmada`.
 */
export async function subirArchivoPrivado(
  bucket: string,
  carpeta: string,
  uriLocal: string,
  mimeType: string,
  nombreOriginal: string,
): Promise<string> {
  const respuesta = await fetch(uriLocal);
  const arrayBuffer = await respuesta.arrayBuffer();

  const extension = nombreOriginal.includes('.') ? nombreOriginal.split('.').pop() : 'bin';
  const nombreArchivo = `${carpeta}/${Date.now()}-${Math.round(Math.random() * 1e9)}.${extension}`;

  const { error } = await supabase.storage
    .from(bucket)
    .upload(nombreArchivo, arrayBuffer, { contentType: mimeType, upsert: false });

  if (error) {
    throw error;
  }
  return nombreArchivo;
}

/**
 * Genera una URL temporal (por defecto, válida 1 hora) para ver/descargar
 * un archivo de un bucket privado. Se pide cada vez que hace falta abrir
 * el archivo — nunca se guarda la URL firmada en la base de datos, porque
 * caduca.
 */
export async function obtenerUrlFirmada(
  bucket: string,
  path: string,
  segundosValidez: number = 3600,
): Promise<string> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, segundosValidez);
  if (error || !data) {
    throw error ?? new Error('No se ha podido generar el enlace del archivo.');
  }
  return data.signedUrl;
}