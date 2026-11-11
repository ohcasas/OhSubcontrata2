import { useState } from 'react';
import { View, Text, Pressable, ScrollView, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { colors } from '../../design-system/tokens';
import { EMAIL_DOCUMENTACION, URL_POLITICA_PRIVACIDAD } from '../../constants/enlaces';
import { Aviso, BotonPrimario, Tarjeta } from './ui';

/**
 * Pantalla única de un candidato cuya documentación aún no está verificada por 3B.
 * No da acceso a nada más: solo explica qué enviar y a dónde, hasta que el equipo verifique en su panel.
 */
export default function CandidatoPendienteScreen({ nota, onComprobar }: { nota: string | null; onComprobar: () => void }) {
  const insets = useSafeAreaInsets();
  const [comprobando, setComprobando] = useState(false);

  const escribir = () => {
    const asunto = encodeURIComponent('Documentación para verificar mi perfil');
    Linking.openURL(`mailto:${EMAIL_DOCUMENTACION}?subject=${asunto}`).catch(() => undefined);
  };

  const comprobar = () => {
    setComprobando(true);
    onComprobar();
    setTimeout(() => setComprobando(false), 1500);
  };

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <ScrollView className="flex-1 px-6" contentContainerStyle={{ paddingVertical: 24 }}>
        <View className="w-14 h-14 rounded-full bg-actionTint items-center justify-center">
          <Feather name="file-text" size={26} color={colors.action} />
        </View>
        <Text className="text-ink text-2xl font-sansBold mt-4">Falta verificar tu documentación</Text>
        <Text className="text-inkMuted text-sm mt-2 leading-5">
          Tus datos ya están guardados. Para activar tu cuenta, envía tu documentación en PDF por correo y nuestro equipo la revisará. Cuando la verifiquemos
          podrás acceder a tu panel, completar tu perfil profesional y entrar en la bolsa de empleo.
        </Text>

        {nota !== null && nota !== '' && (
          <View className="mt-4">
            <Aviso texto={`No hemos podido verificarla: ${nota}`} />
          </View>
        )}

        <Tarjeta>
          <Text className="text-ink text-sm font-sansSemiBold">Envía tus PDF a</Text>
          <Text selectable className="text-action text-base font-sansBold mt-1">{EMAIL_DOCUMENTACION}</Text>
          <Text className="text-inkMuted text-xs mt-2 leading-4">
            Escribe desde el mismo correo con el que te registraste, para que podamos asociarlo a tu cuenta. Un solo envío con todos los PDF es suficiente.
          </Text>
        </Tarjeta>

        <View className="mt-1">
          <BotonPrimario texto="Escribir ahora" onPress={escribir} />
        </View>
        <Pressable onPress={comprobar} disabled={comprobando} accessibilityRole="button" className="self-center mt-4 py-2">
          <Text className="text-action text-sm font-sansSemiBold">{comprobando ? 'Comprobando…' : 'Ya me han verificado: comprobar ahora'}</Text>
        </Pressable>

        <Text className="text-inkMuted text-xs mt-6 leading-4">
          Usamos tu documentación solo para verificar tu identidad y tu perfil profesional. Nadie decide por ti de forma automática. Puedes pedir que borremos
          tus datos escribiendo a ese mismo correo.
        </Text>
        <Pressable onPress={() => Linking.openURL(URL_POLITICA_PRIVACIDAD)} className="mt-2">
          <Text className="text-action text-xs">Política de privacidad</Text>
        </Pressable>
        <Pressable onPress={() => supabase.auth.signOut()} className="self-center mt-6 py-1">
          <Text className="text-inkMuted text-sm">Salir</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}