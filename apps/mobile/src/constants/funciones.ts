/**
 * Interruptores de funciones que se publican por separado del resto de la app.
 *
 * PAGOS_ACTIVOS: pagos con Stripe (pagar la obra, cobrar por tramos, cuenta de cobro del oficio).
 * Déjalo en false hasta que estén decididos el titular de la cuenta de Stripe, la comisión y el IVA,
 * y la build lleve la clave real de Stripe. Para activarlos: ponlo en true y compila una versión nueva.
 */
export const PAGOS_ACTIVOS = false;