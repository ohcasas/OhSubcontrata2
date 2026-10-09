/**
 * Bloques del Perfil que dependen del tipo de cuenta. PerfilScreen enseña lo
 * común a todos (foto, nombre, bio, cerrar sesión...) y, debajo, monta esto
 * para los perfiles que NO son Oficios (los Oficios tienen su propio
 * contenido: valoración, obras, homologación y documentación).
 */
import { useCallback, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NavigationProp, ParamListBase } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { colors } from '../../design-system/tokens';
import { formatearMoneda } from '../../utils/moneda';

const ROLES_TABLON = ['promotor', 'constructora', 'administrador'];
const ROLES_DIRECTORIO = ['proveedor', 'arquitecto', 'profesional'];
const ROLES_CONECTA = [...ROLES_TABLON, ...ROLES_DIRECTORIO];

function Titulo({ texto }: { texto: string }) {
  return (
    <Text className="text-ink text-xs font-sansBold uppercase mt-5 mb-2" style={{ letterSpacing: 1 }}>
      {texto}
    </Text>
  );
}

function Cifra({ icono, valor, etiqueta }: { icono: keyof typeof Feather.glyphMap; valor: string; etiqueta: string }) {
  return (
    <View className="flex-1 bg-surface border border-border rounded-xl p-3 items-center">
      <Feather name={icono} size={16} color={colors.action} />
      <Text className="text-ink text-lg font-sansBold mt-1">{valor}</Text>
      <Text className="text-inkMuted text-[12px] uppercase font-sansBold mt-0.5 text-center">{etiqueta}</Text>
    </View>
  );
}

function Cargando() {
  return (
    <View className="py-4 items-center">
      <ActivityIndicator color={colors.action} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Recomendador: su actividad y sus comisiones
// ---------------------------------------------------------------------------
function ResumenRecomendador({ userId }: { userId: string }) {
  const [cargando, setCargando] = useState(true);
  const [referencias, setReferencias] = useState<{ estado: string }[]>([]);
  const [recompensas, setRecompensas] = useState<{ estado: string; importe: number }[]>([]);

  useFocusEffect(
    useCallback(() => {
      let activo = true;
      (async () => {
        const [{ data: refs }, { data: recs }] = await Promise.all([
          supabase.from('referencias_comerciales').select('estado').eq('referidor_id', userId),
          supabase.from('recompensas_referido').select('estado, importe').eq('referidor_id', userId),
        ]);
        if (!activo) return;
        setReferencias((refs as { estado: string }[] | null) ?? []);
        setRecompensas((recs as { estado: string; importe: number }[] | null) ?? []);
        setCargando(false);
      })();
      return () => {
        activo = false;
      };
    }, [userId]),
  );

  const enCurso = referencias.filter((r) => !['venta', 'comision_disponible', 'descartado'].includes(r.estado)).length;
  const ventas = referencias.filter((r) => ['venta', 'comision_disponible'].includes(r.estado)).length;
  const suma = (estado: string) =>
    recompensas.filter((r) => r.estado === estado).reduce((acc, r) => acc + Number(r.importe), 0);

  const filas: { etiqueta: string; estado: string; color: string }[] = [
    { etiqueta: 'Por aceptar', estado: 'pendiente', color: colors.warning },
    { etiqueta: 'Aceptadas, pendientes de cobro', estado: 'aceptada', color: colors.action },
    { etiqueta: 'Cobradas', estado: 'pagada', color: colors.success },
  ];

  return (
    <View>
      <Titulo texto="Mi actividad" />
      {cargando ? (
        <Cargando />
      ) : (
        <>
          <View className="flex-row gap-2.5">
            <Cifra icono="send" valor={String(referencias.length)} etiqueta="Enviadas" />
            <Cifra icono="clock" valor={String(enCurso)} etiqueta="En curso" />
            <Cifra icono="check-circle" valor={String(ventas)} etiqueta="Ventas" />
          </View>

          <Titulo texto="Mis comisiones" />
          <View className="bg-surface rounded-2xl border border-border px-4">
            {filas.map((f, i) => (
              <View
                key={f.estado}
                className={`flex-row justify-between items-center py-3 ${i > 0 ? 'border-t border-border' : ''}`}
              >
                <Text className="text-inkMuted text-sm flex-1 pr-2">{f.etiqueta}</Text>
                <Text className="text-sm font-sansBold" style={{ color: f.color }}>
                  {formatearMoneda(suma(f.estado))}
                </Text>
              </View>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Promotor / Constructora / Administrador: sus publicaciones del Tablón
// ---------------------------------------------------------------------------
type Publicacion = { id: string; tipo: string; titulo: string; created_at: string };

function MisPublicaciones({ userId, rol }: { userId: string; rol: string }) {
  const [cargando, setCargando] = useState(true);
  const [publicaciones, setPublicaciones] = useState<Publicacion[]>([]);
  const [borrandoId, setBorrandoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const { data } = await supabase
      .from('publicaciones_tablon')
      .select('id, tipo, titulo, created_at')
      .eq('autor_id', userId)
      .order('created_at', { ascending: false });
    setPublicaciones((data as Publicacion[] | null) ?? []);
    setCargando(false);
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [cargar]),
  );

  const confirmarBorrado = (pub: Publicacion) => {
    Alert.alert('Borrar publicación', `¿Quitar «${pub.titulo}» del tablón? Dejará de verla todo el mundo.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar',
        style: 'destructive',
        onPress: async () => {
          setError(null);
          setBorrandoId(pub.id);
          const { error: errorDelete } = await supabase.from('publicaciones_tablon').delete().eq('id', pub.id);
          setBorrandoId(null);
          if (errorDelete) {
            setError(errorDelete.message);
            return;
          }
          cargar();
        },
      },
    ]);
  };

  return (
    <View>
      <Titulo texto={rol === 'administrador' ? 'Mis avisos' : 'Mis necesidades publicadas'} />
      {error !== null && <Text className="text-error text-xs mb-2">{error}</Text>}
      {cargando ? (
        <Cargando />
      ) : publicaciones.length === 0 ? (
        <Text className="text-inkMuted text-sm">Todavía no has publicado nada. Puedes hacerlo desde la pestaña Tablón.</Text>
      ) : (
        <View className="gap-2">
          {publicaciones.map((pub) => (
            <View key={pub.id} className="bg-surface border border-border rounded-xl p-3 flex-row items-center">
              <View className="flex-1 pr-2">
                <Text className="text-ink text-sm font-sansBold">{pub.titulo}</Text>
                <Text className="text-inkMuted text-xs mt-0.5">
                  {new Date(pub.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
                </Text>
              </View>
              {borrandoId === pub.id ? (
                <ActivityIndicator size="small" color={colors.error} />
              ) : (
                <Pressable onPress={() => confirmarBorrado(pub)} hitSlop={8}>
                  <Feather name="trash-2" size={16} color={colors.error} />
                </Pressable>
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Arquitecto / Proveedor / Profesional: resumen de su ficha del Directorio
// ---------------------------------------------------------------------------
type FichaResumen = { nombre_mostrar: string; categoria: string | null; zona_cobertura: string | null; descripcion: string | null };

function MiFichaResumen({ userId }: { userId: string }) {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const [cargando, setCargando] = useState(true);
  const [ficha, setFicha] = useState<FichaResumen | null>(null);

  useFocusEffect(
    useCallback(() => {
      let activo = true;
      supabase
        .from('fichas_directorio')
        .select('nombre_mostrar, categoria, zona_cobertura, descripcion')
        .eq('profile_id', userId)
        .maybeSingle()
        .then(({ data }) => {
          if (!activo) return;
          setFicha((data as FichaResumen | null) ?? null);
          setCargando(false);
        });
      return () => {
        activo = false;
      };
    }, [userId]),
  );

  // Qué le falta a la ficha para estar completa: así sabe qué mejorar.
  const faltan: string[] = [];
  if (ficha !== null) {
    if (!ficha.categoria) faltan.push('categoría');
    if (!ficha.zona_cobertura) faltan.push('zona de cobertura');
    if (!ficha.descripcion) faltan.push('descripción');
  }

  return (
    <View>
      <Titulo texto="Mi ficha en el Directorio" />
      {cargando ? (
        <Cargando />
      ) : (
        <View className="bg-surface border border-border rounded-2xl p-4">
          {ficha === null ? (
            <Text className="text-inkMuted text-sm">
              Todavía no tienes ficha. Sin ella, el resto de cuentas no puede encontrarte en el Directorio.
            </Text>
          ) : (
            <>
              <View className="flex-row items-center gap-1.5">
                <Feather name="check-circle" size={14} color={colors.success} />
                <Text className="text-ink text-sm font-sansBold flex-1">{ficha.nombre_mostrar}</Text>
              </View>
              <Text className="text-inkMuted text-xs mt-1">
                {faltan.length === 0
                  ? 'Tu ficha está completa y visible en el Directorio.'
                  : `Publicada. Para completarla, añade: ${faltan.join(', ')}.`}
              </Text>
            </>
          )}
          <Pressable
            onPress={() => navigation.navigate('Directorio')}
            className="bg-action rounded-lg py-2.5 items-center flex-row justify-center gap-1.5 mt-3"
          >
            <Feather name="edit-2" size={13} color={colors.white} />
            <Text className="text-white text-xs font-sansBold">{ficha === null ? 'Crear mi ficha' : 'Editar mi ficha'}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Los 6 perfiles de 3B Conecta: la cuenta es gratuita de momento
// ---------------------------------------------------------------------------
function AvisoGratuito() {
  return (
    <View className="bg-actionTint rounded-xl p-3.5 mt-5 flex-row items-start gap-2.5">
      <Feather name="info" size={15} color={colors.action} style={{ marginTop: 1 }} />
      <Text className="text-ink text-xs flex-1 leading-relaxed">
        Tu cuenta es gratuita durante el lanzamiento de 3B Conecta.
      </Text>
    </View>
  );
}

export default function PerfilPorRol({ rol, userId }: { rol: string; userId: string }) {
  return (
    <View>
      {(rol === 'referidor' || rol === 'administrador') && <ResumenRecomendador userId={userId} />}
      {ROLES_TABLON.includes(rol) && <MisPublicaciones userId={userId} rol={rol} />}
      {ROLES_DIRECTORIO.includes(rol) && <MiFichaResumen userId={userId} />}
      {ROLES_CONECTA.includes(rol) && <AvisoGratuito />}
    </View>
  );
}