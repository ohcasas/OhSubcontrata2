import { useCallback, useState } from 'react';
import { View, Text, TextInput, Pressable, FlatList, RefreshControl, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { colors } from '../../design-system/tokens';
import { formatearMoneda } from '../../utils/moneda';
import ScreenHeader from '../../components/ScreenHeader';

type Referencia = {
  id: string;
  nombre_cliente: string;
  telefono_cliente: string | null;
  email_cliente: string | null;
  estado: string;
  precio_venta: number | null;
  motivo_descarte: string | null;
  created_at: string;
  profiles: { nombre_completo: string | null; role: string } | null;
};

const ESTADOS: { clave: string; etiqueta: string }[] = [
  { clave: 'enviado', etiqueta: 'Enviado' },
  { clave: 'contactado', etiqueta: 'Contactado' },
  { clave: 'visita', etiqueta: 'Visita' },
  { clave: 'presupuesto', etiqueta: 'Presupuesto' },
  { clave: 'reserva', etiqueta: 'Reserva' },
  { clave: 'venta', etiqueta: 'Venta' },
  { clave: 'comision_disponible', etiqueta: 'Comisión disponible' },
  { clave: 'descartado', etiqueta: 'Descartado' },
];

export default function AdminReferidosScreen({ embebida = false }: { embebida?: boolean }) {
  const [referencias, setReferencias] = useState<Referencia[]>([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actualizandoId, setActualizandoId] = useState<string | null>(null);
  const [precioVentaPorId, setPrecioVentaPorId] = useState<Record<string, string>>({});

  const cargar = useCallback(async () => {
    setError(null);
    const { data, error: errorSelect } = await supabase
      .from('referencias_comerciales')
      .select(
        'id, nombre_cliente, telefono_cliente, email_cliente, estado, precio_venta, motivo_descarte, created_at, profiles(nombre_completo, role)',
      )
      .order('created_at', { ascending: false });

    if (errorSelect) {
      setError(errorSelect.message);
    } else {
      setReferencias((data as unknown as Referencia[] | null) ?? []);
    }
    setCargando(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [cargar]),
  );

  const handleCambiarEstado = async (referencia: Referencia, nuevoEstado: string) => {
    setError(null);

    let precioVenta: number | null = null;
    if (nuevoEstado === 'venta') {
      const texto = precioVentaPorId[referencia.id] ?? (referencia.precio_venta?.toString() ?? '');
      precioVenta = Number(texto.replace(',', '.'));
      if (!texto || Number.isNaN(precioVenta) || precioVenta <= 0) {
        setError('Indica el precio de venta al cliente (sin IVA) antes de marcar esta referencia como venta.');
        return;
      }
    }

    setActualizandoId(referencia.id);
    const { error: errorRpc } = await supabase.rpc('actualizar_estado_referencia', {
      p_referencia_id: referencia.id,
      p_nuevo_estado: nuevoEstado,
      p_motivo_descarte: null,
      p_obra_id: null,
      p_precio_venta: precioVenta,
    });
    setActualizandoId(null);

    if (errorRpc) {
      setError(errorRpc.message);
      return;
    }
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
      {!embebida && <ScreenHeader title="OH Recomienda" subtitle={`${referencias.length} referencias`} />}

      {error !== null && (
        <View className="bg-errorTint mx-4 mt-3 rounded-lg px-3 py-2 flex-row items-center gap-2">
          <Feather name="alert-circle" size={16} color={colors.error} />
          <Text className="text-error text-sm flex-1">{error}</Text>
        </View>
      )}

      <FlatList
        data={referencias}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16 }}
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
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListEmptyComponent={
          <View className="items-center mt-16">
            <Feather name="users" size={28} color={colors.inkSubtle} />
            <Text className="text-inkMuted text-sm text-center mt-3">
              Todavía no hay ninguna referencia comercial registrada.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View className="bg-surface rounded-xl border border-border p-3.5">
            <View className="flex-row justify-between items-start">
              <View className="flex-1 pr-2">
                <Text className="text-ink text-sm font-sansBold">{item.nombre_cliente}</Text>
                <Text className="text-inkMuted text-xs mt-0.5">
                  Referido por {item.profiles?.nombre_completo ?? '—'} ({item.profiles?.role ?? '—'})
                </Text>
                {item.telefono_cliente !== null && (
                  <Text className="text-inkMuted text-xs mt-0.5">{item.telefono_cliente}</Text>
                )}
                {item.email_cliente !== null && (
                  <Text className="text-inkMuted text-xs mt-0.5">{item.email_cliente}</Text>
                )}
              </View>
              {item.precio_venta !== null && (
                <Text className="text-ink text-sm font-sansBold">{formatearMoneda(item.precio_venta)}</Text>
              )}
            </View>

            <Text className="text-inkMuted text-[10px] font-sansSemiBold uppercase mt-3 mb-1.5" style={{ letterSpacing: 0.5 }}>
              Estado
            </Text>
            <View className="flex-row flex-wrap" style={{ gap: 6 }}>
              {ESTADOS.map((e) => {
                const activo = item.estado === e.clave;
                return (
                  <Pressable
                    key={e.clave}
                    onPress={() => handleCambiarEstado(item, e.clave)}
                    disabled={actualizandoId === item.id}
                    className={`rounded-full px-3 py-1.5 border ${
                      activo ? 'bg-action border-action' : 'bg-surface border-border'
                    }`}
                  >
                    <Text className={`text-[11px] font-sansSemiBold ${activo ? 'text-white' : 'text-ink'}`}>
                      {e.etiqueta}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {item.estado !== 'venta' && item.estado !== 'comision_disponible' && (
              <View className="flex-row items-center bg-canvas border border-border rounded-lg px-3 mt-3">
                <Feather name="dollar-sign" size={13} color={colors.inkSubtle} />
                <TextInput
                  value={precioVentaPorId[item.id] ?? (item.precio_venta?.toString() ?? '')}
                  onChangeText={(texto) => setPrecioVentaPorId((prev) => ({ ...prev, [item.id]: texto }))}
                  keyboardType="decimal-pad"
                  placeholder="Precio de venta al cliente (sin IVA), para cuando llegue a Venta"
                  placeholderTextColor={colors.inkSubtle}
                  className="flex-1 py-2 pl-2 text-ink text-xs"
                />
              </View>
            )}

            {actualizandoId === item.id && <ActivityIndicator size="small" color={colors.action} style={{ marginTop: 8 }} />}
          </View>
        )}
      />
    </View>
  );
}