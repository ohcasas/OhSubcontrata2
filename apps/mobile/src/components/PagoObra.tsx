import { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../design-system/tokens';
import {
  pagoDeObra, iniciarPago, oficioTermina, clienteConfirma, reportarProblema, formatearCents,
  type Pago,
} from '../services/pagos';
import { useHojaDePago } from '../services/stripeNativo';

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
  const [cargando, setCargando] = useState(true);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportando, setReportando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const abrirHoja = useHojaDePago();

  const cargar = useCallback(async () => {
    try {
      setPago(await pagoDeObra(obraId));
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
      Alert.alert('Pago realizado', 'Tu dinero queda retenido de forma segura hasta que confirmes la obra.');
    });

  if (!obraAdjudicada) return null;
  if (cargando) return <ActivityIndicator color={colors.action} style={{ marginVertical: 12 }} />;

  const sinPagar = pago === null || ['pendiente', 'fallido', 'cancelado'].includes(pago.estado);
  const estado = pago?.estado;

  let titulo = '';
  let texto = '';
  let icono: 'lock' | 'check-circle' | 'alert-triangle' | 'clock' | 'credit-card' = 'lock';

  if (sinPagar) {
    icono = 'credit-card';
    titulo = rol === 'cliente' ? 'Paga la obra con seguridad' : 'Pendiente de pago del cliente';
    texto = rol === 'cliente'
      ? 'Pagas ahora y el dinero queda retenido. El oficio solo lo recibe cuando la obra está terminada y verificada.'
      : 'Cuando el cliente pague, el dinero quedará retenido y se te liberará al terminar la obra.';
    if (pago?.estado === 'fallido') texto = 'El último pago no se completó. Puedes volver a intentarlo.';
  } else if (estado === 'retenido') {
    icono = 'lock';
    titulo = 'Pago retenido';
    texto = rol === 'cliente'
      ? `${formatearCents(pago!.importe_cents)} retenidos. Se entregarán al oficio cuando termine y tú lo confirmes.`
      : 'El cliente ha pagado. Cuando termines la obra, márcala como terminada para iniciar la verificación.';
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

      {rol === 'oficio' && estado === 'retenido' && (
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