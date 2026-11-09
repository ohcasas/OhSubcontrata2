import { useState } from 'react';
import { Modal, View, Text, TextInput, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../design-system/tokens';
import { firmarContrato, type Contrato } from '../services/pagos';

type Props = {
  contrato: Contrato | null;
  onCerrar: () => void;
  /** Se llama cuando la firma se ha registrado correctamente. */
  onFirmado: (contrato: Contrato) => void;
};

/** Pantalla para leer un contrato y firmarlo (firma electrónica simple: nombre + aceptación). */
export default function FirmaContrato({ contrato, onCerrar, onFirmado }: Props) {
  const [nombre, setNombre] = useState('');
  const [acepto, setAcepto] = useState(false);
  const [firmando, setFirmando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cerrar = () => {
    if (firmando) return;
    setNombre('');
    setAcepto(false);
    setError(null);
    onCerrar();
  };

  const firmar = async () => {
    if (!contrato) return;
    setFirmando(true);
    setError(null);
    try {
      await firmarContrato(contrato.id, nombre.trim(), acepto);
      const hecho = contrato;
      setNombre('');
      setAcepto(false);
      setFirmando(false);
      onFirmado(hecho);
    } catch (e) {
      setError((e as Error).message);
      setFirmando(false);
    }
  };

  const listo = acepto && nombre.trim().length >= 3 && !firmando;
  const esConformidad = contrato?.tipo === 'conformidad';

  return (
    <Modal visible={contrato !== null} animationType="slide" onRequestClose={cerrar}>
      <View className="flex-1 bg-canvas">
        <View className="flex-row items-center px-4 pt-12 pb-3 border-b border-border" style={{ gap: 8 }}>
          <Feather name="file-text" size={18} color={colors.action} />
          <Text className="text-ink text-base font-sansBold flex-1">{contrato?.titulo ?? 'Contrato'}</Text>
          <Pressable onPress={cerrar} hitSlop={10} accessibilityLabel="Cerrar">
            <Feather name="x" size={22} color={colors.inkMuted} />
          </Pressable>
        </View>

        <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingVertical: 16 }}>
          <Text className="text-ink text-[13px] leading-5">{contrato?.cuerpo ?? ''}</Text>
        </ScrollView>

        <View className="px-4 pt-3 pb-8 border-t border-border bg-surface">
          <Pressable onPress={() => setAcepto(!acepto)} className="flex-row items-start mb-3" style={{ gap: 8 }}>
            <Feather name={acepto ? 'check-square' : 'square'} size={20} color={acepto ? colors.action : colors.inkMuted} />
            <Text className="text-ink text-xs flex-1">
              {esConformidad
                ? 'He leído este documento, he revisado el trabajo y doy mi conformidad.'
                : 'He leído este documento y acepto las condiciones del encargo.'}
            </Text>
          </Pressable>
          <Text className="text-inkMuted text-xs mb-1">Escribe tu nombre y apellidos para firmar</Text>
          <View className="bg-canvas border border-border rounded-xl px-3 mb-2">
            <TextInput
              value={nombre}
              onChangeText={setNombre}
              autoCapitalize="words"
              placeholder="Nombre y apellidos"
              placeholderTextColor={colors.inkSubtle}
              className="py-2.5 text-ink"
            />
          </View>
          {error !== null && <Text className="text-error text-xs mb-2">{error}</Text>}
          <Pressable
            onPress={firmar}
            disabled={!listo}
            className={`rounded-lg py-3 items-center ${listo ? 'bg-action' : 'bg-border'}`}
          >
            {firmando ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-white text-xs font-sansBold">
                {esConformidad ? 'Firmar y confirmar' : 'Firmar y continuar'}
              </Text>
            )}
          </Pressable>
          <Text className="text-inkMuted text-[11px] mt-2">
            Se guardan la fecha, la hora y los datos técnicos de tu firma. Recibirás el documento firmado en tu cuenta.
          </Text>
        </View>
      </View>
    </Modal>
  );
}