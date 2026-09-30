import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Image,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Feather } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { supabase } from '../../services/supabase';
import { subirImagenPublica } from '../../services/storage';
import { colors } from '../../design-system/tokens';
import ScreenHeader from '../../components/ScreenHeader';

type NombreIcono = ComponentProps<typeof Feather>['name'];

type Kpis = {
  licitacionesActivas: number;
  presupuestoComprometido: number;
  postulacionesPendientes: number;
  empresasRegistradas: number;
};

const TARJETAS_KPI: {
  key: keyof Kpis;
  etiqueta: string;
  icono: NombreIcono;
  formato: (v: number) => string;
}[] = [
  { key: 'licitacionesActivas', etiqueta: 'Licitaciones activas', icono: 'briefcase', formato: (v) => `${v}` },
  {
    key: 'presupuestoComprometido',
    etiqueta: 'Presupuesto comprometido',
    icono: 'dollar-sign',
    formato: (v) => `${(v / 1000).toFixed(1)}k €`,
  },
  { key: 'postulacionesPendientes', etiqueta: 'Postulaciones pendientes', icono: 'inbox', formato: (v) => `${v}` },
  { key: 'empresasRegistradas', etiqueta: 'Empresas registradas', icono: 'users', formato: (v) => `${v}` },
];

export default function PerfilAdminScreen() {
  const [usuarioId, setUsuarioId] = useState<string | null>(null);
  const [nombreCompleto, setNombreCompleto] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [rol, setRol] = useState<'admin' | 'superadmin' | null>(null);
  const [bio, setBio] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [bioEnEdicion, setBioEnEdicion] = useState('');
  const [editandoBio, setEditandoBio] = useState(false);
  const [guardandoBio, setGuardandoBio] = useState(false);
  const [subiendoAvatar, setSubiendoAvatar] = useState(false);
  const [falloAvatar, setFalloAvatar] = useState(false);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cerrandoSesion, setCerrandoSesion] = useState(false);

  const cargarTodo = useCallback(async () => {
    setError(null);

    const { data: userData } = await supabase.auth.getUser();
    const usuarioIdActual = userData.user?.id ?? null;
    setUsuarioId(usuarioIdActual);
    // El email de auth.getUser() siempre está disponible si hay sesión —
    // se usa como red de seguridad aunque falle la consulta a profiles.
    setEmail(userData.user?.email ?? null);

    if (usuarioIdActual) {
      const { data: perfilData, error: errorPerfil } = await supabase
        .from('profiles')
        .select('nombre_completo, email, role, bio, avatar_url')
        .eq('id', usuarioIdActual)
        .single();

      if (errorPerfil) {
        console.warn('No se pudo cargar el perfil de admin:', errorPerfil.message);
      } else if (perfilData) {
        setNombreCompleto(perfilData.nombre_completo ?? null);
        if (perfilData.email) setEmail(perfilData.email);
        setRol((perfilData.role as 'admin' | 'superadmin' | null) ?? null);
        setBio(perfilData.bio ?? null);
        setAvatarUrl(perfilData.avatar_url ?? null);
      }
    }

    const [
      { count: licitacionesActivas },
      { data: presupuestosAbiertos },
      { count: postulacionesPendientes },
      { count: empresasRegistradas },
    ] = await Promise.all([
      supabase.from('obras').select('*', { count: 'exact', head: true }).eq('estado', 'abierta'),
      supabase.from('obras').select('presupuesto').eq('estado', 'abierta'),
      supabase
        .from('postulaciones')
        .select('*', { count: 'exact', head: true })
        .in('estado', ['enviada', 'en_revision']),
      supabase.from('empresas_subcontratistas').select('*', { count: 'exact', head: true }),
    ]);

    const presupuestoComprometido = (presupuestosAbiertos ?? []).reduce(
      (suma, o) => suma + Number((o as { presupuesto: number }).presupuesto),
      0,
    );

    setKpis({
      licitacionesActivas: licitacionesActivas ?? 0,
      presupuestoComprometido,
      postulacionesPendientes: postulacionesPendientes ?? 0,
      empresasRegistradas: empresasRegistradas ?? 0,
    });
  }, []);

  useEffect(() => {
    setCargando(true);
    cargarTodo()
      .catch(() => setError('No se han podido cargar los datos del panel.'))
      .finally(() => setCargando(false));
  }, [cargarTodo]);

  const handleRefrescar = async () => {
    setRefrescando(true);
    await cargarTodo();
    setRefrescando(false);
  };

  const handleCambiarAvatar = async () => {
    if (usuarioId === null) return;
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
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (resultado.canceled) return;
    const asset = resultado.assets[0];

    setSubiendoAvatar(true);
    try {
      const url = await subirImagenPublica(
        'avatares',
        usuarioId,
        asset.uri,
        asset.mimeType ?? 'image/jpeg',
      );
      const { error: errorUpdate } = await supabase
        .from('profiles')
        .update({ avatar_url: url })
        .eq('id', usuarioId);
      if (errorUpdate) throw errorUpdate;
      setAvatarUrl(url);
      setFalloAvatar(false);
    } catch {
      setError('No se ha podido actualizar tu foto de perfil.');
    } finally {
      setSubiendoAvatar(false);
    }
  };

  const handleEmpezarEdicionBio = () => {
    setBioEnEdicion(bio ?? '');
    setEditandoBio(true);
  };

  const handleGuardarBio = async () => {
    if (usuarioId === null) return;
    setGuardandoBio(true);
    const { error: errorUpdate } = await supabase
      .from('profiles')
      .update({ bio: bioEnEdicion.trim() || null })
      .eq('id', usuarioId);
    setGuardandoBio(false);

    if (!errorUpdate) {
      setBio(bioEnEdicion.trim() || null);
      setEditandoBio(false);
    }
  };

  const handleCerrarSesion = async () => {
    setCerrandoSesion(true);
    await supabase.auth.signOut();
    // RootNavigator detecta la sesión nula sola y vuelve al Login.
  };

  if (cargando) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <ActivityIndicator color={colors.action} />
      </View>
    );
  }

  const nombreAMostrar = nombreCompleto ?? email ?? 'Administrador';
  const iniciales = (nombreCompleto ?? email ?? '?')
    .split(/[ @]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader title="Perfil" subtitle={nombreCompleto ?? undefined} />

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        refreshControl={
          <RefreshControl refreshing={refrescando} onRefresh={handleRefrescar} colors={[colors.action]} />
        }
      >
        {error !== null && (
          <View className="bg-errorTint rounded-lg px-3 py-2 mb-3 flex-row items-center gap-2">
            <Feather name="alert-circle" size={17} color={colors.error} />
            <Text className="text-error text-sm flex-1">{error}</Text>
          </View>
        )}

        {/* Cabecera de identidad */}
        <View className="bg-surface rounded-xl border border-border p-3.5 flex-row items-center mb-3.5">
          <Pressable onPress={handleCambiarAvatar} disabled={subiendoAvatar} className="mr-3.5">
            {avatarUrl && !falloAvatar ? (
              <Image
                source={{ uri: avatarUrl }}
                style={{ width: 64, height: 64, borderRadius: 12 }}
                resizeMode="cover"
                onError={() => setFalloAvatar(true)}
              />
            ) : (
              <View className="w-16 h-16 rounded-xl bg-action items-center justify-center">
                <Text className="text-white text-xl font-sansBold">{iniciales}</Text>
              </View>
            )}
            <View className="absolute -bottom-1 -right-1 bg-surface rounded-full p-1.5 border border-border">
              {subiendoAvatar ? (
                <ActivityIndicator size="small" color={colors.action} />
              ) : (
                <Feather name="camera" size={13} color={colors.inkMuted} />
              )}
            </View>
          </Pressable>
          <View className="flex-1">
            <Text className="text-ink text-base font-sansBold">{nombreAMostrar}</Text>
            {email !== null && (
              <View className="flex-row items-center gap-1 mt-0.5">
                <Feather name="mail" size={13} color={colors.inkMuted} />
                <Text className="text-inkMuted text-xs">{email}</Text>
              </View>
            )}
            {rol !== null && (
              <View className="flex-row items-center gap-1 bg-actionTint rounded-md px-2 py-0.5 mt-1.5 self-start">
                <Feather name="shield" size={12} color={colors.action} />
                <Text className="text-action text-[12px] font-sansBold">
                  {rol === 'superadmin' ? 'Superadministrador' : 'Administrador'}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Biografía / descripción */}
        <View className="bg-surface rounded-xl border border-border p-3.5 mb-3.5">
          <View className="flex-row justify-between items-center mb-2">
            <Text className="text-ink text-xs font-sansBold uppercase" style={{ letterSpacing: 1 }}>
              Sobre mí
            </Text>
            {!editandoBio && (
              <Pressable onPress={handleEmpezarEdicionBio} className="flex-row items-center gap-1">
                <Feather name="edit-2" size={14} color={colors.action} />
                <Text className="text-action text-xs font-sansSemiBold">
                  {bio !== null ? 'Editar' : 'Añadir'}
                </Text>
              </Pressable>
            )}
          </View>

          {editandoBio ? (
            <>
              <TextInput
                value={bioEnEdicion}
                onChangeText={setBioEnEdicion}
                multiline
                numberOfLines={3}
                placeholder="Cuéntanos brevemente tu rol dentro de OH Contratas..."
                placeholderTextColor={colors.inkSubtle}
                editable={!guardandoBio}
                className="bg-surface border border-border rounded-xl px-3 py-2.5 text-ink text-sm"
                style={{ minHeight: 80, textAlignVertical: 'top' }}
              />
              <View className="flex-row gap-2 mt-2">
                <Pressable
                  onPress={() => setEditandoBio(false)}
                  disabled={guardandoBio}
                  className="flex-1 border border-border rounded-lg py-2 items-center"
                >
                  <Text className="text-inkMuted text-xs font-sansSemiBold">Cancelar</Text>
                </Pressable>
                <Pressable
                  onPress={handleGuardarBio}
                  disabled={guardandoBio}
                  className="flex-1 bg-action rounded-lg py-2 items-center flex-row justify-center gap-1.5"
                >
                  {guardandoBio ? (
                    <ActivityIndicator size="small" color={colors.white} />
                  ) : (
                    <Feather name="check" size={15} color={colors.white} />
                  )}
                  <Text className="text-white text-xs font-sansBold">Guardar</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <Text className="text-inkMuted text-sm leading-relaxed">
              {bio !== null && bio !== '' ? bio : 'Todavía no has añadido una descripción.'}
            </Text>
          )}
        </View>

        {kpis !== null && (
          <View className="flex-row flex-wrap gap-2.5">
            {TARJETAS_KPI.map((t) => (
              <View
                key={t.key}
                className="flex-1 basis-[45%] bg-surface rounded-xl border border-border p-3.5"
              >
                <View className="w-8 h-8 rounded-lg bg-canvas items-center justify-center mb-2">
                  <Feather name={t.icono} size={16} color={colors.action} />
                </View>
                <Text className="text-ink text-2xl font-sansBold">{t.formato(kpis[t.key])}</Text>
                <Text className="text-inkMuted text-xs mt-1">{t.etiqueta}</Text>
              </View>
            ))}
          </View>
        )}

        <Pressable
          onPress={handleCerrarSesion}
          disabled={cerrandoSesion}
          className="border border-error rounded-xl py-3 items-center mt-8"
        >
          <View className="flex-row items-center gap-2">
            {cerrandoSesion ? (
              <ActivityIndicator color={colors.error} />
            ) : (
              <Feather name="log-out" size={16} color={colors.error} />
            )}
            <Text className="text-error font-sansBold text-sm">Cerrar sesión</Text>
          </View>
        </Pressable>
      </ScrollView>
    </View>
  );
}