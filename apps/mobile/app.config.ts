import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'OH Casas — Portal Subcontratas',
  slug: 'oh-casas-subcontratas',
  scheme: 'ohcasas',
  version: '0.0.1',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  // Nota: sin icono/splash propios todavía — pendiente del logo real de
  // OH Casas. Usa el icono por defecto de Expo mientras tanto (evita el
  // aviso "Unable to resolve asset" en vez de apuntar a un PNG que no existe).
  // Nota: en SDK 57 la splash screen ya no se declara aquí — se configura
  // vía el plugin expo-splash-screen (pendiente de añadir cuando haya
  // assets reales de marca; de momento se deja fuera).
  ios: {
    bundleIdentifier: 'es.ohcasas.subcontratas',
    supportsTablet: false,
  },
  android: {
    package: 'es.ohcasas.subcontratas',
    adaptiveIcon: {
      backgroundColor: '#0B192C',
    },
  },
  plugins: ['expo-secure-store'],
};

export default config;
