import { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../design-system/tokens';
import {
  pagoDeObra, iniciarPago, oficioTermina, clienteConfirma, reportarProblema, formatearCents,
  tramosDePago, oficioTerminaTramo, clienteConfirmaTramo,
  type Pago, type Tramo,
} from '../services/pagos';
import { useHojaDePago } from '../services/stripeNativo';
import { PAGOS_ACTIVOS } from '../constants/funciones';

type Props = {
  obraId: string;
  /** cliente = quien publicó la obra; oficio = la empresa adjudicada */
  rol: 'cliente' | 'oficio';
  /** El pago solo tiene sentido con la obra adjudicada o más allá */
  obraAdjudicada: boolean;
};

function diasRestantes(fecha: string | null): number | null {
  if (!fecha) return null;
  return Math.max(0, Math.ceil((new Date(fecha).getTime() - Date.now()) / 86400000));
}

export default function PagoObra({ obraId, rol, obraAdjudicada }: Props) {
  const [pago, setPago] = useState<Pago | null>(null);
  const [tramos, setTramos] = useState<Tramo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportando, setReportando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const abrirHoja = useHojaDePago();

  const cargar = useCallback(async () => {
    if (!PAGOS_ACTIVOS) {
      setCargando(false);
      return;
    }
    try {
      const p = await pagoDeObra(obraId);
      setPago(p);
      setTramos(p !== null && p.con_tramos ? await tramosDePago(p.id) : []);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
    setCargando(false);
  }, [obraId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const ejecutar = async (accion: () => Promise<void>) => {
    setTrabajando(true);
    setError(null);
    try {
      await accion();
      await cargar();
    } catch (e) {
      setError((e as Error).message);
    }
    setTrabajando(false);
  };

  const pagar = () =>
    ejecutar(async () => {
      const { clientSecret } = await iniciarPago(obraId);
      const res = await abrirHoja(clientSecret);
      if (res.cancelado) return;
      if (!res.ok) throw new Error(res.error ?? 'No se ha podido completar el pago.');
      Alert.alert('Pago realizado', 'Tu dinero queda retenido de forma segura y se entrega al oficio según vayas confirmando el trabajo.');
    });

  if (!PAGOS_ACTIVOS || !obraAdjudicada) return null;
  if (cargando) return <ActivityIndicator color={colors.action} style={{ marginVertical: 12 }} />;

  const porTramos = pago !== null && pago.con_tramos;
  const sinPagar = pago === null || ['pendiente', 'fallido', 'cancelado'].includes(pago.estado);
  const estado = pago?.estado;

  let titulo = '';
  let texto = '';
  let icono: 'lock' | 'check-circle' | 'alert-triangle' | 'clock' | 'credit-card' = 'lock';

  if (sinPagar) {
    icono = 'credit-card';
    titulo = rol === 'cliente' ? 'Paga la obra con seguridad' : 'Pendiente de pago del cliente';
    texto = rol === 'cliente'
      ? 'Pagas la obra entera ahora y el dinero queda retenido. El oficio lo va recibiendo según el calendario de su oferta, cuando cada parte está terminada y verificada.'
      : 'Cuando el cliente pague, el dinero quedará retenido y se te liberará según el calendario de tu oferta.';
    if (pago?.estado === 'fallido') texto = 'El último pago no se completó. Puedes volver a intentarlo.';
  } else if (estado === 'retenido') {
    icono = 'lock';
    if (porTramos) {
      const liberado = tramos.filter((t) => t.estado === 'liberado').reduce((a, t) => a + t.importe_cents, 0);
      titulo = 'Pago retenido, se libera por tramos';
      texto = rol === 'cliente'
        ? `${formatearCents(pago!.importe_cents)} pagados. Cada tramo se entrega al oficio cuando tú lo confirmas${liberado > 0 ? ` (ya entregado: ${formatearCents(liberado)})` : ''}.`
        : `El cliente ha pagado la obra entera. Marca cada tramo como terminado según avances y se te irá liberando${liberado > 0 ? ` (ya liberado: ${formatearCents(liberado)})` : ''}.`;
    } else {
      titulo = 'Pago retenido';
      texto = rol === 'cliente'
        ? `${formatearCents(pago!.importe_cents)} retenidos. Se entregarán al oficio cuando termine y tú lo confirmes.`
        : 'El cliente ha pagado. Cuando termines la obra, márcala como terminada para iniciar la verificación.';
    }
  } else if (estado === 'terminada_oficio') {
    icono = 'clock';
    const d = diasRestantes(pago!.auto_confirma_at);
    titulo = 'Obra terminada, pendiente de confirmar';
    texto = rol === 'cliente'
      ? `Revisa el trabajo. Si no respondes${d !== null ? ` en ${d} ${d === 1 ? 'día' : 'días'}` : ''}, se dará por bueno.`
      : 'Esperando que el cliente confirme la obra.';
  } else if (estado === 'confirmada_cliente' || estado === 'aprobado_3b' || estado === 'liberando') {
    icono = 'clock';
    titulo = 'Verificación final de 3B';
    texto = 'La obra está confirmada. 3B hace la comprobación final y liberará el pago.';
  } else if (estado === 'en_disputa') {
    icono = 'alert-triangle';
    titulo = 'Pago en revisión';
    texto = 'Se ha reportado un problema. El pago está congelado y 3B lo revisará antes de mover el dinero.';
  } else if (estado === 'liberado') {
    icono = 'check-circle';
    titulo = 'Pago entregado';
    texto = rol === 'cliente' ? 'El pago se ha entregado al oficio.' : 'El pago se ha enviado a tu cuenta de cobro.';
  } else if (estado === 'reembolsado' || estado === 'reembolsando') {
    icono = 'check-circle';
    titulo = 'Pago reembolsado';
    texto = rol === 'cliente' ? 'Te hemos devuelto el pago.' : 'El pago se ha devuelto al cliente.';
  }

  const etiquetaTramo: Record<Tramo['estado'], string> = {
    pendiente: 'Pendiente',
    terminado_oficio: 'Esperando confirmación',
    confirmado_cliente: 'Verificación de 3B',
    liberando: 'Liberando…',
    liberado: 'Liberado',
    cerrado: 'Cerrado',
  };
  const puedeReportar =
    pago !== null && ['retenido', 'terminada_oficio', 'confirmada_cliente', 'aprobado_3b'].includes(pago.estado);

  return (
    <View className="bg-surface rounded-xl border border-border p-4 mb-4">
      <View className="flex-row items-center mb-1.5" style={{ gap: 8 }}>
        <Feather name={icono} size={16} color={estado === 'en_disputa' ? colors.warning : colors.action} />
        <Text className="text-ink text-sm font-sansBold flex-1">{titulo}</Text>
      </View>
      <Text className="text-inkMuted text-xs">{texto}</Text>

      {error !== null && <Text className="text-error text-xs mt-2">{error}</Text>}

      {rol === 'cliente' && sinPagar && (
        <Pressable onPress={pagar} disabled={trabajando} className="bg-action rounded-lg py-2.5 items-center mt-3">
          <Text className="text-white text-xs font-sansBold">Pagar ahora</Text>
        </Pressable>
      )}

      {porTramos && tramos.length > 0 && !sinPagar && (
        <View className="mt-3" style={{ gap: 8 }}>
          {tramos.map((t, i) => {
            const anteriorOk = i === 0 || ['confirmado_cliente', 'liberando', 'liberado'].includes(tramos[i - 1].estado);
            const d = diasRestantes(t.auto_confirma_at);
            return (
              <View key={t.id} className="bg-canvas border border-border rounded-lg p-3">
                <View className="flex-row items-center" style={{ gap: 8 }}>
                  <Feather
                    name={t.estado === 'liberado' ? 'check-circle' : t.estado === 'pendiente' ? 'circle' : 'clock'}
                    size={15}
                    color={t.estado === 'liberado' ? colors.success : colors.action}
                  />
                  <View className="flex-1">
                    <Text className="text-ink text-xs font-sansBold">{t.titulo}</Text>
                    <Text className="text-inkMuted text-[12px]">
                      {String(t.pct).replace('.', ',')} % · {formatearCents(t.importe_cents)}
                    </Text>
                  </View>
                  <Text className="text-inkMuted text-[12px] font-sansSemiBold">{etiquetaTramo[t.estado]}</Text>
                </View>
                {t.estado === 'terminado_oficio' && rol === 'cliente' && d !== null && (
                  <Text className="text-inkMuted text-[12px] mt-1.5">
                    Revísalo. Si no respondes en {d} {d === 1 ? 'día' : 'días'}, se dará por bueno.
                  </Text>
                )}
                {rol === 'oficio' && estado === 'retenido' && t.estado === 'pendiente' && anteriorOk && (
                  <Pressable
                    onPress={() =>
                      Alert.alert('Marcar tramo como terminado', `El cliente recibirá un aviso para revisar «${t.titulo}».`, [
                        { text: 'Volver', style: 'cancel' },
                        { text: 'Marcar como terminado', onPress: () => ejecutar(() => oficioTerminaTramo(t.id)) },
                      ])
                    }
                    disabled={trabajando}
                    className="bg-action rounded-lg py-2 items-center mt-2"
                  >
                    <Text className="text-white text-xs font-sansBold">Marcar tramo como terminado</Text>
                  </Pressable>
                )}
                {rol === 'oficio' && estado === 'retenido' && t.estado === 'pendiente' && !anteriorOk && (
                  <Text className="text-inkMuted text-[12px] mt-1.5">Disponible cuando el cliente confirme el tramo anterior.</Text>
                )}
                {rol === 'cliente' && estado === 'retenido' && t.estado === 'terminado_oficio' && (
                  <Pressable
                    onPress={() =>
                      Alert.alert('Confirmar el tramo', `Confirmas que «${t.titulo}» está bien hecho. 3B hará la comprobación final antes de pagar al oficio este tramo.`, [
                        { text: 'Volver', style: 'cancel' },
                        { text: 'Confirmar tramo', onPress: () => ejecutar(() => clienteConfirmaTramo(t.id)) },
                      ])
                    }
                    disabled={trabajando}
                    className="bg-action rounded-lg py-2 items-center mt-2"
                  >
                    <Text className="text-white text-xs font-sansBold">Confirmar que está bien</Text>
                  </Pressable>
                )}
              </View>
            );
          })}
        </View>
      )}

      {rol === 'oficio' && estado === 'retenido' && !porTramos && (
        <Pressable
          onPress={() =>
            Alert.alert('Marcar como terminada', 'El cliente recibirá un aviso para revisar el trabajo.', [
              { text: 'Volver', style: 'cancel' },
              { text: 'Marcar como terminada', onPress: () => ejecutar(() => oficioTermina(pago!.id)) },
            ])
          }
          disabled={trabajando}
          className="bg-action rounded-lg py-2.5 items-center mt-3"
        >
          <Text className="text-white text-xs font-sansBold">Marcar obra como terminada</Text>
        </Pressable>
      )}

      {rol === 'cliente' && estado === 'terminada_oficio' && (
        <Pressable
          onPress={() =>
            Alert.alert('Confirmar la obra', 'Confirmas que el trabajo está bien hecho. 3B hará la comprobación final antes de pagar al oficio.', [
              { text: 'Volver', style: 'cancel' },
              { text: 'Confirmar obra', onPress: () => ejecutar(() => clienteConfirma(pago!.id)) },
            ])
          }
          disabled={trabajando}
          className="bg-action rounded-lg py-2.5 items-center mt-3"
        >
          <Text className="text-white text-xs font-sansBold">Confirmar que está bien</Text>
        </Pressable>
      )}

      {puedeReportar && !reportando && (
        <Pressable onPress={() => { setReportando(true); setMotivo(''); }} className="mt-3 items-center">
          <Text className="text-error text-xs font-sansSemiBold">Hay un problema</Text>
        </Pressable>
      )}

      {reportando && (
        <View className="mt-3">
          <Text className="text-ink text-xs font-sansSemiBold mb-1">Cuéntanos qué ha pasado</Text>
          <View className="bg-canvas border border-border rounded-xl px-3 mb-2">
            <TextInput
              value={motivo}
              onChangeText={setMotivo}
              multiline
              placeholder="Describe el problema con el máximo detalle"
              placeholderTextColor={colors.inkSubtle}
              className="py-2.5 text-ink"
              style={{ minHeight: 70 }}
            />
          </View>
          <View className="flex-row" style={{ gap: 8 }}>
            <Pressable onPress={() => setReportando(false)} className="flex-1 border border-border rounded-lg py-2 items-center">
              <Text className="text-inkMuted text-xs font-sansSemiBold">Cancelar</Text>
            </Pressable>
            <Pressable
              onPress={() => ejecutar(async () => { await reportarProblema(pago!.id, motivo); setReportando(false); })}
              disabled={trabajando}
              className="flex-1 bg-error rounded-lg py-2 items-center"
            >
              <Text className="text-white text-xs font-sansBold">Congelar el pago</Text>
            </Pressable>
          </View>
        </View>
      )}

      {trabajando && <ActivityIndicator color={colors.action} style={{ marginTop: 8 }} />}
    </View>
  );
}