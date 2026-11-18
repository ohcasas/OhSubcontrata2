import * as Sentry from '@sentry/react-native';
import type { ComponentType } from 'react';

/**
 * Aviso de errores de la app (Sentry).
 *
 * - Sin EXPO_PUBLIC_SENTRY_DSN (o con un valor que no empiece por https://) NO hace nada: la app funciona igual.
 * - Solo envía errores y cuelgues. No envía ni correos, ni nombres, ni teléfonos, ni direcciones IP, ni el
 *   contenido de las peticiones a la base de datos (se descartan las cabeceras, las cookies y las direcciones completas).
 * - Se identifica al usuario, como mucho, por un identificador interno (ver identificarUsuario), nunca por su correo.
 */
const DSN = (process.env.EXPO_PUBLIC_SENTRY_DSN ?? '').trim();
export const monitorizacionActiva = DSN.startsWith('https://');

if (monitorizacionActiva) {
  Sentry.init({
    dsn: DSN,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    enableAutoSessionTracking: true,
    attachScreenshot: false,
    // Las llamadas a la red pueden llevar datos personales en la dirección: no se guardan como migas de pan.
    beforeBreadcrumb: (b) => (b.category === 'fetch' || b.category === 'xhr' ? null : b),
    beforeSend: (evento) => {
      if (evento.user) evento.user = evento.user.id ? { id: evento.user.id } : undefined;
      if (evento.request) {
        delete evento.request.headers;
        delete evento.request.cookies;
        delete evento.request.data;
        delete evento.request.query_string;
      }
      return evento;
    },
  });
}

// Prueba de que Sentry recibe avisos: solo se envía si en la compilación se pone EXPO_PUBLIC_SENTRY_PRUEBA = "1".
// Manda un mensaje fijo, sin datos de nadie. Después de comprobarlo, se vuelve a dejar vacío o a "0".
if (monitorizacionActiva && process.env.EXPO_PUBLIC_SENTRY_PRUEBA === '1') {
  Sentry.captureMessage('Prueba de aviso de 3B Conecta: Sentry funciona');
}

/** Envuelve la app para recoger los errores que no se capturan en ningún otro sitio. */
export function envolverApp<P extends object>(Componente: ComponentType<P>): ComponentType<P> {
  return monitorizacionActiva ? (Sentry.wrap(Componente) as ComponentType<P>) : Componente;
}

/** Asocia los errores a un usuario por su identificador interno (nunca el correo). */
export function identificarUsuario(id: string | null): void {
  if (!monitorizacionActiva) return;
  Sentry.setUser(id ? { id } : null);
}

/** Para avisar de un error controlado que conviene conocer. */
export function avisarError(error: unknown): void {
  if (monitorizacionActiva) Sentry.captureException(error);
}