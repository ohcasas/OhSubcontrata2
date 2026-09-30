import { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, ActivityIndicator, Pressable, ScrollView, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { subirImagenPublica } from '../../services/storage';
import { colors } from '../../design-system/tokens';
import type { RootStackParamList } from '../../navigation/types';
import ObraImagePlaceholder from '../../components/ObraImagePlaceholder';
import { OBRAS_PARA_DESBLOQUEAR_CLUB } from '../../constants/niveles';
import { formatearFechaHora, msHastaCierre, textoCuentaAtrasLarga } from '../../utils/plazos';

type EstadoObra = 'abierta' | 'cerrada' | 'adjudicada' | 'en_curso' | 'cancelada';

type Avance = {
  id: string;
  descripcion: string;
  porcentaje_avance: number | null;
  created_at: string;
};

type Obra = {
  id: string;
  referencia: string;
  titulo: string;
  ubicacion: string | null;
  presupuesto: number;
  moneda: string;
  estado: EstadoObra;
  imagen_url: string | null;
  puntos_bonus: number | null;
  plazo_cierre: string | null;
};

const ESTILO_ESTADO: Record<EstadoObra, { badge: string; texto: string; etiqueta: string }> = {
  abierta: { badge: 'bg-successTint', texto: 'text-success', etiqueta: 'Abierta' },
  cerrada: { badge: 'bg-successTint', texto: 'text-success', etiqueta: 'Finalizada' },
  adjudicada: { badge: 'bg-actionTint', texto: 'text-action', etiqueta: 'Adjudicada' },
  en_curso: { badge: 'bg-warningTint', texto: 'text-warning', etiqueta: 'En curso' },
  cancelada: { badge: 'bg-errorTint', texto: 'text-error', etiqueta: 'Cancelada' },
};

// Estados que el admin puede elegir a mano. Los tres del medio exigen una
// postulación aceptada (lo valida también la base de datos).
const OPCIONES_ESTADO: { estado: EstadoObra; etiqueta: string; requiereAdjudicataria: boolean }[] = [
  { estado: 'abierta', etiqueta: 'Abierta', requiereAdjudicataria: false },
  { estado: 'adjudicada', etiqueta: 'Adjudicada', requiereAdjudicataria: true },
  { estado: 'en_curso', etiqueta: 'En curso', requiereAdjudicataria: true },
  { estado: 'cerrada', etiqueta: 'Finalizada', requiereAdjudicataria: true },
  { estado: 'cancelada', etiqueta: 'Cancelada', requiereAdjudicataria: false },
];

function formatearMoneda(valor: number, moneda: string): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: moneda }).format(valor);
}

/**
 * Detalle de una obra concreta para el admin, con las mismas acciones de
 * ciclo de vida que ya existían en la lista de `AdminObrasScreen` (iniciar,
 * finalizar, cancelar, reabrir, cambiar foto) pero centradas en una sola
 * obra. Se llega aquí, sobre todo, desde una postulación ya aceptada en
 * `AdminPostulacionesScreen` — para no tener que ir a buscar la obra a
 * mano en la pestaña de Obras.
 */
export default function AdminObraDetalleScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'AdminObraDetalle'>>();
  const { obraId } = route.params;

  const [obra, setObra] = useState<Obra | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actualizando, setActualizando] = useState(false);
  const [puntosTexto, setPuntosTexto] = useState('');
  const [avisoCondiciones, setAvisoCondiciones] = useState<string | null>(null);
  const [empresaAdjudicataria, setEmpresaAdjudicataria] = useState<string | null>(null);
  const [avances, setAvances] = useState<Avance[]>([]);
  const [obrasCompletadasEmpresa, setObrasCompletadasEmpresa] = useState(0);

  const cargarObra = useCallback(async () => {
    setError(null);
    const { data, error: errorConsulta } = await supabase
      .from('obras')
      .select('id, referencia, titulo, ubicacion, presupuesto, moneda, estado, imagen_url, puntos_bonus, plazo_cierre')
      .eq('id', obraId)
      .single();

    if (errorConsulta || !data) {
      setError('No se ha podido cargar esta obra.');
      return;
    }
    setObra(data as Obra);
    setPuntosTexto(String((data as Obra).puntos_bonus ?? 0));

    // Empresa con la postulación aceptada (si la hay): de ella depende que se
    // pueda adjudicar, iniciar o finalizar la obra.
    const { data: aceptadas } = await supabase
      .from('postulaciones')
      .select('empresas_subcontratistas(nombre, obras_completadas)')
      .eq('obra_id', obraId)
      .eq('estado', 'aceptada')
      .limit(1);
    const fila = (aceptadas as unknown as {
      empresas_subcontratistas: { nombre: string; obras_completadas: number } | null;
    }[] | null)?.[0];
    setObrasCompletadasEmpresa(fila?.empresas_subcontratistas?.obras_completadas ?? 0);
    setEmpresaAdjudicataria(fila ? (fila.empresas_subcontratistas?.nombre ?? 'Empresa sin nombre') : null);

    const { data: avancesData } = await supabase
      .from('avances_obra')
      .select('id, descripcion, porcentaje_avance, created_at')
      .eq('obra_id', obraId)
      .order('created_at', { ascending: false });
    setAvances((avancesData as Avance[] | null) ?? []);
  }, [obraId]);

  useEffect(() => {
    setCargando(true);
    cargarObra().finally(() => setCargando(false));
  }, [cargarObra]);

  const handleCambiarFoto = async () => {
    const permiso = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permiso.granted) {
      setError(
        permiso.canAskAgain
          ? 'Necesitamos permiso para acceder a tus fotos.'
          : 'El permiso de fotos está bloqueado. Actívalo desde los ajustes del sistema para esta app.',
      );
      return;
    }
    const resultado = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (resultado.canceled) return;
    const asset = resultado.assets[0];

    setActualizando(true);
    try {
      const url = await subirImagenPublica('obras-fotos', 'obras', asset.uri, asset.mimeType ?? 'image/jpeg');
      const { error: errorUpdate } = await supabase.from('obras').update({ imagen_url: url }).eq('id', obraId);
      if (errorUpdate) throw errorUpdate;
      setObra((prev) => (prev !== null ? { ...prev, imagen_url: url } : prev));
    } catch {
      setError('No se ha podido actualizar la foto de la obra.');
    } finally {
      setActualizando(false);
    }
  };

  // Todos los cambios de estado pasan por una única función de la base de
  // datos (cambiar_estado_obra), que valida las reglas y acredita o revierte
  // los puntos de forma coherente. Se recarga después porque el cambio puede
  // afectar también a la postulación (p.ej. al reabrir la obra).
  const aplicarEstado = async (nuevo: EstadoObra) => {
    setError(null);
    setAvisoCondiciones(null);
    setActualizando(true);
    const { error: errorRpc } = await supabase.rpc('cambiar_estado_obra', {
      p_obra_id: obraId,
      p_nuevo_estado: nuevo,
    });
    if (errorRpc) {
      setActualizando(false);
      setError(errorRpc.message);
      return;
    }
    await cargarObra();
    setActualizando(false);
  };

  const pedirCambioEstado = (nuevo: EstadoObra) => {
    if (obra === null || nuevo === obra.estado) return;
    const etiqueta = OPCIONES_ESTADO.find((o) => o.estado === nuevo)?.etiqueta ?? nuevo;
    const puntos = obra.puntos_bonus ?? 0;
    const empresa = empresaAdjudicataria ?? 'la empresa adjudicataria';

    let aviso: string | null = null;
    if (nuevo === 'cerrada') {
      const numeroObra = obrasCompletadasEmpresa + 1;
      if (numeroObra < OBRAS_PARA_DESBLOQUEAR_CLUB) {
        aviso = `Será la obra nº ${numeroObra} de ${empresa}. Los puntos se empiezan a acreditar a partir de la ${OBRAS_PARA_DESBLOQUEAR_CLUB}ª obra, así que esta no suma puntos (sí cuenta como obra completada).`;
      } else if (puntos > 0) {
        aviso = `Se acreditarán ${puntos} pts a ${empresa} y se sumará una obra completada.`;
      } else {
        aviso = `Se sumará una obra completada a ${empresa} (esta obra no tiene puntos asignados).`;
      }
    } else if (obra.estado === 'cerrada') {
      aviso = 'La obra deja de estar finalizada: se revertirán los puntos que se acreditaron por ella.';
    } else if (nuevo === 'abierta' && empresaAdjudicataria !== null) {
      aviso = `La postulación de ${empresaAdjudicataria} volverá a estar pendiente y la obra se reabrirá a concurso.`;
    } else if (nuevo === 'cancelada') {
      aviso = 'La obra quedará cancelada.';
    }

    if (aviso === null) {
      void aplicarEstado(nuevo);
      return;
    }
    Alert.alert(`Cambiar a "${etiqueta}"`, aviso, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Confirmar', onPress: () => void aplicarEstado(nuevo) },
    ]);
  };

  const handleEliminar = () => {
    Alert.alert(
      'Eliminar obra',
      'Se eliminará la obra y todas sus postulaciones. Los puntos ya acreditados a las empresas se mantienen. Esta acción no se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            setError(null);
            setActualizando(true);
            const { data, error: errorDelete } = await supabase
              .from('obras')
              .delete()
              .eq('id', obraId)
              .select('id');
            setActualizando(false);
            if (errorDelete) {
              setError(`No se ha podido eliminar la obra: ${errorDelete.message}`);
              return;
            }
            if (!data || data.length === 0) {
              setError('No se ha eliminado nada: tu usuario no tiene permiso para borrar esta obra.');
              return;
            }
            navigation.goBack();
          },
        },
      ],
    );
  };

  const guardarCondicion = async (cambios: { plazo_cierre: string | null } | { puntos_bonus: number }) => {
    setError(null);
    setAvisoCondiciones(null);
    setActualizando(true);
    const { error: errorUpdate } = await supabase.from('obras').update(cambios).eq('id', obraId);
    setActualizando(false);
    if (errorUpdate) {
      setError(`No se ha podido guardar: ${errorUpdate.message}`);
      return;
    }
    setObra((prev) => (prev !== null ? { ...prev, ...cambios } : prev));
    setAvisoCondiciones('Guardado.');
  };

  const handleFijarPlazo = (horas: number | null) =>
    guardarCondicion({
      plazo_cierre: horas === null ? null : new Date(Date.now() + horas * 3600000).toISOString(),
    });

  const handleGuardarPuntos = () => {
    const n = Number(puntosTexto.replace(',', '.'));
    if (puntosTexto.trim() === '' || Number.isNaN(n) || n < 0) {
      setError('Introduce un número de puntos válido (0 o más).');
      return;
    }
    return guardarCondicion({ puntos_bonus: Math.round(n) });
  };

  if (cargando) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <ActivityIndicator color={colors.action} />
      </View>
    );
  }

  if (obra === null) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas px-6">
        <Feather name="alert-circle" size={28} color={colors.error} />
        <Text className="text-ink text-sm text-center mt-3">
          {error ?? 'No se ha podido cargar esta obra.'}
        </Text>
      </View>
    );
  }

  const estilo = ESTILO_ESTADO[obra.estado];

  return (
    <ScrollView className="flex-1 bg-canvas" contentContainerStyle={{ paddingBottom: 32 }}>
      {error !== null && (
        <View className="bg-errorTint mx-4 mt-3 rounded-lg px-3 py-2 flex-row items-center gap-2">
          <Feather name="alert-circle" size={17} color={colors.error} />
          <Text className="text-error text-sm flex-1">{error}</Text>
        </View>
      )}

      <View className="relative m-4 mb-0">
        <ObraImagePlaceholder imageUrl={obra.imagen_url} icon="home" height={200} rounded="all" />
        <Pressable
          onPress={handleCambiarFoto}
          disabled={actualizando}
          className="absolute bottom-2 right-2 bg-ink/70 rounded-full p-2.5"
        >
          <Feather name="camera" size={15} color={colors.white} />
        </Pressable>
        <View className={`absolute top-2 right-2 rounded-md px-2 py-0.5 ${estilo.badge}`}>
          <Text className={`text-[12px] font-sansBold ${estilo.texto}`}>{estilo.etiqueta}</Text>
        </View>
      </View>

      <View className="p-4">
        <Text className="text-inkMuted text-xs font-mono">{obra.referencia}</Text>
        <Text className="text-ink text-lg font-sansBold mt-0.5">{obra.titulo}</Text>
        {obra.ubicacion !== null && (
          <View className="flex-row items-center gap-1 mt-1">
            <Feather name="map-pin" size={14} color={colors.inkMuted} />
            <Text className="text-inkMuted text-sm">{obra.ubicacion}</Text>
          </View>
        )}
        <Text className="text-ink text-xl font-sansBold mt-2">
          {formatearMoneda(obra.presupuesto, obra.moneda)}
        </Text>

        <View className="bg-surface border border-border rounded-xl p-3.5 mt-3.5">
          <Text className="text-ink text-xs font-sansBold uppercase" style={{ letterSpacing: 1 }}>
            Estado de la obra
          </Text>
          <Text className="text-inkMuted text-xs mt-1">
            {empresaAdjudicataria !== null
              ? `Adjudicataria: ${empresaAdjudicataria}`
              : 'Ninguna postulación aceptada todavía.'}
          </Text>
          <View className="flex-row flex-wrap mt-3" style={{ gap: 8 }}>
            {OPCIONES_ESTADO.map((op) => {
              const activo = obra.estado === op.estado;
              const bloqueado = op.requiereAdjudicataria && empresaAdjudicataria === null;
              return (
                <Pressable
                  key={op.estado}
                  onPress={() => pedirCambioEstado(op.estado)}
                  disabled={actualizando || bloqueado}
                  className={`rounded-full px-3.5 py-2 border ${
                    activo ? 'bg-action border-action' : 'bg-surface border-border'
                  }`}
                  style={{ opacity: bloqueado ? 0.35 : 1 }}
                >
                  <Text className={`text-xs font-sansBold ${activo ? 'text-white' : 'text-ink'}`}>
                    {op.etiqueta}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {empresaAdjudicataria === null && (
            <Text className="text-inkMuted text-[13px] mt-2">
              Para adjudicar, iniciar o finalizar la obra, acepta antes una postulación en la pestaña Postulaciones.
            </Text>
          )}
          {actualizando && <ActivityIndicator size="small" color={colors.action} style={{ marginTop: 10 }} />}
        </View>

        {(obra.estado === 'abierta' || obra.estado === 'adjudicada' || obra.estado === 'en_curso') && (
          <View className="bg-surface border border-border rounded-xl p-3.5 mt-3.5">
            <Text className="text-ink text-xs font-sansBold uppercase mb-3" style={{ letterSpacing: 1 }}>
              Condiciones
            </Text>

            {obra.estado === 'abierta' && (
              <View className="mb-4">
                <Text className="text-ink text-xs font-sansSemiBold">Plazo para postular</Text>
                <Text className="text-inkMuted text-xs mt-0.5">
                  {(() => {
                    const ms = msHastaCierre(obra.plazo_cierre, Date.now());
                    if (ms === null || obra.plazo_cierre === null) return 'Sin plazo de cierre.';
                    return `Cierra el ${formatearFechaHora(obra.plazo_cierre)} (${
                      ms > 0 ? `en ${textoCuentaAtrasLarga(ms)}` : 'plazo vencido'
                    }).`;
                  })()}
                </Text>
                <View className="flex-row flex-wrap mt-2" style={{ gap: 8 }}>
                  {[
                    { etiqueta: '24 h', horas: 24 },
                    { etiqueta: '48 h', horas: 48 },
                    { etiqueta: '7 días', horas: 168 },
                  ].map((op) => (
                    <Pressable
                      key={op.etiqueta}
                      onPress={() => handleFijarPlazo(op.horas)}
                      disabled={actualizando}
                      className="bg-actionTint rounded-full px-3 py-1.5"
                    >
                      <Text className="text-action text-xs font-sansBold">{op.etiqueta}</Text>
                    </Pressable>
                  ))}
                  <Pressable
                    onPress={() => handleFijarPlazo(null)}
                    disabled={actualizando}
                    className="bg-canvas border border-border rounded-full px-3 py-1.5"
                  >
                    <Text className="text-inkMuted text-xs font-sansBold">Quitar plazo</Text>
                  </Pressable>
                </View>
                <Text className="text-inkMuted text-[13px] mt-1.5">
                  Los botones cuentan desde ahora. Con 48 h o menos, la licitación sale como prioritaria.
                </Text>
              </View>
            )}

            <Text className="text-ink text-xs font-sansSemiBold">Puntos Club OH al finalizar</Text>
            <View className="flex-row items-center mt-1.5" style={{ gap: 8 }}>
              <TextInput
                value={puntosTexto}
                onChangeText={setPuntosTexto}
                keyboardType="number-pad"
                editable={!actualizando}
                className="flex-1 bg-surface border border-border rounded-xl px-3 py-2.5 text-ink"
              />
              <Pressable
                onPress={handleGuardarPuntos}
                disabled={actualizando}
                className="bg-action rounded-xl px-4 py-2.5"
              >
                <Text className="text-white text-xs font-sansBold">Guardar</Text>
              </Pressable>
            </View>

            {avisoCondiciones !== null && (
              <Text className="text-success text-xs font-sansSemiBold mt-2">{avisoCondiciones}</Text>
            )}
          </View>
        )}

        {avances.length > 0 && (
          <View className="bg-surface border border-border rounded-xl p-3.5 mt-3.5">
            <Text className="text-ink text-xs font-sansBold uppercase mb-3" style={{ letterSpacing: 1 }}>
              Progreso registrado por la empresa
            </Text>
            <View className="gap-2">
              {avances.map((avance) => (
                <View key={avance.id} className="bg-canvas border border-border rounded-lg p-3">
                  <View className="flex-row justify-between items-start" style={{ gap: 8 }}>
                    <Text className="text-ink text-sm flex-1">{avance.descripcion}</Text>
                    {avance.porcentaje_avance !== null && (
                      <View className="bg-actionTint rounded-md px-2 py-0.5">
                        <Text className="text-action text-xs font-sansBold">
                          {avance.porcentaje_avance}%
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text className="text-inkMuted text-[13px] mt-1">
                    {new Date(avance.created_at).toLocaleDateString('es-ES', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <Pressable
          onPress={handleEliminar}
          disabled={actualizando}
          className="flex-row items-center justify-center gap-1.5 rounded-xl py-3 mt-6"
          style={{ borderWidth: 1, borderColor: colors.error }}
        >
          <Feather name="trash-2" size={15} color={colors.error} />
          <Text className="text-error text-sm font-sansBold">Eliminar obra</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}