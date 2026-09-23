import type { ReactNode } from 'react';
import { View, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
  title: string;
  subtitle?: string;
  rightElement?: ReactNode;
};

/**
 * Cabecera de marca — navy con marca "OH" y, opcionalmente, un elemento a
 * la derecha (botón, badge...). Incluye el padding del área segura
 * superior, así que la pantalla que la usa no necesita aplicarlo aparte.
 */
export default function ScreenHeader({ title, subtitle, rightElement }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View className="bg-primary px-4 pb-3" style={{ paddingTop: insets.top + 12 }}>
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center flex-1 pr-2">
          <View className="w-8 h-8 rounded-lg bg-onPrimary/15 items-center justify-center mr-2.5">
            <Text className="text-onPrimary text-xs font-extrabold">OH</Text>
          </View>
          <View className="flex-1">
            <Text className="text-onPrimary text-lg font-bold" numberOfLines={1}>
              {title}
            </Text>
            {subtitle !== undefined && (
              <Text className="text-onPrimary/70 text-xs mt-0.5" numberOfLines={1}>
                {subtitle}
              </Text>
            )}
          </View>
        </View>
        {rightElement}
      </View>
    </View>
  );
}
