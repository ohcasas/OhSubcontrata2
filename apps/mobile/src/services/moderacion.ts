import { useEffect, useState } from 'react';
import { supabase } from './supabase';

export type TipoContenido = 'publicacion_tablon' | 'ficha_directorio' | 'obra' | 'usuario' | 'mensaje';

export const MOTIVOS_DENUNCIA: { clave: string; etiqueta: string }[] = [
  { clave: 'ofensivo', etiqueta: 'Contenido ofensivo o abusivo' },
  { clave: 'spam', etiqueta: 'Spam o publicidad no deseada' },
  { clave: 'engano', etiqueta: 'Engaño o posible estafa' },
  { clave: 'inapropiado', etiqueta: 'Contenido inapropiado' },
  { clave: 'otro', etiqueta: 'Otro motivo' },
];

export type UsuarioBloqueado = { usuario_id: string; nombre: string; desde: string };

export async function denunciar(tipo: TipoContenido, objetoId: string, motivo: string, detalle: string): Promise<void> {
  const { error } = await supabase.rpc('app_reportar', {
    p_tipo: tipo,
    p_objeto_id: objetoId,
    p_motivo: motivo,
    p_detalle: detalle.trim() === '' ? null : detalle.trim(),
  });
  if (error) throw new Error(error.message);
}

// --- Bloqueos: se guardan en memoria y avisan a las pantallas abiertas para que se actualicen al momento.
let bloqueados: Set<string> = new Set();
let cargado = false;
const oyentes = new Set<(ids: Set<string>) => void>();

function avisar() {
  for (const f of oyentes) f(bloqueados);
}

export async function misBloqueos(): Promise<UsuarioBloqueado[]> {
  const { data, error } = await supabase.rpc('app_mis_bloqueos');
  if (error) throw new Error(error.message);
  const lista = (data as UsuarioBloqueado[] | null) ?? [];
  bloqueados = new Set(lista.map((u) => u.usuario_id));
  cargado = true;
  avisar();
  return lista;
}

export async function bloquearUsuario(usuarioId: string): Promise<void> {
  const { error } = await supabase.rpc('app_bloquear', { p_usuario_id: usuarioId });
  if (error) throw new Error(error.message);
  bloqueados = new Set(bloqueados).add(usuarioId);
  avisar();
}

export async function desbloquearUsuario(usuarioId: string): Promise<void> {
  const { error } = await supabase.rpc('app_desbloquear', { p_usuario_id: usuarioId });
  if (error) throw new Error(error.message);
  const nuevo = new Set(bloqueados);
  nuevo.delete(usuarioId);
  bloqueados = nuevo;
  avisar();
}

/** Usuarios que he bloqueado. Si falla la carga, se muestra todo (nunca rompe la pantalla). */
export function useBloqueados(): Set<string> {
  const [ids, setIds] = useState<Set<string>>(bloqueados);
  useEffect(() => {
    oyentes.add(setIds);
    if (!cargado) {
      misBloqueos().catch(() => undefined);
    } else {
      setIds(bloqueados);
    }
    return () => {
      oyentes.delete(setIds);
    };
  }, []);
  return ids;
}

/** Olvida los bloqueos guardados (al cerrar sesión). */
export function olvidarBloqueos(): void {
  bloqueados = new Set();
  cargado = false;
  avisar();
}