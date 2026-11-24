/**
 * Cabecera del Perfil: dato grande, tarjetas deslizables (la primera es el
 * carnet 3B) y accesos rápidos. Los datos los pone cada tipo de cuenta
 * (ver useDatosHero). Se enseña encima del perfil de siempre.
 */
import { useCallback } from 'react';
import { View, Text, ScrollView, Pressable, Image, StatusBar } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ComponentProps } from 'react';
import CampanaNotificaciones from '../CampanaNotificaciones';
import TarjetaCristal, { type DatosTarjeta } from './TarjetaCristal';

type NombreIcono = ComponentProps<typeof Feather>['name'];

export type Acceso = { etiqueta: string; icono: NombreIcono; destino: string };

type Props = {
  nombre: string;
  avatarUrl: string | null;
  etiqueta: string;
  numero: string;
  subtitulo: string;
  tarjetas: DatosTarjeta[];
  accesos: Acceso[];
};

function filasDe<T>(lista: T[], n: number): T[][] {
  const filas: T[][] = [];
  for (let i = 0; i < lista.length; i += n) filas.push(lista.slice(i, i + n));
  return filas;
}

export default function PerfilHero({ nombre, avatarUrl, etiqueta, numero, subtitulo, tarjetas, accesos }: Props) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  // Sobre el azul, los iconos de la barra de estado van en blanco; al salir vuelven a oscuros.
  useFocusEffect(
    useCallback(() => {
      StatusBar.setBarStyle('light-content');
      return () => StatusBar.setBarStyle('dark-content');
    }, []),
  );
  const inicial = nombre.trim().charAt(0).toUpperCase() || '?';
  const primerNombre = nombre.trim().split(' ')[0] || nombre;

  return (
    <View>
      <LinearGradient
        colors={['#8fd0ff', '#3781fc', '#1951fc', '#0b2cb1']}
        locations={[0, 0.34, 0.68, 1]}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.6, y: 1 }}
        style={{ paddingTop: insets.top + 14, paddingBottom: 22, borderBottomLeftRadius: 40, borderBottomRightRadius: 40 }}
      >
        <View className="flex-row justify-between items-center px-5">
          <View className="flex-row items-center gap-3">
            {avatarUrl !== null ? (
              <Image source={{ uri: avatarUrl }} style={{ width: 46, height: 46, borderRadius: 23 }} />
            ) : (
              <View className="w-[46px] h-[46px] rounded-full items-center justify-center" style={{ backgroundColor: 'rgba(255,255,255,0.9)' }}>
                <Text className="text-action text-[17px] font-sansBold">{inicial}</Text>
              </View>
            )}
            <View>
              <Text className="text-[13px]" style={{ color: '#E1F1FF' }}>Hola,</Text>
              <Text className="text-white text-[17px] font-sansBold" numberOfLines={1}>{primerNombre}</Text>
            </View>
          </View>
          <CampanaNotificaciones />
        </View>

        <View className="px-5 mt-4">
          <Text className="text-[14px]" style={{ color: '#E1F1FF' }}>{etiqueta}</Text>
          <Text className="text-white font-sansBold" style={{ fontSize: 46, letterSpacing: -2, lineHeight: 54 }}>{numero}</Text>
          <Text className="text-[13px]" style={{ color: '#CBE9FD' }}>{subtitulo}</Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, gap: 12, paddingTop: 18, paddingBottom: 6 }}
        >
          {tarjetas.map((t) => (
            <TarjetaCristal key={t.titulo} {...t} />
          ))}
        </ScrollView>
      </LinearGradient>

      {accesos.length > 0 && (
        <View className="px-4 mt-4">
          <Text className="text-ink text-[17px] font-sansBold mb-2">Accesos rápidos</Text>
          <View className="bg-surface border border-border rounded-[28px] pt-3.5 pb-1 px-2">
            {filasDe(accesos, 4).map((fila, i) => (
              <View key={i} className="flex-row justify-center">
                {fila.map((a) => (
                  <Pressable
                    key={a.etiqueta}
                    onPress={() => (navigation as unknown as { navigate: (n: string) => void }).navigate(a.destino)}
                    accessibilityRole="button"
                    accessibilityLabel={a.etiqueta}
                    className="items-center mb-2.5"
                    style={{ width: '25%' }}
                  >
                    <View className="w-[46px] h-[46px] rounded-2xl bg-actionTint items-center justify-center">
                      <Feather name={a.icono} size={21} color="#1951fc" />
                    </View>
                    <Text className="text-ink text-[11.5px] font-sansSemiBold text-center mt-1.5 px-0.5" numberOfLines={2}>
                      {a.etiqueta}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}