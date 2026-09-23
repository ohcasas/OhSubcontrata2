import { useCallback, useEffect, useState } from 'react';
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
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { colors } from '../../design-system/tokens';
import ScreenHeader from '../../components/ScreenHeader';

type EstadoObra = 'abierta' | 'cerrada' | 'adjudicada' | 'cancelada';

type Obra = {
  id: string;
  referencia: string;
  titulo: string;
  ubicacion: string | null;
  presupuesto: number;
  moneda: string;
  estado: EstadoObra;
};

const ESTILO_ESTADO: Record<EstadoObra, { badge: string; texto: string; etiqueta: string }> = {
  abierta: { badge: 'bg-success/15', texto: 'text-success', etiqueta: 'Abierta' },
  cerrada: { badge: 'bg-surfaceContainerHigh', texto: 'text-onSurfaceVariant', etiqueta: 'Cerrada' },
  adjudicada: { badge: 'bg-secondaryContainer', texto: 'text-onSecondaryContainer', etiqueta: 'Adjudicada' },
  cancelada: { badge: 'bg-errorContainer', texto: 'text-onErrorContainer', etiqueta: 'Cancelada' },
};

function formatearMoneda(valor: number, moneda: string): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: moneda }).format(valor);
}

export default function AdminObrasScreen() {
  const [obras, setObras] = useState<Obra[]>([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [mostrandoFormulario, setMostrandoFormulario] = useState(false);
  const [titulo, setTitulo] = useState('');
  const [referencia, setReferencia] = useState('');
  const [presupuesto, setPresupuesto] = useState('');
  const [especialidad, setEspecialidad] = useState('');
  const [ubicacion, setUbicacion] = useState('');
  const [errorFormulario, setErrorFormulario] = useState<string | null>(null);
  const [publicando, setPublicando] = useState(false);

  const cargarObras = useCallback(async () => {
    setError(null);
    const { data, error: errorConsulta } = await supabase
      .from('obras')
      .select('id, referencia, titulo, ubicacion, presupuesto, moneda, estado')
      .order('created_at', { ascending: false });

    if (errorConsulta) {
      setError('No se han podido cargar las obras.');
      return;
    }
    setObras((data as Obra[] | null) ?? []);
  }, []);

  useEffect(() => {
    setCargando(true);
    cargarObras().finally(() => setCargando(false));
  }, [cargarObras]);

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
    setErrorFormulario(null);
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

    setPublicando(true);
    const { error: errorInsert } = await supabase.from('obras').insert({
      titulo: titulo.trim(),
      referencia: referencia.trim(),
      presupuesto: presupuestoNum,
      moneda: 'EUR',
      especialidad_requerida: especialidad.trim() || null,
      ubicacion: ubicacion.trim() || null,
      estado: 'abierta',
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

  if (cargando) {
    return (
      <View className="flex-1 items-center justify-center bg-surface">
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <View className="flex-1 bg-surface">
        <ScreenHeader
          title="Obras (Admin)"
          rightElement={
            <Pressable
              onPress={() => setMostrandoFormulario((v) => !v)}
              className="bg-onPrimary/15 rounded-lg px-3 py-1.5 flex-row items-center gap-1.5"
            >
              <Feather name={mostrandoFormulario ? 'x' : 'plus'} size={13} color={colors.onPrimary} />
              <Text className="text-onPrimary text-xs font-bold">
                {mostrandoFormulario ? 'Cancelar' : 'Nueva licitación'}
              </Text>
            </Pressable>
          }
        />

        {error !== null && (
          <View className="bg-errorContainer mx-4 mt-3 rounded-lg px-3 py-2 flex-row items-center gap-2">
            <Feather name="alert-circle" size={16} color={colors.onErrorContainer} />
            <Text className="text-onErrorContainer text-sm flex-1">{error}</Text>
          </View>
        )}

        {mostrandoFormulario && (
          <View className="bg-surfaceContainerLowest border border-outlineVariant rounded-2xl p-4 m-4 mb-0">
            <Text className="text-onSurface text-sm font-extrabold mb-3">Publicar Nueva Licitación</Text>

            {errorFormulario !== null && (
              <View className="bg-errorContainer rounded-lg px-3 py-2 mb-3 flex-row items-center gap-2">
                <Feather name="alert-circle" size={16} color={colors.onErrorContainer} />
                <Text className="text-onErrorContainer text-sm flex-1">{errorFormulario}</Text>
              </View>
            )}

            <TextInput
              value={titulo}
              onChangeText={setTitulo}
              placeholder="Título de la obra *"
              placeholderTextColor={colors.outline}
              editable={!publicando}
              className="bg-surface border border-outlineVariant rounded-xl px-3 py-3 text-onSurface mb-2"
            />
            <TextInput
              value={referencia}
              onChangeText={setReferencia}
              placeholder="Referencia * (ej: LIC-2025-110)"
              placeholderTextColor={colors.outline}
              autoCapitalize="characters"
              editable={!publicando}
              className="bg-surface border border-outlineVariant rounded-xl px-3 py-3 text-onSurface mb-2"
            />
            <TextInput
              value={presupuesto}
              onChangeText={setPresupuesto}
              placeholder="Presupuesto (€) *"
              placeholderTextColor={colors.outline}
              keyboardType="decimal-pad"
              editable={!publicando}
              className="bg-surface border border-outlineVariant rounded-xl px-3 py-3 text-onSurface mb-2"
            />
            <TextInput
              value={especialidad}
              onChangeText={setEspecialidad}
              placeholder="Especialidad requerida"
              placeholderTextColor={colors.outline}
              editable={!publicando}
              className="bg-surface border border-outlineVariant rounded-xl px-3 py-3 text-onSurface mb-2"
            />
            <TextInput
              value={ubicacion}
              onChangeText={setUbicacion}
              placeholder="Ubicación"
              placeholderTextColor={colors.outline}
              editable={!publicando}
              className="bg-surface border border-outlineVariant rounded-xl px-3 py-3 text-onSurface mb-3"
            />

            <Pressable
              onPress={handlePublicar}
              disabled={publicando}
              className="bg-primary rounded-xl py-3 items-center"
            >
              <View className="flex-row items-center gap-2">
                {publicando ? (
                  <ActivityIndicator color={colors.onPrimary} />
                ) : (
                  <Feather name="upload" size={14} color={colors.onPrimary} />
                )}
                <Text className="text-onPrimary font-bold text-sm">Publicar</Text>
              </View>
            </Pressable>
          </View>
        )}

        <FlatList
          data={obras}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
          refreshControl={
            <RefreshControl refreshing={refrescando} onRefresh={handleRefrescar} colors={[colors.primary]} />
          }
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          ListEmptyComponent={
            error === null ? (
              <View className="items-center mt-10">
                <Feather name="inbox" size={28} color={colors.outline} />
                <Text className="text-onSurfaceVariant text-sm text-center mt-3">
                  No hay ninguna obra todavía. Publica la primera con el botón de arriba.
                </Text>
              </View>
            ) : null
          }
          renderItem={({ item }) => {
            const estilo = ESTILO_ESTADO[item.estado];
            return (
              <View className="bg-surfaceContainerLowest rounded-xl border border-outlineVariant p-3.5">
                <View className="flex-row justify-between items-start">
                  <View className="flex-1 pr-2">
                    <Text className="text-onSurfaceVariant text-xs font-mono">{item.referencia}</Text>
                    <Text className="text-onSurface text-sm font-bold mt-0.5">{item.titulo}</Text>
                    {item.ubicacion !== null && (
                      <View className="flex-row items-center gap-1 mt-0.5">
                        <Feather name="map-pin" size={10} color={colors.onSurfaceVariant} />
                        <Text className="text-onSurfaceVariant text-xs">{item.ubicacion}</Text>
                      </View>
                    )}
                  </View>
                  <View className={`rounded-md px-2 py-0.5 ${estilo.badge}`}>
                    <Text className={`text-[10px] font-bold ${estilo.texto}`}>{estilo.etiqueta}</Text>
                  </View>
                </View>
                <Text className="text-onSurface text-sm font-extrabold mt-2">
                  {formatearMoneda(item.presupuesto, item.moneda)}
                </Text>
              </View>
            );
          }}
        />
      </View>
    </KeyboardAvoidingView>
  );
}
