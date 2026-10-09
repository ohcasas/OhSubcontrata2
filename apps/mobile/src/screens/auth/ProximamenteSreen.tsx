import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { colors } from '../../design-system/tokens';

const ETIQUETA_ROL: Record<string, string> = {
  promotor: 'Promotor',
  constructora: 'Constructora',
  arquitecto: 'Arquitecto',
  proveedor: 'Proveedor',
  profesional: 'Profesional',
  administrador: 'Administrador',
};

export default function ProximamenteScreen({ rol }: { rol: string }) {
  const insets = useSafeAreaInsets();
  const [cerrandoSesion, setCerrandoSesion] = useState(false);

  const handleCerrarSesion = async () => {
    setCerrandoSesion(true);
    await supabase.auth.signOut();
  };

  return (
    <View
      className="flex-1 items-center justify-center bg-canvas px-6"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      <View className="w-14 h-14 rounded-full bg-actionTint items-center justify-center mb-4">
        <Feather name="clock" size={26} color={colors.action} />
      </View>
      <Text className="text-ink text-xl font-sansBold text-center mb-2">
        Tu cuenta de {ETIQUETA_ROL[rol] ?? rol} ya está creada
      </Text>
      <Text className="text-inkMuted text-sm text-center mb-1 leading-relaxed">
        Estamos terminando de construir esta parte de 3B Conecta. En cuanto esté lista, podrás usarla con esta
        misma cuenta, sin tener que registrarte otra vez.
      </Text>
      <Text className="text-inkMuted text-xs text-center mb-8">Gracias por tu paciencia.</Text>

      <Pressable
        onPress={handleCerrarSesion}
        disabled={cerrandoSesion}
        className="border border-border rounded-xl py-3 px-6 items-center"
      >
        <View className="flex-row items-center gap-2">
          {cerrandoSesion ? (
            <ActivityIndicator color={colors.inkMuted} />
          ) : (
            <Feather name="log-out" size={15} color={colors.inkMuted} />
          )}
          <Text className="text-inkMuted font-sansSemiBold text-sm">Cerrar sesión</Text>
        </View>
      </Pressable>
    </View>
  );
}