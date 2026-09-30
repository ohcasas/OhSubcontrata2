import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../services/supabase';

/**
 * Número de notificaciones sin leer del usuario (la política de la base de
 * datos ya limita la consulta a las suyas). Se recalcula cada vez que la
 * pantalla vuelve a estar en foco y, mientras está visible, cada 45 s.
 */
export function useNotificacionesNoLeidas() {
  const [noLeidas, setNoLeidas] = useState(0);

  const recargar = useCallback(async () => {
    const { count } = await supabase
      .from('notificaciones')
      .select('id', { count: 'exact', head: true })
      .eq('leida', false);
    setNoLeidas(count ?? 0);
  }, []);

  useFocusEffect(
    useCallback(() => {
      recargar();
      const id = setInterval(recargar, 45000);
      return () => clearInterval(id);
    }, [recargar]),
  );

  return { noLeidas, recargar };
}