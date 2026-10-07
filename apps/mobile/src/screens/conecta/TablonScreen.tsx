import { useCallback, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, RefreshControl, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { colors } from '../../design-system/tokens';
import ScreenHeader from '../../components/ScreenHeader';
import BuscadorFiltros from '../../components/BuscadorFiltros';
import { coincide } from '../../utils/texto';

type Publicacion = {
  id: string;
  autor_id: string;
  tipo: 'necesidad' | 'aviso';
  titulo: string;
  descripcion: string | null;
  categoria: string | null;
  ubicacion: string | null;
  contacto_telefono: string | null;
  contacto_email: string | null;
  created_at: string;
  profiles: { nombre_completo: string | null } | null;
};

const ETIQUETA_TIPO: Record<string, string> = { necesidad: 'Necesidad', aviso: 'Aviso' };

// userId es opcional: solo lo necesita quien PUBLICA. Los Oficios solo leen el Tablón.
export default function TablonScreen({ rol, userId }: { rol: string; userId?: string }) {
  const puedePublicar = rol === 'promotor' || rol === 'constructora' || rol === 'administrador';
  const tipoAPublicar: 'necesidad' | 'aviso' = rol === 'administrador' ? 'aviso' : 'necesidad';

  const [publicaciones, setPublicaciones] = useState<Publicacion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [mostrandoForm, setMostrandoForm] = useState(false);
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [categoria, setCategoria] = useState('');
  const [ubicacion, setUbicacion] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [publicando, setPublicando] = useState(false);
  const [errorForm, setErrorForm] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('todos');

  const cargar = useCallback(async () => {
    setError(null);
    const { data, error: errorSelect } = await supabase
      .from('publicaciones_tablon')
      .select(
        'id, autor_id, tipo, titulo, descripcion, categoria, ubicacion, contacto_telefono, contacto_email, created_at, profiles(nombre_completo)',
      )
      .order('created_at', { ascending: false });

    if (errorSelect) {
      setError(errorSelect.message);
    } else {
      setPublicaciones((data as unknown as Publicacion[] | null) ?? []);
    }
    setCargando(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [cargar]),
  );

  const handlePublicar = async () => {
    setErrorForm(null);
    if (titulo.trim().length < 3) {
      setErrorForm('Escribe un título.');
      return;
    }

    if (userId === undefined) return;

    setPublicando(true);
    const { error: errorInsert } = await supabase.from('publicaciones_tablon').insert({
      autor_id: userId,
      tipo: tipoAPublicar,
      titulo: titulo.trim(),
      descripcion: descripcion.trim() || null,
      categoria: categoria.trim() || null,
      ubicacion: ubicacion.trim() || null,
      contacto_telefono: telefono.trim() || null,
      contacto_email: email.trim() || null,
    });
    setPublicando(false);

    if (errorInsert) {
      setErrorForm(errorInsert.message);
      return;
    }

    setTitulo('');
    setDescripcion('');
    setCategoria('');
    setUbicacion('');
    setTelefono('');
    setEmail('');
    setMostrandoForm(false);
    cargar();
  };

  const visibles = publicaciones.filter(
    (p) =>
      (filtroTipo === 'todos' || p.tipo === filtroTipo) &&
      coincide(busqueda, p.titulo, p.descripcion, p.categoria, p.ubicacion, p.profiles?.nombre_completo),
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
      <ScreenHeader title="Tablón" />

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

        {puedePublicar && (
          <View>
            <Pressable
              onPress={() => setMostrandoForm((v) => !v)}
              className="bg-action rounded-xl py-3 items-center flex-row justify-center gap-2 mb-3"
            >
              <Feather name={mostrandoForm ? 'x' : 'plus'} size={16} color={colors.white} />
              <Text className="text-white font-sansBold text-sm">
                {mostrandoForm ? 'Cancelar' : tipoAPublicar === 'aviso' ? 'Publicar aviso' : 'Publicar necesidad'}
              </Text>
            </Pressable>

            {mostrandoForm && (
              <View className="bg-surface rounded-2xl border border-border p-4 mb-3">
                {errorForm !== null && (
                  <View className="bg-errorTint rounded-lg px-3 py-2 mb-3 flex-row items-center gap-2">
                    <Feather name="alert-circle" size={16} color={colors.error} />
                    <Text className="text-error text-sm flex-1">{errorForm}</Text>
                  </View>
                )}

                <Text className="text-ink text-xs font-sansSemiBold mb-1">Título *</Text>
                <View className="bg-canvas border border-border rounded-xl px-3 mb-3">
                  <TextInput
                    value={titulo}
                    onChangeText={setTitulo}
                    placeholder={tipoAPublicar === 'aviso' ? 'Título del aviso' : 'Qué necesitas'}
                    placeholderTextColor={colors.inkSubtle}
                    editable={!publicando}
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
                    placeholder="Cuenta los detalles"
                    placeholderTextColor={colors.inkSubtle}
                    editable={!publicando}
                    className="py-3 text-ink"
                    style={{ minHeight: 70, textAlignVertical: 'top' }}
                  />
                </View>

                {tipoAPublicar === 'necesidad' && (
                  <>
                    <Text className="text-ink text-xs font-sansSemiBold mb-1">Categoría / especialidad</Text>
                    <View className="bg-canvas border border-border rounded-xl px-3 mb-3">
                      <TextInput
                        value={categoria}
                        onChangeText={setCategoria}
                        placeholder="Ej: Electricidad, estructura, piscinas..."
                        placeholderTextColor={colors.inkSubtle}
                        editable={!publicando}
                        className="py-3 text-ink"
                      />
                    </View>

                    <Text className="text-ink text-xs font-sansSemiBold mb-1">Ubicación</Text>
                    <View className="bg-canvas border border-border rounded-xl px-3 mb-3">
                      <TextInput
                        value={ubicacion}
                        onChangeText={setUbicacion}
                        placeholder="Ciudad o zona"
                        placeholderTextColor={colors.inkSubtle}
                        editable={!publicando}
                        className="py-3 text-ink"
                      />
                    </View>
                  </>
                )}

                <Text className="text-ink text-xs font-sansSemiBold mb-1">Teléfono de contacto</Text>
                <View className="bg-canvas border border-border rounded-xl px-3 mb-3">
                  <TextInput
                    value={telefono}
                    onChangeText={setTelefono}
                    keyboardType="phone-pad"
                    placeholder="612 345 678"
                    placeholderTextColor={colors.inkSubtle}
                    editable={!publicando}
                    className="py-3 text-ink"
                  />
                </View>

                <Text className="text-ink text-xs font-sansSemiBold mb-1">Email de contacto</Text>
                <View className="bg-canvas border border-border rounded-xl px-3 mb-4">
                  <TextInput
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    placeholder="contacto@email.com"
                    placeholderTextColor={colors.inkSubtle}
                    editable={!publicando}
                    className="py-3 text-ink"
                  />
                </View>

                <Pressable
                  onPress={handlePublicar}
                  disabled={publicando}
                  className="bg-action rounded-xl py-3 items-center"
                >
                  <View className="flex-row items-center gap-2">
                    {publicando ? (
                      <ActivityIndicator color={colors.white} />
                    ) : (
                      <Feather name="send" size={15} color={colors.white} />
                    )}
                    <Text className="text-white font-sansBold text-sm">Publicar</Text>
                  </View>
                </Pressable>
              </View>
            )}
          </View>
        )}

        {publicaciones.length > 0 && (
          <BuscadorFiltros
            busqueda={busqueda}
            onBusqueda={setBusqueda}
            placeholder="Buscar por título, categoría o zona"
            opciones={[
              { clave: 'todos', etiqueta: 'Todo' },
              { clave: 'necesidad', etiqueta: 'Necesidades' },
              { clave: 'aviso', etiqueta: 'Avisos' },
            ]}
            seleccion={filtroTipo}
            onSeleccion={setFiltroTipo}
          />
        )}

        {publicaciones.length === 0 ? (
          <Text className="text-inkMuted text-sm">Todavía no hay nada publicado en el tablón.</Text>
        ) : visibles.length === 0 ? (
          <Text className="text-inkMuted text-sm">Ninguna publicación coincide con tu búsqueda.</Text>
        ) : (
          <View className="gap-2.5">
            {visibles.map((pub) => (
              <View key={pub.id} className="bg-surface rounded-xl border border-border p-3.5">
                <View className="flex-row justify-between items-start">
                  <Text className="text-ink text-sm font-sansBold flex-1 pr-2">{pub.titulo}</Text>
                  <View
                    className={`rounded-md px-2 py-0.5 ${pub.tipo === 'aviso' ? 'bg-warningTint' : 'bg-actionTint'}`}
                  >
                    <Text
                      className={`text-[10px] font-sansBold ${pub.tipo === 'aviso' ? 'text-warning' : 'text-action'}`}
                    >
                      {ETIQUETA_TIPO[pub.tipo]}
                    </Text>
                  </View>
                </View>
                {pub.descripcion !== null && (
                  <Text className="text-inkMuted text-xs mt-1.5">{pub.descripcion}</Text>
                )}
                <View className="flex-row items-center flex-wrap gap-x-3 gap-y-1 mt-2">
                  {pub.categoria !== null && (
                    <View className="flex-row items-center gap-1">
                      <Feather name="tag" size={10} color={colors.inkMuted} />
                      <Text className="text-inkMuted text-xs">{pub.categoria}</Text>
                    </View>
                  )}
                  {pub.ubicacion !== null && (
                    <View className="flex-row items-center gap-1">
                      <Feather name="map-pin" size={10} color={colors.inkMuted} />
                      <Text className="text-inkMuted text-xs">{pub.ubicacion}</Text>
                    </View>
                  )}
                </View>
                <View className="flex-row items-center flex-wrap gap-x-3 gap-y-1 mt-1.5 pt-2 border-t border-border">
                  <Text className="text-inkMuted text-[11px]">{pub.profiles?.nombre_completo ?? 'OH Conecta'}</Text>
                  {pub.contacto_telefono !== null && (
                    <Text className="text-action text-[11px] font-sansSemiBold">{pub.contacto_telefono}</Text>
                  )}
                  {pub.contacto_email !== null && (
                    <Text className="text-action text-[11px] font-sansSemiBold">{pub.contacto_email}</Text>
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