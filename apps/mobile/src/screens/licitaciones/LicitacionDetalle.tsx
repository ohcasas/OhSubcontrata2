import { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Alert, Linking } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { obtenerUrlFirmada } from '../../services/storage';
import { colors } from '../../design-system/tokens';
import ScreenHeader from '../../components/ScreenHeader';
import { formatearMoneda } from '../../utils/moneda';
import { ETIQUETA_ESTADO_OBRA, ESTILO_ESTADO_OBRA, ETIQUETA_ESTADO_POSTULACION, fechaCorta } from './estados';

type Obra = {
  id: string;
  referencia: string;
  titulo: string;
  descripcion: string | null;
  especialidad_requerida: string | null;
  ubicacion: string | null;
  presupuesto: number;
  duracion_dias: number | null;
  plazo_cierre: string | null;
  estado: string;
  requisitos: string | null;
};

type Archivo = { id: string; nombre_archivo: string; storage_path: string; tipo_mime: string | null };

type Postulacion = {
  id: string;
  estado: string;
  oferta_economica: number;
  telefono_contacto: string | null;
  disponibilidad_equipo: string | null;
  motivacion: string | null;
  motivo_rechazo: string | null;
  created_at: string;
  empresa_nombre: string;
  empresa_especialidad: string | null;
  empresa_homologada: boolean;
  empresa_rating: number | null;
  empresa_obras_completadas: number | null;
  archivos: Archivo[];
};

type Avance = { id: string; descripcion: string; porcentaje_avance: number | null; created_at: string };

type Resultado = PromiseLike<{ error: { message: string } | null }>;

export default function LicitacionDetalle({ obraId, onVolver }: { obraId: string; onVolver: () => void }) {
  const [obra, setObra] = useState<Obra | null>(null);
  const [postulaciones, setPostulaciones] = useState<Postulacion[]>([]);
  const [avances, setAvances] = useState<Avance[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [rechazandoId, setRechazandoId] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');

  const cargar = useCallback(async () => {
    const [{ data: o, error: eObra }, { data: p, error: ePost }, { data: a }] = await Promise.all([
      supabase
        .from('obras')
        .select('id, referencia, titulo, descripcion, especialidad_requerida, ubicacion, presupuesto, duracion_dias, plazo_cierre, estado, requisitos')
        .eq('id', obraId)
        .single(),
      supabase.rpc('postulaciones_de_mi_licitacion', { p_obra_id: obraId }),
      supabase.from('avances_obra').select('id, descripcion, porcentaje_avance, created_at').eq('obra_id', obraId).order('created_at', { ascending: false }),
    ]);
    if (eObra || ePost) setError((eObra ?? ePost)?.message ?? 'No se ha podido cargar la licitación.');
    setObra((o as Obra | null) ?? null);
    setPostulaciones((p as Postulacion[] | null) ?? []);
    setAvances((a as Avance[] | null) ?? []);
    setCargando(false);
  }, [obraId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Ejecuta una acción de las funciones de la base de datos y recarga la pantalla.
  const ejecutar = async (accion: () => Resultado) => {
    setError(null);
    setTrabajando(true);
    const { error: errorAccion } = await accion();
    setTrabajando(false);
    if (errorAccion) {
      setError(errorAccion.message);
      return;
    }
    setRechazandoId(null);
    setMotivo('');
    await cargar();
  };

  const confirmarAdjudicar = (p: Postulacion) => {
    Alert.alert(
      'Adjudicar la licitación',
      `¿Adjudicar «${obra?.titulo ?? 'la licitación'}» a ${p.empresa_nombre} por ${formatearMoneda(Number(p.oferta_economica))}? Se rechazará a las demás empresas.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Adjudicar', onPress: () => ejecutar(() => supabase.rpc('aceptar_postulacion_propietario', { p_postulacion_id: p.id })) },
      ],
    );
  };

  const confirmarEstado = (nuevo: 'en_curso' | 'cerrada' | 'cancelada', titulo: string, texto: string) => {
    Alert.alert(titulo, texto, [
      { text: 'Volver', style: 'cancel' },
      {
        text: titulo,
        style: nuevo === 'cancelada' ? 'destructive' : 'default',
        onPress: () => ejecutar(() => supabase.rpc('cambiar_estado_licitacion', { p_obra_id: obraId, p_nuevo_estado: nuevo })),
      },
    ]);
  };

  const abrirArchivo = async (a: Archivo) => {
    try {
      Linking.openURL(await obtenerUrlFirmada('postulacion-archivos', a.storage_path));
    } catch {
      setError('No se ha podido abrir el archivo.');
    }
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
      <View className="flex-1 bg-canvas">
        <ScreenHeader title="Licitación" />
        <View className="p-4">
          <Text className="text-error text-sm mb-3">{error ?? 'No se ha encontrado la licitación.'}</Text>
          <Pressable onPress={onVolver}><Text className="text-action text-sm font-sansSemiBold">Volver</Text></Pressable>
        </View>
      </View>
    );
  }

  const estilo = ESTILO_ESTADO_OBRA[obra.estado] ?? ESTILO_ESTADO_OBRA.abierta;
  const abierta = obra.estado === 'abierta';

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader title={obra.referencia} subtitle="Tu licitación" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Pressable onPress={onVolver} className="flex-row items-center gap-1.5 mb-3" hitSlop={8}>
          <Feather name="arrow-left" size={16} color={colors.action} />
          <Text className="text-action text-sm font-sansSemiBold">Mis licitaciones</Text>
        </Pressable>

        {error !== null && (
          <View className="bg-errorTint rounded-lg px-3 py-2 mb-3 flex-row items-center gap-2">
            <Feather name="alert-circle" size={16} color={colors.error} />
            <Text className="text-error text-sm flex-1">{error}</Text>
          </View>
        )}

        {/* Resumen */}
        <View className="bg-surface rounded-2xl border border-border p-4 mb-4">
          <View className="flex-row justify-between items-start">
            <Text className="text-ink text-base font-sansBold flex-1 pr-2">{obra.titulo}</Text>
            <View className={`rounded-md px-2 py-0.5 ${estilo.fondo}`}>
              <Text className={`text-[10px] font-sansBold ${estilo.texto}`}>{ETIQUETA_ESTADO_OBRA[obra.estado] ?? obra.estado}</Text>
            </View>
          </View>
          <Text className="text-ink text-sm font-sansSemiBold mt-1">{formatearMoneda(Number(obra.presupuesto))}</Text>
          {obra.descripcion !== null && <Text className="text-inkMuted text-xs mt-2">{obra.descripcion}</Text>}
          <View className="mt-2 gap-0.5">
            {obra.especialidad_requerida !== null && <Text className="text-inkMuted text-xs">Especialidad: {obra.especialidad_requerida}</Text>}
            {obra.ubicacion !== null && <Text className="text-inkMuted text-xs">Ubicación: {obra.ubicacion}</Text>}
            {obra.duracion_dias !== null && <Text className="text-inkMuted text-xs">Duración estimada: {obra.duracion_dias} días</Text>}
            {obra.requisitos !== null && <Text className="text-inkMuted text-xs">Requisitos: {obra.requisitos}</Text>}
            {abierta && obra.plazo_cierre !== null && <Text className="text-inkMuted text-xs">Abierta hasta el {fechaCorta(obra.plazo_cierre)}</Text>}
          </View>

          {/* Acciones según el estado */}
          {obra.estado === 'adjudicada' && (
            <Pressable
              onPress={() => confirmarEstado('en_curso', 'Iniciar obra', 'La empresa adjudicada recibirá un aviso de que la obra está en curso.')}
              disabled={trabajando}
              className="bg-action rounded-lg py-2.5 items-center mt-3"
            >
              <Text className="text-white text-xs font-sansBold">Marcar como en curso</Text>
            </Pressable>
          )}
          {obra.estado === 'en_curso' && (
            <Pressable
              onPress={() => confirmarEstado('cerrada', 'Finalizar obra', 'La obra quedará finalizada y la empresa recibirá un aviso.')}
              disabled={trabajando}
              className="bg-action rounded-lg py-2.5 items-center mt-3"
            >
              <Text className="text-white text-xs font-sansBold">Marcar como finalizada</Text>
            </Pressable>
          )}
          {(obra.estado === 'abierta' || obra.estado === 'adjudicada' || obra.estado === 'en_curso') && (
            <Pressable
              onPress={() => confirmarEstado('cancelada', 'Cancelar licitación', 'Se rechazará a las empresas postuladas y se les avisará. No se puede deshacer.')}
              disabled={trabajando}
              className="border border-error rounded-lg py-2.5 items-center mt-2"
            >
              <Text className="text-error text-xs font-sansBold">Cancelar licitación</Text>
            </Pressable>
          )}
          {trabajando && (
            <View className="mt-2">
              <ActivityIndicator color={colors.action} />
            </View>
          )}
        </View>

        {/* Postulaciones */}
        <Text className="text-ink text-xs font-sansBold uppercase mb-2" style={{ letterSpacing: 1 }}>
          Postulaciones ({postulaciones.length})
        </Text>
        {postulaciones.length === 0 ? (
          <Text className="text-inkMuted text-sm mb-4">Todavía no se ha postulado nadie. Te avisaremos cuando llegue la primera.</Text>
        ) : (
          <View className="gap-2.5 mb-4">
            {postulaciones.map((p) => {
              const pendiente = p.estado === 'enviada' || p.estado === 'en_revision';
              return (
                <View key={p.id} className={`bg-surface rounded-xl border p-3.5 ${p.estado === 'aceptada' ? 'border-success' : 'border-border'}`}>
                  <View className="flex-row justify-between items-start">
                    <View className="flex-1 pr-2">
                      <Text className="text-ink text-sm font-sansBold">{p.empresa_nombre}</Text>
                      <Text className="text-inkMuted text-xs mt-0.5">
                        {[
                          p.empresa_especialidad,
                          p.empresa_homologada ? 'Homologada' : null,
                          p.empresa_rating !== null && Number(p.empresa_rating) > 0 ? `★ ${String(Number(p.empresa_rating)).replace('.', ',')}` : null,
                          p.empresa_obras_completadas !== null ? `${p.empresa_obras_completadas} obras en OH` : null,
                        ].filter((x) => x !== null && x !== '').join(' · ')}
                      </Text>
                    </View>
                    <Text className="text-ink text-base font-sansBold">{formatearMoneda(Number(p.oferta_economica))}</Text>
                  </View>

                  {p.motivacion !== null && <Text className="text-inkMuted text-xs mt-2">{p.motivacion}</Text>}
                  {p.disponibilidad_equipo !== null && <Text className="text-inkMuted text-xs mt-1">Disponibilidad: {p.disponibilidad_equipo}</Text>}

                  <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1 mt-2">
                    {p.telefono_contacto !== null && (
                      <Pressable onPress={() => Linking.openURL(`tel:${p.telefono_contacto}`)} className="flex-row items-center gap-1">
                        <Feather name="phone" size={12} color={colors.action} />
                        <Text className="text-action text-xs font-sansSemiBold">{p.telefono_contacto}</Text>
                      </Pressable>
                    )}
                    {p.archivos.map((a) => (
                      <Pressable key={a.id} onPress={() => abrirArchivo(a)} className="flex-row items-center gap-1">
                        <Feather name="paperclip" size={12} color={colors.action} />
                        <Text className="text-action text-xs font-sansSemiBold">{a.nombre_archivo}</Text>
                      </Pressable>
                    ))}
                  </View>

                  <View className="flex-row items-center justify-between mt-2.5 pt-2.5 border-t border-border">
                    <Text className={`text-xs font-sansSemiBold ${p.estado === 'aceptada' ? 'text-success' : p.estado === 'rechazada' ? 'text-error' : 'text-inkMuted'}`}>
                      {ETIQUETA_ESTADO_POSTULACION[p.estado] ?? p.estado}
                    </Text>
                    {abierta && pendiente && rechazandoId !== p.id && (
                      <View className="flex-row gap-2">
                        <Pressable onPress={() => { setRechazandoId(p.id); setMotivo(''); }} disabled={trabajando} className="border border-border rounded-lg px-3 py-1.5">
                          <Text className="text-inkMuted text-xs font-sansSemiBold">Rechazar</Text>
                        </Pressable>
                        <Pressable onPress={() => confirmarAdjudicar(p)} disabled={trabajando} className="bg-action rounded-lg px-3 py-1.5">
                          <Text className="text-white text-xs font-sansBold">Adjudicar</Text>
                        </Pressable>
                      </View>
                    )}
                  </View>

                  {p.estado === 'rechazada' && p.motivo_rechazo !== null && (
                    <Text className="text-inkMuted text-xs mt-1.5">Motivo: {p.motivo_rechazo}</Text>
                  )}

                  {rechazandoId === p.id && (
                    <View className="mt-2.5">
                      <Text className="text-ink text-xs font-sansSemiBold mb-1">Motivo (se le enviará a la empresa)</Text>
                      <View className="bg-canvas border border-border rounded-xl px-3 mb-2">
                        <TextInput value={motivo} onChangeText={setMotivo} placeholder="Ej: el precio supera el presupuesto" placeholderTextColor={colors.inkSubtle} className="py-2.5 text-ink" />
                      </View>
                      <View className="flex-row gap-2">
                        <Pressable onPress={() => setRechazandoId(null)} className="flex-1 border border-border rounded-lg py-2 items-center">
                          <Text className="text-inkMuted text-xs font-sansSemiBold">Cancelar</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => ejecutar(() => supabase.rpc('rechazar_postulacion_propietario', { p_postulacion_id: p.id, p_motivo: motivo }))}
                          disabled={trabajando}
                          className="flex-1 bg-error rounded-lg py-2 items-center"
                        >
                          <Text className="text-white text-xs font-sansBold">Rechazar</Text>
                        </Pressable>
                      </View>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* Progreso */}
        {avances.length > 0 && (
          <>
            <Text className="text-ink text-xs font-sansBold uppercase mb-2" style={{ letterSpacing: 1 }}>
              Progreso de la obra
            </Text>
            <View className="gap-2">
              {avances.map((a) => (
                <View key={a.id} className="bg-surface rounded-xl border border-border p-3">
                  <View className="flex-row justify-between">
                    <Text className="text-inkMuted text-xs">{fechaCorta(a.created_at)}</Text>
                    {a.porcentaje_avance !== null && <Text className="text-ink text-xs font-sansBold">{a.porcentaje_avance} %</Text>}
                  </View>
                  <Text className="text-ink text-sm mt-1">{a.descripcion}</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}