import { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, useWindowDimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../design-system/tokens';
import { paquetesDisponibles, textoExtra, type Paquete } from '../services/paquetes';

type Props = {
  value: string | null;
  onChange: (codigo: string) => void;
  /** Se avisa de si hay paquetes para mostrar (false mientras estén apagados en el panel). */
  onDisponibles?: (hay: boolean) => void;
};

const FONDO: Record<string, [string, string]> = {
  basico: ['#2F6BFF', '#0057FF'],
  medio: ['#0046CC', '#102A46'],
  premium: ['#102A46', '#0B1F35'],
};

/**
 * Tarjetas Básico / Medio / Premium (carrusel horizontal). No pinta nada si los paquetes están
 * apagados: así puede publicarse en la app antes de activarlos.
 */
export default function PaquetesSelector({ value, onChange, onDisponibles }: Props) {
  const [paquetes, setPaquetes] = useState<Paquete[] | null>(null);
  const { width } = useWindowDimensions();
  const ancho = Math.min(width - 72, 300);

  useEffect(() => {
    let vivo = true;
    paquetesDisponibles().then((p) => {
      if (!vivo) return;
      setPaquetes(p);
      onDisponibles?.(p.length > 0);
      if (p.length > 0 && value === null) onChange(p[0].codigo);
    });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (paquetes === null) return <ActivityIndicator color={colors.action} style={{ marginVertical: 12 }} />;
  if (paquetes.length === 0) return null;

  return (
    <View className="mb-3">
      <Text className="text-ink text-xs font-sansSemiBold mb-1">Elige tu paquete *</Text>
      <Text className="text-inkMuted text-[12px] mb-2">
        El extra se calcula sobre la oferta que aceptes y lo ves antes de pagar. Si el pago se devuelve, te devolvemos también el extra.
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 8 }}>
        {paquetes.map((p) => {
          const elegido = value === p.codigo;
          const [c1, c2] = FONDO[p.codigo] ?? FONDO.basico;
          return (
            <Pressable
              key={p.codigo}
              onPress={() => onChange(p.codigo)}
              accessibilityRole="radio"
              accessibilityState={{ selected: elegido }}
              accessibilityLabel={`Paquete ${p.nombre}. ${textoExtra(p)}`}
              style={{
                width: ancho,
                backgroundColor: elegido ? c2 : c1,
                borderRadius: 16,
                padding: 16,
                borderWidth: 2,
                borderColor: elegido ? colors.white : 'transparent',
                opacity: elegido ? 1 : 0.88,
              }}
            >
              <View className="flex-row items-center" style={{ gap: 8 }}>
                <Text style={{ color: colors.white, fontSize: 18, fontWeight: '700', flex: 1 }}>{p.nombre}</Text>
                {p.recomendado && (
                  <View style={{ backgroundColor: colors.white, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                    <Text style={{ color: colors.actionDark, fontSize: 11, fontWeight: '700' }}>Recomendado</Text>
                  </View>
                )}
                <Feather name={elegido ? 'check-circle' : 'circle'} size={20} color={colors.white} />
              </View>
              <Text style={{ color: '#DCE7FF', fontSize: 12, marginTop: 4 }}>{p.descripcion}</Text>
              <View style={{ backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, marginTop: 10, alignSelf: 'flex-start' }}>
                <Text style={{ color: colors.white, fontSize: 12, fontWeight: '700' }}>{textoExtra(p)}</Text>
              </View>
              <View style={{ marginTop: 10, gap: 5 }}>
                {p.servicios.map((s) => (
                  <View key={s} className="flex-row" style={{ gap: 7 }}>
                    <Feather name="check" size={13} color="#BFD4FF" style={{ marginTop: 2 }} />
                    <Text style={{ color: colors.white, fontSize: 12, flex: 1 }}>{s}</Text>
                  </View>
                ))}
              </View>
              {p.plazo_revision_horas !== null && (
                <Text style={{ color: '#BFD4FF', fontSize: 11, marginTop: 10 }}>
                  Revisión en un máximo de {p.plazo_revision_horas} h laborables
                </Text>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}