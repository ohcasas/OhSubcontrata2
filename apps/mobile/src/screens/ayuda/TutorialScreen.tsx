import { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, FlatList, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../services/supabase';
import { marcarTutorialVisto } from '../../services/tutorial';
import { TUTORIAL, grupoDeAyuda, type PasoTutorial } from '../../constants/ayuda';

export default function TutorialScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [pasos, setPasos] = useState<PasoTutorial[]>(TUTORIAL.general);
  const [indice, setIndice] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const lista = useRef<FlatList<PasoTutorial>>(null);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      setUserId(u.user.id);
      const { data } = await supabase.from('profiles').select('role').eq('id', u.user.id).maybeSingle();
      setPasos(TUTORIAL[grupoDeAyuda((data?.role as string | null) ?? null)]);
    })();
  }, []);

  const cerrar = async () => {
    if (userId !== null) await marcarTutorialVisto(userId);
    if (navigation.canGoBack()) navigation.goBack();
  };

  const ultimo = indice === pasos.length - 1;
  const siguiente = () => {
    if (ultimo) {
      cerrar();
      return;
    }
    lista.current?.scrollToIndex({ index: indice + 1, animated: true });
  };

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 20 }}>
      <View className="flex-row justify-between items-center px-5">
        <Text className="text-inkMuted text-sm font-sansSemiBold">{indice + 1} de {pasos.length}</Text>
        {!ultimo && (
          <Pressable onPress={cerrar} accessibilityRole="button" hitSlop={12}>
            <Text className="text-action text-[15px] font-sansBold">Saltar</Text>
          </Pressable>
        )}
      </View>

      <FlatList
        ref={lista}
        data={pasos}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(p) => p.titulo}
        onMomentumScrollEnd={(e) => setIndice(Math.round(e.nativeEvent.contentOffset.x / width))}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        renderItem={({ item }) => (
          <View style={{ width, paddingHorizontal: 20, paddingTop: 24 }}>
            <LinearGradient
              colors={['#8fd0ff', '#3781fc', '#0b2cb1']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ height: 300, borderRadius: 40, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
            >
              {[130, 210, 290].map((d) => (
                <View key={d} style={{ position: 'absolute', width: d, height: d, borderRadius: d, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.28)' }} />
              ))}
              <View
                style={{
                  width: 108,
                  height: 108,
                  borderRadius: 34,
                  backgroundColor: 'rgba(255,255,255,0.28)',
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.7)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Feather name={item.icono} size={50} color="#FFFFFF" />
              </View>
            </LinearGradient>
            <Text className="text-ink font-sansBold mt-7" style={{ fontSize: 26, lineHeight: 30, letterSpacing: -0.6 }}>{item.titulo}</Text>
            <Text className="text-inkMuted text-[15.5px] leading-[22px] mt-2.5">{item.texto}</Text>
          </View>
        )}
      />

      <View className="flex-row items-center justify-between px-6">
        <View className="flex-row items-center gap-1.5">
          {pasos.map((p, i) => (
            <View key={p.titulo} className={i === indice ? 'bg-action' : 'bg-actionTint'} style={{ height: 8, width: i === indice ? 28 : 8, borderRadius: 4 }} />
          ))}
        </View>
        <Pressable onPress={siguiente} accessibilityRole="button" className="bg-action rounded-full px-7 items-center justify-center" style={{ height: 54 }}>
          <Text className="text-white text-base font-sansBold">{ultimo ? 'Empezar' : 'Siguiente'}</Text>
        </Pressable>
      </View>
    </View>
  );
}