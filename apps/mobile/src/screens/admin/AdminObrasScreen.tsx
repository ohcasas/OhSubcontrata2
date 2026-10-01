import { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { subirImagenPublica } from '../../services/storage';
import { colors } from '../../design-system/tokens';
import type { RootStackParamList } from '../../navigation/types';
import ScreenHeader from '../../components/ScreenHeader';
import ObraImagePlaceholder from '../../components/ObraImagePlaceholder';
import { formatearMoneda } from '../../utils/moneda';

type EstadoObra = 'abierta' | 'cerrada' | 'adjudicada' | 'en_curso' | 'cancelada';

type Obra = {
  id: string;
  referencia: string;
  titulo: string;
  ubicacion: string | null;
  presupuesto: number;
  moneda: string;
  estado: EstadoObra;
  imagen_url: string | null;
};

const ESTILO_ESTADO: Record<EstadoObra, { badge: string; texto: string; etiqueta: string }> = {
  abierta: { badge: 'bg-successTint', texto: 'text-success', etiqueta: 'Abierta' },
  cerrada: { badge: 'bg-border', texto: 'text-inkMuted', etiqueta: 'Finalizada' },
  adjudicada: { badge: 'bg-actionTint', texto: 'text-action', etiqueta: 'Adjudicada' },
  en_curso: { badge: 'bg-warningTint', texto: 'text-warning', etiqueta: 'En curso' },
  cancelada: { badge: 'bg-errorTint', texto: 'text-error', etiqueta: 'Cancelada' },
};


export default function AdminObrasScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const primeraCarga = useRef(true);
  const [obras, setObras] = useState<Obra[]>([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actualizandoId, setActualizandoId] = useState<string | null>(null);

  const [mostrandoFormulario, setMostrandoFormulario] = useState(false);
  const [titulo, setTitulo] = useState('');
  const [referencia, setReferencia] = useState('');
  const [presupuesto, setPresupuesto] = useState('');
  const [especialidad, setEspecialidad] = useState('');
  const [ubicacion, setUbicacion] = useState('');
  const [puntosBonus, setPuntosBonus] = useState('');
  const [duracionDias, setDuracionDias] = useState('');
  const [plazoDias, setPlazoDias] = useState('');
  const [errorFormulario, setErrorFormulario] = useState<string | null>(null);
  const [publicando, setPublicando] = useState(false);
  const [imagenFormulario, setImagenFormulario] = useState<{ uri: string; mimeType: string } | null>(
    null,
  );

  const cargarObras = useCallback(async () => {
    setError(null);
    const { data, error: errorConsulta } = await supabase
      .from('obras')
      .select('id, referencia, titulo, ubicacion, presupuesto, moneda, estado, imagen_url')
      .order('created_at', { ascending: false });

    if (errorConsulta) {
      setError('No se han podido cargar las obras.');
      return;
    }
    setObras((data as Obra[] | null) ?? []);
  }, []);

  // Recarga al volver a esta pantalla (p.ej. tras cambiar el estado o eliminar
  // una obra desde su detalle). Solo la primera vez muestra el spinner grande.
  useFocusEffect(
    useCallback(() => {
      (async () => {
        if (primeraCarga.current) setCargando(true);
        await cargarObras();
        primeraCarga.current = false;
        setCargando(false);
      })();
    }, [cargarObras]),
  );

  const handleRefrescar = async () => {
    setRefrescando(true);
    await cargarObras();
    setRefrescando(false);
  };

  const limpiarFormulario = () => {
    setTitulo('');
    setReferencia('');
    setPresupuesto('');
    setEspecialidad('');
    setUbicacion('');
    setPuntosBonus('');
    setDuracionDias('');
    setPlazoDias('');
    setErrorFormulario(null);
    setImagenFormulario(null);
  };

  const handleElegirImagenFormulario = async () => {
    const permiso = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permiso.granted) {
      setErrorFormulario(
        permiso.canAskAgain
          ? 'Necesitamos permiso para acceder a tus fotos.'
          : 'El permiso de fotos está bloqueado. Actívalo desde los ajustes del sistema para esta app.',
      );
      return;
    }
    const resultado = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });
    if (resultado.canceled) return;
    const asset = resultado.assets[0];
    setImagenFormulario({ uri: asset.uri, mimeType: asset.mimeType ?? 'image/jpeg' });
  };

  const handlePublicar = async () => {
    setErrorFormulario(null);
    const presupuestoNum = Number(presupuesto.replace(',', '.'));

    if (titulo.trim() === '' || referencia.trim() === '') {
      setErrorFormulario('Título y referencia son obligatorios.');
      return;
    }
    if (presupuesto.trim() === '' || Number.isNaN(presupuestoNum) || presupuestoNum <= 0) {
      setErrorFormulario('Introduce un presupuesto válido.');
      return;
    }

    // Campos numéricos opcionales: vacío = sin valor; si se rellenan, deben ser válidos.
    const leerOpcional = (texto: string): number | null | 'invalido' => {
      if (texto.trim() === '') return null;
      const n = Number(texto.replace(',', '.'));
      return Number.isNaN(n) || n < 0 ? 'invalido' : n;
    };
    const puntosNum = leerOpcional(puntosBonus);
    const duracionNum = leerOpcional(duracionDias);
    const plazoNum = leerOpcional(plazoDias);
    if (puntosNum === 'invalido' || duracionNum === 'invalido' || plazoNum === 'invalido') {
      setErrorFormulario('Puntos, duración y plazo deben ser números válidos (o dejarse vacíos).');
      return;
    }

    setPublicando(true);

    let imagenUrl: string | null = null;
    if (imagenFormulario !== null) {
      try {
        imagenUrl = await subirImagenPublica(
          'obras-fotos',
          'obras',
          imagenFormulario.uri,
          imagenFormulario.mimeType,
        );
      } catch {
        setPublicando(false);
        setErrorFormulario(
          'No se ha podido subir la foto. Puedes publicar sin foto y añadirla después.',
        );
        return;
      }
    }

    const { error: errorInsert } = await supabase.from('obras').insert({
      titulo: titulo.trim(),
      referencia: referencia.trim(),
      presupuesto: presupuestoNum,
      moneda: 'EUR',
      especialidad_requerida: especialidad.trim() || null,
      ubicacion: ubicacion.trim() || null,
      puntos_bonus: puntosNum !== null ? Math.round(puntosNum) : 0,
      duracion_dias: duracionNum !== null ? Math.round(duracionNum) : null,
      // El plazo se introduce en días desde ahora (admite decimales: 2 = 48 h).
      plazo_cierre:
        plazoNum !== null && plazoNum > 0
          ? new Date(Date.now() + plazoNum * 86400000).toISOString()
          : null,
      estado: 'abierta',
      imagen_url: imagenUrl,
    });
    setPublicando(false);

    if (errorInsert) {
      setErrorFormulario(
        errorInsert.message.includes('duplicate')
          ? 'Ya existe una obra con esa referencia.'
          : 'No se ha podido publicar la licitación.',
      );
      return;
    }
    limpiarFormulario();
    setMostrandoFormulario(false);
    await cargarObras();
  };

  const handleCambiarFotoObra = async (obraId: string) => {
    const permiso = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permiso.granted) {
      setError(
        permiso.canAskAgain
          ? 'Necesitamos permiso para acceder a tus fotos.'
          : 'El permiso de fotos está bloqueado. Actívalo desde los ajustes del sistema para esta app.',
      );
      return;
    }

    const resultado = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });
    if (resultado.canceled) return;
    const asset = resultado.assets[0];

    setActualizandoId(obraId);
    try {
      const url = await subirImagenPublica(
        'obras-fotos',
        'obras',
        asset.uri,
        asset.mimeType ?? 'image/jpeg',
      );
      const { error: errorUpdate } = await supabase
        .from('obras')
        .update({ imagen_url: url })
        .eq('id', obraId);
      if (errorUpdate) throw errorUpdate;
      setObras((prev) => prev.map((o) => (o.id === obraId ? { ...o, imagen_url: url } : o)));
    } catch {
      setError('No se ha podido actualizar la foto de la obra.');
    } finally {
      setActualizandoId(null);
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
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <View className="flex-1 bg-canvas">
        <ScreenHeader
          title="Obras"
          rightElement={
            <Pressable
              onPress={() => setMostrandoFormulario((v) => !v)}
              className="bg-action rounded-lg px-3 py-2 flex-row items-center gap-1.5"
            >
              <Feather name={mostrandoFormulario ? 'x' : 'plus'} size={15} color={colors.white} />
              <Text className="text-white text-xs font-sansBold">
                {mostrandoFormulario ? 'Cancelar' : 'Nueva licitación'}
              </Text>
            </Pressable>
          }
        />

        {error !== null && (
          <View className="bg-errorTint mx-4 mt-3 rounded-lg px-3 py-2 flex-row items-center gap-2">
            <Feather name="alert-circle" size={17} color={colors.error} />
            <Text className="text-error text-sm flex-1">{error}</Text>
          </View>
        )}

        {mostrandoFormulario && (
          <View className="bg-surface border border-border rounded-xl p-3.5 m-4 mb-0">
            <Text className="text-ink text-sm font-sansBold mb-3">Publicar Nueva Licitación</Text>

            {errorFormulario !== null && (
              <View className="bg-errorContainer rounded-lg px-3 py-2 mb-3 flex-row items-center gap-2">
                <Feather name="alert-circle" size={17} color={colors.error} />
                <Text className="text-error text-sm flex-1">{errorFormulario}</Text>
              </View>
            )}

            <TextInput
              value={titulo}
              onChangeText={setTitulo}
              placeholder="Título de la obra *"
              placeholderTextColor={colors.inkSubtle}
              editable={!publicando}
              className="bg-surface border border-border rounded-xl px-3 py-2.5 text-ink mb-2"
            />
            <TextInput
              value={referencia}
              onChangeText={setReferencia}
              placeholder="Referencia * (ej: LIC-2025-110)"
              placeholderTextColor={colors.inkSubtle}
              autoCapitalize="characters"
              editable={!publicando}
              className="bg-surface border border-border rounded-xl px-3 py-2.5 text-ink mb-2"
            />
            <TextInput
              value={presupuesto}
              onChangeText={setPresupuesto}
              placeholder="Presupuesto (€) *"
              placeholderTextColor={colors.inkSubtle}
              keyboardType="decimal-pad"
              editable={!publicando}
              className="bg-surface border border-border rounded-xl px-3 py-2.5 text-ink mb-2"
            />
            <TextInput
              value={especialidad}
              onChangeText={setEspecialidad}
              placeholder="Especialidad requerida"
              placeholderTextColor={colors.inkSubtle}
              editable={!publicando}
              className="bg-surface border border-border rounded-xl px-3 py-2.5 text-ink mb-2"
            />
            <TextInput
              value={ubicacion}
              onChangeText={setUbicacion}
              placeholder="Ubicación"
              placeholderTextColor={colors.inkSubtle}
              editable={!publicando}
              className="bg-surface border border-border rounded-xl px-3 py-2.5 text-ink mb-2"
            />
            <View className="flex-row gap-2 mb-2">
              <TextInput
                value={puntosBonus}
                onChangeText={setPuntosBonus}
                placeholder="Puntos Club OH"
                placeholderTextColor={colors.inkSubtle}
                keyboardType="number-pad"
                editable={!publicando}
                className="flex-1 bg-surface border border-border rounded-xl px-3 py-2.5 text-ink"
              />
              <TextInput
                value={duracionDias}
                onChangeText={setDuracionDias}
                placeholder="Duración (días)"
                placeholderTextColor={colors.inkSubtle}
                keyboardType="number-pad"
                editable={!publicando}
                className="flex-1 bg-surface border border-border rounded-xl px-3 py-2.5 text-ink"
              />
            </View>
            <TextInput
              value={plazoDias}
              onChangeText={setPlazoDias}
              placeholder="Plazo para postular (días)"
              placeholderTextColor={colors.inkSubtle}
              keyboardType="decimal-pad"
              editable={!publicando}
              className="bg-surface border border-border rounded-xl px-3 py-2.5 text-ink"
            />
            <Text className="text-inkMuted text-[13px] mt-1 mb-3">
              Los puntos se acreditan a la empresa al marcar la obra como finalizada. Con un plazo de 2 días o
              menos, la licitación sale como prioritaria.
            </Text>

            {imagenFormulario !== null ? (
              <View className="mb-3">
                <Image
                  source={{ uri: imagenFormulario.uri }}
                  style={{ width: '100%', height: 120, borderRadius: 12 }}
                  resizeMode="cover"
                />
                <Pressable
                  onPress={() => setImagenFormulario(null)}
                  disabled={publicando}
                  className="absolute top-2 right-2 bg-ink/70 rounded-full p-1.5"
                >
                  <Feather name="x" size={15} color={colors.white} />
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={handleElegirImagenFormulario}
                disabled={publicando}
                className="flex-row items-center justify-center gap-2 border border-dashed border-border rounded-xl py-4 mb-3"
              >
                <Feather name="image" size={17} color={colors.inkMuted} />
                <Text className="text-inkMuted text-xs font-sansSemiBold">
                  Añadir foto (opcional)
                </Text>
              </Pressable>
            )}

            <Pressable
              onPress={handlePublicar}
              disabled={publicando}
              className="bg-action rounded-xl py-3 items-center"
            >
              <View className="flex-row items-center gap-2">
                {publicando ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Feather name="upload" size={15} color={colors.white} />
                )}
                <Text className="text-white font-sansBold text-sm">Publicar</Text>
              </View>
            </Pressable>
          </View>
        )}

        <FlatList
          data={obras}
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
                  No hay ninguna obra todavía. Publica la primera con el botón de arriba.
                </Text>
              </View>
            ) : null
          }
          renderItem={({ item }) => {
            const estilo = ESTILO_ESTADO[item.estado];
            return (
              <View className="bg-surface rounded-xl border border-border overflow-hidden">
                <View className="relative">
                  <ObraImagePlaceholder imageUrl={item.imagen_url} icon="home" height={140} />
                  <Pressable
                    onPress={() => handleCambiarFotoObra(item.id)}
                    disabled={actualizandoId === item.id}
                    className="absolute bottom-2 right-2 bg-ink/70 rounded-full p-2.5"
                  >
                    <Feather name="camera" size={15} color={colors.white} />
                  </Pressable>
                  <View className={`absolute top-2 right-2 rounded-md px-2 py-0.5 ${estilo.badge}`}>
                    <Text className={`text-[12px] font-sansBold ${estilo.texto}`}>{estilo.etiqueta}</Text>
                  </View>
                </View>

                <View className="p-3">
                  <Text className="text-inkMuted text-xs font-mono">{item.referencia}</Text>
                  <Text className="text-ink text-sm font-sansBold mt-0.5">{item.titulo}</Text>
                  {item.ubicacion !== null && (
                    <View className="flex-row items-center gap-1 mt-0.5">
                      <Feather name="map-pin" size={12} color={colors.inkMuted} />
                      <Text className="text-inkMuted text-xs">{item.ubicacion}</Text>
                    </View>
                  )}
                  <Text className="text-ink text-sm font-sansBold mt-2">
                    {formatearMoneda(item.presupuesto, item.moneda)}
                  </Text>

                  <Pressable
                    onPress={() => navigation.navigate('AdminObraDetalle', { obraId: item.id })}
                    className="flex-row items-center justify-center gap-1.5 bg-action rounded-lg py-2.5 mt-3"
                  >
                    <Feather name="sliders" size={15} color={colors.white} />
                    <Text className="text-white text-xs font-sansBold">Gestionar obra</Text>
                  </Pressable>
                </View>
              </View>
            );
          }}
        />
      </View>
    </KeyboardAvoidingView>
  );
}