import { View, Text, Pressable, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import type { AuthStackParamList } from '../../navigation/types';
import { colors } from '../../design-system/tokens';

export default function ElegirTipoCuentaScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <View className="flex-1 px-6 justify-center">
        <View className="items-center mb-8">
          <Image
            source={require('../../../assets/branding/oh-casas-logo.jpg')}
            style={{ width: 56, height: 56, borderRadius: 14 }}
            className="mb-3"
          />
          <Text className="text-ink text-2xl font-sansBold text-center">¿Qué quieres hacer?</Text>
          <Text className="text-inkMuted text-sm text-center mt-1.5">
            Puedes cambiarlo más adelante contactando con OH.
          </Text>
        </View>

        <Pressable
          onPress={() => navigation.navigate('Registro')}
          className="bg-surface border border-border rounded-2xl p-5 mb-3"
        >
          <View className="w-11 h-11 rounded-xl bg-actionTint items-center justify-center mb-3">
            <Feather name="briefcase" size={20} color={colors.action} />
          </View>
          <Text className="text-ink text-base font-sansBold">Quiero trabajar en obras</Text>
          <Text className="text-inkMuted text-sm mt-1 leading-relaxed">
            Eres subcontratista, autónomo o empresa de un oficio: postula a licitaciones, ejecuta obras y gana
            puntos del Club OH Partner.
          </Text>
        </Pressable>

        <Pressable
          onPress={() => navigation.navigate('RegistroReferidor')}
          className="bg-surface border border-border rounded-2xl p-5"
        >
          <View className="w-11 h-11 rounded-xl bg-actionTint items-center justify-center mb-3">
            <Feather name="users" size={20} color={colors.action} />
          </View>
          <Text className="text-ink text-base font-sansBold">Quiero recomendar clientes</Text>
          <Text className="text-inkMuted text-sm mt-1 leading-relaxed">
            Eres una inmobiliaria, agente o particular: recomienda personas que quieran construir una vivienda y
            gana una comisión si la operación se completa.
          </Text>
        </Pressable>

        <Pressable onPress={() => navigation.navigate('Login')} className="self-center mt-8">
          <Text className="text-inkMuted text-sm">
            ¿Ya tienes cuenta? <Text className="text-action font-sansSemiBold">Iniciar sesión</Text>
          </Text>
        </Pressable>
      </View>
    </View>
  );
}