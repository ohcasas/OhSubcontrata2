import { View, Text, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { colors, shadowRediseno } from '../design-system/tokens';
import { useChatNoLeidos } from '../services/chat';

/** Botón de mensajes de la cabecera, con el contador de mensajes sin leer. Abre la bandeja. */
export default function BotonMensajes() {
  const navigation = useNavigation<any>();
  const noLeidos = useChatNoLeidos();

  return (
    <Pressable
      onPress={() => navigation.navigate('Mensajes')}
      accessibilityLabel={noLeidos > 0 ? `Mensajes, ${noLeidos} sin leer` : 'Mensajes'}
      className="bg-surface border border-border rounded-full items-center justify-center"
      style={{ width: 40, height: 40, ...shadowRediseno.card }}
    >
      <Feather name="message-circle" size={18} color={colors.ink} />
      {noLeidos > 0 && (
        <View
          className="absolute items-center justify-center rounded-full bg-action"
          style={{ top: -3, right: -3, minWidth: 18, height: 18, paddingHorizontal: 4 }}
        >
          <Text className="text-white text-[12px] font-sansBold">{noLeidos > 9 ? '9+' : noLeidos}</Text>
        </View>
      )}
    </Pressable>
  );
}