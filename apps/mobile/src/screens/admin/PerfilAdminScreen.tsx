import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, ActivityIndicator, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { supabase } from '../../services/supabase';
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
  const [nombreCompleto, setNombreCompleto] = useState<string | null>(null);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cerrandoSesion, setCerrandoSesion] = useState(false);

  const cargarTodo = useCallback(async () => {
    setError(null);

    const { data: userData } = await supabase.auth.getUser();
    const usuarioId = userData.user?.id;
    if (usuarioId) {
      const { data: perfilData } = await supabase
        .from('profiles')
        .select('nombre_completo')
        .eq('id', usuarioId)
        .single();
      setNombreCompleto(perfilData?.nombre_completo ?? null);
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

  const handleCerrarSesion = async () => {
    setCerrandoSesion(true);
    await supabase.auth.signOut();
    // RootNavigator detecta la sesión nula sola y vuelve al Login.
  };

  if (cargando) {
    return (
      <View className="flex-1 items-center justify-center bg-surface">
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-surface">
      <ScreenHeader title="Panel Administrador" subtitle={nombreCompleto ?? undefined} />

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        refreshControl={
          <RefreshControl refreshing={refrescando} onRefresh={handleRefrescar} colors={[colors.primary]} />
        }
      >
        {error !== null && (
          <View className="bg-errorContainer rounded-lg px-3 py-2 mb-3 flex-row items-center gap-2">
            <Feather name="alert-circle" size={16} color={colors.onErrorContainer} />
            <Text className="text-onErrorContainer text-sm flex-1">{error}</Text>
          </View>
        )}

        {kpis !== null && (
          <View className="flex-row flex-wrap gap-2.5">
            {TARJETAS_KPI.map((t) => (
              <View
                key={t.key}
                className="flex-1 basis-[45%] bg-surfaceContainerLowest rounded-xl border border-outlineVariant p-3.5"
              >
                <View className="w-8 h-8 rounded-lg bg-surfaceContainerLow items-center justify-center mb-2">
                  <Feather name={t.icono} size={15} color={colors.tertiary} />
                </View>
                <Text className="text-onSurface text-2xl font-extrabold">{t.formato(kpis[t.key])}</Text>
                <Text className="text-onSurfaceVariant text-xs mt-1">{t.etiqueta}</Text>
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
              <Feather name="log-out" size={15} color={colors.error} />
            )}
            <Text className="text-error font-bold text-sm">Cerrar sesión</Text>
          </View>
        </Pressable>
      </ScrollView>
    </View>
  );
}
