import { View, Text, Pressable, ActivityIndicator, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { colors } from '../../design-system/tokens';

type Props = {
  estado: 'pendiente' | 'suspendida' | 'error';
  motivo: string | null;
  comprobando: boolean;
  onComprobar: () => void;
};

const CONTENIDO = {
  pendiente: {
    icono: 'clock' as const,
    titulo: 'Estamos revisando tu cuenta',
    texto:
      'Comprobamos que cada cuenta de OH Conecta pertenece a una empresa o profesional del sector. Cuando esté verificada recibirás un aviso y podrás empezar a usar la app.',
    boton: 'Comprobar ahora',
  },
  suspendida: {
    icono: 'alert-octagon' as const,
    titulo: 'Cuenta suspendida',
    texto: 'Tu cuenta está suspendida y no puedes usar la app por ahora.',
    boton: 'Comprobar de nuevo',
  },
  error: {
    icono: 'wifi-off' as const,
    titulo: 'No hemos podido cargar tu cuenta',
    texto: 'Comprueba tu conexión a internet e inténtalo de nuevo.',
    boton: 'Reintentar',
  },
};

/**
 * Pantalla que ve quien inicia sesión con una cuenta que todavía no está
 * verificada (o que está suspendida). Es solo la parte visible: lo que de verdad
 * impide usar la app es la base de datos, que no deja leer ni publicar nada.
 */
export default function CuentaNoActivaScreen({ estado, motivo, comprobando, onComprobar }: Props) {
  const insets = useSafeAreaInsets();
  const c = CONTENIDO[estado];
  const alerta = estado === 'suspendida';

  return (
    <View className="flex-1 bg-canvas px-6 justify-center" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <View className="items-center">
        <View className={`w-16 h-16 rounded-full items-center justify-center mb-5 ${alerta ? 'bg-errorTint' : 'bg-actionTint'}`}>
          <Feather name={c.icono} size={28} color={alerta ? colors.error : colors.action} />
        </View>
        <Text className="text-ink text-xl font-sansBold text-center mb-2">{c.titulo}</Text>
        <Text className="text-inkMuted text-sm text-center leading-relaxed mb-2">{c.texto}</Text>
        {estado === 'suspendida' && motivo !== null && (
          <Text className="text-ink text-sm text-center leading-relaxed mb-2">Motivo: {motivo}</Text>
        )}
        {estado !== 'error' && (
          <Pressable onPress={() => Linking.openURL('mailto:software@ohcasas.es')} className="mb-6 mt-1">
            <Text className="text-inkMuted text-xs text-center">
              {estado === 'suspendida' ? 'Si crees que es un error, escríbenos a ' : '¿Alguna duda? Escríbenos a '}
              <Text className="text-action font-sansSemiBold">software@ohcasas.es</Text>
            </Text>
          </Pressable>
        )}
      </View>

      <Pressable
        onPress={onComprobar}
        disabled={comprobando}
        className="bg-action rounded-xl py-3 items-center flex-row justify-center gap-2 mt-4"
      >
        {comprobando ? <ActivityIndicator color={colors.white} /> : <Feather name="refresh-cw" size={15} color={colors.white} />}
        <Text className="text-white font-sansBold text-sm">{comprobando ? 'Comprobando…' : c.boton}</Text>
      </Pressable>
      <Pressable onPress={() => supabase.auth.signOut()} className="items-center py-3 mt-1">
        <Text className="text-inkMuted text-sm">Cerrar sesión</Text>
      </Pressable>
    </View>
  );
}