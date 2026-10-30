import { useState } from 'react';
import { View, Text, TextInput, Pressable, Modal, ActivityIndicator, ScrollView, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../design-system/tokens';
import {
  MOTIVOS_DENUNCIA,
  denunciar,
  bloquearUsuario,
  type TipoContenido,
} from '../services/moderacion';

type Paso = 'menu' | 'motivo' | 'enviada';

/**
 * Botón «⋯» con las opciones de moderación de un contenido: denunciarlo y, si se conoce a su autor,
 * bloquearlo. Los bloqueos ocultan su contenido en esta cuenta; las denuncias las revisa el equipo de 3B.
 */
export default function MenuDenuncia({
  tipo,
  objetoId,
  usuarioId,
  nombre,
  onBloqueado,
  color,
  visible,
  onCerrar,
}: {
  tipo: TipoContenido;
  objetoId: string;
  /** Autor del contenido; si no se sabe, solo se ofrece denunciar. */
  usuarioId?: string | null;
  nombre?: string | null;
  onBloqueado?: () => void;
  color?: string;
  /** Modo controlado: sin botón «⋯»; se abre y se cierra desde fuera (p. ej. al mantener pulsado un mensaje). */
  visible?: boolean;
  onCerrar?: () => void;
}) {
  const controlado = visible !== undefined;
  const [abiertoInterno, setAbierto] = useState(false);
  const abierto = controlado ? visible : abiertoInterno;
  const [paso, setPaso] = useState<Paso>('menu');
  const [motivo, setMotivo] = useState<string | null>(null);
  const [detalle, setDetalle] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cerrar = () => {
    setAbierto(false);
    onCerrar?.();
    setTimeout(() => {
      setPaso('menu');
      setMotivo(null);
      setDetalle('');
      setError(null);
    }, 250);
  };

  const enviar = async () => {
    if (motivo === null) return setError('Elige un motivo.');
    setError(null);
    setEnviando(true);
    try {
      await denunciar(tipo, objetoId, motivo, detalle);
      setPaso('enviada');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se ha podido enviar la denuncia.');
    } finally {
      setEnviando(false);
    }
  };

  const bloquear = () => {
    if (usuarioId === undefined || usuarioId === null) return;
    const quien = nombre !== undefined && nombre !== null && nombre !== '' ? nombre : 'este usuario';
    Alert.alert(
      `¿Bloquear a ${quien}?`,
      'Dejarás de ver su contenido. Puedes desbloquearlo cuando quieras desde tu perfil.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Bloquear',
          style: 'destructive',
          onPress: async () => {
            try {
              await bloquearUsuario(usuarioId);
              cerrar();
              onBloqueado?.();
            } catch (e) {
              setError(e instanceof Error ? e.message : 'No se ha podido bloquear.');
            }
          },
        },
      ],
    );
  };

  return (
    <>
      {!controlado && (
        <Pressable
          onPress={() => setAbierto(true)}
          hitSlop={10}
          accessibilityLabel="Más opciones: denunciar o bloquear"
          className="p-1"
        >
          <Feather name="more-horizontal" size={20} color={color ?? colors.inkMuted} />
        </Pressable>
      )}

      <Modal visible={abierto} transparent animationType="slide" onRequestClose={cerrar}>
        <Pressable onPress={cerrar} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }} />
        <View className="bg-surface rounded-t-3xl px-5 pt-4 pb-8" style={{ maxHeight: '85%' }}>
          <View className="items-center mb-3">
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border }} />
          </View>

          {paso === 'menu' && (
            <View>
              <Pressable onPress={() => setPaso('motivo')} className="flex-row items-center gap-3 py-3.5">
                <Feather name="flag" size={18} color={colors.error} />
                <Text className="text-ink text-base font-sansSemiBold">Denunciar</Text>
              </Pressable>
              {usuarioId !== undefined && usuarioId !== null && (
                <Pressable onPress={bloquear} className="flex-row items-center gap-3 py-3.5 border-t border-border">
                  <Feather name="slash" size={18} color={colors.ink} />
                  <Text className="text-ink text-base font-sansSemiBold">
                    Bloquear{nombre !== undefined && nombre !== null && nombre !== '' ? ` a ${nombre}` : ' al autor'}
                  </Text>
                </Pressable>
              )}
              {error !== null && <Text className="text-error text-xs mt-2">{error}</Text>}
              <Pressable onPress={cerrar} className="items-center py-3 mt-2">
                <Text className="text-inkMuted text-sm">Cancelar</Text>
              </Pressable>
            </View>
          )}

          {paso === 'motivo' && (
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text className="text-ink text-lg font-sansBold">¿Qué ocurre?</Text>
              <Text className="text-inkMuted text-[13px] mt-1 mb-3">
                El equipo de 3B revisará la denuncia. Nadie verá que la has enviado tú.
              </Text>
              {MOTIVOS_DENUNCIA.map((m) => {
                const activo = motivo === m.clave;
                return (
                  <Pressable
                    key={m.clave}
                    onPress={() => setMotivo(m.clave)}
                    className={`rounded-xl border px-3 py-3 mb-2 flex-row items-center gap-2 ${
                      activo ? 'border-action bg-actionTint' : 'border-border bg-surface'
                    }`}
                  >
                    <Feather name={activo ? 'check-circle' : 'circle'} size={16} color={activo ? colors.action : colors.inkSubtle} />
                    <Text className="text-ink text-sm flex-1">{m.etiqueta}</Text>
                  </Pressable>
                );
              })}
              <View className="bg-canvas border border-border rounded-xl px-3 mt-1">
                <TextInput
                  value={detalle}
                  onChangeText={setDetalle}
                  multiline
                  maxLength={1000}
                  placeholder="Cuéntanos más (opcional)"
                  placeholderTextColor={colors.inkSubtle}
                  editable={!enviando}
                  className="py-3 text-ink"
                  style={{ minHeight: 70, textAlignVertical: 'top' }}
                />
              </View>
              {error !== null && <Text className="text-error text-xs mt-2">{error}</Text>}
              <Pressable
                onPress={enviar}
                disabled={enviando}
                className="bg-action rounded-xl py-3.5 items-center mt-4"
              >
                {enviando ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Text className="text-white font-sansBold text-sm">Enviar denuncia</Text>
                )}
              </Pressable>
              <Pressable onPress={cerrar} className="items-center py-3">
                <Text className="text-inkMuted text-sm">Cancelar</Text>
              </Pressable>
            </ScrollView>
          )}

          {paso === 'enviada' && (
            <View className="items-center py-4">
              <Feather name="check-circle" size={32} color={colors.action} />
              <Text className="text-ink text-lg font-sansBold mt-3">Denuncia enviada</Text>
              <Text className="text-inkMuted text-sm text-center mt-1 mb-4">
                Gracias. La revisaremos lo antes posible y tomaremos medidas si incumple las normas.
              </Text>
              {usuarioId !== undefined && usuarioId !== null && (
                <Pressable onPress={bloquear} className="py-2">
                  <Text className="text-action text-sm font-sansSemiBold">
                    Bloquear{nombre !== undefined && nombre !== null && nombre !== '' ? ` a ${nombre}` : ' al autor'}
                  </Text>
                </Pressable>
              )}
              <Pressable onPress={cerrar} className="bg-action rounded-xl py-3 px-8 mt-2">
                <Text className="text-white font-sansBold text-sm">Listo</Text>
              </Pressable>
            </View>
          )}
        </View>
      </Modal>
    </>
  );
}