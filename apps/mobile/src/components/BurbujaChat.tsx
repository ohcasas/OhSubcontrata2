import { useEffect, useState } from 'react';
import { View, Text, Pressable, Image, Modal, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio';
import { colors } from '../design-system/tokens';
import { urlArchivo, type MensajeChat } from '../services/chat';

export function formatoDuracion(seg: number): string {
  const s = Math.max(0, Math.round(seg));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

function useUrl(ruta: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let vigente = true;
    if (ruta === null) return;
    urlArchivo(ruta)
      .then((u) => {
        if (vigente) setUrl(u);
      })
      .catch(() => undefined);
    return () => {
      vigente = false;
    };
  }, [ruta]);
  return url;
}

function ContenidoAudio({ url, duracion, propio }: { url: string | null; duracion: number; propio: boolean }) {
  const reproductor = useAudioPlayer(url !== null ? { uri: url } : null);
  const estado = useAudioPlayerStatus(reproductor);
  const color = propio ? colors.white : colors.action;

  const alternar = async () => {
    if (url === null) return;
    if (estado.playing) {
      reproductor.pause();
      return;
    }
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
    if (estado.didJustFinish || (estado.duration > 0 && estado.currentTime >= estado.duration - 0.1)) {
      await reproductor.seekTo(0);
    }
    reproductor.play();
  };

  const total = estado.duration > 0 ? estado.duration : duracion;
  const progreso = total > 0 ? Math.min(1, estado.currentTime / total) : 0;

  return (
    <View className="flex-row items-center gap-3" style={{ minWidth: 190 }}>
      <Pressable
        onPress={alternar}
        disabled={url === null}
        accessibilityLabel={estado.playing ? 'Pausar audio' : 'Reproducir audio'}
        className="w-9 h-9 rounded-full items-center justify-center"
        style={{ backgroundColor: propio ? colors.white : colors.actionTint }}
      >
        {url === null ? (
          <ActivityIndicator size="small" color={color} />
        ) : (
          <Feather name={estado.playing ? 'pause' : 'play'} size={16} color={colors.action} />
        )}
      </Pressable>
      <View className="flex-1">
        <View style={{ height: 4, borderRadius: 2, backgroundColor: propio ? 'rgba(255,255,255,0.35)' : colors.border }}>
          <View style={{ height: 4, borderRadius: 2, width: `${progreso * 100}%`, backgroundColor: color }} />
        </View>
      </View>
      <Text style={{ color: propio ? '#CFE0FF' : colors.inkMuted, fontSize: 12 }}>
        {formatoDuracion(estado.playing ? estado.currentTime : total)}
      </Text>
    </View>
  );
}

function ContenidoFoto({ ruta }: { ruta: string }) {
  const url = useUrl(ruta);
  const [grande, setGrande] = useState(false);
  return (
    <>
      <Pressable onPress={() => url !== null && setGrande(true)} accessibilityLabel="Ver foto">
        {url === null ? (
          <View style={{ width: 220, height: 160, borderRadius: 12, backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={colors.action} />
          </View>
        ) : (
          <Image source={{ uri: url }} style={{ width: 220, height: 160, borderRadius: 12 }} resizeMode="cover" />
        )}
      </Pressable>
      <Modal visible={grande} transparent animationType="fade" onRequestClose={() => setGrande(false)}>
        <Pressable onPress={() => setGrande(false)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center' }}>
          {url !== null && <Image source={{ uri: url }} style={{ width: '100%', height: '80%' }} resizeMode="contain" />}
          <View style={{ position: 'absolute', top: 56, right: 20 }}>
            <Feather name="x" size={28} color={colors.white} />
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

/** Burbuja de un mensaje: texto, foto o audio. Mantener pulsada una burbuja ajena abre sus opciones (denunciar). */
export default function BurbujaChat({
  mensaje,
  propio,
  oficial,
  onMantener,
}: {
  mensaje: MensajeChat;
  propio: boolean;
  /** Mensaje de Administración dentro de su chat. */
  oficial?: boolean;
  onMantener?: () => void;
}) {
  const fondo = propio ? colors.action : colors.surface;
  return (
    <View style={{ alignSelf: propio ? 'flex-end' : 'flex-start', maxWidth: '82%', marginVertical: 3 }}>
      <Pressable
        onLongPress={propio ? undefined : onMantener}
        delayLongPress={350}
        style={{
          backgroundColor: fondo,
          borderWidth: propio ? 0 : 1,
          borderColor: colors.border,
          borderRadius: 16,
          borderBottomRightRadius: propio ? 4 : 16,
          borderBottomLeftRadius: propio ? 16 : 4,
          paddingHorizontal: mensaje.tipo === 'imagen' ? 6 : 14,
          paddingVertical: mensaje.tipo === 'imagen' ? 6 : 10,
        }}
      >
        {oficial === true && !propio && (
          <Text style={{ color: colors.action, fontSize: 11, fontWeight: '600', marginBottom: 2 }}>Administración</Text>
        )}
        {mensaje.tipo === 'texto' && (
          <Text style={{ color: propio ? colors.white : colors.ink, fontSize: 15, lineHeight: 21 }}>{mensaje.texto}</Text>
        )}
        {mensaje.tipo === 'imagen' && mensaje.archivo_path !== null && <ContenidoFoto ruta={mensaje.archivo_path} />}
        {mensaje.tipo === 'audio' && mensaje.archivo_path !== null && (
          <AudioDeMensaje ruta={mensaje.archivo_path} duracion={mensaje.duracion_seg ?? 0} propio={propio} />
        )}
        <Text
          style={{
            color: propio ? '#CFE0FF' : colors.inkSubtle,
            fontSize: 11,
            marginTop: 4,
            alignSelf: 'flex-end',
            paddingHorizontal: mensaje.tipo === 'imagen' ? 6 : 0,
          }}
        >
          {hora(mensaje.created_at)}
        </Text>
      </Pressable>
    </View>
  );
}

function AudioDeMensaje({ ruta, duracion, propio }: { ruta: string; duracion: number; propio: boolean }) {
  const url = useUrl(ruta);
  return <ContenidoAudio url={url} duracion={duracion} propio={propio} />;
}