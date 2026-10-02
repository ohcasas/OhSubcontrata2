import type { ReactNode } from 'react';
import { View, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
  title: string;
  subtitle?: string;
  rightElement?: ReactNode;
};

/**
 * Cabecera de marca del rediseño — clara (`canvas`), con el wordmark
 * "OH CONECTA" en mayúsculas pequeñas encima del título grande de
 * la pantalla, y un elemento opcional a la derecha (campana, ajustes...).
 * Sustituye a la cabecera navy con el logo en caja de la versión anterior.
 * Incluye el padding del área segura superior.
 */
export default function ScreenHeader({ title, subtitle, rightElement }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View className="bg-canvas px-4 pb-4" style={{ paddingTop: insets.top + 16 }}>
      <View className="flex-row items-start justify-between">
        <View className="flex-1 pr-3">
          <Text
            className="text-ink text-[13px] font-sansSemiBold uppercase"
            style={{ letterSpacing: 2.2 }}
          >
            OH CONECTA
          </Text>
          <Text className="text-ink text-[28px] font-sans mt-0.5" numberOfLines={1}>
            {title}
          </Text>
          {subtitle !== undefined && (
            <Text className="text-inkMuted text-sm mt-0.5" numberOfLines={1}>
              {subtitle}
            </Text>
          )}
        </View>
        {rightElement}
      </View>
    </View>
  );
}