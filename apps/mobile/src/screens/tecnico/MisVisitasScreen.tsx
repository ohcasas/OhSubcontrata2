import { useCallback, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Linking,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../../design-system/tokens';
import ScreenHeader from '../../components/ScreenHeader';
import { fechaCorta } from '../licitaciones/estados';
import {
  agendarVisita,
  elegirFoto,
  mensajeDeError,
  misVisitas,
  registrarInforme,
  urlDeFoto,
  type FotoElegida,
  type ResultadoVisita,
  type Visita,
} from '../../services/peticiones';

const ESTADO_VISITA: Record<Visita['estado'], { etiqueta: string; fondo: string; texto: string }> = {
  asignada: { etiqueta: 'Por agendar', fondo: 'bg-warningTint', texto: 'text-warning' },
  agendada: { etiqueta: 'Agendada', fondo: 'bg-actionTint', texto: 'text-action' },
  realizada: { etiqueta: 'Hecha', fondo: 'bg-successTint', texto: 'text-success' },
  cancelada: { etiqueta: 'Cancelada', fondo: 'bg-errorTint', texto: 'text-error' },
};

const RESULTADOS: { valor: ResultadoVisita; etiqueta: string; fondo: string; texto: string }[] = [
  { valor: 'apto', etiqueta: 'Apto', fondo: 'bg-successTint', texto: 'text-success' },
  { valor: 'ajustar', etiqueta: 'Ajustar', fondo: 'bg-warningTint', texto: 'text-warning' },
  { valor: 'no_apto', etiqueta: 'No apto', fondo: 'bg-errorTint', texto: 'text-error' },
];

const NOMBRE_RESULTADO: Record<ResultadoVisita, string> = { apto: 'Apto', ajustar: 'A ajustar', no_apto: 'No apto' };

function fechaHora(iso: string): string {
  const d = new Date(iso);
  return `${fechaCorta(iso)} a las ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Pestaña "Visitas" del técnico: lista y detalle en la misma pestaña. */
export default function MisVisitasScreen() {
  const [abierta, setAbierta] = useState<string | null>(null);
  const [visitas, setVisitas] = useState<Visita[]>([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      setVisitas(await misVisitas());
    } catch (e) {
      setError(mensajeDeError(e));
    }
    setCargando(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [cargar]),
  );

  const visita = abierta !== null ? visitas.find((v) => v.visita_id === abierta) ?? null : null;
  if (visita !== null) {
    return (
      <DetalleVisita
        visita={visita}
        onVolver={() => setAbierta(null)}
        onCambio={async () => {
          await cargar();
        }}
      />
    );
  }

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader title="Visitas" subtitle="Visitas técnicas que te asigna 3B" />
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
          {visitas.length === 0 ? (
            <Text className="text-inkMuted text-sm">No tienes visitas asignadas. Cuando 3B te asigne una, te llegará un aviso.</Text>
          ) : (
            <View className="gap-2.5">
              {visitas.map((v) => {
                const e = ESTADO_VISITA[v.estado];
                return (
                  <Pressable key={v.visita_id} onPress={() => setAbierta(v.visita_id)} className="bg-surface rounded-xl border border-border p-3.5">
                    <View className="flex-row justify-between items-start">
                      <Text className="text-ink text-sm font-sansBold flex-1 pr-2">{v.titulo}</Text>
                      <View className={`rounded-md px-2 py-0.5 ${e.fondo}`}>
                        <Text className={`text-[10px] font-sansBold ${e.texto}`}>{e.etiqueta}</Text>
                      </View>
                    </View>
                    <Text className="text-inkMuted text-xs mt-0.5">
                      {v.referencia}
                      {v.ubicacion !== null ? ` · ${v.ubicacion}` : ''}
                    </Text>
                    {v.estado === 'agendada' && v.fecha_visita !== null && (
                      <View className="flex-row items-center gap-1.5 mt-2 pt-2 border-t border-border">
                        <Feather name="calendar" size={12} color={colors.action} />
                        <Text className="text-action text-xs font-sansSemiBold">{fechaHora(v.fecha_visita)}</Text>
                      </View>
                    )}
                    {v.estado === 'realizada' && v.resultado !== null && (
                      <Text className="text-inkMuted text-xs mt-2 pt-2 border-t border-border">Resultado: {NOMBRE_RESULTADO[v.resultado]}</Text>
                    )}
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
/** Los próximos 7 días y las horas habituales de visita. */
function proximosDias(): { fecha: Date; etiqueta: string }[] {
  const res: { fecha: Date; etiqueta: string }[] = [];
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  const nombres = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  for (let i = 0; i < 7; i++) {
    const d = new Date(base.getTime());
    d.setDate(base.getDate() + i);
    const etiqueta = i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : `${nombres[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
    res.push({ fecha: d, etiqueta });
  }
  return res;
}
const HORAS = [9, 10, 11, 12, 13, 16, 17, 18, 19];

function DetalleVisita({ visita, onVolver, onCambio }: { visita: Visita; onVolver: () => void; onCambio: () => Promise<void> }) {
  const dias = proximosDias();
  const [dia, setDia] = useState<number | null>(null);
  const [hora, setHora] = useState<number | null>(null);
  const [resultado, setResultado] = useState<ResultadoVisita | null>(null);
  const [informe, setInforme] = useState('');
  const [fotos, setFotos] = useState<FotoElegida[]>([]);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pendiente = visita.estado === 'asignada' || visita.estado === 'agendada';

  const confirmarFecha = async () => {
    setError(null);
    if (dia === null || hora === null) return setError('Elige el día y la hora.');
    const f = new Date(dias[dia].fecha.getTime());
    f.setHours(hora, 0, 0, 0);
    setTrabajando(true);
    try {
      await agendarVisita(visita.visita_id, f);
      await onCambio();
      setDia(null);
      setHora(null);
    } catch (e) {
      setError(mensajeDeError(e));
    }
    setTrabajando(false);
  };

  const anadirFoto = async () => {
    setError(null);
    try {
      const f = await elegirFoto();
      if (f !== null) setFotos((lista) => [...lista, f]);
    } catch (e) {
      setError(mensajeDeError(e));
    }
  };

  const enviarInforme = async () => {
    setError(null);
    if (resultado === null) return setError('Elige el resultado: apto, ajustar o no apto.');
    if (informe.trim().length < 20) return setError('Escribe el informe (al menos 20 caracteres).');
    setTrabajando(true);
    try {
      await registrarInforme(visita.visita_id, resultado, informe, fotos);
      await onCambio();
    } catch (e) {
      setError(mensajeDeError(e));
    }
    setTrabajando(false);
  };

  const abrirFoto = async (ruta: string) => {
    try {
      Linking.openURL(await urlDeFoto(ruta));
    } catch {
      setError('No se ha podido abrir la foto.');
    }
  };

  const e = ESTADO_VISITA[visita.estado];

  return (
    <KeyboardAvoidingView className="flex-1 bg-canvas" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader title={visita.referencia} subtitle="Visita técnica" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <Pressable onPress={onVolver} className="flex-row items-center gap-1.5 mb-3" hitSlop={8}>
          <Feather name="arrow-left" size={16} color={colors.action} />
          <Text className="text-action text-sm font-sansSemiBold">Mis visitas</Text>
        </Pressable>

        {error !== null && (
          <View className="bg-errorTint rounded-lg px-3 py-2 mb-3 flex-row items-center gap-2">
            <Feather name="alert-circle" size={16} color={colors.error} />
            <Text className="text-error text-sm flex-1">{error}</Text>
          </View>
        )}

        <View className="bg-surface rounded-2xl border border-border p-4 mb-3">
          <View className="flex-row justify-between items-start">
            <Text className="text-ink text-base font-sansBold flex-1 pr-2">{visita.titulo}</Text>
            <View className={`rounded-md px-2 py-0.5 ${e.fondo}`}>
              <Text className={`text-[10px] font-sansBold ${e.texto}`}>{e.etiqueta}</Text>
            </View>
          </View>
          {visita.descripcion !== null && <Text className="text-inkMuted text-xs mt-2 leading-relaxed">{visita.descripcion}</Text>}
          {visita.estado === 'agendada' && visita.fecha_visita !== null && (
            <View className="flex-row items-center gap-1.5 mt-3">
              <Feather name="calendar" size={13} color={colors.action} />
              <Text className="text-action text-sm font-sansSemiBold">{fechaHora(visita.fecha_visita)}</Text>
            </View>
          )}
        </View>

        {/* Dónde y con quién */}
        <View className="bg-surface rounded-2xl border border-border p-4 mb-3 gap-2.5">
          {visita.contacto_nombre !== null && (
            <View className="flex-row items-center gap-2">
              <Feather name="user" size={14} color={colors.inkMuted} />
              <Text className="text-ink text-sm">{visita.contacto_nombre}</Text>
            </View>
          )}
          {visita.contacto_telefono !== null && (
            <Pressable onPress={() => Linking.openURL(`tel:${visita.contacto_telefono}`)} className="flex-row items-center gap-2">
              <Feather name="phone" size={14} color={colors.action} />
              <Text className="text-action text-sm font-sansSemiBold">{visita.contacto_telefono}</Text>
            </Pressable>
          )}
          {visita.direccion !== null ? (
            <Pressable
              onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(visita.direccion ?? '')}`)}
              className="flex-row items-center gap-2"
            >
              <Feather name="map-pin" size={14} color={colors.action} />
              <Text className="text-action text-sm font-sansSemiBold flex-1">{visita.direccion}</Text>
            </Pressable>
          ) : (
            visita.ubicacion !== null && (
              <View className="flex-row items-center gap-2">
                <Feather name="map-pin" size={14} color={colors.inkMuted} />
                <Text className="text-ink text-sm">{visita.ubicacion}</Text>
              </View>
            )
          )}
        </View>

        {pendiente && (
          <>
            <Text className="text-ink text-xs font-sansBold uppercase mb-2 mt-2" style={{ letterSpacing: 1 }}>
              {visita.estado === 'agendada' ? 'Cambiar la fecha' : 'Acuerda la fecha con el cliente'}
            </Text>
            <View className="flex-row flex-wrap mb-2" style={{ gap: 6 }}>
              {dias.map((d, i) => (
                <Pressable
                  key={d.etiqueta}
                  onPress={() => setDia(i)}
                  className={`rounded-full px-3 py-2 border ${dia === i ? 'bg-ink border-ink' : 'bg-surface border-border'}`}
                >
                  <Text className={`text-xs font-sansSemiBold ${dia === i ? 'text-white' : 'text-ink'}`}>{d.etiqueta}</Text>
                </Pressable>
              ))}
            </View>
            <View className="flex-row flex-wrap mb-3" style={{ gap: 6 }}>
              {HORAS.map((h) => (
                <Pressable
                  key={h}
                  onPress={() => setHora(h)}
                  className={`rounded-full px-3 py-2 border ${hora === h ? 'bg-ink border-ink' : 'bg-surface border-border'}`}
                >
                  <Text className={`text-xs font-sansSemiBold ${hora === h ? 'text-white' : 'text-ink'}`}>{`${h}:00`}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable onPress={confirmarFecha} disabled={trabajando} className="border border-action rounded-xl py-2.5 items-center mb-5">
              <Text className="text-action text-sm font-sansBold">Confirmar fecha</Text>
            </Pressable>

            <Text className="text-ink text-xs font-sansBold uppercase mb-2" style={{ letterSpacing: 1 }}>
              Informe de la visita
            </Text>
            <View className="flex-row mb-3" style={{ gap: 6 }}>
              {RESULTADOS.map((r) => (
                <Pressable
                  key={r.valor}
                  onPress={() => setResultado(r.valor)}
                  className={`flex-1 rounded-xl py-2.5 items-center border ${resultado === r.valor ? `${r.fondo} border-ink` : 'bg-surface border-border'}`}
                >
                  <Text className={`text-xs font-sansBold ${resultado === r.valor ? r.texto : 'text-inkMuted'}`}>{r.etiqueta}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              value={informe}
              onChangeText={setInforme}
              multiline
              editable={!trabajando}
              placeholder="Estado de la obra, medidas, accesos, problemas que veas…"
              placeholderTextColor={colors.inkSubtle}
              className="bg-surface border border-border rounded-xl px-3 py-2.5 text-ink text-sm mb-3"
              style={{ minHeight: 110, textAlignVertical: 'top' }}
            />

            <View className="mb-3">
              {fotos.map((f, i) => (
                <View key={`${f.uri}-${i}`} className="flex-row items-center justify-between bg-surface border border-border rounded-lg px-3 py-2 mb-1.5">
                  <View className="flex-row items-center gap-2 flex-1">
                    <Feather name="image" size={14} color={colors.inkMuted} />
                    <Text className="text-ink text-xs flex-1" numberOfLines={1}>
                      {f.nombre}
                    </Text>
                  </View>
                  <Pressable onPress={() => setFotos((l) => l.filter((_, j) => j !== i))} hitSlop={8}>
                    <Feather name="x" size={16} color={colors.inkMuted} />
                  </Pressable>
                </View>
              ))}
              {fotos.length < 12 && (
                <Pressable onPress={anadirFoto} disabled={trabajando} className="flex-row items-center justify-center gap-2 border border-border rounded-xl py-2.5">
                  <Feather name="camera" size={15} color={colors.action} />
                  <Text className="text-action text-sm font-sansSemiBold">Añadir foto ({fotos.length}/12)</Text>
                </Pressable>
              )}
            </View>

            <Pressable onPress={enviarInforme} disabled={trabajando} className="bg-action rounded-xl py-3 items-center flex-row justify-center gap-2">
              {trabajando ? <ActivityIndicator color={colors.white} /> : <Feather name="send" size={15} color={colors.white} />}
              <Text className="text-white font-sansBold text-sm">{trabajando ? 'Enviando…' : 'Enviar informe'}</Text>
            </Pressable>
          </>
        )}

        {visita.estado === 'realizada' && (
          <View className="bg-surface rounded-2xl border border-border p-4">
            <Text className="text-ink text-sm font-sansBold mb-1">
              Informe enviado{visita.resultado !== null ? ` · ${NOMBRE_RESULTADO[visita.resultado]}` : ''}
            </Text>
            {visita.informe !== null && <Text className="text-ink text-sm leading-relaxed">{visita.informe}</Text>}
            {visita.fotos.length > 0 && (
              <View className="flex-row flex-wrap gap-x-4 gap-y-1.5 mt-3">
                {visita.fotos.map((ruta, i) => (
                  <Pressable key={ruta} onPress={() => abrirFoto(ruta)} className="flex-row items-center gap-1">
                    <Feather name="image" size={12} color={colors.action} />
                    <Text className="text-action text-xs font-sansSemiBold">Foto {i + 1}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}