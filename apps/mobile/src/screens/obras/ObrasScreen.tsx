import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, FlatList, RefreshControl, ActivityIndicator, Pressable, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather, Ionicons } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { colors } from '../../design-system/tokens';
import type { RootStackParamList } from '../../navigation/types';
import ScreenHeader from '../../components/ScreenHeader';
import ObraImagePlaceholder from '../../components/ObraImagePlaceholder';
import CampanaNotificaciones from '../../components/CampanaNotificaciones';
import { ETIQUETA_NIVEL } from '../../constants/niveles';
import type { NivelPartner } from '../../constants/niveles';
import { esPrioritaria, msHastaCierre, textoCuentaAtras, textoDuracion } from '../../utils/plazos';

const COLOR_NIVEL: Record<NivelPartner, { texto: string; fondo: string }> = {
  bronce: { texto: colors.bronze, fondo: colors.bronzeTint },
  plata: { texto: colors.silver, fondo: colors.silverTint },
  oro: { texto: colors.gold, fondo: colors.goldTint },
  platino: { texto: colors.platinum, fondo: colors.platinumTint },
};

type Obra = {
  id: string;
  referencia: string;
  titulo: string;
  descripcion: string | null;
  especialidad_requerida: string | null;
  ubicacion: string | null;
  modulos: number | null;
  m2: number | null;
  presupuesto: number;
  moneda: string;
  puntos_bonus: number | null;
  imagen_url: string | null;
  fecha_inicio: string | null;
  duracion_dias: number | null;
  plazo_cierre: string | null;
  requisitos: string | null;
};

type ResumenEmpresa = {
  homologado: boolean;
  nivel_partner: NivelPartner;
  puntos_disponibles: number;
};

function formatearMoneda(valor: number, moneda: string): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: moneda }).format(valor);
}

function formatearFecha(fechaIso: string | null): string | null {
  if (fechaIso === null) return null;
  return new Date(fechaIso).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });
}

export default function ObrasScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();

  const [obras, setObras] = useState<Obra[]>([]);
  const [nombre, setNombre] = useState<string | null>(null);
  const [empresa, setEmpresa] = useState<ResumenEmpresa | null>(null);
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [guardadas, setGuardadas] = useState<Set<string>>(new Set());
  const [soloGuardadas, setSoloGuardadas] = useState(false);
  const [ahora, setAhora] = useState(Date.now());
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const primeraCarga = useRef(true);

  // Reloj interno: cada minuto se recalcula qué licitaciones están en su
  // ventana de 48 h, sin que el usuario tenga que refrescar a mano.
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  const cargarObras = useCallback(async () => {
    setError(null);

    const { data: userData } = await supabase.auth.getUser();
    const usuarioId = userData.user?.id;

    let empresaId: string | null = null;
    if (usuarioId) {
      const { data: perfil } = await supabase
        .from('profiles')
        .select('nombre_completo, empresa_id')
        .eq('id', usuarioId)
        .single();
      // Nombre a mostrar, por orden de preferencia: el del perfil, el que se
      // guardó al registrarse (metadatos de la cuenta) y, como último recurso,
      // la parte del email antes de la @. Se usa solo el primer nombre.
      const candidatos = [
        perfil?.nombre_completo as string | null | undefined,
        userData.user?.user_metadata?.nombre_completo as string | undefined,
        userData.user?.email?.split('@')[0],
      ];
      const elegido = candidatos.find((c) => typeof c === 'string' && c.trim() !== '');
      const primerNombre = elegido?.trim().split(/\s+/)[0] ?? null;
      setNombre(
        primerNombre !== null && primerNombre !== undefined
          ? primerNombre.charAt(0).toUpperCase() + primerNombre.slice(1)
          : null,
      );
      empresaId = (perfil?.empresa_id as string | null | undefined) ?? null;
    }

    const [obrasRes, empresaRes, postulacionesRes, guardadasRes] = await Promise.all([
      supabase
        .from('obras')
        .select(
          'id, referencia, titulo, descripcion, especialidad_requerida, ubicacion, modulos, m2, presupuesto, moneda, puntos_bonus, imagen_url, fecha_inicio, duracion_dias, plazo_cierre, requisitos',
        )
        .eq('estado', 'abierta')
        .order('created_at', { ascending: false }),
      empresaId !== null
        ? supabase
            .from('empresas_subcontratistas')
            .select('homologado, nivel_partner, puntos_disponibles')
            .eq('id', empresaId)
            .single()
        : Promise.resolve({ data: null }),
      empresaId !== null
        ? supabase.from('postulaciones').select('obra_id').eq('empresa_id', empresaId)
        : Promise.resolve({ data: null }),
      empresaId !== null
        ? supabase.from('obras_guardadas').select('obra_id').eq('empresa_id', empresaId)
        : Promise.resolve({ data: null }),
    ]);

    if (obrasRes.error) {
      setError('No se han podido cargar las obras. Comprueba tu conexión e inténtalo de nuevo.');
      return;
    }

    setEmpresa((empresaRes.data as ResumenEmpresa | null) ?? null);
    setEmpresaId(empresaId);
    setGuardadas(
      new Set(((guardadasRes.data as { obra_id: string }[] | null) ?? []).map((g) => g.obra_id)),
    );

    // Una obra a la que ya te has postulado deja de ser una "obra disponible":
    // pasa a vivir en la pestaña Postulaciones, con su estado y su progreso.
    const yaPostuladas = new Set(
      ((postulacionesRes.data as { obra_id: string }[] | null) ?? []).map((p) => p.obra_id),
    );
    setObras(((obrasRes.data as Obra[] | null) ?? []).filter((o) => !yaPostuladas.has(o.id)));
  }, []);

  // Se recarga cada vez que la pestaña vuelve a estar en pantalla (p.ej. al
  // volver de postular), no solo la primera vez. Solo la primera carga
  // muestra el spinner a pantalla completa; las siguientes son silenciosas.
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

  const toggleGuardar = async (obraId: string) => {
    if (empresaId === null) return;
    const yaGuardada = guardadas.has(obraId);
    // Actualización optimista; si la base de datos falla, se deshace.
    setGuardadas((prev) => {
      const nuevo = new Set(prev);
      if (yaGuardada) nuevo.delete(obraId);
      else nuevo.add(obraId);
      return nuevo;
    });
    const { error: errorGuardar } = yaGuardada
      ? await supabase.from('obras_guardadas').delete().eq('empresa_id', empresaId).eq('obra_id', obraId)
      : await supabase.from('obras_guardadas').insert({ empresa_id: empresaId, obra_id: obraId });
    if (errorGuardar) {
      setGuardadas((prev) => {
        const nuevo = new Set(prev);
        if (yaGuardada) nuevo.add(obraId);
        else nuevo.delete(obraId);
        return nuevo;
      });
      setError('No se ha podido actualizar la oferta guardada.');
    }
  };

  if (cargando) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <ActivityIndicator color={colors.action} />
      </View>
    );
  }

  // Licitaciones prioritarias: las que cierran en 48 h o menos, la más
  // urgente primero. Salen destacadas arriba y no se repiten en la lista.
  const visibles = soloGuardadas ? obras.filter((o) => guardadas.has(o.id)) : obras;
  const prioritarias = visibles
    .filter((o) => esPrioritaria(o.plazo_cierre, ahora))
    .sort(
      (a, b) => (msHastaCierre(a.plazo_cierre, ahora) ?? 0) - (msHastaCierre(b.plazo_cierre, ahora) ?? 0),
    );
  const idsPrioritarias = new Set(prioritarias.map((o) => o.id));
  const resto = visibles.filter((o) => !idsPrioritarias.has(o.id));

  const cabecera = (
    <View>
      <View className="bg-surface rounded-2xl border border-border p-4 flex-row items-center justify-between">
        <View className="flex-row items-center flex-1 pr-3">
          <Image
            source={require('../../../assets/branding/oh-casas-logo.jpg')}
            style={{ width: 40, height: 40, borderRadius: 12 }}
            className="mr-3"
          />
          <View className="flex-1">
            <Text className="text-ink text-base font-sansBold">
              {nombre !== null && nombre !== '' ? `Hola, ${nombre} 👋` : 'Hola 👋'}
            </Text>
            {empresa !== null && (
              <View className="flex-row items-center gap-1.5 mt-1">
                <View
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: 4,
                    backgroundColor: empresa.homologado ? colors.success : colors.inkSubtle,
                  }}
                />
                <Text className="text-inkMuted text-xs flex-shrink">
                  {empresa.homologado ? 'Subcontratista Certificado OH' : 'Homologación pendiente'}
                </Text>
              </View>
            )}
          </View>
        </View>
        {empresa !== null && (
          <View
            className="flex-row items-center gap-1 rounded-full px-3 py-1.5"
            style={{ backgroundColor: COLOR_NIVEL[empresa.nivel_partner].fondo }}
          >
            <Feather name="star" size={13} color={COLOR_NIVEL[empresa.nivel_partner].texto} />
            <Text className="text-xs font-sansBold" style={{ color: COLOR_NIVEL[empresa.nivel_partner].texto }}>
              {ETIQUETA_NIVEL[empresa.nivel_partner]} · {empresa.puntos_disponibles.toLocaleString('es-ES')} pts
            </Text>
          </View>
        )}
      </View>

      {empresaId !== null && (
        <View className="flex-row mt-3" style={{ gap: 8 }}>
          {[
            { clave: false, etiqueta: `Todas ${obras.length}` },
            { clave: true, etiqueta: `Guardadas ${obras.filter((o) => guardadas.has(o.id)).length}` },
          ].map((op) => {
            const activo = soloGuardadas === op.clave;
            return (
              <Pressable
                key={op.etiqueta}
                onPress={() => setSoloGuardadas(op.clave)}
                className={`flex-row items-center gap-1.5 rounded-full px-3.5 py-1.5 border ${
                  activo ? 'bg-navySurface border-navySurface' : 'bg-surface border-border'
                }`}
              >
                {op.clave && <Feather name="bookmark" size={14} color={activo ? colors.white : colors.ink} />}
                <Text className={`text-xs font-sansBold ${activo ? 'text-white' : 'text-ink'}`}>
                  {op.etiqueta}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {prioritarias.map((obra) => {
        const ms = msHastaCierre(obra.plazo_cierre, ahora) ?? 0;
        return (
          <View key={obra.id} className="bg-surface rounded-2xl border border-border overflow-hidden mt-3">
            <View className="p-4">
              <View className="flex-row justify-between items-center">
                <Text className="text-inkMuted text-[13px] font-sansSemiBold uppercase" style={{ letterSpacing: 1 }}>
                  Licitación prioritaria
                </Text>
                <View className="flex-row items-center" style={{ gap: 10 }}>
                  <View className="flex-row items-center gap-1 bg-urgentTint rounded-md px-2 py-1">
                    <Feather name="clock" size={13} color={colors.urgent} />
                    <Text className="text-urgent text-[13px] font-sansBold">
                      Cierra en {textoCuentaAtras(ms)}
                    </Text>
                  </View>
                  <Pressable onPress={() => toggleGuardar(obra.id)} hitSlop={8} accessibilityLabel="Guardar oferta">
                    <Ionicons
                      name={guardadas.has(obra.id) ? 'bookmark' : 'bookmark-outline'}
                      size={20}
                      color={guardadas.has(obra.id) ? colors.action : colors.inkMuted}
                    />
                  </Pressable>
                </View>
              </View>

              <Text className="text-ink text-lg font-sansBold mt-3">{obra.titulo}</Text>
              <View className="flex-row items-center flex-wrap gap-x-3 gap-y-0.5 mt-1">
                {obra.ubicacion !== null && (
                  <View className="flex-row items-center gap-1">
                    <Feather name="map-pin" size={13} color={colors.inkMuted} />
                    <Text className="text-inkMuted text-xs">{obra.ubicacion}</Text>
                  </View>
                )}
                {obra.modulos !== null && (
                  <View className="flex-row items-center gap-1">
                    <Feather name="layers" size={13} color={colors.inkMuted} />
                    <Text className="text-inkMuted text-xs">{obra.modulos} módulos</Text>
                  </View>
                )}
              </View>

              <View className="flex-row mt-4" style={{ gap: 32 }}>
                <View>
                  <Text className="text-inkMuted text-[12px] font-sansSemiBold uppercase" style={{ letterSpacing: 0.5 }}>
                    Presupuesto asignado
                  </Text>
                  <Text className="text-ink text-xl font-sansBold mt-0.5">
                    {formatearMoneda(obra.presupuesto, obra.moneda)}
                  </Text>
                </View>
                {obra.duracion_dias !== null && (
                  <View>
                    <Text className="text-inkMuted text-[12px] font-sansSemiBold uppercase" style={{ letterSpacing: 0.5 }}>
                      Plazo de ejecución
                    </Text>
                    <Text className="text-action text-xl font-sansBold mt-0.5">
                      {textoDuracion(obra.duracion_dias)}
                    </Text>
                  </View>
                )}
              </View>

              <Pressable
                onPress={() => navigation.navigate('DetalleObra', { obraId: obra.id })}
                className="bg-action rounded-xl py-3 items-center mt-4"
              >
                <View className="flex-row items-center gap-2">
                  <Text className="text-white font-sansBold text-sm">Postular ahora</Text>
                  <Feather name="arrow-right" size={16} color={colors.white} />
                </View>
              </Pressable>
            </View>
          </View>
        );
      })}

      {resto.length > 0 && (
        <Text className="text-inkMuted text-[13px] font-sansSemiBold uppercase mt-5" style={{ letterSpacing: 1 }}>
          Licitaciones activas
        </Text>
      )}
    </View>
  );

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader title="Obras" rightElement={<CampanaNotificaciones />} />

      {error !== null && (
        <View className="bg-errorTint mx-4 mt-3 rounded-lg px-3 py-2 flex-row items-center gap-2">
          <Feather name="alert-circle" size={17} color={colors.error} />
          <Text className="text-error text-sm flex-1">{error}</Text>
        </View>
      )}

      <FlatList
        data={resto}
        ListHeaderComponent={cabecera}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 16 }}
        refreshControl={
          <RefreshControl refreshing={refrescando} onRefresh={handleRefrescar} colors={[colors.action]} />
        }
        ItemSeparatorComponent={() => <View style={{ height: 0 }} />}
        ListEmptyComponent={
          error === null && visibles.length === 0 ? (
            <View className="items-center mt-16 px-6">
              <Feather name={soloGuardadas ? 'bookmark' : 'inbox'} size={32} color={colors.borderStrong} />
              <Text className="text-ink text-base font-sansSemiBold text-center mt-3">
                {soloGuardadas ? 'No tienes ofertas guardadas' : 'No hay licitaciones abiertas ahora mismo'}
              </Text>
              <Text className="text-inkMuted text-sm text-center mt-2">
                {soloGuardadas
                  ? 'Toca el marcador de una oferta para guardarla y te avisaremos antes de que cierre.'
                  : 'Vuelve más tarde o desliza hacia abajo para actualizar.'}
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <View className="bg-surface rounded-2xl border border-border overflow-hidden mt-3">
            <View>
              <ObraImagePlaceholder imageUrl={item.imagen_url} icon="home" height={220} />
              <Pressable
                onPress={() => toggleGuardar(item.id)}
                hitSlop={8}
                accessibilityLabel="Guardar oferta"
                className="absolute bg-ink/60 rounded-full items-center justify-center"
                style={{ top: 10, right: 10, width: 36, height: 36 }}
              >
                <Ionicons
                  name={guardadas.has(item.id) ? 'bookmark' : 'bookmark-outline'}
                  size={19}
                  color={colors.white}
                />
              </Pressable>
            </View>
            <View className="p-4">
              <View className="flex-row justify-between items-start">
                <View className="flex-1 pr-2">
                  <Text className="text-inkMuted text-xs font-mono">{item.referencia}</Text>
                  <Text className="text-ink text-base font-sansBold mt-0.5">{item.titulo}</Text>
                  {item.ubicacion !== null && (
                    <View className="flex-row items-center gap-1 mt-0.5">
                      <Feather name="map-pin" size={13} color={colors.inkMuted} />
                      <Text className="text-inkMuted text-xs">{item.ubicacion}</Text>
                    </View>
                  )}
                </View>
                <View className="items-end">
                  <Text className="text-inkMuted text-[12px] uppercase font-sansSemiBold">Presupuesto</Text>
                  <Text className="text-ink text-base font-sansBold">
                    {formatearMoneda(item.presupuesto, item.moneda)}
                  </Text>
                  {item.puntos_bonus !== null && item.puntos_bonus > 0 && (
                    <View className="flex-row items-center gap-1 bg-actionTint rounded-md px-2 py-0.5 mt-1.5">
                      <Feather name="award" size={11} color={colors.action} />
                      <Text className="text-action text-[12px] font-sansBold">+{item.puntos_bonus} pts</Text>
                    </View>
                  )}
                </View>
              </View>

              <View className="flex-row items-center flex-wrap gap-x-3 gap-y-1 mt-3">
                {item.especialidad_requerida !== null && (
                  <View className="flex-row items-center gap-1">
                    <Feather name="tool" size={13} color={colors.inkMuted} />
                    <Text className="text-inkMuted text-xs">{item.especialidad_requerida}</Text>
                  </View>
                )}
                {item.modulos !== null && (
                  <View className="flex-row items-center gap-1">
                    <Feather name="layers" size={13} color={colors.inkMuted} />
                    <Text className="text-inkMuted text-xs">{item.modulos} módulos</Text>
                  </View>
                )}
                {item.m2 !== null && (
                  <View className="flex-row items-center gap-1">
                    <Feather name="maximize" size={13} color={colors.inkMuted} />
                    <Text className="text-inkMuted text-xs">{item.m2} m²</Text>
                  </View>
                )}
              </View>

              {item.descripcion !== null && (
                <Text className="text-inkMuted text-xs mt-3 leading-relaxed">{item.descripcion}</Text>
              )}

              <View className="flex-row justify-between items-center mt-3 pt-3 border-t border-border">
                <View className="flex-row items-center gap-1 flex-1 pr-2">
                  <Feather name="calendar" size={13} color={colors.inkMuted} />
                  <Text className="text-inkMuted text-[13px]">
                    {formatearFecha(item.fecha_inicio) !== null
                      ? `Inicio: ${formatearFecha(item.fecha_inicio)}`
                      : 'Fecha por confirmar'}
                    {item.duracion_dias !== null ? ` (${item.duracion_dias} días)` : ''}
                  </Text>
                </View>
                {item.requisitos !== null && (
                  <Text className="text-inkMuted text-[13px]">{item.requisitos}</Text>
                )}
              </View>

              <Pressable
                onPress={() => navigation.navigate('DetalleObra', { obraId: item.id })}
                className="bg-action rounded-xl py-3 items-center mt-3"
              >
                <View className="flex-row items-center gap-2">
                  <Text className="text-white font-sansBold text-sm">Ver Licitación &amp; Postular</Text>
                  <Feather name="arrow-right" size={16} color={colors.white} />
                </View>
              </Pressable>
            </View>
          </View>
        )}
      />
    </View>
  );
}