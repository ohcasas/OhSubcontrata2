import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable, Linking } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { obtenerUrlFirmada } from '../../services/storage';
import { colors } from '../../design-system/tokens';
import type { RootStackParamList } from '../../navigation/types';
import { ETIQUETA_NIVEL, progresoHaciaSiguiente } from '../../constants/niveles';
import type { NivelPartner } from '../../constants/niveles';
type TipoDocumento = 'alta_autonomo' | 'seguro_rc' | 'certificado_prl' | 'certificado_aeat_tgss' | 'otro';
type EstadoDocumento = 'vigente' | 'vencido' | 'pendiente_revision';

type Empresa = {
  id: string;
  nombre: string;
  cif: string | null;
  especialidad: string | null;
  direccion: string | null;
  homologado: boolean;
  nivel_partner: NivelPartner;
  puntos_disponibles: number;
  puntos_totales: number;
  rating_medio: number | null;
  obras_completadas: number;
};

type Contacto = {
  id: string;
  nombre_completo: string;
  telefono: string | null;
  email: string | null;
};

type Documento = {
  id: string;
  tipo: TipoDocumento;
  estado: EstadoDocumento;
  storage_path: string | null;
};

const ORDEN_ESTADOS: EstadoDocumento[] = ['pendiente_revision', 'vigente', 'vencido'];

const ETIQUETA_TIPO_DOCUMENTO: Record<TipoDocumento, string> = {
  alta_autonomo: 'Alta Autónomo / Modelo 036',
  seguro_rc: 'Seguro de Responsabilidad Civil',
  certificado_prl: 'Certificado PRL',
  certificado_aeat_tgss: 'Corriente de pagos AEAT y TGSS',
  otro: 'Otro documento',
};

const ESTILO_ESTADO_DOCUMENTO: Record<EstadoDocumento, { badge: string; texto: string; etiqueta: string }> = {
  vigente: { badge: 'bg-successTint', texto: 'text-success', etiqueta: 'Vigente' },
  vencido: { badge: 'bg-errorTint', texto: 'text-error', etiqueta: 'Vencido' },
  pendiente_revision: {
    badge: 'bg-warningTint',
    texto: 'text-warning',
    etiqueta: 'Pendiente de revisión',
  },
};

export default function GremioDetalleScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'GremioDetalle'>>();
  const route = useRoute<RouteProp<RootStackParamList, 'GremioDetalle'>>();
  const { empresaId } = route.params;

  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [contactos, setContactos] = useState<Contacto[]>([]);
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [actualizandoHomologacion, setActualizandoHomologacion] = useState(false);
  const [abriendoDocumentoId, setAbriendoDocumentoId] = useState<string | null>(null);
  const [actualizandoEstadoId, setActualizandoEstadoId] = useState<string | null>(null);

  const cargarDatos = useCallback(async () => {
    setErrorCarga(null);

    const [{ data: empresaData, error: errorEmpresa }, { data: contactosData }, { data: docsData }] =
      await Promise.all([
        supabase
          .from('empresas_subcontratistas')
          .select(
            'id, nombre, cif, especialidad, direccion, homologado, nivel_partner, puntos_disponibles, puntos_totales, rating_medio, obras_completadas',
          )
          .eq('id', empresaId)
          .single(),
        supabase
          .from('profiles')
          .select('id, nombre_completo, telefono, email')
          .eq('empresa_id', empresaId),
        supabase.from('documentos_homologacion').select('id, tipo, estado, storage_path').eq('empresa_id', empresaId),
      ]);

    if (errorEmpresa || !empresaData) {
      setErrorCarga('No se ha podido cargar esta empresa.');
      return;
    }
    setEmpresa(empresaData as Empresa);
    navigation.setOptions({ title: (empresaData as Empresa).nombre });
    setContactos((contactosData as Contacto[] | null) ?? []);
    setDocumentos((docsData as Documento[] | null) ?? []);
  }, [empresaId, navigation]);

  useEffect(() => {
    setCargando(true);
    cargarDatos().finally(() => setCargando(false));
  }, [cargarDatos]);

  const handleToggleHomologacion = async () => {
    if (empresa === null) return;
    setActualizandoHomologacion(true);
    const { error } = await supabase
      .from('empresas_subcontratistas')
      .update({ homologado: !empresa.homologado })
      .eq('id', empresa.id);
    setActualizandoHomologacion(false);

    if (!error) {
      setEmpresa({ ...empresa, homologado: !empresa.homologado });
    }
  };

  const handleValorar = async (estrellas: number) => {
    if (empresa === null) return;
    setEmpresa({ ...empresa, rating_medio: estrellas });
    await supabase.from('empresas_subcontratistas').update({ rating_medio: estrellas }).eq('id', empresa.id);
  };

  const handleAbrirDocumento = async (doc: Documento) => {
    if (doc.storage_path === null) return;
    setAbriendoDocumentoId(doc.id);
    try {
      const url = await obtenerUrlFirmada('documentos-homologacion', doc.storage_path);
      await Linking.openURL(url);
    } catch {
      setErrorCarga('No se ha podido abrir el documento.');
    } finally {
      setAbriendoDocumentoId(null);
    }
  };

  const handleCambiarEstadoDocumento = async (doc: Documento) => {
    const siguienteEstado =
      ORDEN_ESTADOS[(ORDEN_ESTADOS.indexOf(doc.estado) + 1) % ORDEN_ESTADOS.length];
    setActualizandoEstadoId(doc.id);
    const { error } = await supabase
      .from('documentos_homologacion')
      .update({ estado: siguienteEstado })
      .eq('id', doc.id);
    setActualizandoEstadoId(null);

    if (!error) {
      setDocumentos((prev) => prev.map((d) => (d.id === doc.id ? { ...d, estado: siguienteEstado } : d)));
    }
  };

  if (cargando) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <ActivityIndicator color={colors.action} />
      </View>
    );
  }

  if (errorCarga !== null || empresa === null) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas px-6">
        <Feather name="alert-triangle" size={28} color={colors.inkSubtle} />
        <Text className="text-ink text-base font-sansSemiBold text-center mt-3">
          {errorCarga ?? 'Empresa no encontrada.'}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-canvas" contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
      {/* Cabecera */}
      <View className="bg-surface border border-border rounded-xl p-3.5">
        <View className="flex-row justify-between items-start">
          <View className="flex-1 pr-2">
            <Text className="text-ink text-xl font-sansBold">{empresa.nombre}</Text>
            {empresa.cif !== null && (
              <Text className="text-inkMuted text-xs font-mono mt-0.5">{empresa.cif}</Text>
            )}
            {empresa.especialidad !== null && (
              <View className="flex-row items-center gap-1.5 mt-1">
                <Feather name="tool" size={14} color={colors.inkMuted} />
                <Text className="text-inkMuted text-sm">{empresa.especialidad}</Text>
              </View>
            )}
            {empresa.direccion !== null && (
              <View className="flex-row items-center gap-1.5 mt-0.5">
                <Feather name="map-pin" size={14} color={colors.inkMuted} />
                <Text className="text-inkMuted text-sm">{empresa.direccion}</Text>
              </View>
            )}
          </View>
          <View
            className={`flex-row items-center gap-1 rounded-md px-2 py-1 ${
              empresa.homologado ? 'bg-successTint' : 'bg-errorTint'
            }`}
          >
            <Feather
              name={empresa.homologado ? 'check-circle' : 'alert-triangle'}
              size={13}
              color={empresa.homologado ? colors.success : colors.error}
            />
            <Text className={`text-[13px] font-sansBold ${empresa.homologado ? 'text-success' : 'text-error'}`}>
              {empresa.homologado ? 'Homologada' : 'Sin homologar'}
            </Text>
          </View>
        </View>
      </View>

      {/* Stats */}
      <View className="flex-row mt-3 gap-2.5">
        <View className="flex-1 bg-surface border border-border rounded-xl p-3 items-center">
          <Feather name="award" size={16} color={colors.gold} />
          <Text className="text-ink text-base font-sansBold mt-1">
            {ETIQUETA_NIVEL[empresa.nivel_partner]}
          </Text>
          <Text className="text-inkMuted text-[12px] uppercase font-sansBold mt-0.5">
            {empresa.puntos_totales.toLocaleString('es-ES')} pts
          </Text>
          {(() => {
            const { siguiente, puntosFaltan } = progresoHaciaSiguiente(
              empresa.nivel_partner,
              empresa.puntos_totales,
            );
            return (
              <Text className="text-inkMuted text-[12px] text-center mt-1">
                {siguiente !== null
                  ? `Faltan ${puntosFaltan.toLocaleString('es-ES')} para ${ETIQUETA_NIVEL[siguiente]}`
                  : 'Nivel máximo'}
              </Text>
            );
          })()}
        </View>
        <View className="flex-1 bg-surface border border-border rounded-xl p-3 items-center">
          <Feather name="star" size={16} color={colors.gold} />
          <Text className="text-ink text-base font-sansBold mt-1">
            {empresa.rating_medio !== null ? empresa.rating_medio.toFixed(1) : '—'}
          </Text>
          <Text className="text-inkMuted text-[12px] uppercase font-sansBold mt-0.5">Valoración</Text>
        </View>
        <View className="flex-1 bg-surface border border-border rounded-xl p-3 items-center">
          <Feather name="home" size={16} color={colors.action} />
          <Text className="text-ink text-base font-sansBold mt-1">{empresa.obras_completadas}</Text>
          <Text className="text-inkMuted text-[12px] uppercase font-sansBold mt-0.5">Obras</Text>
        </View>
      </View>

      <View className="bg-surface border border-border rounded-xl p-3.5 mt-3">
        <Text className="text-ink text-xs font-sansBold uppercase mb-2" style={{ letterSpacing: 1 }}>
          Valorar empresa
        </Text>
        <View className="flex-row gap-1">
          {[1, 2, 3, 4, 5].map((estrella) => (
            <Pressable key={estrella} onPress={() => handleValorar(estrella)} className="p-1">
              <Feather
                name="star"
                size={26}
                color={colors.gold}
                style={
                  empresa.rating_medio !== null && estrella <= Math.round(empresa.rating_medio)
                    ? undefined
                    : { opacity: 0.25 }
                }
              />
            </Pressable>
          ))}
        </View>
      </View>

      <Pressable
        onPress={handleToggleHomologacion}
        disabled={actualizandoHomologacion}
        className={`rounded-xl py-3 items-center mt-3 ${
          empresa.homologado ? 'border border-error' : 'bg-action'
        }`}
      >
        <View className="flex-row items-center gap-2">
          {actualizandoHomologacion ? (
            <ActivityIndicator color={empresa.homologado ? colors.error : colors.white} />
          ) : (
            <Feather
              name={empresa.homologado ? 'x-circle' : 'check-circle'}
              size={16}
              color={empresa.homologado ? colors.error : colors.white}
            />
          )}
          <Text className={`font-sansBold text-sm ${empresa.homologado ? 'text-error' : 'text-white'}`}>
            {empresa.homologado ? 'Quitar homologación' : 'Homologar empresa'}
          </Text>
        </View>
      </Pressable>

      {/* Contactos */}
      <Text className="text-ink text-xs font-sansBold uppercase mt-6 mb-2" style={{ letterSpacing: 1 }}>
        Personas de contacto
      </Text>
      {contactos.length === 0 ? (
        <Text className="text-inkMuted text-sm">Sin contactos registrados.</Text>
      ) : (
        <View className="gap-2">
          {contactos.map((c) => (
            <View
              key={c.id}
              className="bg-surface rounded-xl border border-border p-3.5"
            >
              <Text className="text-ink text-sm font-sansBold">{c.nombre_completo}</Text>
              <View className="flex-row gap-2 mt-2">
                {c.email !== null && (
                  <Pressable
                    onPress={() => Linking.openURL(`mailto:${c.email}`)}
                    className="flex-1 flex-row items-center justify-center gap-1.5 bg-canvas border border-border rounded-lg py-2"
                  >
                    <Feather name="mail" size={14} color={colors.action} />
                    <Text className="text-action text-xs font-sansSemiBold" numberOfLines={1}>
                      {c.email}
                    </Text>
                  </Pressable>
                )}
                {c.telefono !== null && (
                  <Pressable
                    onPress={() => Linking.openURL(`tel:${c.telefono}`)}
                    className="flex-row items-center justify-center gap-1.5 bg-canvas border border-border rounded-lg py-2 px-3"
                  >
                    <Feather name="phone" size={14} color={colors.action} />
                    <Text className="text-action text-xs font-sansSemiBold">{c.telefono}</Text>
                  </Pressable>
                )}
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Documentos de homologación */}
      <Text className="text-ink text-xs font-sansBold uppercase mt-6 mb-2" style={{ letterSpacing: 1 }}>
        Homologación legal y PRL
      </Text>
      {documentos.length > 0 && (
        <Text className="text-inkMuted text-[13px] mb-2">
          Toca un documento para abrirlo, o su estado para cambiarlo.
        </Text>
      )}
      {documentos.length === 0 ? (
        <Text className="text-inkMuted text-sm">Todavía no hay documentos registrados.</Text>
      ) : (
        <View className="gap-2">
          {documentos.map((doc) => {
            const estilo = ESTILO_ESTADO_DOCUMENTO[doc.estado];
            return (
              <View
                key={doc.id}
                className="bg-surface rounded-xl border border-border p-3 flex-row justify-between items-center"
              >
                <Pressable
                  onPress={() => handleAbrirDocumento(doc)}
                  disabled={doc.storage_path === null || abriendoDocumentoId === doc.id}
                  className="flex-row items-center flex-1 pr-2 gap-1.5"
                >
                  {abriendoDocumentoId === doc.id ? (
                    <ActivityIndicator size="small" color={colors.inkMuted} />
                  ) : doc.storage_path !== null ? (
                    <Feather name="paperclip" size={14} color={colors.action} />
                  ) : null}
                  <Text className="text-ink text-sm font-sansSemiBold flex-1">
                    {ETIQUETA_TIPO_DOCUMENTO[doc.tipo]}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => handleCambiarEstadoDocumento(doc)}
                  disabled={actualizandoEstadoId === doc.id}
                  className={`rounded-md px-2 py-0.5 ${estilo.badge}`}
                >
                  {actualizandoEstadoId === doc.id ? (
                    <ActivityIndicator size="small" color={colors.inkMuted} />
                  ) : (
                    <Text className={`text-[12px] font-sansBold ${estilo.texto}`}>{estilo.etiqueta}</Text>
                  )}
                </Pressable>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}