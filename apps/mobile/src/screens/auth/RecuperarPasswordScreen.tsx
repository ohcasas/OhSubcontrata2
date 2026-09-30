import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { colors } from '../../design-system/tokens';
import type { AuthStackParamList } from '../../navigation/types';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RecuperarPasswordScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState('');
  const [errorEmail, setErrorEmail] = useState<string | null>(null);
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  const handleEnviar = async () => {
    setErrorGeneral(null);

    if (!EMAIL_REGEX.test(email.trim())) {
      setErrorEmail('Introduce un email válido.');
      return;
    }
    setErrorEmail(null);

    setCargando(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: 'https://ohcasas.github.io/portal-subcontratas-reset/' }); 
    setCargando(false);

    if (error) {
      setErrorGeneral('No se ha podido enviar el correo. Inténtalo de nuevo.');
      return;
    }

    // Por seguridad, Supabase no distingue "email no existe" de "enviado
    // correctamente" (para no revelar qué emails están registrados) — así
    // que siempre se muestra el mismo mensaje de éxito.
    setEnviado(true);
  };

  if (enviado) {
    return (
      <View
        className="flex-1 items-center justify-center bg-surface px-6"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      >
        <View className="w-14 h-14 rounded-full bg-surfaceContainerLow items-center justify-center mb-4">
          <Feather name="mail" size={28} color={colors.tertiary} />
        </View>
        <Text className="text-onSurface text-titleMd font-bold text-center mb-2">
          Revisa tu correo
        </Text>
        <Text className="text-onSurfaceVariant text-bodyMd text-center mb-6">
          Si existe una cuenta con ese email, te hemos enviado un enlace para restablecer tu
          contraseña.
        </Text>
        <Pressable
          onPress={() => navigation.navigate('Login')}
          className="bg-primary rounded-xl py-3 px-6"
        >
          <Text className="text-onPrimary font-bold text-sm">Volver a iniciar sesión</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View
      className="flex-1 bg-surface"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <View className="flex-1 justify-center px-6">
          <Pressable
            onPress={() => navigation.goBack()}
            className="absolute top-4 left-2 p-2"
            disabled={cargando}
          >
            <Feather name="arrow-left" size={20} color={colors.onSurface} />
          </Pressable>

          <View className="items-center mb-8">
            <View className="w-14 h-14 rounded-xl bg-primary items-center justify-center mb-3">
              <Feather name="key" size={22} color={colors.onPrimary} />
            </View>
            <Text className="text-onSurface text-xl font-bold">Recuperar contraseña</Text>
            <Text className="text-onSurfaceVariant text-sm mt-1 text-center px-4">
              Introduce tu email y te enviaremos un enlace para restablecerla.
            </Text>
          </View>

          <View className="bg-surfaceContainerLowest rounded-2xl p-5 border border-outlineVariant">
            {errorGeneral !== null && (
              <View className="bg-errorContainer rounded-lg px-3 py-2 mb-4 flex-row items-center gap-2">
                <Feather name="alert-circle" size={16} color={colors.onErrorContainer} />
                <Text className="text-onErrorContainer text-sm flex-1">{errorGeneral}</Text>
              </View>
            )}

            <Text className="text-onSurface text-xs font-semibold mb-1">Email</Text>
            <View className="flex-row items-center bg-surface border border-outlineVariant rounded-xl mb-1 px-3">
              <Feather name="mail" size={16} color={colors.outline} />
              <TextInput
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                placeholder="tu@empresa.com"
                placeholderTextColor={colors.outline}
                editable={!cargando}
                className="flex-1 py-3 pl-2.5 text-onSurface"
              />
            </View>
            {errorEmail !== null && <Text className="text-error text-xs mb-2">{errorEmail}</Text>}

            <Pressable
              onPress={handleEnviar}
              disabled={cargando}
              className="bg-primary rounded-xl py-3 items-center mt-3"
            >
              <View className="flex-row items-center justify-center gap-2">
                {cargando ? (
                  <ActivityIndicator color={colors.onPrimary} />
                ) : (
                  <Feather name="send" size={16} color={colors.onPrimary} />
                )}
                <Text className="text-onPrimary font-bold text-sm">
                  {cargando ? 'Enviando…' : 'Enviar enlace'}
                </Text>
              </View>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}