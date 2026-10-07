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
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { colors } from '../../design-system/tokens';
import type { AuthStackParamList } from '../../navigation/types';
import { URL_POLITICA_PRIVACIDAD, URL_AVISO_LEGAL, URL_TERMINOS } from '../../constants/enlaces';
import { useCatalogoRegistro, validarCampos, separarValores } from '../../services/catalogoRegistro';
import CamposDinamicos from '../../components/CamposDinamicos';
import AvisoDocumentos from '../../components/AvisoDocumentos';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ETIQUETA_ROL: Record<string, string> = {
  promotor: 'Promotor',
  constructora: 'Constructora',
  arquitecto: 'Arquitecto',
  proveedor: 'Proveedor',
  profesional: 'Profesional',
  administrador: 'Inmobiliaria / Administrador',
};

function traducirErrorRegistro(mensaje: string): string {
  if (mensaje.includes('CIF_DUPLICADO')) {
    return 'Ya hay una cuenta registrada con ese CIF/NIF. Si es tuyo, escríbenos a software@ohcasas.es.';
  }
  if (mensaje.includes('already registered') || mensaje.includes('already exists')) {
    return 'Ya existe una cuenta con ese email.';
  }
  if (mensaje.includes('Password should be at least')) {
    return 'La contraseña debe tener al menos 6 caracteres.';
  }
  if (mensaje.includes('Database error')) {
    return 'No se ha podido crear la cuenta. Si el CIF/NIF ya estuviera registrado, escríbenos a software@ohcasas.es.';
  }
  return 'No se ha podido crear la cuenta. Inténtalo de nuevo.';
}

type Campo = 'nombreCompleto' | 'telefono' | 'email' | 'password' | 'confirmarPassword';

export default function RegistroEmpresaScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const route = useRoute<RouteProp<AuthStackParamList, 'RegistroEmpresa'>>();
  const rol = route.params.rol;
  const etiquetaRol = ETIQUETA_ROL[rol] ?? rol;
  const insets = useSafeAreaInsets();

  // Lo que se pide a este perfil (campos propios y documentos): viene de la base de datos
  const catalogo = useCatalogoRegistro(rol);

  const [valores, setValores] = useState<Record<Campo, string>>({
    nombreCompleto: '',
    telefono: '',
    email: '',
    password: '',
    confirmarPassword: '',
  });
  const [dinamicos, setDinamicos] = useState<Record<string, string>>({});
  const [erroresDinamicos, setErroresDinamicos] = useState<Record<string, string>>({});
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
    // Se validan las dos partes siempre, para enseñar todos los errores a la vez
    const baseValida = validar();
    const erroresPerfil = validarCampos(catalogo.campos, dinamicos);
    setErroresDinamicos(erroresPerfil);
    if (!baseValida || Object.keys(erroresPerfil).length > 0) return;

    setCargando(true);
    const { nombre_empresa, cif, datos_perfil } = separarValores(dinamicos);
    const datosMetadata: Record<string, unknown> = {
      rol_solicitado: rol,
      nombre_completo: valores.nombreCompleto.trim(),
      telefono: `${prefijoPais} ${valores.telefono.trim()}`,
      datos_perfil,
    };
    if (nombre_empresa !== undefined) datosMetadata.nombre_empresa = nombre_empresa;
    if (cif !== undefined) datosMetadata.cif = cif;

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
            ? 'Revisa tu correo y confirma tu cuenta. Al iniciar sesión te pediremos la documentación para verificarla; te avisaremos cuando esté lista.'
            : 'Tu cuenta está creada. Te pediremos la documentación para verificarla; te avisaremos cuando esté lista.'}
        </Text>
        {requiereConfirmacionEmail && (
          <Pressable onPress={() => navigation.navigate('Login')} className="bg-action rounded-xl py-3 px-6">
            <Text className="text-white font-sansBold text-sm">Volver a iniciar sesión</Text>
          </Pressable>
        )}
      </View>
    );
  }

  // Sin el catálogo no se sabe qué campos pide este perfil: se espera, o se deja reintentar
  if (catalogo.cargando || catalogo.error !== null) {
    return (
      <View
        className="flex-1 items-center justify-center bg-canvas px-6"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      >
        {catalogo.cargando ? (
          <ActivityIndicator color={colors.action} />
        ) : (
          <>
            <Feather name="wifi-off" size={26} color={colors.inkMuted} />
            <Text className="text-ink text-base font-sansBold text-center mt-3 mb-1">No hemos podido cargar el formulario</Text>
            <Text className="text-inkMuted text-sm text-center mb-5">Comprueba tu conexión e inténtalo de nuevo.</Text>
            <Pressable onPress={catalogo.recargar} className="bg-action rounded-xl py-3 px-6 mb-2">
              <Text className="text-white font-sansBold text-sm">Reintentar</Text>
            </Pressable>
            <Pressable onPress={() => navigation.goBack()} className="py-2">
              <Text className="text-inkMuted text-sm">Volver</Text>
            </Pressable>
          </>
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
            <Text className="text-ink text-2xl font-sansBold text-center">Cuenta de {etiquetaRol}</Text>
            <Text className="text-inkMuted text-sm mt-1 text-center px-4">
              Revisamos los datos y la documentación de cada cuenta antes de activarla.
            </Text>
          </View>

          <View className="bg-surface rounded-2xl p-5 border border-border">
            {errorGeneral !== null && (
              <View className="bg-errorTint rounded-lg px-3 py-2 mb-4 flex-row items-center gap-2">
                <Feather name="alert-circle" size={16} color={colors.error} />
                <Text className="text-error text-sm flex-1">{errorGeneral}</Text>
              </View>
            )}

            <Text className="text-ink text-xs font-sansBold uppercase mb-3" style={{ letterSpacing: 1 }}>
              Tú
            </Text>

            <Text className="text-ink text-xs font-sansSemiBold mb-1">Nombre completo *</Text>
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

            <Text className="text-ink text-xs font-sansSemiBold mb-1 mt-2">Teléfono *</Text>
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

            {catalogo.campos.length > 0 && (
              <>
                <Text className="text-ink text-xs font-sansBold uppercase mb-3 mt-5" style={{ letterSpacing: 1 }}>
                  Datos de {etiquetaRol.toLowerCase()}
                </Text>
                <CamposDinamicos
                  campos={catalogo.campos}
                  valores={dinamicos}
                  errores={erroresDinamicos}
                  onCambio={(clave, valor) => setDinamicos((prev) => ({ ...prev, [clave]: valor }))}
                  deshabilitado={cargando}
                />
              </>
            )}

            <Text className="text-ink text-xs font-sansBold uppercase mb-3 mt-3" style={{ letterSpacing: 1 }}>
              Acceso
            </Text>

            <Text className="text-ink text-xs font-sansSemiBold mb-1">Email *</Text>
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

            <Text className="text-ink text-xs font-sansSemiBold mb-1 mt-2">Contraseña *</Text>
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

            <Text className="text-ink text-xs font-sansSemiBold mb-1 mt-2">Repetir contraseña *</Text>
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

            <AvisoDocumentos documentos={catalogo.documentos} />

            <Pressable
              onPress={handleCrearCuenta}
              disabled={cargando}
              className="bg-action rounded-xl py-3 items-center mt-4"
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