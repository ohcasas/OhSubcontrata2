import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { LineaCesta, Modalidad } from '../../services/catalogo';

type CestaValor = {
  cesta: LineaCesta[];
  anadir: (linea: LineaCesta) => void;
  cambiarCantidad: (i: number, cantidad: number) => void;
  cambiarModalidad: (i: number, modalidad: Modalidad) => void;
  quitar: (i: number) => void;
  vaciar: () => void;
};

const Ctx = createContext<CestaValor | null>(null);

/**
 * El pedido (cesta) se comparte entre las pestañas Inicio, Buscar y Pedido, como en Uber: lo que añades en una
 * se ve en las demás. Vive solo en la memoria de la app; no se guarda nada hasta que se envía la petición.
 */
export function CestaProvider({ children }: { children: ReactNode }) {
  const [cesta, setCesta] = useState<LineaCesta[]>([]);

  // Si la misma partida, acabado y modalidad ya está en el pedido, se suma la cantidad (sin pasarse del máximo)
  const anadir = useCallback((linea: LineaCesta) => {
    setCesta((c) => {
      const i = c.findIndex((x) => x.partida_id === linea.partida_id && x.acabado === linea.acabado && x.modalidad === linea.modalidad);
      if (i === -1) return [...c, linea];
      const copia = [...c];
      copia[i] = { ...copia[i], cantidad: Math.min(copia[i].cantidad_max, Math.round((copia[i].cantidad + linea.cantidad) * 100) / 100) };
      return copia;
    });
  }, []);
  const cambiarCantidad = useCallback((i: number, cantidad: number) => setCesta((c) => c.map((x, k) => (k === i ? { ...x, cantidad } : x))), []);
  const cambiarModalidad = useCallback((i: number, modalidad: Modalidad) => setCesta((c) => c.map((x, k) => (k === i ? { ...x, modalidad } : x))), []);
  const quitar = useCallback((i: number) => setCesta((c) => c.filter((_, k) => k !== i)), []);
  const vaciar = useCallback(() => setCesta([]), []);

  const valor = useMemo(
    () => ({ cesta, anadir, cambiarCantidad, cambiarModalidad, quitar, vaciar }),
    [cesta, anadir, cambiarCantidad, cambiarModalidad, quitar, vaciar],
  );
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useCesta(): CestaValor {
  const v = useContext(Ctx);
  if (v === null) throw new Error('useCesta debe usarse dentro de CestaProvider');
  return v;
}

/** Número de partidas del pedido (para el globo de la pestaña). */
export function useCestaCantidad(): number {
  return useCesta().cesta.length;
}