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
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { colors } from '../../design-system/tokens';
import { formatearMoneda } from '../../utils/moneda';
import ScreenHeader from '../../components/ScreenHeader';
import CampanaNotificaciones from '../../components/CampanaNotificaciones';

type Referencia = {
  id: string;
  nombre_cliente: string;
  estado: string;
  precio_venta: number | null;
  created_at: string;
};

type Recompensa = {
  id: string;
  referencia_id: string;
  porcentaje: number;
  base_imponible: number;
  importe: number;
  estado: string;
};

const ETIQUETA_ESTADO: Record<string, string> = {
  enviado: 'Enviado',
  contactado: 'Contactado',
  visita: 'Visita realizada',
  presupuesto: 'Presupuesto enviado',
  reserva: 'Reserva',
  venta: 'Venta',
  comision_disponible: 'Comisión disponible',
  descartado: 'Descartado',
};

const ORDEN_ESTADOS = ['enviado', 'contactado', 'visita', 'presupuesto', 'reserva', 'venta', 'comision_disponible'];

const COLOR_ESTADO: Record<string, { fondo: string; texto: string }> = {
  enviado: { fondo: colors.actionTint, texto: colors.action },
  contactado: { fondo: colors.actionTint, texto: colors.action },
  visita: { fondo: colors.warningTint, texto: colors.warning },
  presupuesto: { fondo: colors.warningTint, texto: colors.warning },
  reserva: { fondo: colors.successTint, texto: colors.success },
  venta: { fondo: colors.successTint, texto: colors.success },
  comision_disponible: { fondo: colors.goldTint, texto: colors.gold },
  descartado: { fondo: colors.errorTint, texto: colors.error },
};

export default function RecomiendaScreen() {
  const [referencias, setReferencias] = useState<Referencia[]>([]);
  const [recompensas, setRecompensas] = useState<Recompensa[]>([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [mostrandoForm, setMostrandoForm] = useState(false);
  const [nombreCliente, setNombreCliente] = useState('');
  const [telefonoCliente, setTelefonoCliente] = useState('');
  const [emailCliente, setEmailCliente] = useState('');
  const [consentimiento, setConsentimiento] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [errorForm, setErrorForm] = useState<string | null>(null);
  const [porcentaje, setPorcentaje] = useState<number | null>(null);

  // El porcentaje de comisión depende del tipo de cuenta: se enseña ANTES de
  // recomendar, para que quien lo hace sepa qué gana (los términos dicen que
  // puede consultarse en la app).
  useEffect(() => {
    (async () => {
      const { data: usuario } = await supabase.auth.getUser();
      if (!usuario.user) return;
      const { data: perfil } = await supabase.from('profiles').select('role').eq('id', usuario.user.id).single();
      if (!perfil) return;
      const { data: regla } = await supabase
        .from('reglas_recompensa_referido')
        .select('porcentaje')
        .eq('role', perfil.role)
        .maybeSingle();
      if (regla) setPorcentaje(Number(regla.porcentaje));
    })();
  }, []);

  const cargar = useCallback(async () => {
    setError(null);
    const { data: refsData, error: errorRefs } = await supabase
      .from('referencias_comerciales')
      .select('id, nombre_cliente, estado, precio_venta, created_at')
      .order('created_at', { ascending: false });

    if (errorRefs) {
      setError(errorRefs.message);
      setCargando(false);
      return;
    }
    setReferencias((refsData as Referencia[] | null) ?? []);

    const { data: recData } = await supabase
      .from('recompensas_referido')
      .select('id, referencia_id, porcentaje, base_imponible, importe, estado')
      .order('created_at', { ascending: false });
    setRecompensas((recData as Recompensa[] | null) ?? []);

    setCargando(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [cargar]),
  );

  const handleRefrescar = async () => {
    setRefrescando(true);
    await cargar();
    setRefrescando(false);
  };

  const handleEnviarReferencia = async () => {
    setErrorForm(null);
    if (nombreCliente.trim().length < 2) {
      setErrorForm('Indica el nombre de la persona que quiere construir.');
      return;
    }
    if (!consentimiento) {
      setErrorForm('Confirma que la persona sabe que vas a pasar sus datos a OH.');
      return;
    }

    setEnviando(true);
    const { error: errorRpc } = await supabase.rpc('crear_referencia_comercial', {
      p_nombre_cliente: nombreCliente.trim(),
      p_telefono_cliente: telefonoCliente.trim() || null,
      p_email_cliente: emailCliente.trim() || null,
      p_consentimiento: consentimiento,
    });
    setEnviando(false);

    if (errorRpc) {
      setErrorForm(errorRpc.message);
      return;
    }

    setNombreCliente('');
    setTelefonoCliente('');
    setEmailCliente('');
    setConsentimiento(false);
    setMostrandoForm(false);
    cargar();
  };

  if (cargando) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <ActivityIndicator color={colors.action} />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader title="Recomienda" rightElement={<CampanaNotificaciones />} />

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        refreshControl={
          <RefreshControl refreshing={refrescando} onRefresh={handleRefrescar} colors={[colors.action]} />
        }
      >
        {error !== null && (
          <View className="bg-errorTint rounded-lg px-3 py-2 mb-3 flex-row items-center gap-2">
            <Feather name="alert-circle" size={16} color={colors.error} />
            <Text className="text-error text-sm flex-1">{error}</Text>
          </View>
        )}

        {/* Tarjeta principal: botón grande */}
        <View className="bg-action rounded-2xl p-5">
          <Text className="text-white text-lg font-sansBold">¿Conoces a alguien que quiere construir?</Text>
          <Text className="text-white/80 text-sm mt-1.5 leading-relaxed">
            {porcentaje !== null
              ? `Recomiéndalo a OH y, si la operación llega a buen puerto, ganas el ${String(porcentaje).replace('.', ',')} % del precio de venta (sin IVA).`
              : 'Recomiéndalo a OH y, si la operación llega a buen puerto, gana una comisión.'}
          </Text>
          <Pressable
            onPress={() => setMostrandoForm((v) => !v)}
            className="bg-white rounded-xl py-3 items-center mt-4 flex-row justify-center gap-2"
          >
            <Feather name={mostrandoForm ? 'x' : 'user-plus'} size={16} color={colors.action} />
            <Text className="text-action font-sansBold text-sm">
              {mostrandoForm ? 'Cancelar' : 'Conozco a alguien que quiere construir'}
            </Text>
          </Pressable>
        </View>

        {mostrandoForm && (
          <View className="bg-surface rounded-2xl border border-border p-4 mt-3">
            {errorForm !== null && (
              <View className="bg-errorTint rounded-lg px-3 py-2 mb-3 flex-row items-center gap-2">
                <Feather name="alert-circle" size={16} color={colors.error} />
                <Text className="text-error text-sm flex-1">{errorForm}</Text>
              </View>
            )}

            <Text className="text-ink text-xs font-sansSemiBold mb-1">Nombre de la persona *</Text>
            <View className="bg-canvas border border-border rounded-xl px-3 mb-3">
              <TextInput
                value={nombreCliente}
                onChangeText={setNombreCliente}
                placeholder="Nombre y apellidos"
                placeholderTextColor={colors.inkSubtle}
                editable={!enviando}
                className="py-3 text-ink"
              />
            </View>

            <Text className="text-ink text-xs font-sansSemiBold mb-1">Teléfono (opcional)</Text>
            <View className="bg-canvas border border-border rounded-xl px-3 mb-3">
              <TextInput
                value={telefonoCliente}
                onChangeText={setTelefonoCliente}
                keyboardType="phone-pad"
                placeholder="612 345 678"
                placeholderTextColor={colors.inkSubtle}
                editable={!enviando}
                className="py-3 text-ink"
              />
            </View>

            <Text className="text-ink text-xs font-sansSemiBold mb-1">Email (opcional)</Text>
            <View className="bg-canvas border border-border rounded-xl px-3 mb-3">
              <TextInput
                value={emailCliente}
                onChangeText={setEmailCliente}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder="cliente@email.com"
                placeholderTextColor={colors.inkSubtle}
                editable={!enviando}
                className="py-3 text-ink"
              />
            </View>

            <View className="flex-row items-center justify-between bg-canvas border border-border rounded-xl px-3 py-2.5 mb-4">
              <Text className="text-ink text-xs flex-1 pr-2">
                Esta persona sabe que voy a pasar sus datos a OH para que la contacten.
              </Text>
              <Switch
                value={consentimiento}
                onValueChange={setConsentimiento}
                disabled={enviando}
                trackColor={{ true: colors.action, false: colors.border }}
              />
            </View>

            <Pressable
              onPress={handleEnviarReferencia}
              disabled={enviando}
              className="bg-action rounded-xl py-3 items-center"
            >
              <View className="flex-row items-center gap-2">
                {enviando ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Feather name="send" size={15} color={colors.white} />
                )}
                <Text className="text-white font-sansBold text-sm">Enviar recomendación</Text>
              </View>
            </Pressable>
          </View>
        )}

        {/* Comisiones pendientes de aceptar */}
        {recompensas.some((r) => r.estado === 'pendiente') && (
          <View>
            <Text className="text-ink text-xs font-sansBold uppercase mt-6 mb-2" style={{ letterSpacing: 1 }}>
              Comisiones por aceptar
            </Text>
            {recompensas
              .filter((r) => r.estado === 'pendiente')
              .map((r) => {
                const ref = referencias.find((x) => x.id === r.referencia_id);
                return (
                  <View key={r.id} className="bg-goldTint border border-gold rounded-xl p-3.5 mb-2">
                    <Text className="text-ink text-sm font-sansSemiBold">{ref?.nombre_cliente ?? 'Cliente'}</Text>
                    <Text className="text-inkMuted text-xs mt-0.5">
                      {formatearMoneda(r.importe)} ({r.porcentaje}% sobre {formatearMoneda(r.base_imponible)})
                    </Text>
                    <Text className="text-gold text-xs font-sansSemiBold mt-1">
                      Ábrela desde el aviso para aceptarla, o espera a la próxima notificación.
                    </Text>
                  </View>
                );
              })}
          </View>
        )}

        {/* Mis recomendaciones */}
        <Text className="text-ink text-xs font-sansBold uppercase mt-6 mb-2" style={{ letterSpacing: 1 }}>
          Mis recomendaciones
        </Text>
        {referencias.length === 0 ? (
          <Text className="text-inkMuted text-sm">Todavía no has recomendado a nadie.</Text>
        ) : (
          <View className="gap-2.5">
            {referencias.map((ref) => {
              const estiloEstado = COLOR_ESTADO[ref.estado] ?? { fondo: colors.canvas, texto: colors.inkMuted };
              const indice = ORDEN_ESTADOS.indexOf(ref.estado);
              return (
                <View key={ref.id} className="bg-surface rounded-xl border border-border p-3.5">
                  <View className="flex-row justify-between items-start">
                    <Text className="text-ink text-sm font-sansBold flex-1 pr-2">{ref.nombre_cliente}</Text>
                    <View className="rounded-md px-2 py-0.5" style={{ backgroundColor: estiloEstado.fondo }}>
                      <Text className="text-[10px] font-sansBold" style={{ color: estiloEstado.texto }}>
                        {ETIQUETA_ESTADO[ref.estado] ?? ref.estado}
                      </Text>
                    </View>
                  </View>
                  {ref.estado !== 'descartado' && indice >= 0 && (
                    <View className="flex-row mt-2.5" style={{ gap: 3 }}>
                      {ORDEN_ESTADOS.map((_, i) => (
                        <View
                          key={i}
                          style={{
                            flex: 1,
                            height: 3,
                            borderRadius: 2,
                            backgroundColor: i <= indice ? colors.action : colors.border,
                          }}
                        />
                      ))}
                    </View>
                  )}
                  <Text className="text-inkMuted text-[11px] mt-1.5">
                    Enviado el{' '}
                    {new Date(ref.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}