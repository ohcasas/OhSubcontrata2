import { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, RefreshControl, ActivityIndicator, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { supabase } from '../../services/supabase';
import { colors } from '../../design-system/tokens';
import type { RootStackParamList } from '../../navigation/types';
import ScreenHeader from '../../components/ScreenHeader';

type NombreIcono = ComponentProps<typeof Feather>['name'];
type Estado = 'enviada' | 'en_revision' | 'aceptada' | 'rechazada';

type PostulacionConObra = {
  id: string;
  oferta_economica: number;
  estado: Estado;
  created_at: string;
  obra_id: string;
  obras: {
    titulo: string;
    referencia: string;
    moneda: string;
  } | null;
};

const ETIQUETA_ESTADO: Record<Estado, string> = {
  enviada: 'Enviada',
  en_revision: 'En revisión',
  aceptada: 'Aceptada',
  rechazada: 'No seleccionada',
};

const ICONO_ESTADO: Record<Estado, NombreIcono> = {
  enviada: 'clock',
  en_revision: 'eye',
  aceptada: 'check-circle',
  rechazada: 'x-circle',
};

const CLASES_ESTADO: Record<Estado, { badge: string; texto: string }> = {
  enviada: { badge: 'bg-surfaceContainerLow border border-outlineVariant', texto: 'text-onSurfaceVariant' },
  en_revision: { badge: 'bg-secondaryContainer', texto: 'text-onSecondaryContainer' },
  aceptada: { badge: 'bg-success/15', texto: 'text-success' },
  rechazada: { badge: 'bg-errorContainer', texto: 'text-onErrorContainer' },
};

function formatearMoneda(valor: number, moneda: string): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: moneda }).format(valor);
}

function formatearFechaHora(fechaIso: string): string {
  return new Date(fechaIso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function PostulacionesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();

  const [postulaciones, setPostulaciones] = useState<PostulacionConObra[]>([]);
  const [sinEmpresa, setSinEmpresa] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargarPostulaciones = useCallback(async () => {
    setError(null);

    const { data: userData } = await supabase.auth.getUser();
    const usuarioId = userData.user?.id;
    if (!usuarioId) return;

    const { data: perfilData } = await supabase
      .from('profiles')
      .select('empresa_id')
      .eq('id', usuarioId)
      .single();
    const empresaId = (perfilData?.empresa_id as string | null) ?? null;

    if (!empresaId) {
      setSinEmpresa(true);
      setPostulaciones([]);
      return;
    }
    setSinEmpresa(false);

    const { data, error: errorConsulta } = await supabase
      .from('postulaciones')
      .select('id, oferta_economica, estado, created_at, obra_id, obras(titulo, referencia, moneda)')
      .eq('empresa_id', empresaId)
      .order('created_at', { ascending: false });

    if (errorConsulta) {
      setError('No se han podido cargar tus postulaciones. Inténtalo de nuevo.');
      return;
    }
    setPostulaciones((data as unknown as PostulacionConObra[] | null) ?? []);
  }, []);

  useEffect(() => {
    setCargando(true);
    cargarPostulaciones().finally(() => setCargando(false));
  }, [cargarPostulaciones]);

  const handleRefrescar = async () => {
    setRefrescando(true);
    await cargarPostulaciones();
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
      <ScreenHeader title="Mis Postulaciones" />

      {error !== null && (
        <View className="bg-errorContainer mx-4 mt-3 rounded-lg px-3 py-2 flex-row items-center gap-2">
          <Feather name="alert-circle" size={16} color={colors.onErrorContainer} />
          <Text className="text-onErrorContainer text-sm flex-1">{error}</Text>
        </View>
      )}

      {sinEmpresa ? (
        <View className="items-center mt-16 px-6">
          <Feather name="briefcase" size={28} color={colors.outline} />
          <Text className="text-onSurface text-base font-semibold text-center mt-3">
            Tu usuario todavía no está vinculado a ninguna empresa subcontratista
          </Text>
          <Text className="text-onSurfaceVariant text-sm text-center mt-2">
            Contacta con OH Casas para que lo configuren y así puedas ver tus postulaciones.
          </Text>
        </View>
      ) : (
        <FlatList
          data={postulaciones}
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
                <Feather name="file-text" size={28} color={colors.outline} />
                <Text className="text-onSurface text-base font-semibold text-center mt-3">
                  Todavía no has postulado a ninguna obra
                </Text>
                <Text className="text-onSurfaceVariant text-sm text-center mt-2">
                  Ve a la pestaña Obras para ver las licitaciones abiertas.
                </Text>
              </View>
            ) : null
          }
          renderItem={({ item }) => {
            const clases = CLASES_ESTADO[item.estado];
            return (
              <Pressable
                onPress={() => navigation.navigate('DetalleObra', { obraId: item.obra_id })}
                className="bg-surfaceContainerLowest rounded-2xl border border-outlineVariant p-4"
              >
                <View className="flex-row justify-between items-start">
                  <View className="flex-1 pr-2">
                    {item.obras !== null && (
                      <Text className="text-onSurfaceVariant text-xs font-mono">
                        {item.obras.referencia}
                      </Text>
                    )}
                    <Text className="text-onSurface text-base font-bold mt-0.5">
                      {item.obras?.titulo ?? 'Obra ya no disponible'}
                    </Text>
                    <View className="flex-row items-center gap-1 mt-0.5">
                      <Feather name="calendar" size={11} color={colors.onSurfaceVariant} />
                      <Text className="text-onSurfaceVariant text-xs">
                        Enviada el {formatearFechaHora(item.created_at)}
                      </Text>
                    </View>
                  </View>
                  <View className={`flex-row items-center gap-1 rounded-md px-2 py-1 ${clases.badge}`}>
                    <Feather name={ICONO_ESTADO[item.estado]} size={10} color={colors[item.estado === 'aceptada' ? 'success' : item.estado === 'rechazada' ? 'error' : 'onSurfaceVariant']} />
                    <Text className={`text-[11px] font-bold ${clases.texto}`}>
                      {ETIQUETA_ESTADO[item.estado]}
                    </Text>
                  </View>
                </View>

                <View className="flex-row justify-between items-center mt-3 pt-3 border-t border-outlineVariant">
                  <Text className="text-onSurfaceVariant text-xs">Tu oferta</Text>
                  <Text className="text-onSurface text-sm font-extrabold">
                    {formatearMoneda(item.oferta_economica, item.obras?.moneda ?? 'EUR')}
                  </Text>
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}
