import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Switch,
  Linking,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { colors } from '../../design-system/tokens';
import ScreenHeader from '../../components/ScreenHeader';
import { formatearMoneda } from '../../utils/moneda';
import { URL_POLITICA_PRIVACIDAD } from '../../constants/enlaces';
import LicitacionDetalle from '../licitaciones/LicitacionDetalle';
import { ETIQUETA_ESTADO_OBRA, ESTILO_ESTADO_OBRA, fechaCorta, parsearImporte } from '../licitaciones/estados';
import { crearPeticion, mensajeDeError, misPeticiones, responderInfo, type Peticion } from '../../services/peticiones';

const ESTADOS_EN_REVISION = ['en_revision', 'pendiente_info', 'rechazada'];

type Vista =
  | { tipo: 'lista' }
  | { tipo: 'nueva' }
  | { tipo: 'enviada' }
  | { tipo: 'detalle'; peticion: Peticion };

/**
 * Pestaña "Mis peticiones" del particular. Una petición no se publica sola: 3B la revisa
 * primero (en un máximo de 3 días laborables), puede pedir más datos o mandar a un técnico
 * a verla, y solo entonces se publica para que las empresas envíen su oferta.
 */
export default function MisPeticionesScreen() {
  const [vista, setVista] = useState<Vista>({ tipo: 'lista' });

  if (vista.tipo === 'nueva') {
    return <NuevaPeticion onCancelar={() => setVista({ tipo: 'lista' })} onEnviada={() => setVista({ tipo: 'enviada' })} />;
  }
  if (vista.tipo === 'enviada') {
    return <PeticionEnviada onVolver={() => setVista({ tipo: 'lista' })} />;
  }
  if (vista.tipo === 'detalle') {
    // Publicada o más allá: es la misma pantalla de las licitaciones (ofertas, adjudicar, estado de la obra)
    if (!ESTADOS_EN_REVISION.includes(vista.peticion.estado)) {
      return <LicitacionDetalle obraId={vista.peticion.id} onVolver={() => setVista({ tipo: 'lista' })} />;
    }
    return <PeticionEnRevision peticion={vista.peticion} onVolver={() => setVista({ tipo: 'lista' })} />;
  }
  return <Lista onNueva={() => setVista({ tipo: 'nueva' })} onAbrir={(p) => setVista({ tipo: 'detalle', peticion: p })} />;
}

// ---------------------------------------------------------------------------
function Chip({ estado }: { estado: string }) {
  const estilo = ESTILO_ESTADO_OBRA[estado] ?? ESTILO_ESTADO_OBRA.abierta;
  return (
    <View className={`rounded-md px-2 py-0.5 ${estilo.fondo}`}>
      <Text className={`text-[10px] font-sansBold ${estilo.texto}`}>{ETIQUETA_ESTADO_OBRA[estado] ?? estado}</Text>
    </View>
  );
}

function fechaHora(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${fechaCorta(iso)} a las ${hh}:${mm}`;
}

function lineaDeEstado(p: Peticion): { texto: string; aviso: boolean } | null {
  if (p.estado === 'en_revision') {
    const visita =
      p.visita_estado === 'agendada' && p.visita_fecha !== null
        ? ` Visita técnica: ${fechaHora(p.visita_fecha)}.`
        : p.visita_estado === 'asignada'
          ? ' Un técnico te llamará para acordar una visita.'
          : '';
    return {
      texto: `La estamos revisando${p.revisar_antes_de !== null ? `; te respondemos antes del ${fechaCorta(p.revisar_antes_de)}` : ''}.${visita}`,
      aviso: false,
    };
  }
  if (p.estado === 'pendiente_info') return { texto: 'Necesitamos más información. Toca para responder.', aviso: true };
  if (p.estado === 'rechazada') return { texto: p.revision_motivo ?? 'No hemos podido publicarla.', aviso: false };
  if (p.estado === 'abierta' && p.publicada_en !== null) return { texto: `Publicada el ${fechaCorta(p.publicada_en)}.`, aviso: false };
  return null;
}

function Lista({ onNueva, onAbrir }: { onNueva: () => void; onAbrir: (p: Peticion) => void }) {
  const [items, setItems] = useState<Peticion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      setItems(await misPeticiones());
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

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader title="Mis peticiones" subtitle="Lo que necesitas en tu casa" />
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
            <Text className="text-white font-sansBold text-sm">Nueva petición</Text>
          </Pressable>

          {items.length === 0 ? (
            <Text className="text-inkMuted text-sm leading-relaxed">
              Aún no has enviado ninguna. Cuéntanos qué obra o reforma necesitas: la revisamos y, cuando esté lista, las
              empresas te envían su oferta.
            </Text>
          ) : (
            <View className="gap-2.5">
              {items.map((p) => {
                const linea = lineaDeEstado(p);
                return (
                  <Pressable key={p.id} onPress={() => onAbrir(p)} className="bg-surface rounded-xl border border-border p-3.5">
                    <View className="flex-row justify-between items-start">
                      <Text className="text-ink text-sm font-sansBold flex-1 pr-2">{p.titulo}</Text>
                      <Chip estado={p.estado} />
                    </View>
                    <Text className="text-inkMuted text-xs mt-0.5">
                      {p.referencia}
                      {p.ubicacion !== null ? ` · ${p.ubicacion}` : ''}
                    </Text>
                    {linea !== null && (
                      <View className={`mt-2 pt-2 border-t border-border flex-row items-start gap-1.5`}>
                        <Feather
                          name={linea.aviso ? 'alert-circle' : 'clock'}
                          size={12}
                          color={linea.aviso ? colors.warning : colors.inkMuted}
                          style={{ marginTop: 2 }}
                        />
                        <Text className={`text-xs flex-1 ${linea.aviso ? 'text-warning font-sansSemiBold' : 'text-inkMuted'}`}>
                          {linea.texto}
                        </Text>
                      </View>
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
type ObraResumen = {
  titulo: string;
  descripcion: string | null;
  especialidad_requerida: string | null;
  ubicacion: string | null;
  presupuesto: number;
};

function PeticionEnRevision({ peticion, onVolver }: { peticion: Peticion; onVolver: () => void }) {
  const [obra, setObra] = useState<ObraResumen | null>(null);
  const [respuesta, setRespuesta] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let activo = true;
    supabase
      .from('obras')
      .select('titulo, descripcion, especialidad_requerida, ubicacion, presupuesto')
      .eq('id', peticion.id)
      .single()
      .then(({ data }) => {
        if (!activo || data === null) return;
        const o = data as ObraResumen;
        setObra(o);
        setDescripcion(o.descripcion ?? '');
      });
    return () => {
      activo = false;
    };
  }, [peticion.id]);

  const responder = async () => {
    setError(null);
    if (respuesta.trim().length < 3) {
      setError('Escribe tu respuesta para 3B.');
      return;
    }
    setEnviando(true);
    try {
      const cambiada = obra !== null && descripcion.trim() !== (obra.descripcion ?? '').trim() ? descripcion : null;
      await responderInfo(peticion.id, respuesta, cambiada);
      onVolver();
    } catch (e) {
      setError(mensajeDeError(e));
      setEnviando(false);
    }
  };

  const linea = lineaDeEstado(peticion);

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader title={peticion.referencia} subtitle="Tu petición" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Pressable onPress={onVolver} className="flex-row items-center gap-1.5 mb-3" hitSlop={8}>
          <Feather name="arrow-left" size={16} color={colors.action} />
          <Text className="text-action text-sm font-sansSemiBold">Mis peticiones</Text>
        </Pressable>

        {error !== null && (
          <View className="bg-errorTint rounded-lg px-3 py-2 mb-3 flex-row items-center gap-2">
            <Feather name="alert-circle" size={16} color={colors.error} />
            <Text className="text-error text-sm flex-1">{error}</Text>
          </View>
        )}

        <View className="bg-surface rounded-2xl border border-border p-4 mb-4">
          <View className="flex-row justify-between items-start">
            <Text className="text-ink text-base font-sansBold flex-1 pr-2">{peticion.titulo}</Text>
            <Chip estado={peticion.estado} />
          </View>
          {obra !== null && (
            <>
              <Text className="text-ink text-sm font-sansSemiBold mt-1">{formatearMoneda(Number(obra.presupuesto))}</Text>
              {peticion.estado !== 'pendiente_info' && obra.descripcion !== null && (
                <Text className="text-inkMuted text-xs mt-2">{obra.descripcion}</Text>
              )}
              <View className="mt-2 gap-0.5">
                {obra.especialidad_requerida !== null && (
                  <Text className="text-inkMuted text-xs">Tipo de trabajo: {obra.especialidad_requerida}</Text>
                )}
                {obra.ubicacion !== null && <Text className="text-inkMuted text-xs">Municipio: {obra.ubicacion}</Text>}
              </View>
            </>
          )}
          {linea !== null && peticion.estado !== 'pendiente_info' && (
            <View className="mt-3 pt-3 border-t border-border flex-row items-start gap-1.5">
              <Feather name="clock" size={13} color={colors.inkMuted} style={{ marginTop: 1 }} />
              <Text className="text-inkMuted text-xs flex-1">{linea.texto}</Text>
            </View>
          )}
        </View>

        {peticion.estado === 'pendiente_info' && (
          <View className="bg-warningTint rounded-2xl p-4">
            <Text className="text-ink text-sm font-sansBold mb-1">3B necesita más información</Text>
            {peticion.revision_motivo !== null && (
              <Text className="text-ink text-sm mb-3 leading-relaxed">{peticion.revision_motivo}</Text>
            )}

            <Text className="text-ink text-xs font-sansSemiBold mb-1">Tu respuesta *</Text>
            <TextInput
              value={respuesta}
              onChangeText={setRespuesta}
              multiline
              editable={!enviando}
              placeholder="Escribe aquí lo que nos piden"
              placeholderTextColor={colors.inkSubtle}
              className="bg-surface border border-border rounded-xl px-3 py-2.5 text-ink text-sm mb-3"
              style={{ minHeight: 80, textAlignVertical: 'top' }}
            />

            <Text className="text-ink text-xs font-sansSemiBold mb-1">Descripción de la obra (puedes corregirla)</Text>
            <TextInput
              value={descripcion}
              onChangeText={setDescripcion}
              multiline
              editable={!enviando}
              placeholderTextColor={colors.inkSubtle}
              className="bg-surface border border-border rounded-xl px-3 py-2.5 text-ink text-sm mb-3"
              style={{ minHeight: 90, textAlignVertical: 'top' }}
            />

            <Pressable onPress={responder} disabled={enviando} className="bg-action rounded-xl py-3 items-center flex-row justify-center gap-2">
              {enviando ? <ActivityIndicator color={colors.white} /> : <Feather name="send" size={15} color={colors.white} />}
              <Text className="text-white font-sansBold text-sm">{enviando ? 'Enviando…' : 'Enviar respuesta'}</Text>
            </Pressable>
          </View>
        )}

        {peticion.estado === 'rechazada' && (
          <View className="bg-errorTint rounded-2xl p-4">
            <Text className="text-ink text-sm font-sansBold mb-1">No hemos podido publicarla</Text>
            <Text className="text-ink text-sm leading-relaxed">{peticion.revision_motivo ?? 'Sin motivo indicado.'}</Text>
            <Text className="text-inkMuted text-xs mt-2">Puedes enviar una petición nueva corrigiendo lo que te indicamos.</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
function PeticionEnviada({ onVolver }: { onVolver: () => void }) {
  return (
    <View className="flex-1 bg-canvas items-center justify-center px-6">
      <View className="w-14 h-14 rounded-full bg-successTint items-center justify-center mb-4">
        <Feather name="check" size={28} color={colors.success} />
      </View>
      <Text className="text-ink text-xl font-sansBold text-center mb-2">Petición enviada</Text>
      <Text className="text-inkMuted text-sm text-center leading-relaxed mb-6">
        La revisaremos en un máximo de 3 días laborables. Si hace falta algo más, te lo pediremos por aquí o por teléfono. Cuando
        esté publicada, las empresas te enviarán su oferta.
      </Text>
      <Pressable onPress={onVolver} className="bg-action rounded-xl py-3 px-6">
        <Text className="text-white font-sansBold text-sm">Ver mis peticiones</Text>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
const TIPOS_TRABAJO = ['Reforma integral', 'Baño', 'Cocina', 'Fontanería', 'Electricidad', 'Pintura', 'Carpintería', 'Tejado o cubierta', 'Otro'];
const DIAS_ABIERTA = [7, 15, 30, 60];

function NuevaPeticion({ onCancelar, onEnviada }: { onCancelar: () => void; onEnviada: () => void }) {
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [tipo, setTipo] = useState('');
  const [municipio, setMunicipio] = useState('');
  const [direccion, setDireccion] = useState('');
  const [telefono, setTelefono] = useState('');
  const [presupuesto, setPresupuesto] = useState('');
  const [dias, setDias] = useState(30);
  const [aceptaContacto, setAceptaContacto] = useState(false);
  const [aceptaVisita, setAceptaVisita] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enviar = async () => {
    setError(null);
    if (titulo.trim().length < 3) return setError('Escribe un título para tu petición.');
    if (descripcion.trim().length < 20) return setError('Cuéntanos con algo más de detalle qué necesitas (al menos 20 caracteres).');
    if (municipio.trim().length < 2) return setError('Indica el municipio de la obra.');
    if (direccion.trim().length < 5) return setError('Indica la dirección de la obra. No se publica: solo la ve 3B.');
    if (telefono.replace(/[^0-9+]/g, '').length < 9) return setError('Indica un teléfono de contacto válido.');
    const importe = parsearImporte(presupuesto);
    if (importe === null || importe <= 0) return setError('Indica un presupuesto orientativo en euros (por ejemplo, 6000).');
    if (!aceptaContacto) return setError('Necesitamos tu permiso para contactar contigo y poder revisar la petición.');

    setEnviando(true);
    try {
      await crearPeticion({
        titulo,
        descripcion,
        especialidad: tipo,
        municipio,
        direccion,
        telefono,
        presupuesto: importe,
        dias,
        requisitos: '',
        aceptaContacto,
        aceptaVisita,
      });
      onEnviada();
    } catch (e) {
      setError(mensajeDeError(e));
      setEnviando(false);
    }
  };

  const campo = (
    etiqueta: string,
    valor: string,
    cambiar: (t: string) => void,
    opciones: { placeholder?: string; multilinea?: boolean; teclado?: 'decimal-pad' | 'phone-pad'; ayuda?: string } = {},
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
          style={opciones.multilinea ? { minHeight: 90, textAlignVertical: 'top' } : undefined}
        />
      </View>
      {opciones.ayuda !== undefined && <Text className="text-inkMuted text-[12px] mt-1">{opciones.ayuda}</Text>}
    </View>
  );

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader title="Nueva petición" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        {error !== null && (
          <View className="bg-errorTint rounded-lg px-3 py-2 mb-3 flex-row items-center gap-2">
            <Feather name="alert-circle" size={16} color={colors.error} />
            <Text className="text-error text-sm flex-1">{error}</Text>
          </View>
        )}

        <View className="bg-actionTint rounded-xl p-3 mb-4 flex-row items-start gap-2">
          <Feather name="shield" size={15} color={colors.action} style={{ marginTop: 1 }} />
          <Text className="text-ink text-xs flex-1 leading-relaxed">
            Primero la revisamos nosotros. Tu nombre, teléfono y dirección no se publican: las empresas solo ven el municipio y la
            descripción de la obra.
          </Text>
        </View>

        {campo('Título *', titulo, setTitulo, { placeholder: 'Ej: Reforma del baño' })}
        {campo('Qué necesitas *', descripcion, setDescripcion, {
          placeholder: 'Cuéntanos qué quieres hacer, medidas aproximadas, estado actual…',
          multilinea: true,
        })}

        <Text className="text-ink text-xs font-sansSemiBold mb-1.5">Tipo de trabajo</Text>
        <View className="flex-row flex-wrap mb-4" style={{ gap: 6 }}>
          {TIPOS_TRABAJO.map((t) => (
            <Pressable
              key={t}
              onPress={() => setTipo(tipo === t ? '' : t)}
              className={`rounded-full px-3.5 py-2 border ${tipo === t ? 'bg-ink border-ink' : 'bg-surface border-border'}`}
            >
              <Text className={`text-xs font-sansSemiBold ${tipo === t ? 'text-white' : 'text-ink'}`}>{t}</Text>
            </Pressable>
          ))}
        </View>

        {campo('Municipio *', municipio, setMunicipio, { placeholder: 'Ej: Albacete', ayuda: 'Es lo único del lugar que ven las empresas.' })}
        {campo('Dirección de la obra *', direccion, setDireccion, {
          placeholder: 'Calle, número, piso',
          ayuda: 'No se publica. Solo la vemos nosotros y el técnico si hace falta visitarla.',
        })}
        {campo('Teléfono de contacto *', telefono, setTelefono, { placeholder: 'Ej: 612 345 678', teclado: 'phone-pad' })}
        {campo('Presupuesto orientativo (€) *', presupuesto, setPresupuesto, { placeholder: 'Ej: 6000', teclado: 'decimal-pad' })}

        <Text className="text-ink text-xs font-sansSemiBold mb-1.5">Abierta a ofertas durante</Text>
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

        <View className="bg-surface border border-border rounded-xl p-3.5 mb-3">
          <View className="flex-row items-start gap-3">
            <Switch value={aceptaContacto} onValueChange={setAceptaContacto} disabled={enviando} />
            <Text className="text-ink text-xs flex-1 leading-relaxed">
              Autorizo a 3B a contactar conmigo por teléfono o correo para revisar mi petición. Trataremos tus datos según la{' '}
              <Text className="text-action font-sansSemiBold" onPress={() => Linking.openURL(URL_POLITICA_PRIVACIDAD)}>
                política de privacidad
              </Text>
              . *
            </Text>
          </View>
          <View className="flex-row items-start gap-3 mt-3 pt-3 border-t border-border">
            <Switch value={aceptaVisita} onValueChange={setAceptaVisita} disabled={enviando} />
            <Text className="text-ink text-xs flex-1 leading-relaxed">
              Si hace falta, autorizo que un técnico de 3B visite la obra. Acordará antes contigo el día y la hora.
            </Text>
          </View>
        </View>

        <Pressable onPress={enviar} disabled={enviando} className="bg-action rounded-xl py-3 items-center flex-row justify-center gap-2">
          {enviando ? <ActivityIndicator color={colors.white} /> : <Feather name="send" size={15} color={colors.white} />}
          <Text className="text-white font-sansBold text-sm">{enviando ? 'Enviando…' : 'Enviar para revisar'}</Text>
        </Pressable>
        <Pressable onPress={onCancelar} disabled={enviando} className="items-center py-3 mt-1">
          <Text className="text-inkMuted text-sm">Cancelar</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}