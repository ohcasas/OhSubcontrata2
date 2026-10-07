import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { supabase } from './supabase';

/**
 * Cierra la sesión quitando antes el token de push de ESTE móvil para esa cuenta. Sin esto, el
 * móvil seguiría recibiendo los avisos de la cuenta aunque ya no tuviera la sesión iniciada.
 *
 * Si no se puede quitar (sin conexión, sin permiso...), la sesión se cierra igualmente: el
 * servidor ya garantiza que un móvil pertenece a un único usuario (migración 0038), así que el
 * siguiente inicio de sesión en este móvil se lo quita a la cuenta anterior. Se espera como
 * mucho 4 segundos, para que cerrar sesión nunca se quede colgado.
 */
export async function cerrarSesion(): Promise<void> {
  const quitarToken = async () => {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    if (!Device.isDevice || projectId === undefined) return;
    const { data: usuario } = await supabase.auth.getUser();
    if (usuario.user === null) return;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await supabase.from('push_tokens').delete().eq('user_id', usuario.user.id).eq('token', token);
  };

  await Promise.race([
    quitarToken().catch(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, 4000)),
  ]);
  await supabase.auth.signOut();
}