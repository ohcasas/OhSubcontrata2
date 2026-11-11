import { View, Text, Pressable, Linking, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { colors } from '../design-system/tokens';

function abrirTienda(url: string | null) {
  if (url) Linking.openURL(url).catch(() => undefined);
}

/** Pantalla que bloquea la app: esta versión ya no es compatible y hay que actualizar. */
export function ActualizarAppScreen({ urlTienda, mensaje }: { urlTienda: string | null; mensaje: string | null }) {
  const insets = useSafeAreaInsets();
  return (
    <View className="flex-1 bg-canvas items-center justify-center px-8" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <View className="w-20 h-20 rounded-full bg-actionTint items-center justify-center">
        <Feather name="download-cloud" size={36} color={colors.action} />
      </View>
      <Text className="text-ink text-2xl font-sansBold text-center mt-6">Actualiza 3B Conecta</Text>
      <Text className="text-inkMuted text-base text-center mt-3 leading-6">
        {mensaje ?? 'Hemos mejorado la app y esta versión ya no es compatible. Actualiza para seguir usándola.'}
      </Text>
      <Pressable
        onPress={() => abrirTienda(urlTienda)}
        disabled={!urlTienda}
        accessibilityRole="button"
        className={`rounded-xl py-4 px-8 mt-8 self-stretch items-center ${urlTienda ? 'bg-action' : 'bg-borderStrong'}`}
      >
        <Text className="text-white font-sansBold text-base">Actualizar ahora</Text>
      </Pressable>
      <Text className="text-inkMuted text-xs text-center mt-4">Tus datos y tu sesión no se pierden al actualizar.</Text>
    </View>
  );
}

/** Aviso que se puede cerrar: hay una versión nueva, pero esta todavía funciona. */
export function AvisoActualizacion({ urlTienda, mensaje, onCerrar }: { urlTienda: string | null; mensaje: string | null; onCerrar: () => void }) {
  return (
    <Modal transparent animationType="fade" onRequestClose={onCerrar}>
      <View className="flex-1 items-center justify-center px-6" style={{ backgroundColor: 'rgba(11,31,53,0.55)' }}>
        <View className="bg-surface rounded-2xl p-6 self-stretch">
          <View className="w-12 h-12 rounded-full bg-actionTint items-center justify-center">
            <Feather name="download-cloud" size={22} color={colors.action} />
          </View>
          <Text className="text-ink text-xl font-sansBold mt-4">Hay una versión nueva</Text>
          <Text className="text-inkMuted text-sm mt-2 leading-5">{mensaje ?? 'Actualiza para tener las últimas mejoras y correcciones.'}</Text>
          <Pressable
            onPress={() => { abrirTienda(urlTienda); onCerrar(); }}
            disabled={!urlTienda}
            accessibilityRole="button"
            className={`rounded-xl py-3 mt-5 items-center ${urlTienda ? 'bg-action' : 'bg-borderStrong'}`}
          >
            <Text className="text-white font-sansBold text-sm">Actualizar</Text>
          </Pressable>
          <Pressable onPress={onCerrar} accessibilityRole="button" className="items-center mt-3 py-2">
            <Text className="text-inkMuted text-sm">Ahora no</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
