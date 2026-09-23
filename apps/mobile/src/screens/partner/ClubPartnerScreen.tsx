import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, ActivityIndicator, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { colors } from '../../design-system/tokens';
import ScreenHeader from '../../components/ScreenHeader';

type NivelPartner = 'bronce' | 'plata' | 'oro' | 'platino';

type Empresa = {
  id: string;
  nombre: string;
  nivel_partner: NivelPartner;
  puntos_disponibles: number;
};

type Movimiento = {
  id: string;
  tipo: 'ganancia' | 'canje' | 'ajuste';
  puntos: number;
  concepto: string;
  created_at: string;
};

type Recompensa = {
  id: string;
  nombre: string;
  descripcion: string | null;
  puntos_requeridos: number;
  categoria: string | null;
};

// Umbrales de nivel — regla de negocio que todavía no vive en la base de
// datos (no hay tabla de configuración para esto); de momento se fija aquí.
const ORDEN_NIVELES: NivelPartner[] = ['bronce', 'plata', 'oro', 'platino'];
const UMBRAL_NIVEL: Record<NivelPartner, number> = {
  bronce: 0,
  plata: 1000,
  oro: 2500,
  platino: 5000,
};
const ETIQUETA_NIVEL: Record<NivelPartner, string> = {
  bronce: 'Bronce',
  plata: 'Plata',
  oro: 'Oro',
  platino: 'Platino',
};

function calcularProgreso(puntos: number) {
  const nivelActualIndex = ORDEN_NIVELES.reduce(
    (acc, nivel, i) => (puntos >= UMBRAL_NIVEL[nivel] ? i : acc),
    0,
  );
  const nivelActual = ORDEN_NIVELES[nivelActualIndex];
  const siguienteNivel = ORDEN_NIVELES[nivelActualIndex + 1] ?? null;

  if (!siguienteNivel) {
    return { nivelActual, siguienteNivel: null, progreso: 1, puntosFaltan: 0 };
  }
  const umbralActual = UMBRAL_NIVEL[nivelActual];
  const umbralSiguiente = UMBRAL_NIVEL[siguienteNivel];
  const progreso = (puntos - umbralActual) / (umbralSiguiente - umbralActual);
  return {
    nivelActual,
    siguienteNivel,
    progreso: Math.min(Math.max(progreso, 0), 1),
    puntosFaltan: umbralSiguiente - puntos,
  };
}

export default function ClubPartnerScreen() {
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [catalogo, setCatalogo] = useState<Recompensa[]>([]);
  const [sinEmpresa, setSinEmpresa] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canjeandoId, setCanjeandoId] = useState<string | null>(null);
  const [mensajeCanje, setMensajeCanje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(
    null,
  );

  const cargarTodo = useCallback(async () => {
    setError(null);
    setMensajeCanje(null);

    const { data: userData } = await supabase.auth.getUser();
    const usuarioId = userData.user?.id;
    if (!usuarioId) return;

    const { data: perfilData } = await supabase
      .from('profiles')
      .select('empresa_id')
      .eq('id', usuarioId)
      .single();
    const empresaId = (perfilData?.empresa_id as string | null) ?? null;

    if (!empresaId) {
      setSinEmpresa(true);
      return;
    }
    setSinEmpresa(false);

    const [{ data: empresaData, error: errorEmpresa }, { data: movData }, { data: catData }] =
      await Promise.all([
        supabase
          .from('empresas_subcontratistas')
          .select('id, nombre, nivel_partner, puntos_disponibles')
          .eq('id', empresaId)
          .single(),
        supabase
          .from('club_partner_movimientos')
          .select('id, tipo, puntos, concepto, created_at')
          .eq('empresa_id', empresaId)
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('recompensas_catalogo')
          .select('id, nombre, descripcion, puntos_requeridos, categoria')
          .eq('activo', true)
          .order('puntos_requeridos', { ascending: true }),
      ]);

    if (errorEmpresa) {
      setError('No se han podido cargar tus datos de Club Partner.');
      return;
    }
    setEmpresa(empresaData as Empresa);
    setMovimientos((movData as Movimiento[] | null) ?? []);
    setCatalogo((catData as Recompensa[] | null) ?? []);
  }, []);

  useEffect(() => {
    setCargando(true);
    cargarTodo().finally(() => setCargando(false));
  }, [cargarTodo]);

  const handleRefrescar = async () => {
    setRefrescando(true);
    await cargarTodo();
    setRefrescando(false);
  };

  const handleCanjear = async (recompensa: Recompensa) => {
    setMensajeCanje(null);
    setCanjeandoId(recompensa.id);
    const { error: errorRpc } = await supabase.rpc('solicitar_canje', {
      p_recompensa_id: recompensa.id,
    });
    setCanjeandoId(null);

    if (errorRpc) {
      setMensajeCanje({
        tipo: 'error',
        texto:
          errorRpc.message.includes('No tienes suficientes')
            ? 'No tienes suficientes puntos para este canje.'
            : 'No se ha podido completar el canje. Inténtalo de nuevo.',
      });
      return;
    }
    setMensajeCanje({ tipo: 'ok', texto: `Canje de "${recompensa.nombre}" solicitado.` });
    await cargarTodo();
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
      <ScreenHeader title="Club OH Partner" />

      {sinEmpresa ? (
        <View className="items-center mt-16 px-6">
          <Feather name="briefcase" size={28} color={colors.outline} />
          <Text className="text-onSurface text-base font-semibold text-center mt-3">
            Tu usuario todavía no está vinculado a ninguna empresa subcontratista
          </Text>
          <Text className="text-onSurfaceVariant text-sm text-center mt-2">
            Contacta con OH Casas para poder ver tus puntos y recompensas.
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          refreshControl={
            <RefreshControl
              refreshing={refrescando}
              onRefresh={handleRefrescar}
              colors={[colors.primary]}
            />
          }
        >
          {error !== null && (
            <View className="bg-errorContainer rounded-lg px-3 py-2 mb-3 flex-row items-center gap-2">
              <Feather name="alert-circle" size={16} color={colors.onErrorContainer} />
              <Text className="text-onErrorContainer text-sm flex-1">{error}</Text>
            </View>
          )}

          {empresa !== null &&
            (() => {
              const { nivelActual, siguienteNivel, progreso, puntosFaltan } = calcularProgreso(
                empresa.puntos_disponibles,
              );
              return (
                <View className="bg-primary rounded-2xl p-4">
                  <View className="flex-row items-center justify-between">
                    <View className="flex-row items-center gap-1.5">
                      <Feather name="award" size={13} color={colors.accentGold} />
                      <Text className="text-onPrimary/70 text-xs font-bold uppercase tracking-wider">
                        Nivel actual
                      </Text>
                    </View>
                    <View className="bg-onPrimary/15 rounded-md px-2 py-0.5">
                      <Text className="text-onPrimary text-xs font-bold">
                        {ETIQUETA_NIVEL[nivelActual]}
                      </Text>
                    </View>
                  </View>
                  <Text className="text-onPrimary text-3xl font-extrabold mt-2">
                    {empresa.puntos_disponibles.toLocaleString('es-ES')} pts
                  </Text>

                  {siguienteNivel !== null ? (
                    <View className="mt-4">
                      <View className="flex-row justify-between mb-1">
                        <Text className="text-onPrimary/80 text-xs">
                          Rumbo a {ETIQUETA_NIVEL[siguienteNivel]}
                        </Text>
                        <Text className="text-onPrimary text-xs font-bold">
                          {Math.round(progreso * 100)}%
                        </Text>
                      </View>
                      <View className="h-2 rounded-full bg-onPrimary/20 overflow-hidden">
                        <View
                          className="h-full rounded-full bg-tertiaryLight"
                          style={{ width: `${progreso * 100}%` }}
                        />
                      </View>
                      <Text className="text-onPrimary/70 text-[11px] mt-1.5">
                        Te faltan {puntosFaltan.toLocaleString('es-ES')} pts
                      </Text>
                    </View>
                  ) : (
                    <Text className="text-onPrimary/80 text-xs mt-3">Nivel máximo alcanzado</Text>
                  )}
                </View>
              );
            })()}

          {mensajeCanje !== null && (
            <View
              className={`rounded-lg px-3 py-2 mt-3 flex-row items-center gap-2 ${
                mensajeCanje.tipo === 'ok' ? 'bg-success/15' : 'bg-errorContainer'
              }`}
            >
              <Feather
                name={mensajeCanje.tipo === 'ok' ? 'check-circle' : 'alert-circle'}
                size={15}
                color={mensajeCanje.tipo === 'ok' ? colors.success : colors.onErrorContainer}
              />
              <Text
                className={`text-sm flex-1 ${
                  mensajeCanje.tipo === 'ok' ? 'text-success' : 'text-onErrorContainer'
                }`}
              >
                {mensajeCanje.texto}
              </Text>
            </View>
          )}

          <View className="flex-row items-center gap-1.5 mt-5 mb-2">
            <Feather name="gift" size={12} color={colors.onSurface} />
            <Text className="text-onSurface text-xs font-extrabold uppercase tracking-wider">
              Catálogo de canje
            </Text>
          </View>
          {catalogo.length === 0 ? (
            <Text className="text-onSurfaceVariant text-sm">
              No hay recompensas disponibles ahora mismo.
            </Text>
          ) : (
            <View className="gap-2.5">
              {catalogo.map((recompensa) => {
                const puedeCanjear = (empresa?.puntos_disponibles ?? 0) >= recompensa.puntos_requeridos;
                return (
                  <View
                    key={recompensa.id}
                    className="bg-surfaceContainerLowest rounded-xl border border-outlineVariant p-3.5 flex-row items-center justify-between"
                  >
                    <View className="flex-row items-center flex-1 pr-3">
                      <View className="w-9 h-9 rounded-lg bg-secondaryContainer items-center justify-center mr-2.5">
                        <Feather name="gift" size={15} color={colors.onSecondaryContainer} />
                      </View>
                      <View className="flex-1">
                        <Text className="text-onSurface text-sm font-bold">{recompensa.nombre}</Text>
                        {recompensa.descripcion !== null && (
                          <Text className="text-onSurfaceVariant text-xs mt-0.5">
                            {recompensa.descripcion}
                          </Text>
                        )}
                        <Text className="text-secondary text-xs font-bold mt-1">
                          {recompensa.puntos_requeridos.toLocaleString('es-ES')} pts
                        </Text>
                      </View>
                    </View>
                    <Pressable
                      onPress={() => handleCanjear(recompensa)}
                      disabled={!puedeCanjear || canjeandoId === recompensa.id}
                      className={`rounded-lg px-3.5 py-2 ${
                        puedeCanjear ? 'bg-primary' : 'bg-surfaceContainerHigh'
                      }`}
                    >
                      {canjeandoId === recompensa.id ? (
                        <ActivityIndicator size="small" color={colors.onPrimary} />
                      ) : (
                        <Text
                          className={`text-xs font-bold ${
                            puedeCanjear ? 'text-onPrimary' : 'text-onSurfaceVariant'
                          }`}
                        >
                          Canjear
                        </Text>
                      )}
                    </Pressable>
                  </View>
                );
              })}
            </View>
          )}

          <View className="flex-row items-center gap-1.5 mt-6 mb-2">
            <Feather name="clock" size={12} color={colors.onSurface} />
            <Text className="text-onSurface text-xs font-extrabold uppercase tracking-wider">
              Historial de puntos
            </Text>
          </View>
          {movimientos.length === 0 ? (
            <Text className="text-onSurfaceVariant text-sm">Todavía no hay movimientos.</Text>
          ) : (
            <View className="bg-surfaceContainerLowest rounded-xl border border-outlineVariant">
              {movimientos.map((mov, index) => (
                <View
                  key={mov.id}
                  className={`flex-row items-center px-3.5 py-3 ${
                    index > 0 ? 'border-t border-outlineVariant' : ''
                  }`}
                >
                  <View
                    className={`w-7 h-7 rounded-full items-center justify-center mr-2.5 ${
                      mov.puntos >= 0 ? 'bg-success/15' : 'bg-errorContainer'
                    }`}
                  >
                    <Feather
                      name={mov.puntos >= 0 ? 'plus' : 'minus'}
                      size={13}
                      color={mov.puntos >= 0 ? colors.success : colors.error}
                    />
                  </View>
                  <View className="flex-1 pr-2">
                    <Text className="text-onSurface text-sm font-semibold">{mov.concepto}</Text>
                    <Text className="text-onSurfaceVariant text-xs mt-0.5">
                      {new Date(mov.created_at).toLocaleDateString('es-ES', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </Text>
                  </View>
                  <Text
                    className={`text-sm font-extrabold ${mov.puntos >= 0 ? 'text-success' : 'text-error'}`}
                  >
                    {mov.puntos >= 0 ? '+' : ''}
                    {mov.puntos.toLocaleString('es-ES')} pts
                  </Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}
