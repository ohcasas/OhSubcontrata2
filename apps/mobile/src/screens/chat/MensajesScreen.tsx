import { useCallback, useState } from 'react';
import { View, Text, Pressable, FlatList, RefreshControl, ActivityIndicator } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../../design-system/tokens';
import ScreenHeader from '../../components/ScreenHeader';
import { misConversaciones, refrescarNoLeidos, type Conversacion } from '../../services/chat';

function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter((p) => p !== '');
  return ((partes[0]?.[0] ?? '') + (partes.length > 1 ? partes[1][0] : '')).toUpperCase() || '?';
}

function cuando(iso: string): string {
  const f = new Date(iso);
  const hoy = new Date();
  if (f.toDateString() === hoy.toDateString()) {
    return f.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  }
  const ayer = new Date(hoy);
  ayer.setDate(hoy.getDate() - 1);
  if (f.toDateString() === ayer.toDateString()) return 'Ayer';
  return f.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

/** Bandeja de mensajes: el chat con Administración arriba y después las conversaciones privadas. */
export default function MensajesScreen() {
  const navigation = useNavigation<any>();
  const [lista, setLista] = useState<Conversacion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      setLista(await misConversaciones());
      setError(null);
      refrescarNoLeidos();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se han podido cargar los mensajes.');
    } finally {
      setCargando(false);
      setRefrescando(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      cargar();
      const reloj = setInterval(cargar, 20000);
      return () => clearInterval(reloj);
    }, [cargar]),
  );

  const abrir = (c: Conversacion) =>
    navigation.navigate('Chat', { conversacionId: c.id, nombre: c.nombre, tipo: c.tipo, otroId: c.otro_id });

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader
        title="Mensajes"
        rightElement={
          <Pressable
            onPress={() => navigation.navigate('ChatNuevo')}
            accessibilityLabel="Nuevo mensaje"
            className="w-11 h-11 rounded-full bg-action items-center justify-center"
          >
            <Feather name="edit-2" size={20} color={colors.white} />
          </Pressable>
        }
      />

      {cargando ? (
        <ActivityIndicator color={colors.action} className="mt-10" />
      ) : (
        <FlatList
          data={lista}
          keyExtractor={(c) => c.id}
          refreshControl={
            <RefreshControl
              refreshing={refrescando}
              onRefresh={() => {
                setRefrescando(true);
                cargar();
              }}
            />
          }
          contentContainerStyle={{ paddingBottom: 120 }}
          ListHeaderComponent={
            error !== null ? <Text className="text-error text-sm px-4 py-2">{error}</Text> : null
          }
          ListEmptyComponent={
            error === null ? (
              <View className="items-center px-8 mt-16">
                <Feather name="message-circle" size={36} color={colors.inkSubtle} />
                <Text className="text-ink text-base font-sansSemiBold mt-3">Aún no tienes conversaciones</Text>
                <Text className="text-inkMuted text-sm text-center mt-1">
                  Pulsa el lápiz de arriba para escribir a otra persona.
                </Text>
              </View>
            ) : null
          }
          renderItem={({ item }) => {
            const sinLeer = item.no_leidos > 0;
            const oficial = item.tipo === 'soporte' && item.otro_id === null;
            return (
              <Pressable
                onPress={() => abrir(item)}
                className={`flex-row items-center gap-3 px-4 py-3.5 ${sinLeer ? 'bg-actionTint' : ''}`}
                accessibilityLabel={`Conversación con ${item.nombre}`}
              >
                <View
                  className={`w-[52px] h-[52px] rounded-full items-center justify-center ${oficial ? 'bg-action' : 'bg-navySurface'}`}
                >
                  {oficial ? (
                    <Feather name="shield" size={24} color={colors.white} />
                  ) : (
                    <Text className="text-white text-lg font-sansSemiBold">{iniciales(item.nombre)}</Text>
                  )}
                </View>
                <View className="flex-1">
                  <View className="flex-row items-baseline gap-2">
                    <Text className="text-ink text-base font-sansSemiBold flex-1" numberOfLines={1}>
                      {item.nombre}
                    </Text>
                    <Text className={`text-xs ${sinLeer ? 'text-action font-sansSemiBold' : 'text-inkSubtle'}`}>
                      {cuando(item.ultimo_at)}
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-2 mt-0.5">
                    <Text
                      className={`text-sm flex-1 ${sinLeer ? 'text-ink font-sansSemiBold' : 'text-inkMuted'}`}
                      numberOfLines={1}
                    >
                      {item.ultimo_texto ?? 'Escribe el primer mensaje'}
                    </Text>
                    {sinLeer && (
                      <View className="min-w-[22px] h-[22px] px-1.5 rounded-full bg-action items-center justify-center">
                        <Text className="text-white text-xs font-sansBold">{item.no_leidos > 99 ? '99+' : item.no_leidos}</Text>
                      </View>
                    )}
                  </View>
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}