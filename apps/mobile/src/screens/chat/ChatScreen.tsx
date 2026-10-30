import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  Modal,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import {
  useAudioRecorder,
  useAudioRecorderState,
  RecordingPresets,
  AudioModule,
  setAudioModeAsync,
} from 'expo-audio';
import { supabase } from '../../services/supabase';
import { colors } from '../../design-system/tokens';
import BurbujaChat, { formatoDuracion } from '../../components/BurbujaChat';
import MenuDenuncia from '../../components/MenuDenuncia';
import { useBloqueados } from '../../services/moderacion';
import {
  useMensajes,
  enviarTexto,
  enviarFoto,
  enviarAudio,
  marcarLeido,
  refrescarNoLeidos,
  type MensajeChat,
} from '../../services/chat';
import type { RootStackParamList } from '../../navigation/types';

const MAX_AUDIO_SEG = 300;

function etiquetaDia(iso: string): string {
  const f = new Date(iso);
  const hoy = new Date();
  if (f.toDateString() === hoy.toDateString()) return 'Hoy';
  const ayer = new Date(hoy);
  ayer.setDate(hoy.getDate() - 1);
  if (f.toDateString() === ayer.toDateString()) return 'Ayer';
  return f.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });
}

export default function ChatScreen() {
  const navigation = useNavigation<any>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'Chat'>>();
  const { conversacionId, nombre, tipo, otroId } = params;
  const privado = tipo === 'privado';

  const [yo, setYo] = useState<string | null>(null);
  const { mensajes, cargando, error: errorCarga, recargar } = useMensajes(conversacionId);
  const bloqueados = useBloqueados();

  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [menuAdjuntar, setMenuAdjuntar] = useState(false);
  const [mensajeDenunciado, setMensajeDenunciado] = useState<MensajeChat | null>(null);

  // Audio
  const grabadora = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const estadoGrabacion = useAudioRecorderState(grabadora, 250);
  const [grabando, setGrabando] = useState(false);
  const segundosGrabados = Math.floor((estadoGrabacion.durationMillis ?? 0) / 1000);
  const segundosRef = useRef(0);
  segundosRef.current = segundosGrabados;

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setYo(data.session?.user.id ?? null));
  }, []);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: nombre,
      headerRight: privado && otroId
        ? () => (
            <MenuDenuncia
              tipo="usuario"
              objetoId={otroId}
              usuarioId={otroId}
              nombre={nombre}
              onBloqueado={() => navigation.goBack()}
              color={colors.ink}
            />
          )
        : undefined,
    });
  }, [navigation, nombre, privado, otroId]);

  // Marcar como leído al entrar y cada vez que llega algo nuevo
  const ultimoId = mensajes[0]?.id;
  useEffect(() => {
    if (ultimoId === undefined) return;
    marcarLeido(conversacionId).then(refrescarNoLeidos);
  }, [conversacionId, ultimoId]);

  const visibles = mensajes.filter((m) => m.emisor_id === null || !bloqueados.has(m.emisor_id));

  const intentar = async (accion: () => Promise<void>) => {
    setAviso(null);
    setEnviando(true);
    try {
      await accion();
      await recargar();
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'No se ha podido enviar.');
    } finally {
      setEnviando(false);
    }
  };

  const enviarMensaje = () => {
    const t = texto.trim();
    if (t === '' || enviando) return;
    setTexto('');
    intentar(async () => {
      try {
        await enviarTexto(conversacionId, t);
      } catch (e) {
        setTexto(t);
        throw e;
      }
    });
  };

  const hacerFoto = async () => {
    setMenuAdjuntar(false);
    const permiso = await ImagePicker.requestCameraPermissionsAsync();
    if (!permiso.granted) {
      Alert.alert('Cámara', 'Activa el permiso de cámara en los ajustes del móvil para hacer fotos desde el chat.');
      return;
    }
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (r.canceled) return;
    const a = r.assets[0];
    intentar(() => enviarFoto(conversacionId, a.uri, a.mimeType ?? 'image/jpeg'));
  };

  const elegirFoto = async () => {
    setMenuAdjuntar(false);
    const permiso = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permiso.granted) {
      Alert.alert('Fotos', 'Activa el permiso de fotos en los ajustes del móvil para enviar imágenes.');
      return;
    }
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (r.canceled) return;
    const a = r.assets[0];
    intentar(() => enviarFoto(conversacionId, a.uri, a.mimeType ?? 'image/jpeg'));
  };

  const empezarAudio = async () => {
    setMenuAdjuntar(false);
    setAviso(null);
    try {
      const permiso = await AudioModule.requestRecordingPermissionsAsync();
      if (!permiso.granted) {
        Alert.alert('Micrófono', 'Activa el permiso de micrófono en los ajustes del móvil para enviar audios.');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await grabadora.prepareToRecordAsync();
      grabadora.record();
      setGrabando(true);
    } catch {
      setAviso('No se ha podido empezar a grabar.');
    }
  };

  const terminarAudio = async (enviar: boolean) => {
    const segundos = Math.max(1, segundosRef.current);
    setGrabando(false);
    try {
      await grabadora.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    } catch {
      /* ya estaba parada */
    }
    const uri = grabadora.uri;
    if (enviar && uri !== null && uri !== undefined) {
      intentar(() => enviarAudio(conversacionId, uri, segundos));
    }
  };

  // El audio se corta solo a los 5 minutos
  useEffect(() => {
    if (grabando && segundosGrabados >= MAX_AUDIO_SEG) terminarAudio(true);
  }, [grabando, segundosGrabados]);

  const renderMensaje = useCallback(
    ({ item, index }: { item: MensajeChat; index: number }) => {
      const siguiente = visibles[index + 1]; // la lista va al revés: el siguiente es el anterior en el tiempo
      const nuevoDia = siguiente === undefined || new Date(siguiente.created_at).toDateString() !== new Date(item.created_at).toDateString();
      const propio = yo !== null && item.emisor_id === yo;
      const deAdministracion = tipo === 'soporte' && !propio;
      return (
        <View>
          {nuevoDia && (
            <View className="items-center my-3">
              <Text className="text-inkSubtle text-xs bg-silverTint rounded-full px-3 py-1">{etiquetaDia(item.created_at)}</Text>
            </View>
          )}
          <BurbujaChat
            mensaje={item}
            propio={propio}
            oficial={deAdministracion}
            onMantener={privado && item.emisor_id !== null ? () => setMensajeDenunciado(item) : undefined}
          />
        </View>
      );
    },
    [visibles, yo, tipo, privado],
  );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      style={{ flex: 1, backgroundColor: colors.canvas }}
    >
      {cargando ? (
        <ActivityIndicator color={colors.action} className="mt-10" />
      ) : (
        <FlatList
          data={visibles}
          inverted
          keyExtractor={(m) => m.id}
          renderItem={renderMensaje}
          contentContainerStyle={{ padding: 12 }}
          ListHeaderComponent={
            errorCarga !== null ? <Text className="text-error text-sm text-center py-2">{errorCarga}</Text> : null
          }
          ListEmptyComponent={
            <Text className="text-inkMuted text-sm text-center" style={{ transform: [{ scaleY: -1 }], marginTop: 40 }}>
              Escribe el primer mensaje.
            </Text>
          }
        />
      )}

      {aviso !== null && <Text className="text-error text-[13px] px-4 pb-1">{aviso}</Text>}

      <View className="bg-surface border-t border-border px-3 pt-2.5" style={{ paddingBottom: Platform.OS === 'ios' ? 28 : 12 }}>
        {grabando ? (
          <View className="flex-row items-center gap-3">
            <Pressable
              onPress={() => terminarAudio(false)}
              accessibilityLabel="Descartar audio"
              className="w-11 h-11 rounded-full bg-errorTint items-center justify-center"
            >
              <Feather name="trash-2" size={20} color={colors.error} />
            </Pressable>
            <View className="flex-1 flex-row items-center gap-2">
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.error }} />
              <Text className="text-ink text-base font-sansSemiBold">{formatoDuracion(segundosGrabados)}</Text>
              <Text className="text-inkMuted text-[13px]">Grabando…</Text>
            </View>
            <Pressable
              onPress={() => terminarAudio(true)}
              accessibilityLabel="Enviar audio"
              className="w-11 h-11 rounded-full bg-action items-center justify-center"
            >
              <Feather name="send" size={19} color={colors.white} />
            </Pressable>
          </View>
        ) : (
          <View className="flex-row items-end gap-2">
            <Pressable
              onPress={() => setMenuAdjuntar(true)}
              disabled={enviando}
              accessibilityLabel="Añadir cámara, fotos o audio"
              className="w-11 h-11 rounded-full bg-actionTint items-center justify-center"
            >
              <Feather name="plus" size={22} color={colors.action} />
            </Pressable>
            <View className="flex-1 bg-canvas border border-border rounded-3xl px-4" style={{ minHeight: 44, justifyContent: 'center' }}>
              <TextInput
                value={texto}
                onChangeText={setTexto}
                placeholder="Escribe un mensaje"
                placeholderTextColor={colors.inkSubtle}
                multiline
                maxLength={4000}
                className="text-ink"
                style={{ maxHeight: 110, fontSize: 15, paddingTop: 10, paddingBottom: 10 }}
              />
            </View>
            {texto.trim() === '' ? (
              <Pressable
                onPress={empezarAudio}
                disabled={enviando}
                accessibilityLabel="Grabar un audio"
                className="w-11 h-11 rounded-full bg-action items-center justify-center"
              >
                {enviando ? <ActivityIndicator color={colors.white} /> : <Feather name="mic" size={20} color={colors.white} />}
              </Pressable>
            ) : (
              <Pressable
                onPress={enviarMensaje}
                disabled={enviando}
                accessibilityLabel="Enviar"
                className="w-11 h-11 rounded-full bg-action items-center justify-center"
              >
                <Feather name="send" size={19} color={colors.white} />
              </Pressable>
            )}
          </View>
        )}
      </View>

      <Modal visible={menuAdjuntar} transparent animationType="slide" onRequestClose={() => setMenuAdjuntar(false)}>
        <Pressable onPress={() => setMenuAdjuntar(false)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }} />
        <View className="bg-surface rounded-t-3xl px-5 pt-4 pb-9">
          <View className="items-center mb-3">
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border }} />
          </View>
          {[
            { icono: 'camera' as const, titulo: 'Cámara', sub: 'Haz una foto ahora y envíala', fondo: colors.actionTint, color: colors.action, accion: hacerFoto },
            { icono: 'image' as const, titulo: 'Fotos', sub: 'Elige una imagen de tu galería', fondo: colors.successTint, color: colors.success, accion: elegirFoto },
            { icono: 'mic' as const, titulo: 'Audio', sub: 'Graba un mensaje de voz', fondo: colors.warningTint, color: colors.warning, accion: empezarAudio },
          ].map((o) => (
            <Pressable key={o.titulo} onPress={o.accion} className="flex-row items-center gap-3.5 py-2.5" accessibilityLabel={o.titulo}>
              <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: o.fondo, alignItems: 'center', justifyContent: 'center' }}>
                <Feather name={o.icono} size={23} color={o.color} />
              </View>
              <View>
                <Text className="text-ink text-base font-sansSemiBold">{o.titulo}</Text>
                <Text className="text-inkMuted text-[13px]">{o.sub}</Text>
              </View>
            </Pressable>
          ))}
          <Pressable onPress={() => setMenuAdjuntar(false)} className="items-center py-3 mt-2 border border-border rounded-xl">
            <Text className="text-ink text-base font-sansSemiBold">Cancelar</Text>
          </Pressable>
        </View>
      </Modal>

      {mensajeDenunciado !== null && (
        <MenuDenuncia
          tipo="mensaje"
          objetoId={mensajeDenunciado.id}
          usuarioId={mensajeDenunciado.emisor_id}
          nombre={nombre}
          visible
          onCerrar={() => setMensajeDenunciado(null)}
          onBloqueado={() => navigation.goBack()}
        />
      )}
    </KeyboardAvoidingView>
  );
}