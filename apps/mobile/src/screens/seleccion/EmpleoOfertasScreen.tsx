import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NavigationProp, ParamListBase } from '@react-navigation/native';
import { colors } from '../../design-system/tokens';
import { listarOfertasPublicas, mensajeDeErrorSeleccion } from '../../services/seleccion';
import type { OfertaPublica } from '../../services/seleccion';
import { Aviso, Etiqueta, Tarjeta, Vacio } from './ui';

/**
 * Ofertas abiertas de «Trabaja con nosotros». Sirve sin sesión (desde el inicio de sesión)
 * y con sesión (pestaña Ofertas del candidato): solo lee la vista pública de ofertas.
 */
export default function EmpleoOfertasScreen() {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const insets = useSafeAreaInsets();
  const [ofertas, setOfertas] = useState<OfertaPublica[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refrescando, setRefrescando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setError(null);
      setOfertas(await listarOfertasPublicas());
    } catch (e) {
      setError(mensajeDeErrorSeleccion(e));
      setOfertas((o) => o ?? []);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
      <View className="px-4 pt-4 pb-2">
        {navigation.canGoBack() && (
          <Pressable onPress={() => navigation.goBack()} accessibilityRole="button" className="self-start py-1 mb-1">
            <Text className="text-action text-sm font-sansSemiBold">‹ Volver</Text>
          </Pressable>
        )}
        <Text className="text-ink text-2xl font-sansBold">Trabaja con nosotros</Text>
        <Text className="text-inkMuted text-sm mt-1">Ofertas abiertas de 3B. Para presentar tu candidatura necesitas una cuenta de candidato.</Text>
      </View>
      {ofertas === null ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.action} />
        </View>
      ) : (
        <ScrollView
          className="flex-1 px-4"
          contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
          refreshControl={
            <RefreshControl
              refreshing={refrescando}
              onRefresh={async () => {
                setRefrescando(true);
                await cargar();
                setRefrescando(false);
              }}
            />
          }
        >
          {error !== null && <Aviso texto={error} />}
          {ofertas.length === 0 && error === null && (
            <Vacio titulo="Ahora mismo no hay ofertas abiertas" texto="Vuelve más adelante: aquí aparecen en cuanto se publican." />
          )}
          {ofertas.map((o) => (
            <Tarjeta key={o.id} onPress={() => navigation.navigate('EmpleoOferta', { oferta: o })}>
              <Text className="text-ink text-base font-sansBold">{o.titulo}</Text>
              <View className="flex-row flex-wrap mt-1.5">
                {o.ubicacion ? <Etiqueta texto={o.ubicacion} /> : null}
                {o.modalidad ? <Etiqueta texto={o.modalidad} /> : null}
                {o.tipo_contrato ? <Etiqueta texto={o.tipo_contrato} /> : null}
              </View>
              <Text className="text-inkMuted text-sm mt-1" numberOfLines={2}>
                {o.descripcion}
              </Text>
            </Tarjeta>
          ))}
        </ScrollView>
      )}
    </View>
  );
}