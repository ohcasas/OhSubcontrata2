import type { ExpoConfig } from 'expo/config';

/**
 * 3B Conecta: configuración de la app.
 *
 * Antes de compilar hay que rellenar a mano lo marcado con REEMPLAZAR:
 *  - owner: la cuenta de Expo (expo.dev) de 3B, NO la de OH Casas ("softwareoh").
 *  - extra.eas.projectId: lo escribe solo `npx eas init` al ejecutarlo con la cuenta de 3B.
 *  - El identificador (package / bundleIdentifier) queda fijado para siempre en cuanto se sube
 *    la primera versión a Google Play: confirmarlo antes. Un segmento no puede empezar por un
 *    número, por eso no es "3b".
 *  - google-services.json: tiene que ser el de un proyecto de Firebase de 3B con la app
 *    registrada con ESTE package (si no, las notificaciones push no llegan).
 */
const config: ExpoConfig = {
  name: '3B Conecta',
  slug: '3b-conecta',
  owner: 'REEMPLAZAR',
  scheme: 'tresbeconecta',
  version: '0.0.1',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  icon: './assets/branding/icon.png',
  extra: {
    eas: {
      // REEMPLAZAR: lo genera `npx eas init`
      projectId: 'REEMPLAZAR',
    },
  },
  ios: {
    bundleIdentifier: 'es.tresbe.conecta',
    supportsTablet: false,
  },
  android: {
    package: 'es.tresbe.conecta',
    googleServicesFile: './google-services.json',
    adaptiveIcon: {
      foregroundImage: './assets/branding/adaptive-icon-foreground.png',
      // Se ajustará cuando esté el logo definitivo de 3B (ahora, el fondo del icono de OH).
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