import { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, RefreshControl, ActivityIndicator, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { ROLES_RED } from '../../constants/perfiles';
import { colors } from '../../design-system/tokens';
import type { RootStackParamList } from '../../navigation/types';
import ScreenHeader from '../../components/ScreenHeader';
import { ETIQUETA_NIVEL, ORDEN_NIVELES, UMBRAL_NIVEL } from '../../constants/niveles';
import type { NivelPartner } from '../../constants/niveles';

type Empresa = {
  id: string;
  nombre: string;
  especialidad: string | null;
  homologado: boolean;
  nivel_partner: NivelPartner;
  puntos_disponibles: number;
  puntos_totales: number;
  rating_medio: number | null;
  obras_completadas: number;
};

export default function GremiosScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filtroNivel, setFiltroNivel] = useState<NivelPartner | 'todos'>('todos');

  const cargarEmpresas = useCallback(async () => {
    setError(null);
    // Cada cuenta de OH Conecta (arquitecto, promotor, recomendador...) crea
    // también una fila en empresas_subcontratistas. Aquí solo interesan los
    // Oficios, así que se descartan las empresas que pertenecen a esos perfiles.
    const [{ data, error: errorConsulta }, { data: ajenas }] = await Promise.all([
      supabase
        .from('empresas_subcontratistas')
        .select(
          'id, nombre, especialidad, homologado, nivel_partner, puntos_disponibles, puntos_totales, rating_medio, obras_completadas',
        )
        .order('nombre', { ascending: true }),
      supabase.from('profiles').select('empresa_id').in('role', ROLES_RED).not('empresa_id', 'is', null),
    ]);

    if (errorConsulta) {
      setError('No se han podido cargar las empresas.');
      return;
    }
    const idsAjenos = new Set(((ajenas as { empresa_id: string }[] | null) ?? []).map((p) => p.empresa_id));
    setEmpresas(((data as Empresa[] | null) ?? []).filter((e) => !idsAjenos.has(e.id)));
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
      <View className="flex-1 items-center justify-center bg-canvas">
        <ActivityIndicator color={colors.action} />
      </View>
    );
  }

  const conteoPorNivel = ORDEN_NIVELES.reduce(
    (acc, nivel) => ({ ...acc, [nivel]: empresas.filter((e) => e.nivel_partner === nivel).length }),
    {} as Record<NivelPartner, number>,
  );
  // Filtrando por categoría se ordena por puntos (de más a menos), que es
  // lo que interesa ver dentro de un nivel: quién está cerca de subir.
  const empresasVisibles =
    filtroNivel === 'todos'
      ? empresas
      : empresas
          .filter((e) => e.nivel_partner === filtroNivel)
          .sort((a, b) => b.puntos_totales - a.puntos_totales);

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader title="Gremios" subtitle={`${empresas.length} empresas registradas`} />

      <View className="px-4 pt-3">
        <View className="flex-row flex-wrap" style={{ gap: 8 }}>
          {(['todos', ...ORDEN_NIVELES] as const).map((opcion) => {
            const activo = filtroNivel === opcion;
            const cuenta = opcion === 'todos' ? empresas.length : conteoPorNivel[opcion];
            return (
              <Pressable
                key={opcion}
                onPress={() => setFiltroNivel(opcion)}
                className={`flex-row items-center gap-1.5 rounded-full px-3 py-1.5 border ${
                  activo ? 'bg-action border-action' : 'bg-surface border-border'
                }`}
              >
                <Text className={`text-xs font-sansBold ${activo ? 'text-white' : 'text-ink'}`}>
                  {opcion === 'todos' ? 'Todas' : ETIQUETA_NIVEL[opcion]}
                </Text>
                <Text className={`text-[13px] font-sansSemiBold ${activo ? 'text-white/80' : 'text-inkMuted'}`}>
                  {cuenta}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text className="text-inkMuted text-[13px] mt-2">
          Puntos para subir de nivel: Plata {UMBRAL_NIVEL.plata.toLocaleString('es-ES')} · Oro{' '}
          {UMBRAL_NIVEL.oro.toLocaleString('es-ES')} · Platino {UMBRAL_NIVEL.platino.toLocaleString('es-ES')}
        </Text>
      </View>

      {error !== null && (
        <View className="bg-errorTint mx-4 mt-3 rounded-lg px-3 py-2 flex-row items-center gap-2">
          <Feather name="alert-circle" size={17} color={colors.error} />
          <Text className="text-error text-sm flex-1">{error}</Text>
        </View>
      )}

      <FlatList
        data={empresasVisibles}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
        refreshControl={
          <RefreshControl refreshing={refrescando} onRefresh={handleRefrescar} colors={[colors.action]} />
        }
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListEmptyComponent={
          error === null ? (
            <View className="items-center mt-10">
              <Feather name="users" size={28} color={colors.inkSubtle} />
              <Text className="text-inkMuted text-sm text-center mt-3">
                {filtroNivel === 'todos'
                  ? 'No hay empresas registradas todavía.'
                  : `Ninguna empresa en nivel ${ETIQUETA_NIVEL[filtroNivel]} todavía.`}
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => navigation.navigate('GremioDetalle', { empresaId: item.id })}
            className="bg-surface rounded-xl border border-border p-3.5"
          >
            <View className="flex-row items-start">
              <View className="w-9 h-9 rounded-lg bg-canvas items-center justify-center mr-2.5">
                <Feather name="briefcase" size={16} color={colors.inkMuted} />
              </View>
              <View className="flex-1">
                <View className="flex-row justify-between items-start">
                  <Text className="text-ink text-sm font-sansBold flex-1 pr-2">{item.nombre}</Text>
                  <View
                    className={`flex-row items-center gap-1 rounded-md px-2 py-0.5 ${
                      item.homologado ? 'bg-successTint' : 'bg-errorTint'
                    }`}
                  >
                    <Feather
                      name={item.homologado ? 'check-circle' : 'alert-triangle'}
                      size={11}
                      color={item.homologado ? colors.success : colors.error}
                    />
                    <Text
                      className={`text-[12px] font-sansBold ${
                        item.homologado ? 'text-success' : 'text-error'
                      }`}
                    >
                      {item.homologado ? 'Homologada' : 'Sin homologar'}
                    </Text>
                  </View>
                </View>
                {item.especialidad !== null && (
                  <Text className="text-inkMuted text-xs mt-0.5">{item.especialidad}</Text>
                )}
              </View>
            </View>

            <View className="flex-row justify-between items-center mt-3 pt-3 border-t border-border">
              <View className="flex-row items-center gap-1">
                <Feather name="award" size={13} color={colors.gold} />
                <Text className="text-inkMuted text-xs">
                  Nivel {ETIQUETA_NIVEL[item.nivel_partner]} ·{' '}
                  {item.puntos_totales.toLocaleString('es-ES')} pts
                </Text>
              </View>
              <View className="flex-row items-center gap-1">
                <Feather name="star" size={13} color={colors.gold} />
                <Text className="text-inkMuted text-xs">
                  {item.rating_medio !== null ? item.rating_medio.toFixed(1) : '—'} ·{' '}
                  {item.obras_completadas} obras
                </Text>
              </View>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}