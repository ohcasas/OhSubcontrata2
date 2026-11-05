import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NavigationProp, ParamListBase, RouteProp } from '@react-navigation/native';
import { supabase } from '../../services/supabase';
import { Etiqueta, BotonPrimario, BotonSecundario } from './ui';
import type { OfertaPublica } from '../../services/seleccion';

type Params = { EmpleoOferta: { oferta: OfertaPublica } };

/** Detalle de una oferta. Sin sesión invita a crear la cuenta de candidato; con sesión, a postularse. */
export default function EmpleoOfertaScreen() {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const { params } = useRoute<RouteProp<Params, 'EmpleoOferta'>>();
  const insets = useSafeAreaInsets();
  const o = params.oferta;
  const [haySesion, setHaySesion] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setHaySesion(data.session !== null));
  }, []);

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
      <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingBottom: 24 }}>
        <Pressable onPress={() => navigation.goBack()} accessibilityRole="button" className="self-start py-3">
          <Text className="text-action text-sm font-sansSemiBold">‹ Volver</Text>
        </Pressable>
        <Text className="text-ink text-2xl font-sansBold">{o.titulo}</Text>
        <View className="flex-row flex-wrap mt-2">
          {o.ubicacion ? <Etiqueta texto={o.ubicacion} /> : null}
          {o.modalidad ? <Etiqueta texto={o.modalidad} /> : null}
          {o.tipo_contrato ? <Etiqueta texto={o.tipo_contrato} /> : null}
        </View>
        <Text className="text-ink text-base mt-3 leading-6">{o.descripcion}</Text>
      </ScrollView>
      <View className="px-4 pt-3" style={{ paddingBottom: insets.bottom + 12 }}>
        {haySesion === true ? (
          <BotonPrimario texto="Postularme" onPress={() => navigation.navigate('Postular', { oferta: o })} />
        ) : haySesion === false ? (
          <>
            <BotonPrimario texto="Crear cuenta de candidato" onPress={() => navigation.navigate('RegistroCandidato')} />
            <View className="h-2.5" />
            <BotonSecundario texto="Ya tengo cuenta · Iniciar sesión" onPress={() => navigation.navigate('Login')} />
          </>
        ) : null}
      </View>
    </View>
  );
}