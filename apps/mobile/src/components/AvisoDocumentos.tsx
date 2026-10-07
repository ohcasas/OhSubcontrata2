import { View, Text } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../design-system/tokens';
import type { DocumentoRequerido } from '../services/catalogoRegistro';

/** Antes de registrarse: qué documentos se pedirán después para verificar la cuenta. */
export default function AvisoDocumentos({ documentos }: { documentos: DocumentoRequerido[] }) {
  if (documentos.length === 0) return null;
  return (
    <View className="bg-actionTint rounded-xl p-3.5 mt-3">
      <View className="flex-row items-center gap-2 mb-1.5">
        <Feather name="file-text" size={15} color={colors.action} />
        <Text className="text-ink text-xs font-sansBold">Documentación para verificar tu cuenta</Text>
      </View>
      <Text className="text-ink text-xs mb-1.5">
        Cuando confirmes tu correo e inicies sesión, te pediremos:
      </Text>
      {documentos.map((d) => (
        <Text key={d.tipo} className="text-ink text-xs leading-relaxed">
          • {d.etiqueta}
          {d.obligatorio ? '' : ' (opcional)'}
        </Text>
      ))}
    </View>
  );
}