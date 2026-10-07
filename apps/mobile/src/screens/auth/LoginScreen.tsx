import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  Image,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { URL_POLITICA_PRIVACIDAD } from '../../constants/enlaces';
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
  if (mensaje.toLowerCase().includes('banned')) {
    return 'Tu cuenta está suspendida. Escríbenos a software@ohcasas.es.';
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
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View className="flex-1 justify-center px-6">
          {/* Marca */}
          <View className="items-center mb-8">
            <Image
              source={require('../../../assets/branding/oh-casas-logo.jpg')}
              style={{ width: 64, height: 64, borderRadius: 16 }}
              className="mb-3"
            />
            <Text className="text-ink text-[13px] font-sansSemiBold uppercase" style={{ letterSpacing: 2.2 }}>
              OH CONECTA
            </Text>
            <Text className="text-ink text-2xl font-sansBold mt-3">Bienvenido de nuevo</Text>
            <Text className="text-inkMuted text-sm mt-1">Accede a tu portal de subcontratas.</Text>
          </View>

          {/* Tarjeta del formulario */}
          <View className="bg-surface rounded-2xl p-5 border border-border">
            {errorGeneral !== null && (
              <View className="bg-errorTint rounded-lg px-3 py-2 mb-4 flex-row items-center gap-2">
                <Feather name="alert-circle" size={17} color={colors.error} />
                <Text className="text-error text-sm flex-1">{errorGeneral}</Text>
              </View>
            )}

            <Text className="text-ink text-xs font-sansSemiBold mb-1">Email</Text>
            <View className="flex-row items-center bg-surface border border-border rounded-xl mb-1 px-3">
              <Feather name="mail" size={17} color={colors.inkSubtle} />
              <TextInput
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                placeholder="tu@empresa.com"
                placeholderTextColor={colors.inkSubtle}
                editable={!cargando}
                className="flex-1 py-3 pl-2.5 text-ink"
              />
            </View>
            {errorEmail !== null && <Text className="text-error text-xs mb-2">{errorEmail}</Text>}

            <Text className="text-ink text-xs font-sansSemiBold mb-1 mt-3">Contraseña</Text>
            <View className="flex-row items-center bg-surface border border-border rounded-xl mb-1 px-3">
              <Feather name="lock" size={17} color={colors.inkSubtle} />
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!mostrarPassword}
                autoCapitalize="none"
                placeholder="••••••••"
                placeholderTextColor={colors.inkSubtle}
                editable={!cargando}
                className="flex-1 py-3 pl-2.5 text-ink"
              />
              <Pressable onPress={() => setMostrarPassword((v) => !v)} className="pl-2">
                <Feather name={mostrarPassword ? 'eye-off' : 'eye'} size={17} color={colors.inkSubtle} />
              </Pressable>
            </View>
            {errorPassword !== null && <Text className="text-error text-xs mb-2">{errorPassword}</Text>}

            <Pressable onPress={() => navigation.navigate('RecuperarPassword')} className="self-end py-1" disabled={cargando}>
              <Text className="text-action text-xs font-sansSemiBold">¿Has olvidado tu contraseña?</Text>
            </Pressable>

            <Pressable
              onPress={handleIniciarSesion}
              disabled={cargando}
              className="bg-action rounded-xl py-3 items-center mt-2"
            >
              <View className="flex-row items-center justify-center gap-2">
                {cargando ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Feather name="log-in" size={17} color={colors.white} />
                )}
                <Text className="text-white font-sansBold text-sm">
                  {cargando ? 'Entrando…' : 'Iniciar sesión'}
                </Text>
              </View>
            </Pressable>

            <Pressable
              onPress={() => navigation.navigate('ElegirTipoCuenta')}
              disabled={cargando}
              className="border border-border rounded-xl py-3 items-center mt-2.5"
            >
              <Text className="text-ink font-sansBold text-sm">Crear cuenta</Text>
            </Pressable>
          </View>

          <Pressable onPress={() => Linking.openURL(URL_POLITICA_PRIVACIDAD)}>
            <Text className="text-inkMuted text-xs text-center mt-6">
              Al continuar aceptas la{' '}
              <Text className="text-action font-sansMedium">política de privacidad</Text>.
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}