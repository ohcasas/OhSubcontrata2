import { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { colors } from '../../design-system/tokens';
import { URL_NUEVA_CONTRASENA } from '../../constants/enlaces';
import type { AuthStackParamList } from '../../navigation/types';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RecuperarPasswordScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);

  const handleEnviar = async () => {
    setError(null);
    if (!EMAIL_REGEX.test(email.trim())) {
      setError('Introduce un email válido.');
      return;
    }

    setCargando(true);
    const { error: errorEnvio } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: URL_NUEVA_CONTRASENA,
    });
    setCargando(false);

    if (errorEnvio) {
      setError(
        errorEnvio.message.toLowerCase().includes('rate limit')
          ? 'Has pedido demasiados enlaces seguidos. Espera unos minutos y vuelve a intentarlo.'
          : 'No se ha podido enviar el enlace. Inténtalo de nuevo.',
      );
      return;
    }
    // Se muestra siempre el mismo mensaje exista o no la cuenta: así nadie
    // puede usar esta pantalla para averiguar qué emails están registrados.
    setEnviado(true);
  };

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View className="flex-1 px-6 justify-center">
          <Pressable onPress={() => navigation.goBack()} hitSlop={8} className="absolute left-6" style={{ top: 16 }}>
            <Feather name="arrow-left" size={20} color={colors.ink} />
          </Pressable>

          {enviado ? (
            <View className="items-center">
              <View className="w-14 h-14 rounded-full bg-successTint items-center justify-center mb-4">
                <Feather name="mail" size={26} color={colors.success} />
              </View>
              <Text className="text-ink text-xl font-sansBold text-center mb-2">Revisa tu correo</Text>
              <Text className="text-inkMuted text-sm text-center mb-6 leading-relaxed">
                Si existe una cuenta con ese email, te hemos enviado un enlace para crear una contraseña nueva.
                Si no lo ves, mira también en spam.
              </Text>
              <Pressable onPress={() => navigation.navigate('Login')} className="bg-action rounded-xl py-3 px-6">
                <Text className="text-white font-sansBold text-sm">Volver a iniciar sesión</Text>
              </Pressable>
            </View>
          ) : (
            <View>
              <Text className="text-ink text-2xl font-sansBold mb-1.5">¿Has olvidado tu contraseña?</Text>
              <Text className="text-inkMuted text-sm mb-5 leading-relaxed">
                Escribe el email de tu cuenta y te enviaremos un enlace para crear una contraseña nueva.
              </Text>

              {error !== null && (
                <View className="bg-errorTint rounded-lg px-3 py-2 mb-3 flex-row items-center gap-2">
                  <Feather name="alert-circle" size={16} color={colors.error} />
                  <Text className="text-error text-sm flex-1">{error}</Text>
                </View>
              )}

              <Text className="text-ink text-xs font-sansSemiBold mb-1">Email</Text>
              <View className="flex-row items-center bg-surface border border-border rounded-xl mb-4 px-3">
                <Feather name="mail" size={17} color={colors.inkSubtle} />
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  placeholder="tu@email.com"
                  placeholderTextColor={colors.inkSubtle}
                  editable={!cargando}
                  className="flex-1 py-3 pl-2.5 text-ink"
                />
              </View>

              <Pressable onPress={handleEnviar} disabled={cargando} className="bg-action rounded-xl py-3 items-center">
                <View className="flex-row items-center gap-2">
                  {cargando ? (
                    <ActivityIndicator color={colors.white} />
                  ) : (
                    <Feather name="send" size={15} color={colors.white} />
                  )}
                  <Text className="text-white font-sansBold text-sm">{cargando ? 'Enviando…' : 'Enviar enlace'}</Text>
                </View>
              </Pressable>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}