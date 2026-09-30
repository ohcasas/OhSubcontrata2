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
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { colors } from '../../design-system/tokens';
import ScreenHeader from '../../components/ScreenHeader';
import { ETIQUETA_NIVEL, ORDEN_NIVELES } from '../../constants/niveles';
import type { NivelPartner } from '../../constants/niveles';

type Recompensa = {
  id: string;
  nombre: string;
  descripcion: string | null;
  puntos_requeridos: number;
  categoria: string | null;
  activo: boolean;
  nivel_minimo: NivelPartner;
};

type Canje = {
  id: string;
  puntos_gastados: number;
  estado: 'pendiente' | 'completado' | 'cancelado';
  created_at: string;
  empresas_subcontratistas: { nombre: string } | null;
  recompensas_catalogo: { nombre: string } | null;
};

const ETIQUETA_CANJE = {
  pendiente: { texto: 'Pendiente', badge: 'bg-warningTint', color: 'text-warning' },
  completado: { texto: 'Completado', badge: 'bg-successTint', color: 'text-success' },
  cancelado: { texto: 'Cancelado', badge: 'bg-errorTint', color: 'text-error' },
} as const;

export default function RecompensasAdminScreen() {
  const [recompensas, setRecompensas] = useState<Recompensa[]>([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actualizandoId, setActualizandoId] = useState<string | null>(null);
  const [vista, setVista] = useState<'catalogo' | 'canjes'>('catalogo');
  const [canjes, setCanjes] = useState<Canje[]>([]);
  const [nivelMinimo, setNivelMinimo] = useState<NivelPartner>('bronce');
  const primeraCarga = useRef(true);

  const [mostrandoFormulario, setMostrandoFormulario] = useState(false);
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [puntos, setPuntos] = useState('');
  const [categoria, setCategoria] = useState('');
  const [errorFormulario, setErrorFormulario] = useState<string | null>(null);
  const [publicando, setPublicando] = useState(false);

  const cargarRecompensas = useCallback(async () => {
    setError(null);
    const { data, error: errorConsulta } = await supabase
      .from('recompensas_catalogo')
      .select('id, nombre, descripcion, puntos_requeridos, categoria, activo, nivel_minimo')
      .order('puntos_requeridos', { ascending: true });

    if (errorConsulta) {
      setError('No se han podido cargar las recompensas.');
      return;
    }
    setRecompensas((data as Recompensa[] | null) ?? []);

    const { data: canjesData } = await supabase
      .from('canjes')
      .select(
        'id, puntos_gastados, estado, created_at, empresas_subcontratistas(nombre), recompensas_catalogo(nombre)',
      )
      .order('created_at', { ascending: false })
      .limit(100);
    setCanjes((canjesData as unknown as Canje[] | null) ?? []);
  }, []);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        if (primeraCarga.current) setCargando(true);
        await cargarRecompensas();
        primeraCarga.current = false;
        setCargando(false);
      })();
    }, [cargarRecompensas]),
  );

  const handleRefrescar = async () => {
    setRefrescando(true);
    await cargarRecompensas();
    setRefrescando(false);
  };

  const limpiarFormulario = () => {
    setNombre('');
    setDescripcion('');
    setPuntos('');
    setCategoria('');
    setNivelMinimo('bronce');
    setErrorFormulario(null);
  };

  const handleCrear = async () => {
    setErrorFormulario(null);
    const puntosNum = Number(puntos.replace(',', '.'));

    if (nombre.trim() === '') {
      setErrorFormulario('El nombre es obligatorio.');
      return;
    }
    if (puntos.trim() === '' || Number.isNaN(puntosNum) || puntosNum <= 0) {
      setErrorFormulario('Introduce un número de puntos válido.');
      return;
    }

    setPublicando(true);
    const { error: errorInsert } = await supabase.from('recompensas_catalogo').insert({
      nombre: nombre.trim(),
      descripcion: descripcion.trim() || null,
      puntos_requeridos: Math.round(puntosNum),
      categoria: categoria.trim() || null,
      nivel_minimo: nivelMinimo,
      activo: true,
    });
    setPublicando(false);

    if (errorInsert) {
      setErrorFormulario('No se ha podido crear la recompensa.');
      return;
    }
    limpiarFormulario();
    setMostrandoFormulario(false);
    await cargarRecompensas();
  };

  const handleToggleActivo = async (item: Recompensa) => {
    setActualizandoId(item.id);
    const { error: errorUpdate } = await supabase
      .from('recompensas_catalogo')
      .update({ activo: !item.activo })
      .eq('id', item.id);
    setActualizandoId(null);

    if (errorUpdate) {
      setError('No se ha podido actualizar la recompensa.');
      return;
    }
    setRecompensas((prev) =>
      prev.map((r) => (r.id === item.id ? { ...r, activo: !r.activo } : r)),
    );
  };

  const handleCambiarNivel = async (item: Recompensa, nivel: NivelPartner) => {
    if (item.nivel_minimo === nivel) return;
    setActualizandoId(item.id);
    const { error: errorUpdate } = await supabase
      .from('recompensas_catalogo')
      .update({ nivel_minimo: nivel })
      .eq('id', item.id);
    setActualizandoId(null);
    if (errorUpdate) {
      setError(`No se ha podido cambiar el nivel: ${errorUpdate.message}`);
      return;
    }
    setRecompensas((prev) => prev.map((r) => (r.id === item.id ? { ...r, nivel_minimo: nivel } : r)));
  };

  const resolverCanje = async (canje: Canje, nuevoEstado: 'completado' | 'cancelado') => {
    setError(null);
    setActualizandoId(canje.id);
    const { error: errorRpc } = await supabase.rpc('resolver_canje', {
      p_canje_id: canje.id,
      p_nuevo_estado: nuevoEstado,
    });
    setActualizandoId(null);
    if (errorRpc) {
      setError(errorRpc.message);
      return;
    }
    setCanjes((prev) => prev.map((c) => (c.id === canje.id ? { ...c, estado: nuevoEstado } : c)));
  };

  const pedirResolverCanje = (canje: Canje, nuevoEstado: 'completado' | 'cancelado') => {
    const empresa = canje.empresas_subcontratistas?.nombre ?? 'la empresa';
    const recompensa = canje.recompensas_catalogo?.nombre ?? 'la recompensa';
    if (nuevoEstado === 'completado') {
      Alert.alert('Marcar como completado', `¿Has entregado «${recompensa}» a ${empresa}?`, [
        { text: 'No', style: 'cancel' },
        { text: 'Sí, completado', onPress: () => void resolverCanje(canje, nuevoEstado) },
      ]);
    } else {
      Alert.alert(
        'Cancelar canje',
        `Se devolverán ${canje.puntos_gastados.toLocaleString('es-ES')} puntos a ${empresa} y se le avisará.`,
        [
          { text: 'Volver', style: 'cancel' },
          { text: 'Cancelar canje', style: 'destructive', onPress: () => void resolverCanje(canje, nuevoEstado) },
        ],
      );
    }
  };

  const canjesPendientes = canjes.filter((c) => c.estado === 'pendiente').length;

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
          title="Recompensas"
          rightElement={
            vista === 'catalogo' ? (
            <Pressable
              onPress={() => setMostrandoFormulario((v) => !v)}
              className="bg-action rounded-lg px-3 py-2 flex-row items-center gap-1.5"
            >
              <Feather name={mostrandoFormulario ? 'x' : 'plus'} size={15} color={colors.white} />
              <Text className="text-white text-xs font-sansBold">
                {mostrandoFormulario ? 'Cancelar' : 'Nueva recompensa'}
              </Text>
            </Pressable>
            ) : undefined
          }
        />

        {error !== null && (
          <View className="bg-errorTint mx-4 mt-3 rounded-lg px-3 py-2 flex-row items-center gap-2">
            <Feather name="alert-circle" size={17} color={colors.error} />
            <Text className="text-error text-sm flex-1">{error}</Text>
          </View>
        )}

        <View className="flex-row mx-4 mt-3" style={{ gap: 8 }}>
          {([
            { clave: 'catalogo', etiqueta: 'Catálogo' },
            { clave: 'canjes', etiqueta: canjesPendientes > 0 ? `Canjes · ${canjesPendientes} pendientes` : 'Canjes' },
          ] as const).map((op) => {
            const activo = vista === op.clave;
            return (
              <Pressable
                key={op.clave}
                onPress={() => setVista(op.clave)}
                className={`rounded-full px-3.5 py-1.5 border ${
                  activo ? 'bg-action border-action' : 'bg-surface border-border'
                }`}
              >
                <Text className={`text-xs font-sansBold ${activo ? 'text-white' : 'text-ink'}`}>{op.etiqueta}</Text>
              </Pressable>
            );
          })}
        </View>

        {vista === 'catalogo' && mostrandoFormulario && (
          <View className="bg-surface border border-border rounded-xl p-3.5 m-4 mb-0">
            <Text className="text-ink text-sm font-sansBold mb-3">Nueva recompensa</Text>

            {errorFormulario !== null && (
              <View className="bg-errorContainer rounded-lg px-3 py-2 mb-3 flex-row items-center gap-2">
                <Feather name="alert-circle" size={17} color={colors.error} />
                <Text className="text-error text-sm flex-1">{errorFormulario}</Text>
              </View>
            )}

            <TextInput
              value={nombre}
              onChangeText={setNombre}
              placeholder="Nombre *"
              placeholderTextColor={colors.inkSubtle}
              editable={!publicando}
              className="bg-surface border border-border rounded-xl px-3 py-2.5 text-ink mb-2"
            />
            <TextInput
              value={descripcion}
              onChangeText={setDescripcion}
              placeholder="Descripción"
              placeholderTextColor={colors.inkSubtle}
              editable={!publicando}
              className="bg-surface border border-border rounded-xl px-3 py-2.5 text-ink mb-2"
            />
            <TextInput
              value={puntos}
              onChangeText={setPuntos}
              placeholder="Puntos requeridos *"
              placeholderTextColor={colors.inkSubtle}
              keyboardType="number-pad"
              editable={!publicando}
              className="bg-surface border border-border rounded-xl px-3 py-2.5 text-ink mb-2"
            />
            <TextInput
              value={categoria}
              onChangeText={setCategoria}
              placeholder="Categoría (ej. efectivo, herramienta, seguro, formación)"
              placeholderTextColor={colors.inkSubtle}
              editable={!publicando}
              className="bg-surface border border-border rounded-xl px-3 py-2.5 text-ink mb-3"
            />

            <Text className="text-ink text-xs font-sansSemiBold mb-1.5">Nivel mínimo para canjearla</Text>
            <View className="flex-row flex-wrap mb-3" style={{ gap: 6 }}>
              {ORDEN_NIVELES.map((nivel) => {
                const activo = nivelMinimo === nivel;
                return (
                  <Pressable
                    key={nivel}
                    onPress={() => setNivelMinimo(nivel)}
                    className={`rounded-full px-3 py-1.5 border ${
                      activo ? 'bg-action border-action' : 'bg-surface border-border'
                    }`}
                  >
                    <Text className={`text-xs font-sansBold ${activo ? 'text-white' : 'text-ink'}`}>
                      {ETIQUETA_NIVEL[nivel]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              onPress={handleCrear}
              disabled={publicando}
              className="bg-action rounded-xl py-3 items-center"
            >
              <View className="flex-row items-center gap-2">
                {publicando ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Feather name="gift" size={15} color={colors.white} />
                )}
                <Text className="text-white font-sansBold text-sm">Crear recompensa</Text>
              </View>
            </Pressable>
          </View>
        )}

        {vista === 'catalogo' ? (
        <FlatList
          data={recompensas}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
          refreshControl={
            <RefreshControl refreshing={refrescando} onRefresh={handleRefrescar} colors={[colors.action]} />
          }
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          ListEmptyComponent={
            error === null ? (
              <View className="items-center mt-10">
                <Feather name="gift" size={28} color={colors.inkSubtle} />
                <Text className="text-inkMuted text-sm text-center mt-3">
                  No hay ninguna recompensa todavía. Crea la primera con el botón de arriba.
                </Text>
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <View
              className={`bg-surface rounded-xl border border-border p-3.5 ${
                item.activo ? '' : 'opacity-50'
              }`}
            >
              <View className="flex-row justify-between items-start">
                <View className="flex-1 pr-2">
                  <Text className="text-ink text-sm font-sansBold">{item.nombre}</Text>
                  {item.descripcion !== null && (
                    <Text className="text-inkMuted text-xs mt-0.5">{item.descripcion}</Text>
                  )}
                  {item.categoria !== null && (
                    <View className="flex-row items-center gap-1 mt-1">
                      <Feather name="tag" size={12} color={colors.inkMuted} />
                      <Text className="text-inkMuted text-xs">{item.categoria}</Text>
                    </View>
                  )}
                </View>
                <View
                  className={`rounded-md px-2 py-0.5 ${
                    item.activo ? 'bg-successTint' : 'bg-canvas border border-border'
                  }`}
                >
                  <Text
                    className={`text-[12px] font-sansBold ${
                      item.activo ? 'text-success' : 'text-inkMuted'
                    }`}
                  >
                    {item.activo ? 'Activa' : 'Desactivada'}
                  </Text>
                </View>
              </View>

              <View className="flex-row items-center justify-between mt-2">
                <Text className="text-ink text-sm font-sansBold">
                  {item.puntos_requeridos.toLocaleString('es-ES')} pts
                </Text>
                <Pressable
                  onPress={() => handleToggleActivo(item)}
                  disabled={actualizandoId === item.id}
                  className="rounded-lg px-3 py-1.5 flex-row items-center gap-1.5 bg-canvas border border-border"
                >
                  <Feather
                    name={item.activo ? 'eye-off' : 'eye'}
                    size={14}
                    color={colors.inkMuted}
                  />
                  <Text className="text-inkMuted text-xs font-sansBold">
                    {item.activo ? 'Desactivar' : 'Activar'}
                  </Text>
                </Pressable>
              </View>

              <Text className="text-inkMuted text-[12px] font-sansBold uppercase mt-3 mb-1.5" style={{ letterSpacing: 1 }}>
                Nivel mínimo
              </Text>
              <View className="flex-row flex-wrap" style={{ gap: 6 }}>
                {ORDEN_NIVELES.map((nivel) => {
                  const activo = item.nivel_minimo === nivel;
                  return (
                    <Pressable
                      key={nivel}
                      onPress={() => handleCambiarNivel(item, nivel)}
                      disabled={actualizandoId === item.id}
                      className={`rounded-full px-2.5 py-1 border ${
                        activo ? 'bg-actionTint border-action' : 'bg-surface border-border'
                      }`}
                    >
                      <Text className={`text-[13px] font-sansBold ${activo ? 'text-action' : 'text-inkMuted'}`}>
                        {ETIQUETA_NIVEL[nivel]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}
        />
        ) : (
        <FlatList
          data={[...canjes].sort((a, b) => Number(b.estado === 'pendiente') - Number(a.estado === 'pendiente'))}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
          refreshControl={
            <RefreshControl refreshing={refrescando} onRefresh={handleRefrescar} colors={[colors.action]} />
          }
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          ListEmptyComponent={
            error === null ? (
              <View className="items-center mt-10">
                <Feather name="package" size={28} color={colors.inkSubtle} />
                <Text className="text-inkMuted text-sm text-center mt-3">
                  Todavía no hay canjes solicitados.
                </Text>
              </View>
            ) : null
          }
          renderItem={({ item }) => {
            const et = ETIQUETA_CANJE[item.estado];
            return (
              <View className="bg-surface rounded-xl border border-border p-3.5">
                <View className="flex-row justify-between items-start">
                  <View className="flex-1 pr-2">
                    <Text className="text-ink text-sm font-sansBold">
                      {item.recompensas_catalogo?.nombre ?? 'Recompensa eliminada'}
                    </Text>
                    <Text className="text-inkMuted text-xs mt-0.5">
                      {item.empresas_subcontratistas?.nombre ?? 'Empresa desconocida'}
                    </Text>
                    <Text className="text-inkMuted text-xs mt-0.5">
                      {new Date(item.created_at).toLocaleDateString('es-ES', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}{' '}
                      · {item.puntos_gastados.toLocaleString('es-ES')} pts
                    </Text>
                  </View>
                  <View className={`rounded-md px-2 py-0.5 ${et.badge}`}>
                    <Text className={`text-[12px] font-sansBold ${et.color}`}>{et.texto}</Text>
                  </View>
                </View>

                {item.estado === 'pendiente' && (
                  <View className="flex-row gap-2 mt-3">
                    <Pressable
                      onPress={() => pedirResolverCanje(item, 'completado')}
                      disabled={actualizandoId === item.id}
                      className="flex-1 bg-successTint rounded-lg py-2 items-center flex-row justify-center gap-1.5"
                    >
                      {actualizandoId === item.id ? (
                        <ActivityIndicator size="small" color={colors.success} />
                      ) : (
                        <>
                          <Feather name="check" size={15} color={colors.success} />
                          <Text className="text-success text-xs font-sansBold">Completado</Text>
                        </>
                      )}
                    </Pressable>
                    <Pressable
                      onPress={() => pedirResolverCanje(item, 'cancelado')}
                      disabled={actualizandoId === item.id}
                      className="flex-1 bg-errorTint rounded-lg py-2 items-center flex-row justify-center gap-1.5"
                    >
                      <Feather name="rotate-ccw" size={15} color={colors.error} />
                      <Text className="text-error text-xs font-sansBold">Cancelar y devolver</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            );
          }}
        />
        )}
      </View>
    </KeyboardAvoidingView>
  );
}