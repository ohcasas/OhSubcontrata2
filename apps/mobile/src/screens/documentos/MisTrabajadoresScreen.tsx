import { useCallback, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, ActivityIndicator, Pressable } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { colors } from '../../design-system/tokens';
import { misTrabajadores, type TrabajadorApp } from '../../services/documentos';
import type { RootStackParamList } from '../../navigation/types';
import { formatearFecha } from './TarjetaDocumento';

const ESTILO_SEMAFORO = {
  verde: { fondo: 'bg-successTint', texto: 'text-success', etiqueta: 'Al día' },
  ambar: { fondo: 'bg-warningTint', texto: 'text-warning', etiqueta: 'Pendiente' },
  rojo: { fondo: 'bg-errorTint', texto: 'text-error', etiqueta: 'Incidencias' },
} as const;

export default function MisTrabajadoresScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [trabajadores, setTrabajadores] = useState<TrabajadorApp[]>([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    try {
      setTrabajadores(await misTrabajadores());
      setError(null);
    } catch {
      setError('No se han podido cargar tus trabajadores. Tira hacia abajo para reintentar.');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let activo = true;
      recargar().finally(() => {
        if (activo) setCargando(false);
      });
      return () => {
        activo = false;
      };
    }, [recargar]),
  );

  const refrescar = async () => {
    setRefrescando(true);
    await recargar();
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
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={refrescar} colors={[colors.action]} />}
      >
        <Text className="text-inkMuted text-sm leading-relaxed mb-3">
          Da de alta a las personas que trabajan para ti y sube la documentación de cada una. Cada documento caduca y te
          avisamos antes de que ocurra.
        </Text>

        <Pressable
          onPress={() => navigation.navigate('TrabajadorForm', {})}
          className="bg-action rounded-xl py-3 items-center flex-row justify-center gap-2 mb-3"
        >
          <Feather name="plus" size={16} color={colors.white} />
          <Text className="text-white font-sansBold text-sm">Añadir trabajador</Text>
        </Pressable>

        {error !== null && (
          <View className="bg-errorTint rounded-lg px-3 py-2 mb-3 flex-row items-center gap-2">
            <Feather name="alert-circle" size={16} color={colors.error} />
            <Text className="text-error text-sm flex-1">{error}</Text>
          </View>
        )}

        {trabajadores.length === 0 && error === null && (
          <Text className="text-inkMuted text-sm text-center mt-6">Todavía no has añadido ningún trabajador.</Text>
        )}

        <View className="gap-2.5">
          {trabajadores.map((t) => {
            const estilo = t.activo ? ESTILO_SEMAFORO[t.semaforo] : { fondo: 'bg-canvas', texto: 'text-inkMuted', etiqueta: 'De baja' };
            return (
              <Pressable
                key={t.id}
                onPress={() => navigation.navigate('TrabajadorDetalle', { trabajadorId: t.id })}
                className="bg-surface rounded-xl border border-border p-3.5"
              >
                <View className="flex-row justify-between items-start">
                  <View className="flex-1 pr-2">
                    <Text className="text-ink text-sm font-sansBold">
                      {t.nombre} {t.apellidos ?? ''}
                    </Text>
                    <Text className="text-inkMuted text-xs mt-0.5">
                      {t.dni}
                      {t.puesto !== null ? ` · ${t.puesto}` : ''}
                    </Text>
                  </View>
                  <View className={`rounded-md px-2 py-0.5 ${estilo.fondo}`}>
                    <Text className={`text-[11px] font-sansBold ${estilo.texto}`}>{estilo.etiqueta}</Text>
                  </View>
                </View>
                {t.activo && (
                  <Text className="text-inkMuted text-xs mt-2">
                    {t.aprobados} de {t.requeridos} documentos obligatorios al día
                    {t.proxima_caducidad !== null ? ` · próxima caducidad ${formatearFecha(t.proxima_caducidad)}` : ''}
                  </Text>
                )}
                <View className="flex-row items-center gap-1 mt-2">
                  <Text className="text-action text-xs font-sansSemiBold">Ver documentos</Text>
                  <Feather name="chevron-right" size={14} color={colors.action} />
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}