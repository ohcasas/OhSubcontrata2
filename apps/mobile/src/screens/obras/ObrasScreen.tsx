import { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, RefreshControl, ActivityIndicator, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { colors } from '../../design-system/tokens';
import type { RootStackParamList } from '../../navigation/types';
import ScreenHeader from '../../components/ScreenHeader';
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
  plazo_cierre: string | null;
  requisitos: string | null;
};

function formatearMoneda(valor: number, moneda: string): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: moneda }).format(valor);
}

function formatearFecha(fechaIso: string | null): string | null {
  if (fechaIso === null) return null;
  return new Date(fechaIso).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });
}

export default function ObrasScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();

  const [obras, setObras] = useState<Obra[]>([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargarObras = useCallback(async () => {
    setError(null);
    const { data, error: errorConsulta } = await supabase
      .from('obras')
      .select(
        'id, referencia, titulo, descripcion, especialidad_requerida, ubicacion, modulos, m2, presupuesto, moneda, puntos_bonus, fecha_inicio, duracion_dias, plazo_cierre, requisitos',
      )
      .eq('estado', 'abierta')
      .order('created_at', { ascending: false });

    if (errorConsulta) {
      setError('No se han podido cargar las obras. Comprueba tu conexión e inténtalo de nuevo.');
      return;
    }
    setObras((data as Obra[] | null) ?? []);
  }, []);

  useEffect(() => {
    setCargando(true);
    cargarObras().finally(() => setCargando(false));
  }, [cargarObras]);

  const handleRefrescar = async () => {
    setRefrescando(true);
    await cargarObras();
    setRefrescando(false);
  };

  if (cargando) {
    return (
      <View className="flex-1 items-center justify-center bg-surface">
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-surface">
      <ScreenHeader
        title="Obras Disponibles"
        subtitle={`${obras.length} licitación${obras.length === 1 ? '' : 'es'} abierta${obras.length === 1 ? '' : 's'}`}
      />

      {error !== null && (
        <View className="bg-errorContainer mx-4 mt-3 rounded-lg px-3 py-2 flex-row items-center gap-2">
          <Feather name="alert-circle" size={16} color={colors.onErrorContainer} />
          <Text className="text-onErrorContainer text-sm flex-1">{error}</Text>
        </View>
      )}

      <FlatList
        data={obras}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 16 }}
        refreshControl={
          <RefreshControl
            refreshing={refrescando}
            onRefresh={handleRefrescar}
            colors={[colors.primary]}
          />
        }
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        ListEmptyComponent={
          error === null ? (
            <View className="items-center mt-16 px-6">
              <Feather name="inbox" size={32} color={colors.outline} />
              <Text className="text-onSurface text-base font-semibold text-center mt-3">
                No hay licitaciones abiertas ahora mismo
              </Text>
              <Text className="text-onSurfaceVariant text-sm text-center mt-2">
                Vuelve más tarde o desliza hacia abajo para actualizar.
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <View className="bg-surfaceContainerLowest rounded-2xl border border-outlineVariant overflow-hidden">
            <ObraImagePlaceholder icon="home" />
            <View className="p-4">
              <View className="flex-row justify-between items-start">
                <View className="flex-1 pr-2">
                  <Text className="text-onSurfaceVariant text-xs font-mono">{item.referencia}</Text>
                  <Text className="text-onSurface text-base font-bold mt-0.5">{item.titulo}</Text>
                  {item.ubicacion !== null && (
                    <View className="flex-row items-center gap-1 mt-0.5">
                      <Feather name="map-pin" size={11} color={colors.onSurfaceVariant} />
                      <Text className="text-onSurfaceVariant text-xs">{item.ubicacion}</Text>
                    </View>
                  )}
                </View>
                <View className="items-end">
                  <Text className="text-onSurfaceVariant text-[10px] uppercase font-bold">
                    Presupuesto
                  </Text>
                  <Text className="text-onSurface text-base font-extrabold">
                    {formatearMoneda(item.presupuesto, item.moneda)}
                  </Text>
                </View>
              </View>

              <View className="flex-row flex-wrap gap-1.5 mt-3">
                {item.especialidad_requerida !== null && (
                  <View className="flex-row items-center gap-1 bg-surfaceContainerLow rounded-md px-2 py-1 border border-outlineVariant">
                    <Feather name="tool" size={10} color={colors.onSurface} />
                    <Text className="text-onSurface text-[11px] font-semibold">
                      {item.especialidad_requerida}
                    </Text>
                  </View>
                )}
                {item.modulos !== null && (
                  <View className="flex-row items-center gap-1 bg-surfaceContainerLow rounded-md px-2 py-1 border border-outlineVariant">
                    <Feather name="layers" size={10} color={colors.onSurface} />
                    <Text className="text-onSurface text-[11px] font-semibold">
                      {item.modulos} módulos
                    </Text>
                  </View>
                )}
                {item.m2 !== null && (
                  <View className="flex-row items-center gap-1 bg-surfaceContainerLow rounded-md px-2 py-1 border border-outlineVariant">
                    <Feather name="maximize" size={10} color={colors.onSurface} />
                    <Text className="text-onSurface text-[11px] font-semibold">{item.m2} m²</Text>
                  </View>
                )}
                {item.puntos_bonus !== null && item.puntos_bonus > 0 && (
                  <View className="flex-row items-center gap-1 bg-secondaryContainer rounded-md px-2 py-1">
                    <Feather name="award" size={10} color={colors.onSecondaryContainer} />
                    <Text className="text-onSecondaryContainer text-[11px] font-bold">
                      +{item.puntos_bonus} pts Club OH
                    </Text>
                  </View>
                )}
              </View>

              {item.descripcion !== null && (
                <Text className="text-onSurfaceVariant text-xs mt-3 leading-relaxed">
                  {item.descripcion}
                </Text>
              )}

              <View className="flex-row justify-between items-center mt-3 pt-3 border-t border-outlineVariant">
                <View className="flex-row items-center gap-1 flex-1 pr-2">
                  <Feather name="calendar" size={11} color={colors.onSurfaceVariant} />
                  <Text className="text-onSurfaceVariant text-[11px]">
                    {formatearFecha(item.fecha_inicio) !== null
                      ? `Inicio: ${formatearFecha(item.fecha_inicio)}`
                      : 'Fecha por confirmar'}
                    {item.duracion_dias !== null ? ` (${item.duracion_dias} días)` : ''}
                  </Text>
                </View>
                {item.requisitos !== null && (
                  <Text className="text-onSurfaceVariant text-[11px]">{item.requisitos}</Text>
                )}
              </View>

              <Pressable
                onPress={() => navigation.navigate('DetalleObra', { obraId: item.id })}
                className="bg-primary rounded-xl py-3 items-center mt-3"
              >
                <View className="flex-row items-center gap-2">
                  <Text className="text-onPrimary font-bold text-sm">Ver Licitación &amp; Postular</Text>
                  <Feather name="arrow-right" size={15} color={colors.onPrimary} />
                </View>
              </Pressable>
            </View>
          </View>
        )}
      />
    </View>
  );
}
