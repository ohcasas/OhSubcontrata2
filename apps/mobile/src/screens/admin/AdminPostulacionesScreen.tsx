import { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, RefreshControl, ActivityIndicator, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { colors } from '../../design-system/tokens';
import ScreenHeader from '../../components/ScreenHeader';

type Estado = 'enviada' | 'en_revision' | 'aceptada' | 'rechazada';

type PostulacionCompleta = {
  id: string;
  oferta_economica: number;
  estado: Estado;
  created_at: string;
  obras: { titulo: string; referencia: string; moneda: string } | null;
  empresas_subcontratistas: { nombre: string } | null;
};

const ETIQUETA_ESTADO: Record<Estado, string> = {
  enviada: 'Enviada',
  en_revision: 'En revisión',
  aceptada: 'Aceptada',
  rechazada: 'No seleccionada',
};

const ESTILO_ESTADO: Record<Estado, { badge: string; texto: string }> = {
  enviada: { badge: 'bg-surfaceContainerHigh', texto: 'text-onSurfaceVariant' },
  en_revision: { badge: 'bg-secondaryContainer', texto: 'text-onSecondaryContainer' },
  aceptada: { badge: 'bg-success/15', texto: 'text-success' },
  rechazada: { badge: 'bg-errorContainer', texto: 'text-onErrorContainer' },
};

function formatearMoneda(valor: number, moneda: string): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: moneda }).format(valor);
}

export default function AdminPostulacionesScreen() {
  const [postulaciones, setPostulaciones] = useState<PostulacionCompleta[]>([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actualizandoId, setActualizandoId] = useState<string | null>(null);

  const cargarPostulaciones = useCallback(async () => {
    setError(null);
    const { data, error: errorConsulta } = await supabase
      .from('postulaciones')
      .select(
        'id, oferta_economica, estado, created_at, obras(titulo, referencia, moneda), empresas_subcontratistas(nombre)',
      )
      .order('created_at', { ascending: false });

    if (errorConsulta) {
      setError('No se han podido cargar las postulaciones.');
      return;
    }
    setPostulaciones((data as unknown as PostulacionCompleta[] | null) ?? []);
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

  const handleCambiarEstado = async (id: string, nuevoEstado: Estado) => {
    setActualizandoId(id);
    const { error: errorUpdate } = await supabase
      .from('postulaciones')
      .update({ estado: nuevoEstado })
      .eq('id', id);
    setActualizandoId(null);

    if (!errorUpdate) {
      setPostulaciones((prev) =>
        prev.map((p) => (p.id === id ? { ...p, estado: nuevoEstado } : p)),
      );
    }
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
      <ScreenHeader title="Postulaciones (Admin)" />

      {error !== null && (
        <View className="bg-errorContainer mx-4 mt-3 rounded-lg px-3 py-2 flex-row items-center gap-2">
          <Feather name="alert-circle" size={16} color={colors.onErrorContainer} />
          <Text className="text-onErrorContainer text-sm flex-1">{error}</Text>
        </View>
      )}

      <FlatList
        data={postulaciones}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
        refreshControl={
          <RefreshControl refreshing={refrescando} onRefresh={handleRefrescar} colors={[colors.primary]} />
        }
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListEmptyComponent={
          error === null ? (
            <View className="items-center mt-10">
              <Feather name="inbox" size={28} color={colors.outline} />
              <Text className="text-onSurfaceVariant text-sm text-center mt-3">
                No hay postulaciones todavía.
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          const estilo = ESTILO_ESTADO[item.estado];
          const pendienteDeDecision = item.estado === 'enviada' || item.estado === 'en_revision';
          return (
            <View className="bg-surfaceContainerLowest rounded-xl border border-outlineVariant p-3.5">
              <View className="flex-row justify-between items-start">
                <View className="flex-1 pr-2">
                  <Text className="text-onSurface text-sm font-bold">
                    {item.obras?.titulo ?? 'Obra eliminada'}
                  </Text>
                  <View className="flex-row items-center gap-1 mt-0.5">
                    <Feather name="briefcase" size={10} color={colors.onSurfaceVariant} />
                    <Text className="text-onSurfaceVariant text-xs">
                      {item.empresas_subcontratistas?.nombre ?? 'Empresa desconocida'}
                    </Text>
                  </View>
                </View>
                <View className={`rounded-md px-2 py-0.5 ${estilo.badge}`}>
                  <Text className={`text-[10px] font-bold ${estilo.texto}`}>
                    {ETIQUETA_ESTADO[item.estado]}
                  </Text>
                </View>
              </View>

              <Text className="text-onSurface text-sm font-extrabold mt-2">
                {formatearMoneda(item.oferta_economica, item.obras?.moneda ?? 'EUR')}
              </Text>

              {pendienteDeDecision && (
                <View className="flex-row gap-2 mt-3">
                  <Pressable
                    onPress={() => handleCambiarEstado(item.id, 'aceptada')}
                    disabled={actualizandoId === item.id}
                    className="flex-1 bg-success/15 rounded-lg py-2 items-center flex-row justify-center gap-1.5"
                  >
                    <Feather name="check" size={13} color={colors.success} />
                    <Text className="text-success text-xs font-bold">Aceptar</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => handleCambiarEstado(item.id, 'rechazada')}
                    disabled={actualizandoId === item.id}
                    className="flex-1 bg-errorContainer rounded-lg py-2 items-center flex-row justify-center gap-1.5"
                  >
                    <Feather name="x" size={13} color={colors.onErrorContainer} />
                    <Text className="text-onErrorContainer text-xs font-bold">Rechazar</Text>
                  </Pressable>
                </View>
              )}
            </View>
          );
        }}
      />
    </View>
  );
}
