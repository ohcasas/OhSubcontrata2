import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
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
import BotonDegradado from '../../components/BotonDegradado';
import FondoAuth from '../../components/auth/FondoAuth';
import LogoCristal from '../../components/auth/LogoCristal';

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
    return 'Tu cuenta está suspendida. Escríbenos a soporte@3bconecta.com.';
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
      <FondoAuth />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 24 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Marca */}
          <View className="items-center mb-8">
            <LogoCristal tamano={84} />
            <Text className="text-white text-3xl font-sansBold">3B Conecta</Text>
            <Text className="text-white/85 text-sm mt-1.5 text-center">
              Obras y profesionales, en un solo sitio
            </Text>
          </View>

          {errorGeneral !== null && (
            <View className="bg-errorTint rounded-2xl px-4 py-3 mb-4 flex-row items-center gap-2">
              <Feather name="alert-circle" size={17} color={colors.error} />
              <Text className="text-error text-sm flex-1">{errorGeneral}</Text>
            </View>
          )}

          <View className="flex-row items-center bg-white/75 border border-white rounded-full px-5" style={{ height: 56 }}>
            <Feather name="mail" size={17} color={colors.inkSubtle} />
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              placeholder="Correo electrónico"
              placeholderTextColor={colors.inkSubtle}
              editable={!cargando}
              className="flex-1 pl-3 text-ink"
            />
          </View>
          {errorEmail !== null && <Text className="text-error text-xs mt-1 ml-5">{errorEmail}</Text>}

          <View className="flex-row items-center bg-white/75 border border-white rounded-full px-5 mt-3" style={{ height: 56 }}>
            <Feather name="lock" size={17} color={colors.inkSubtle} />
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!mostrarPassword}
              autoCapitalize="none"
              placeholder="Contraseña"
              placeholderTextColor={colors.inkSubtle}
              editable={!cargando}
              className="flex-1 pl-3 text-ink"
            />
            <Pressable
              onPress={() => setMostrarPassword((v) => !v)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={mostrarPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            >
              <Feather name={mostrarPassword ? 'eye-off' : 'eye'} size={17} color={colors.inkSubtle} />
            </Pressable>
          </View>
          {errorPassword !== null && <Text className="text-error text-xs mt-1 ml-5">{errorPassword}</Text>}

          <Pressable
            onPress={() => navigation.navigate('RecuperarPassword')}
            className="self-end mt-2 mb-1 bg-white/75 rounded-full px-3 py-1.5"
            disabled={cargando}
          >
            <Text className="text-action text-xs font-sansSemiBold">¿Has olvidado tu contraseña?</Text>
          </Pressable>

          <BotonDegradado
            etiqueta={cargando ? 'Entrando…' : 'Entrar'}
            icono="log-in"
            cargando={cargando}
            onPress={handleIniciarSesion}
            style={{ marginTop: 8 }}
          />

          <Pressable
            onPress={() => navigation.navigate('ElegirTipoCuenta')}
            disabled={cargando}
            className="self-center mt-5 bg-white/75 rounded-full px-5 py-2.5"
          >
            <Text className="text-inkMuted text-sm">
              ¿Aún no tienes cuenta? <Text className="text-action font-sansBold">Regístrate</Text>
            </Text>
          </Pressable>

          <Pressable
            onPress={() => navigation.navigate('EmpleoOfertas')}
            disabled={cargando}
            className="bg-white/60 border border-white rounded-full items-center mt-5"
            style={{ height: 48, justifyContent: 'center' }}
          >
            <Text className="text-actionDark font-sansBold text-sm">Trabaja con nosotros</Text>
          </Pressable>

          <Pressable onPress={() => Linking.openURL(URL_POLITICA_PRIVACIDAD)}>
            <Text className="text-ink text-xs text-center mt-6 self-center bg-white/75 rounded-full px-4 py-2 overflow-hidden">
              Al continuar aceptas la{' '}
              <Text className="text-action font-sansMedium">política de privacidad</Text>.
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}