import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NavigationProp, ParamListBase, RouteProp } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import { supabase } from '../../services/supabase';
import { mensajeDeErrorSeleccion, obtenerMiCandidato, postular, subirCv } from '../../services/seleccion';
import type { Candidato, OfertaPublica } from '../../services/seleccion';
import { Aviso, BotonPrimario, BotonSecundario, Tarjeta } from './ui';

type Params = { Postular: { oferta: OfertaPublica } };

const TIPOS_CV = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const MAX_CV = 5 * 1024 * 1024;

/** Presentar la candidatura: respuestas a las preguntas de la oferta, carta opcional y CV. */
export default function PostularScreen() {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const { params } = useRoute<RouteProp<Params, 'Postular'>>();
  const { oferta } = params;
  const insets = useSafeAreaInsets();
  const [candidato, setCandidato] = useState<Candidato | null>(null);
  const [respuestas, setRespuestas] = useState<Record<string, string>>({});
  const [carta, setCarta] = useState('');
  const [cvNuevo, setCvNuevo] = useState<{ uri: string; mime: string; nombre: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const uid = data.session?.user.id;
      if (uid) setCandidato(await obtenerMiCandidato(uid).catch(() => null));
    });
  }, []);

  const elegirCv = async () => {
    setError(null);
    const r = await DocumentPicker.getDocumentAsync({ type: TIPOS_CV, copyToCacheDirectory: true });
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];
    if (a.size && a.size > MAX_CV) {
      setError('El CV pesa más de 5 MB. Sube un archivo más pequeño.');
      return;
    }
    setCvNuevo({ uri: a.uri, mime: a.mimeType ?? 'application/pdf', nombre: a.name });
  };

  const enviar = async () => {
    if (!candidato) return;
    const faltan = oferta.preguntas.some((p) => !(respuestas[p.id] ?? '').trim());
    if (faltan) {
      setError('Responde a todas las preguntas para poder enviar.');
      return;
    }
    if (!candidato.cv_path && !cvNuevo) {
      setError('Adjunta tu CV (PDF o Word, hasta 5 MB).');
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      if (cvNuevo) await subirCv(candidato.user_id, cvNuevo.uri, cvNuevo.mime, cvNuevo.nombre);
      await postular(oferta.id, respuestas, carta);
      navigation.navigate('AppCandidato');
    } catch (e) {
      setError(mensajeDeErrorSeleccion(e));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }} className="bg-canvas">
      <ScrollView className="flex-1 px-4" keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        <Pressable onPress={() => navigation.goBack()} accessibilityRole="button" className="self-start py-3">
          <Text className="text-action text-sm font-sansSemiBold">‹ Volver</Text>
        </Pressable>
        <Text className="text-ink text-2xl font-sansBold">Presentar candidatura</Text>
        <Text className="text-inkMuted text-sm mt-1 mb-4">{oferta.titulo}</Text>
        {error !== null && <Aviso texto={error} />}

        {oferta.preguntas.map((p) => (
          <View key={p.id} className="mb-3">
            <Text className="text-ink text-sm font-sansSemiBold mb-1">{p.texto}</Text>
            <TextInput
              value={respuestas[p.id] ?? ''}
              onChangeText={(t) => setRespuestas((r) => ({ ...r, [p.id]: t }))}
              multiline
              maxLength={1000}
              className="bg-surface border border-border rounded-xl px-3 py-3 text-ink"
              style={{ minHeight: 64, textAlignVertical: 'top' }}
            />
          </View>
        ))}

        <Text className="text-ink text-sm font-sansSemiBold mb-1">Carta de presentación (opcional)</Text>
        <TextInput
          value={carta}
          onChangeText={setCarta}
          multiline
          maxLength={3000}
          className="bg-surface border border-border rounded-xl px-3 py-3 text-ink mb-4"
          style={{ minHeight: 96, textAlignVertical: 'top' }}
        />

        <Tarjeta>
          <Text className="text-ink text-sm font-sansSemiBold">Tu CV</Text>
          <Text className="text-inkMuted text-xs mt-0.5 mb-3">
            {cvNuevo ? `Nuevo: ${cvNuevo.nombre}` : candidato?.cv_path ? 'Ya tienes un CV guardado. Puedes cambiarlo.' : 'PDF o Word, hasta 5 MB.'}
          </Text>
          <BotonSecundario texto={candidato?.cv_path || cvNuevo ? 'Cambiar CV' : 'Adjuntar CV'} onPress={elegirCv} />
          <Text className="text-inkSubtle text-xs mt-2">Solo lo verá el equipo de selección. Se guarda en un espacio privado.</Text>
        </Tarjeta>

        <BotonPrimario texto="Enviar candidatura" onPress={enviar} cargando={enviando} desactivado={candidato === null} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}