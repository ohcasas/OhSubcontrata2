/**
 * Tarjeta flotante de comisión pendiente.
 *
 * La idea que pidió el jefe de Ainhoa: algo parecido a los avisos
 * flotantes de apps de compra (Temu y similares), pero sencillo — sin
 * animaciones llamativas ni presión artificial. Aparece sola, una vez por
 * sesión como máximo, cuando hay una comisión real esperando respuesta.
 *
 * Vive montada en RootNavigator, por encima de toda la navegación, así
 * que aparece sin importar en qué pantalla esté la persona.
 */
import { useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../services/supabase';
import { colors } from '../design-system/tokens';
import { formatearMoneda } from '../utils/moneda';

type RecompensaPendiente = {
  id: string;
  importe: number;
  porcentaje: number;
  base_imponible: number;
  referencias_comerciales: { nombre_cliente: string } | null;
};

export default function TarjetaComisionFlotante({ userId }: { userId: string }) {
  const insets = useSafeAreaInsets();
  const [pendiente, setPendiente] = useState<RecompensaPendiente | null>(null);
  const [oculta, setOculta] = useState(false);
  const [aceptando, setAceptando] = useState(false);

  useEffect(() => {
    let activo = true;
    supabase
      .from('recompensas_referido')
      .select('id, importe, porcentaje, base_imponible, referencias_comerciales(nombre_cliente)')
      .eq('referidor_id', userId)
      .eq('estado', 'pendiente')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (activo) setPendiente(data as unknown as RecompensaPendiente | null);
      });
    return () => {
      activo = false;
    };
  }, [userId]);

  if (pendiente === null || oculta) return null;

  const handleAceptar = async () => {
    setAceptando(true);
    const { error } = await supabase.rpc('aceptar_comision_referido', { p_comision_id: pendiente.id });
    setAceptando(false);
    if (!error) setOculta(true);
  };

  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: 0, right: 0, bottom: insets.bottom + 72, paddingHorizontal: 16 }}
    >
      <View
        className="bg-surface rounded-2xl border border-border p-4"
        style={{
          shadowColor: colors.ink,
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.16,
          shadowRadius: 18,
          elevation: 10,
        }}
      >
        <View className="flex-row items-start justify-between">
          <View className="flex-row items-center gap-2 flex-1 pr-2">
            <View className="w-9 h-9 rounded-full bg-goldTint items-center justify-center">
              <Feather name="gift" size={16} color={colors.gold} />
            </View>
            <Text className="text-ink text-sm font-sansBold flex-1">
              ¡Tu recomendación de {pendiente.referencias_comerciales?.nombre_cliente ?? 'tu cliente'} se ha
              completado!
            </Text>
          </View>
          <Pressable onPress={() => setOculta(true)} hitSlop={8}>
            <Feather name="x" size={16} color={colors.inkMuted} />
          </Pressable>
        </View>

        <Text className="text-inkMuted text-xs mt-2">
          Te corresponden{' '}
          <Text className="text-ink font-sansBold">{formatearMoneda(pendiente.importe)}</Text> ({pendiente.porcentaje}
          % sobre {formatearMoneda(pendiente.base_imponible)}).
        </Text>

        <View className="flex-row gap-2 mt-3">
          <Pressable
            onPress={() => setOculta(true)}
            disabled={aceptando}
            className="flex-1 border border-border rounded-lg py-2.5 items-center"
          >
            <Text className="text-inkMuted text-xs font-sansSemiBold">Más tarde</Text>
          </Pressable>
          <Pressable
            onPress={handleAceptar}
            disabled={aceptando}
            className="flex-1 bg-action rounded-lg py-2.5 items-center flex-row justify-center gap-1.5"
          >
            {aceptando ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Feather name="check" size={14} color={colors.white} />
            )}
            <Text className="text-white text-xs font-sansBold">Aceptar</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}