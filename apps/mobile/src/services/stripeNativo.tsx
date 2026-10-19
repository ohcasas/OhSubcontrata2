/**
 * Stripe en el móvil (iOS / Android). En la web existe stripeNativo.web.tsx, que no carga el SDK.
 */
import type { ReactElement } from 'react';
import { StripeProvider, useStripe } from '@stripe/stripe-react-native';
import { STRIPE_PUBLISHABLE_KEY } from '../constants/stripe';

export function StripeRaiz({ children }: { children: ReactElement }) {
  return (
    <StripeProvider publishableKey={STRIPE_PUBLISHABLE_KEY} merchantIdentifier="merchant.es.tresbe.conecta">
      {children}
    </StripeProvider>
  );
}

export type ResultadoHoja = { ok: boolean; cancelado?: boolean; error?: string };

export function useHojaDePago() {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  return async (clientSecret: string): Promise<ResultadoHoja> => {
    const init = await initPaymentSheet({
      paymentIntentClientSecret: clientSecret,
      merchantDisplayName: '3B Conecta',
      returnURL: 'tresbeconecta://pago',
    });
    if (init.error) return { ok: false, error: init.error.message };
    const res = await presentPaymentSheet();
    if (res.error) {
      return res.error.code === 'Canceled' ? { ok: false, cancelado: true } : { ok: false, error: res.error.message };
    }
    return { ok: true };
  };
}