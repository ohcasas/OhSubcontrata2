import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'OH Conecta',
  slug: 'oh-casas-subcontratas',
  owner: 'softwareoh',
  scheme: 'ohcasas',
  version: '0.0.1',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  icon: './assets/branding/icon.png',
  extra: {
    eas: {
      projectId: '229d325c-77bd-4732-8c92-a482abd11b74',
    },
  },
  ios: {
    bundleIdentifier: 'es.ohcasas.subcontratas',
    supportsTablet: false,
  },
  android: {
    package: 'es.ohcasas.subcontratas',
    googleServicesFile: './google-services.json',
    adaptiveIcon: {
      foregroundImage: './assets/branding/adaptive-icon-foreground.png',
      // El logo de OH Conecta es blanco sobre negro: el primer plano es blanco
      // y transparente, así que el fondo tiene que ser oscuro.
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