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
  ScrollView,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { colors } from '../../design-system/tokens';
import type { AuthStackParamList } from '../../navigation/types';
import { URL_POLITICA_PRIVACIDAD, URL_AVISO_LEGAL, URL_TERMINOS } from '../../constants/enlaces';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function traducirErrorRegistro(mensaje: string): string {
  if (mensaje.includes('already registered') || mensaje.includes('already exists')) {
    return 'Ya existe una cuenta con ese email.';
  }
  if (mensaje.includes('Password should be at least')) {
    return 'La contraseña debe tener al menos 6 caracteres.';
  }
  return 'No se ha podido crear la cuenta. Inténtalo de nuevo.';
}

type Campo = 'nombreCompleto' | 'telefono' | 'municipio' | 'email' | 'password' | 'confirmarPassword';

export default function RegistroParticularScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const insets = useSafeAreaInsets();

  const [valores, setValores] = useState<Record<Campo, string>>({
    nombreCompleto: '',
    telefono: '',
    municipio: '',
    email: '',
    password: '',
    confirmarPassword: '',
  });
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [prefijoPais, setPrefijoPais] = useState('+34');
  const [cargando, setCargando] = useState(false);
  const [errores, setErrores] = useState<Partial<Record<Campo, string>>>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [registroCompletado, setRegistroCompletado] = useState(false);
  const [requiereConfirmacionEmail, setRequiereConfirmacionEmail] = useState(false);

  const actualizar = (campo: Campo) => (texto: string) => setValores((prev) => ({ ...prev, [campo]: texto }));

  const validar = () => {
    const nuevosErrores: Partial<Record<Campo, string>> = {};
    if (valores.nombreCompleto.trim().length < 2) {
      nuevosErrores.nombreCompleto = 'Introduce tu nombre completo.';
    }
    if (valores.telefono.trim().replace(/\D/g, '').length < 6) {
      nuevosErrores.telefono = 'Introduce un número de teléfono válido.';
    }
    if (valores.municipio.trim().length < 2) {
      nuevosErrores.municipio = 'Indica tu municipio.';
    }
    if (!EMAIL_REGEX.test(valores.email.trim())) {
      nuevosErrores.email = 'Introduce un email válido.';
    }
    if (valores.password.length < 6) {
      nuevosErrores.password = 'Mínimo 6 caracteres.';
    }
    if (valores.confirmarPassword !== valores.password) {
      nuevosErrores.confirmarPassword = 'Las contraseñas no coinciden.';
    }
    setErrores(nuevosErrores);
    return Object.keys(nuevosErrores).length === 0;
  };

  const handleCrearCuenta = async () => {
    setErrorGeneral(null);
    if (!validar()) return;

    setCargando(true);
    const datosMetadata: Record<string, unknown> = {
      rol_solicitado: 'particular',
      nombre_completo: valores.nombreCompleto.trim(),
      telefono: `${prefijoPais} ${valores.telefono.trim()}`,
    };
    // Sin nombre_empresa ni cif: un particular no es una empresa (los disparadores de registro de
    // empresa solo se activan si esos campos llegan informados). El municipio se guarda aparte.
    datosMetadata.datos_perfil = JSON.stringify({ municipio: valores.municipio.trim() });

    const { data, error } = await supabase.auth.signUp({
      email: valores.email.trim(),
      password: valores.password,
      options: {
        data: datosMetadata,
        emailRedirectTo: 'https://ohcasas.github.io/OhSubcontrata2/confirmado.html',
      },
    });
    setCargando(false);

    if (error) {
      setErrorGeneral(traducirErrorRegistro(error.message));
      return;
    }

    setRequiereConfirmacionEmail(data.session === null);
    setRegistroCompletado(true);
  };

  if (registroCompletado) {
    return (
      <View
        className="flex-1 items-center justify-center bg-canvas px-6"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      >
        <View className="w-14 h-14 rounded-full bg-successTint items-center justify-center mb-4">
          <Feather name="check" size={28} color={colors.success} />
        </View>
        <Text className="text-ink text-xl font-sansBold text-center mb-2">Cuenta creada</Text>
        <Text className="text-inkMuted text-sm text-center mb-6">
          {requiereConfirmacionEmail
            ? 'Revisa tu correo y confirma tu cuenta. Después comprobaremos tus datos (podemos llamarte) antes de activarla: te avisaremos cuando esté lista.'
            : 'Tu cuenta está creada. Comprobaremos tus datos (podemos llamarte) antes de activarla: te avisaremos cuando esté lista.'}
        </Text>
        {requiereConfirmacionEmail && (
          <Pressable onPress={() => navigation.navigate('Login')} className="bg-action rounded-xl py-3 px-6">
            <Text className="text-white font-sansBold text-sm">Volver a iniciar sesión</Text>
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 24 }} keyboardShouldPersistTaps="handled">
          <Pressable onPress={() => navigation.goBack()} hitSlop={8} className="mb-4">
            <Feather name="arrow-left" size={20} color={colors.ink} />
          </Pressable>

          <View className="items-center mb-6">
            <Image
              source={require('../../../assets/branding/oh-casas-logo.jpg')}
              style={{ width: 48, height: 48, borderRadius: 12 }}
              className="mb-3"
            />
            <Text className="text-ink text-2xl font-sansBold">Cuéntanos qué necesitas</Text>
            <Text className="text-inkMuted text-sm mt-1 text-center px-4">
              Crea tu cuenta para pedir una obra o reforma y recibir ofertas de empresas.
            </Text>
          </View>

          <View className="bg-surface rounded-2xl p-5 border border-border">
            {errorGeneral !== null && (
              <View className="bg-errorTint rounded-lg px-3 py-2 mb-4 flex-row items-center gap-2">
                <Feather name="alert-circle" size={16} color={colors.error} />
                <Text className="text-error text-sm flex-1">{errorGeneral}</Text>
              </View>
            )}

            <Text className="text-ink text-xs font-sansSemiBold mb-1">Nombre completo</Text>
            <View className="flex-row items-center bg-surface border border-border rounded-xl mb-1 px-3">
              <Feather name="user" size={16} color={colors.inkSubtle} />
              <TextInput
                value={valores.nombreCompleto}
                onChangeText={actualizar('nombreCompleto')}
                placeholder="Tu nombre y apellidos"
                placeholderTextColor={colors.inkSubtle}
                editable={!cargando}
                className="flex-1 py-3 pl-2.5 text-ink"
              />
            </View>
            {errores.nombreCompleto !== undefined && (
              <Text className="text-error text-xs mb-2">{errores.nombreCompleto}</Text>
            )}

            <Text className="text-ink text-xs font-sansSemiBold mb-1 mt-2">Teléfono</Text>
            <View className="flex-row gap-2 mb-1">
              <View className="w-20">
                <View className="flex-row items-center bg-surface border border-border rounded-xl px-2">
                  <TextInput
                    value={prefijoPais}
                    onChangeText={setPrefijoPais}
                    keyboardType="phone-pad"
                    placeholder="+34"
                    placeholderTextColor={colors.inkSubtle}
                    editable={!cargando}
                    className="py-3 text-ink text-center"
                  />
                </View>
              </View>
              <View className="flex-1">
                <View className="flex-row items-center bg-surface border border-border rounded-xl px-3">
                  <Feather name="phone" size={16} color={colors.inkSubtle} />
                  <TextInput
                    value={valores.telefono}
                    onChangeText={actualizar('telefono')}
                    keyboardType="phone-pad"
                    placeholder="Ej: 612 345 678"
                    placeholderTextColor={colors.inkSubtle}
                    editable={!cargando}
                    className="flex-1 py-3 pl-2.5 text-ink"
                  />
                </View>
              </View>
            </View>
            {errores.telefono !== undefined && <Text className="text-error text-xs mb-2">{errores.telefono}</Text>}

            <Text className="text-ink text-xs font-sansSemiBold mb-1 mt-2">Municipio</Text>
            <View className="flex-row items-center bg-surface border border-border rounded-xl mb-1 px-3">
              <Feather name="map-pin" size={16} color={colors.inkSubtle} />
              <TextInput
                value={valores.municipio}
                onChangeText={actualizar('municipio')}
                placeholder="Ej: Albacete"
                placeholderTextColor={colors.inkSubtle}
                editable={!cargando}
                className="flex-1 py-3 pl-2.5 text-ink"
              />
            </View>
            {errores.municipio !== undefined && <Text className="text-error text-xs mb-2">{errores.municipio}</Text>}

            <Text className="text-ink text-xs font-sansSemiBold mb-1 mt-2">Email</Text>
            <View className="flex-row items-center bg-surface border border-border rounded-xl mb-1 px-3">
              <Feather name="mail" size={16} color={colors.inkSubtle} />
              <TextInput
                value={valores.email}
                onChangeText={actualizar('email')}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                placeholder="tu@email.com"
                placeholderTextColor={colors.inkSubtle}
                editable={!cargando}
                className="flex-1 py-3 pl-2.5 text-ink"
              />
            </View>
            {errores.email !== undefined && <Text className="text-error text-xs mb-2">{errores.email}</Text>}

            <Text className="text-ink text-xs font-sansSemiBold mb-1 mt-2">Contraseña</Text>
            <View className="flex-row items-center bg-surface border border-border rounded-xl mb-1 px-3">
              <Feather name="lock" size={16} color={colors.inkSubtle} />
              <TextInput
                value={valores.password}
                onChangeText={actualizar('password')}
                secureTextEntry={!mostrarPassword}
                autoCapitalize="none"
                placeholder="••••••••"
                placeholderTextColor={colors.inkSubtle}
                editable={!cargando}
                className="flex-1 py-3 pl-2.5 text-ink"
              />
              <Pressable onPress={() => setMostrarPassword((v) => !v)} className="pl-2">
                <Feather name={mostrarPassword ? 'eye-off' : 'eye'} size={16} color={colors.inkSubtle} />
              </Pressable>
            </View>
            {errores.password !== undefined && <Text className="text-error text-xs mb-2">{errores.password}</Text>}

            <Text className="text-ink text-xs font-sansSemiBold mb-1 mt-2">Repetir contraseña</Text>
            <View className="flex-row items-center bg-surface border border-border rounded-xl mb-1 px-3">
              <Feather name="lock" size={16} color={colors.inkSubtle} />
              <TextInput
                value={valores.confirmarPassword}
                onChangeText={actualizar('confirmarPassword')}
                secureTextEntry={!mostrarPassword}
                autoCapitalize="none"
                placeholder="••••••••"
                placeholderTextColor={colors.inkSubtle}
                editable={!cargando}
                className="flex-1 py-3 pl-2.5 text-ink"
              />
            </View>
            {errores.confirmarPassword !== undefined && (
              <Text className="text-error text-xs mb-3">{errores.confirmarPassword}</Text>
            )}

            <Pressable
              onPress={handleCrearCuenta}
              disabled={cargando}
              className="bg-action rounded-xl py-3 items-center mt-3"
            >
              <View className="flex-row items-center justify-center gap-2">
                {cargando ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Feather name="user-plus" size={16} color={colors.white} />
                )}
                <Text className="text-white font-sansBold text-sm">
                  {cargando ? 'Creando cuenta…' : 'Crear cuenta'}
                </Text>
              </View>
            </Pressable>

            <Text className="text-inkMuted text-xs text-center mt-3">
              Al crear la cuenta aceptas el{' '}
              <Text className="text-action font-sansMedium" onPress={() => Linking.openURL(URL_AVISO_LEGAL)}>
                aviso legal
              </Text>
              , los{' '}
              <Text className="text-action font-sansMedium" onPress={() => Linking.openURL(URL_TERMINOS)}>
                términos y condiciones
              </Text>{' '}
              y la{' '}
              <Text
                className="text-action font-sansMedium"
                onPress={() => Linking.openURL(URL_POLITICA_PRIVACIDAD)}
              >
                política de privacidad
              </Text>
              .
            </Text>
          </View>

          <Pressable onPress={() => navigation.navigate('Login')} className="self-center mt-6" disabled={cargando}>
            <Text className="text-inkMuted text-sm">
              ¿Ya tienes cuenta? <Text className="text-action font-sansSemiBold">Iniciar sesión</Text>
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}