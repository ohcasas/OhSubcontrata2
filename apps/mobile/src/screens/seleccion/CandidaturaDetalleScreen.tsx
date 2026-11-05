import { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable, Linking, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { NavigationProp, ParamListBase, RouteProp } from '@react-navigation/native';
import {
  PASOS_SEGUIMIENTO,
  TEXTO_ESTADO,
  esProcesoCerrado,
  mensajeDeErrorSeleccion,
  misEntrevistas,
  retirarCandidatura,
} from '../../services/seleccion';
import type { MiCandidatura, MiEntrevista } from '../../services/seleccion';
import { Aviso, BotonSecundario, Etiqueta, Tarjeta, fechaHora } from './ui';
import HiloMensajes from './HiloMensajes';

type Params = { CandidaturaDetalle: { candidatura: MiCandidatura } };

/** Estado, entrevistas y mensajes de una candidatura. Solo lo que es del candidato: nada del trabajo interno del equipo. */
export default function CandidaturaDetalleScreen() {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const { params } = useRoute<RouteProp<Params, 'CandidaturaDetalle'>>();
  const insets = useSafeAreaInsets();
  const [c, setC] = useState<MiCandidatura>(params.candidatura);
  const [entrevistas, setEntrevistas] = useState<MiEntrevista[]>([]);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      setEntrevistas(await misEntrevistas(c.id));
    } catch (e) {
      setError(mensajeDeErrorSeleccion(e));
    }
  }, [c.id]);

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [cargar]),
  );

  const cerrada = esProcesoCerrado(c.estado);
  const indiceActual = PASOS_SEGUIMIENTO.findIndex((p) => p.estados.includes(c.estado));
  const proximas = entrevistas.filter((e) => e.estado === 'programada');
  const otras = entrevistas.filter((e) => e.estado !== 'programada');

  const retirar = () =>
    Alert.alert('Retirar candidatura', 'Dejarás de participar en este proceso. ¿Seguro?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Retirar',
        style: 'destructive',
        onPress: async () => {
          try {
            await retirarCandidatura(c.id);
            setC({ ...c, estado: 'retirada' });
          } catch (e) {
            setError(mensajeDeErrorSeleccion(e));
          }
        },
      },
    ]);

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
      <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => navigation.goBack()} accessibilityRole="button" className="self-start py-3">
          <Text className="text-action text-sm font-sansSemiBold">‹ Volver</Text>
        </Pressable>
        <View className="flex-row flex-wrap">
          <Etiqueta texto={TEXTO_ESTADO[c.estado]} tono={cerrada ? 'gris' : 'azul'} />
        </View>
        <Text className="text-ink text-2xl font-sansBold mt-1">{c.oferta_titulo}</Text>
        {error !== null && <View className="mt-3"><Aviso texto={error} /></View>}

        {proximas.map((e) => (
          <View key={e.id} className="mt-4 bg-actionTint border border-border rounded-2xl p-4">
            <Text className="text-actionDark text-xs font-sansBold">ENTREVISTA PROGRAMADA</Text>
            <Text className="text-ink text-lg font-sansBold mt-1">{fechaHora(e.fecha_hora)}</Text>
            <Text className="text-inkMuted text-sm">
              {e.duracion_min} min · {e.modalidad}
            </Text>
            {e.lugar_enlace ? (
              <View className="mt-3">
                {/^https?:\/\//i.test(e.lugar_enlace) ? (
                  <Pressable onPress={() => Linking.openURL(e.lugar_enlace as string)} className="bg-action rounded-xl py-2.5 items-center">
                    <Text className="text-white font-sansBold text-sm">Abrir enlace</Text>
                  </Pressable>
                ) : (
                  <Text className="text-ink text-sm">{e.lugar_enlace}</Text>
                )}
              </View>
            ) : null}
          </View>
        ))}

        <Tarjeta>
          <Text className="text-ink text-base font-sansBold mb-2">Seguimiento</Text>
          {PASOS_SEGUIMIENTO.map((p, i) => {
            const hecho = !cerrada && indiceActual > i;
            const actual = !cerrada && indiceActual === i;
            return (
              <View key={p.clave} className="flex-row items-center mb-2">
                <View className={`w-5 h-5 rounded-full border-2 mr-3 ${hecho ? 'bg-action border-action' : actual ? 'border-action bg-surface' : 'border-borderStrong bg-surface'}`} />
                <Text className={`text-sm ${actual ? 'text-ink font-sansBold' : hecho ? 'text-ink' : 'text-inkMuted'}`}>{p.texto}</Text>
              </View>
            );
          })}
          <Text className="text-inkSubtle text-xs mt-1">Este estado lo actualiza una persona del equipo de selección.</Text>
        </Tarjeta>

        {otras.length > 0 && (
          <Tarjeta>
            <Text className="text-ink text-base font-sansBold mb-1">Entrevistas anteriores</Text>
            {otras.map((e) => (
              <Text key={e.id} className="text-inkMuted text-sm">
                {fechaHora(e.fecha_hora)} · {e.estado}
              </Text>
            ))}
          </Tarjeta>
        )}

        <Tarjeta>
          <Text className="text-ink text-base font-sansBold mb-2">Mensajes con el equipo de selección</Text>
          <HiloMensajes candidaturaId={c.id} cerrada={cerrada} />
        </Tarjeta>

        {!cerrada && <BotonSecundario texto="Retirar mi candidatura" onPress={retirar} />}
      </ScrollView>
    </View>
  );
}