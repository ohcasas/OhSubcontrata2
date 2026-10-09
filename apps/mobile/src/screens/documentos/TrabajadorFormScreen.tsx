import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { colors } from '../../design-system/tokens';
import { guardarTrabajador, mensajeDeError, misTrabajadores, type DatosTrabajador } from '../../services/documentos';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'TrabajadorForm'>;

const VACIO: DatosTrabajador = {
  nombre: '',
  apellidos: '',
  dni: '',
  puesto: '',
  telefono: '',
  email: '',
  fecha_alta: null,
  activo: true,
  notas: '',
};

function Campo({
  etiqueta,
  valor,
  onCambio,
  obligatorio,
  ...resto
}: {
  etiqueta: string;
  valor: string;
  onCambio: (v: string) => void;
  obligatorio?: boolean;
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
  autoCapitalize?: 'none' | 'words' | 'characters';
  multiline?: boolean;
}) {
  return (
    <View className="mb-3">
      <Text className="text-ink text-xs font-sansSemiBold mb-1">
        {etiqueta}
        {obligatorio ? ' *' : ''}
      </Text>
      <TextInput
        value={valor}
        onChangeText={onCambio}
        placeholderTextColor={colors.inkSubtle}
        className="bg-surface border border-border rounded-xl px-3 py-2.5 text-ink text-sm"
        style={resto.multiline ? { minHeight: 70, textAlignVertical: 'top' } : undefined}
        {...resto}
      />
    </View>
  );
}

export default function TrabajadorFormScreen({ route, navigation }: Props) {
  const trabajadorId = route.params?.trabajadorId ?? null;
  const [datos, setDatos] = useState<DatosTrabajador>(VACIO);
  const [cargando, setCargando] = useState(trabajadorId !== null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (trabajadorId === null) return;
    let activo = true;
    misTrabajadores()
      .then((lista) => {
        const t = lista.find((x) => x.id === trabajadorId);
        if (activo && t !== undefined) {
          setDatos({
            nombre: t.nombre,
            apellidos: t.apellidos ?? '',
            dni: t.dni,
            puesto: t.puesto ?? '',
            telefono: t.telefono ?? '',
            email: t.email ?? '',
            fecha_alta: t.fecha_alta,
            activo: t.activo,
            notas: t.notas ?? '',
          });
        }
      })
      .catch(() => {
        if (activo) setError('No se han podido cargar los datos del trabajador.');
      })
      .finally(() => {
        if (activo) setCargando(false);
      });
    return () => {
      activo = false;
    };
  }, [trabajadorId]);

  const cambiar = (campo: keyof DatosTrabajador) => (v: string) => setDatos((d) => ({ ...d, [campo]: v }));

  const guardar = async () => {
    setError(null);
    if (datos.nombre.trim() === '') {
      setError('Escribe el nombre del trabajador.');
      return;
    }
    if (datos.dni.trim() === '') {
      setError('Escribe el DNI o NIE del trabajador.');
      return;
    }
    setGuardando(true);
    try {
      const id = await guardarTrabajador(trabajadorId, datos);
      if (trabajadorId === null) {
        // Trabajador nuevo: se va directo a su ficha para subir la documentación
        navigation.replace('TrabajadorDetalle', { trabajadorId: id });
      } else {
        navigation.goBack();
      }
    } catch (e) {
      setError(mensajeDeError(e));
      setGuardando(false);
    }
  };

  if (cargando) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <ActivityIndicator color={colors.action} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView className="flex-1 bg-canvas" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        {error !== null && (
          <View className="bg-errorTint rounded-lg px-3 py-2 mb-3 flex-row items-center gap-2">
            <Feather name="alert-circle" size={16} color={colors.error} />
            <Text className="text-error text-sm flex-1">{error}</Text>
          </View>
        )}

        <Campo etiqueta="Nombre" valor={datos.nombre} onCambio={cambiar('nombre')} obligatorio autoCapitalize="words" />
        <Campo etiqueta="Apellidos" valor={datos.apellidos} onCambio={cambiar('apellidos')} autoCapitalize="words" />
        <Campo etiqueta="DNI o NIE" valor={datos.dni} onCambio={cambiar('dni')} obligatorio autoCapitalize="characters" />
        <Campo etiqueta="Puesto" valor={datos.puesto} onCambio={cambiar('puesto')} autoCapitalize="words" />
        <Campo etiqueta="Teléfono" valor={datos.telefono} onCambio={cambiar('telefono')} keyboardType="phone-pad" />
        <Campo
          etiqueta="Correo electrónico"
          valor={datos.email}
          onCambio={cambiar('email')}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <Campo etiqueta="Notas" valor={datos.notas} onCambio={cambiar('notas')} multiline />

        {trabajadorId !== null && (
          <Pressable
            onPress={() => setDatos((d) => ({ ...d, activo: !d.activo }))}
            className="flex-row items-center gap-2 bg-surface border border-border rounded-xl px-3 py-3 mb-3"
          >
            <Feather name={datos.activo ? 'check-square' : 'square'} size={18} color={datos.activo ? colors.action : colors.inkMuted} />
            <Text className="text-ink text-sm flex-1">{datos.activo ? 'Trabaja con nosotros' : 'De baja (ya no trabaja con nosotros)'}</Text>
          </Pressable>
        )}

        <Pressable
          onPress={guardar}
          disabled={guardando}
          className="bg-action rounded-xl py-3 items-center flex-row justify-center gap-2 mt-1"
        >
          {guardando ? <ActivityIndicator color={colors.white} /> : <Feather name="check" size={16} color={colors.white} />}
          <Text className="text-white font-sansBold text-sm">{guardando ? 'Guardando…' : 'Guardar'}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}