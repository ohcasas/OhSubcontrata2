import { useCallback, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NavigationProp, ParamListBase } from '@react-navigation/native';
import { colors } from '../../design-system/tokens';
import { misCandidaturas, mensajeDeErrorSeleccion, TEXTO_ESTADO, esProcesoCerrado } from '../../services/seleccion';
import type { MiCandidatura } from '../../services/seleccion';
import { Aviso, BotonPrimario, Etiqueta, Tarjeta, Vacio, fechaCorta } from './ui';

/** Pestaña «Mi candidatura»: lista de candidaturas con su estado. El detalle se abre al pulsar. */
export default function MiCandidaturaScreen() {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const insets = useSafeAreaInsets();
  const [lista, setLista] = useState<MiCandidatura[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refrescando, setRefrescando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setError(null);
      setLista(await misCandidaturas());
    } catch (e) {
      setError(mensajeDeErrorSeleccion(e));
      setLista((l) => l ?? []);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [cargar]),
  );

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
      <View className="px-4 pt-4 pb-2">
        <Text className="text-ink text-[13px] font-sansSemiBold uppercase" style={{ letterSpacing: 2.2 }}>
          3B CONECTA
        </Text>
        <Text className="text-ink text-2xl font-sansBold mt-1">Mi candidatura</Text>
      </View>
      {lista === null ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.action} />
        </View>
      ) : (
        <ScrollView
          className="flex-1 px-4"
          contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
          refreshControl={
            <RefreshControl
              refreshing={refrescando}
              onRefresh={async () => {
                setRefrescando(true);
                await cargar();
                setRefrescando(false);
              }}
            />
          }
        >
          {error !== null && <Aviso texto={error} />}
          {lista.length === 0 && error === null && (
            <>
              <Vacio titulo="Todavía no has presentado ninguna candidatura" texto="Mira las ofertas abiertas y presenta la tuya." />
              <BotonPrimario texto="Ver ofertas" onPress={() => navigation.navigate('Ofertas')} />
            </>
          )}
          {lista.map((c) => (
            <Tarjeta key={c.id} onPress={() => navigation.navigate('CandidaturaDetalle', { candidatura: c })}>
              <View className="flex-row flex-wrap">
                <Etiqueta
                  texto={TEXTO_ESTADO[c.estado]}
                  tono={c.estado === 'contratada' || c.estado === 'oferta_enviada' ? 'verde' : esProcesoCerrado(c.estado) ? 'gris' : 'azul'}
                />
              </View>
              <Text className="text-ink text-base font-sansBold mt-1">{c.oferta_titulo}</Text>
              <Text className="text-inkMuted text-xs mt-0.5">Enviada el {fechaCorta(c.created_at)} · actualizada el {fechaCorta(c.updated_at)}</Text>
            </Tarjeta>
          ))}
        </ScrollView>
      )}
    </View>
  );
}