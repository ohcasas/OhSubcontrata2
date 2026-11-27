import { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Image, Linking } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../../design-system/tokens';
import ScreenHeader from '../../components/ScreenHeader';
import { mensajeDeError } from '../../services/peticiones';
import { escribirAProveedor, listarProveedores, type ProveedorCatalogo } from '../../services/catalogo';
import { iconoCatalogo } from './iconosCatalogo';

const SOMBRA = {
  shadowColor: '#0B1F35',
  shadowOffset: { width: 0, height: 6 },
  shadowOpacity: 0.1,
  shadowRadius: 16,
  elevation: 4,
};

/**
 * Directorio de proveedores del catálogo. Administración decide quién aparece (solo con su consentimiento) y si se
 * enseñan sus datos de contacto. Sin puntuaciones ni ránking: el orden lo fija Administración.
 * Escribir a un proveedor envía el mensaje a Administración, que lo hace llegar; la app no manda correos.
 */
export default function ProveedoresCatalogo({ onVolver, abrirId }: { onVolver: () => void; abrirId?: string }) {
  const [lista, setLista] = useState<ProveedorCatalogo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<ProveedorCatalogo | null>(null);

  useEffect(() => {
    let vivo = true;
    listarProveedores(null)
      .then((l) => {
        if (!vivo) return;
        setLista(l);
        // Venir desde Inicio o Buscar con un proveedor ya elegido: se abre directamente
        if (abrirId !== undefined) setAbierto(l.find((x) => x.id === abrirId) ?? null);
      })
      .catch((e) => vivo && setError(mensajeDeError(e)))
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
    };
  }, []);

  const oficios = useMemo(() => {
    const m = new Map<string, string>();
    lista.forEach((p) => p.categoria !== null && m.set(p.categoria, p.categoria_nombre ?? p.categoria));
    return [...m.entries()];
  }, [lista]);
  const visibles = lista.filter((p) => filtro === null || p.categoria === filtro);

  if (abierto !== null) return <Escribir proveedor={abierto} onVolver={() => setAbierto(null)} />;

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader title="Proveedores" subtitle="Profesionales para tu obra" />
      <Pressable onPress={onVolver} accessibilityRole="button" accessibilityLabel="Atrás" className="flex-row items-center gap-1 px-4 pb-2">
        <Feather name="chevron-left" size={18} color={colors.action} />
        <Text className="text-action text-sm font-sansSemiBold">Atrás</Text>
      </Pressable>
      {cargando ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.action} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
          {error !== null && (
            <View className="bg-errorTint rounded-lg px-3 py-2 mb-3 flex-row items-center gap-2">
              <Feather name="alert-circle" size={16} color={colors.error} />
              <Text className="text-error text-sm flex-1">{error}</Text>
            </View>
          )}
          {oficios.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
              {[[null, 'Todos'] as const, ...oficios].map(([c, n]) => {
                const activo = filtro === c;
                return (
                  <Pressable
                    key={c ?? 'todos'}
                    onPress={() => setFiltro(c)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: activo }}
                    className={`rounded-full px-4 py-2 mr-2 border ${activo ? 'bg-action border-action' : 'bg-white border-border'}`}
                  >
                    <Text className={`text-xs font-sansSemiBold ${activo ? 'text-white' : 'text-ink'}`}>{n}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
          {visibles.length === 0 && error === null ? (
            <Text className="text-inkMuted text-sm leading-relaxed">Todavía no hay proveedores publicados. Vuelve pronto.</Text>
          ) : (
            <View className="gap-3">
              {visibles.map((p) => (
                <Pressable
                  key={p.id}
                  onPress={() => setAbierto(p)}
                  accessibilityRole="button"
                  accessibilityLabel={p.nombre}
                  className="bg-white/80 rounded-3xl border border-white p-3 flex-row items-center"
                  style={SOMBRA}
                >
                  <Image source={iconoCatalogo(null, p.categoria)} style={{ width: 56, height: 56 }} resizeMode="contain" />
                  <View className="flex-1 px-3">
                    <Text className="text-ink text-[15px] font-sansBold">{p.nombre}</Text>
                    <Text className="text-inkMuted text-xs mt-0.5">
                      {[p.categoria_nombre, p.zona].filter((x) => x !== null && x !== '').join(' · ')}
                    </Text>
                    {p.descripcion !== null && p.descripcion !== '' && (
                      <Text className="text-inkMuted text-xs mt-1" numberOfLines={2}>
                        {p.descripcion}
                      </Text>
                    )}
                  </View>
                  <Feather name="chevron-right" size={20} color={colors.inkMuted} />
                </Pressable>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function Escribir({ proveedor, onVolver }: { proveedor: ProveedorCatalogo; onVolver: () => void }) {
  const [mensaje, setMensaje] = useState('');
  const [acepta, setAcepta] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [hecho, setHecho] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valido = mensaje.trim().length >= 5 && acepta;
  const hayContacto = proveedor.telefono !== null || proveedor.email !== null || proveedor.web !== null;

  const enviar = async () => {
    setEnviando(true);
    setError(null);
    try {
      await escribirAProveedor(proveedor.id, mensaje.trim(), acepta);
      setHecho(true);
    } catch (e) {
      setError(mensajeDeError(e));
    }
    setEnviando(false);
  };
  const abrir = (url: string) => {
    Linking.openURL(url).catch(() => setError('No se ha podido abrir. Inténtalo desde tu teléfono.'));
  };

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader title={proveedor.nombre} subtitle={[proveedor.categoria_nombre, proveedor.zona].filter((x) => x !== null && x !== '').join(' · ')} />
      <Pressable onPress={onVolver} accessibilityRole="button" accessibilityLabel="Proveedores" className="flex-row items-center gap-1 px-4 pb-2">
        <Feather name="chevron-left" size={18} color={colors.action} />
        <Text className="text-action text-sm font-sansSemiBold">Proveedores</Text>
      </Pressable>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
        {proveedor.descripcion !== null && proveedor.descripcion !== '' && <Text className="text-ink text-sm mb-4">{proveedor.descripcion}</Text>}
        {hayContacto && (
          <View className="bg-white/80 rounded-3xl border border-white p-3 mb-4 gap-2" style={SOMBRA}>
            {proveedor.telefono !== null && (
              <Pressable onPress={() => abrir(`tel:${proveedor.telefono}`)} accessibilityRole="button" className="flex-row items-center gap-2">
                <Feather name="phone" size={16} color={colors.action} />
                <Text className="text-action text-sm font-sansSemiBold">{proveedor.telefono}</Text>
              </Pressable>
            )}
            {proveedor.email !== null && (
              <Pressable onPress={() => abrir(`mailto:${proveedor.email}`)} accessibilityRole="button" className="flex-row items-center gap-2">
                <Feather name="mail" size={16} color={colors.action} />
                <Text className="text-action text-sm font-sansSemiBold">{proveedor.email}</Text>
              </Pressable>
            )}
            {proveedor.web !== null && (
              <Pressable onPress={() => abrir(proveedor.web as string)} accessibilityRole="button" className="flex-row items-center gap-2">
                <Feather name="globe" size={16} color={colors.action} />
                <Text className="text-action text-sm font-sansSemiBold">{proveedor.web}</Text>
              </Pressable>
            )}
          </View>
        )}
        {hecho ? (
          <View className="bg-white/80 rounded-3xl border border-white p-5 items-center" style={SOMBRA}>
            <Feather name="check-circle" size={36} color={colors.success} />
            <Text className="text-ink text-base font-sansBold mt-3 text-center">Mensaje enviado</Text>
            <Text className="text-inkMuted text-sm mt-1 text-center">3B Conecta se lo hará llegar a {proveedor.nombre}.</Text>
          </View>
        ) : (
          <>
            {error !== null && (
              <View className="bg-errorTint rounded-lg px-3 py-2 mb-3 flex-row items-center gap-2">
                <Feather name="alert-circle" size={16} color={colors.error} />
                <Text className="text-error text-sm flex-1">{error}</Text>
              </View>
            )}
            <Text className="text-ink text-sm font-sansBold mb-2">Escríbele</Text>
            <TextInput
              value={mensaje}
              onChangeText={setMensaje}
              multiline
              maxLength={1000}
              placeholder="Cuéntale qué necesitas, dónde y para cuándo."
              accessibilityLabel="Mensaje"
              className="bg-white border border-border rounded-2xl p-3 text-ink text-sm"
              style={{ minHeight: 120, textAlignVertical: 'top' }}
            />
            <Text className="text-inkSubtle text-[13px] mt-1">No escribas números de tarjeta ni de cuenta.</Text>
            <Pressable onPress={() => setAcepta((a) => !a)} accessibilityRole="checkbox" accessibilityState={{ checked: acepta }} className="flex-row items-start gap-2 mt-4">
              <View className={`rounded-md items-center justify-center ${acepta ? 'bg-action' : 'border border-borderStrong bg-white'}`} style={{ width: 22, height: 22, marginTop: 1 }}>
                {acepta && <Feather name="check" size={14} color={colors.white} />}
              </View>
              <Text className="text-ink text-[13px] flex-1">
                Acepto que 3B Conecta comparta mi mensaje y mi teléfono con este proveedor para que pueda contactarme.
              </Text>
            </Pressable>
            <Pressable
              onPress={enviar}
              disabled={!valido || enviando}
              accessibilityRole="button"
              className={`rounded-full py-3.5 items-center mt-4 ${!valido || enviando ? 'bg-border' : 'bg-action'}`}
              style={SOMBRA}
            >
              {enviando ? <ActivityIndicator color={colors.white} /> : <Text className="text-white font-sansBold text-sm">Enviar mensaje</Text>}
            </Pressable>
          </>
        )}
      </ScrollView>
    </View>
  );
}