import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Linking, AppState } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../design-system/tokens';
import { estadoCuentaCobro, prepararCuentaCobro } from '../services/pagos';

/** Tarjeta para que el oficio configure dónde cobra (Stripe). Se muestra en el perfil. */
export default function CuentaCobro({ empresaId }: { empresaId: string }) {
  const [activa, setActiva] = useState<boolean | null>(null);
  const [empezada, setEmpezada] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const c = await estadoCuentaCobro(empresaId);
    setActiva(c.activa);
    setEmpezada(c.detalles_enviados);
  }, [empresaId]);

  useEffect(() => {
    cargar();
    // Al volver de Stripe, se refresca el estado
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') cargar(); });
    return () => sub.remove();
  }, [cargar]);

  const configurar = async () => {
    setTrabajando(true);
    setError(null);
    try {
      const r = await prepararCuentaCobro();
      if (r.url) await Linking.openURL(r.url);
      await cargar();
    } catch (e) {
      setError((e as Error).message);
    }
    setTrabajando(false);
  };

  if (activa === null) return null;

  return (
    <View className="bg-surface rounded-xl border border-border p-4 mb-4">
      <View className="flex-row items-center mb-1.5" style={{ gap: 8 }}>
        <Feather name={activa ? 'check-circle' : 'credit-card'} size={16} color={activa ? colors.success : colors.action} />
        <Text className="text-ink text-sm font-sansBold flex-1">Cuenta de cobro</Text>
      </View>
      <Text className="text-inkMuted text-xs">
        {activa
          ? 'Tu cuenta está lista para recibir pagos de las obras.'
          : empezada
            ? 'Falta completar algún dato en Stripe para poder cobrar.'
            : 'Para cobrar las obras necesitas dar de alta tu cuenta de cobro. Es gratis y se hace una sola vez en Stripe.'}
      </Text>
      {error !== null && <Text className="text-error text-xs mt-2">{error}</Text>}
      {!activa && (
        <Pressable onPress={configurar} disabled={trabajando} className="bg-action rounded-lg py-2.5 items-center mt-3">
          {trabajando ? <ActivityIndicator color="#FFFFFF" /> : (
            <Text className="text-white text-xs font-sansBold">{empezada ? 'Completar datos' : 'Configurar cuenta de cobro'}</Text>
          )}
        </Pressable>
      )}
    </View>
  );
}