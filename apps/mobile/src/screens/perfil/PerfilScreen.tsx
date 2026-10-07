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
  Linking,
  Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Feather } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { supabase } from '../../services/supabase';
import { cerrarSesion } from '../../services/sesion';
import { subirImagenPublica, subirArchivoPrivado, obtenerUrlFirmada } from '../../services/storage';
import { colors } from '../../design-system/tokens';
import ScreenHeader from '../../components/ScreenHeader';
import PerfilPorRol from './PerfilPorRol';
import CampanaNotificaciones from '../../components/CampanaNotificaciones';
import { URL_POLITICA_PRIVACIDAD, URL_AVISO_LEGAL, URL_TERMINOS } from '../../constants/enlaces';
import { formatearMoneda } from '../../utils/moneda';

type NombreIcono = ComponentProps<typeof Feather>['name'];

type Perfil = {
  nombre_completo: string;
  telefono: string | null;
  bio: string | null;
  avatar_url: string | null;
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
  storage_path: string | null;
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
  { badge: string; texto: string; etiqueta: string; icono: NombreIcono; icocolor: string }
> = {
  vigente: { badge: 'bg-successTint', texto: 'text-success', etiqueta: 'Vigente', icono: 'check-circle', icocolor: colors.success },
  vencido: { badge: 'bg-errorTint', texto: 'text-error', etiqueta: 'Vencido', icono: 'alert-triangle', icocolor: colors.error },
  pendiente_revision: {
    badge: 'bg-warningTint',
    texto: 'text-warning',
    etiqueta: 'Pendiente de revisión',
    icono: 'clock',
    icocolor: colors.warning,
  },
};

function formatearFecha(fechaIso: string | null): string | null {
  if (fechaIso === null) return null;
  return new Date(fechaIso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}


const ETIQUETA_PERFIL: Record<string, string> = {
  referidor: 'Recomendador',
  promotor: 'Promotor',
  constructora: 'Constructora',
  arquitecto: 'Arquitecto',
  proveedor: 'Proveedor',
  profesional: 'Profesional',
  administrador: 'Inmobiliaria / Administrador',
};

export default function PerfilScreen() {
  const [usuarioId, setUsuarioId] = useState<string | null>(null);
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [obrasCompletadas, setObrasCompletadas] = useState<ObraCompletada[]>([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rol, setRol] = useState<string | null>(null);
  // Las cifras de obras/homologación, la documentación y el historial de
  // obras son de los Oficios (subcontratistas). El resto de perfiles de
  // OH Conecta no los usan, así que no se les enseñan.
  const esSubcontratista = rol === 'subcontratista';
  const [cerrandoSesion, setCerrandoSesion] = useState(false);
  const [eliminandoCuenta, setEliminandoCuenta] = useState(false);
  const [bioEnEdicion, setBioEnEdicion] = useState('');
  const [editandoBio, setEditandoBio] = useState(false);
  const [guardandoBio, setGuardandoBio] = useState(false);
  const [subiendoAvatar, setSubiendoAvatar] = useState(false);
  const [falloAvatar, setFalloAvatar] = useState(false);
  const [mostrandoFormDocumento, setMostrandoFormDocumento] = useState(false);
  const [tipoDocumentoNuevo, setTipoDocumentoNuevo] = useState<TipoDocumento>('alta_autonomo');
  const [archivoDocumentoNuevo, setArchivoDocumentoNuevo] = useState<{
    uri: string;
    nombre: string;
    mimeType: string;
  } | null>(null);
  const [subiendoDocumento, setSubiendoDocumento] = useState(false);
  const [abriendoDocumentoId, setAbriendoDocumentoId] = useState<string | null>(null);

  const cargarTodo = useCallback(async () => {
    setError(null);

    const { data: userData } = await supabase.auth.getUser();
    const usuarioIdActual = userData.user?.id;
    if (!usuarioIdActual) return;
    setUsuarioId(usuarioIdActual);

    const { data: perfilData, error: errorPerfil } = await supabase
      .from('profiles')
      .select('nombre_completo, telefono, bio, avatar_url, empresa_id, role')
      .eq('id', usuarioIdActual)
      .single();

    if (errorPerfil || !perfilData) {
      setError('No se ha podido cargar tu perfil.');
      return;
    }
    setPerfil({
      nombre_completo: perfilData.nombre_completo,
      telefono: perfilData.telefono,
      bio: perfilData.bio,
      avatar_url: perfilData.avatar_url,
    });
    setRol(perfilData.role as string);

    const idEmpresa = perfilData.empresa_id as string | null;
    setEmpresaId(idEmpresa);
    if (!idEmpresa) return;

    const [{ data: empresaData }, { data: docsData }, { data: obrasData }] = await Promise.all([
      supabase
        .from('empresas_subcontratistas')
        .select('nombre, especialidad, homologado, rating_medio, obras_completadas')
        .eq('id', idEmpresa)
        .single(),
      supabase
        .from('documentos_homologacion')
        .select('id, tipo, estado, descripcion, cobertura_eur, fecha_vencimiento, storage_path')
        .eq('empresa_id', idEmpresa)
        .order('tipo', { ascending: true }),
      supabase
        .from('postulaciones')
        .select('id, oferta_economica, obras(titulo, moneda)')
        .eq('empresa_id', idEmpresa)
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
      setPerfil((prev) => (prev !== null ? { ...prev, avatar_url: url } : prev));
      setFalloAvatar(false);
    } catch {
      setError('No se ha podido actualizar tu foto de perfil.');
    } finally {
      setSubiendoAvatar(false);
    }
  };

  const handleElegirArchivoDocumento = async () => {
    const resultado = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/*'],
      copyToCacheDirectory: true,
    });
    if (resultado.canceled) return;
    const asset = resultado.assets[0];
    setArchivoDocumentoNuevo({
      uri: asset.uri,
      nombre: asset.name,
      mimeType: asset.mimeType ?? 'application/octet-stream',
    });
  };

  const handleSubirDocumento = async () => {
    if (empresaId === null || archivoDocumentoNuevo === null) return;
    setSubiendoDocumento(true);
    try {
      const storagePath = await subirArchivoPrivado(
        'documentos-homologacion',
        empresaId,
        archivoDocumentoNuevo.uri,
        archivoDocumentoNuevo.mimeType,
        archivoDocumentoNuevo.nombre,
      );
      const { data, error: errorInsert } = await supabase
        .from('documentos_homologacion')
        .insert({
          empresa_id: empresaId,
          tipo: tipoDocumentoNuevo,
          storage_path: storagePath,
        })
        .select('id, tipo, estado, descripcion, cobertura_eur, fecha_vencimiento, storage_path')
        .single();

      if (errorInsert || !data) throw errorInsert ?? new Error('sin datos');

      setDocumentos((prev) => [...prev, data as Documento]);
      setArchivoDocumentoNuevo(null);
      setMostrandoFormDocumento(false);
    } catch {
      setError('No se ha podido subir el documento.');
    } finally {
      setSubiendoDocumento(false);
    }
  };

  const handleAbrirDocumento = async (doc: Documento) => {
    if (doc.storage_path === null) return;
    setAbriendoDocumentoId(doc.id);
    try {
      const url = await obtenerUrlFirmada('documentos-homologacion', doc.storage_path);
      await Linking.openURL(url);
    } catch {
      setError('No se ha podido abrir el documento.');
    } finally {
      setAbriendoDocumentoId(null);
    }
  };

  const handleEmpezarEdicionBio = () => {
    setBioEnEdicion(perfil?.bio ?? '');
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

    if (!errorUpdate && perfil !== null) {
      setPerfil({ ...perfil, bio: bioEnEdicion.trim() || null });
      setEditandoBio(false);
    }
  };

  const handleCerrarSesion = async () => {
    setCerrandoSesion(true);
    await cerrarSesion();
    // Sin manejo manual de navegación: RootNavigator detecta la sesión
    // nula vía onAuthStateChange y vuelve solo a la pantalla de Login.
  };

  const handleEliminarCuenta = () => {
    Alert.alert(
      'Eliminar tu cuenta',
      'Se borrarán tu nombre, teléfono, foto, biografía y los documentos de verificación que hayas subido, y dejarás de poder acceder con este usuario. Las obras y puntos de tu empresa no se ven afectados. Esta acción no se puede deshacer. ¿Seguro que quieres continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar mi cuenta',
          style: 'destructive',
          onPress: async () => {
            setEliminandoCuenta(true);
            const fallar = (mensaje: string) => {
              setEliminandoCuenta(false);
              setError(`No se ha podido eliminar la cuenta: ${mensaje}`);
            };

            // 1) Se comprueba que se puede borrar ANTES de tocar nada (comisiones sin cobrar,
            //    licitaciones abiertas...): así no se pierden documentos si algo lo impide.
            const { error: errorComprobacion } = await supabase.rpc('comprobar_eliminacion_cuenta');
            if (errorComprobacion) {
              fallar(errorComprobacion.message);
              return;
            }

            // 2) Se borran del almacén los documentos de verificación de la persona. La base de
            //    datos no puede hacerlo (Supabase no deja borrar archivos desde SQL).
            const { data: usuario } = await supabase.auth.getUser();
            const uid = usuario.user?.id;
            if (uid !== undefined) {
              const almacen = supabase.storage.from('documentos-verificacion');
              const { data: archivos, error: errorListado } = await almacen.list(uid);
              if (errorListado) {
                fallar('no se han podido borrar tus documentos. Inténtalo de nuevo.');
                return;
              }
              if (archivos !== null && archivos.length > 0) {
                const { error: errorBorrado } = await almacen.remove(archivos.map((a) => `${uid}/${a.name}`));
                if (errorBorrado) {
                  fallar('no se han podido borrar tus documentos. Inténtalo de nuevo.');
                  return;
                }
              }
            }

            // 3) Ahora sí, la cuenta
            const { error: errorRpc } = await supabase.rpc('eliminar_mi_cuenta');
            if (errorRpc) {
              fallar(errorRpc.message);
              return;
            }
            // La fila de auth.users ya no existe: cerrar sesión limpia el
            // token local y RootNavigator vuelve solo a Login.
            await supabase.auth.signOut();
          },
        },
      ],
    );
  };

  if (cargando) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <ActivityIndicator color={colors.action} />
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
    <View className="flex-1 bg-canvas">
      <ScreenHeader title="Perfil" rightElement={<CampanaNotificaciones />} />

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

        {/* Cabecera de perfil */}
        <View className="bg-surface rounded-2xl border border-border p-4 flex-row items-center">
          <Pressable onPress={handleCambiarAvatar} disabled={subiendoAvatar} className="mr-3.5">
            {perfil?.avatar_url && !falloAvatar ? (
              <Image
                source={{ uri: perfil.avatar_url }}
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
            <Text className="text-ink text-base font-sansBold">{perfil?.nombre_completo ?? 'Sin nombre'}</Text>
            {rol !== null && !esSubcontratista && ETIQUETA_PERFIL[rol] !== undefined && (
              <View className="self-start bg-actionTint rounded-md px-2 py-0.5 mt-1">
                <Text className="text-action text-[12px] font-sansBold">{ETIQUETA_PERFIL[rol]}</Text>
              </View>
            )}
            {empresa !== null && (
              <>
                <Text className="text-inkMuted text-sm mt-0.5">{empresa.nombre}</Text>
                {empresa.especialidad !== null && (
                  <View className="flex-row items-center gap-1 mt-0.5">
                    <Feather name="tool" size={13} color={colors.inkMuted} />
                    <Text className="text-inkMuted text-xs">{empresa.especialidad}</Text>
                  </View>
                )}
              </>
            )}
          </View>
        </View>

        {esSubcontratista && empresa !== null && (
          <View className="flex-row mt-3 gap-2.5">
            <View className="flex-1 bg-surface border border-border rounded-xl p-3 items-center">
              <Feather name="star" size={16} color={colors.gold} />
              <Text className="text-ink text-lg font-sansBold mt-1">
                {empresa.rating_medio !== null ? empresa.rating_medio.toFixed(1) : '—'}
              </Text>
              <Text className="text-inkMuted text-[12px] uppercase font-sansBold mt-0.5">Valoración</Text>
            </View>
            <View className="flex-1 bg-surface border border-border rounded-xl p-3 items-center">
              <Feather name="home" size={16} color={colors.action} />
              <Text className="text-ink text-lg font-sansBold mt-1">{empresa.obras_completadas}</Text>
              <Text className="text-inkMuted text-[12px] uppercase font-sansBold mt-0.5">Obras OH</Text>
            </View>
            <View className="flex-1 bg-surface border border-border rounded-xl p-3 items-center">
              <Feather
                name={empresa.homologado ? 'check-circle' : 'x-circle'}
                size={16}
                color={empresa.homologado ? colors.success : colors.inkMuted}
              />
              <Text className={`text-lg font-sansBold mt-1 ${empresa.homologado ? 'text-success' : 'text-inkMuted'}`}>
                {empresa.homologado ? 'Sí' : 'No'}
              </Text>
              <Text className="text-inkMuted text-[12px] uppercase font-sansBold mt-0.5">Homologado</Text>
            </View>
          </View>
        )}

        {/* Biografía / descripción */}
        <View className="bg-surface rounded-2xl border border-border p-4 mt-3">
          <View className="flex-row justify-between items-center mb-2">
            <Text className="text-ink text-xs font-sansBold uppercase" style={{ letterSpacing: 1 }}>
              Sobre mí
            </Text>
            {!editandoBio && (
              <Pressable onPress={handleEmpezarEdicionBio} className="flex-row items-center gap-1">
                <Feather name="edit-2" size={14} color={colors.action} />
                <Text className="text-action text-xs font-sansSemiBold">{perfil?.bio ? 'Editar' : 'Añadir'}</Text>
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
                placeholder="Cuéntanos sobre tu equipo, experiencia o especialidad..."
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
              {perfil?.bio ? perfil.bio : 'Todavía no has añadido una descripción.'}
            </Text>
          )}
        </View>

        {/* Contenido propio de cada tipo de cuenta (todos menos Oficios) */}
        {rol !== null && !esSubcontratista && usuarioId !== null && (
          <PerfilPorRol rol={rol} userId={usuarioId} />
        )}

        {esSubcontratista && (
          <>
        {/* Documentación */}
        <View className="flex-row justify-between items-center mt-6 mb-2">
          <Text className="text-ink text-xs font-sansBold uppercase" style={{ letterSpacing: 1 }}>
            Homologación legal y PRL
          </Text>
          {!mostrandoFormDocumento && (
            <Pressable onPress={() => setMostrandoFormDocumento(true)} className="flex-row items-center gap-1">
              <Feather name="plus" size={14} color={colors.action} />
              <Text className="text-action text-xs font-sansSemiBold">Añadir</Text>
            </Pressable>
          )}
        </View>
        {documentos.length === 0 ? (
          <Text className="text-inkMuted text-sm">Todavía no hay documentos registrados.</Text>
        ) : (
          <View className="gap-2">
            {documentos.map((doc) => {
              const estilo = ESTILO_ESTADO_DOCUMENTO[doc.estado];
              return (
                <Pressable
                  key={doc.id}
                  onPress={() => handleAbrirDocumento(doc)}
                  disabled={doc.storage_path === null || abriendoDocumentoId === doc.id}
                  className="bg-surface rounded-xl border border-border p-3 flex-row items-start"
                >
                  <View className="w-8 h-8 rounded-lg bg-canvas items-center justify-center mr-2.5 mt-0.5">
                    {abriendoDocumentoId === doc.id ? (
                      <ActivityIndicator size="small" color={colors.inkMuted} />
                    ) : (
                      <Feather name={ICONO_TIPO_DOCUMENTO[doc.tipo]} size={15} color={colors.inkMuted} />
                    )}
                  </View>
                  <View className="flex-1">
                    <View className="flex-row justify-between items-start">
                      <Text className="text-ink text-sm font-sansBold flex-1 pr-2">
                        {ETIQUETA_TIPO_DOCUMENTO[doc.tipo]}
                      </Text>
                      <View className={`flex-row items-center gap-1 rounded-md px-2 py-0.5 ${estilo.badge}`}>
                        <Feather name={estilo.icono} size={11} color={estilo.icocolor} />
                        <Text className={`text-[12px] font-sansBold ${estilo.texto}`}>{estilo.etiqueta}</Text>
                      </View>
                    </View>
                    {doc.cobertura_eur !== null && (
                      <Text className="text-inkMuted text-xs mt-1">
                        Cobertura: {formatearMoneda(doc.cobertura_eur, 'EUR')}
                      </Text>
                    )}
                    {doc.fecha_vencimiento !== null && (
                      <Text className="text-inkMuted text-xs mt-0.5">
                        Vence: {formatearFecha(doc.fecha_vencimiento)}
                      </Text>
                    )}
                    {doc.storage_path !== null && (
                      <View className="flex-row items-center gap-1 mt-1">
                        <Feather name="paperclip" size={12} color={colors.action} />
                        <Text className="text-action text-[13px] font-sansSemiBold">Ver archivo</Text>
                      </View>
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}

        {mostrandoFormDocumento && (
          <View className="bg-surface rounded-xl border border-border p-3.5 mt-2">
            <Text className="text-ink text-xs font-sansSemiBold mb-2">Tipo de documento</Text>
            <View className="flex-row flex-wrap gap-1.5 mb-3">
              {(Object.keys(ETIQUETA_TIPO_DOCUMENTO) as TipoDocumento[]).map((tipo) => (
                <Pressable
                  key={tipo}
                  onPress={() => setTipoDocumentoNuevo(tipo)}
                  className={`rounded-md px-2.5 py-1.5 ${
                    tipoDocumentoNuevo === tipo ? 'bg-action' : 'bg-canvas'
                  }`}
                >
                  <Text
                    className={`text-[13px] font-sansSemiBold ${
                      tipoDocumentoNuevo === tipo ? 'text-white' : 'text-inkMuted'
                    }`}
                  >
                    {ETIQUETA_TIPO_DOCUMENTO[tipo]}
                  </Text>
                </Pressable>
              ))}
            </View>

            {archivoDocumentoNuevo !== null ? (
              <View className="flex-row items-center gap-2 bg-canvas rounded-xl px-3 py-2.5 mb-3">
                <Feather name="paperclip" size={15} color={colors.action} />
                <Text className="text-ink text-xs font-sansSemiBold flex-1" numberOfLines={1}>
                  {archivoDocumentoNuevo.nombre}
                </Text>
                <Pressable onPress={() => setArchivoDocumentoNuevo(null)} disabled={subiendoDocumento}>
                  <Feather name="x" size={15} color={colors.inkMuted} />
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={handleElegirArchivoDocumento}
                disabled={subiendoDocumento}
                className="flex-row items-center justify-center gap-2 border border-dashed border-border rounded-xl py-3 mb-3"
              >
                <Feather name="paperclip" size={15} color={colors.inkMuted} />
                <Text className="text-inkMuted text-xs font-sansSemiBold">Elegir archivo (PDF o imagen)</Text>
              </Pressable>
            )}

            <View className="flex-row gap-2">
              <Pressable
                onPress={() => {
                  setMostrandoFormDocumento(false);
                  setArchivoDocumentoNuevo(null);
                }}
                disabled={subiendoDocumento}
                className="flex-1 border border-border rounded-lg py-2 items-center"
              >
                <Text className="text-inkMuted text-xs font-sansSemiBold">Cancelar</Text>
              </Pressable>
              <Pressable
                onPress={handleSubirDocumento}
                disabled={subiendoDocumento || archivoDocumentoNuevo === null}
                className="flex-1 bg-action rounded-lg py-2 items-center flex-row justify-center gap-1.5"
              >
                {subiendoDocumento ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Feather name="upload" size={15} color={colors.white} />
                )}
                <Text className="text-white text-xs font-sansBold">Subir</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Obras completadas */}
        {obrasCompletadas.length > 0 && (
          <>
            <Text className="text-ink text-xs font-sansBold uppercase mt-6 mb-2" style={{ letterSpacing: 1 }}>
              Obras adjudicadas
            </Text>
            <View className="gap-2">
              {obrasCompletadas.map((item) => (
                <View
                  key={item.id}
                  className="bg-surface rounded-xl border border-border p-3 flex-row justify-between items-center"
                >
                  <View className="flex-row items-center flex-1 pr-2">
                    <Feather name="check-circle" size={15} color={colors.success} />
                    <Text className="text-ink text-sm font-sansSemiBold ml-2 flex-1">
                      {item.obras?.titulo ?? 'Obra'}
                    </Text>
                  </View>
                  <Text className="text-ink text-sm font-sansBold">
                    {formatearMoneda(item.oferta_economica, item.obras?.moneda ?? 'EUR')}
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}

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
              <Feather name="log-out" size={16} color={colors.error} />
            )}
            <Text className="text-error font-sansBold text-sm">Cerrar sesión</Text>
          </View>
        </Pressable>

        <Pressable
          onPress={handleEliminarCuenta}
          disabled={eliminandoCuenta || cerrandoSesion}
          className="items-center py-3 mt-2"
        >
          {eliminandoCuenta ? (
            <ActivityIndicator size="small" color={colors.inkMuted} />
          ) : (
            <Text className="text-inkMuted text-xs underline">Eliminar mi cuenta</Text>
          )}
        </Pressable>

        <Pressable onPress={() => Linking.openURL(URL_POLITICA_PRIVACIDAD)} className="items-center py-2">
          <Text className="text-inkMuted text-xs underline">Política de privacidad</Text>
        </Pressable>
        <Pressable onPress={() => Linking.openURL(URL_TERMINOS)} className="items-center py-2">
          <Text className="text-inkMuted text-xs underline">Términos y condiciones</Text>
        </Pressable>
        <Pressable onPress={() => Linking.openURL(URL_AVISO_LEGAL)} className="items-center py-2">
          <Text className="text-inkMuted text-xs underline">Aviso legal</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}