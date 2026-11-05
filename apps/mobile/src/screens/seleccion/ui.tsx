/** Piezas visuales pequeñas compartidas por las pantallas de «Trabaja con nosotros». */
import type { ReactNode } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { colors } from '../../design-system/tokens';

export function Etiqueta({ texto, tono = 'azul' }: { texto: string; tono?: 'azul' | 'gris' | 'verde' | 'ambar' }) {
  const fondo = { azul: 'bg-actionTint', gris: 'bg-silverTint', verde: 'bg-successTint', ambar: 'bg-warningTint' }[tono];
  const color = { azul: 'text-actionDark', gris: 'text-inkMuted', verde: 'text-success', ambar: 'text-warning' }[tono];
  return (
    <View className={`${fondo} rounded-full px-2.5 py-0.5 mr-1.5 mb-1`}>
      <Text className={`${color} text-xs font-sansSemiBold`}>{texto}</Text>
    </View>
  );
}

export function Tarjeta({ children, onPress }: { children: ReactNode; onPress?: () => void }) {
  const cuerpo = <View className="bg-surface border border-border rounded-2xl p-4 mb-3">{children}</View>;
  return onPress ? <Pressable onPress={onPress}>{cuerpo}</Pressable> : cuerpo;
}

export function BotonPrimario({
  texto,
  onPress,
  cargando,
  desactivado,
}: {
  texto: string;
  onPress: () => void;
  cargando?: boolean;
  desactivado?: boolean;
}) {
  const off = cargando || desactivado;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      className={`rounded-xl py-3 items-center ${off ? 'bg-borderStrong' : 'bg-action'}`}
    >
      {cargando ? <ActivityIndicator color={colors.white} /> : <Text className="text-white font-sansBold text-sm">{texto}</Text>}
    </Pressable>
  );
}

export function BotonSecundario({ texto, onPress, desactivado }: { texto: string; onPress: () => void; desactivado?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={desactivado}
      accessibilityRole="button"
      className="border border-borderStrong bg-surface rounded-xl py-3 items-center"
    >
      <Text className="text-ink font-sansBold text-sm">{texto}</Text>
    </Pressable>
  );
}

export function Aviso({ texto, tipo = 'error' }: { texto: string; tipo?: 'error' | 'ok' | 'info' }) {
  const fondo = { error: 'bg-errorTint', ok: 'bg-successTint', info: 'bg-actionTint' }[tipo];
  const color = { error: 'text-error', ok: 'text-success', info: 'text-actionDark' }[tipo];
  return (
    <View className={`${fondo} rounded-xl px-3 py-2.5 mb-3`} accessibilityRole="alert">
      <Text className={`${color} text-sm`}>{texto}</Text>
    </View>
  );
}

export function Vacio({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <View className="items-center py-10 px-6">
      <Text className="text-ink text-base font-sansBold text-center">{titulo}</Text>
      <Text className="text-inkMuted text-sm text-center mt-1">{texto}</Text>
    </View>
  );
}

export function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}
export function fechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}