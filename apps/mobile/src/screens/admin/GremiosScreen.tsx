import { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, RefreshControl, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { colors } from '../../design-system/tokens';
import ScreenHeader from '../../components/ScreenHeader';

type NivelPartner = 'bronce' | 'plata' | 'oro' | 'platino';

type Empresa = {
  id: string;
  nombre: string;
  especialidad: string | null;
  homologado: boolean;
  nivel_partner: NivelPartner;
  puntos_disponibles: number;
  rating_medio: number | null;
  obras_completadas: number;
};

const ETIQUETA_NIVEL: Record<NivelPartner, string> = {
  bronce: 'Bronce',
  plata: 'Plata',
  oro: 'Oro',
  platino: 'Platino',
};

export default function GremiosScreen() {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargarEmpresas = useCallback(async () => {
    setError(null);
    const { data, error: errorConsulta } = await supabase
      .from('empresas_subcontratistas')
      .select(
        'id, nombre, especialidad, homologado, nivel_partner, puntos_disponibles, rating_medio, obras_completadas',
      )
      .order('nombre', { ascending: true });

    if (errorConsulta) {
      setError('No se han podido cargar las empresas.');
      return;
    }
    setEmpresas((data as Empresa[] | null) ?? []);
  }, []);

  useEffect(() => {
    setCargando(true);
    cargarEmpresas().finally(() => setCargando(false));
  }, [cargarEmpresas]);

  const handleRefrescar = async () => {
    setRefrescando(true);
    await cargarEmpresas();
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
      <ScreenHeader title="Gremios" subtitle={`${empresas.length} empresas registradas`} />

      {error !== null && (
        <View className="bg-errorContainer mx-4 mt-3 rounded-lg px-3 py-2 flex-row items-center gap-2">
          <Feather name="alert-circle" size={16} color={colors.onErrorContainer} />
          <Text className="text-onErrorContainer text-sm flex-1">{error}</Text>
        </View>
      )}

      <FlatList
        data={empresas}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
        refreshControl={
          <RefreshControl refreshing={refrescando} onRefresh={handleRefrescar} colors={[colors.primary]} />
        }
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListEmptyComponent={
          error === null ? (
            <View className="items-center mt-10">
              <Feather name="users" size={28} color={colors.outline} />
              <Text className="text-onSurfaceVariant text-sm text-center mt-3">
                No hay empresas registradas todavía.
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <View className="bg-surfaceContainerLowest rounded-xl border border-outlineVariant p-3.5">
            <View className="flex-row items-start">
              <View className="w-9 h-9 rounded-lg bg-surfaceContainerLow items-center justify-center mr-2.5">
                <Feather name="briefcase" size={15} color={colors.onSurfaceVariant} />
              </View>
              <View className="flex-1">
                <View className="flex-row justify-between items-start">
                  <Text className="text-onSurface text-sm font-bold flex-1 pr-2">{item.nombre}</Text>
                  <View
                    className={`flex-row items-center gap-1 rounded-md px-2 py-0.5 ${
                      item.homologado ? 'bg-success/15' : 'bg-errorContainer'
                    }`}
                  >
                    <Feather
                      name={item.homologado ? 'check-circle' : 'alert-triangle'}
                      size={9}
                      color={item.homologado ? colors.success : colors.onErrorContainer}
                    />
                    <Text
                      className={`text-[10px] font-bold ${
                        item.homologado ? 'text-success' : 'text-onErrorContainer'
                      }`}
                    >
                      {item.homologado ? 'Homologada' : 'Sin homologar'}
                    </Text>
                  </View>
                </View>
                {item.especialidad !== null && (
                  <Text className="text-onSurfaceVariant text-xs mt-0.5">{item.especialidad}</Text>
                )}
              </View>
            </View>

            <View className="flex-row justify-between items-center mt-3 pt-3 border-t border-outlineVariant">
              <View className="flex-row items-center gap-1">
                <Feather name="award" size={11} color={colors.accentGold} />
                <Text className="text-onSurfaceVariant text-xs">
                  Nivel {ETIQUETA_NIVEL[item.nivel_partner]} ·{' '}
                  {item.puntos_disponibles.toLocaleString('es-ES')} pts
                </Text>
              </View>
              <View className="flex-row items-center gap-1">
                <Feather name="star" size={11} color={colors.accentGold} />
                <Text className="text-onSurfaceVariant text-xs">
                  {item.rating_medio !== null ? item.rating_medio.toFixed(1) : '—'} ·{' '}
                  {item.obras_completadas} obras
                </Text>
              </View>
            </View>
          </View>
        )}
      />
    </View>
  );
}
