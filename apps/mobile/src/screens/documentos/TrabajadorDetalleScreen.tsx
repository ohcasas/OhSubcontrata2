import { useCallback, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { colors } from '../../design-system/tokens';
import {
  documentosTrabajador,
  misTrabajadores,
  subirDocumentoTrabajador,
  type ArchivoElegido,
  type DocumentoApp,
  type TrabajadorApp,
} from '../../services/documentos';
import type { RootStackParamList } from '../../navigation/types';
import ListaDocumentos from './ListaDocumentos';

type Props = NativeStackScreenProps<RootStackParamList, 'TrabajadorDetalle'>;

export default function TrabajadorDetalleScreen({ route, navigation }: Props) {
  const { trabajadorId } = route.params;
  const [trabajador, setTrabajador] = useState<TrabajadorApp | null>(null);

  // Los datos se vuelven a leer al volver de editarlos
  useFocusEffect(
    useCallback(() => {
      let activo = true;
      misTrabajadores()
        .then((lista) => {
          if (activo) setTrabajador(lista.find((t) => t.id === trabajadorId) ?? null);
        })
        .catch(() => {});
      return () => {
        activo = false;
      };
    }, [trabajadorId]),
  );

  const cargar = useCallback(() => documentosTrabajador(trabajadorId), [trabajadorId]);
  const subir = useCallback(
    (doc: DocumentoApp, archivo: ArchivoElegido) => subirDocumentoTrabajador(trabajadorId, doc.tipo, archivo),
    [trabajadorId],
  );

  return (
    <View className="flex-1 bg-canvas">
      <ListaDocumentos
        cargar={cargar}
        subir={subir}
        cabecera={
          trabajador !== null ? (
            <View className="bg-surface rounded-2xl border border-border p-4 mb-3">
              <View className="flex-row justify-between items-start">
                <View className="flex-1 pr-2">
                  <Text className="text-ink text-base font-sansBold">
                    {trabajador.nombre} {trabajador.apellidos ?? ''}
                  </Text>
                  <Text className="text-inkMuted text-xs mt-0.5">
                    {trabajador.dni}
                    {trabajador.puesto !== null ? ` · ${trabajador.puesto}` : ''}
                  </Text>
                  {!trabajador.activo && (
                    <View className="self-start bg-canvas rounded-md px-2 py-0.5 mt-1.5 border border-border">
                      <Text className="text-inkMuted text-[11px] font-sansBold">De baja</Text>
                    </View>
                  )}
                </View>
                <Pressable
                  onPress={() => navigation.navigate('TrabajadorForm', { trabajadorId })}
                  className="flex-row items-center gap-1"
                >
                  <Feather name="edit-2" size={14} color={colors.action} />
                  <Text className="text-action text-xs font-sansSemiBold">Editar datos</Text>
                </Pressable>
              </View>
            </View>
          ) : null
        }
      />
    </View>
  );
}