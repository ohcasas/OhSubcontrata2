import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Linking, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { supabase } from '../../services/supabase';
import { cerrarSesion } from '../../services/sesion';
import { subirArchivoPrivado } from '../../services/storage';
import { colors } from '../../design-system/tokens';

type Props = {
  estado: 'pendiente' | 'suspendida' | 'error';
  motivo: string | null;
  comprobando: boolean;
  onComprobar: () => void;
  userId: string;
};

type Documento = {
  tipo: string;
  etiqueta: string;
  descripcion: string | null;
  obligatorio: boolean;
  orden: number;
  documento_id: string | null;
  estado: 'pendiente' | 'aprobado' | 'rechazado' | null;
  motivo_rechazo: string | null;
  nombre_archivo: string | null;
};

const CONTENIDO = {
  pendiente: { icono: 'clock' as const, titulo: 'Estamos revisando tu cuenta', boton: 'Comprobar ahora' },
  suspendida: {
    icono: 'alert-octagon' as const,
    titulo: 'Cuenta suspendida',
    texto: 'Tu cuenta está suspendida y no puedes usar la app por ahora.',
    boton: 'Comprobar de nuevo',
  },
  error: {
    icono: 'wifi-off' as const,
    titulo: 'No hemos podido cargar tu cuenta',
    texto: 'Comprueba tu conexión a internet e inténtalo de nuevo.',
    boton: 'Reintentar',
  },
};

const ESTILO_DOCUMENTO = {
  falta: { fondo: 'bg-warningTint', texto: 'text-warning', etiqueta: 'Falta' },
  pendiente: { fondo: 'bg-actionTint', texto: 'text-action', etiqueta: 'En revisión' },
  aprobado: { fondo: 'bg-successTint', texto: 'text-success', etiqueta: 'Aprobado' },
  rechazado: { fondo: 'bg-errorTint', texto: 'text-error', etiqueta: 'Rechazado' },
};

/** Traduce los fallos habituales de una subida a algo que se entienda. */
function mensajeDeError(e: unknown): string {
  const texto = (e instanceof Error ? e.message : typeof e === 'object' && e !== null && 'message' in e ? String((e as { message: unknown }).message) : String(e)).toLowerCase();
  if (texto.includes('mime') || texto.includes('not allowed') || texto.includes('invalid')) {
    return 'Ese tipo de archivo no está permitido. Sube un PDF o una foto en JPG o PNG.';
  }
  if (texto.includes('size') || texto.includes('exceed') || texto.includes('too large') || texto.includes('payload')) {
    return 'El archivo pesa más de 10 MB. Sube uno más ligero.';
  }
  return 'No se ha podido subir el documento. Inténtalo de nuevo.';
}

/**
 * Pantalla de quien inicia sesión con una cuenta que aún no está verificada (o suspendida).
 * Si está pendiente, aquí sube los documentos que se piden a su perfil. Es solo la parte
 * visible: lo que de verdad impide usar la app es la base de datos (migraciones 0034 y 0036).
 */
export default function CuentaNoActivaScreen({ estado, motivo, comprobando, onComprobar, userId }: Props) {
  const insets = useSafeAreaInsets();
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [cargandoDocs, setCargandoDocs] = useState(false);
  const [subiendoTipo, setSubiendoTipo] = useState<string | null>(null);
  const [errorDocs, setErrorDocs] = useState<string | null>(null);

  const cargarDocumentos = useCallback(async () => {
    const { data, error } = await supabase.rpc('mis_documentos_requeridos');
    if (error) {
      setErrorDocs('No se ha podido cargar la lista de documentos.');
    } else {
      setDocumentos((data as Documento[] | null) ?? []);
    }
    setCargandoDocs(false);
  }, []);

  useEffect(() => {
    if (estado !== 'pendiente') return;
    setCargandoDocs(true);
    cargarDocumentos();
  }, [estado, cargarDocumentos]);

  const subir = async (d: Documento) => {
    setErrorDocs(null);
    const resultado = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/*'],
      copyToCacheDirectory: true,
    });
    if (resultado.canceled) return;
    const archivo = resultado.assets[0];

    setSubiendoTipo(d.tipo);
    try {
      const ruta = await subirArchivoPrivado(
        'documentos-verificacion',
        userId,
        archivo.uri,
        archivo.mimeType ?? 'application/octet-stream',
        archivo.name,
      );
      const { error } = await supabase.rpc('registrar_documento_cuenta', {
        p_tipo: d.tipo,
        p_nombre: archivo.name,
        p_ruta: ruta,
        p_mime: archivo.mimeType ?? null,
      });
      if (error) throw error;
      await cargarDocumentos();
    } catch (e) {
      setErrorDocs(mensajeDeError(e));
    } finally {
      setSubiendoTipo(null);
    }
  };

  const comprobar = () => {
    if (estado === 'pendiente') cargarDocumentos();
    onComprobar();
  };

  const c = CONTENIDO[estado];
  const alerta = estado === 'suspendida';
  const faltanObligatorios = documentos.some((d) => d.obligatorio && d.estado === null);
  const hayRechazados = documentos.some((d) => d.estado === 'rechazado');
  const textoPendiente = faltanObligatorios || hayRechazados
    ? 'Para poder verificar tu cuenta necesitamos estos documentos. Los marcados con * son obligatorios.'
    : documentos.length > 0
      ? 'Gracias. Estamos revisando tu documentación; cuando tu cuenta esté verificada recibirás un aviso y podrás empezar a usar la app.'
      : 'Comprobamos que cada cuenta de OH Conecta pertenece a una empresa o profesional del sector. Cuando esté verificada recibirás un aviso y podrás empezar a usar la app.';

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}>
        <View className="items-center">
          <View className={`w-16 h-16 rounded-full items-center justify-center mb-5 ${alerta ? 'bg-errorTint' : 'bg-actionTint'}`}>
            <Feather name={c.icono} size={28} color={alerta ? colors.error : colors.action} />
          </View>
          <Text className="text-ink text-xl font-sansBold text-center mb-2">
            {estado === 'pendiente' && (faltanObligatorios || hayRechazados) ? 'Completa tu verificación' : c.titulo}
          </Text>
          <Text className="text-inkMuted text-sm text-center leading-relaxed mb-2">
            {estado === 'pendiente' ? textoPendiente : (c as { texto: string }).texto}
          </Text>
          {estado === 'suspendida' && motivo !== null && (
            <Text className="text-ink text-sm text-center leading-relaxed mb-2">Motivo: {motivo}</Text>
          )}
        </View>

        {estado === 'pendiente' && (
          <View className="mt-4">
            {cargandoDocs && <ActivityIndicator color={colors.action} />}
            {errorDocs !== null && (
              <View className="bg-errorTint rounded-lg px-3 py-2 mb-3 flex-row items-center gap-2">
                <Feather name="alert-circle" size={16} color={colors.error} />
                <Text className="text-error text-sm flex-1">{errorDocs}</Text>
              </View>
            )}
            <View className="gap-2.5">
              {documentos.map((d) => {
                const clave = d.estado ?? 'falta';
                const estilo = ESTILO_DOCUMENTO[clave];
                const ocupado = subiendoTipo === d.tipo;
                return (
                  <View key={d.tipo} className="bg-surface rounded-xl border border-border p-3.5">
                    <View className="flex-row justify-between items-start">
                      <Text className="text-ink text-sm font-sansBold flex-1 pr-2">
                        {d.etiqueta}
                        {d.obligatorio ? ' *' : ''}
                      </Text>
                      <View className={`rounded-md px-2 py-0.5 ${estilo.fondo}`}>
                        <Text className={`text-[11px] font-sansBold ${estilo.texto}`}>{estilo.etiqueta}</Text>
                      </View>
                    </View>
                    {d.descripcion !== null && <Text className="text-inkMuted text-xs mt-1">{d.descripcion}</Text>}
                    {d.nombre_archivo !== null && (
                      <Text className="text-inkMuted text-xs mt-1.5" numberOfLines={1}>
                        Archivo: {d.nombre_archivo}
                      </Text>
                    )}
                    {d.estado === 'rechazado' && d.motivo_rechazo !== null && (
                      <Text className="text-error text-xs mt-1.5">Motivo del rechazo: {d.motivo_rechazo}</Text>
                    )}
                    {d.estado !== 'aprobado' && (
                      <Pressable
                        onPress={() => subir(d)}
                        disabled={subiendoTipo !== null}
                        className={`rounded-lg py-2.5 items-center flex-row justify-center gap-1.5 mt-2.5 ${
                          d.estado === null || d.estado === 'rechazado' ? 'bg-action' : 'border border-border'
                        }`}
                      >
                        {ocupado ? (
                          <ActivityIndicator size="small" color={d.estado === 'pendiente' ? colors.action : colors.white} />
                        ) : (
                          <Feather
                            name="upload"
                            size={13}
                            color={d.estado === null || d.estado === 'rechazado' ? colors.white : colors.inkMuted}
                          />
                        )}
                        <Text
                          className={`text-xs font-sansBold ${
                            d.estado === null || d.estado === 'rechazado' ? 'text-white' : 'text-inkMuted'
                          }`}
                        >
                          {ocupado ? 'Subiendo…' : d.estado === null ? 'Subir documento' : d.estado === 'rechazado' ? 'Subir de nuevo' : 'Cambiar archivo'}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </View>
            {documentos.length > 0 && (
              <Text className="text-inkMuted text-[11px] text-center mt-3">
                Puedes subir un PDF o una foto (JPG o PNG), de hasta 10 MB cada uno.
              </Text>
            )}
          </View>
        )}

        {estado !== 'error' && (
          <Pressable onPress={() => Linking.openURL('mailto:software@ohcasas.es')} className="mb-2 mt-4">
            <Text className="text-inkMuted text-xs text-center">
              {estado === 'suspendida' ? 'Si crees que es un error, escríbenos a ' : '¿Alguna duda? Escríbenos a '}
              <Text className="text-action font-sansSemiBold">software@ohcasas.es</Text>
            </Text>
          </Pressable>
        )}

        <Pressable
          onPress={comprobar}
          disabled={comprobando}
          className="bg-action rounded-xl py-3 items-center flex-row justify-center gap-2 mt-4"
        >
          {comprobando ? <ActivityIndicator color={colors.white} /> : <Feather name="refresh-cw" size={15} color={colors.white} />}
          <Text className="text-white font-sansBold text-sm">{comprobando ? 'Comprobando…' : c.boton}</Text>
        </Pressable>
        <Pressable onPress={() => cerrarSesion()} className="items-center py-3 mt-1">
          <Text className="text-inkMuted text-sm">Cerrar sesión</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}