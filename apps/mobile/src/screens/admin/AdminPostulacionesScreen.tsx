import { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Pressable,
  Linking,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { obtenerUrlFirmada } from '../../services/storage';
import { colors } from '../../design-system/tokens';
import type { RootStackParamList } from '../../navigation/types';
import ScreenHeader from '../../components/ScreenHeader';

type Estado = 'enviada' | 'en_revision' | 'aceptada' | 'rechazada';

type Contacto = { nombre_completo: string; telefono: string | null; email: string | null };
type ArchivoAdjunto = { id: string; nombre_archivo: string; storage_path: string };

type PostulacionCompleta = {
  id: string;
  oferta_economica: number;
  telefono_contacto: string | null;
  estado: Estado;
  created_at: string;
  empresa_id: string;
  obra_id: string;
  obras: { titulo: string; referencia: string; moneda: string; estado: string } | null;
  empresas_subcontratistas: { nombre: string } | null;
};

const ETIQUETA_ESTADO_OBRA: Record<string, string> = {
  abierta: 'Abierta',
  adjudicada: 'Adjudicada',
  en_curso: 'En curso',
  cerrada: 'Finalizada',
  cancelada: 'Cancelada',
};

const ETIQUETA_ESTADO: Record<Estado, string> = {
  enviada: 'Enviada',
  en_revision: 'En revisión',
  aceptada: 'Aceptada',
  rechazada: 'No seleccionada',
};

const ESTILO_ESTADO: Record<Estado, { badge: string; texto: string }> = {
  enviada: { badge: 'bg-actionTint', texto: 'text-action' },
  en_revision: { badge: 'bg-warningTint', texto: 'text-warning' },
  aceptada: { badge: 'bg-successTint', texto: 'text-success' },
  rechazada: { badge: 'bg-errorTint', texto: 'text-error' },
};

function formatearMoneda(valor: number, moneda: string): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: moneda }).format(valor);
}

export default function AdminPostulacionesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [postulaciones, setPostulaciones] = useState<PostulacionCompleta[]>([]);
  const [contactos, setContactos] = useState<Record<string, Contacto>>({});
  const [archivos, setArchivos] = useState<Record<string, ArchivoAdjunto[]>>({});
  const [cargando, setCargando] = useState(true);
  const primeraCarga = useRef(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actualizandoId, setActualizandoId] = useState<string | null>(null);
  const [rechazandoId, setRechazandoId] = useState<string | null>(null);
  const [motivoTexto, setMotivoTexto] = useState('');
  const [abriendoArchivoId, setAbriendoArchivoId] = useState<string | null>(null);

  const cargarPostulaciones = useCallback(async () => {
    setError(null);
    const { data, error: errorConsulta } = await supabase
      .from('postulaciones')
      .select(
        'id, oferta_economica, telefono_contacto, estado, created_at, empresa_id, obra_id, obras(titulo, referencia, moneda, estado), empresas_subcontratistas(nombre)',
      )
      .order('created_at', { ascending: false });

    if (errorConsulta) {
      setError('No se han podido cargar las postulaciones.');
      return;
    }
    const lista = (data as unknown as PostulacionCompleta[] | null) ?? [];
    setPostulaciones(lista);

    if (lista.length > 0) {
      const { data: archivosData } = await supabase
        .from('postulacion_archivos')
        .select('id, nombre_archivo, storage_path, postulacion_id')
        .in('postulacion_id', lista.map((p) => p.id));

      const mapaArchivos: Record<string, ArchivoAdjunto[]> = {};
      (archivosData ?? []).forEach((a) => {
        const postId = a.postulacion_id as string;
        if (!mapaArchivos[postId]) mapaArchivos[postId] = [];
        mapaArchivos[postId].push({
          id: a.id as string,
          nombre_archivo: a.nombre_archivo as string,
          storage_path: a.storage_path as string,
        });
      });
      setArchivos(mapaArchivos);
    }

    const empresaIds = [...new Set(lista.map((p) => p.empresa_id))];
    if (empresaIds.length > 0) {
      const { data: contactosData } = await supabase
        .from('profiles')
        .select('empresa_id, nombre_completo, telefono, email')
        .in('empresa_id', empresaIds);

      const mapa: Record<string, Contacto> = {};
      (contactosData ?? []).forEach((c) => {
        const empresaId = c.empresa_id as string;
        if (!mapa[empresaId]) {
          mapa[empresaId] = {
            nombre_completo: c.nombre_completo as string,
            telefono: c.telefono as string | null,
            email: c.email as string | null,
          };
        }
      });
      setContactos(mapa);
    }
  }, []);

  // Recarga al volver a la pestaña (p.ej. tras cambiar el estado de la obra
  // desde su detalle) para que lo que se ve aquí nunca vaya por detrás.
  useFocusEffect(
    useCallback(() => {
      (async () => {
        if (primeraCarga.current) setCargando(true);
        await cargarPostulaciones();
        primeraCarga.current = false;
        setCargando(false);
      })();
    }, [cargarPostulaciones]),
  );

  const handleRefrescar = async () => {
    setRefrescando(true);
    await cargarPostulaciones();
    setRefrescando(false);
  };

  const handleAbrirArchivo = async (archivo: ArchivoAdjunto) => {
    setAbriendoArchivoId(archivo.id);
    try {
      const url = await obtenerUrlFirmada('postulacion-archivos', archivo.storage_path);
      await Linking.openURL(url);
    } catch {
      setError('No se ha podido abrir el archivo.');
    } finally {
      setAbriendoArchivoId(null);
    }
  };

  // Rechazar exige un motivo: se guarda en la postulación y llega a la empresa
  // en la notificación (la genera un trigger de la base de datos).
  const handleConfirmarRechazo = async (id: string) => {
    const motivo = motivoTexto.trim();
    if (motivo.length < 3) {
      setError('Escribe el motivo del rechazo (se le enviará a la empresa).');
      return;
    }
    setError(null);
    setActualizandoId(id);
    const { error: errorUpdate } = await supabase
      .from('postulaciones')
      .update({ estado: 'rechazada', motivo_rechazo: motivo })
      .eq('id', id);
    setActualizandoId(null);
    if (errorUpdate) {
      setError(`No se ha podido rechazar la postulación: ${errorUpdate.message}`);
      return;
    }
    setPostulaciones((prev) => prev.map((p) => (p.id === id ? { ...p, estado: 'rechazada' } : p)));
    setRechazandoId(null);
    setMotivoTexto('');
  };

  const handleCambiarEstado = async (id: string, nuevoEstado: Estado) => {
    setActualizandoId(id);

    // Aceptar una postulación acredita los puntos de la obra al mismo
    // tiempo (vía la función aceptar_postulacion) — rechazar solo cambia
    // el estado, no tiene efectos en el Club Partner.
    const { error: errorUpdate } =
      nuevoEstado === 'aceptada'
        ? await supabase.rpc('aceptar_postulacion', { p_postulacion_id: id })
        : await supabase.from('postulaciones').update({ estado: nuevoEstado }).eq('id', id);

    setActualizandoId(null);

    if (!errorUpdate) {
      setPostulaciones((prev) =>
        prev.map((p) => (p.id === id ? { ...p, estado: nuevoEstado } : p)),
      );
    } else {
      setError(`No se ha podido actualizar la postulación: ${errorUpdate.message}`);
    }
  };

  if (cargando) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <ActivityIndicator color={colors.action} />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader title="Postulaciones" />

      {error !== null && (
        <View className="bg-errorTint mx-4 mt-3 rounded-lg px-3 py-2 flex-row items-center gap-2">
          <Feather name="alert-circle" size={17} color={colors.error} />
          <Text className="text-error text-sm flex-1">{error}</Text>
        </View>
      )}

      <FlatList
        data={postulaciones}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
        refreshControl={
          <RefreshControl refreshing={refrescando} onRefresh={handleRefrescar} colors={[colors.action]} />
        }
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListEmptyComponent={
          error === null ? (
            <View className="items-center mt-10">
              <Feather name="inbox" size={28} color={colors.inkSubtle} />
              <Text className="text-inkMuted text-sm text-center mt-3">
                No hay postulaciones todavía.
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          const estilo = ESTILO_ESTADO[item.estado];
          const pendienteDeDecision = item.estado === 'enviada' || item.estado === 'en_revision';
          const irALaObra = item.estado === 'aceptada';
          return (
            <View className="bg-surface rounded-xl border border-border p-3.5">
              <Pressable
                onPress={
                  irALaObra ? () => navigation.navigate('AdminObraDetalle', { obraId: item.obra_id }) : undefined
                }
                className="flex-row justify-between items-start"
              >
                <View className="flex-1 pr-2">
                  <Text className="text-ink text-sm font-sansBold">
                    {item.obras?.titulo ?? 'Obra eliminada'}
                  </Text>
                  <View className="flex-row items-center gap-1 mt-0.5">
                    <Feather name="briefcase" size={12} color={colors.inkMuted} />
                    <Text className="text-inkMuted text-xs">
                      {item.empresas_subcontratistas?.nombre ?? 'Empresa desconocida'}
                    </Text>
                  </View>
                </View>
                <View className={`rounded-md px-2 py-0.5 ${estilo.badge}`}>
                  <Text className={`text-[12px] font-sansBold ${estilo.texto}`}>
                    {ETIQUETA_ESTADO[item.estado]}
                  </Text>
                </View>
              </Pressable>
              {irALaObra && (
                <View className="flex-row items-center gap-1 mt-1">
                  <Feather name="arrow-right-circle" size={13} color={colors.action} />
                  <Text className="text-action text-[12px] font-sansSemiBold">
                    Ir a la obra
                    {item.obras !== null ? ` · ${ETIQUETA_ESTADO_OBRA[item.obras.estado] ?? item.obras.estado}` : ''}
                  </Text>
                </View>
              )}

              <Text className="text-ink text-sm font-sansBold mt-2">
                {formatearMoneda(item.oferta_economica, item.obras?.moneda ?? 'EUR')}
              </Text>

              {contactos[item.empresa_id] !== undefined && (
                <View className="gap-2 mt-3">
                  {contactos[item.empresa_id].email !== null && (
                    <Pressable
                      onPress={() => Linking.openURL(`mailto:${contactos[item.empresa_id].email}`)}
                      className="flex-row items-center gap-1.5 bg-canvas border border-border rounded-lg py-2 px-3"
                    >
                      <Feather name="mail" size={14} color={colors.action} />
                      <Text className="text-action text-xs font-sansSemiBold flex-1" numberOfLines={1} ellipsizeMode="tail">
                        {contactos[item.empresa_id].email}
                      </Text>
                    </Pressable>
                  )}
                  {(contactos[item.empresa_id].telefono ?? item.telefono_contacto) !== null && (
                    <Pressable
                      onPress={() =>
                        Linking.openURL(
                          `tel:${contactos[item.empresa_id].telefono ?? item.telefono_contacto}`,
                        )
                      }
                      className="flex-row items-center gap-1.5 bg-canvas border border-border rounded-lg py-2 px-3 self-start"
                    >
                      <Feather name="phone" size={14} color={colors.action} />
                      <Text className="text-action text-xs font-sansSemiBold">
                        {contactos[item.empresa_id].telefono ?? item.telefono_contacto}
                      </Text>
                    </Pressable>
                  )}
                </View>
              )}

              {contactos[item.empresa_id]?.telefono === null && item.telefono_contacto !== null && (
                <Text className="text-inkMuted text-[12px] mt-1">
                  Este teléfono lo indicó la empresa al postular a esta obra (el perfil no tiene uno registrado).
                </Text>
              )}

              {archivos[item.id] !== undefined && archivos[item.id].length > 0 && (
                <View className="mt-2 gap-1.5">
                  {archivos[item.id].map((archivo) => (
                    <Pressable
                      key={archivo.id}
                      onPress={() => handleAbrirArchivo(archivo)}
                      disabled={abriendoArchivoId === archivo.id}
                      className="flex-row items-center gap-2 bg-canvas border border-border rounded-lg px-3 py-2"
                    >
                      {abriendoArchivoId === archivo.id ? (
                        <ActivityIndicator size="small" color={colors.action} />
                      ) : (
                        <Feather name="paperclip" size={14} color={colors.action} />
                      )}
                      <Text className="text-action text-xs font-sansSemiBold flex-1" numberOfLines={1}>
                        {archivo.nombre_archivo}
                      </Text>
                      <Feather name="download" size={14} color={colors.inkMuted} />
                    </Pressable>
                  ))}
                </View>
              )}

              {pendienteDeDecision && rechazandoId !== item.id && (
                <View className="flex-row gap-2 mt-3">
                  <Pressable
                    onPress={() => handleCambiarEstado(item.id, 'aceptada')}
                    disabled={actualizandoId === item.id}
                    className="flex-1 bg-successTint rounded-lg py-2 items-center flex-row justify-center gap-1.5"
                  >
                    {actualizandoId === item.id ? (
                      <ActivityIndicator size="small" color={colors.success} />
                    ) : (
                      <>
                        <Feather name="check" size={15} color={colors.success} />
                        <Text className="text-success text-xs font-sansBold">Aceptar</Text>
                      </>
                    )}
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      setError(null);
                      setMotivoTexto('');
                      setRechazandoId(item.id);
                    }}
                    disabled={actualizandoId === item.id}
                    className="flex-1 bg-errorTint rounded-lg py-2 items-center flex-row justify-center gap-1.5"
                  >
                    {actualizandoId === item.id ? (
                      <ActivityIndicator size="small" color={colors.error} />
                    ) : (
                      <>
                        <Feather name="x" size={15} color={colors.error} />
                        <Text className="text-error text-xs font-sansBold">Rechazar</Text>
                      </>
                    )}
                  </Pressable>
                </View>
              )}

              {pendienteDeDecision && rechazandoId === item.id && (
                <View className="mt-3">
                  <Text className="text-ink text-xs font-sansSemiBold mb-1.5">
                    Motivo del rechazo (se le envía a la empresa)
                  </Text>
                  <View className="flex-row flex-wrap mb-2" style={{ gap: 6 }}>
                    {[
                      'Oferta económica demasiado alta',
                      'Sin disponibilidad para las fechas',
                      'Documentación incompleta',
                      'Perfil no adecuado para la obra',
                    ].map((sugerencia) => (
                      <Pressable
                        key={sugerencia}
                        onPress={() => setMotivoTexto(sugerencia)}
                        className="bg-canvas border border-border rounded-full px-2.5 py-1"
                      >
                        <Text className="text-inkMuted text-[13px] font-sansSemiBold">{sugerencia}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <TextInput
                    value={motivoTexto}
                    onChangeText={setMotivoTexto}
                    placeholder="Escribe el motivo…"
                    placeholderTextColor={colors.inkSubtle}
                    multiline
                    editable={actualizandoId !== item.id}
                    className="bg-surface border border-border rounded-xl px-3 py-2.5 text-ink text-sm"
                    style={{ minHeight: 64, textAlignVertical: 'top' }}
                  />
                  <View className="flex-row gap-2 mt-2">
                    <Pressable
                      onPress={() => {
                        setRechazandoId(null);
                        setMotivoTexto('');
                      }}
                      disabled={actualizandoId === item.id}
                      className="flex-1 bg-canvas border border-border rounded-lg py-2 items-center"
                    >
                      <Text className="text-inkMuted text-xs font-sansBold">Cancelar</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => handleConfirmarRechazo(item.id)}
                      disabled={actualizandoId === item.id}
                      className="flex-1 bg-errorTint rounded-lg py-2 items-center"
                    >
                      {actualizandoId === item.id ? (
                        <ActivityIndicator size="small" color={colors.error} />
                      ) : (
                        <Text className="text-error text-xs font-sansBold">Confirmar rechazo</Text>
                      )}
                    </Pressable>
                  </View>
                </View>
              )}
            </View>
          );
        }}
      />
    </View>
  );
}