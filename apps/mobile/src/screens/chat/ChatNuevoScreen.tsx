import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, FlatList, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../../design-system/tokens';
import { abrirConversacion, buscarPersonas, ETIQUETA_ROL, type PersonaChat } from '../../services/chat';

function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter((p) => p !== '');
  return ((partes[0]?.[0] ?? '') + (partes.length > 1 ? partes[1][0] : '')).toUpperCase() || '?';
}

/** Buscador para empezar una conversación con cualquier usuario (el equipo de 3B ve también las cuentas pendientes). */
export default function ChatNuevoScreen() {
  const navigation = useNavigation<any>();
  const [texto, setTexto] = useState('');
  const [personas, setPersonas] = useState<PersonaChat[]>([]);
  const [cargando, setCargando] = useState(true);
  const [abriendo, setAbriendo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    const t = setTimeout(async () => {
      try {
        const r = await buscarPersonas(texto);
        if (vigente) {
          setPersonas(r);
          setError(null);
        }
      } catch (e) {
        if (vigente) setError(e instanceof Error ? e.message : 'No se ha podido buscar.');
      } finally {
        if (vigente) setCargando(false);
      }
    }, 300);
    return () => {
      vigente = false;
      clearTimeout(t);
    };
  }, [texto]);

  const abrir = async (p: PersonaChat) => {
    setAbriendo(p.id);
    setError(null);
    try {
      const id = await abrirConversacion(p.id);
      navigation.replace('Chat', { conversacionId: id, nombre: p.nombre, tipo: 'privado', otroId: p.id });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se ha podido abrir la conversación.');
      setAbriendo(null);
    }
  };

  return (
    <View className="flex-1 bg-canvas">
      <View className="px-4 pt-3 pb-2">
        <View className="flex-row items-center gap-2 bg-surface border border-border rounded-xl px-3">
          <Feather name="search" size={18} color={colors.inkSubtle} />
          <TextInput
            value={texto}
            onChangeText={setTexto}
            placeholder="Buscar por nombre o empresa"
            placeholderTextColor={colors.inkSubtle}
            autoFocus
            autoCorrect={false}
            className="flex-1 py-3 text-ink"
          />
        </View>
        {error !== null && <Text className="text-error text-sm mt-2">{error}</Text>}
      </View>

      {cargando && personas.length === 0 ? (
        <ActivityIndicator color={colors.action} className="mt-8" />
      ) : (
        <FlatList
          data={personas}
          keyExtractor={(p) => p.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 40 }}
          ListEmptyComponent={<Text className="text-inkMuted text-sm text-center mt-10">No hay personas con ese nombre.</Text>}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => abrir(item)}
              disabled={abriendo !== null}
              className="flex-row items-center gap-3 px-4 py-3"
              accessibilityLabel={`Escribir a ${item.nombre}`}
            >
              <View className="w-12 h-12 rounded-full bg-navySurface items-center justify-center">
                <Text className="text-white font-sansSemiBold">{iniciales(item.nombre)}</Text>
              </View>
              <View className="flex-1">
                <Text className="text-ink text-base font-sansSemiBold" numberOfLines={1}>
                  {item.nombre}
                </Text>
                <Text className="text-inkMuted text-[13px]">
                  {ETIQUETA_ROL[item.rol] ?? item.rol}
                  {item.estado_cuenta === 'pendiente' ? ' · Cuenta pendiente' : ''}
                </Text>
              </View>
              {abriendo === item.id ? (
                <ActivityIndicator color={colors.action} />
              ) : (
                <Feather name="chevron-right" size={20} color={colors.inkSubtle} />
              )}
            </Pressable>
          )}
        />
      )}
    </View>
  );
}