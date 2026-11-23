/**
 * Recuerda, en este dispositivo y para esta cuenta, si ya se enseñó el
 * tutorial de bienvenida. Si no se puede leer o escribir, no se enseña
 * automáticamente (mejor no molestar que repetirlo cada vez).
 */
import * as SecureStore from 'expo-secure-store';

const clave = (userId: string) => `tutorial_visto_v1_${userId.replace(/[^A-Za-z0-9._-]/g, '')}`;

export async function tutorialYaVisto(userId: string): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(clave(userId))) !== null;
  } catch {
    return true;
  }
}

export async function marcarTutorialVisto(userId: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(clave(userId), '1');
  } catch {
    // sin efecto: se volverá a ofrecer, no es grave
  }
}