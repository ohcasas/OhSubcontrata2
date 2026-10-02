/**
 * Clave pública de Stripe (publishable key) — no es secreta, está pensada
 * para ir en el cliente. La clave secreta NUNCA va aquí ni en ningún
 * archivo de la app: se pone directamente en Supabase (variables de una
 * Edge Function), el día que se conecte el cobro real.
 *
 * De momento, esta clave no se usa todavía en ningún sitio — está lista
 * para cuando se añada el SDK de Stripe (@stripe/stripe-react-native) y
 * la pantalla de pago de verdad.
 */
export const STRIPE_PUBLISHABLE_KEY =
  process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ??
  'pk_test_51UM1m7BFOIVct6NEFCnmfxHmDkA4xTNgDmFSqKNSdCJBSC5EVtBuaqYl0njDBqshQgotBN7GvkqztIWgBgrdip4A00yfDxocwb';