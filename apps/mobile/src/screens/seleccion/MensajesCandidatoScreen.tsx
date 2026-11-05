import { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { colors } from '../../design-system/tokens';
import { misCandidaturas } from '../../services/seleccion';
import type { MiCandidatura } from '../../services/seleccion';
import { Vacio } from './ui';
import HiloMensajes from './HiloMensajes';

/** Pestaña «Mensajes»: elige la candidatura y escribe al equipo de selección. */
export default function MensajesCandidatoScreen() {
  const insets = useSafeAreaInsets();
  const [lista, setLista] = useState<MiCandidatura[] | null>(null);
  const [elegida, setElegida] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      misCandidaturas()
        .then((l) => {
          setLista(l);
          setElegida((e) => e ?? l[0]?.id ?? null);
        })
        .catch(() => setLista([]));
    }, []),
  );

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
      <View className="px-4 pt-4 pb-2">
        <Text className="text-ink text-2xl font-sansBold">Mensajes</Text>
      </View>
      {lista === null ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.action} />
        </View>
      ) : lista.length === 0 ? (
        <Vacio titulo="Aún no hay conversaciones" texto="Podrás escribir al equipo cuando presentes una candidatura." />
      ) : (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView className="flex-1 px-4" keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}>
            {lista.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
                {lista.map((c) => (
                  <Pressable
                    key={c.id}
                    onPress={() => setElegida(c.id)}
                    className={`rounded-full px-3.5 py-1.5 mr-2 border ${elegida === c.id ? 'bg-action border-action' : 'bg-surface border-borderStrong'}`}
                  >
                    <Text className={`text-sm ${elegida === c.id ? 'text-white font-sansSemiBold' : 'text-ink'}`}>{c.oferta_titulo}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
            {elegida !== null && <HiloMensajes candidaturaId={elegida} />}
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}