import { useCallback } from 'react';
import { View, Text } from 'react-native';
import {
  misDocumentos,
  subirDocumentoCuenta,
  type ArchivoElegido,
  type DocumentoApp,
} from '../../services/documentos';
import ListaDocumentos from './ListaDocumentos';

export default function MisDocumentosScreen() {
  const cargar = useCallback(() => misDocumentos(), []);
  const subir = useCallback(
    (doc: DocumentoApp, archivo: ArchivoElegido) => subirDocumentoCuenta(doc.tipo, archivo),
    [],
  );

  return (
    <View className="flex-1 bg-canvas">
      <ListaDocumentos
        cargar={cargar}
        subir={subir}
        cabecera={
          <Text className="text-inkMuted text-sm leading-relaxed mb-3">
            Cada documento tiene una fecha de caducidad. Te avisamos 15 días antes para que lo renueves a tiempo; mientras
            revisamos la renovación, el documento actual sigue vigente.
          </Text>
        }
      />
    </View>
  );
}