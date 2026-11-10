import { useCallback, useState } from 'react';
import { Modal, View, Text, Pressable, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../design-system/tokens';
import {
  historialOficio, historialCliente, contratosDePago, formatearCents,
  type ResumenPago, type HistorialOficio, type ContratoFirmado, type EstadoPago, type EstadoTramo,
} from '../services/pagos';
import { compartirContratoPdf } from '../utils/contratoPdf';

type Props = {
  /** oficio = ve lo que cobra (con la comisión de 3B); cliente = ve lo que ha pagado */
  rol: 'oficio' | 'cliente';
};

const ETIQUETA_ESTADO: Record<EstadoPago, string> = {
  pendiente: 'Pendiente de pago',
  retenido: 'Retenido',
  terminada_oficio: 'Esperando confirmación',
  confirmada_cliente: 'Verificación de 3B',
  aprobado_3b: 'Verificación de 3B',
  en_disputa: 'En revisión',
  liberando: 'Liberando…',
  liberado: 'Liberado',
  reembolsando: 'Reembolsando…',
  reembolsado: 'Reembolsado',
  fallido: 'Fallido',
  cancelado: 'Cancelado',
};

const ETIQUETA_TRAMO: Record<EstadoTramo, string> = {
  pendiente: 'Pendiente',
  terminado_oficio: 'Esperando confirmación',
  confirmado_cliente: 'Verificación de 3B',
  liberando: 'Liberando…',
  liberado: 'Liberado',
  cerrado: 'Cerrado',
};

function fecha(iso: string | null): string {
  if (iso === null) return '—';
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

function pct(n: number | null | undefined): string {
  return n === null || n === undefined ? '' : `${String(n).replace('.', ',')} %`;
}

/** Tarjeta del Perfil «Mis cobros» / «Mis pagos». Abre el historial a pantalla completa. */
export default function HistorialPagos({ rol }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagos, setPagos] = useState<ResumenPago[]>([]);
  const [totales, setTotales] = useState<HistorialOficio | null>(null);
  const [expandido, setExpandido] = useState<string | null>(null);
  const [contratos, setContratos] = useState<Record<string, ContratoFirmado[]>>({});
  const [cargandoContratos, setCargandoContratos] = useState<string | null>(null);
  const [viendo, setViendo] = useState<ContratoFirmado | null>(null);
  const [generando, setGenerando] = useState(false);

  const esOficio = rol === 'oficio';

  const cargar = useCallback(async () => {
    setError(null);
    try {
      if (esOficio) {
        const h = await historialOficio();
        setTotales(h);
        setPagos(h.pagos);
      } else {
        setPagos(await historialCliente());
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }, [esOficio]);

  const abrir = async () => {
    setAbierto(true);
    setCargando(true);
    await cargar();
    setCargando(false);
  };

  const refrescar = async () => {
    setRefrescando(true);
    await cargar();
    setRefrescando(false);
  };

  const cerrar = () => {
    setViendo(null);
    setAbierto(false);
  };

  const alternar = async (p: ResumenPago) => {
    if (expandido === p.pago_id) {
      setExpandido(null);
      return;
    }
    setExpandido(p.pago_id);
    if (contratos[p.pago_id] === undefined) {
      setCargandoContratos(p.pago_id);
      try {
        const c = await contratosDePago(p.pago_id);
        setContratos((prev) => ({ ...prev, [p.pago_id]: c }));
      } catch (e) {
        setError((e as Error).message);
      }
      setCargandoContratos(null);
    }
  };

  const descargar = async (c: ContratoFirmado) => {
    setGenerando(true);
    setError(null);
    try {
      await compartirContratoPdf(c);
    } catch (e) {
      setError((e as Error).message);
    }
    setGenerando(false);
  };

  const titulo = esOficio ? 'Mis cobros' : 'Mis pagos';

  return (
    <>
      <Pressable onPress={abrir} className="bg-surface rounded-xl border border-border p-4 mb-4 flex-row items-center" style={{ gap: 10 }}>
        <Feather name="file-text" size={16} color={colors.action} />
        <View className="flex-1">
          <Text className="text-ink text-sm font-sansBold">{titulo}</Text>
          <Text className="text-inkMuted text-xs">
            {esOficio ? 'Lo que has cobrado, lo retenido y tus contratos firmados.' : 'Tus pagos y los contratos que has firmado.'}
          </Text>
        </View>
        <Feather name="chevron-right" size={18} color={colors.inkMuted} />
      </Pressable>

      <Modal visible={abierto} animationType="slide" onRequestClose={viendo ? () => setViendo(null) : cerrar}>
        <View className="flex-1 bg-canvas">
          <View className="flex-row items-center px-4 pt-12 pb-3 border-b border-border" style={{ gap: 8 }}>
            {viendo !== null && (
              <Pressable onPress={() => setViendo(null)} hitSlop={10} accessibilityLabel="Volver">
                <Feather name="arrow-left" size={22} color={colors.inkMuted} />
              </Pressable>
            )}
            <Text className="text-ink text-base font-sansBold flex-1" numberOfLines={1}>
              {viendo !== null ? viendo.titulo : titulo}
            </Text>
            <Pressable onPress={cerrar} hitSlop={10} accessibilityLabel="Cerrar">
              <Feather name="x" size={22} color={colors.inkMuted} />
            </Pressable>
          </View>

          {viendo !== null ? (
            <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingVertical: 16 }}>
              <Text className="text-inkMuted text-xs mb-3">
                {viendo.estado === 'tacito'
                  ? 'Conformidad tácita: no hubo respuesta en el plazo y la obra se dio por conforme.'
                  : `Firmado por ${viendo.firmante_nombre ?? '—'} el ${fecha(viendo.firmado_at)}.`}
              </Text>
              <View className="bg-surface border border-border rounded-xl p-4">
                <Text className="text-ink text-[13px]" selectable style={{ lineHeight: 20 }}>{viendo.cuerpo}</Text>
              </View>
              <Text className="text-inkSubtle text-[11px] mt-3" selectable>Huella SHA-256: {viendo.hash}</Text>
              {error !== null && <Text className="text-error text-xs mt-3">{error}</Text>}
              <Pressable
                onPress={() => descargar(viendo)}
                disabled={generando}
                className="bg-action rounded-lg py-3 items-center mt-4"
              >
                {generando ? <ActivityIndicator color="#FFFFFF" /> : (
                  <Text className="text-white text-sm font-sansBold">Descargar o compartir PDF</Text>
                )}
              </Pressable>
            </ScrollView>
          ) : (
            <ScrollView
              className="flex-1 px-4"
              contentContainerStyle={{ paddingVertical: 16 }}
              refreshControl={<RefreshControl refreshing={refrescando} onRefresh={refrescar} />}
            >
              {cargando && <ActivityIndicator color={colors.action} style={{ marginVertical: 24 }} />}
              {error !== null && <Text className="text-error text-xs mb-3">{error}</Text>}

              {esOficio && totales !== null && !cargando && (
                <View className="flex-row mb-4" style={{ gap: 8 }}>
                  <Resumen etiqueta="Cobrado" valor={formatearCents(totales.cobrado_cents)} color={colors.success} />
                  <Resumen etiqueta="Retenido" valor={formatearCents(totales.retenido_cents)} color={colors.action} />
                  <Resumen etiqueta="Comisión 3B" valor={formatearCents(totales.comision_cents)} color={colors.inkMuted} />
                </View>
              )}
              {esOficio && !cargando && (
                <Text className="text-inkMuted text-[12px] mb-4">
                  Los importes son netos: ya llevan descontada la comisión de 3B. «Retenido» es lo que ya ha pagado el cliente y
                  se te libera al terminar y verificar la obra.
                </Text>
              )}

              {!cargando && pagos.length === 0 && error === null && (
                <Text className="text-inkMuted text-sm text-center mt-8">Todavía no hay pagos.</Text>
              )}

              {pagos.map((p) => {
                const abiertoPago = expandido === p.pago_id;
                const lista = contratos[p.pago_id];
                return (
                  <View key={p.pago_id} className="bg-surface rounded-xl border border-border mb-3">
                    <Pressable onPress={() => alternar(p)} className="p-4">
                      <View className="flex-row items-center" style={{ gap: 8 }}>
                        <Text className="text-ink text-sm font-sansBold flex-1" numberOfLines={2}>{p.obra_titulo ?? 'Obra'}</Text>
                        <Feather name={abiertoPago ? 'chevron-up' : 'chevron-down'} size={16} color={colors.inkMuted} />
                      </View>
                      <Text className="text-inkMuted text-xs mt-1">
                        {ETIQUETA_ESTADO[p.estado]} · {formatearCents(p.importe_cents)}
                      </Text>
                      {esOficio && p.neto_cents !== undefined && p.estado !== 'reembolsado' && (
                        <Text className="text-ink text-xs mt-1">
                          Para ti: <Text className="font-sansBold">{formatearCents(p.neto_cents)}</Text>
                          {p.comision_cents ? `  (comisión ${pct(p.comision_pct)}: ${formatearCents(p.comision_cents)})` : ''}
                        </Text>
                      )}
                      {!esOficio && (p.entregado_cents ?? 0) > 0 && (
                        <Text className="text-ink text-xs mt-1">Entregado al oficio: {formatearCents(p.entregado_cents ?? 0)}</Text>
                      )}
                    </Pressable>

                    {abiertoPago && (
                      <View className="px-4 pb-4 border-t border-border pt-3" style={{ gap: 6 }}>
                        <Fila etiqueta="Pagado" valor={fecha(p.pagado_at)} />
                        <Fila etiqueta="Liberado al oficio" valor={fecha(p.liberado_at)} />
                        {p.importe_reembolso_cents ? (
                          <Fila etiqueta="Devuelto al cliente" valor={formatearCents(p.importe_reembolso_cents)} />
                        ) : null}
                        {p.reembolso_solicitado_at !== null && (
                          <Fila etiqueta="Reembolso solicitado" valor={fecha(p.reembolso_solicitado_at)} />
                        )}

                        {p.tramos.length > 0 && (
                          <View className="mt-2" style={{ gap: 6 }}>
                            <Text className="text-ink text-xs font-sansBold">Tramos</Text>
                            {p.tramos.map((t) => (
                              <View key={t.id} className="bg-canvas border border-border rounded-lg p-2.5">
                                <Text className="text-ink text-xs font-sansSemiBold">
                                  {t.titulo} · {pct(t.pct)}
                                </Text>
                                <Text className="text-inkMuted text-[12px]">
                                  {ETIQUETA_TRAMO[t.estado]} · {formatearCents(t.importe_cents)}
                                  {esOficio && t.neto_cents !== undefined ? ` · para ti ${formatearCents(t.neto_cents)}` : ''}
                                  {t.liberado_at ? ` · liberado ${fecha(t.liberado_at)}` : ''}
                                </Text>
                              </View>
                            ))}
                          </View>
                        )}

                        <Text className="text-ink text-xs font-sansBold mt-3">Contratos firmados</Text>
                        {cargandoContratos === p.pago_id && <ActivityIndicator color={colors.action} />}
                        {lista !== undefined && lista.length === 0 && (
                          <Text className="text-inkMuted text-[12px]">Todavía no hay contratos firmados en este pago.</Text>
                        )}
                        {lista?.map((c) => (
                          <View key={c.id} className="flex-row items-center bg-canvas border border-border rounded-lg p-2.5" style={{ gap: 8 }}>
                            <Feather name="file-text" size={15} color={colors.action} />
                            <View className="flex-1">
                              <Text className="text-ink text-xs font-sansSemiBold" numberOfLines={2}>
                                {c.titulo}{c.tramo_titulo ? ` · ${c.tramo_titulo}` : ''}
                              </Text>
                              <Text className="text-inkMuted text-[12px]">
                                {c.estado === 'tacito' ? 'Conformidad tácita' : `Firmado ${fecha(c.firmado_at)}`}
                              </Text>
                            </View>
                            <Pressable onPress={() => setViendo(c)} hitSlop={8}>
                              <Text className="text-action text-xs font-sansBold">Ver</Text>
                            </Pressable>
                            <Pressable onPress={() => descargar(c)} disabled={generando} hitSlop={8}>
                              <Text className="text-action text-xs font-sansBold">PDF</Text>
                            </Pressable>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>
      </Modal>
    </>
  );
}

function Resumen({ etiqueta, valor, color }: { etiqueta: string; valor: string; color: string }) {
  return (
    <View className="flex-1 bg-surface border border-border rounded-xl p-3">
      <Text className="text-inkMuted text-[11px]">{etiqueta}</Text>
      <Text className="text-sm font-sansBold mt-0.5" style={{ color }}>{valor}</Text>
    </View>
  );
}

function Fila({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <View className="flex-row justify-between">
      <Text className="text-inkMuted text-xs">{etiqueta}</Text>
      <Text className="text-ink text-xs font-sansSemiBold">{valor}</Text>
    </View>
  );
}