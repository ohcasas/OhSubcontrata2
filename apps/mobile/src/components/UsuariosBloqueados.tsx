import { useState } from 'react';
import { View, Text, Pressable, Modal, ActivityIndicator, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../design-system/tokens';
import { misBloqueos, desbloquearUsuario, type UsuarioBloqueado } from '../services/moderacion';

/** Enlace «Usuarios bloqueados» (para el perfil) con la lista y el botón de desbloquear. */
export default function UsuariosBloqueados() {
  const [abierto, setAbierto] = useState(false);
  const [lista, setLista] = useState<UsuarioBloqueado[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const abrir = async () => {
    setAbierto(true);
    setError(null);
    setLista(null);
    try {
      setLista(await misBloqueos());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se ha podido cargar la lista.');
      setLista([]);
    }
  };

  const desbloquear = async (id: string) => {
    try {
      await desbloquearUsuario(id);
      setLista((l) => (l ?? []).filter((u) => u.usuario_id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se ha podido desbloquear.');
    }
  };

  return (
    <>
      <Pressable onPress={abrir} className="items-center py-2">
        <Text className="text-inkMuted text-xs underline">Usuarios bloqueados</Text>
      </Pressable>
      <Modal visible={abierto} transparent animationType="slide" onRequestClose={() => setAbierto(false)}>
        <Pressable onPress={() => setAbierto(false)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }} />
        <View className="bg-surface rounded-t-3xl px-5 pt-4 pb-8" style={{ maxHeight: '75%' }}>
          <View className="flex-row justify-between items-center mb-3">
            <Text className="text-ink text-lg font-sansBold">Usuarios bloqueados</Text>
            <Pressable onPress={() => setAbierto(false)} hitSlop={10}>
              <Feather name="x" size={20} color={colors.inkMuted} />
            </Pressable>
          </View>
          {lista === null ? (
            <ActivityIndicator color={colors.action} />
          ) : lista.length === 0 ? (
            <Text className="text-inkMuted text-sm py-3">No has bloqueado a nadie.</Text>
          ) : (
            <ScrollView>
              {lista.map((u) => (
                <View key={u.usuario_id} className="flex-row items-center justify-between py-3 border-b border-border">
                  <Text className="text-ink text-sm flex-1 pr-2">{u.nombre}</Text>
                  <Pressable onPress={() => desbloquear(u.usuario_id)} className="border border-border rounded-lg px-3 py-1.5">
                    <Text className="text-ink text-xs font-sansSemiBold">Desbloquear</Text>
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          )}
          {error !== null && <Text className="text-error text-xs mt-2">{error}</Text>}
        </View>
      </Modal>
    </>
  );
}