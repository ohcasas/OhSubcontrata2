import { useCallback, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, RefreshControl, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { colors } from '../../design-system/tokens';
import ScreenHeader from '../../components/ScreenHeader';
import { formatearMoneda } from '../../utils/moneda';
import LicitacionDetalle from './LicitacionDetalle';
import { ETIQUETA_ESTADO_OBRA, ESTILO_ESTADO_OBRA, fechaCorta, parsearImporte } from './estados';

type Licitacion = {
  id: string;
  referencia: string;
  titulo: string;
  estado: string;
  presupuesto: number;
  plazo_cierre: string | null;
  created_at: string;
  n_postulaciones: number;
  n_pendientes: number;
};

type Vista = { tipo: 'lista' } | { tipo: 'nueva' } | { tipo: 'detalle'; id: string };

/**
 * Pestaña "Licitaciones" de promotoras y constructoras: publican licitaciones,
 * reciben las postulaciones de oficios y adjudican. Tres vistas dentro de la
 * misma pestaña (lista, nueva, detalle), sin navegador propio.
 */
export default function MisLicitacionesScreen() {
  const [vista, setVista] = useState<Vista>({ tipo: 'lista' });

  if (vista.tipo === 'detalle') {
    return <LicitacionDetalle obraId={vista.id} onVolver={() => setVista({ tipo: 'lista' })} />;
  }
  if (vista.tipo === 'nueva') {
    return (
      <NuevaLicitacion
        onCancelar={() => setVista({ tipo: 'lista' })}
        onCreada={(id) => setVista({ tipo: 'detalle', id })}
      />
    );
  }
  return (
    <ListaLicitaciones
      onNueva={() => setVista({ tipo: 'nueva' })}
      onAbrir={(id) => setVista({ tipo: 'detalle', id })}
    />
  );
}

// ---------------------------------------------------------------------------
function ListaLicitaciones({ onNueva, onAbrir }: { onNueva: () => void; onAbrir: (id: string) => void }) {
  const [items, setItems] = useState<Licitacion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setError(null);
    const { data, error: errorRpc } = await supabase.rpc('mis_licitaciones');
    if (errorRpc) setError(errorRpc.message);
    else setItems((data as Licitacion[] | null) ?? []);
    setCargando(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [cargar]),
  );

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader title="Licitaciones" subtitle="Las que tú publicas" />
      {cargando ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.action} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          refreshControl={
            <RefreshControl
              refreshing={refrescando}
              onRefresh={async () => {
                setRefrescando(true);
                await cargar();
                setRefrescando(false);
              }}
              colors={[colors.action]}
            />
          }
        >
          {error !== null && (
            <View className="bg-errorTint rounded-lg px-3 py-2 mb-3 flex-row items-center gap-2">
              <Feather name="alert-circle" size={16} color={colors.error} />
              <Text className="text-error text-sm flex-1">{error}</Text>
            </View>
          )}

          <Pressable onPress={onNueva} className="bg-action rounded-xl py-3 items-center flex-row justify-center gap-2 mb-4">
            <Feather name="plus" size={16} color={colors.white} />
            <Text className="text-white font-sansBold text-sm">Publicar licitación</Text>
          </Pressable>

          {items.length === 0 ? (
            <Text className="text-inkMuted text-sm">
              Todavía no has publicado ninguna. Al publicar una, los oficios podrán verla y postularse con su oferta.
            </Text>
          ) : (
            <View className="gap-2.5">
              {items.map((l) => {
                const estilo = ESTILO_ESTADO_OBRA[l.estado] ?? ESTILO_ESTADO_OBRA.abierta;
                return (
                  <Pressable
                    key={l.id}
                    onPress={() => onAbrir(l.id)}
                    className="bg-surface rounded-xl border border-border p-3.5"
                  >
                    <View className="flex-row justify-between items-start">
                      <Text className="text-ink text-sm font-sansBold flex-1 pr-2">{l.titulo}</Text>
                      <View className={`rounded-md px-2 py-0.5 ${estilo.fondo}`}>
                        <Text className={`text-[10px] font-sansBold ${estilo.texto}`}>
                          {ETIQUETA_ESTADO_OBRA[l.estado] ?? l.estado}
                        </Text>
                      </View>
                    </View>
                    <Text className="text-inkMuted text-xs mt-0.5">
                      {l.referencia} · {formatearMoneda(Number(l.presupuesto))}
                      {l.estado === 'abierta' && l.plazo_cierre !== null ? ` · cierra el ${fechaCorta(l.plazo_cierre)}` : ''}
                    </Text>
                    <View className="flex-row items-center gap-1.5 mt-2 pt-2 border-t border-border">
                      <Feather name="users" size={12} color={Number(l.n_pendientes) > 0 ? colors.action : colors.inkMuted} />
                      <Text
                        className={`text-xs ${Number(l.n_pendientes) > 0 ? 'text-action font-sansSemiBold' : 'text-inkMuted'}`}
                      >
                        {Number(l.n_postulaciones)} postulaci{Number(l.n_postulaciones) === 1 ? 'ón' : 'ones'}
                        {Number(l.n_pendientes) > 0 ? ` · ${Number(l.n_pendientes)} sin responder` : ''}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
const DIAS_ABIERTA = [7, 15, 30, 60];

function NuevaLicitacion({ onCancelar, onCreada }: { onCancelar: () => void; onCreada: (id: string) => void }) {
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [especialidad, setEspecialidad] = useState('');
  const [ubicacion, setUbicacion] = useState('');
  const [presupuesto, setPresupuesto] = useState('');
  const [duracion, setDuracion] = useState('');
  const [requisitos, setRequisitos] = useState('');
  const [dias, setDias] = useState(15);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePublicar = async () => {
    setError(null);
    if (titulo.trim().length < 3) {
      setError('Escribe un título.');
      return;
    }
    const importe = parsearImporte(presupuesto);
    if (importe === null || importe <= 0) {
      setError('Indica el presupuesto en euros (por ejemplo, 50000).');
      return;
    }
    const dur = duracion.trim() === '' ? null : Number(duracion.trim());
    if (dur !== null && (!Number.isInteger(dur) || dur <= 0)) {
      setError('La duración estimada tiene que ser un número de días.');
      return;
    }

    setEnviando(true);
    const { data, error: errorRpc } = await supabase.rpc('crear_licitacion', {
      p_titulo: titulo,
      p_descripcion: descripcion,
      p_especialidad: especialidad,
      p_ubicacion: ubicacion,
      p_presupuesto: importe,
      p_dias_abierta: dias,
      p_requisitos: requisitos,
      p_duracion_dias: dur,
    });
    setEnviando(false);

    if (errorRpc || typeof data !== 'string') {
      setError(errorRpc?.message ?? 'No se ha podido publicar la licitación.');
      return;
    }
    onCreada(data);
  };

  const campo = (
    etiqueta: string,
    valor: string,
    cambiar: (t: string) => void,
    opciones: { placeholder?: string; multilinea?: boolean; teclado?: 'decimal-pad' | 'number-pad' } = {},
  ) => (
    <View className="mb-3">
      <Text className="text-ink text-xs font-sansSemiBold mb-1">{etiqueta}</Text>
      <View className="bg-surface border border-border rounded-xl px-3">
        <TextInput
          value={valor}
          onChangeText={cambiar}
          placeholder={opciones.placeholder}
          placeholderTextColor={colors.inkSubtle}
          editable={!enviando}
          multiline={opciones.multilinea}
          keyboardType={opciones.teclado ?? 'default'}
          className="py-3 text-ink"
          style={opciones.multilinea ? { minHeight: 80, textAlignVertical: 'top' } : undefined}
        />
      </View>
    </View>
  );

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader title="Publicar licitación" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        {error !== null && (
          <View className="bg-errorTint rounded-lg px-3 py-2 mb-3 flex-row items-center gap-2">
            <Feather name="alert-circle" size={16} color={colors.error} />
            <Text className="text-error text-sm flex-1">{error}</Text>
          </View>
        )}

        {campo('Título *', titulo, setTitulo, { placeholder: 'Qué necesitas contratar' })}
        {campo('Descripción', descripcion, setDescripcion, { placeholder: 'Cuenta los detalles del trabajo', multilinea: true })}
        {campo('Especialidad que buscas', especialidad, setEspecialidad, { placeholder: 'Ej: Fontanería, estructura, piscinas...' })}
        {campo('Ubicación', ubicacion, setUbicacion, { placeholder: 'Ciudad o zona' })}
        {campo('Presupuesto (€) *', presupuesto, setPresupuesto, { placeholder: 'Ej: 50000', teclado: 'decimal-pad' })}
        {campo('Duración estimada (días)', duracion, setDuracion, { placeholder: 'Opcional', teclado: 'number-pad' })}
        {campo('Requisitos', requisitos, setRequisitos, { placeholder: 'Ej: PRL 20h, seguro de responsabilidad civil', multilinea: true })}

        <Text className="text-ink text-xs font-sansSemiBold mb-1.5">Abierta durante</Text>
        <View className="flex-row mb-5" style={{ gap: 6 }}>
          {DIAS_ABIERTA.map((d) => (
            <Pressable
              key={d}
              onPress={() => setDias(d)}
              className={`rounded-full px-4 py-2 border ${dias === d ? 'bg-ink border-ink' : 'bg-surface border-border'}`}
            >
              <Text className={`text-xs font-sansSemiBold ${dias === d ? 'text-white' : 'text-ink'}`}>{d} días</Text>
            </Pressable>
          ))}
        </View>

        <Pressable
          onPress={handlePublicar}
          disabled={enviando}
          className="bg-action rounded-xl py-3 items-center flex-row justify-center gap-2"
        >
          {enviando ? <ActivityIndicator color={colors.white} /> : <Feather name="send" size={15} color={colors.white} />}
          <Text className="text-white font-sansBold text-sm">{enviando ? 'Publicando…' : 'Publicar'}</Text>
        </Pressable>
        <Pressable onPress={onCancelar} disabled={enviando} className="items-center py-3 mt-1">
          <Text className="text-inkMuted text-sm">Cancelar</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}