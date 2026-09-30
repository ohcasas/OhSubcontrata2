import { useCallback, useRef, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, ActivityIndicator, Pressable } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { colors } from '../../design-system/tokens';
import ScreenHeader from '../../components/ScreenHeader';
import CampanaNotificaciones from '../../components/CampanaNotificaciones';
import {
  ETIQUETA_NIVEL,
  OBRAS_PARA_DESBLOQUEAR_CLUB,
  ORDEN_NIVELES,
  numeroNivel,
  progresoHaciaSiguiente,
} from '../../constants/niveles';
import type { NivelPartner } from '../../constants/niveles';

type Empresa = {
  id: string;
  nombre: string;
  nivel_partner: NivelPartner;
  puntos_disponibles: number;
  puntos_totales: number;
  obras_completadas: number;
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
  nivel_minimo: NivelPartner;
};

type Canje = {
  id: string;
  puntos_gastados: number;
  estado: 'pendiente' | 'completado' | 'cancelado';
  created_at: string;
  recompensas_catalogo: { nombre: string } | null;
};

const ETIQUETA_CANJE: Record<Canje['estado'], { texto: string; badge: string; color: string }> = {
  pendiente: { texto: 'En proceso', badge: 'bg-warningTint', color: 'text-warning' },
  completado: { texto: 'Completado', badge: 'bg-successTint', color: 'text-success' },
  cancelado: { texto: 'Cancelado · puntos devueltos', badge: 'bg-errorTint', color: 'text-error' },
};

export default function ClubPartnerScreen() {
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [catalogo, setCatalogo] = useState<Recompensa[]>([]);
  const [sinEmpresa, setSinEmpresa] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canjeandoId, setCanjeandoId] = useState<string | null>(null);
  const [canjes, setCanjes] = useState<Canje[]>([]);
  const [mensajeCanje, setMensajeCanje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(
    null,
  );
  const primeraCarga = useRef(true);

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

    const [
      { data: empresaData, error: errorEmpresa },
      { data: movData },
      { data: catData },
      { data: canjesData },
    ] = await Promise.all([
        supabase
          .from('empresas_subcontratistas')
          .select('id, nombre, nivel_partner, puntos_disponibles, puntos_totales, obras_completadas')
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
          .select('id, nombre, descripcion, puntos_requeridos, categoria, nivel_minimo')
          .eq('activo', true)
          .order('puntos_requeridos', { ascending: true }),
        supabase
          .from('canjes')
          .select('id, puntos_gastados, estado, created_at, recompensas_catalogo(nombre)')
          .eq('empresa_id', empresaId)
          .order('created_at', { ascending: false })
          .limit(20),
      ]);

    if (errorEmpresa) {
      setError('No se han podido cargar tus datos de Club Partner.');
      return;
    }
    setEmpresa(empresaData as Empresa);
    setMovimientos((movData as Movimiento[] | null) ?? []);
    setCatalogo((catData as Recompensa[] | null) ?? []);
    setCanjes((canjesData as unknown as Canje[] | null) ?? []);
  }, []);

  // Recarga al volver a la pestaña: así los puntos que acredita el admin al
  // finalizar una obra aparecen sin tener que refrescar a mano.
  useFocusEffect(
    useCallback(() => {
      (async () => {
        if (primeraCarga.current) setCargando(true);
        await cargarTodo();
        primeraCarga.current = false;
        setCargando(false);
      })();
    }, [cargarTodo]),
  );

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
        // Los mensajes propios de la función ya están redactados para el usuario.
        texto: ['No tienes suficientes', 'se desbloquea', 'requiere nivel', 'ya no está disponible'].some((m) =>
          errorRpc.message.includes(m),
        )
          ? errorRpc.message
          : 'No se ha podido completar el canje. Inténtalo de nuevo.',
      });
      return;
    }
    setMensajeCanje({ tipo: 'ok', texto: `Canje de "${recompensa.nombre}" solicitado.` });
    await cargarTodo();
  };

  if (cargando) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <ActivityIndicator color={colors.action} />
      </View>
    );
  }

  const desbloqueado = empresa !== null && empresa.obras_completadas >= OBRAS_PARA_DESBLOQUEAR_CLUB;

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader title="Partner" rightElement={<CampanaNotificaciones />} />

      {sinEmpresa ? (
        <View className="items-center mt-16 px-6">
          <Feather name="briefcase" size={28} color={colors.inkSubtle} />
          <Text className="text-ink text-base font-sansSemiBold text-center mt-3">
            Tu usuario todavía no está vinculado a ninguna empresa subcontratista
          </Text>
          <Text className="text-inkMuted text-sm text-center mt-2">
            Contacta con OH Contratas para poder ver tus puntos y recompensas.
          </Text>
        </View>
      ) : (
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

          {empresa !== null && !desbloqueado && (
            <View className="bg-surface border border-border rounded-3xl p-5 items-center">
              <View className="border border-border rounded-full items-center justify-center" style={{ width: 56, height: 56 }}>
                <Feather name="award" size={24} color={colors.ink} />
              </View>
              <Text className="text-ink text-xl font-sansBold mt-3 text-center">Club OH Partner</Text>
              <View className="bg-action rounded-full items-center justify-center mt-3" style={{ width: 44, height: 44 }}>
                <Feather name="lock" size={19} color={colors.white} />
              </View>
              <Text className="text-ink text-sm font-sansSemiBold text-center mt-3">
                Llevas {empresa.obras_completadas} de {OBRAS_PARA_DESBLOQUEAR_CLUB} obras completadas
              </Text>
              <View className="w-full mt-3">
                <View className="h-2 rounded-full bg-border overflow-hidden">
                  <View
                    className="h-full rounded-full bg-action"
                    style={{ width: `${Math.min(empresa.obras_completadas / OBRAS_PARA_DESBLOQUEAR_CLUB, 1) * 100}%` }}
                  />
                </View>
              </View>
              <Text className="text-inkMuted text-xs text-center mt-3">
                Completa {OBRAS_PARA_DESBLOQUEAR_CLUB} obras para desbloquear puntos, niveles y recompensas.
              </Text>
            </View>
          )}

          {empresa !== null &&
            desbloqueado &&
            (() => {
              const nivel = empresa.nivel_partner;
              const { siguiente, progreso, puntosFaltan } = progresoHaciaSiguiente(nivel, empresa.puntos_totales);
              return (
                <View className="bg-action rounded-3xl p-4">
                  <View className="flex-row justify-between items-start">
                    <View className="flex-1 pr-3">
                      <View className="flex-row items-center gap-1.5">
                        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.white }} />
                        <Text className="text-white/80 text-[12px] font-sansBold uppercase" style={{ letterSpacing: 1 }}>
                          Categoría oficial
                        </Text>
                      </View>
                      <Text className="text-white text-2xl font-sansBold mt-1.5">Socio {ETIQUETA_NIVEL[nivel]}</Text>
                      <Text className="text-white/70 text-xs mt-0.5">
                        Nivel {numeroNivel(nivel)} de {ORDEN_NIVELES.length}
                      </Text>
                    </View>
                    <View className="bg-white/15 border border-white/25 rounded-xl px-3 py-2 items-center">
                      <Text className="text-white/70 text-[12px] font-sansBold uppercase" style={{ letterSpacing: 1 }}>
                        Obras completadas
                      </Text>
                      <View className="flex-row items-center gap-1 mt-0.5">
                        <Feather name="check-circle" size={15} color={colors.white} />
                        <Text className="text-white text-base font-sansBold">{empresa.obras_completadas}</Text>
                      </View>
                    </View>
                  </View>

                  <View className="bg-black/15 border border-white/10 rounded-2xl p-4 mt-4">
                    <View className="flex-row justify-between items-start">
                      <Text className="text-white/80 text-[13px] font-sansBold uppercase flex-1 pr-2" style={{ letterSpacing: 1 }}>
                        Puntos acumulados disponibles
                      </Text>
                      <View className="rounded-md px-2 py-0.5 border border-white/40">
                        <Text className="text-white text-[12px] font-sansBold">Canjeables</Text>
                      </View>
                    </View>
                    <View className="flex-row items-end gap-2 mt-2">
                      <Text className="text-white text-4xl font-sansBold">
                        {empresa.puntos_disponibles.toLocaleString('es-ES')}
                      </Text>
                      <Text className="text-white/90 text-xs font-sansBold uppercase mb-1.5">Puntos OH</Text>
                    </View>
                    <Text className="text-white/60 text-[13px] mt-1.5">
                      {empresa.puntos_totales.toLocaleString('es-ES')} pts ganados en total · definen tu rango
                    </Text>
                  </View>

                  {siguiente !== null ? (
                    <View className="mt-4">
                      <View className="flex-row justify-between mb-1.5">
                        <Text className="text-white text-xs font-sansMedium">
                          Rumbo a <Text className="font-sansBold uppercase">Socio {ETIQUETA_NIVEL[siguiente]}</Text>
                        </Text>
                        <Text className="text-white text-xs font-sansBold">{Math.round(progreso * 100)}% completado</Text>
                      </View>
                      <View className="h-2 rounded-full bg-white/20 overflow-hidden">
                        <View className="h-full rounded-full bg-white" style={{ width: `${progreso * 100}%` }} />
                      </View>
                      <Text className="text-white/70 text-[13px] mt-1.5">
                        Te faltan {puntosFaltan.toLocaleString('es-ES')} pts para {ETIQUETA_NIVEL[siguiente]}.
                      </Text>
                    </View>
                  ) : (
                    <View className="flex-row items-center gap-1.5 mt-4">
                      <Feather name="check-circle" size={15} color={colors.white} />
                      <Text className="text-white/80 text-xs">Has alcanzado el nivel máximo.</Text>
                    </View>
                  )}
                </View>
              );
            })()}

          {mensajeCanje !== null && (
            <View
              className={`rounded-lg px-3 py-2 mt-3 flex-row items-center gap-2 ${
                mensajeCanje.tipo === 'ok' ? 'bg-successTint' : 'bg-errorTint'
              }`}
            >
              <Feather
                name={mensajeCanje.tipo === 'ok' ? 'check-circle' : 'alert-circle'}
                size={16}
                color={mensajeCanje.tipo === 'ok' ? colors.success : colors.error}
              />
              <Text className={`text-sm flex-1 ${mensajeCanje.tipo === 'ok' ? 'text-success' : 'text-error'}`}>
                {mensajeCanje.texto}
              </Text>
            </View>
          )}

          <View className="flex-row items-center gap-1.5 mt-5 mb-2">
            <Feather name="gift" size={14} color={colors.ink} />
            <Text className="text-ink text-xs font-sansBold uppercase" style={{ letterSpacing: 1 }}>
              Catálogo de canje
            </Text>
          </View>
          {catalogo.length === 0 ? (
            <Text className="text-inkMuted text-sm">No hay recompensas disponibles ahora mismo.</Text>
          ) : (
            <View className="gap-2.5">
              {catalogo.map((recompensa) => {
                const nivelOk =
                  empresa !== null &&
                  ORDEN_NIVELES.indexOf(empresa.nivel_partner) >= ORDEN_NIVELES.indexOf(recompensa.nivel_minimo);
                const puedeCanjear =
                  desbloqueado && nivelOk && (empresa?.puntos_disponibles ?? 0) >= recompensa.puntos_requeridos;
                const etiquetaBoton = !desbloqueado ? 'Bloqueado' : !nivelOk ? 'Nivel' : 'Canjear';
                return (
                  <View
                    key={recompensa.id}
                    className="bg-surface rounded-xl border border-border p-3.5 flex-row items-center justify-between"
                  >
                    <View className="flex-row items-center flex-1 pr-3">
                      <View className="w-9 h-9 rounded-lg bg-actionTint items-center justify-center mr-2.5">
                        <Feather name="gift" size={16} color={colors.action} />
                      </View>
                      <View className="flex-1">
                        <Text className="text-ink text-sm font-sansBold">{recompensa.nombre}</Text>
                        {recompensa.descripcion !== null && (
                          <Text className="text-inkMuted text-xs mt-0.5">{recompensa.descripcion}</Text>
                        )}
                        <Text className="text-action text-xs font-sansBold mt-1">
                          {recompensa.puntos_requeridos.toLocaleString('es-ES')} pts
                          {recompensa.nivel_minimo !== 'bronce' ? (
                            <Text className={nivelOk ? 'text-inkMuted' : 'text-error'}>
                              {`  ·  Requiere nivel ${ETIQUETA_NIVEL[recompensa.nivel_minimo]}`}
                            </Text>
                          ) : null}
                        </Text>
                      </View>
                    </View>
                    <Pressable
                      onPress={() => handleCanjear(recompensa)}
                      disabled={!puedeCanjear || canjeandoId === recompensa.id}
                      className={`rounded-lg px-3.5 py-2 ${puedeCanjear ? 'bg-action' : 'bg-canvas border border-border'}`}
                    >
                      {canjeandoId === recompensa.id ? (
                        <ActivityIndicator size="small" color={colors.white} />
                      ) : (
                        <Text className={`text-xs font-sansBold ${puedeCanjear ? 'text-white' : 'text-inkMuted'}`}>
                          {etiquetaBoton}
                        </Text>
                      )}
                    </Pressable>
                  </View>
                );
              })}
            </View>
          )}

          {canjes.length > 0 && (
            <View>
              <View className="flex-row items-center gap-1.5 mt-6 mb-2">
                <Feather name="package" size={14} color={colors.ink} />
                <Text className="text-ink text-xs font-sansBold uppercase" style={{ letterSpacing: 1 }}>
                  Mis canjes
                </Text>
              </View>
              <View className="bg-surface rounded-xl border border-border">
                {canjes.map((canje, index) => {
                  const et = ETIQUETA_CANJE[canje.estado];
                  return (
                    <View
                      key={canje.id}
                      className={`flex-row items-center justify-between px-3.5 py-3 ${
                        index > 0 ? 'border-t border-border' : ''
                      }`}
                    >
                      <View className="flex-1 pr-2">
                        <Text className="text-ink text-sm font-sansSemiBold">
                          {canje.recompensas_catalogo?.nombre ?? 'Recompensa'}
                        </Text>
                        <Text className="text-inkMuted text-xs mt-0.5">
                          {new Date(canje.created_at).toLocaleDateString('es-ES', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}{' '}
                          · {canje.puntos_gastados.toLocaleString('es-ES')} pts
                        </Text>
                      </View>
                      <View className={`rounded-md px-2 py-0.5 ${et.badge}`}>
                        <Text className={`text-[12px] font-sansBold ${et.color}`}>{et.texto}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          <View className="flex-row items-center gap-1.5 mt-6 mb-2">
            <Feather name="clock" size={14} color={colors.ink} />
            <Text className="text-ink text-xs font-sansBold uppercase" style={{ letterSpacing: 1 }}>
              Historial de puntos
            </Text>
          </View>
          {movimientos.length === 0 ? (
            <Text className="text-inkMuted text-sm">Todavía no hay movimientos.</Text>
          ) : (
            <View className="bg-surface rounded-xl border border-border">
              {movimientos.map((mov, index) => (
                <View
                  key={mov.id}
                  className={`flex-row items-center px-3.5 py-3 ${index > 0 ? 'border-t border-border' : ''}`}
                >
                  <View
                    className={`w-7 h-7 rounded-full items-center justify-center mr-2.5 ${
                      mov.puntos >= 0 ? 'bg-successTint' : 'bg-errorTint'
                    }`}
                  >
                    <Feather
                      name={mov.puntos >= 0 ? 'plus' : 'minus'}
                      size={15}
                      color={mov.puntos >= 0 ? colors.success : colors.error}
                    />
                  </View>
                  <View className="flex-1 pr-2">
                    <Text className="text-ink text-sm font-sansSemiBold">{mov.concepto}</Text>
                    <Text className="text-inkMuted text-xs mt-0.5">
                      {new Date(mov.created_at).toLocaleDateString('es-ES', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </Text>
                  </View>
                  <Text className={`text-sm font-sansBold ${mov.puntos >= 0 ? 'text-success' : 'text-error'}`}>
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