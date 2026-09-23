import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, ActivityIndicator, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { supabase } from '../../services/supabase';
import { colors } from '../../design-system/tokens';
import ScreenHeader from '../../components/ScreenHeader';

type NombreIcono = ComponentProps<typeof Feather>['name'];

type Perfil = {
  nombre_completo: string;
  telefono: string | null;
};

type Empresa = {
  nombre: string;
  especialidad: string | null;
  homologado: boolean;
  rating_medio: number | null;
  obras_completadas: number;
};

type TipoDocumento = 'alta_autonomo' | 'seguro_rc' | 'certificado_prl' | 'certificado_aeat_tgss' | 'otro';
type EstadoDocumento = 'vigente' | 'vencido' | 'pendiente_revision';

type Documento = {
  id: string;
  tipo: TipoDocumento;
  estado: EstadoDocumento;
  descripcion: string | null;
  cobertura_eur: number | null;
  fecha_vencimiento: string | null;
};

type ObraCompletada = {
  id: string;
  oferta_economica: number;
  obras: { titulo: string; moneda: string } | null;
};

const ETIQUETA_TIPO_DOCUMENTO: Record<TipoDocumento, string> = {
  alta_autonomo: 'Alta Autónomo / Modelo 036',
  seguro_rc: 'Seguro de Responsabilidad Civil',
  certificado_prl: 'Certificado PRL',
  certificado_aeat_tgss: 'Corriente de pagos AEAT y TGSS',
  otro: 'Otro documento',
};

const ICONO_TIPO_DOCUMENTO: Record<TipoDocumento, NombreIcono> = {
  alta_autonomo: 'file-text',
  seguro_rc: 'shield',
  certificado_prl: 'hard-drive',
  certificado_aeat_tgss: 'file-text',
  otro: 'file',
};

const ESTILO_ESTADO_DOCUMENTO: Record<
  EstadoDocumento,
  { badge: string; texto: string; etiqueta: string; icono: NombreIcono }
> = {
  vigente: { badge: 'bg-success/15', texto: 'text-success', etiqueta: 'Vigente', icono: 'check-circle' },
  vencido: { badge: 'bg-errorContainer', texto: 'text-onErrorContainer', etiqueta: 'Vencido', icono: 'alert-triangle' },
  pendiente_revision: {
    badge: 'bg-secondaryContainer',
    texto: 'text-onSecondaryContainer',
    etiqueta: 'Pendiente de revisión',
    icono: 'clock',
  },
};

function formatearFecha(fechaIso: string | null): string | null {
  if (fechaIso === null) return null;
  return new Date(fechaIso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatearMoneda(valor: number, moneda: string): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: moneda }).format(valor);
}

export default function PerfilScreen() {
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [obrasCompletadas, setObrasCompletadas] = useState<ObraCompletada[]>([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cerrandoSesion, setCerrandoSesion] = useState(false);

  const cargarTodo = useCallback(async () => {
    setError(null);

    const { data: userData } = await supabase.auth.getUser();
    const usuarioId = userData.user?.id;
    if (!usuarioId) return;

    const { data: perfilData, error: errorPerfil } = await supabase
      .from('profiles')
      .select('nombre_completo, telefono, empresa_id')
      .eq('id', usuarioId)
      .single();

    if (errorPerfil || !perfilData) {
      setError('No se ha podido cargar tu perfil.');
      return;
    }
    setPerfil({ nombre_completo: perfilData.nombre_completo, telefono: perfilData.telefono });

    const empresaId = perfilData.empresa_id as string | null;
    if (!empresaId) return;

    const [{ data: empresaData }, { data: docsData }, { data: obrasData }] = await Promise.all([
      supabase
        .from('empresas_subcontratistas')
        .select('nombre, especialidad, homologado, rating_medio, obras_completadas')
        .eq('id', empresaId)
        .single(),
      supabase
        .from('documentos_homologacion')
        .select('id, tipo, estado, descripcion, cobertura_eur, fecha_vencimiento')
        .eq('empresa_id', empresaId)
        .order('tipo', { ascending: true }),
      supabase
        .from('postulaciones')
        .select('id, oferta_economica, obras(titulo, moneda)')
        .eq('empresa_id', empresaId)
        .eq('estado', 'aceptada'),
    ]);

    setEmpresa((empresaData as Empresa | null) ?? null);
    setDocumentos((docsData as Documento[] | null) ?? []);
    setObrasCompletadas((obrasData as unknown as ObraCompletada[] | null) ?? []);
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

  const handleCerrarSesion = async () => {
    setCerrandoSesion(true);
    await supabase.auth.signOut();
    // Sin manejo manual de navegación: RootNavigator detecta la sesión
    // nula vía onAuthStateChange y vuelve solo a la pantalla de Login.
  };

  if (cargando) {
    return (
      <View className="flex-1 items-center justify-center bg-surface">
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const iniciales = perfil?.nombre_completo
    ? perfil.nombre_completo
        .split(' ')
        .slice(0, 2)
        .map((p) => p[0]?.toUpperCase() ?? '')
        .join('')
    : '?';

  return (
    <View className="flex-1 bg-surface">
      <ScreenHeader title="Perfil Profesional" />

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

        {/* Cabecera de perfil */}
        <View className="bg-surfaceContainerLowest rounded-2xl border border-outlineVariant p-4 flex-row items-center">
          <View className="w-16 h-16 rounded-xl bg-primary items-center justify-center mr-3.5">
            <Text className="text-onPrimary text-xl font-extrabold">{iniciales}</Text>
          </View>
          <View className="flex-1">
            <Text className="text-onSurface text-base font-bold">
              {perfil?.nombre_completo ?? 'Sin nombre'}
            </Text>
            {empresa !== null && (
              <>
                <Text className="text-onSurfaceVariant text-sm mt-0.5">{empresa.nombre}</Text>
                {empresa.especialidad !== null && (
                  <View className="flex-row items-center gap-1 mt-0.5">
                    <Feather name="tool" size={11} color={colors.onSurfaceVariant} />
                    <Text className="text-onSurfaceVariant text-xs">{empresa.especialidad}</Text>
                  </View>
                )}
              </>
            )}
          </View>
        </View>

        {empresa !== null && (
          <View className="flex-row mt-3 gap-2.5">
            <View className="flex-1 bg-surfaceContainerLow rounded-xl p-3 items-center">
              <Feather name="star" size={15} color={colors.accentGold} />
              <Text className="text-onSurface text-lg font-extrabold mt-1">
                {empresa.rating_medio !== null ? empresa.rating_medio.toFixed(1) : '—'}
              </Text>
              <Text className="text-onSurfaceVariant text-[10px] uppercase font-bold mt-0.5">
                Valoración
              </Text>
            </View>
            <View className="flex-1 bg-surfaceContainerLow rounded-xl p-3 items-center">
              <Feather name="home" size={15} color={colors.tertiary} />
              <Text className="text-onSurface text-lg font-extrabold mt-1">
                {empresa.obras_completadas}
              </Text>
              <Text className="text-onSurfaceVariant text-[10px] uppercase font-bold mt-0.5">
                Obras OH Casas
              </Text>
            </View>
            <View className="flex-1 bg-surfaceContainerLow rounded-xl p-3 items-center">
              <Feather
                name={empresa.homologado ? 'check-circle' : 'x-circle'}
                size={15}
                color={empresa.homologado ? colors.success : colors.onSurfaceVariant}
              />
              <Text
                className={`text-lg font-extrabold mt-1 ${empresa.homologado ? 'text-success' : 'text-onSurfaceVariant'}`}
              >
                {empresa.homologado ? 'Sí' : 'No'}
              </Text>
              <Text className="text-onSurfaceVariant text-[10px] uppercase font-bold mt-0.5">
                Homologado
              </Text>
            </View>
          </View>
        )}

        {/* Documentación */}
        <Text className="text-onSurface text-xs font-extrabold uppercase tracking-wider mt-6 mb-2">
          Homologación legal y PRL
        </Text>
        {documentos.length === 0 ? (
          <Text className="text-onSurfaceVariant text-sm">Todavía no hay documentos registrados.</Text>
        ) : (
          <View className="gap-2">
            {documentos.map((doc) => {
              const estilo = ESTILO_ESTADO_DOCUMENTO[doc.estado];
              return (
                <View
                  key={doc.id}
                  className="bg-surfaceContainerLowest rounded-xl border border-outlineVariant p-3 flex-row items-start"
                >
                  <View className="w-8 h-8 rounded-lg bg-surfaceContainerLow items-center justify-center mr-2.5 mt-0.5">
                    <Feather name={ICONO_TIPO_DOCUMENTO[doc.tipo]} size={14} color={colors.onSurfaceVariant} />
                  </View>
                  <View className="flex-1">
                    <View className="flex-row justify-between items-start">
                      <Text className="text-onSurface text-sm font-bold flex-1 pr-2">
                        {ETIQUETA_TIPO_DOCUMENTO[doc.tipo]}
                      </Text>
                      <View className={`flex-row items-center gap-1 rounded-md px-2 py-0.5 ${estilo.badge}`}>
                        <Feather name={estilo.icono} size={9} color={colors.onSurfaceVariant} />
                        <Text className={`text-[10px] font-bold ${estilo.texto}`}>{estilo.etiqueta}</Text>
                      </View>
                    </View>
                    {doc.cobertura_eur !== null && (
                      <Text className="text-onSurfaceVariant text-xs mt-1">
                        Cobertura: {formatearMoneda(doc.cobertura_eur, 'EUR')}
                      </Text>
                    )}
                    {doc.fecha_vencimiento !== null && (
                      <Text className="text-onSurfaceVariant text-xs mt-0.5">
                        Vence: {formatearFecha(doc.fecha_vencimiento)}
                      </Text>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}
        <View className="bg-surfaceContainerLow rounded-lg px-3 py-2 mt-2 flex-row items-start gap-2">
          <Feather name="info" size={13} color={colors.onSurfaceVariant} style={{ marginTop: 1 }} />
          <Text className="text-onSurfaceVariant text-[11px] flex-1">
            La opción de subir o actualizar documentación llegará en una próxima fase.
          </Text>
        </View>

        {/* Obras completadas */}
        {obrasCompletadas.length > 0 && (
          <>
            <Text className="text-onSurface text-xs font-extrabold uppercase tracking-wider mt-6 mb-2">
              Obras adjudicadas
            </Text>
            <View className="gap-2">
              {obrasCompletadas.map((item) => (
                <View
                  key={item.id}
                  className="bg-surfaceContainerLowest rounded-xl border border-outlineVariant p-3 flex-row justify-between items-center"
                >
                  <View className="flex-row items-center flex-1 pr-2">
                    <Feather name="check-circle" size={14} color={colors.success} />
                    <Text className="text-onSurface text-sm font-semibold ml-2 flex-1">
                      {item.obras?.titulo ?? 'Obra'}
                    </Text>
                  </View>
                  <Text className="text-onSurface text-sm font-bold">
                    {formatearMoneda(item.oferta_economica, item.obras?.moneda ?? 'EUR')}
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* Cerrar sesión */}
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
