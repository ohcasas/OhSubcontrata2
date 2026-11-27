import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Image } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../../design-system/tokens';
import ScreenHeader from '../../components/ScreenHeader';
import { formatearMoneda } from '../../utils/moneda';
import { mensajeDeError } from '../../services/peticiones';
import { usePagosActivos } from '../../services/pagosActivos';
import { iconoCatalogo } from './iconosCatalogo';
import {
  ETIQUETA_ACABADO,
  contactarCatalogo,
  enviarSolicitudCatalogo,
  enviarSolicitudPersonalizada,
  estimarCesta,
  listarCategorias,
  listarPartidas,
  type Acabado,
  type CategoriaCatalogo,
  type Estimacion,
  type LineaCesta,
  type Modalidad,
  type PartidaCatalogo,
  type PlazoProyecto,
  type PrecioPartida,
  type TipoTrabajo,
} from '../../services/catalogo';

type Vista =
  | { t: 'inicio' }
  | { t: 'categoria'; categoria: CategoriaCatalogo }
  | { t: 'detalle'; categoria: CategoriaCatalogo; partida: PartidaCatalogo }
  | { t: 'presupuesto' }
  | { t: 'enviado' }
  | { t: 'otro' }
  | { t: 'contacto'; partida: PartidaCatalogo | null };

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

/**
 * Pestaña «Catálogo»: elige partidas, ve un precio de referencia (igual en toda España) y envía la petición a
 * Administración, que la revisa antes de publicarla. Nada se contrata ni se paga aquí.
 * Con modo «proveedor» el catálogo se consulta y se puede escribir a 3B Conecta, pero no hay pedido.
 */
export default function CatalogoScreen({ modo = 'particular' }: { modo?: 'particular' | 'proveedor' }) {
  const [vista, setVista] = useState<Vista>({ t: 'inicio' });
  const [cesta, setCesta] = useState<LineaCesta[]>([]);
  const proveedor = modo === 'proveedor';

  // Si la misma partida, acabado y modalidad ya está en el pedido, se suma la cantidad (sin pasarse del máximo)
  const anadir = (linea: LineaCesta) =>
    setCesta((c) => {
      const i = c.findIndex((x) => x.partida_id === linea.partida_id && x.acabado === linea.acabado && x.modalidad === linea.modalidad);
      if (i === -1) return [...c, linea];
      const copia = [...c];
      copia[i] = { ...copia[i], cantidad: Math.min(copia[i].cantidad_max, Math.round((copia[i].cantidad + linea.cantidad) * 100) / 100) };
      return copia;
    });
  const cambiarCantidad = (i: number, cantidad: number) => setCesta((c) => c.map((x, k) => (k === i ? { ...x, cantidad } : x)));
  const cambiarModalidad = (i: number, modalidad: Modalidad) => setCesta((c) => c.map((x, k) => (k === i ? { ...x, modalidad } : x)));
  const quitar = (i: number) => setCesta((c) => c.filter((_, k) => k !== i));

  if (vista.t === 'categoria') {
    return (
      <Categoria
        categoria={vista.categoria}
        proveedor={proveedor}
        enCesta={cesta.length}
        onVolver={() => setVista({ t: 'inicio' })}
        onAbrir={(partida) => setVista({ t: 'detalle', categoria: vista.categoria, partida })}
        onRapido={anadir}
        onCesta={() => setVista({ t: 'presupuesto' })}
      />
    );
  }
  if (vista.t === 'detalle') {
    return (
      <Detalle
        partida={vista.partida}
        proveedor={proveedor}
        onVolver={() => setVista({ t: 'categoria', categoria: vista.categoria })}
        onContactar={() => setVista({ t: 'contacto', partida: vista.partida })}
        onAnadir={(linea) => {
          anadir(linea);
          setVista({ t: 'categoria', categoria: vista.categoria });
        }}
        enCesta={cesta.length}
        onCesta={() => setVista({ t: 'presupuesto' })}
      />
    );
  }
  if (vista.t === 'presupuesto') {
    return (
      <Presupuesto
        cesta={cesta}
        onModalidad={cambiarModalidad}
        onCantidad={cambiarCantidad}
        onQuitar={quitar}
        onVolver={() => setVista({ t: 'inicio' })}
        onEnviado={() => {
          setCesta([]);
          setVista({ t: 'enviado' });
        }}
      />
    );
  }
  if (vista.t === 'enviado') return <Enviado onVolver={() => setVista({ t: 'inicio' })} />;
  if (vista.t === 'otro') {
    return <Personalizado onVolver={() => setVista({ t: 'inicio' })} onEnviado={() => setVista({ t: 'enviado' })} />;
  }
  if (vista.t === 'contacto') {
    return <Contacto partida={vista.partida} onVolver={() => setVista({ t: 'inicio' })} />;
  }
  return (
    <Inicio
      enCesta={proveedor ? 0 : cesta.length}
      onCategoria={(categoria) =>
        categoria.es_formulario ? setVista(proveedor ? { t: 'contacto', partida: null } : { t: 'otro' }) : setVista({ t: 'categoria', categoria })
      }
      onCesta={() => setVista({ t: 'presupuesto' })}
    />
  );
}

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

function Flotante({ clave, categoria, size }: { clave?: string | null; categoria?: string | null; size: number }) {
  return <Image source={iconoCatalogo(clave, categoria)} style={{ width: size, height: size }} resizeMode="contain" accessibilityElementsHidden importantForAccessibility="no" />;
}

// ---------------------------------------------------------------------------
function Inicio({
  enCesta,
  onCategoria,
  onCesta,
}: {
  enCesta: number;
  onCategoria: (c: CategoriaCatalogo) => void;
  onCesta: () => void;
}) {
  const [categorias, setCategorias] = useState<CategoriaCatalogo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    listarCategorias()
      .then((c) => vivo && setCategorias(c))
      .catch((e) => vivo && setError(mensajeDeError(e)))
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
    };
  }, []);

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader title="Catálogo" subtitle="Precios de toda España" />
      {cargando ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.action} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
          {error !== null && <CajaError texto={error} />}
          <Text className="text-ink text-lg font-sansBold">¿Qué necesitas?</Text>
          <Text className="text-inkMuted text-sm mt-1 mb-5">
            Elige una categoría, añade lo que necesitas y te damos un precio de referencia. Si no lo encuentras, cuéntanoslo en «Otro».
          </Text>
          <View className="flex-row flex-wrap">
            {categorias.map((c) => (
              <Pressable
                key={c.codigo}
                onPress={() => onCategoria(c)}
                accessibilityRole="button"
                accessibilityLabel={c.nombre}
                className="items-center mb-5"
                style={{ width: '33.33%' }}
              >
                <Flotante clave={c.icono} categoria={c.codigo} size={72} />
                <Text className="text-ink text-[13px] font-sansSemiBold mt-1 text-center" numberOfLines={2}>
                  {c.nombre}
                </Text>
              </Pressable>
            ))}
          </View>
          <BotonCesta n={enCesta} onPress={onCesta} />
          <Text className="text-inkMuted text-[13px] mt-4">{AVISO_ESTIMACION}</Text>
        </ScrollView>
      )}
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
  const [anadida, setAnadida] = useState<string | null>(null);

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

  const rapido = (p: PartidaCatalogo) => {
    const o = opcionRapida(p);
    if (o === null) return;
    onRapido(lineaDe(p, o.acabado, o.modalidad, p.cantidad_defecto));
    setAnadida(p.id);
    setTimeout(() => setAnadida((a) => (a === p.id ? null : a)), 1200);
  };

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader title={categoria.nombre} subtitle="Precio de referencia en España" />
      <Atras onPress={onVolver} texto="Categorías" />
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
                {partidas.map((p) => {
                  const desde = desdePrecio(p);
                  const o = opcionRapida(p);
                  const hecho = anadida === p.id;
                  return (
                    <Pressable
                      key={p.id}
                      onPress={() => onAbrir(p)}
                      accessibilityRole="button"
                      accessibilityLabel={p.nombre}
                      className="bg-white/80 rounded-3xl border border-white p-3 flex-row items-center"
                      style={SOMBRA}
                    >
                      <Flotante clave={p.icono} categoria={p.categoria} size={64} />
                      <View className="flex-1 px-3">
                        <Text className="text-ink text-[15px] font-sansBold" numberOfLines={2}>
                          {p.nombre}
                        </Text>
                        {p.descripcion !== '' && (
                          <Text className="text-inkMuted text-xs mt-0.5" numberOfLines={1}>
                            {p.descripcion}
                          </Text>
                        )}
                        <Text className="text-action text-sm font-sansSemiBold mt-1">
                          {desde !== null ? `Desde ${num(desde)} / ${p.unidad}` : 'Sin precio todavía'}
                        </Text>
                      </View>
                      {!proveedor && o !== null && (
                        <Pressable
                          onPress={() => rapido(p)}
                          accessibilityRole="button"
                          accessibilityLabel={`Añadir ${p.nombre}`}
                          hitSlop={8}
                          className={`rounded-full items-center justify-center ${hecho ? 'bg-success' : 'bg-white'}`}
                          style={{ width: 40, height: 40, ...SOMBRA }}
                        >
                          <Feather name={hecho ? 'check' : 'plus'} size={20} color={hecho ? colors.white : colors.ink} />
                        </Pressable>
                      )}
                    </Pressable>
                  );
                })}
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
                  <View key={`${l.partida_id}-${l.acabado}-${l.modalidad}-${i}`} className="bg-white/80 rounded-3xl border border-white p-3.5" style={SOMBRA}>
                    <View className="flex-row items-start">
                      <Flotante clave={l.icono} categoria={l.categoria} size={48} />
                      <View className="flex-1 px-3">
                        <Text className="text-ink text-[15px] font-sansBold">{l.nombre}</Text>
                        <Text className="text-inkMuted text-xs mt-0.5">
                          {l.acabado !== 'unico' ? `Acabado ${ETIQUETA_ACABADO[l.acabado].toLowerCase()} · ` : ''}
                          {formatoCantidad(l.cantidad)} {l.unidad}
                        </Text>
                        <Text className="text-action text-sm font-sansBold mt-1">
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
                              <Text className={`text-xs font-sansSemiBold ${activo ? 'text-white' : 'text-inkMuted'}`}>{ETIQUETA_MODALIDAD[m]}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    )}
                    {l.modalidades.length === 1 && (
                      <Text className="text-inkMuted text-xs mt-2">{ETIQUETA_MODALIDAD[l.modalidad]} (la única opción con precio)</Text>
                    )}
                    <View className="mt-3">
                      <CantidadInput valor={l.cantidad} min={l.cantidad_min} max={l.cantidad_max} unidad={l.unidad} onCambiar={(n) => onCantidad(i, n)} />
                    </View>
                  </View>
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
      <Atras onPress={onVolver} texto="Catálogo" />
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
      <Atras onPress={onVolver} texto="Categorías" />
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