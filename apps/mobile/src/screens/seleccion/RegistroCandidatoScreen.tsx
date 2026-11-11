import { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, KeyboardAvoidingView, Platform, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NavigationProp, ParamListBase } from '@react-navigation/native';
import { supabase } from '../../services/supabase';
import { URL_POLITICA_PRIVACIDAD } from '../../constants/enlaces';
import { Aviso, BotonPrimario } from './ui';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Crea SOLO la cuenta de acceso (correo y contraseña) de un candidato.
 * No se envía rol_solicitado, nombre_empresa ni datos_perfil: así los disparadores del marketplace
 * no crean perfil, empresa ni suscripción. Los datos personales y el consentimiento se piden después
 * de entrar (pantalla «Tus datos»), y la base de datos los registra con sel_registrar_candidato.
 */
export default function RegistroCandidatoScreen() {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [repetir, setRepetir] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<{ confirmar: boolean } | null>(null);

  const crear = async () => {
    setError(null);
    if (!EMAIL_REGEX.test(email.trim())) return setError('Introduce un email válido.');
    if (password.length < 8) return setError('La contraseña debe tener al menos 8 caracteres.');
    if (password !== repetir) return setError('Las contraseñas no coinciden.');
    setCargando(true);
    const { data, error: e } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { tipo_cuenta: 'candidato' }, emailRedirectTo: 'https://3bconecta.com/confirmado.html' },
    });
    setCargando(false);
    if (e) {
      setError(
        e.message.includes('already registered') || e.message.includes('already exists')
          ? 'Ya existe una cuenta con ese email. Si es de la app, usa otro correo para el proceso de selección.'
          : 'No se ha podido crear la cuenta. Inténtalo de nuevo.',
      );
      return;
    }
    // Con sesión inmediata, RootNavigator detecta el cambio y lleva a «Tus datos».
    setHecho({ confirmar: data.session === null });
  };

  if (hecho?.confirmar) {
    return (
      <View className="flex-1 bg-canvas items-center justify-center px-6" style={{ paddingTop: insets.top }}>
        <Text className="text-ink text-2xl font-sansBold text-center">Confirma tu correo</Text>
        <Text className="text-inkMuted text-sm text-center mt-2">
          Te hemos enviado un enlace a {email.trim()}. Ábrelo y después inicia sesión para completar tus datos y entrar en la bolsa de empleo o presentarte a una oferta.
        </Text>
        <View className="w-full mt-6">
          <BotonPrimario texto="Ir a iniciar sesión" onPress={() => navigation.navigate('Login')} />
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView className="flex-1 px-6" keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingVertical: 16 }}>
          <Pressable onPress={() => navigation.goBack()} accessibilityRole="button" className="self-start py-1">
            <Text className="text-action text-sm font-sansSemiBold">‹ Volver</Text>
          </Pressable>
          <Text className="text-ink text-2xl font-sansBold mt-2">Cuenta de candidato</Text>
          <Text className="text-inkMuted text-sm mt-1 mb-4">
            Esta cuenta es solo para trabajar con 3B. No necesitas que haya una oferta abierta: puedes dejar tu perfil en la bolsa de empleo. No crea ningún perfil de empresa ni de profesional.
          </Text>
          {error !== null && <Aviso texto={error} />}
          <Text className="text-ink text-xs font-sansSemiBold mb-1">Email</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            className="bg-surface border border-border rounded-xl px-3 py-3 text-ink"
          />
          <Text className="text-ink text-xs font-sansSemiBold mb-1 mt-3">Contraseña</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
            className="bg-surface border border-border rounded-xl px-3 py-3 text-ink"
          />
          <Text className="text-ink text-xs font-sansSemiBold mb-1 mt-3">Repite la contraseña</Text>
          <TextInput
            value={repetir}
            onChangeText={setRepetir}
            secureTextEntry
            autoComplete="new-password"
            className="bg-surface border border-border rounded-xl px-3 py-3 text-ink"
          />
          <View className="mt-5">
            <BotonPrimario texto="Crear cuenta" onPress={crear} cargando={cargando} />
          </View>
          <Pressable onPress={() => Linking.openURL(URL_POLITICA_PRIVACIDAD)} className="mt-4">
            <Text className="text-inkMuted text-xs text-center">
              Después te pediremos tus datos y tu consentimiento. <Text className="text-action">Política de privacidad</Text>
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}