import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from './supabase';

export type EstadoVersion = {
  nivel: 'ok' | 'recomendada' | 'obligatoria';
  urlTienda: string | null;
  mensaje: string | null;
};

const URL_TIENDA_ANDROID = 'https://play.google.com/store/apps/details?id=es.tresbe.conecta';

/** Compara "1.2.0" con "1.10": devuelve <0, 0 o >0. Los trozos que faltan cuentan como 0. */
export function compararVersiones(a: string, b: string): number {
  const pa = a.split('.').map((x) => parseInt(x, 10) || 0);
  const pb = b.split('.').map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * Consulta si esta versión de la app hay que actualizarla. Ante cualquier fallo (sin conexión,
 * tabla sin crear, datos raros) devuelve 'ok': nunca se bloquea a nadie por un error.
 */
export async function comprobarVersionApp(): Promise<EstadoVersion> {
  const sinCambios: EstadoVersion = { nivel: 'ok', urlTienda: null, mensaje: null };
  try {
    const instalada = Constants.expoConfig?.version;
    const plataforma = Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : null;
    if (!instalada || !plataforma) return sinCambios;
    const { data, error } = await supabase
      .from('app_version_config')
      .select('version_minima,version_recomendada,url_tienda,mensaje')
      .eq('plataforma', plataforma)
      .maybeSingle();
    if (error || !data) return sinCambios;
    const url = (data.url_tienda as string | null) ?? (plataforma === 'android' ? URL_TIENDA_ANDROID : null);
    const mensaje = (data.mensaje as string | null) ?? null;
    if (compararVersiones(instalada, data.version_minima as string) < 0) return { nivel: 'obligatoria', urlTienda: url, mensaje };
    if (compararVersiones(instalada, data.version_recomendada as string) < 0) return { nivel: 'recomendada', urlTienda: url, mensaje };
    return sinCambios;
  } catch {
    return sinCambios;
  }
}