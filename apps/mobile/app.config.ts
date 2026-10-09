import type { ExpoConfig } from 'expo/config';

/**
 * 3B Conecta: configuración de la app.
 *
 * Antes de compilar hay que rellenar a mano lo marcado con REEMPLAZAR:
 *  - owner: sin poner; Expo usa la cuenta con la que se haya hecho `eas login`.
 *  - extra.eas.projectId: lo da `eas init` (ver el comentario más abajo).
 *  - El identificador (package / bundleIdentifier) queda fijado para siempre en cuanto se sube
 *    la primera versión a Google Play: confirmarlo antes. Un segmento no puede empezar por un
 *    número, por eso no es "3b".
 *  - google-services.json: tiene que ser el de un proyecto de Firebase de 3B con la app
 *    registrada con ESTE package (si no, las notificaciones push no llegan).
 */
const config: ExpoConfig = {
  name: '3B Conecta',
  slug: '3b-conecta',
  scheme: 'tresbeconecta',
  version: '0.0.1',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  icon: './assets/branding/icon.png',
  // extra.eas.projectId: lo escribe `eas init`; si no puede, se pega aquí a mano:
  // extra: { eas: { projectId: '...' } },
  ios: {
    bundleIdentifier: 'es.tresbe.conecta',
    supportsTablet: false,
  },
  android: {
    package: 'es.tresbe.conecta',
    googleServicesFile: './google-services.json',
    adaptiveIcon: {
      foregroundImage: './assets/branding/adaptive-icon-foreground.png',
      // El logo de 3B es blanco sobre negro: el primer plano es blanco y transparente, así que el fondo tiene que ser oscuro.
      backgroundColor: '#000000',
    },
  },
  plugins: [
    'expo-secure-store',
    [
      'expo-notifications',
      {
        icon: './assets/branding/adaptive-icon-foreground.png',
        color: '#0057FF',
      },
    ],
    [
      'expo-splash-screen',
      {
        // Desde Android 12 (Splash Screen API, que Expo adoptó en la SDK 52) la
        // pantalla de carga NATIVA solo puede ser un icono sobre un color liso;
        // no admite una imagen a pantalla completa. Por eso la nativa se deja en
        // negro y SIN icono (un PNG transparente), y la composición con el logo y
        // los dibujos arquitectónicos la pinta, justo después, el componente
        // src/components/PantallaCarga.tsx (con la imagen splash-conecta.png).
        image: './assets/branding/splash-nativo.png',
        resizeMode: 'contain',
        imageWidth: 200,
        backgroundColor: '#000000',
      },
    ],
  ],
};

export default config;