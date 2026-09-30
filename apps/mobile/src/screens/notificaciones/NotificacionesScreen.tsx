import { useCallback, useRef, useState } from 'react';
import { View, Text, FlatList, RefreshControl, ActivityIndicator, Pressable } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { supabase } from '../../services/supabase';
import { colors } from '../../design-system/tokens';
import type { RootStackParamList } from '../../navigation/types';

type NombreIcono = ComponentProps<typeof Feather>['name'];

type Notificacion = {
  id: string;
  tipo: string;
  titulo: string;
  cuerpo: string;
  datos: { obra_id?: string } | null;
  leida: boolean;
  created_at: string;
};

const ICONO_POR_TIPO: Record<string, { icono: NombreIcono; color: string }> = {
  postulacion_aceptada: { icono: 'check-circle', color: colors.success },
  postulacion_rechazada: { icono: 'x-circle', color: colors.error },
  obra_finalizada: { icono: 'award', color: colors.gold },
  obra_revertida: { icono: 'rotate-ccw', color: colors.inkMuted },
  nivel_subido: { icono: 'trending-up', color: colors.gold },
  recordatorio_oferta: { icono: 'clock', color: colors.action },
  canje_completado: { icono: 'gift', color: colors.success },
  canje_cancelado: { icono: 'gift', color: colors.error },
};

function hace(fechaIso: string): string {
  const min = Math.round((Date.now() - Date.parse(fechaIso)) / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return d < 30 ? `hace ${d} d` : new Date(fechaIso).toLocaleDateString('es-ES');
}

export default function NotificacionesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [items, setItems] = useState<Notificacion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const primeraCarga = useRef(true);

  const cargar = useCallback(async () => {
    setError(null);
    const { data, error: errorConsulta } = await supabase
      .from('notificaciones')
      .select('id, tipo, titulo, cuerpo, datos, leida, created_at')
      .order('created_at', { ascending: false })
      .limit(100);
    if (errorConsulta) {
      setError('No se han podido cargar las notificaciones.');
      return;
    }
    setItems((data as Notificacion[] | null) ?? []);
  }, []);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        if (primeraCarga.current) setCargando(true);
        await cargar();
        primeraCarga.current = false;
        setCargando(false);
      })();
    }, [cargar]),
  );

  const marcarLeida = async (n: Notificacion) => {
    if (n.leida) return;
    setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, leida: true } : x)));
    await supabase.from('notificaciones').update({ leida: true }).eq('id', n.id);
  };

  const marcarTodas = async () => {
    setItems((prev) => prev.map((x) => ({ ...x, leida: true })));
    await supabase.from('notificaciones').update({ leida: true }).eq('leida', false);
  };

  const abrir = (n: Notificacion) => {
    marcarLeida(n);
    if (n.tipo === 'recordatorio_oferta' && n.datos?.obra_id) {
      navigation.navigate('DetalleObra', { obraId: n.datos.obra_id });
    } else if (n.tipo.startsWith('postulacion_') || n.tipo.startsWith('obra_')) {
      navigation.navigate('AppSubcontratista', { screen: 'Postulaciones' });
    } else if (n.tipo === 'nivel_subido' || n.tipo.startsWith('canje_')) {
      navigation.navigate('AppSubcontratista', { screen: 'Partner' });
    }
  };

  if (cargando) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <ActivityIndicator color={colors.action} />
      </View>
    );
  }

  const hayNoLeidas = items.some((n) => !n.leida);

  return (
    <View className="flex-1 bg-canvas">
      {error !== null && (
        <View className="bg-errorTint mx-4 mt-3 rounded-lg px-3 py-2 flex-row items-center gap-2">
          <Feather name="alert-circle" size={17} color={colors.error} />
          <Text className="text-error text-sm flex-1">{error}</Text>
        </View>
      )}

      <FlatList
        data={items}
        keyExtractor={(n) => n.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        refreshControl={
          <RefreshControl
            refreshing={refrescando}
            onRefresh={async () => {
              setRefrescando(true);
              await cargar();
              setRefrescando(false);
            }}
            colors={[colors.action]}
          />
        }
        ListHeaderComponent={
          hayNoLeidas ? (
            <Pressable onPress={marcarTodas} className="self-end mb-3">
              <Text className="text-action text-xs font-sansBold">Marcar todas como leídas</Text>
            </Pressable>
          ) : null
        }
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListEmptyComponent={
          error === null ? (
            <View className="items-center mt-16">
              <Feather name="bell-off" size={28} color={colors.inkSubtle} />
              <Text className="text-inkMuted text-sm text-center mt-3">Todavía no tienes notificaciones.</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          const estilo = ICONO_POR_TIPO[item.tipo] ?? { icono: 'bell' as NombreIcono, color: colors.action };
          return (
            <Pressable
              onPress={() => abrir(item)}
              className={`rounded-2xl border p-3.5 flex-row ${
                item.leida ? 'bg-surface border-border' : 'bg-actionTint border-action/30'
              }`}
              style={{ gap: 12 }}
            >
              <View className="rounded-full items-center justify-center bg-surface" style={{ width: 36, height: 36 }}>
                <Feather name={estilo.icono} size={17} color={estilo.color} />
              </View>
              <View className="flex-1">
                <View className="flex-row justify-between items-start" style={{ gap: 8 }}>
                  <Text className={`text-sm flex-1 ${item.leida ? 'font-sansSemiBold' : 'font-sansBold'} text-ink`}>
                    {item.titulo}
                  </Text>
                  <Text className="text-inkMuted text-[12px] mt-0.5">{hace(item.created_at)}</Text>
                </View>
                <Text className="text-inkMuted text-xs mt-1">{item.cuerpo}</Text>
              </View>
              {!item.leida && (
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.action, marginTop: 6 }} />
              )}
            </Pressable>
          );
        }}
      />
    </View>
  );
}