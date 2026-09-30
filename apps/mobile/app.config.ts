import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'OH Contratas',
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
        image: './assets/branding/splash.png',
        // El PNG ya es una pantalla de carga completa (fondo, logo y
        // wordmark ya compuestos), no un icono suelto sobre fondo liso —
        // por eso "cover" (llena la pantalla) y no imageWidth (que la
        // encogería a un recuadro diminuto).
        resizeMode: 'cover',
        backgroundColor: '#F8FAFD',
      },
    ],
  ],
};

export default config;