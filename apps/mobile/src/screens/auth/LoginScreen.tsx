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

/** Traduce los mensajes de error de Supabase a algo legible en español */
function traducirErrorSupabase(mensaje: string): string {
  if (mensaje.includes('Invalid login credentials')) {
    return 'Email o contraseña incorrectos.';
  }
  if (mensaje.includes('Email not confirmed')) {
    return 'Debes confirmar tu email antes de iniciar sesión.';
  }
  return 'No se ha podido iniciar sesión. Inténtalo de nuevo.';
}

export default function LoginScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [errorEmail, setErrorEmail] = useState<string | null>(null);
  const [errorPassword, setErrorPassword] = useState<string | null>(null);
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);

  const validar = () => {
    let valido = true;

    if (!EMAIL_REGEX.test(email.trim())) {
      setErrorEmail('Introduce un email válido.');
      valido = false;
    } else {
      setErrorEmail(null);
    }

    if (password.length < 1) {
      setErrorPassword('Introduce tu contraseña.');
      valido = false;
    } else {
      setErrorPassword(null);
    }

    return valido;
  };

  const handleIniciarSesion = async () => {
    setErrorGeneral(null);
    if (!validar()) return;

    setCargando(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setCargando(false);

    if (error) {
      setErrorGeneral(traducirErrorSupabase(error.message));
      return;
    }
    // Sin error: RootNavigator detecta la sesión vía onAuthStateChange y
    // cambia de pantalla solo — no hace falta navegar a mano desde aquí.
  };

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
          {/* Marca */}
          <View className="items-center mb-8">
            <View className="w-14 h-14 rounded-xl bg-primary items-center justify-center mb-3">
              <Text className="text-onPrimary text-2xl font-bold">OH</Text>
            </View>
            <Text className="text-onSurface text-xl font-bold">Portal de Subcontratas</Text>
            <Text className="text-onSurfaceVariant text-sm mt-1">OH Casas Modulares</Text>
          </View>

          {/* Tarjeta del formulario */}
          <View className="bg-surfaceContainerLowest rounded-2xl p-5 border border-outlineVariant">
            <Text className="text-onSurface text-base font-semibold mb-4">Iniciar sesión</Text>

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

            <Text className="text-onSurface text-xs font-semibold mb-1 mt-3">Contraseña</Text>
            <View className="flex-row items-center bg-surface border border-outlineVariant rounded-xl mb-1 px-3">
              <Feather name="lock" size={16} color={colors.outline} />
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!mostrarPassword}
                autoCapitalize="none"
                placeholder="••••••••"
                placeholderTextColor={colors.outline}
                editable={!cargando}
                className="flex-1 py-3 pl-2.5 text-onSurface"
              />
              <Pressable onPress={() => setMostrarPassword((v) => !v)} className="pl-2">
                <Feather name={mostrarPassword ? 'eye-off' : 'eye'} size={16} color={colors.outline} />
              </Pressable>
            </View>
            {errorPassword !== null && (
              <Text className="text-error text-xs mb-2">{errorPassword}</Text>
            )}

            <Pressable
              onPress={() => navigation.navigate('RecuperarPassword')}
              className="self-end mb-4 mt-1"
              disabled={cargando}
            >
              <Text className="text-tertiary text-xs font-semibold">
                ¿Olvidaste tu contraseña?
              </Text>
            </Pressable>

            <Pressable
              onPress={handleIniciarSesion}
              disabled={cargando}
              className="bg-primary rounded-xl py-3 items-center"
            >
              <View className="flex-row items-center justify-center gap-2">
                {cargando ? (
                  <ActivityIndicator color={colors.onPrimary} />
                ) : (
                  <Feather name="log-in" size={16} color={colors.onPrimary} />
                )}
                <Text className="text-onPrimary font-bold text-sm">
                  {cargando ? 'Entrando…' : 'Iniciar sesión'}
                </Text>
              </View>
            </Pressable>
          </View>

          <Pressable
            onPress={() => navigation.navigate('Registro')}
            className="self-center mt-6"
            disabled={cargando}
          >
            <Text className="text-onSurfaceVariant text-sm">
              ¿No tienes cuenta? <Text className="text-tertiary font-semibold">Crear cuenta</Text>
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
