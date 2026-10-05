import { useCallback, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, RefreshControl, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { colors } from '../../design-system/tokens';
import ScreenHeader from '../../components/ScreenHeader';
import BuscadorFiltros from '../../components/BuscadorFiltros';
import { coincide } from '../../utils/texto';

type Ficha = {
  profile_id: string;
  rol: string;
  nombre_mostrar: string;
  categoria: string | null;
  descripcion: string | null;
  zona_cobertura: string | null;
  telefono: string | null;
  email: string | null;
};

const ETIQUETA_ROL: Record<string, string> = {
  proveedor: 'Proveedor',
  arquitecto: 'Arquitecto',
  profesional: 'Profesional',
};

export default function DirectorioScreen({ rol, userId }: { rol: string; userId: string }) {
  // Solo estos tres perfiles tienen ficha propia; el resto (promotor,
  // constructora, administrador) solo consulta el directorio.
  const puedeTenerFicha = rol === 'proveedor' || rol === 'arquitecto' || rol === 'profesional';
  const [fichas, setFichas] = useState<Ficha[]>([]);
  const [miFicha, setMiFicha] = useState<Ficha | null>(null);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editando, setEditando] = useState(false);
  const [nombreMostrar, setNombreMostrar] = useState('');
  const [categoria, setCategoria] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [zonaCobertura, setZonaCobertura] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [filtroRol, setFiltroRol] = useState('todos');

  const cargar = useCallback(async () => {
    setError(null);
    const { data, error: errorSelect } = await supabase
      .from('fichas_directorio')
      .select('profile_id, rol, nombre_mostrar, categoria, descripcion, zona_cobertura, telefono, email')
      .order('created_at', { ascending: false });

    if (errorSelect) {
      setError(errorSelect.message);
      setCargando(false);
      return;
    }

    const todas = (data as Ficha[] | null) ?? [];
    setFichas(todas);
    const propia = todas.find((f) => f.profile_id === userId) ?? null;
    setMiFicha(propia);
    if (propia !== null) {
      setNombreMostrar(propia.nombre_mostrar);
      setCategoria(propia.categoria ?? '');
      setDescripcion(propia.descripcion ?? '');
      setZonaCobertura(propia.zona_cobertura ?? '');
      setTelefono(propia.telefono ?? '');
      setEmail(propia.email ?? '');
    }
    setCargando(false);
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [cargar]),
  );

  const handleGuardarFicha = async () => {
    setErrorForm(null);
    if (nombreMostrar.trim().length < 2) {
      setErrorForm('Indica el nombre que quieres que se vea en tu ficha.');
      return;
    }

    setGuardando(true);
    const { error: errorUpsert } = await supabase.from('fichas_directorio').upsert({
      profile_id: userId,
      rol,
      nombre_mostrar: nombreMostrar.trim(),
      categoria: categoria.trim() || null,
      descripcion: descripcion.trim() || null,
      zona_cobertura: zonaCobertura.trim() || null,
      telefono: telefono.trim() || null,
      email: email.trim() || null,
    });
    setGuardando(false);

    if (errorUpsert) {
      setErrorForm(errorUpsert.message);
      return;
    }
    setEditando(false);
    cargar();
  };

  const visibles = fichas.filter(
    (f) =>
      (filtroRol === 'todos' || f.rol === filtroRol) &&
      coincide(busqueda, f.nombre_mostrar, f.categoria, f.descripcion, f.zona_cobertura),
  );

  if (cargando) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <ActivityIndicator color={colors.action} />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader title="Directorio" />

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        refreshControl={
          <RefreshControl
            refreshing={refrescando}
            onRefresh={async () => {
              setRefrescando(true);
              await cargar();
              setRefrescando(false);
            }}
            colors={[colors.action]}
          />
        }
      >
        {error !== null && (
          <View className="bg-errorTint rounded-lg px-3 py-2 mb-3 flex-row items-center gap-2">
            <Feather name="alert-circle" size={16} color={colors.error} />
            <Text className="text-error text-sm flex-1">{error}</Text>
          </View>
        )}

        {/* Mi ficha */}
        {puedeTenerFicha && (
        <View className="bg-surface rounded-2xl border border-border p-4 mb-5">
          <View className="flex-row justify-between items-center mb-3">
            <Text className="text-ink text-xs font-sansBold uppercase" style={{ letterSpacing: 1 }}>
              Mi ficha
            </Text>
            {!editando && (
              <Pressable onPress={() => setEditando(true)} className="flex-row items-center gap-1">
                <Feather name="edit-2" size={12} color={colors.action} />
                <Text className="text-action text-xs font-sansSemiBold">{miFicha ? 'Editar' : 'Crear ficha'}</Text>
              </Pressable>
            )}
          </View>

          {editando ? (
            <>
              {errorForm !== null && (
                <View className="bg-errorTint rounded-lg px-3 py-2 mb-3 flex-row items-center gap-2">
                  <Feather name="alert-circle" size={16} color={colors.error} />
                  <Text className="text-error text-sm flex-1">{errorForm}</Text>
                </View>
              )}

              <Text className="text-ink text-xs font-sansSemiBold mb-1">Nombre a mostrar *</Text>
              <View className="bg-canvas border border-border rounded-xl px-3 mb-3">
                <TextInput
                  value={nombreMostrar}
                  onChangeText={setNombreMostrar}
                  placeholder="Tu nombre o el de tu empresa"
                  placeholderTextColor={colors.inkSubtle}
                  editable={!guardando}
                  className="py-3 text-ink"
                />
              </View>

              <Text className="text-ink text-xs font-sansSemiBold mb-1">Categoría</Text>
              <View className="bg-canvas border border-border rounded-xl px-3 mb-3">
                <TextInput
                  value={categoria}
                  onChangeText={setCategoria}
                  placeholder="Ej: Materiales de construcción, dirección de obra..."
                  placeholderTextColor={colors.inkSubtle}
                  editable={!guardando}
                  className="py-3 text-ink"
                />
              </View>

              <Text className="text-ink text-xs font-sansSemiBold mb-1">Descripción</Text>
              <View className="bg-canvas border border-border rounded-xl px-3 mb-3">
                <TextInput
                  value={descripcion}
                  onChangeText={setDescripcion}
                  multiline
                  numberOfLines={3}
                  placeholder="Qué ofreces"
                  placeholderTextColor={colors.inkSubtle}
                  editable={!guardando}
                  className="py-3 text-ink"
                  style={{ minHeight: 70, textAlignVertical: 'top' }}
                />
              </View>

              <Text className="text-ink text-xs font-sansSemiBold mb-1">Zona de cobertura</Text>
              <View className="bg-canvas border border-border rounded-xl px-3 mb-3">
                <TextInput
                  value={zonaCobertura}
                  onChangeText={setZonaCobertura}
                  placeholder="Ej: Albacete y provincia"
                  placeholderTextColor={colors.inkSubtle}
                  editable={!guardando}
                  className="py-3 text-ink"
                />
              </View>

              <Text className="text-ink text-xs font-sansSemiBold mb-1">Teléfono</Text>
              <View className="bg-canvas border border-border rounded-xl px-3 mb-3">
                <TextInput
                  value={telefono}
                  onChangeText={setTelefono}
                  keyboardType="phone-pad"
                  placeholder="612 345 678"
                  placeholderTextColor={colors.inkSubtle}
                  editable={!guardando}
                  className="py-3 text-ink"
                />
              </View>

              <Text className="text-ink text-xs font-sansSemiBold mb-1">Email</Text>
              <View className="bg-canvas border border-border rounded-xl px-3 mb-4">
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  placeholder="contacto@email.com"
                  placeholderTextColor={colors.inkSubtle}
                  editable={!guardando}
                  className="py-3 text-ink"
                />
              </View>

              <View className="flex-row gap-2">
                <Pressable
                  onPress={() => setEditando(false)}
                  disabled={guardando}
                  className="flex-1 border border-border rounded-lg py-2.5 items-center"
                >
                  <Text className="text-inkMuted text-xs font-sansSemiBold">Cancelar</Text>
                </Pressable>
                <Pressable
                  onPress={handleGuardarFicha}
                  disabled={guardando}
                  className="flex-1 bg-action rounded-lg py-2.5 items-center flex-row justify-center gap-1.5"
                >
                  {guardando ? (
                    <ActivityIndicator size="small" color={colors.white} />
                  ) : (
                    <Feather name="check" size={13} color={colors.white} />
                  )}
                  <Text className="text-white text-xs font-sansBold">Guardar</Text>
                </Pressable>
              </View>
            </>
          ) : miFicha === null ? (
            <Text className="text-inkMuted text-sm">
              Todavía no tienes ficha. Créala para que otras cuentas de OH Conecta te encuentren.
            </Text>
          ) : (
            <View>
              <Text className="text-ink text-sm font-sansBold">{miFicha.nombre_mostrar}</Text>
              {miFicha.categoria !== null && <Text className="text-inkMuted text-xs mt-0.5">{miFicha.categoria}</Text>}
              {miFicha.descripcion !== null && (
                <Text className="text-inkMuted text-xs mt-1.5">{miFicha.descripcion}</Text>
              )}
            </View>
          )}
        </View>
        )}

        {/* Directorio completo */}
        <Text className="text-ink text-xs font-sansBold uppercase mb-2" style={{ letterSpacing: 1 }}>
          Directorio
        </Text>
        {fichas.length > 0 && (
          <BuscadorFiltros
            busqueda={busqueda}
            onBusqueda={setBusqueda}
            placeholder="Buscar por nombre, categoría o zona"
            opciones={[
              { clave: 'todos', etiqueta: 'Todos' },
              { clave: 'proveedor', etiqueta: 'Proveedores' },
              { clave: 'arquitecto', etiqueta: 'Arquitectos' },
              { clave: 'profesional', etiqueta: 'Profesionales' },
            ]}
            seleccion={filtroRol}
            onSeleccion={setFiltroRol}
          />
        )}

        {fichas.length === 0 ? (
          <Text className="text-inkMuted text-sm">Todavía no hay ninguna ficha publicada.</Text>
        ) : visibles.length === 0 ? (
          <Text className="text-inkMuted text-sm">Ninguna ficha coincide con tu búsqueda.</Text>
        ) : (
          <View className="gap-2.5">
            {visibles.map((ficha) => (
              <View key={ficha.profile_id} className="bg-surface rounded-xl border border-border p-3.5">
                <View className="flex-row justify-between items-start">
                  <Text className="text-ink text-sm font-sansBold flex-1 pr-2">{ficha.nombre_mostrar}</Text>
                  <View className="bg-actionTint rounded-md px-2 py-0.5">
                    <Text className="text-action text-[10px] font-sansBold">
                      {ETIQUETA_ROL[ficha.rol] ?? ficha.rol}
                    </Text>
                  </View>
                </View>
                {ficha.categoria !== null && <Text className="text-inkMuted text-xs mt-1">{ficha.categoria}</Text>}
                {ficha.descripcion !== null && (
                  <Text className="text-inkMuted text-xs mt-1.5">{ficha.descripcion}</Text>
                )}
                <View className="flex-row items-center flex-wrap gap-x-3 gap-y-1 mt-2 pt-2 border-t border-border">
                  {ficha.zona_cobertura !== null && (
                    <View className="flex-row items-center gap-1">
                      <Feather name="map-pin" size={10} color={colors.inkMuted} />
                      <Text className="text-inkMuted text-xs">{ficha.zona_cobertura}</Text>
                    </View>
                  )}
                  {ficha.telefono !== null && (
                    <Text className="text-action text-[11px] font-sansSemiBold">{ficha.telefono}</Text>
                  )}
                  {ficha.email !== null && (
                    <Text className="text-action text-[11px] font-sansSemiBold">{ficha.email}</Text>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}