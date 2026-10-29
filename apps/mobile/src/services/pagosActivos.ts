import { useEffect, useState } from 'react';
import { supabase } from './supabase';

/**
 * ¿Están activados los pagos? Se decide desde el panel de 3B (Pagos > Pagos en la app), sin compilar
 * otra versión. Mientras no se sepa, o si falla la consulta, se tratan como desactivados.
 * Los administradores los ven siempre (para poder probarlos).
 */
const VIGENCIA_MS = 2 * 60 * 1000;
let cache: { valor: boolean; hasta: number } | null = null;
let pendiente: Promise<boolean> | null = null;

async function leer(): Promise<boolean> {
  if (cache !== null && cache.hasta > Date.now()) return cache.valor;
  if (pendiente === null) {
    pendiente = (async () => {
      try {
        const { data, error } = await supabase.rpc('pagos_activos');
        if (error) return false;
        cache = { valor: data === true, hasta: Date.now() + VIGENCIA_MS };
        return data === true;
      } catch {
        return false;
      } finally {
        pendiente = null;
      }
    })();
  }
  return pendiente;
}

export function usePagosActivos(): boolean {
  const [activos, setActivos] = useState<boolean>(cache !== null && cache.hasta > Date.now() ? cache.valor : false);
  useEffect(() => {
    let vivo = true;
    leer().then((v) => {
      if (vivo) setActivos(v);
    });
    return () => {
      vivo = false;
    };
  }, []);
  return activos;
}

/** Olvida el valor guardado (por ejemplo al cerrar sesión). */
export function olvidarPagosActivos(): void {
  cache = null;
}