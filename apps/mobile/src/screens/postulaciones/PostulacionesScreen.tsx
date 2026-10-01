import { useCallback, useRef, useState } from 'react';
import { View, Text, FlatList, RefreshControl, ActivityIndicator, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { supabase } from '../../services/supabase';
import { colors } from '../../design-system/tokens';
import type { RootStackParamList } from '../../navigation/types';
import ScreenHeader from '../../components/ScreenHeader';
import CampanaNotificaciones from '../../components/CampanaNotificaciones';
import { formatearMoneda } from '../../utils/moneda';

type NombreIcono = ComponentProps<typeof Feather>['name'];
type Estado = 'enviada' | 'en_revision' | 'aceptada' | 'rechazada';
type EstadoObra = 'abierta' | 'cerrada' | 'adjudicada' | 'en_curso' | 'cancelada';

type PostulacionConObra = {
  id: string;
  oferta_economica: number;
  estado: Estado;
  motivo_rechazo: string | null;
  created_at: string;
  obra_id: string;
  obras: {
    titulo: string;
    referencia: string;
    moneda: string;
    estado: EstadoObra;
    puntos_bonus: number | null;
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

const CLASES_ESTADO: Record<Estado, { badge: string; texto: string; icono: string }> = {
  enviada: { badge: 'bg-actionTint', texto: 'text-action', icono: colors.action },
  en_revision: { badge: 'bg-warningTint', texto: 'text-warning', icono: colors.warning },
  aceptada: { badge: 'bg-successTint', texto: 'text-success', icono: colors.success },
  rechazada: { badge: 'bg-errorTint', texto: 'text-error', icono: colors.error },
};

// Progreso de una obra ya adjudicada a la empresa, tal y como lo marca el admin.
const PASOS_OBRA: { estado: EstadoObra; etiqueta: string }[] = [
  { estado: 'adjudicada', etiqueta: 'Adjudicada' },
  { estado: 'en_curso', etiqueta: 'En curso' },
  { estado: 'cerrada', etiqueta: 'Finalizada' },
];

const MENSAJE_PROGRESO: Partial<Record<EstadoObra, string>> = {
  adjudicada: 'Obra adjudicada a tu empresa. Pendiente de que OH Contratas la inicie.',
  en_curso: 'Obra en curso.',
  cerrada: 'Obra finalizada.',
};


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
  const primeraCarga = useRef(true);

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
      .select('id, oferta_economica, estado, motivo_rechazo, created_at, obra_id, obras(titulo, referencia, moneda, estado, puntos_bonus)')
      .eq('empresa_id', empresaId)
      .order('created_at', { ascending: false });

    if (errorConsulta) {
      setError('No se han podido cargar tus postulaciones. Inténtalo de nuevo.');
      return;
    }
    setPostulaciones((data as unknown as PostulacionConObra[] | null) ?? []);
  }, []);

  // Se recarga cada vez que la pestaña vuelve a estar en pantalla, para que
  // los cambios de estado que hace el admin (aceptar, iniciar, finalizar)
  // se vean sin tener que refrescar a mano. Solo la primera carga muestra
  // el spinner a pantalla completa.
  useFocusEffect(
    useCallback(() => {
      (async () => {
        if (primeraCarga.current) setCargando(true);
        await cargarPostulaciones();
        primeraCarga.current = false;
        setCargando(false);
      })();
    }, [cargarPostulaciones]),
  );

  const handleRefrescar = async () => {
    setRefrescando(true);
    await cargarPostulaciones();
    setRefrescando(false);
  };

  if (cargando) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <ActivityIndicator color={colors.action} />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader title="Postulaciones" rightElement={<CampanaNotificaciones />} />

      {error !== null && (
        <View className="bg-errorTint mx-4 mt-3 rounded-lg px-3 py-2 flex-row items-center gap-2">
          <Feather name="alert-circle" size={17} color={colors.error} />
          <Text className="text-error text-sm flex-1">{error}</Text>
        </View>
      )}

      {sinEmpresa ? (
        <View className="items-center mt-16 px-6">
          <Feather name="briefcase" size={28} color={colors.inkSubtle} />
          <Text className="text-ink text-base font-sansSemiBold text-center mt-3">
            Tu usuario todavía no está vinculado a ninguna empresa subcontratista
          </Text>
          <Text className="text-inkMuted text-sm text-center mt-2">
            Contacta con OH Contratas para que lo configuren y así puedas ver tus postulaciones.
          </Text>
        </View>
      ) : (
        <FlatList
          data={postulaciones}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 16 }}
          refreshControl={
            <RefreshControl refreshing={refrescando} onRefresh={handleRefrescar} colors={[colors.action]} />
          }
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          ListEmptyComponent={
            error === null ? (
              <View className="items-center mt-16 px-6">
                <Feather name="file-text" size={28} color={colors.inkSubtle} />
                <Text className="text-ink text-base font-sansSemiBold text-center mt-3">
                  Todavía no has postulado a ninguna obra
                </Text>
                <Text className="text-inkMuted text-sm text-center mt-2">
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
                className="bg-surface rounded-2xl border border-border p-4"
              >
                <View className="flex-row justify-between items-start">
                  <View className="flex-1 pr-2">
                    {item.obras !== null && (
                      <Text className="text-inkMuted text-xs font-mono">{item.obras.referencia}</Text>
                    )}
                    <Text className="text-ink text-base font-sansBold mt-0.5">
                      {item.obras?.titulo ?? 'Obra ya no disponible'}
                    </Text>
                    <View className="flex-row items-center gap-1 mt-0.5">
                      <Feather name="calendar" size={13} color={colors.inkMuted} />
                      <Text className="text-inkMuted text-xs">
                        Enviada el {formatearFechaHora(item.created_at)}
                      </Text>
                    </View>
                  </View>
                  <View className={`flex-row items-center gap-1 rounded-md px-2 py-1 ${clases.badge}`}>
                    <Feather name={ICONO_ESTADO[item.estado]} size={12} color={clases.icono} />
                    <Text className={`text-[13px] font-sansBold ${clases.texto}`}>
                      {ETIQUETA_ESTADO[item.estado]}
                    </Text>
                  </View>
                </View>

                <View className="flex-row justify-between items-center mt-3 pt-3 border-t border-border">
                  <Text className="text-inkMuted text-xs">Tu oferta</Text>
                  <Text className="text-ink text-sm font-sansBold">
                    {formatearMoneda(item.oferta_economica, item.obras?.moneda ?? 'EUR')}
                  </Text>
                </View>

                {item.estado === 'aceptada' &&
                  item.obras !== null &&
                  PASOS_OBRA.some((p) => p.estado === item.obras?.estado) &&
                  (() => {
                    const indice = PASOS_OBRA.findIndex((p) => p.estado === item.obras?.estado);
                    const bonus = item.obras?.puntos_bonus ?? 0;
                    return (
                      <View className="mt-3 pt-3 border-t border-border">
                        <View className="flex-row" style={{ gap: 4 }}>
                          {PASOS_OBRA.map((paso, i) => (
                            <View key={paso.estado} className="flex-1">
                              <View
                                style={{
                                  height: 4,
                                  borderRadius: 2,
                                  backgroundColor: i <= indice ? colors.action : colors.border,
                                }}
                              />
                              <Text
                                className={`text-[12px] mt-1 ${
                                  i === indice ? 'text-action font-sansBold' : 'text-inkMuted font-sansMedium'
                                }`}
                              >
                                {paso.etiqueta}
                              </Text>
                            </View>
                          ))}
                        </View>
                        <Text className="text-ink text-xs font-sansSemiBold mt-2">
                          {MENSAJE_PROGRESO[item.obras.estado]}
                          {item.obras.estado === 'cerrada' && bonus > 0 ? ` +${bonus} pts acreditados.` : ''}
                        </Text>
                      </View>
                    );
                  })()}

                {item.estado === 'rechazada' && item.motivo_rechazo !== null && item.motivo_rechazo.trim() !== '' && (
                  <View className="mt-3 pt-3 border-t border-border">
                    <Text className="text-inkMuted text-[12px] font-sansBold uppercase" style={{ letterSpacing: 0.5 }}>
                      Motivo
                    </Text>
                    <Text className="text-ink text-xs mt-0.5">{item.motivo_rechazo}</Text>
                  </View>
                )}

                {item.obras?.estado === 'cancelada' && (
                  <View className="flex-row items-center gap-1.5 bg-errorTint rounded-lg px-3 py-2 mt-2">
                    <Feather name="alert-triangle" size={14} color={colors.error} />
                    <Text className="text-error text-xs font-sansSemiBold flex-1">
                      Esta obra ha sido cancelada por OH Contratas.
                    </Text>
                  </View>
                )}
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}