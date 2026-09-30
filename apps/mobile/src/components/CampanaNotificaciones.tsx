import { View, Text, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, shadowRediseno } from '../design-system/tokens';
import type { RootStackParamList } from '../navigation/types';
import { useNotificacionesNoLeidas } from '../hooks/useNotificacionesNoLeidas';

/**
 * Campana con el contador de notificaciones sin leer, para la cabecera.
 * En desarrollo (Expo Go) se deja un margen a la derecha para que el botón
 * flotante de ajustes de Expo no la tape; en la app publicada no hay margen.
 */
export default function CampanaNotificaciones() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { noLeidas } = useNotificacionesNoLeidas();

  return (
    <Pressable
      onPress={() => navigation.navigate('Notificaciones')}
      accessibilityLabel="Notificaciones"
      className="bg-surface border border-border rounded-full items-center justify-center"
      style={{ width: 40, height: 40, marginRight: __DEV__ ? 56 : 0, ...shadowRediseno.card }}
    >
      <Feather name="bell" size={18} color={colors.ink} />
      {noLeidas > 0 && (
        <View
          className="absolute items-center justify-center rounded-full bg-error"
          style={{ top: -3, right: -3, minWidth: 18, height: 18, paddingHorizontal: 4 }}
        >
          <Text className="text-white text-[12px] font-sansBold">{noLeidas > 9 ? '9+' : noLeidas}</Text>
        </View>
      )}
    </Pressable>
  );
}