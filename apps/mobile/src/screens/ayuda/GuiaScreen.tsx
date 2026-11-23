import { useMemo, useState, useEffect } from 'react';
import { View, Text, TextInput, ScrollView, Pressable, LayoutAnimation, Platform, UIManager } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../../services/supabase';
import { colors } from '../../design-system/tokens';
import { glosarioPara, grupoDeAyuda } from '../../constants/ayuda';
import { coincide } from '../../utils/texto';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function GuiaScreen() {
  const navigation = useNavigation();
  const [rol, setRol] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [abierto, setAbierto] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data } = await supabase.from('profiles').select('role').eq('id', u.user.id).maybeSingle();
      setRol((data?.role as string | null) ?? null);
    })();
  }, []);

  const terminos = useMemo(() => {
    const todos = glosarioPara(grupoDeAyuda(rol));
    return todos.filter((t) => coincide(busqueda, t.pregunta, t.respuesta));
  }, [rol, busqueda]);

  const alternar = (p: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setAbierto((a) => (a === p ? null : p));
  };

  return (
    <ScrollView className="flex-1 bg-canvas" contentContainerStyle={{ padding: 16, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
      <Text className="text-ink text-[26px] font-sansBold">Guía de la app</Text>
      <Text className="text-inkMuted text-sm mt-1">Qué significa cada cosa, en palabras sencillas.</Text>

      <View className="bg-surface border border-border rounded-full flex-row items-center px-4 mt-4" style={{ height: 48 }}>
        <Feather name="search" size={18} color={colors.inkMuted} />
        <TextInput
          value={busqueda}
          onChangeText={setBusqueda}
          placeholder="Busca una palabra"
          placeholderTextColor={colors.inkSubtle}
          className="flex-1 ml-2.5 text-ink text-[15px]"
          accessibilityLabel="Buscar en la guía"
        />
      </View>

      <Pressable
        onPress={() => (navigation as unknown as { navigate: (n: string) => void }).navigate('Tutorial')}
        accessibilityRole="button"
        className="bg-action rounded-3xl flex-row items-center px-4 py-3.5 mt-3 gap-3.5"
      >
        <View className="w-11 h-11 rounded-full items-center justify-center" style={{ backgroundColor: 'rgba(255,255,255,0.25)' }}>
          <Feather name="play" size={20} color="#FFFFFF" />
        </View>
        <View className="flex-1">
          <Text className="text-white text-[15.5px] font-sansBold">Ver el tutorial otra vez</Text>
          <Text className="text-[12.5px]" style={{ color: '#DFF0FF' }}>Menos de 1 minuto</Text>
        </View>
      </Pressable>

      <Text className="text-ink text-[17px] font-sansBold mt-5 mb-2">Palabras que verás</Text>
      {terminos.length === 0 ? (
        <Text className="text-inkMuted text-sm">No hay nada con esa palabra. Prueba con otra.</Text>
      ) : (
        <View className="gap-2">
          {terminos.map((t) => {
            const abierta = abierto === t.pregunta;
            return (
              <Pressable
                key={t.pregunta}
                onPress={() => alternar(t.pregunta)}
                accessibilityRole="button"
                accessibilityState={{ expanded: abierta }}
                className="bg-surface border border-border rounded-[22px] px-4 py-3"
              >
                <View className="flex-row items-center gap-3">
                  <View className={`w-[38px] h-[38px] rounded-xl items-center justify-center ${abierta ? 'bg-action' : 'bg-actionTint'}`}>
                    <Feather name="help-circle" size={19} color={abierta ? '#FFFFFF' : colors.action} />
                  </View>
                  <Text className="flex-1 text-ink text-[15px] font-sansBold">{t.pregunta}</Text>
                  <Feather name={abierta ? 'chevron-up' : 'chevron-down'} size={20} color={colors.inkMuted} />
                </View>
                {abierta && <Text className="text-ink text-[14px] leading-5 mt-2.5">{t.respuesta}</Text>}
              </Pressable>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}