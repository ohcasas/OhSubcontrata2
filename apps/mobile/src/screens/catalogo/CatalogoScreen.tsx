import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Image, RefreshControl, StyleSheet, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { colors } from '../../design-system/tokens';
import ScreenHeader from '../../components/ScreenHeader';
import BotonMensajes from '../../components/BotonMensajes';
import type { ParticularTabParamList } from '../../navigation/types';
import { formatearMoneda } from '../../utils/moneda';
import { mensajeDeError } from '../../services/peticiones';
import { usePagosActivos } from '../../services/pagosActivos';
import { iconoCatalogo } from './iconosCatalogo';
import ProveedoresCatalogo from './ProveedoresCatalogo';
import { CestaProvider, useCesta } from './CestaContext';
import { cargarCatalogo, normalizar, type DatosCatalogo } from './catalogoDatos';
import {
  ETIQUETA_ACABADO,
  contactarCatalogo,
  enviarSolicitudCatalogo,
  enviarSolicitudPersonalizada,
  estimarCesta,
  listarPartidas,
  listarProveedores,
  type Acabado,
  type CategoriaCatalogo,
  type Estimacion,
  type LineaCesta,
  type Modalidad,
  type PartidaCatalogo,
  type PlazoProyecto,
  type PrecioPartida,
  type ProveedorCatalogo,
  type TipoTrabajo,
} from '../../services/catalogo';

type Vista =
  | { t: 'categoria'; categoria: CategoriaCatalogo }
  | { t: 'detalle'; categoria: CategoriaCatalogo | null; partida: PartidaCatalogo }
  | { t: 'enviado' }
  | { t: 'otro' }
  | { t: 'contacto'; partida: PartidaCatalogo | null }
  | { t: 'proveedores'; abrirId?: string };

const ORDEN_ACABADO: Acabado[] = ['unico', 'basico', 'medio', 'alto'];
const ORDEN_MODALIDAD: Modalidad[] = ['mano_obra_materiales', 'solo_mano_obra'];
const ETIQUETA_MODALIDAD: Record<Modalidad, string> = {
  mano_obra_materiales: 'Con materiales',
  solo_mano_obra: 'Sin materiales',
};
const AVISO_ESTIMACION =
  'Estimación orientativa con precios de referencia de toda España. No es una oferta: Administración la revisa antes de publicar tu obra. IVA a confirmar.';

const num = (n: number) => formatearMoneda(n).replace(',00 €', ' €');
const rango = (bajo: number, alto: number) => (Math.abs(alto - bajo) < 0.005 ? num(bajo) : `${num(bajo)} – ${num(alto)}`);

function precioDe(p: PartidaCatalogo, acabado: Acabado, modalidad: Modalidad): PrecioPartida | undefined {
  return (p.precios ?? []).find((x) => x.acabado === acabado && x.modalidad === modalidad);
}
function acabadosDe(p: PartidaCatalogo): Acabado[] {
  const set = new Set((p.precios ?? []).map((x) => x.acabado));
  return ORDEN_ACABADO.filter((a) => set.has(a));
}
function modalidadesDe(p: PartidaCatalogo, acabado: Acabado): Modalidad[] {
  return ORDEN_MODALIDAD.filter((m) => precioDe(p, acabado, m) !== undefined);
}
/** Precio de referencia más bajo de la partida (para el «desde» de la lista). */
function desdePrecio(p: PartidaCatalogo): number | null {
  const l = (p.precios ?? []).map((x) => x.ref);
  return l.length ? Math.min(...l) : null;
}
function formatoCantidad(n: number): string {
  return String(Math.round(n * 100) / 100).replace('.', ',');
}
/** Opción de partida que se añade con el «+» rápido: acabado medio si existe, con materiales si hay precio. */
function opcionRapida(p: PartidaCatalogo): { acabado: Acabado; modalidad: Modalidad } | null {
  const acs = acabadosDe(p);
  if (acs.length === 0) return null;
  const acabado = acs.includes('medio') ? 'medio' : acs[0];
  const mods = modalidadesDe(p, acabado);
  return mods.length ? { acabado, modalidad: mods[0] } : null;
}
function lineaDe(p: PartidaCatalogo, acabado: Acabado, modalidad: Modalidad, cantidad: number): LineaCesta {
  return {
    partida_id: p.id,
    nombre: p.nombre,
    unidad: p.unidad,
    acabado,
    modalidad,
    modalidades: modalidadesDe(p, acabado),
    cantidad,
    cantidad_min: p.cantidad_min,
    cantidad_max: p.cantidad_max,
    icono: p.icono ?? null,
    categoria: p.categoria,
  };
}

const SOMBRA = {
  shadowColor: '#0B1F35',
  shadowOffset: { width: 0, height: 6 },
  shadowOpacity: 0.1,
  shadowRadius: 16,
  elevation: 4,
};

/** Navegación de la pestaña (solo se usa para saltar entre pestañas de la app del particular). */
type NavegacionParticular = BottomTabNavigationProp<ParticularTabParamList>;

/** Pestaña de la app del particular que usa esta pantalla como raíz (Pedido y Buscar solo existen con el catálogo encendido). */
export type RaizCatalogo = 'inicio' | 'buscar' | 'pedido';

/**
 * Una pestaña del catálogo estilo Uber: Inicio (todo a la vista), Buscar (concepto + filtros) y Pedido (la cesta).
 * El pedido se comparte entre las tres mediante CestaProvider. Elegir partidas, ver un precio de referencia (igual
 * en toda España) y enviar la petición a Administración, que la revisa antes de publicarla. Nada se contrata ni se
 * paga aquí. Con modo «proveedor» se consulta el catálogo y se puede escribir a 3B Conecta, pero no hay pedido.
 */
export function Explorador({ raiz, modo = 'particular' }: { raiz: RaizCatalogo; modo?: 'particular' | 'proveedor' }) {
  const navigation = useNavigation<NavegacionParticular>();
  const { cesta, anadir, cambiarCantidad, cambiarModalidad, quitar, vaciar } = useCesta();
  const [vista, setVista] = useState<Vista | null>(null);
  const proveedor = modo === 'proveedor';
  const enCesta = proveedor ? 0 : cesta.length;
  const aRaiz = () => setVista(null);
  const irPedido = () => navigation.navigate('Pedido');
  const irBuscar = () => navigation.navigate('Buscar', { foco: true, t: Date.now() });

  // Al salir de la pestaña se quita la pantalla de «Petición enviada» para no encontrarla al volver
  useEffect(() => navigation.addListener('blur', () => setVista((v) => (v !== null && v.t === 'enviado' ? null : v))), [navigation]);

  const abrirCategoria = (categoria: CategoriaCatalogo) =>
    categoria.es_formulario ? setVista(proveedor ? { t: 'contacto', partida: null } : { t: 'otro' }) : setVista({ t: 'categoria', categoria });

  if (vista !== null) {
    switch (vista.t) {
      case 'categoria':
        return (
          <Categoria
            categoria={vista.categoria}
            proveedor={proveedor}
            enCesta={enCesta}
            onVolver={aRaiz}
            onAbrir={(partida) => setVista({ t: 'detalle', categoria: vista.categoria, partida })}
            onRapido={anadir}
            onCesta={irPedido}
          />
        );
      case 'detalle':
        return (
          <Detalle
            partida={vista.partida}
            proveedor={proveedor}
            onVolver={() => (vista.categoria !== null ? setVista({ t: 'categoria', categoria: vista.categoria }) : aRaiz())}
            onContactar={() => setVista({ t: 'contacto', partida: vista.partida })}
            onAnadir={(linea) => {
              anadir(linea);
              if (vista.categoria !== null) setVista({ t: 'categoria', categoria: vista.categoria });
              else aRaiz();
            }}
            enCesta={enCesta}
            onCesta={irPedido}
          />
        );
      case 'enviado':
        return (
          <Enviado
            onVolver={() => {
              aRaiz();
              if (raiz === 'pedido') navigation.navigate('Inicio');
            }}
          />
        );
      case 'otro':
        return <Personalizado onVolver={aRaiz} onEnviado={() => setVista({ t: 'enviado' })} />;
      case 'proveedores':
        return <ProveedoresCatalogo onVolver={aRaiz} abrirId={vista.abrirId} />;
      case 'contacto':
        return <Contacto partida={vista.partida} onVolver={aRaiz} />;
    }
  }

  if (raiz === 'pedido') {
    return (
      <Presupuesto
        cesta={cesta}
        onModalidad={cambiarModalidad}
        onCantidad={cambiarCantidad}
        onQuitar={quitar}
        onVolver={() => navigation.navigate('Inicio')}
        onEnviado={() => {
          vaciar();
          setVista({ t: 'enviado' });
        }}
      />
    );
  }
  if (raiz === 'buscar') {
    return (
      <Buscar
        proveedor={proveedor}
        enCesta={enCesta}
        onAbrirPartida={(partida) => setVista({ t: 'detalle', categoria: null, partida })}
        onRapido={anadir}
        onCesta={irPedido}
        onProveedor={(id) => setVista({ t: 'proveedores', abrirId: id })}
        onOtro={() => setVista({ t: 'otro' })}
      />
    );
  }
  return (
    <InicioFeed
      proveedor={proveedor}
      enCesta={enCesta}
      onBuscar={irBuscar}
      onCategoria={abrirCategoria}
      onVerCategoria={(categoria) => setVista({ t: 'categoria', categoria })}
      onAbrirPartida={(partida) => setVista({ t: 'detalle', categoria: null, partida })}
      onRapido={anadir}
      onCesta={irPedido}
      onProveedores={() => setVista({ t: 'proveedores' })}
      onProveedor={(id) => setVista({ t: 'proveedores', abrirId: id })}
      onOtro={() => setVista(proveedor ? { t: 'contacto', partida: null } : { t: 'otro' })}
    />
  );
}

/** Uso antiguo (una sola pantalla con su propio pedido). La app del particular usa ahora las pestañas de CatalogoTabs. */
export default function CatalogoScreen({ modo = 'particular' }: { modo?: 'particular' | 'proveedor' }) {
  return (
    <CestaProvider>
      <Explorador raiz="inicio" modo={modo} />
    </CestaProvider>
  );
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
function CajaError({ texto }: { texto: string }) {
  return (
    <View className="bg-errorTint rounded-lg px-3 py-2 mb-3 flex-row items-center gap-2">
      <Feather name="alert-circle" size={16} color={colors.error} />
      <Text className="text-error text-sm flex-1">{texto}</Text>
    </View>
  );
}

function Atras({ onPress, texto }: { onPress: () => void; texto: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={texto} className="flex-row items-center gap-1 px-4 pb-2">
      <Feather name="chevron-left" size={18} color={colors.action} />
      <Text className="text-action text-sm font-sansSemiBold">{texto}</Text>
    </Pressable>
  );
}

/** Barra de cristal fija abajo con una sola acción principal (como en Uber Eats). */
function BarraInferior({ children }: { children: React.ReactNode }) {
  return (
    <View className="px-4 pt-3 pb-4 bg-white/85 border-t border-white" style={{ shadowColor: '#0B1F35', shadowOpacity: 0.08, shadowRadius: 14, elevation: 8 }}>
      {children}
    </View>
  );
}

function BotonCesta({ n, onPress }: { n: number; onPress: () => void }) {
  if (n === 0) return null;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" className="bg-action rounded-full py-3.5 flex-row items-center justify-center gap-2" style={SOMBRA}>
      <Feather name="shopping-bag" size={16} color={colors.white} />
      <Text className="text-white font-sansBold text-sm">Ver mi pedido ({n})</Text>
    </Pressable>
  );
}

// Estilo «cristal azul», el mismo lenguaje que las tarjetas del perfil (degradado azul, luz suave, borde claro).
const VIDRIO = ['#DCEEFF', '#A5D0FF', '#74B2FF'] as const;
const AZUL_TEXTO = '#0B2CB1';
const SOMBRA_AZUL = {
  shadowColor: '#1951FC',
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.22,
  shadowRadius: 18,
  elevation: 5,
};

/** Tarjeta de cristal azul (pulsable si recibe onPress). Los textos de dentro van en tinta oscura para leerse bien. */
function Vidrio({ children, style, className, ...resto }: Omit<PressableProps, 'style'> & { className?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable
      {...resto}
      className={className}
      style={[{ borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.75)', backgroundColor: '#A5D0FF' }, SOMBRA_AZUL, style]}
    >
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: 23, overflow: 'hidden' }]}>
        <LinearGradient colors={VIDRIO} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={StyleSheet.absoluteFill} />
        <View style={{ position: 'absolute', right: -30, top: -40, width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.4)' }} />
      </View>
      {children as React.ReactNode}
    </Pressable>
  );
}

/** Luz azul suave detrás de la parte de arriba de Inicio y Buscar. */
function FondoLuz() {
  return <LinearGradient pointerEvents="none" colors={['#CBE4FF', '#F2F7FF']} style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 320 }} />;
}

/** Cabecera mínima de Inicio y Buscar: la pestaña activa ya dice dónde estás, así que solo lleva la marca y los mensajes. */
function CabeceraMarca() {
  const insets = useSafeAreaInsets();
  return (
    <View className="px-4 pb-4 flex-row items-center justify-between" style={{ paddingTop: insets.top + 16 }}>
      <Text className="text-ink text-[13px] font-sansSemiBold uppercase" style={{ letterSpacing: 2.2 }}>
        3B CONECTA
      </Text>
      <BotonMensajes />
    </View>
  );
}

function Flotante({ clave, categoria, size }: { clave?: string | null; categoria?: string | null; size: number }) {
  return <Image source={iconoCatalogo(clave, categoria)} style={{ width: size, height: size }} resizeMode="contain" accessibilityElementsHidden importantForAccessibility="no" />;
}

/** «+» rápido: añade la opción más habitual de la partida y muestra un ✓ un instante. */
function useRapido(onRapido: (l: LineaCesta) => void) {
  const [anadida, setAnadida] = useState<string | null>(null);
  const rapido = (p: PartidaCatalogo, opcion?: { acabado: Acabado; modalidad: Modalidad } | null) => {
    const o = opcion ?? opcionRapida(p);
    if (o === null) return;
    onRapido(lineaDe(p, o.acabado, o.modalidad, p.cantidad_defecto));
    setAnadida(p.id);
    setTimeout(() => setAnadida((a) => (a === p.id ? null : a)), 1200);
  };
  return { anadida, rapido };
}

function BotonMas({ p, hecho, onPress }: { p: PartidaCatalogo; hecho: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Añadir ${p.nombre}`}
      hitSlop={8}
      className={`rounded-full items-center justify-center ${hecho ? 'bg-success' : 'bg-white'}`}
      style={{ width: 40, height: 40, ...SOMBRA }}
    >
      <Feather name={hecho ? 'check' : 'plus'} size={20} color={hecho ? colors.white : colors.ink} />
    </Pressable>
  );
}

/** Fila de partida (listas de categoría y resultados de búsqueda). */
function FilaPartida({
  p,
  proveedor,
  hecho,
  desde,
  etiqueta,
  onAbrir,
  onRapido,
}: {
  p: PartidaCatalogo;
  proveedor: boolean;
  hecho: boolean;
  /** Si se indica (filtros de Buscar), sustituye al precio «desde» general de la partida. */
  desde?: number | null;
  etiqueta?: string;
  onAbrir: (p: PartidaCatalogo) => void;
  onRapido: (p: PartidaCatalogo) => void;
}) {
  const precio = desde !== undefined ? desde : desdePrecio(p);
  const o = opcionRapida(p);
  return (
    <Vidrio
      onPress={() => onAbrir(p)}
      accessibilityRole="button"
      accessibilityLabel={p.nombre}
      className="p-3 flex-row items-center"
    >
      <Flotante clave={p.icono} categoria={p.categoria} size={64} />
      <View className="flex-1 px-3">
        <Text className="text-ink text-[15px] font-sansBold" numberOfLines={2}>
          {p.nombre}
        </Text>
        {p.descripcion !== '' && (
          <Text className="text-ink opacity-75 text-xs mt-0.5" numberOfLines={1}>
            {p.descripcion}
          </Text>
        )}
        <Text className="text-sm font-sansSemiBold mt-1" style={{ color: AZUL_TEXTO }}>
          {precio !== null ? `Desde ${num(precio)} / ${p.unidad}${etiqueta ? ` · ${etiqueta}` : ''}` : 'Sin precio todavía'}
        </Text>
      </View>
      {!proveedor && o !== null && <BotonMas p={p} hecho={hecho} onPress={() => onRapido(p)} />}
    </Vidrio>
  );
}

/** Tarjeta pequeña de las filas horizontales del Inicio. */
function TarjetaMini({ p, proveedor, hecho, onAbrir, onRapido }: { p: PartidaCatalogo; proveedor: boolean; hecho: boolean; onAbrir: (p: PartidaCatalogo) => void; onRapido: (p: PartidaCatalogo) => void }) {
  const desde = desdePrecio(p);
  const o = opcionRapida(p);
  return (
    <Vidrio
      onPress={() => onAbrir(p)}
      accessibilityRole="button"
      accessibilityLabel={p.nombre}
      className="p-3"
      style={{ width: 168 }}
    >
      <View className="items-center">
        <Flotante clave={p.icono} categoria={p.categoria} size={72} />
      </View>
      <Text className="text-ink text-[14px] font-sansBold mt-2" numberOfLines={2} style={{ minHeight: 38 }}>
        {p.nombre}
      </Text>
      <View className="flex-row items-center justify-between mt-1">
        <Text className="text-[13px] font-sansSemiBold flex-1 pr-2" style={{ color: AZUL_TEXTO }} numberOfLines={1}>
          {desde !== null ? `Desde ${num(desde)}` : 'Sin precio'}
        </Text>
        {!proveedor && o !== null && <BotonMas p={p} hecho={hecho} onPress={() => onRapido(p)} />}
      </View>
    </Vidrio>
  );
}

function Chip({ texto, activo, onPress }: { texto: string; activo: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: activo }}
      className={`rounded-full px-4 py-2 border ${activo ? 'bg-action border-action' : 'bg-white border-border'}`}
    >
      <Text className={`text-[13px] font-sansSemiBold ${activo ? 'text-white' : 'text-ink'}`}>{texto}</Text>
    </Pressable>
  );
}

/** Carga compartida (categorías + partidas) con «tirar para actualizar». */
function useDatosCatalogo() {
  const [datos, setDatos] = useState<DatosCatalogo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actualizando, setActualizando] = useState(false);

  const cargar = useCallback((forzar: boolean) => {
    setError(null);
    return cargarCatalogo(forzar)
      .then((d) => setDatos(d))
      .catch((e) => setError(mensajeDeError(e)));
  }, []);
  useEffect(() => {
    cargar(false);
  }, [cargar]);
  const actualizar = async () => {
    setActualizando(true);
    await cargar(true);
    setActualizando(false);
  };
  return { datos, error, actualizando, actualizar };
}

/** Proveedores publicados. Si el directorio todavía no está activado en Supabase, simplemente no hay ninguno. */
function useProveedores(activo: boolean) {
  const [lista, setLista] = useState<ProveedorCatalogo[]>([]);
  useEffect(() => {
    if (!activo) return;
    let vivo = true;
    listarProveedores(null)
      .then((l) => vivo && setLista(l))
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [activo]);
  return lista;
}

const SIN_FILTRO = { paddingHorizontal: 16, gap: 8 } as const;

// ---------------------------------------------------------------------------
/** Inicio: lo ves todo de un vistazo, como en Uber. Buscador arriba, categorías, filas por categoría y proveedores. */
function InicioFeed({
  proveedor,
  enCesta,
  onBuscar,
  onCategoria,
  onVerCategoria,
  onAbrirPartida,
  onRapido,
  onCesta,
  onProveedores,
  onProveedor,
  onOtro,
}: {
  proveedor: boolean;
  enCesta: number;
  onBuscar: () => void;
  onCategoria: (c: CategoriaCatalogo) => void;
  onVerCategoria: (c: CategoriaCatalogo) => void;
  onAbrirPartida: (p: PartidaCatalogo) => void;
  onRapido: (l: LineaCesta) => void;
  onCesta: () => void;
  onProveedores: () => void;
  onProveedor: (id: string) => void;
  onOtro: () => void;
}) {
  const { datos, error, actualizando, actualizar } = useDatosCatalogo();
  const proveedores = useProveedores(!proveedor);
  const { anadida, rapido } = useRapido(onRapido);

  const filas = useMemo(
    () =>
      (datos?.categorias ?? [])
        .filter((c) => !c.es_formulario && (datos?.partidas[c.codigo] ?? []).length > 0)
        .map((c) => ({ categoria: c, partidas: datos?.partidas[c.codigo] ?? [] })),
    [datos],
  );

  return (
    <View className="flex-1 bg-canvas">
      <FondoLuz />
      <CabeceraMarca />
      {datos === null && error === null ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.action} />
        </View>
      ) : (
        <>
          <ScrollView
            contentContainerStyle={{ paddingBottom: 24 }}
            refreshControl={<RefreshControl refreshing={actualizando} onRefresh={actualizar} tintColor={colors.action} />}
          >
            <Pressable
              onPress={onBuscar}
              accessibilityRole="search"
              accessibilityLabel="Buscar en el catálogo"
              className="mx-4 bg-white rounded-full flex-row items-center px-4 py-3.5 border border-white"
              style={SOMBRA}
            >
              <Feather name="search" size={18} color={colors.inkMuted} />
              <Text className="text-inkMuted text-[15px] ml-3 flex-1" numberOfLines={1}>
                Busca una reforma, un oficio, un proveedor…
              </Text>
              <Feather name="sliders" size={18} color={colors.action} />
            </Pressable>

            <View className="mx-4 mt-4" style={[{ borderRadius: 28, backgroundColor: '#1951FC' }, SOMBRA_AZUL]}>
              <View style={{ height: 164, borderRadius: 28, overflow: 'hidden' }}>
                <LinearGradient colors={['#2A6BFF', '#1951FC', '#0B2CB1']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                <View pointerEvents="none" style={{ position: 'absolute', right: -60, top: -80, width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.22)' }} />
                <View pointerEvents="none" style={{ position: 'absolute', right: -46, bottom: -60, width: 170, height: 170, borderRadius: 85, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.28)' }} />
                <View pointerEvents="none" style={{ position: 'absolute', right: -16, bottom: -30, width: 110, height: 110, borderRadius: 55, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.28)' }} />
                <View style={{ position: 'absolute', left: 18, top: 18, right: 122 }}>
                  <Text className="text-white text-[19px] font-sansBold" style={{ lineHeight: 23 }}>
                    Tu obra, con precio de referencia
                  </Text>
                  <Text className="text-[12.5px] mt-1.5" style={{ color: '#EAF2FF' }}>
                    Elige, añade y envía tu petición.
                  </Text>
                </View>
                <Pressable
                  onPress={onBuscar}
                  accessibilityRole="button"
                  accessibilityLabel="Empezar a buscar"
                  style={{ position: 'absolute', left: 18, bottom: 18, height: 36, paddingHorizontal: 16, borderRadius: 18, backgroundColor: '#FFFFFF', justifyContent: 'center' }}
                >
                  <Text className="text-action text-[13px] font-sansBold">Empezar</Text>
                </Pressable>
                <Image source={iconoCatalogo('casa', '')} style={{ position: 'absolute', right: 12, top: 30, width: 100, height: 100 }} resizeMode="contain" accessibilityElementsHidden importantForAccessibility="no" />
              </View>
            </View>

            {error !== null && (
              <View className="px-4 mt-4">
                <CajaError texto={error} />
              </View>
            )}

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16 }} className="mt-5">
              {(datos?.categorias ?? []).map((c) => (
                <Pressable
                  key={c.codigo}
                  onPress={() => onCategoria(c)}
                  accessibilityRole="button"
                  accessibilityLabel={c.nombre}
                  className="items-center mr-3"
                  style={{ width: 78 }}
                >
                  <Flotante clave={c.icono} categoria={c.codigo} size={64} />
                  <Text className="text-ink text-[12px] font-sansSemiBold mt-1 text-center" numberOfLines={2}>
                    {c.nombre}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            {filas.map(({ categoria, partidas }) => (
              <View key={categoria.codigo} className="mt-6">
                <View className="flex-row items-center justify-between px-4 mb-2">
                  <Text className="text-ink text-lg font-sansBold flex-1" numberOfLines={1}>
                    {categoria.nombre}
                  </Text>
                  <Pressable onPress={() => onVerCategoria(categoria)} accessibilityRole="button" accessibilityLabel={`Ver todo en ${categoria.nombre}`} hitSlop={8}>
                    <Text className="text-action text-sm font-sansSemiBold">Ver todo</Text>
                  </Pressable>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={SIN_FILTRO} style={{ paddingVertical: 4 }}>
                  {partidas.slice(0, 8).map((p) => (
                    <TarjetaMini key={p.id} p={p} proveedor={proveedor} hecho={anadida === p.id} onAbrir={onAbrirPartida} onRapido={(x) => rapido(x)} />
                  ))}
                </ScrollView>
              </View>
            ))}

            {datos !== null && filas.length === 0 && error === null && (
              <Text className="text-inkMuted text-sm px-4 mt-6 leading-relaxed">
                Todavía no hay partidas con precio publicado. Cuéntanos lo que necesitas en «Otro» y Administración te prepara un presupuesto.
              </Text>
            )}

            {!proveedor && proveedores.length > 0 && (
              <View className="mt-6">
                <View className="flex-row items-center justify-between px-4 mb-2">
                  <Text className="text-ink text-lg font-sansBold">Proveedores</Text>
                  <Pressable onPress={onProveedores} accessibilityRole="button" accessibilityLabel="Ver todos los proveedores" hitSlop={8}>
                    <Text className="text-action text-sm font-sansSemiBold">Ver todos</Text>
                  </Pressable>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={SIN_FILTRO} style={{ paddingVertical: 4 }}>
                  {proveedores.slice(0, 8).map((p) => (
                    <Vidrio
                      key={p.id}
                      onPress={() => onProveedor(p.id)}
                      accessibilityRole="button"
                      accessibilityLabel={p.nombre}
                      className="p-3"
                      style={{ width: 200 }}
                    >
                      <View className="flex-row items-center">
                        <Image source={iconoCatalogo(null, p.categoria)} style={{ width: 44, height: 44 }} resizeMode="contain" />
                        <View className="flex-1 pl-2">
                          <Text className="text-ink text-[14px] font-sansBold" numberOfLines={1}>
                            {p.nombre}
                          </Text>
                          <Text className="text-ink opacity-75 text-xs" numberOfLines={1}>
                            {[p.categoria_nombre, p.zona].filter((x) => x !== null && x !== '').join(' · ') || 'Profesional'}
                          </Text>
                        </View>
                      </View>
                    </Vidrio>
                  ))}
                </ScrollView>
              </View>
            )}

            <Vidrio
              onPress={onOtro}
              accessibilityRole="button"
              className="mx-4 mt-6  p-4 flex-row items-center"
            >
              <Flotante clave="otro" size={48} />
              <View className="flex-1 px-3">
                <Text className="text-ink text-[15px] font-sansBold">¿No encuentras lo que buscas?</Text>
                <Text className="text-ink opacity-75 text-xs mt-0.5">Cuéntanos tu proyecto y te preparamos un presupuesto.</Text>
              </View>
              <Feather name="chevron-right" size={20} color={colors.inkMuted} />
            </Vidrio>

            <Text className="text-inkMuted text-[13px] mt-5 px-4">{AVISO_ESTIMACION}</Text>
          </ScrollView>
          {!proveedor && enCesta > 0 && (
            <BarraInferior>
              <BotonCesta n={enCesta} onPress={onCesta} />
            </BarraInferior>
          )}
        </>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
type OrdenBusqueda = 'relevancia' | 'precio_asc' | 'precio_desc' | 'nombre';
const ETIQUETA_ORDEN: Record<OrdenBusqueda, string> = {
  relevancia: 'Relevancia',
  precio_asc: 'Precio más bajo',
  precio_desc: 'Precio más alto',
  nombre: 'A – Z',
};

/** Buscar: un concepto («azulejos», «pintar salón»…) con filtros de categoría, materiales, acabado y orden. */
function Buscar({
  proveedor,
  enCesta,
  onAbrirPartida,
  onRapido,
  onCesta,
  onProveedor,
  onOtro,
}: {
  proveedor: boolean;
  enCesta: number;
  onAbrirPartida: (p: PartidaCatalogo) => void;
  onRapido: (l: LineaCesta) => void;
  onCesta: () => void;
  onProveedor: (id: string) => void;
  onOtro: () => void;
}) {
  const route = useRoute<RouteProp<ParticularTabParamList, 'Buscar'>>();
  const params = route.params;
  const { datos, error } = useDatosCatalogo();
  const proveedores = useProveedores(!proveedor);
  const { anadida, rapido } = useRapido(onRapido);
  const entrada = useRef<TextInput>(null);

  const [q, setQ] = useState('');
  const [alcance, setAlcance] = useState<'partidas' | 'proveedores'>('partidas');
  const [cat, setCat] = useState<string | null>(null);
  const [mod, setMod] = useState<Modalidad | null>(null);
  const [aca, setAca] = useState<Acabado | null>(null);
  const [orden, setOrden] = useState<OrdenBusqueda>('relevancia');
  const [abiertos, setAbiertos] = useState(false);

  // Venir desde «Ver todo» o desde el buscador del Inicio (categoría y/o foco en el campo)
  useEffect(() => {
    if (params === undefined) return;
    setCat(params.categoria ?? null);
    if (params.foco === true) setTimeout(() => entrada.current?.focus(), 300);
  }, [params?.categoria, params?.foco, params?.t]); // eslint-disable-line react-hooks/exhaustive-deps

  const categorias = useMemo(() => (datos?.categorias ?? []).filter((c) => !c.es_formulario), [datos]);
  const nombreCat = useMemo(() => new Map((datos?.categorias ?? []).map((c) => [c.codigo, c.nombre])), [datos]);
  const todas = useMemo(() => Object.values(datos?.partidas ?? {}).flat(), [datos]);
  const terminos = useMemo(() => normalizar(q).split(/\s+/).filter(Boolean), [q]);

  const precioFiltrado = useCallback(
    (p: PartidaCatalogo): number | null => {
      const l = (p.precios ?? []).filter((x) => (mod === null || x.modalidad === mod) && (aca === null || x.acabado === aca)).map((x) => x.ref);
      return l.length ? Math.min(...l) : null;
    },
    [mod, aca],
  );

  const resultados = useMemo(() => {
    const con = todas
      .filter((p) => cat === null || p.categoria === cat)
      .filter((p) => (mod === null && aca === null) || precioFiltrado(p) !== null)
      .map((p) => {
        const nombre = normalizar(p.nombre);
        const resto = normalizar([p.descripcion, p.incluye, p.subcategoria, nombreCat.get(p.categoria)].join(' '));
        const todos = terminos.every((t) => nombre.includes(t) || resto.includes(t));
        const puntos = terminos.length === 0 ? 0 : nombre.startsWith(terminos[0]) ? 0 : nombre.includes(terminos[0]) ? 1 : 2;
        return { p, todos, puntos, precio: precioFiltrado(p) };
      })
      .filter((x) => x.todos);
    const cmpPrecio = (a: number | null, b: number | null, dir: 1 | -1) => (a === null ? 1 : b === null ? -1 : (a - b) * dir);
    return con.sort((a, b) => {
      if (orden === 'precio_asc') return cmpPrecio(a.precio, b.precio, 1);
      if (orden === 'precio_desc') return a.precio === null ? 1 : b.precio === null ? -1 : b.precio - a.precio;
      if (orden === 'nombre') return a.p.nombre.localeCompare(b.p.nombre, 'es');
      return a.puntos - b.puntos;
    });
  }, [todas, cat, mod, aca, terminos, orden, nombreCat, precioFiltrado]);

  const provVisibles = useMemo(
    () =>
      proveedores.filter((p) => {
        if (cat !== null && p.categoria !== cat) return false;
        const texto = normalizar([p.nombre, p.descripcion, p.zona, p.categoria_nombre].join(' '));
        return terminos.every((t) => texto.includes(t));
      }),
    [proveedores, cat, terminos],
  );

  const nFiltros = (mod !== null ? 1 : 0) + (aca !== null ? 1 : 0) + (orden !== 'relevancia' ? 1 : 0);
  const quitarFiltros = () => {
    setCat(null);
    setMod(null);
    setAca(null);
    setOrden('relevancia');
  };
  // El «+» respeta los filtros: si pides «sin materiales», se añade sin materiales
  const opcionConFiltros = (p: PartidaCatalogo): { acabado: Acabado; modalidad: Modalidad } | null => {
    const base = opcionRapida(p);
    if (base === null) return null;
    const acabado = aca !== null && acabadosDe(p).includes(aca) ? aca : base.acabado;
    const mods = modalidadesDe(p, acabado);
    const modalidad = mod !== null && mods.includes(mod) ? mod : mods[0];
    return modalidad === undefined ? base : { acabado, modalidad };
  };
  const etiquetaFiltro = [mod !== null ? ETIQUETA_MODALIDAD[mod] : null, aca !== null ? ETIQUETA_ACABADO[aca] : null].filter(Boolean).join(' · ');
  const hayFiltros = q.trim() !== '' || cat !== null || nFiltros > 0;

  return (
    <View className="flex-1 bg-canvas">
      <FondoLuz />
      <CabeceraMarca />
      <View className="mx-4 bg-white rounded-full flex-row items-center px-4 border border-white" style={SOMBRA}>
        <Feather name="search" size={18} color={colors.inkMuted} />
        <TextInput
          ref={entrada}
          value={q}
          onChangeText={setQ}
          placeholder="Busca «azulejos», «pintar salón»…"
          placeholderTextColor={colors.inkSubtle}
          returnKeyType="search"
          autoCorrect={false}
          accessibilityLabel="Buscar en el catálogo"
          className="flex-1 text-ink text-[15px] py-3.5 px-3"
        />
        {q !== '' && (
          <Pressable onPress={() => setQ('')} accessibilityRole="button" accessibilityLabel="Borrar búsqueda" hitSlop={8}>
            <Feather name="x-circle" size={18} color={colors.inkMuted} />
          </Pressable>
        )}
      </View>

      {!proveedor && proveedores.length > 0 && (
        <View className="flex-row mx-4 mt-3 gap-2">
          <Chip texto="Partidas" activo={alcance === 'partidas'} onPress={() => setAlcance('partidas')} />
          <Chip texto="Proveedores" activo={alcance === 'proveedores'} onPress={() => setAlcance('proveedores')} />
        </View>
      )}

      <View className="mt-3 flex-row items-center">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={SIN_FILTRO} className="flex-1" keyboardShouldPersistTaps="handled">
          <Chip texto="Todas" activo={cat === null} onPress={() => setCat(null)} />
          {categorias.map((c) => (
            <Chip key={c.codigo} texto={c.nombre} activo={cat === c.codigo} onPress={() => setCat(cat === c.codigo ? null : c.codigo)} />
          ))}
        </ScrollView>
        {alcance === 'partidas' && (
          <Pressable
            onPress={() => setAbiertos((a) => !a)}
            accessibilityRole="button"
            accessibilityState={{ expanded: abiertos }}
            accessibilityLabel="Filtros"
            className={`mr-4 ml-1 rounded-full px-3.5 py-2 flex-row items-center gap-1.5 border ${abiertos || nFiltros > 0 ? 'bg-actionTint border-action' : 'bg-white border-border'}`}
          >
            <Feather name="sliders" size={15} color={colors.action} />
            <Text className="text-action text-[13px] font-sansSemiBold">{nFiltros > 0 ? `Filtros (${nFiltros})` : 'Filtros'}</Text>
          </Pressable>
        )}
      </View>

      {alcance === 'partidas' && abiertos && (
        <Vidrio className="mx-4 mt-3  p-3">
          <Text className="text-ink text-[13px] font-sansBold mb-2">Materiales</Text>
          <View className="flex-row flex-wrap gap-2 mb-3">
            <Chip texto="Todos" activo={mod === null} onPress={() => setMod(null)} />
            {ORDEN_MODALIDAD.map((m) => (
              <Chip key={m} texto={ETIQUETA_MODALIDAD[m]} activo={mod === m} onPress={() => setMod(mod === m ? null : m)} />
            ))}
          </View>
          <Text className="text-ink text-[13px] font-sansBold mb-2">Acabado</Text>
          <View className="flex-row flex-wrap gap-2 mb-3">
            <Chip texto="Todos" activo={aca === null} onPress={() => setAca(null)} />
            {ORDEN_ACABADO.map((a) => (
              <Chip key={a} texto={ETIQUETA_ACABADO[a]} activo={aca === a} onPress={() => setAca(aca === a ? null : a)} />
            ))}
          </View>
          <Text className="text-ink text-[13px] font-sansBold mb-2">Ordenar por</Text>
          <View className="flex-row flex-wrap gap-2">
            {(Object.keys(ETIQUETA_ORDEN) as OrdenBusqueda[]).map((o) => (
              <Chip key={o} texto={ETIQUETA_ORDEN[o]} activo={orden === o} onPress={() => setOrden(o)} />
            ))}
          </View>
        </Vidrio>
      )}

      {datos === null && error === null ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.action} />
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
            {error !== null && <CajaError texto={error} />}
            <Text className="text-inkMuted text-xs mb-3">
              {alcance === 'partidas'
                ? `${resultados.length} resultado${resultados.length === 1 ? '' : 's'}`
                : `${provVisibles.length} proveedor${provVisibles.length === 1 ? '' : 'es'}`}
            </Text>
            {alcance === 'partidas' ? (
              resultados.length === 0 && error === null ? (
                <SinResultados texto={q.trim() !== '' ? `Nada para «${q.trim()}».` : 'Nada con estos filtros.'} hayFiltros={hayFiltros} onQuitar={() => { setQ(''); quitarFiltros(); }} onOtro={proveedor ? undefined : onOtro} />
              ) : (
                <View className="gap-3">
                  {resultados.map(({ p, precio }) => (
                    <FilaPartida
                      key={p.id}
                      p={p}
                      proveedor={proveedor}
                      hecho={anadida === p.id}
                      desde={mod !== null || aca !== null ? precio : undefined}
                      etiqueta={etiquetaFiltro}
                      onAbrir={onAbrirPartida}
                      onRapido={(x) => rapido(x, opcionConFiltros(x))}
                    />
                  ))}
                </View>
              )
            ) : provVisibles.length === 0 ? (
              <SinResultados texto="Ningún proveedor coincide." hayFiltros={hayFiltros} onQuitar={() => { setQ(''); quitarFiltros(); }} />
            ) : (
              <View className="gap-3">
                {provVisibles.map((p) => (
                  <Vidrio
                    key={p.id}
                    onPress={() => onProveedor(p.id)}
                    accessibilityRole="button"
                    accessibilityLabel={p.nombre}
                    className="p-3 flex-row items-center"
                  >
                    <Image source={iconoCatalogo(null, p.categoria)} style={{ width: 56, height: 56 }} resizeMode="contain" />
                    <View className="flex-1 px-3">
                      <Text className="text-ink text-[15px] font-sansBold">{p.nombre}</Text>
                      <Text className="text-ink opacity-75 text-xs mt-0.5">{[p.categoria_nombre, p.zona].filter((x) => x !== null && x !== '').join(' · ')}</Text>
                      {p.descripcion !== null && p.descripcion !== '' && (
                        <Text className="text-ink opacity-75 text-xs mt-1" numberOfLines={2}>
                          {p.descripcion}
                        </Text>
                      )}
                    </View>
                    <Feather name="chevron-right" size={20} color={colors.inkMuted} />
                  </Vidrio>
                ))}
              </View>
            )}
            <Text className="text-inkMuted text-[13px] mt-5">{AVISO_ESTIMACION}</Text>
          </ScrollView>
          {!proveedor && enCesta > 0 && (
            <BarraInferior>
              <BotonCesta n={enCesta} onPress={onCesta} />
            </BarraInferior>
          )}
        </>
      )}
    </View>
  );
}

function SinResultados({ texto, hayFiltros, onQuitar, onOtro }: { texto: string; hayFiltros: boolean; onQuitar: () => void; onOtro?: () => void }) {
  return (
    <View className="items-center py-8">
      <Feather name="search" size={28} color={colors.inkSubtle} />
      <Text className="text-ink text-[15px] font-sansBold mt-3 text-center">{texto}</Text>
      <Text className="text-inkMuted text-sm mt-1 text-center">Prueba con otra palabra o quita algún filtro.</Text>
      <View className="flex-row gap-2 mt-4">
        {hayFiltros && (
          <Pressable onPress={onQuitar} accessibilityRole="button" className="bg-white border border-border rounded-full px-4 py-2.5">
            <Text className="text-ink text-[13px] font-sansSemiBold">Quitar filtros</Text>
          </Pressable>
        )}
        {onOtro !== undefined && (
          <Pressable onPress={onOtro} accessibilityRole="button" className="bg-action rounded-full px-4 py-2.5">
            <Text className="text-white text-[13px] font-sansSemiBold">Cuéntanos tu proyecto</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}


// ---------------------------------------------------------------------------
function Categoria({
  categoria,
  proveedor,
  enCesta,
  onVolver,
  onAbrir,
  onRapido,
  onCesta,
}: {
  categoria: CategoriaCatalogo;
  proveedor: boolean;
  enCesta: number;
  onVolver: () => void;
  onAbrir: (p: PartidaCatalogo) => void;
  onRapido: (l: LineaCesta) => void;
  onCesta: () => void;
}) {
  const [partidas, setPartidas] = useState<PartidaCatalogo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    listarPartidas(categoria.codigo)
      .then((p) => vivo && setPartidas(p))
      .catch((e) => vivo && setError(mensajeDeError(e)))
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
    };
  }, [categoria.codigo]);

  const { anadida, rapido } = useRapido(onRapido);

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader title={categoria.nombre} subtitle="Precio de referencia en España" />
      <Atras onPress={onVolver} texto="Atrás" />
      {cargando ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.action} />
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
            {error !== null && <CajaError texto={error} />}
            {partidas.length === 0 && error === null ? (
              <Text className="text-inkMuted text-sm leading-relaxed">
                Todavía no hay partidas con precio en esta categoría. Puedes contárnoslo en «Otro» y Administración te prepara un presupuesto.
              </Text>
            ) : (
              <View className="gap-3">
                {partidas.map((p) => (
                  <FilaPartida key={p.id} p={p} proveedor={proveedor} hecho={anadida === p.id} onAbrir={onAbrir} onRapido={(x) => rapido(x)} />
                ))}
              </View>
            )}
          </ScrollView>
          {!proveedor && enCesta > 0 && (
            <BarraInferior>
              <BotonCesta n={enCesta} onPress={onCesta} />
            </BarraInferior>
          )}
        </>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
function CantidadInput({
  valor,
  min,
  max,
  unidad,
  onCambiar,
}: {
  valor: number;
  min: number;
  max: number;
  unidad: string;
  onCambiar: (n: number) => void;
}) {
  const [texto, setTexto] = useState(formatoCantidad(valor));
  useEffect(() => setTexto(formatoCantidad(valor)), [valor]);
  const fijar = (n: number) => onCambiar(Math.min(max, Math.max(min, Math.round(n * 100) / 100)));
  return (
    <View className="flex-row items-center gap-2">
      <Pressable
        onPress={() => fijar(valor - 1)}
        accessibilityLabel="Quitar uno"
        accessibilityRole="button"
        className="bg-white rounded-full items-center justify-center border border-border"
        style={{ width: 36, height: 36 }}
      >
        <Feather name="minus" size={18} color={colors.action} />
      </Pressable>
      <TextInput
        value={texto}
        onChangeText={setTexto}
        onBlur={() => {
          const n = Number(texto.replace(',', '.'));
          fijar(Number.isNaN(n) ? valor : n);
          if (Number.isNaN(n)) setTexto(formatoCantidad(valor));
        }}
        keyboardType="decimal-pad"
        accessibilityLabel={`Cantidad en ${unidad}`}
        className="bg-white border border-border rounded-xl text-ink text-center text-base font-sansBold"
        style={{ minWidth: 72, paddingVertical: 8 }}
      />
      <Pressable
        onPress={() => fijar(valor + 1)}
        accessibilityLabel="Añadir uno"
        accessibilityRole="button"
        className="bg-action rounded-full items-center justify-center"
        style={{ width: 36, height: 36 }}
      >
        <Feather name="plus" size={18} color={colors.white} />
      </Pressable>
      <Text className="text-inkMuted text-sm">{unidad}</Text>
    </View>
  );
}

/** Con / sin materiales: dos botones DENTRO de cada opción, cada uno con su precio. */
function OpcionAcabado({
  partida,
  acabado,
  seleccionada,
  modalidad,
  onElegir,
}: {
  partida: PartidaCatalogo;
  acabado: Acabado;
  seleccionada: boolean;
  modalidad: Modalidad;
  onElegir: (a: Acabado, m: Modalidad) => void;
}) {
  const mods = modalidadesDe(partida, acabado);
  const primera = mods[0];
  return (
    <View
      className={`rounded-3xl p-3 border ${seleccionada ? 'bg-white border-action' : 'bg-white/70 border-white'}`}
      style={seleccionada ? { ...SOMBRA, shadowColor: '#1951FC', shadowOpacity: 0.22 } : SOMBRA}
    >
      <Pressable
        onPress={() => onElegir(acabado, seleccionada ? modalidad : primera)}
        accessibilityRole="radio"
        accessibilityState={{ selected: seleccionada }}
        className="flex-row items-center justify-between mb-2"
      >
        <Text className="text-ink text-[15px] font-sansBold">{acabado === 'unico' ? 'Precio único' : `Acabado ${ETIQUETA_ACABADO[acabado].toLowerCase()}`}</Text>
        <View
          className={`rounded-full items-center justify-center ${seleccionada ? 'bg-action' : 'border border-borderStrong'}`}
          style={{ width: 22, height: 22 }}
        >
          {seleccionada && <Feather name="check" size={14} color={colors.white} />}
        </View>
      </Pressable>
      <View className="flex-row bg-canvas rounded-2xl p-1">
        {mods.map((m) => {
          const activo = seleccionada && m === modalidad;
          const pr = precioDe(partida, acabado, m);
          return (
            <Pressable
              key={m}
              onPress={() => onElegir(acabado, m)}
              accessibilityRole="button"
              accessibilityState={{ selected: activo }}
              accessibilityLabel={`${ETIQUETA_MODALIDAD[m]} ${pr ? num(pr.ref) : ''} por ${partida.unidad}`}
              className={`flex-1 rounded-xl py-2.5 items-center ${activo ? 'bg-action' : ''}`}
            >
              <Text className={`text-xs font-sansSemiBold ${activo ? 'text-white' : 'text-inkMuted'}`}>{ETIQUETA_MODALIDAD[m]}</Text>
              <Text className={`text-[13px] font-sansBold mt-0.5 ${activo ? 'text-white' : 'text-ink'}`}>
                {pr ? `${num(pr.ref)} / ${partida.unidad}` : '—'}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function Detalle({
  partida,
  proveedor,
  enCesta,
  onVolver,
  onAnadir,
  onContactar,
  onCesta,
}: {
  partida: PartidaCatalogo;
  proveedor: boolean;
  enCesta: number;
  onVolver: () => void;
  onAnadir: (l: LineaCesta) => void;
  onContactar: () => void;
  onCesta: () => void;
}) {
  const acabados = useMemo(() => acabadosDe(partida), [partida]);
  const inicial = opcionRapida(partida);
  const [acabado, setAcabado] = useState<Acabado>(inicial?.acabado ?? acabados[0] ?? 'unico');
  const [modalidad, setModalidad] = useState<Modalidad>(inicial?.modalidad ?? 'mano_obra_materiales');
  const [cantidad, setCantidad] = useState<number>(partida.cantidad_defecto);

  const precio = precioDe(partida, acabado, modalidad);
  const elegir = (a: Acabado, m: Modalidad) => {
    setAcabado(a);
    setModalidad(m);
  };

  return (
    <View className="flex-1 bg-canvas">
      <View>
        <LinearGradient colors={['#BFE0FF', '#E4EEFF', '#F4F8FF']} style={{ paddingTop: 12 }}>
          <Atras onPress={onVolver} texto="Volver" />
          <View className="items-center pb-3">
            <View pointerEvents="none" style={{ position: 'absolute', bottom: 6, width: 140, height: 18, borderRadius: 70, backgroundColor: 'rgba(25,81,252,0.18)' }} />
            <Flotante clave={partida.icono} categoria={partida.categoria} size={120} />
          </View>
        </LinearGradient>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
        <Text className="text-ink text-xl font-sansBold">{partida.nombre}</Text>
        {partida.descripcion !== '' && <Text className="text-inkMuted text-sm mt-1">{partida.descripcion}</Text>}
        {partida.incluye !== null && partida.incluye !== '' && (
          <Text className="text-inkMuted text-[13px] mt-2">Incluye: {partida.incluye}</Text>
        )}

        {acabados.length === 0 ? (
          <Text className="text-inkMuted text-sm mt-4">Esta partida todavía no tiene precio.</Text>
        ) : (
          <>
            <Text className="text-ink text-sm font-sansBold mt-5 mb-2">Elige tu opción</Text>
            <View className="gap-3">
              {acabados.map((a) => (
                <OpcionAcabado key={a} partida={partida} acabado={a} seleccionada={a === acabado} modalidad={modalidad} onElegir={elegir} />
              ))}
            </View>

            {!proveedor && (
              <>
                <Text className="text-ink text-sm font-sansBold mt-5 mb-2">Cantidad</Text>
                <CantidadInput valor={cantidad} min={partida.cantidad_min} max={partida.cantidad_max} unidad={partida.unidad} onCambiar={setCantidad} />
                <Text className="text-inkSubtle text-[13px] mt-1">
                  Entre {formatoCantidad(partida.cantidad_min)} y {formatoCantidad(partida.cantidad_max)} {partida.unidad}
                </Text>
              </>
            )}
            <Text className="text-inkMuted text-[13px] mt-4">{AVISO_ESTIMACION}</Text>
          </>
        )}
      </ScrollView>
      {acabados.length > 0 && (
        <BarraInferior>
          {proveedor ? (
            <Pressable onPress={onContactar} accessibilityRole="button" className="bg-action rounded-full py-3.5 items-center" style={SOMBRA}>
              <Text className="text-white font-sansBold text-sm">Escribir a 3B Conecta sobre esta partida</Text>
            </Pressable>
          ) : (
            <View className="flex-row items-center gap-3">
              <View className="flex-1">
                <Text className="text-inkMuted text-xs">Total estimado · {ETIQUETA_MODALIDAD[modalidad].toLowerCase()}</Text>
                <Text className="text-ink text-lg font-sansBold">
                  {precio !== undefined ? rango(precio.bajo * cantidad, precio.alto * cantidad) : '—'}
                </Text>
              </View>
              {enCesta > 0 && (
                <Pressable onPress={onCesta} accessibilityRole="button" accessibilityLabel={`Ver pedido (${enCesta})`} className="bg-white rounded-full items-center justify-center border border-border" style={{ width: 46, height: 46 }}>
                  <Feather name="shopping-bag" size={18} color={colors.ink} />
                </Pressable>
              )}
              <Pressable
                onPress={() => precio !== undefined && onAnadir(lineaDe(partida, acabado, modalidad, cantidad))}
                disabled={precio === undefined}
                accessibilityRole="button"
                className={`rounded-full px-6 py-3.5 ${precio === undefined ? 'bg-border' : 'bg-action'}`}
                style={SOMBRA}
              >
                <Text className="text-white font-sansBold text-sm">Añadir</Text>
              </Pressable>
            </View>
          )}
        </BarraInferior>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
function Presupuesto({
  cesta,
  onModalidad,
  onCantidad,
  onQuitar,
  onVolver,
  onEnviado,
}: {
  cesta: LineaCesta[];
  onModalidad: (i: number, m: Modalidad) => void;
  onCantidad: (i: number, n: number) => void;
  onQuitar: (i: number) => void;
  onVolver: () => void;
  onEnviado: () => void;
}) {
  const pagosActivos = usePagosActivos();
  const [est, setEst] = useState<Estimacion | null>(null);
  const [cargando, setCargando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // El servidor calcula la estimación cada vez que cambia el pedido (esta app nunca envía precios)
  const clave = JSON.stringify(cesta.map((l) => [l.partida_id, l.acabado, l.modalidad, l.cantidad]));
  const calcular = useCallback(async () => {
    if (cesta.length === 0) {
      setEst(null);
      return;
    }
    setCargando(true);
    setError(null);
    try {
      setEst(await estimarCesta(cesta));
    } catch (e) {
      setError(mensajeDeError(e));
    }
    setCargando(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  useEffect(() => {
    calcular();
  }, [calcular]);

  const enviar = async () => {
    setEnviando(true);
    setError(null);
    try {
      await enviarSolicitudCatalogo(cesta);
      onEnviado();
    } catch (e) {
      setError(mensajeDeError(e));
      setEnviando(false);
    }
  };
  const bloqueado = enviando || cargando || est === null;

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader title="Tu pedido" subtitle="Precio de referencia en España" />
      <Atras onPress={onVolver} texto="Seguir eligiendo" />
      {cesta.length === 0 ? (
        <Text className="text-inkMuted text-sm px-4">Todavía no has añadido nada. Elige una categoría para empezar.</Text>
      ) : (
        <>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
            {error !== null && <CajaError texto={error} />}
            <View className="gap-3">
              {cesta.map((l, i) => {
                const e = est?.lineas[i];
                return (
                  <Vidrio key={`${l.partida_id}-${l.acabado}-${l.modalidad}-${i}`} className="p-3.5">
                    <View className="flex-row items-start">
                      <Flotante clave={l.icono} categoria={l.categoria} size={48} />
                      <View className="flex-1 px-3">
                        <Text className="text-ink text-[15px] font-sansBold">{l.nombre}</Text>
                        <Text className="text-ink opacity-75 text-xs mt-0.5">
                          {l.acabado !== 'unico' ? `Acabado ${ETIQUETA_ACABADO[l.acabado].toLowerCase()} · ` : ''}
                          {formatoCantidad(l.cantidad)} {l.unidad}
                        </Text>
                        <Text className="text-sm font-sansBold mt-1" style={{ color: AZUL_TEXTO }}>
                          {e === undefined ? 'Calculando…' : e.sin_precio ? 'Sin precio: lo revisa Administración' : rango(e.subtotal_bajo ?? 0, e.subtotal_alto ?? 0)}
                        </Text>
                      </View>
                      <Pressable onPress={() => onQuitar(i)} accessibilityLabel={`Quitar ${l.nombre}`} accessibilityRole="button" hitSlop={8}>
                        <Feather name="trash-2" size={18} color={colors.inkMuted} />
                      </Pressable>
                    </View>
                    {l.modalidades.length > 1 && (
                      <View className="flex-row bg-canvas rounded-2xl p-1 mt-3">
                        {l.modalidades.map((m) => {
                          const activo = m === l.modalidad;
                          return (
                            <Pressable
                              key={m}
                              onPress={() => onModalidad(i, m)}
                              accessibilityRole="button"
                              accessibilityState={{ selected: activo }}
                              className={`flex-1 rounded-xl py-2 items-center ${activo ? 'bg-action' : ''}`}
                            >
                              <Text className={`text-xs font-sansSemiBold ${activo ? 'text-white' : 'text-ink opacity-75'}`}>{ETIQUETA_MODALIDAD[m]}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    )}
                    {l.modalidades.length === 1 && (
                      <Text className="text-ink opacity-75 text-xs mt-2">{ETIQUETA_MODALIDAD[l.modalidad]} (la única opción con precio)</Text>
                    )}
                    <View className="mt-3">
                      <CantidadInput valor={l.cantidad} min={l.cantidad_min} max={l.cantidad_max} unidad={l.unidad} onCambiar={(n) => onCantidad(i, n)} />
                    </View>
                  </Vidrio>
                );
              })}
            </View>
            <View className="bg-actionTint rounded-2xl p-3 mt-4 flex-row gap-2 items-start">
              <Feather name="info" size={16} color={colors.action} style={{ marginTop: 2 }} />
              <Text className="text-ink text-[13px] flex-1">{AVISO_ESTIMACION}</Text>
            </View>
          </ScrollView>
          <BarraInferior>
            <View className="flex-row items-end justify-between mb-3">
              <View>
                <Text className="text-inkMuted text-xs">Total estimado · IVA a confirmar{est?.parcial ? ' · parcial' : ''}</Text>
                {cargando && est === null ? (
                  <ActivityIndicator color={colors.action} style={{ alignSelf: 'flex-start', marginTop: 4 }} />
                ) : (
                  <Text className="text-ink text-xl font-sansBold">{est !== null ? rango(est.total_bajo, est.total_alto) : '—'}</Text>
                )}
              </View>
              <Text className="text-inkMuted text-xs">
                {cesta.length} partida{cesta.length === 1 ? '' : 's'}
              </Text>
            </View>
            <Pressable
              onPress={enviar}
              disabled={bloqueado}
              accessibilityRole="button"
              className={`rounded-full py-3.5 items-center ${bloqueado ? 'bg-border' : 'bg-action'}`}
              style={SOMBRA}
            >
              {enviando ? <ActivityIndicator color={colors.white} /> : <Text className="text-white font-sansBold text-sm">Enviar petición de obra</Text>}
            </Pressable>
            {/* «Pagar» ya está en el diseño, pero sigue apagado: no hay pagos hasta que Administración los active y esté
                decidido quién cobra. Con pagos desactivados el botón no hace nada. */}
            <Pressable
              disabled
              accessibilityRole="button"
              accessibilityState={{ disabled: true }}
              accessibilityLabel="Pagar, disponible próximamente"
              className="rounded-full py-3 items-center mt-2 border border-border bg-white/60"
            >
              <Text className="text-inkSubtle font-sansBold text-sm">Pagar · próximamente</Text>
            </Pressable>
            {pagosActivos && (
              <Text className="text-inkSubtle text-[12px] text-center mt-1">El pago desde la app todavía no está disponible para este pedido.</Text>
            )}
          </BarraInferior>
        </>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
/** Un proveedor escribe a 3B Conecta (sobre una partida o en general). No se envía ningún correo: lo ve Administración. */
function Contacto({ partida, onVolver }: { partida: PartidaCatalogo | null; onVolver: () => void }) {
  const [mensaje, setMensaje] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [hecho, setHecho] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valido = mensaje.trim().length >= 5;

  const enviar = async () => {
    setEnviando(true);
    setError(null);
    try {
      await contactarCatalogo(partida?.id ?? null, mensaje.trim());
      setHecho(true);
    } catch (e) {
      setError(mensajeDeError(e));
    }
    setEnviando(false);
  };

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader title="Escribir a 3B Conecta" subtitle={partida !== null ? partida.nombre : 'Consulta general'} />
      <Atras onPress={onVolver} texto="Atrás" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        {hecho ? (
          <View className="bg-white/80 rounded-3xl border border-white p-5 items-center" style={SOMBRA}>
            <Feather name="check-circle" size={36} color={colors.success} />
            <Text className="text-ink text-base font-sansBold mt-3 text-center">Mensaje enviado</Text>
            <Text className="text-inkMuted text-sm mt-1 text-center">Administración lo verá en su panel y te responderá.</Text>
          </View>
        ) : (
          <>
            {error !== null && <CajaError texto={error} />}
            <Text className="text-ink text-sm font-sansBold mb-2">¿Qué quieres decirnos?</Text>
            <TextInput
              value={mensaje}
              onChangeText={setMensaje}
              multiline
              maxLength={1000}
              placeholder="Por ejemplo: hacemos esta partida en Albacete y podemos empezar el mes que viene."
              accessibilityLabel="Mensaje"
              className="bg-white border border-border rounded-2xl p-3 text-ink text-sm"
              style={{ minHeight: 120, textAlignVertical: 'top' }}
            />
            <Text className="text-inkSubtle text-[13px] mt-1">No escribas números de tarjeta ni de cuenta.</Text>
            <Pressable
              onPress={enviar}
              disabled={!valido || enviando}
              accessibilityRole="button"
              className={`rounded-full py-3.5 items-center mt-4 ${!valido || enviando ? 'bg-border' : 'bg-action'}`}
            >
              {enviando ? <ActivityIndicator color={colors.white} /> : <Text className="text-white font-sansBold text-sm">Enviar mensaje</Text>}
            </Pressable>
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
function Enviado({ onVolver }: { onVolver: () => void }) {
  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader title="Petición enviada" />
      <View className="flex-1 px-4 pt-6 items-center">
        <View className="bg-actionTint rounded-full items-center justify-center" style={{ width: 72, height: 72 }}>
          <Feather name="check" size={36} color={colors.action} />
        </View>
        <Text className="text-ink text-lg font-sansBold mt-4 text-center">Hemos recibido tu petición</Text>
        <Text className="text-inkMuted text-sm mt-2 text-center leading-relaxed">
          Administración la revisará antes de publicar tu obra. Si necesita algo más, te lo pedirá. El precio que has visto es solo una referencia y no es una oferta.
        </Text>
        <Pressable onPress={onVolver} accessibilityRole="button" className="bg-action rounded-xl py-3 px-6 items-center mt-6">
          <Text className="text-white font-sansBold text-sm">Volver al catálogo</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
const TIPOS_TRABAJO: { valor: TipoTrabajo; texto: string }[] = [
  { valor: 'reforma', texto: 'Reforma' },
  { valor: 'ampliacion', texto: 'Ampliación' },
  { valor: 'exterior', texto: 'Exterior' },
  { valor: 'reparacion', texto: 'Reparación' },
  { valor: 'otro', texto: 'Otro' },
];
const PLAZOS: { valor: PlazoProyecto; texto: string }[] = [
  { valor: 'urgente', texto: 'Urgente' },
  { valor: '1_mes', texto: 'En 1 mes' },
  { valor: '3_meses', texto: 'En 3 meses' },
  { valor: 'sin_prisa', texto: 'Sin prisa' },
];

function Chips<T extends string>({
  opciones,
  valor,
  onCambiar,
}: {
  opciones: { valor: T; texto: string }[];
  valor: T | null;
  onCambiar: (v: T) => void;
}) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {opciones.map((o) => {
        const activo = o.valor === valor;
        return (
          <Pressable
            key={o.valor}
            onPress={() => onCambiar(o.valor)}
            accessibilityRole="button"
            accessibilityState={{ selected: activo }}
            className={`rounded-full px-4 py-2 border ${activo ? 'bg-action border-action' : 'bg-surface border-border'}`}
          >
            <Text className={`text-xs font-sansSemiBold ${activo ? 'text-white' : 'text-ink'}`}>{o.texto}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Personalizado({ onVolver, onEnviado }: { onVolver: () => void; onEnviado: () => void }) {
  const [tipo, setTipo] = useState<TipoTrabajo | null>('reforma');
  const [descripcion, setDescripcion] = useState('');
  const [superficie, setSuperficie] = useState('');
  const [plazo, setPlazo] = useState<PlazoProyecto | null>('sin_prisa');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enviar = async () => {
    setError(null);
    if (descripcion.trim().length < 10) {
      setError('Describe el proyecto con al menos 10 caracteres.');
      return;
    }
    const m2 = superficie.trim() === '' ? null : Number(superficie.replace(',', '.'));
    if (m2 !== null && (Number.isNaN(m2) || m2 <= 0 || m2 > 100000)) {
      setError('La superficie debe ser un número mayor que cero.');
      return;
    }
    setEnviando(true);
    try {
      await enviarSolicitudPersonalizada({ descripcion: descripcion.trim(), tipoTrabajo: tipo, superficie: m2, plazo });
      onEnviado();
    } catch (e) {
      setError(mensajeDeError(e));
      setEnviando(false);
    }
  };

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader title="Cuéntanos tu proyecto" subtitle="Si no lo encuentras en el catálogo" />
      <Atras onPress={onVolver} texto="Atrás" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
        {error !== null && <CajaError texto={error} />}
        <Text className="text-inkMuted text-sm mb-4">Descríbelo y Administración te prepara el presupuesto.</Text>

        <Text className="text-ink text-xs font-sansSemiBold mb-2">¿Qué tipo de trabajo es?</Text>
        <Chips opciones={TIPOS_TRABAJO} valor={tipo} onCambiar={setTipo} />

        <Text className="text-ink text-xs font-sansSemiBold mt-4 mb-2">Describe lo que quieres hacer</Text>
        <TextInput
          value={descripcion}
          onChangeText={setDescripcion}
          multiline
          maxLength={2000}
          editable={!enviando}
          placeholder="Ej.: quiero cerrar la terraza con aluminio y poner suelo nuevo"
          placeholderTextColor={colors.inkSubtle}
          accessibilityLabel="Descripción del proyecto"
          className="bg-surface border border-border rounded-xl p-3 text-ink"
          style={{ minHeight: 110, textAlignVertical: 'top' }}
        />
        <Text className="text-inkSubtle text-[13px] mt-1">No escribas aquí datos personales (DNI, tarjetas ni cuentas bancarias).</Text>

        <Text className="text-ink text-xs font-sansSemiBold mt-4 mb-2">Superficie aproximada en m² (opcional)</Text>
        <TextInput
          value={superficie}
          onChangeText={setSuperficie}
          keyboardType="decimal-pad"
          editable={!enviando}
          placeholder="m²"
          placeholderTextColor={colors.inkSubtle}
          accessibilityLabel="Superficie en metros cuadrados"
          className="bg-surface border border-border rounded-xl px-3 py-3 text-ink"
        />

        <Text className="text-ink text-xs font-sansSemiBold mt-4 mb-2">¿Cuándo?</Text>
        <Chips opciones={PLAZOS} valor={plazo} onCambiar={setPlazo} />

        <Pressable
          onPress={enviar}
          disabled={enviando}
          accessibilityRole="button"
          className={`rounded-xl py-3 items-center mt-6 ${enviando ? 'bg-border' : 'bg-action'}`}
        >
          {enviando ? <ActivityIndicator color={colors.white} /> : <Text className="text-white font-sansBold text-sm">Pedir presupuesto</Text>}
        </Pressable>
      </ScrollView>
    </View>
  );
}