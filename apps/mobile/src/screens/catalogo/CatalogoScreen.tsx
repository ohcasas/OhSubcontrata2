import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../../design-system/tokens';
import ScreenHeader from '../../components/ScreenHeader';
import { formatearMoneda } from '../../utils/moneda';
import { mensajeDeError } from '../../services/peticiones';
import {
  ETIQUETA_ACABADO,
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
  | { t: 'otro' };

const ICONO_CATEGORIA: Record<string, React.ComponentProps<typeof Feather>['name']> = {
  casa: 'home',
  banera: 'droplet',
  cocina: 'coffee',
  capas: 'layers',
  rodillo: 'edit-3',
  rayo: 'zap',
  gota: 'cloud-drizzle',
  puerta: 'square',
  ventana: 'maximize',
  edificio: 'layout',
  mas: 'plus',
};
const iconoDe = (clave: string): React.ComponentProps<typeof Feather>['name'] => ICONO_CATEGORIA[clave] ?? 'grid';

const ORDEN_ACABADO: Acabado[] = ['unico', 'basico', 'medio', 'alto'];
const ETIQUETA_MODALIDAD: Record<Modalidad, string> = {
  mano_obra_materiales: 'Con materiales',
  solo_mano_obra: 'Solo mano de obra',
};
const AVISO_ESTIMACION =
  'Estimación orientativa con precios de referencia de toda España. No es una oferta: Administración la revisa antes de publicar tu obra. IVA a confirmar.';

const num = (n: number) => formatearMoneda(n).replace(',00 €', ' €');
const rango = (bajo: number, alto: number) => `${num(bajo)} – ${num(alto)}`;

function preciosDe(p: PartidaCatalogo, modalidad: Modalidad): PrecioPartida[] {
  return (p.precios ?? []).filter((x) => x.modalidad === modalidad);
}
function acabadosDe(p: PartidaCatalogo, modalidad: Modalidad): Acabado[] {
  const set = new Set(preciosDe(p, modalidad).map((x) => x.acabado));
  return ORDEN_ACABADO.filter((a) => set.has(a));
}
function formatoCantidad(n: number): string {
  return String(Math.round(n * 100) / 100).replace('.', ',');
}

/**
 * Pestaña «Catálogo» del particular: elige partidas, ve un precio de referencia (igual en toda España) y envía la
 * petición a Administración, que la revisa antes de publicarla. Nada se contrata aquí.
 */
export default function CatalogoScreen() {
  const [vista, setVista] = useState<Vista>({ t: 'inicio' });
  const [cesta, setCesta] = useState<LineaCesta[]>([]);
  const [modalidad, setModalidad] = useState<Modalidad>('mano_obra_materiales');

  const anadir = (linea: LineaCesta) =>
    setCesta((c) => {
      const i = c.findIndex((x) => x.partida_id === linea.partida_id && x.acabado === linea.acabado);
      if (i === -1) return [...c, linea];
      const copia = [...c];
      copia[i] = linea;
      return copia;
    });
  const cambiarCantidad = (i: number, cantidad: number) =>
    setCesta((c) => c.map((x, k) => (k === i ? { ...x, cantidad } : x)));
  const quitar = (i: number) => setCesta((c) => c.filter((_, k) => k !== i));
  const vaciar = () => setCesta([]);

  if (vista.t === 'categoria') {
    return (
      <Categoria
        categoria={vista.categoria}
        modalidad={modalidad}
        enCesta={cesta.length}
        onVolver={() => setVista({ t: 'inicio' })}
        onAbrir={(partida) => setVista({ t: 'detalle', categoria: vista.categoria, partida })}
        onCesta={() => setVista({ t: 'presupuesto' })}
      />
    );
  }
  if (vista.t === 'detalle') {
    return (
      <Detalle
        partida={vista.partida}
        modalidad={modalidad}
        onModalidad={setModalidad}
        onVolver={() => setVista({ t: 'categoria', categoria: vista.categoria })}
        onAnadir={(linea) => {
          anadir(linea);
          setVista({ t: 'presupuesto' });
        }}
      />
    );
  }
  if (vista.t === 'presupuesto') {
    return (
      <Presupuesto
        cesta={cesta}
        modalidad={modalidad}
        onModalidad={setModalidad}
        onCantidad={cambiarCantidad}
        onQuitar={quitar}
        onVolver={() => setVista({ t: 'inicio' })}
        onEnviado={() => {
          vaciar();
          setVista({ t: 'enviado' });
        }}
      />
    );
  }
  if (vista.t === 'enviado') return <Enviado onVolver={() => setVista({ t: 'inicio' })} />;
  if (vista.t === 'otro') {
    return <Personalizado onVolver={() => setVista({ t: 'inicio' })} onEnviado={() => setVista({ t: 'enviado' })} />;
  }
  return (
    <Inicio
      enCesta={cesta.length}
      onCategoria={(categoria) => setVista(categoria.es_formulario ? { t: 'otro' } : { t: 'categoria', categoria })}
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

function BotonCesta({ n, onPress }: { n: number; onPress: () => void }) {
  if (n === 0) return null;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" className="bg-action rounded-xl py-3 flex-row items-center justify-center gap-2">
      <Feather name="shopping-bag" size={16} color={colors.white} />
      <Text className="text-white font-sansBold text-sm">Ver mi presupuesto ({n})</Text>
    </Pressable>
  );
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
          <Text className="text-ink text-lg font-sansBold">¿Qué quieres hacer?</Text>
          <Text className="text-inkMuted text-sm mt-1 mb-4">
            Elige una categoría, añade lo que necesitas y te damos un precio de referencia. Si no lo encuentras, cuéntanoslo en «Otro».
          </Text>
          <View className="flex-row flex-wrap justify-between">
            {categorias.map((c) => (
              <Pressable
                key={c.codigo}
                onPress={() => onCategoria(c)}
                accessibilityRole="button"
                accessibilityLabel={c.nombre}
                className="bg-surface rounded-2xl border border-border p-4 mb-3 items-start"
                style={{ width: '48%' }}
              >
                <View className="bg-actionTint rounded-xl items-center justify-center" style={{ width: 44, height: 44 }}>
                  <Feather name={iconoDe(c.icono)} size={22} color={colors.action} />
                </View>
                <Text className="text-ink text-sm font-sansBold mt-3">{c.nombre}</Text>
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
  modalidad,
  enCesta,
  onVolver,
  onAbrir,
  onCesta,
}: {
  categoria: CategoriaCatalogo;
  modalidad: Modalidad;
  enCesta: number;
  onVolver: () => void;
  onAbrir: (p: PartidaCatalogo) => void;
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

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader title={categoria.nombre} subtitle="Precio de referencia en España" />
      <Atras onPress={onVolver} texto="Categorías" />
      {cargando ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.action} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
          {error !== null && <CajaError texto={error} />}
          {partidas.length === 0 && error === null ? (
            <Text className="text-inkMuted text-sm leading-relaxed">
              Todavía no hay partidas con precio en esta categoría. Puedes contárnoslo en «Otro» y Administración te prepara un presupuesto.
            </Text>
          ) : (
            <View className="gap-2.5 mb-4">
              {partidas.map((p) => {
                const precios = preciosDe(p, modalidad);
                const bajo = precios.length ? Math.min(...precios.map((x) => x.bajo)) : null;
                const alto = precios.length ? Math.max(...precios.map((x) => x.alto)) : null;
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => onAbrir(p)}
                    accessibilityRole="button"
                    className="bg-surface rounded-xl border border-border p-3.5"
                  >
                    <Text className="text-ink text-sm font-sansBold">{p.nombre}</Text>
                    {p.descripcion !== '' && (
                      <Text className="text-inkMuted text-xs mt-0.5" numberOfLines={2}>
                        {p.descripcion}
                      </Text>
                    )}
                    <Text className="text-action text-sm font-sansSemiBold mt-2">
                      {bajo !== null && alto !== null ? `${rango(bajo, alto)} / ${p.unidad}` : 'Sin precio en esta modalidad'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
          <BotonCesta n={enCesta} onPress={onCesta} />
        </ScrollView>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
function SelectorModalidad({ valor, onCambiar }: { valor: Modalidad; onCambiar: (m: Modalidad) => void }) {
  return (
    <View className="flex-row bg-surface border border-border rounded-xl p-1">
      {(Object.keys(ETIQUETA_MODALIDAD) as Modalidad[]).map((m) => {
        const activo = m === valor;
        return (
          <Pressable
            key={m}
            onPress={() => onCambiar(m)}
            accessibilityRole="button"
            accessibilityState={{ selected: activo }}
            className={`flex-1 rounded-lg py-2.5 items-center ${activo ? 'bg-action' : ''}`}
          >
            <Text className={`text-xs font-sansSemiBold ${activo ? 'text-white' : 'text-inkMuted'}`}>{ETIQUETA_MODALIDAD[m]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

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
        className="bg-actionTint rounded-full items-center justify-center"
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
        className="bg-surface border border-border rounded-xl text-ink text-center text-base font-sansBold"
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

function Detalle({
  partida,
  modalidad,
  onModalidad,
  onVolver,
  onAnadir,
}: {
  partida: PartidaCatalogo;
  modalidad: Modalidad;
  onModalidad: (m: Modalidad) => void;
  onVolver: () => void;
  onAnadir: (l: LineaCesta) => void;
}) {
  const acabados = useMemo(() => acabadosDe(partida, modalidad), [partida, modalidad]);
  const [acabado, setAcabado] = useState<Acabado>(acabados.includes('medio') ? 'medio' : (acabados[0] ?? 'unico'));
  const [cantidad, setCantidad] = useState<number>(partida.cantidad_defecto);

  // Si al cambiar de modalidad el acabado elegido ya no tiene precio, se pasa al primero que sí lo tenga
  useEffect(() => {
    if (acabados.length > 0 && !acabados.includes(acabado)) setAcabado(acabados[0]);
  }, [acabados, acabado]);

  const precio = preciosDe(partida, modalidad).find((x) => x.acabado === acabado);

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader title="Detalle" subtitle="Precio de referencia en España" />
      <Atras onPress={onVolver} texto="Volver" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        <Text className="text-ink text-lg font-sansBold">{partida.nombre}</Text>
        {partida.descripcion !== '' && <Text className="text-inkMuted text-sm mt-1">{partida.descripcion}</Text>}
        {partida.incluye !== null && partida.incluye !== '' && (
          <Text className="text-inkMuted text-[13px] mt-2">Incluye: {partida.incluye}</Text>
        )}

        <View className="mt-4">
          <SelectorModalidad valor={modalidad} onCambiar={onModalidad} />
        </View>

        {acabados.length === 0 ? (
          <Text className="text-inkMuted text-sm mt-4">Esta partida no tiene precio para «{ETIQUETA_MODALIDAD[modalidad]}».</Text>
        ) : (
          <>
            {acabados.length > 1 && (
              <>
                <Text className="text-ink text-xs font-sansSemiBold mt-4 mb-2">Acabado</Text>
                <View className="flex-row gap-2">
                  {acabados.map((a) => {
                    const activo = a === acabado;
                    return (
                      <Pressable
                        key={a}
                        onPress={() => setAcabado(a)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: activo }}
                        className={`rounded-full px-4 py-2 border ${activo ? 'bg-action border-action' : 'bg-surface border-border'}`}
                      >
                        <Text className={`text-xs font-sansSemiBold ${activo ? 'text-white' : 'text-ink'}`}>{ETIQUETA_ACABADO[a]}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}

            <Text className="text-ink text-xs font-sansSemiBold mt-4 mb-2">Cantidad</Text>
            <CantidadInput valor={cantidad} min={partida.cantidad_min} max={partida.cantidad_max} unidad={partida.unidad} onCambiar={setCantidad} />
            <Text className="text-inkSubtle text-[13px] mt-1">
              Entre {formatoCantidad(partida.cantidad_min)} y {formatoCantidad(partida.cantidad_max)} {partida.unidad}
            </Text>

            {precio !== undefined && (
              <View className="bg-surface rounded-xl border border-border p-4 mt-4">
                <Text className="text-inkMuted text-[13px]">Precio de referencia</Text>
                <Text className="text-ink text-base font-sansBold">
                  {rango(precio.bajo, precio.alto)} / {partida.unidad}
                </Text>
                <Text className="text-inkMuted text-[13px] mt-2">Para {formatoCantidad(cantidad)} {partida.unidad}</Text>
                <Text className="text-action text-lg font-sansBold">{rango(precio.bajo * cantidad, precio.alto * cantidad)}</Text>
              </View>
            )}
            <Text className="text-inkMuted text-[13px] mt-3">{AVISO_ESTIMACION}</Text>

            <Pressable
              onPress={() =>
                onAnadir({
                  partida_id: partida.id,
                  nombre: partida.nombre,
                  unidad: partida.unidad,
                  acabado,
                  cantidad,
                  cantidad_min: partida.cantidad_min,
                  cantidad_max: partida.cantidad_max,
                })
              }
              accessibilityRole="button"
              className="bg-action rounded-xl py-3 items-center mt-4"
            >
              <Text className="text-white font-sansBold text-sm">Añadir a mi presupuesto</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
function Presupuesto({
  cesta,
  modalidad,
  onModalidad,
  onCantidad,
  onQuitar,
  onVolver,
  onEnviado,
}: {
  cesta: LineaCesta[];
  modalidad: Modalidad;
  onModalidad: (m: Modalidad) => void;
  onCantidad: (i: number, n: number) => void;
  onQuitar: (i: number) => void;
  onVolver: () => void;
  onEnviado: () => void;
}) {
  const [est, setEst] = useState<Estimacion | null>(null);
  const [cargando, setCargando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // El servidor calcula la estimación cada vez que cambia la cesta o la modalidad (esta app nunca envía precios)
  const clave = JSON.stringify(cesta.map((l) => [l.partida_id, l.acabado, l.cantidad])) + modalidad;
  const calcular = useCallback(async () => {
    if (cesta.length === 0) {
      setEst(null);
      return;
    }
    setCargando(true);
    setError(null);
    try {
      setEst(await estimarCesta(cesta, modalidad));
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
      await enviarSolicitudCatalogo(cesta, modalidad);
      onEnviado();
    } catch (e) {
      setError(mensajeDeError(e));
      setEnviando(false);
    }
  };

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader title="Tu presupuesto" subtitle="Precio de referencia en España" />
      <Atras onPress={onVolver} texto="Seguir eligiendo" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        {error !== null && <CajaError texto={error} />}
        {cesta.length === 0 ? (
          <Text className="text-inkMuted text-sm">Todavía no has añadido nada. Elige una categoría para empezar.</Text>
        ) : (
          <>
            <View className="bg-navySurface rounded-2xl p-5 mb-4">
              <Text className="text-white text-[13px]">Precio de referencia en España</Text>
              {cargando && est === null ? (
                <ActivityIndicator color={colors.white} style={{ alignSelf: 'flex-start', marginTop: 8 }} />
              ) : est !== null ? (
                <>
                  <Text className="text-white text-2xl font-sansBold mt-1">{rango(est.total_bajo, est.total_alto)}</Text>
                  <Text className="text-white text-[13px] mt-1">
                    {est.lineas.length} partida{est.lineas.length === 1 ? '' : 's'} · IVA a confirmar
                    {est.parcial ? ' · total parcial' : ''}
                  </Text>
                </>
              ) : null}
            </View>

            <SelectorModalidad valor={modalidad} onCambiar={onModalidad} />

            <View className="gap-2.5 mt-4">
              {cesta.map((l, i) => {
                const e = est?.lineas.find((x) => x.partida_id === l.partida_id && x.acabado === l.acabado);
                return (
                  <View key={`${l.partida_id}-${l.acabado}`} className="bg-surface rounded-xl border border-border p-3.5">
                    <View className="flex-row justify-between items-start">
                      <View className="flex-1 pr-2">
                        <Text className="text-ink text-sm font-sansBold">{l.nombre}</Text>
                        <Text className="text-inkMuted text-xs mt-0.5">
                          {l.acabado !== 'unico' ? `Acabado ${ETIQUETA_ACABADO[l.acabado].toLowerCase()} · ` : ''}
                          {e === undefined ? 'Calculando…' : e.sin_precio ? 'Sin precio: lo revisa Administración' : rango(e.subtotal_bajo ?? 0, e.subtotal_alto ?? 0)}
                        </Text>
                      </View>
                      <Pressable onPress={() => onQuitar(i)} accessibilityLabel={`Quitar ${l.nombre}`} accessibilityRole="button" hitSlop={8}>
                        <Feather name="trash-2" size={18} color={colors.inkMuted} />
                      </Pressable>
                    </View>
                    <View className="mt-3">
                      <CantidadInput
                        valor={l.cantidad}
                        min={l.cantidad_min}
                        max={l.cantidad_max}
                        unidad={l.unidad}
                        onCambiar={(n) => onCantidad(i, n)}
                      />
                    </View>
                  </View>
                );
              })}
            </View>

            <View className="bg-actionTint rounded-xl p-3 mt-4 flex-row gap-2 items-start">
              <Feather name="info" size={16} color={colors.action} style={{ marginTop: 2 }} />
              <Text className="text-ink text-[13px] flex-1">{AVISO_ESTIMACION}</Text>
            </View>

            <Pressable
              onPress={enviar}
              disabled={enviando || cargando || est === null}
              accessibilityRole="button"
              className={`rounded-xl py-3 items-center mt-4 ${enviando || cargando || est === null ? 'bg-border' : 'bg-action'}`}
            >
              {enviando ? <ActivityIndicator color={colors.white} /> : <Text className="text-white font-sansBold text-sm">Enviar petición de obra</Text>}
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