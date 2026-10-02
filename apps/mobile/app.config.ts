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
    bundleIdentifier: 'com.ohcasas.contratas',
    supportsTablet: false,
  },
  android: {
    package: 'com.ohcasas.contratas',
    googleServicesFile: './google-services.json',
    adaptiveIcon: {
      foregroundImage: './assets/branding/adaptive-icon-foreground.png',
      backgroundColor: '#0057FF',
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
        // Desde la migración a la Splash Screen API de Android 12 (que
        // Expo adoptó en la SDK 52), Android ya NO admite una pantalla de
        // carga a pantalla completa — solo un icono centrado sobre un
        // color de fondo. La imagen compuesta (splash.png, con wordmark y
        // fondo decorativo) ya no se puede usar tal cual en Android; se
        // usa solo el icono limpio (adaptive-icon-foreground.png).
        image: './assets/branding/adaptive-icon-foreground.png',
        resizeMode: 'contain',
        imageWidth: 200,
        backgroundColor: '#0057FF',
      },
    ],
  ],
};

export default config;