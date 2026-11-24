import type { ReactNode } from 'react';
import { View, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BotonMensajes from './BotonMensajes';

type Props = {
  title: string;
  subtitle?: string;
  rightElement?: ReactNode;
};

/**
 * Cabecera de las pantallas, fiel al prediseño: título grande oscuro, subtítulo
 * gris y, a la derecha, los botones de cristal (mensajes, campana...). Detrás
 * de TODA la pantalla pinta el fondo azul claro en degradado (sube desde un
 * celeste arriba hasta casi blanco abajo); las tarjetas blancas se ven encima.
 * Incluye el padding del área segura superior. La usan todas las pantallas, así
 * que cambiarla aquí cambia la cabecera y el fondo de toda la app.
 */
export default function ScreenHeader({ title, subtitle, rightElement }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View style={{ paddingTop: insets.top + 16, paddingBottom: 14, paddingHorizontal: 16 }}>
      <LinearGradient
        pointerEvents="none"
        colors={['#BFE0FF', '#D9ECFF', '#EEF5FF', '#F4F8FF']}
        locations={[0, 0.3, 0.65, 1]}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: -2000, zIndex: -1 }}
      />
      <View className="flex-row items-start justify-between">
        <View className="flex-1 pr-3">
          <Text className="text-ink font-sansBold" style={{ fontSize: 30, lineHeight: 36, letterSpacing: -0.8 }} numberOfLines={1}>
            {title}
          </Text>
          {subtitle !== undefined && (
            <Text className="text-inkMuted text-sm mt-0.5" numberOfLines={1}>
              {subtitle}
            </Text>
          )}
        </View>
        <View className="flex-row items-center gap-2">
          <BotonMensajes />
          {rightElement}
        </View>
      </View>
    </View>
  );
}