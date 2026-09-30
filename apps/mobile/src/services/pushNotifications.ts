/**
 * Notificaciones push.
 *
 * Al iniciar sesión, pide permiso, obtiene el token de push de Expo (que
 * internamente habla con FCM en Android y con APNs en iOS — no hace falta
 * llamar a Firebase directamente desde aquí) y lo guarda en `push_tokens`
 * para que el servidor (crear_notificacion(), en Supabase) pueda enviar
 * avisos reales al dispositivo.
 *
 * No funciona en Expo Go desde el SDK 53: hace falta una development build
 * (`eas build --profile development`). En Expo Go, `registrarPush()` no
 * hace nada — no falla, simplemente no hay token que pedir.
 */
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { supabase } from './supabase';

// Cómo se comporta una notificación mientras la app está abierta en primer
// plano: se muestra igual (banner + sonido), no solo en la bandeja.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Pide permiso de notificaciones y, si se concede, guarda el token de este
 * dispositivo asociado al usuario que ha iniciado sesión. Se llama una vez
 * por sesión (ver RootNavigator); no hace falta llamarla más veces.
 */
export async function registrarPush(usuarioId: string): Promise<void> {
  if (!Device.isDevice) return; // los emuladores no reciben push de verdad

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'General',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const permisoActual = await Notifications.getPermissionsAsync();
  let estado = permisoActual.status;
  if (estado !== 'granted') {
    const solicitado = await Notifications.requestPermissionsAsync();
    estado = solicitado.status;
  }
  if (estado !== 'granted') return;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  if (!projectId) return; // sin proyecto EAS todavía no se puede pedir el token

  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    await supabase.from('push_tokens').upsert(
      { user_id: usuarioId, token: data, plataforma: Platform.OS },
      { onConflict: 'user_id,token' },
    );
  } catch {
    // Sin conexión, permiso revocado a mitad, etc. — no es crítico: si
    // falla, sencillamente esta sesión no recibirá push, nada más se rompe.
  }
}