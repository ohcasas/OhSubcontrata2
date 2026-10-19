/** En la web no se carga el SDK de Stripe: el pago se hace desde la app móvil. */
import type { ReactElement } from 'react';

export function StripeRaiz({ children }: { children: ReactElement }) {
  return children;
}

export type ResultadoHoja = { ok: boolean; cancelado?: boolean; error?: string };

export function useHojaDePago() {
  return async (_clientSecret: string): Promise<ResultadoHoja> => ({
    ok: false,
    error: 'Para pagar, abre la app 3B Conecta en tu móvil.',
  });
}