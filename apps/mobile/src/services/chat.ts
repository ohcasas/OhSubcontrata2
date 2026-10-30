/**
 * Chat de mensajes privados (texto, fotos y audios).
 * Todo pasa por funciones de la base de datos (chat_*): ahí se comprueban los permisos, los bloqueos y las cuentas
 * verificadas. Las fotos y los audios van a un almacén privado y se muestran con enlaces temporales.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import { subirArchivoPrivado, obtenerUrlFirmada } from './storage';

export const BUCKET_CHAT = 'chat-archivos';

export type Conversacion = {
  id: string;
  tipo: 'privado' | 'soporte';
  otro_id: string | null;
  nombre: string;
  ultimo_texto: string | null;
  ultimo_at: string;
  no_leidos: number;
};

export type MensajeChat = {
  id: string;
  conversacion_id: string;
  emisor_id: string | null;
  tipo: 'texto' | 'imagen' | 'audio';
  texto: string | null;
  archivo_path: string | null;
  duracion_seg: number | null;
  created_at: string;
};

export type PersonaChat = { id: string; nombre: string; rol: string; estado_cuenta: string };

export const ETIQUETA_ROL: Record<string, string> = {
  promotor: 'Promotor',
  constructora: 'Constructora',
  arquitecto: 'Arquitecto',
  proveedor: 'Proveedor',
  profesional: 'Profesional',
  administrador: 'Inmobiliaria',
  subcontratista: 'Subcontratista',
  referidor: 'Referidor',
  particular: 'Particular',
  tecnico: 'Técnico',
};

export async function misConversaciones(): Promise<Conversacion[]> {
  const { data, error } = await supabase.rpc('chat_mis_conversaciones');
  if (error) throw new Error(error.message);
  return ((data as Conversacion[] | null) ?? []).map((c) => ({ ...c, no_leidos: Number(c.no_leidos) }));
}

export async function abrirConversacion(usuarioId: string): Promise<string> {
  const { data, error } = await supabase.rpc('chat_abrir', { p_usuario_id: usuarioId });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function abrirChatAdministracion(): Promise<string> {
  const { data, error } = await supabase.rpc('chat_soporte_propio');
  if (error) throw new Error(error.message);
  return data as string;
}

export async function buscarPersonas(texto: string): Promise<PersonaChat[]> {
  const { data, error } = await supabase.rpc('chat_usuarios', { p_buscar: texto.trim() === '' ? null : texto.trim(), p_limite: 60 });
  if (error) throw new Error(error.message);
  return (data as PersonaChat[] | null) ?? [];
}

export async function marcarLeido(conversacionId: string): Promise<void> {
  await supabase.rpc('chat_marcar_leido', { p_conv: conversacionId });
}

export async function cargarMensajes(conversacionId: string): Promise<MensajeChat[]> {
  const { data, error } = await supabase
    .from('chat_mensajes')
    .select('id, conversacion_id, emisor_id, tipo, texto, archivo_path, duracion_seg, created_at')
    .eq('conversacion_id', conversacionId)
    .order('created_at', { ascending: false })
    .limit(150);
  if (error) throw new Error(error.message);
  return (data as MensajeChat[] | null) ?? [];
}

async function enviar(
  conversacionId: string,
  tipo: 'texto' | 'imagen' | 'audio',
  texto: string | null,
  ruta: string | null,
  duracion: number | null,
): Promise<void> {
  const { error } = await supabase.rpc('chat_enviar', {
    p_conv: conversacionId,
    p_tipo: tipo,
    p_texto: texto,
    p_archivo_path: ruta,
    p_duracion: duracion,
  });
  if (error) throw new Error(error.message);
}

export const enviarTexto = (conv: string, texto: string) => enviar(conv, 'texto', texto, null, null);

export async function enviarFoto(conv: string, uri: string, mime: string): Promise<void> {
  const ext = mime.includes('png') ? 'png' : 'jpg';
  const ruta = await subirArchivoPrivado(BUCKET_CHAT, conv, uri, mime, `foto.${ext}`);
  await enviar(conv, 'imagen', null, ruta, null);
}

export async function enviarAudio(conv: string, uri: string, segundos: number): Promise<void> {
  const ruta = await subirArchivoPrivado(BUCKET_CHAT, conv, uri, 'audio/mp4', 'audio.m4a');
  await enviar(conv, 'audio', null, ruta, Math.max(1, Math.min(300, Math.round(segundos))));
}

// Enlaces temporales de archivos (se guardan en memoria mientras sirvan)
const cacheUrls = new Map<string, { url: string; caduca: number }>();
export async function urlArchivo(ruta: string): Promise<string> {
  const guardada = cacheUrls.get(ruta);
  if (guardada !== undefined && guardada.caduca > Date.now()) return guardada.url;
  const url = await obtenerUrlFirmada(BUCKET_CHAT, ruta, 3600);
  cacheUrls.set(ruta, { url, caduca: Date.now() + 50 * 60 * 1000 });
  return url;
}

/** Mensajes de una conversación, al instante: se cargan y luego llegan los nuevos sin recargar. */
export function useMensajes(conversacionId: string) {
  const [mensajes, setMensajes] = useState<MensajeChat[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    try {
      const lista = await cargarMensajes(conversacionId);
      setMensajes(lista);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se han podido cargar los mensajes.');
    } finally {
      setCargando(false);
    }
  }, [conversacionId]);

  useEffect(() => {
    recargar();
    const canal = supabase
      .channel(`chat-${conversacionId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_mensajes', filter: `conversacion_id=eq.${conversacionId}` },
        (cambio) => {
          const nuevo = cambio.new as MensajeChat;
          setMensajes((previos) => (previos.some((m) => m.id === nuevo.id) ? previos : [nuevo, ...previos]));
        },
      )
      .subscribe();
    // Respaldo por si se pierde la conexión en tiempo real
    const reloj = setInterval(recargar, 20000);
    return () => {
      clearInterval(reloj);
      supabase.removeChannel(canal);
    };
  }, [conversacionId, recargar]);

  return { mensajes, cargando, error, recargar };
}

// --- Contador de mensajes sin leer (pestaña Mensajes) ---
const oyentesNoLeidos = new Set<(n: number) => void>();
let noLeidosActual = 0;

export async function refrescarNoLeidos(): Promise<void> {
  const { data, error } = await supabase.rpc('chat_no_leidos');
  if (error) return;
  noLeidosActual = Number(data ?? 0);
  for (const f of oyentesNoLeidos) f(noLeidosActual);
}

export function useChatNoLeidos(): number {
  const [n, setN] = useState(noLeidosActual);
  const montado = useRef(true);
  useEffect(() => {
    montado.current = true;
    oyentesNoLeidos.add(setN);
    refrescarNoLeidos();
    const reloj = setInterval(refrescarNoLeidos, 30000);
    // Cada mensaje nuevo que me llega actualiza el contador (la base de datos solo envía los de mis conversaciones)
    const canal = supabase
      .channel('chat-no-leidos')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_mensajes' }, () => {
        refrescarNoLeidos();
      })
      .subscribe();
    return () => {
      montado.current = false;
      oyentesNoLeidos.delete(setN);
      clearInterval(reloj);
      supabase.removeChannel(canal);
    };
  }, []);
  return n;
}