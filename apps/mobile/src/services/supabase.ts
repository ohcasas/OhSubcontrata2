/**
 * Cliente de Supabase.
 *
 * Credenciales: NUNCA hardcodeadas. Se leen de variables de entorno públicas
 * de Expo (EXPO_PUBLIC_*), que se rellenan en .env a partir de .env.example
 * una vez creado el proyecto real en supabase.com.
 *
 * La sesión (access/refresh token) se persiste en expo-secure-store
 * (Keychain en iOS, Keystore en Android) — nunca en AsyncStorage plano,
 * tal como se especificó en el informe técnico.
 */
import 'react-native-url-polyfill/auto';
import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Falla pronto y de forma explícita: sin esto, la app no debe arrancar
  // en silencio con un cliente inválido.
  throw new Error(
    'Faltan EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY. ' +
      'Copia .env.example a .env y rellénalas con los valores de tu proyecto de Supabase.',
  );
}

/** Adaptador de almacenamiento seguro para el cliente de Supabase */
const secureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: secureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
