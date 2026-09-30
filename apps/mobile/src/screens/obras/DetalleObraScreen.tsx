import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Linking,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { subirArchivoPrivado, obtenerUrlFirmada } from '../../services/storage';
import { colors } from '../../design-system/tokens';
import type { RootStackParamList } from '../../navigation/types';
import ObraImagePlaceholder from '../../components/ObraImagePlaceholder';
import { esPrioritaria, textoDuracion } from '../../utils/plazos';

type Obra = {
  id: string;
  referencia: string;
  titulo: string;
  descripcion: string | null;
  especialidad_requerida: string | null;
  ubicacion: string | null;
  modulos: number | null;
  m2: number | null;
  presupuesto: number;
  moneda: string;
  puntos_bonus: number | null;
  imagen_url: string | null;
  fecha_inicio: string | null;
  duracion_dias: number | null;
  requisitos: string | null;
  estado: 'abierta' | 'cerrada' | 'adjudicada' | 'en_curso' | 'cancelada';
  plazo_cierre: string | null;
};

const ETIQUETA_ESTADO_OBRA: Record<Obra['estado'], string> = {
  abierta: 'Licitación abierta',
  adjudicada: 'Adjudicada',
  en_curso: 'Obra en curso',
  cerrada: 'Finalizada',
  cancelada: 'Cancelada',
};

const ESTILO_ESTADO_POSTULACION: Record<Postulacion['estado'], { fondo: string; texto: string }> = {
  enviada: { fondo: colors.actionTint, texto: colors.action },
  en_revision: { fondo: colors.warningTint, texto: colors.warning },
  aceptada: { fondo: colors.successTint, texto: colors.success },
  rechazada: { fondo: colors.errorTint, texto: colors.error },
};

type Postulacion = {
  id: string;
  oferta_economica: number;
  motivo_rechazo: string | null;
  estado: 'enviada' | 'en_revision' | 'aceptada' | 'rechazada';
};

type Avance = {
  id: string;
  descripcion: string;
  porcentaje_avance: number | null;
  created_at: string;
};

type ArchivoAdjunto = {
  id: string;
  nombre_archivo: string;
  storage_path: string;
};

function formatearMoneda(valor: number, moneda: string): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: moneda }).format(valor);
}

function formatearFecha(fechaIso: string | null): string | null {
  if (fechaIso === null) return null;
  return new Date(fechaIso).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });
}

const ETIQUETA_ESTADO: Record<Postulacion['estado'], string> = {
  enviada: 'Enviada — pendiente de revisión',
  en_revision: 'En revisión por OH Contratas',
  aceptada: 'Aceptada',
  rechazada: 'No seleccionada esta vez',
};

export default function DetalleObraScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'DetalleObra'>>();
  const route = useRoute<RouteProp<RootStackParamList, 'DetalleObra'>>();
  const { obraId } = route.params;

  const [obra, setObra] = useState<Obra | null>(null);
  const [postulacionExistente, setPostulacionExistente] = useState<Postulacion | null>(null);
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [guardada, setGuardada] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  const [ofertaEconomica, setOfertaEconomica] = useState('');
  const [telefonoContactoPrefijo, setTelefonoContactoPrefijo] = useState('+34');
  const [telefonoContacto, setTelefonoContacto] = useState('');
  const [disponibilidad, setDisponibilidad] = useState('');
  const [motivacion, setMotivacion] = useState('');
  const [errorOferta, setErrorOferta] = useState<string | null>(null);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [archivoSeleccionado, setArchivoSeleccionado] = useState<{
    uri: string;
    nombre: string;
    mimeType: string;
  } | null>(null);
  const [archivosAdjuntos, setArchivosAdjuntos] = useState<ArchivoAdjunto[]>([]);
  const [abriendoArchivoId, setAbriendoArchivoId] = useState<string | null>(null);

  const [avances, setAvances] = useState<Avance[]>([]);
  const [descripcionAvance, setDescripcionAvance] = useState('');
  const [porcentajeAvance, setPorcentajeAvance] = useState('');
  const [enviandoAvance, setEnviandoAvance] = useState(false);
  const [errorAvance, setErrorAvance] = useState<string | null>(null);

  const cargarDatos = useCallback(async () => {
    setErrorCarga(null);

    const { data: obraData, error: errorObra } = await supabase
      .from('obras')
      .select(
        'id, referencia, titulo, descripcion, especialidad_requerida, ubicacion, modulos, m2, presupuesto, moneda, puntos_bonus, imagen_url, fecha_inicio, duracion_dias, requisitos, estado, plazo_cierre',
      )
      .eq('id', obraId)
      .single();

    if (errorObra || !obraData) {
      setErrorCarga('No se ha podido cargar esta obra. Puede que ya no esté disponible.');
      return;
    }
    setObra(obraData as Obra);
    navigation.setOptions({ title: (obraData as Obra).titulo });

    const { data: userData } = await supabase.auth.getUser();
    const usuarioId = userData.user?.id;
    if (!usuarioId) return;

    const { data: perfilData } = await supabase
      .from('profiles')
      .select('empresa_id')
      .eq('id', usuarioId)
      .single();
    const idEmpresa = (perfilData?.empresa_id as string | null) ?? null;
    setEmpresaId(idEmpresa);

    if (idEmpresa) {
      const { data: guardadaData } = await supabase
        .from('obras_guardadas')
        .select('obra_id')
        .eq('obra_id', obraId)
        .eq('empresa_id', idEmpresa)
        .maybeSingle();
      setGuardada(guardadaData !== null);

      const { data: postData } = await supabase
        .from('postulaciones')
        .select('id, oferta_economica, estado, motivo_rechazo')
        .eq('obra_id', obraId)
        .eq('empresa_id', idEmpresa)
        .maybeSingle();
      if (postData) {
        setPostulacionExistente(postData as Postulacion);
        const { data: archivosData } = await supabase
          .from('postulacion_archivos')
          .select('id, nombre_archivo, storage_path')
          .eq('postulacion_id', (postData as Postulacion).id);
        setArchivosAdjuntos((archivosData as ArchivoAdjunto[] | null) ?? []);

        // El progreso solo tiene sentido si esta empresa es la adjudicataria
        // y la obra ya está en curso — en cualquier otro caso ni se pide.
        if ((postData as Postulacion).estado === 'aceptada' && (obraData as Obra).estado === 'en_curso') {
          const { data: avancesData } = await supabase
            .from('avances_obra')
            .select('id, descripcion, porcentaje_avance, created_at')
            .eq('obra_id', obraId)
            .order('created_at', { ascending: false });
          setAvances((avancesData as Avance[] | null) ?? []);
        }
      }
    }
  }, [obraId, navigation]);

  useEffect(() => {
    setCargando(true);
    cargarDatos().finally(() => setCargando(false));
  }, [cargarDatos]);

  const validarOferta = (): boolean => {
    const valor = Number(ofertaEconomica.replace(',', '.'));
    if (ofertaEconomica.trim() === '' || Number.isNaN(valor) || valor <= 0) {
      setErrorOferta('Introduce un importe válido.');
      return false;
    }
    setErrorOferta(null);
    return true;
  };

  const handleElegirArchivo = async () => {
    const resultado = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/*', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
      copyToCacheDirectory: true,
    });
    if (resultado.canceled) return;
    const asset = resultado.assets[0];
    setArchivoSeleccionado({
      uri: asset.uri,
      nombre: asset.name,
      mimeType: asset.mimeType ?? 'application/octet-stream',
    });
  };

  const handleAbrirArchivo = async (archivo: ArchivoAdjunto) => {
    setAbriendoArchivoId(archivo.id);
    try {
      const url = await obtenerUrlFirmada('postulacion-archivos', archivo.storage_path);
      await Linking.openURL(url);
    } catch {
      setErrorEnvio('No se ha podido abrir el archivo.');
    } finally {
      setAbriendoArchivoId(null);
    }
  };

  const toggleGuardada = async () => {
    if (!empresaId) return;
    const ya = guardada;
    setGuardada(!ya);
    const { error: errorGuardar } = ya
      ? await supabase.from('obras_guardadas').delete().eq('empresa_id', empresaId).eq('obra_id', obraId)
      : await supabase.from('obras_guardadas').insert({ empresa_id: empresaId, obra_id: obraId });
    if (errorGuardar) setGuardada(ya);
  };

  const handleRegistrarAvance = async () => {
    setErrorAvance(null);
    if (descripcionAvance.trim().length < 3) {
      setErrorAvance('Describe brevemente lo que se ha hecho.');
      return;
    }
    const porcentajeNum = porcentajeAvance.trim() === '' ? null : Number(porcentajeAvance.replace(',', '.'));
    if (porcentajeNum !== null && (Number.isNaN(porcentajeNum) || porcentajeNum < 0 || porcentajeNum > 100)) {
      setErrorAvance('El porcentaje debe ser un número entre 0 y 100 (o dejarse vacío).');
      return;
    }

    setEnviandoAvance(true);
    const { data, error: errorRpc } = await supabase.rpc('registrar_avance_obra', {
      p_obra_id: obraId,
      p_descripcion: descripcionAvance.trim(),
      p_porcentaje_avance: porcentajeNum !== null ? Math.round(porcentajeNum) : null,
    });
    setEnviandoAvance(false);

    if (errorRpc || !data) {
      setErrorAvance(errorRpc?.message ?? 'No se ha podido registrar el avance.');
      return;
    }
    setAvances((prev) => [data as Avance, ...prev]);
    setDescripcionAvance('');
    setPorcentajeAvance('');
  };

  const handleEnviarPostulacion = async () => {
    setErrorEnvio(null);
    if (!validarOferta()) return;

    if (!empresaId) {
      setErrorEnvio(
        'Tu usuario todavía no está vinculado a ninguna empresa subcontratista, así que no puedes postular. Contacta con OH Contratas para que lo configuren.',
      );
      return;
    }

    setEnviando(true);
    const { data, error } = await supabase
      .from('postulaciones')
      .insert({
        obra_id: obraId,
        empresa_id: empresaId,
        oferta_economica: Number(ofertaEconomica.replace(',', '.')),
        telefono_contacto:
          telefonoContacto.trim() !== '' ? `${telefonoContactoPrefijo} ${telefonoContacto.trim()}` : null,
        disponibilidad_equipo: disponibilidad.trim() || null,
        motivacion: motivacion.trim() || null,
      })
      .select('id, oferta_economica, estado')
      .single();

    if (error || !data) {
      setEnviando(false);
      setErrorEnvio('No se ha podido enviar la postulación. Inténtalo de nuevo.');
      return;
    }

    const nuevaPostulacion = data as Postulacion;

    if (archivoSeleccionado !== null) {
      try {
        const storagePath = await subirArchivoPrivado(
          'postulacion-archivos',
          empresaId,
          archivoSeleccionado.uri,
          archivoSeleccionado.mimeType,
          archivoSeleccionado.nombre,
        );
        await supabase.from('postulacion_archivos').insert({
          postulacion_id: nuevaPostulacion.id,
          nombre_archivo: archivoSeleccionado.nombre,
          storage_path: storagePath,
          tipo_mime: archivoSeleccionado.mimeType,
        });
      } catch {
        // La postulación ya se envió correctamente; el adjunto es un
        // extra — si falla, no se bloquea el envío, solo se avisa.
        setErrorEnvio('La postulación se envió, pero el archivo adjunto no se pudo subir.');
      }
    }

    setEnviando(false);
    setPostulacionExistente(nuevaPostulacion);
  };

  if (cargando) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <ActivityIndicator color={colors.action} />
      </View>
    );
  }

  if (errorCarga !== null || obra === null) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas px-6">
        <Feather name="alert-triangle" size={28} color={colors.inkSubtle} />
        <Text className="text-ink text-base font-sansSemiBold text-center mt-3">
          {errorCarga ?? 'Obra no encontrada.'}
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1 }}
    >
      <ScrollView className="flex-1 bg-canvas" contentContainerStyle={{ paddingBottom: 16 }}>
        <View className="px-4 pt-4">
          {/* Estado de la licitación + referencia */}
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-1.5 bg-navySurface rounded-full px-3 py-1.5">
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.action }} />
              <Text className="text-white text-[12px] font-sansSemiBold uppercase" style={{ letterSpacing: 1 }}>
                {ETIQUETA_ESTADO_OBRA[obra.estado]}
                {obra.estado === 'abierta' && esPrioritaria(obra.plazo_cierre, Date.now()) ? ' • Urgente' : ''}
              </Text>
            </View>
            <View className="flex-row items-center" style={{ gap: 10 }}>
              <View className="bg-surface border border-border rounded-lg px-2.5 py-1">
                <Text className="text-inkMuted text-[12px] font-mono">REF: {obra.referencia}</Text>
              </View>
              {postulacionExistente === null && obra.estado === 'abierta' && empresaId !== null && (
                <Pressable onPress={toggleGuardada} hitSlop={8} accessibilityLabel="Guardar oferta">
                  <Ionicons
                    name={guardada ? 'bookmark' : 'bookmark-outline'}
                    size={22}
                    color={guardada ? colors.action : colors.inkMuted}
                  />
                </Pressable>
              )}
            </View>
          </View>

          <Text className="text-ink text-2xl font-sansBold mt-3">{obra.titulo}</Text>
          {obra.ubicacion !== null && (
            <View className="flex-row items-center gap-1.5 mt-1.5">
              <Feather name="map-pin" size={15} color={colors.action} />
              <Text className="text-inkMuted text-sm">{obra.ubicacion}</Text>
            </View>
          )}

          {/* Imagen con etiquetas encima */}
          <View className="rounded-2xl overflow-hidden mt-4">
            <ObraImagePlaceholder imageUrl={obra.imagen_url} height={220} icon="home" rounded="all" />
            {obra.especialidad_requerida !== null && (
              <View
                className="absolute flex-row items-center gap-1 bg-navySurface/85 rounded-lg px-2.5 py-1.5"
                style={{ top: 12, left: 12, maxWidth: '68%' }}
              >
                <Feather name="zap" size={13} color={colors.action} />
                <Text className="text-white text-[12px] font-sansSemiBold uppercase flex-shrink" numberOfLines={1}>
                  {obra.especialidad_requerida}
                </Text>
              </View>
            )}
            {obra.duracion_dias !== null && (
              <View
                className="absolute flex-row items-center gap-1 bg-navySurface/85 rounded-lg px-2.5 py-1.5"
                style={{ top: 12, right: 12 }}
              >
                <Feather name="clock" size={13} color={colors.action} />
                <Text className="text-white text-[12px] font-sansSemiBold">
                  {textoDuracion(obra.duracion_dias)}
                </Text>
              </View>
            )}
          </View>

          {/* Presupuesto: fila de texto plano bajo la imagen, no un panel de color */}
          <View className="bg-surface border border-border rounded-2xl p-4 mt-3 flex-row justify-between items-end">
            <View className="flex-1 pr-2">
              <Text className="text-inkMuted text-[12px] uppercase font-sansSemiBold" style={{ letterSpacing: 0.5 }}>
                Presupuesto licitado
              </Text>
              <Text className="text-ink text-3xl font-sansBold mt-0.5">
                {formatearMoneda(obra.presupuesto, obra.moneda)}
              </Text>
            </View>
            {obra.puntos_bonus !== null && obra.puntos_bonus > 0 && (
              <View className="bg-actionTint rounded-lg px-2.5 py-1.5 flex-row items-center gap-1">
                <Feather name="award" size={14} color={colors.action} />
                <Text className="text-action text-xs font-sansBold">+{obra.puntos_bonus} pts Club OH</Text>
              </View>
            )}
          </View>

          {/* Especificaciones */}
          <View className="bg-surface rounded-2xl border border-border p-4 mt-3">
            <Text className="text-ink text-xs font-sansBold uppercase mb-3" style={{ letterSpacing: 1 }}>
              Especificaciones
            </Text>
            <View className="flex-row items-center flex-wrap gap-x-4 gap-y-1.5">
              {obra.especialidad_requerida !== null && (
                <View className="flex-row items-center gap-1.5">
                  <Feather name="tool" size={14} color={colors.inkMuted} />
                  <Text className="text-ink text-xs font-sansMedium">{obra.especialidad_requerida}</Text>
                </View>
              )}
              {obra.modulos !== null && (
                <View className="flex-row items-center gap-1.5">
                  <Feather name="layers" size={14} color={colors.inkMuted} />
                  <Text className="text-ink text-xs font-sansMedium">{obra.modulos} módulos</Text>
                </View>
              )}
              {obra.m2 !== null && (
                <View className="flex-row items-center gap-1.5">
                  <Feather name="maximize" size={14} color={colors.inkMuted} />
                  <Text className="text-ink text-xs font-sansMedium">{obra.m2} m²</Text>
                </View>
              )}
            </View>
            <View className="flex-row justify-between items-center mt-3 pt-3 border-t border-border">
              <View className="flex-row items-center gap-1 flex-1 pr-2">
                <Feather name="calendar" size={13} color={colors.inkMuted} />
                <Text className="text-inkMuted text-xs">
                  {formatearFecha(obra.fecha_inicio) !== null
                    ? `Inicio: ${formatearFecha(obra.fecha_inicio)}`
                    : 'Fecha por confirmar'}
                  {obra.duracion_dias !== null ? ` (${obra.duracion_dias} días)` : ''}
                </Text>
              </View>
              {obra.requisitos !== null && (
                <View className="flex-row items-center gap-1">
                  <Feather name="shield" size={13} color={colors.inkMuted} />
                  <Text className="text-inkMuted text-xs">{obra.requisitos}</Text>
                </View>
              )}
            </View>
          </View>

          {obra.descripcion !== null && (
            <View className="bg-surface rounded-2xl border border-border p-4 mt-3">
              <Text className="text-ink text-xs font-sansBold uppercase mb-2" style={{ letterSpacing: 1 }}>
                Alcance de los trabajos
              </Text>
              <Text className="text-inkMuted text-sm leading-relaxed">{obra.descripcion}</Text>
            </View>
          )}

          {/* Postulación: ya enviada, o formulario */}
          {postulacionExistente !== null ? (
            <View className="bg-surface border border-border rounded-2xl p-4 mt-3">
              <View
                className="self-start flex-row items-center gap-1.5 rounded-full px-2.5 py-1 mb-2"
                style={{ backgroundColor: ESTILO_ESTADO_POSTULACION[postulacionExistente.estado].fondo }}
              >
                <Feather
                  name="check-circle"
                  size={15}
                  color={ESTILO_ESTADO_POSTULACION[postulacionExistente.estado].texto}
                />
                <Text
                  className="text-xs font-sansBold"
                  style={{ color: ESTILO_ESTADO_POSTULACION[postulacionExistente.estado].texto }}
                >
                  {ETIQUETA_ESTADO[postulacionExistente.estado]}
                </Text>
              </View>
              <Text className="text-ink text-sm font-sansSemiBold">Ya has postulado a esta obra</Text>
              <Text className="text-inkMuted text-xs mt-2">
                Tu oferta: {formatearMoneda(postulacionExistente.oferta_economica, obra.moneda)}
              </Text>
              {postulacionExistente.estado === 'rechazada' && postulacionExistente.motivo_rechazo !== null && (
                <Text className="text-inkMuted text-xs mt-1">
                  Motivo: {postulacionExistente.motivo_rechazo}
                </Text>
              )}
              {archivosAdjuntos.length > 0 && (
                <View className="mt-3 gap-1.5">
                  {archivosAdjuntos.map((archivo) => (
                    <Pressable
                      key={archivo.id}
                      onPress={() => handleAbrirArchivo(archivo)}
                      disabled={abriendoArchivoId === archivo.id}
                      className="flex-row items-center gap-2 bg-canvas rounded-lg px-3 py-2"
                    >
                      {abriendoArchivoId === archivo.id ? (
                        <ActivityIndicator size="small" color={colors.action} />
                      ) : (
                        <Feather name="paperclip" size={15} color={colors.action} />
                      )}
                      <Text className="text-ink text-xs font-sansMedium flex-1" numberOfLines={1}>
                        {archivo.nombre_archivo}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          ) : (
            <View className="bg-surface rounded-2xl border border-border p-4 mt-3">
              <Text className="text-ink text-sm font-sansBold mb-3">Formulario de postulación</Text>

              {errorEnvio !== null && (
                <View className="bg-errorTint rounded-lg px-3 py-2 mb-3 flex-row items-center gap-2">
                  <Feather name="alert-circle" size={17} color={colors.error} />
                  <Text className="text-error text-sm flex-1">{errorEnvio}</Text>
                </View>
              )}

              <Text className="text-ink text-xs font-sansSemiBold mb-1">Tu oferta económica (sin IVA) *</Text>
              <View className="flex-row items-center bg-surface border border-border rounded-xl px-3 mb-1">
                <Feather name="dollar-sign" size={15} color={colors.inkSubtle} />
                <TextInput
                  value={ofertaEconomica}
                  onChangeText={setOfertaEconomica}
                  keyboardType="decimal-pad"
                  placeholder="0,00 €"
                  placeholderTextColor={colors.inkSubtle}
                  editable={!enviando}
                  className="flex-1 py-3 pl-2 text-ink"
                />
              </View>
              {errorOferta !== null && <Text className="text-error text-xs mb-1">{errorOferta}</Text>}
              <Text className="text-inkMuted text-[13px] mb-3">
                Presupuesto máximo fijado por OH Contratas: {formatearMoneda(obra.presupuesto, obra.moneda)}
              </Text>

              <Text className="text-ink text-xs font-sansSemiBold mb-1">
                Teléfono de contacto para esta obra (opcional)
              </Text>
              <View className="flex-row gap-2 mb-3">
                <View className="w-20">
                  <View className="flex-row items-center bg-surface border border-border rounded-xl px-2">
                    <TextInput
                      value={telefonoContactoPrefijo}
                      onChangeText={setTelefonoContactoPrefijo}
                      keyboardType="phone-pad"
                      placeholder="+34"
                      placeholderTextColor={colors.inkSubtle}
                      editable={!enviando}
                      className="py-3 text-ink text-center"
                    />
                  </View>
                </View>
                <View className="flex-1">
                  <View className="flex-row items-center bg-surface border border-border rounded-xl px-3">
                    <Feather name="phone" size={15} color={colors.inkSubtle} />
                    <TextInput
                      value={telefonoContacto}
                      onChangeText={setTelefonoContacto}
                      keyboardType="phone-pad"
                      placeholder="Ej: 612 345 678"
                      placeholderTextColor={colors.inkSubtle}
                      editable={!enviando}
                      className="flex-1 py-3 pl-2 text-ink"
                    />
                  </View>
                </View>
              </View>

              <Text className="text-ink text-xs font-sansSemiBold mb-1">Disponibilidad del equipo</Text>
              <View className="flex-row items-center bg-surface border border-border rounded-xl px-3 mb-3">
                <Feather name="users" size={15} color={colors.inkSubtle} />
                <TextInput
                  value={disponibilidad}
                  onChangeText={setDisponibilidad}
                  placeholder="Ej: Disponible de lunes a viernes, turnos de mañana y tarde…"
                  placeholderTextColor={colors.inkSubtle}
                  editable={!enviando}
                  className="flex-1 py-3 pl-2 text-ink"
                />
              </View>

              <Text className="text-ink text-xs font-sansSemiBold mb-1">
                ¿Por qué tu equipo es el ideal para esta obra?
              </Text>
              <View className="flex-row bg-surface border border-border rounded-xl px-3 mb-1">
                <Feather name="message-square" size={15} color={colors.inkSubtle} style={{ marginTop: 12 }} />
                <TextInput
                  value={motivacion}
                  onChangeText={setMotivacion}
                  multiline
                  numberOfLines={4}
                  placeholder="Cuéntanos tu experiencia en proyectos similares..."
                  placeholderTextColor={colors.inkSubtle}
                  editable={!enviando}
                  className="flex-1 py-3 pl-2 text-ink"
                  style={{ minHeight: 90, textAlignVertical: 'top' }}
                />
              </View>

              <Text className="text-ink text-xs font-sansSemiBold mb-1">
                Presupuesto desglosado u otra documentación (opcional)
              </Text>
              {archivoSeleccionado !== null ? (
                <View className="flex-row items-center gap-2 bg-canvas rounded-xl px-3 py-2.5 mb-3">
                  <Feather name="paperclip" size={15} color={colors.action} />
                  <Text className="text-ink text-xs font-sansMedium flex-1" numberOfLines={1}>
                    {archivoSeleccionado.nombre}
                  </Text>
                  <Pressable onPress={() => setArchivoSeleccionado(null)} disabled={enviando}>
                    <Feather name="x" size={15} color={colors.inkMuted} />
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  onPress={handleElegirArchivo}
                  disabled={enviando}
                  className="flex-row items-center justify-center gap-2 border border-dashed border-border rounded-xl py-3 mb-3"
                >
                  <Feather name="paperclip" size={15} color={colors.inkMuted} />
                  <Text className="text-inkMuted text-xs font-sansMedium">
                    Adjuntar archivo (PDF, Excel o imagen)
                  </Text>
                </Pressable>
              )}

              <Pressable
                onPress={handleEnviarPostulacion}
                disabled={enviando}
                className="bg-action rounded-xl py-3 items-center"
              >
                <View className="flex-row items-center justify-center gap-2">
                  {enviando ? (
                    <ActivityIndicator color={colors.white} />
                  ) : (
                    <Feather name="send" size={16} color={colors.white} />
                  )}
                  <Text className="text-white font-sansBold text-sm">
                    {enviando ? 'Enviando…' : 'Enviar Propuesta de Subcontratación'}
                  </Text>
                </View>
              </Pressable>
            </View>
          )}

          {/* Progreso de la obra: solo si esta empresa es la adjudicataria y la
              obra está en curso. Admin ve el mismo historial de solo lectura
              en su propia pantalla de detalle. */}
          {postulacionExistente?.estado === 'aceptada' && obra.estado === 'en_curso' && (
            <View className="bg-surface rounded-2xl border border-border p-4 mt-3">
              <Text className="text-ink text-sm font-sansBold mb-3">Progreso de la obra</Text>

              {errorAvance !== null && (
                <View className="bg-errorTint rounded-lg px-3 py-2 mb-3 flex-row items-center gap-2">
                  <Feather name="alert-circle" size={17} color={colors.error} />
                  <Text className="text-error text-sm flex-1">{errorAvance}</Text>
                </View>
              )}

              <Text className="text-ink text-xs font-sansSemiBold mb-1">¿Qué se ha hecho esta semana?</Text>
              <View className="bg-surface border border-border rounded-xl px-3 mb-2">
                <TextInput
                  value={descripcionAvance}
                  onChangeText={setDescripcionAvance}
                  multiline
                  numberOfLines={3}
                  placeholder="Ej: Cimentación terminada, izado de la primera planta..."
                  placeholderTextColor={colors.inkSubtle}
                  editable={!enviandoAvance}
                  className="py-3 text-ink text-sm"
                  style={{ minHeight: 70, textAlignVertical: 'top' }}
                />
              </View>
              <View className="flex-row items-center gap-2 mb-3">
                <View className="flex-1 flex-row items-center bg-surface border border-border rounded-xl px-3">
                  <Feather name="percent" size={15} color={colors.inkSubtle} />
                  <TextInput
                    value={porcentajeAvance}
                    onChangeText={setPorcentajeAvance}
                    keyboardType="number-pad"
                    placeholder="% completado (opcional)"
                    placeholderTextColor={colors.inkSubtle}
                    editable={!enviandoAvance}
                    className="flex-1 py-2.5 pl-2 text-ink text-sm"
                  />
                </View>
                <Pressable
                  onPress={handleRegistrarAvance}
                  disabled={enviandoAvance}
                  className="bg-action rounded-xl px-4 py-2.5 flex-row items-center gap-1.5"
                >
                  {enviandoAvance ? (
                    <ActivityIndicator size="small" color={colors.white} />
                  ) : (
                    <Feather name="check" size={15} color={colors.white} />
                  )}
                  <Text className="text-white text-xs font-sansBold">Registrar</Text>
                </Pressable>
              </View>

              {avances.length === 0 ? (
                <Text className="text-inkMuted text-xs">
                  Todavía no hay ningún avance registrado en esta obra.
                </Text>
              ) : (
                <View className="gap-2">
                  {avances.map((avance) => (
                    <View key={avance.id} className="bg-canvas border border-border rounded-xl p-3">
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
              )}
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}