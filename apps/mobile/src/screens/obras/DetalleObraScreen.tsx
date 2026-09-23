import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { colors } from '../../design-system/tokens';
import type { RootStackParamList } from '../../navigation/types';
import ObraImagePlaceholder from '../../components/ObraImagePlaceholder';

type Obra = {
  id: string;
  referencia: string;
  titulo: string;
  descripcion: string | null;
  especialidad_requerida: string | null;
  ubicacion: string | null;
  modulos: number | null;
  m2: number | null;
  presupuesto: number;
  moneda: string;
  puntos_bonus: number | null;
  fecha_inicio: string | null;
  duracion_dias: number | null;
  requisitos: string | null;
};

type Postulacion = {
  id: string;
  oferta_economica: number;
  estado: 'enviada' | 'en_revision' | 'aceptada' | 'rechazada';
};

function formatearMoneda(valor: number, moneda: string): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: moneda }).format(valor);
}

function formatearFecha(fechaIso: string | null): string | null {
  if (fechaIso === null) return null;
  return new Date(fechaIso).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });
}

const ETIQUETA_ESTADO: Record<Postulacion['estado'], string> = {
  enviada: 'Enviada — pendiente de revisión',
  en_revision: 'En revisión por OH Casas',
  aceptada: 'Aceptada',
  rechazada: 'No seleccionada esta vez',
};

export default function DetalleObraScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'DetalleObra'>>();
  const route = useRoute<RouteProp<RootStackParamList, 'DetalleObra'>>();
  const { obraId } = route.params;

  const [obra, setObra] = useState<Obra | null>(null);
  const [postulacionExistente, setPostulacionExistente] = useState<Postulacion | null>(null);
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  const [ofertaEconomica, setOfertaEconomica] = useState('');
  const [disponibilidad, setDisponibilidad] = useState('');
  const [motivacion, setMotivacion] = useState('');
  const [errorOferta, setErrorOferta] = useState<string | null>(null);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const cargarDatos = useCallback(async () => {
    setErrorCarga(null);

    const { data: obraData, error: errorObra } = await supabase
      .from('obras')
      .select(
        'id, referencia, titulo, descripcion, especialidad_requerida, ubicacion, modulos, m2, presupuesto, moneda, puntos_bonus, fecha_inicio, duracion_dias, requisitos',
      )
      .eq('id', obraId)
      .single();

    if (errorObra || !obraData) {
      setErrorCarga('No se ha podido cargar esta obra. Puede que ya no esté disponible.');
      return;
    }
    setObra(obraData as Obra);
    navigation.setOptions({ title: (obraData as Obra).titulo });

    const { data: userData } = await supabase.auth.getUser();
    const usuarioId = userData.user?.id;
    if (!usuarioId) return;

    const { data: perfilData } = await supabase
      .from('profiles')
      .select('empresa_id')
      .eq('id', usuarioId)
      .single();
    const idEmpresa = (perfilData?.empresa_id as string | null) ?? null;
    setEmpresaId(idEmpresa);

    if (idEmpresa) {
      const { data: postData } = await supabase
        .from('postulaciones')
        .select('id, oferta_economica, estado')
        .eq('obra_id', obraId)
        .eq('empresa_id', idEmpresa)
        .maybeSingle();
      if (postData) setPostulacionExistente(postData as Postulacion);
    }
  }, [obraId, navigation]);

  useEffect(() => {
    setCargando(true);
    cargarDatos().finally(() => setCargando(false));
  }, [cargarDatos]);

  const validarOferta = (): boolean => {
    const valor = Number(ofertaEconomica.replace(',', '.'));
    if (ofertaEconomica.trim() === '' || Number.isNaN(valor) || valor <= 0) {
      setErrorOferta('Introduce un importe válido.');
      return false;
    }
    setErrorOferta(null);
    return true;
  };

  const handleEnviarPostulacion = async () => {
    setErrorEnvio(null);
    if (!validarOferta()) return;

    if (!empresaId) {
      setErrorEnvio(
        'Tu usuario todavía no está vinculado a ninguna empresa subcontratista, así que no puedes postular. Contacta con OH Casas para que lo configuren.',
      );
      return;
    }

    setEnviando(true);
    const { data, error } = await supabase
      .from('postulaciones')
      .insert({
        obra_id: obraId,
        empresa_id: empresaId,
        oferta_economica: Number(ofertaEconomica.replace(',', '.')),
        disponibilidad_equipo: disponibilidad.trim() || null,
        motivacion: motivacion.trim() || null,
      })
      .select('id, oferta_economica, estado')
      .single();
    setEnviando(false);

    if (error) {
      setErrorEnvio('No se ha podido enviar la postulación. Inténtalo de nuevo.');
      return;
    }
    setPostulacionExistente(data as Postulacion);
  };

  if (cargando) {
    return (
      <View className="flex-1 items-center justify-center bg-surface">
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (errorCarga !== null || obra === null) {
    return (
      <View className="flex-1 items-center justify-center bg-surface px-6">
        <Feather name="alert-triangle" size={28} color={colors.outline} />
        <Text className="text-onSurface text-base font-semibold text-center mt-3">
          {errorCarga ?? 'Obra no encontrada.'}
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1 }}
    >
      <ScrollView className="flex-1 bg-surface" contentContainerStyle={{ paddingBottom: 16 }}>
        <ObraImagePlaceholder height={140} icon="home" rounded="all" />

        <View className="p-4">
          {/* Cabecera de la obra */}
          <View className="bg-primary rounded-2xl p-4">
            <Text className="text-onPrimary/70 text-xs font-mono">{obra.referencia}</Text>
            <Text className="text-onPrimary text-xl font-extrabold mt-1">{obra.titulo}</Text>
            {obra.ubicacion !== null && (
              <View className="flex-row items-center gap-1.5 mt-1">
                <Feather name="map-pin" size={12} color={colors.inverseOnSurface} />
                <Text className="text-onPrimary/80 text-sm">{obra.ubicacion}</Text>
              </View>
            )}
            <View className="flex-row justify-between items-end mt-4 pt-3 border-t border-onPrimary/20">
              <View>
                <Text className="text-onPrimary/70 text-[10px] uppercase font-bold">
                  Presupuesto licitado
                </Text>
                <Text className="text-onPrimary text-2xl font-extrabold">
                  {formatearMoneda(obra.presupuesto, obra.moneda)}
                </Text>
              </View>
              {obra.puntos_bonus !== null && obra.puntos_bonus > 0 && (
                <View className="bg-onPrimary/15 rounded-lg px-2.5 py-1 flex-row items-center gap-1">
                  <Feather name="award" size={12} color={colors.onPrimary} />
                  <Text className="text-onPrimary text-xs font-bold">
                    +{obra.puntos_bonus} pts Club OH
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Especificaciones */}
          <View className="bg-surfaceContainerLowest rounded-2xl border border-outlineVariant p-4 mt-3">
            <Text className="text-onSurface text-xs font-extrabold uppercase tracking-wider mb-3">
              Especificaciones
            </Text>
            <View className="flex-row flex-wrap gap-1.5">
              {obra.especialidad_requerida !== null && (
                <View className="flex-row items-center gap-1 bg-surfaceContainerLow rounded-md px-2 py-1 border border-outlineVariant">
                  <Feather name="tool" size={10} color={colors.onSurface} />
                  <Text className="text-onSurface text-[11px] font-semibold">
                    {obra.especialidad_requerida}
                  </Text>
                </View>
              )}
              {obra.modulos !== null && (
                <View className="flex-row items-center gap-1 bg-surfaceContainerLow rounded-md px-2 py-1 border border-outlineVariant">
                  <Feather name="layers" size={10} color={colors.onSurface} />
                  <Text className="text-onSurface text-[11px] font-semibold">
                    {obra.modulos} módulos
                  </Text>
                </View>
              )}
              {obra.m2 !== null && (
                <View className="flex-row items-center gap-1 bg-surfaceContainerLow rounded-md px-2 py-1 border border-outlineVariant">
                  <Feather name="maximize" size={10} color={colors.onSurface} />
                  <Text className="text-onSurface text-[11px] font-semibold">{obra.m2} m²</Text>
                </View>
              )}
            </View>
            <View className="flex-row justify-between items-center mt-3 pt-3 border-t border-outlineVariant">
              <View className="flex-row items-center gap-1 flex-1 pr-2">
                <Feather name="calendar" size={11} color={colors.onSurfaceVariant} />
                <Text className="text-onSurfaceVariant text-xs">
                  {formatearFecha(obra.fecha_inicio) !== null
                    ? `Inicio: ${formatearFecha(obra.fecha_inicio)}`
                    : 'Fecha por confirmar'}
                  {obra.duracion_dias !== null ? ` (${obra.duracion_dias} días)` : ''}
                </Text>
              </View>
              {obra.requisitos !== null && (
                <View className="flex-row items-center gap-1">
                  <Feather name="shield" size={11} color={colors.onSurfaceVariant} />
                  <Text className="text-onSurfaceVariant text-xs">{obra.requisitos}</Text>
                </View>
              )}
            </View>
          </View>

          {obra.descripcion !== null && (
            <View className="bg-surfaceContainerLowest rounded-2xl border border-outlineVariant p-4 mt-3">
              <Text className="text-onSurface text-xs font-extrabold uppercase tracking-wider mb-2">
                Alcance de los trabajos
              </Text>
              <Text className="text-onSurfaceVariant text-sm leading-relaxed">
                {obra.descripcion}
              </Text>
            </View>
          )}

          {/* Postulación: ya enviada, o formulario */}
          {postulacionExistente !== null ? (
            <View className="bg-secondaryContainer rounded-2xl p-4 mt-3">
              <View className="flex-row items-center gap-2">
                <Feather name="check-circle" size={16} color={colors.onSecondaryContainer} />
                <Text className="text-onSecondaryContainer text-sm font-bold">
                  Ya has postulado a esta obra
                </Text>
              </View>
              <Text className="text-onSecondaryContainer text-xs mt-2">
                Tu oferta: {formatearMoneda(postulacionExistente.oferta_economica, obra.moneda)}
              </Text>
              <Text className="text-onSecondaryContainer text-xs mt-0.5">
                Estado: {ETIQUETA_ESTADO[postulacionExistente.estado]}
              </Text>
            </View>
          ) : (
            <View className="bg-surfaceContainerLowest rounded-2xl border border-outlineVariant p-4 mt-3">
              <Text className="text-onSurface text-sm font-extrabold mb-3">
                Formulario de postulación
              </Text>

              {errorEnvio !== null && (
                <View className="bg-errorContainer rounded-lg px-3 py-2 mb-3 flex-row items-center gap-2">
                  <Feather name="alert-circle" size={16} color={colors.onErrorContainer} />
                  <Text className="text-onErrorContainer text-sm flex-1">{errorEnvio}</Text>
                </View>
              )}

              <Text className="text-onSurface text-xs font-semibold mb-1">
                Tu oferta económica (sin IVA) *
              </Text>
              <View className="flex-row items-center bg-surface border border-outlineVariant rounded-xl px-3 mb-1">
                <Feather name="dollar-sign" size={14} color={colors.outline} />
                <TextInput
                  value={ofertaEconomica}
                  onChangeText={setOfertaEconomica}
                  keyboardType="decimal-pad"
                  placeholder="0,00 €"
                  placeholderTextColor={colors.outline}
                  editable={!enviando}
                  className="flex-1 py-3 pl-2 text-onSurface"
                />
              </View>
              {errorOferta !== null && (
                <Text className="text-error text-xs mb-1">{errorOferta}</Text>
              )}
              <Text className="text-onSurfaceVariant text-[11px] mb-3">
                Presupuesto máximo fijado por OH Casas:{' '}
                {formatearMoneda(obra.presupuesto, obra.moneda)}
              </Text>

              <Text className="text-onSurface text-xs font-semibold mb-1">
                Disponibilidad del equipo
              </Text>
              <View className="flex-row items-center bg-surface border border-outlineVariant rounded-xl px-3 mb-3">
                <Feather name="users" size={14} color={colors.outline} />
                <TextInput
                  value={disponibilidad}
                  onChangeText={setDisponibilidad}
                  placeholder="Ej: inmediata, 3 técnicos certificados"
                  placeholderTextColor={colors.outline}
                  editable={!enviando}
                  className="flex-1 py-3 pl-2 text-onSurface"
                />
              </View>

              <Text className="text-onSurface text-xs font-semibold mb-1">
                ¿Por qué tu equipo es el ideal para esta obra?
              </Text>
              <View className="flex-row bg-surface border border-outlineVariant rounded-xl px-3 mb-1">
                <Feather name="message-square" size={14} color={colors.outline} style={{ marginTop: 12 }} />
                <TextInput
                  value={motivacion}
                  onChangeText={setMotivacion}
                  multiline
                  numberOfLines={4}
                  placeholder="Cuéntanos tu experiencia en proyectos similares..."
                  placeholderTextColor={colors.outline}
                  editable={!enviando}
                  className="flex-1 py-3 pl-2 text-onSurface"
                  style={{ minHeight: 90, textAlignVertical: 'top' }}
                />
              </View>

              <View className="bg-surfaceContainerLow rounded-lg px-3 py-2 mt-3 mb-3 flex-row items-start gap-2">
                <Feather name="info" size={13} color={colors.onSurfaceVariant} style={{ marginTop: 1 }} />
                <Text className="text-onSurfaceVariant text-[11px] flex-1">
                  La opción de adjuntar presupuesto desglosado y documentación llegará en una
                  próxima fase.
                </Text>
              </View>

              <Pressable
                onPress={handleEnviarPostulacion}
                disabled={enviando}
                className="bg-primary rounded-xl py-3 items-center"
              >
                <View className="flex-row items-center justify-center gap-2">
                  {enviando ? (
                    <ActivityIndicator color={colors.onPrimary} />
                  ) : (
                    <Feather name="send" size={15} color={colors.onPrimary} />
                  )}
                  <Text className="text-onPrimary font-bold text-sm">
                    {enviando ? 'Enviando…' : 'Enviar Propuesta de Subcontratación'}
                  </Text>
                </View>
              </Pressable>
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
