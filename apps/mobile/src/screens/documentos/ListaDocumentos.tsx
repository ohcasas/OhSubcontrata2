import { useCallback, useState, type ReactNode } from 'react';
import { View, Text, ScrollView, RefreshControl, ActivityIndicator, Linking } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../../design-system/tokens';
import {
  elegirArchivo,
  mensajeDeError,
  urlDeArchivo,
  type ArchivoElegido,
  type DocumentoApp,
  type ResultadoSubida,
} from '../../services/documentos';
import TarjetaDocumento from './TarjetaDocumento';

type Props = {
  /** Debe ser estable (useCallback): se vuelve a llamar al entrar en la pantalla y al refrescar */
  cargar: () => Promise<DocumentoApp[]>;
  subir: (doc: DocumentoApp, archivo: ArchivoElegido) => Promise<ResultadoSubida>;
  cabecera?: ReactNode;
};

/** Lista de documentos con subida y renovación. La usan "Mis documentos" y la ficha de un trabajador. */
export default function ListaDocumentos({ cargar, subir, cabecera }: Props) {
  const [docs, setDocs] = useState<DocumentoApp[]>([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [subiendoTipo, setSubiendoTipo] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    try {
      setDocs(await cargar());
      setError(null);
    } catch {
      setError('No se han podido cargar los documentos. Tira hacia abajo para reintentar.');
    }
  }, [cargar]);

  // Al volver a la pantalla se recarga (por ejemplo, tras renovar o tras un aviso de caducidad)
  useFocusEffect(
    useCallback(() => {
      let activo = true;
      setCargando(true);
      recargar().finally(() => {
        if (activo) setCargando(false);
      });
      return () => {
        activo = false;
      };
    }, [recargar]),
  );

  const refrescar = async () => {
    setRefrescando(true);
    await recargar();
    setRefrescando(false);
  };

  const manejarSubir = async (doc: DocumentoApp) => {
    setError(null);
    setAviso(null);
    try {
      const archivo = await elegirArchivo();
      if (archivo === null) return;
      setSubiendoTipo(doc.tipo);
      const resultado = await subir(doc, archivo);
      setAviso(
        resultado === 'renovacion'
          ? 'Renovación enviada. La revisaremos y te avisaremos.'
          : 'Documento enviado. Lo revisaremos y te avisaremos.',
      );
      await recargar();
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setSubiendoTipo(null);
    }
  };

  const ver = async (ruta: string) => {
    try {
      await Linking.openURL(await urlDeArchivo(ruta));
    } catch {
      setError('No se ha podido abrir el documento.');
    }
  };

  const hayPendientes = docs.some(
    (d) =>
      (d.obligatorio && d.estado_real === 'faltante') ||
      d.estado_real === 'rechazado' ||
      d.estado_real === 'caducado' ||
      d.estado_real === 'por_caducar',
  );

  if (cargando && docs.length === 0) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <ActivityIndicator color={colors.action} />
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refrescando} onRefresh={refrescar} colors={[colors.action]} />}
    >
      {cabecera}

      {error !== null && (
        <View className="bg-errorTint rounded-lg px-3 py-2 mb-3 flex-row items-center gap-2">
          <Feather name="alert-circle" size={16} color={colors.error} />
          <Text className="text-error text-sm flex-1">{error}</Text>
        </View>
      )}
      {aviso !== null && (
        <View className="bg-successTint rounded-lg px-3 py-2 mb-3 flex-row items-center gap-2">
          <Feather name="check-circle" size={16} color={colors.success} />
          <Text className="text-success text-sm flex-1">{aviso}</Text>
        </View>
      )}

      {docs.length > 0 && (
        <View className={`rounded-lg px-3 py-2 mb-3 flex-row items-center gap-2 ${hayPendientes ? 'bg-warningTint' : 'bg-successTint'}`}>
          <Feather
            name={hayPendientes ? 'alert-triangle' : 'check-circle'}
            size={16}
            color={hayPendientes ? colors.warning : colors.success}
          />
          <Text className={`text-sm flex-1 ${hayPendientes ? 'text-warning' : 'text-success'}`}>
            {hayPendientes ? 'Hay documentos que necesitan tu atención.' : 'Toda la documentación está en regla.'}
          </Text>
        </View>
      )}

      {docs.length === 0 && error === null ? (
        <Text className="text-inkMuted text-sm text-center mt-6">No se pide documentación para este caso.</Text>
      ) : (
        <View className="gap-2.5">
          {docs.map((d) => (
            <TarjetaDocumento
              key={d.tipo}
              doc={d}
              subiendo={subiendoTipo === d.tipo}
              ocupado={subiendoTipo !== null}
              onSubir={manejarSubir}
              onVer={ver}
            />
          ))}
        </View>
      )}

      {docs.length > 0 && (
        <Text className="text-inkMuted text-[11px] text-center mt-4">
          PDF o foto (JPG o PNG), hasta 10 MB cada archivo. Los marcados con * son obligatorios.
        </Text>
      )}
    </ScrollView>
  );
}