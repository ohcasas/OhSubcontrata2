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

// Degradado vertical de cada tarjeta (de arriba a abajo). Cuanto más alto el paquete, más intenso el azul.
const DEGRADADO: Record<string, [string, string]> = {
  basico: ['#6E9BFF', '#3F72F0'],
  medio: ['#3E6BF2', '#1E44C8'],
  premium: ['#2547C9', '#10206E'],
};
const TRAMOS = 40;

function mezcla(a: string, b: string, t: number): string {
  const n = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  const c = (i: number) => Math.round(n(a, i) + (n(b, i) - n(a, i)) * t);
  return `rgb(${c(0)},${c(1)},${c(2)})`;
}

/** Degradado sin librerías nativas: franjas finas de color apiladas. */
function Degradado({ desde, hasta }: { desde: string; hasta: string }) {
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} pointerEvents="none">
      {Array.from({ length: TRAMOS }, (_, i) => (
        <View key={i} style={{ flex: 1, backgroundColor: mezcla(desde, hasta, i / (TRAMOS - 1)) }} />
      ))}
    </View>
  );
}

const BLANCO = (a: number) => `rgba(255,255,255,${a})`;

/** Formas decorativas de cada paquete (solo adorno, no afectan al cobro). */
function Formas({ codigo }: { codigo: string }) {
  const base = { position: 'absolute' as const };
  if (codigo === 'medio') {
    return (
      <View style={{ position: 'absolute', right: -80, bottom: 50, width: 260, height: 260 }} pointerEvents="none">
        <View style={{ ...base, left: 0, top: 0, width: 260, height: 260, borderRadius: 130, borderWidth: 20, borderColor: BLANCO(0.12) }} />
        <View style={{ ...base, left: 36, top: 36, width: 188, height: 188, borderRadius: 94, borderWidth: 24, borderColor: BLANCO(0.2) }} />
        <View style={{ ...base, left: 72, top: 72, width: 116, height: 116, borderRadius: 58, borderWidth: 26, borderColor: BLANCO(0.34) }} />
      </View>
    );
  }
  if (codigo === 'premium') {
    return (
      <View style={{ position: 'absolute', right: -30, bottom: 80, width: 200, height: 200 }} pointerEvents="none">
        <View style={{ ...base, left: 10, top: 10, width: 150, height: 150, borderRadius: 38, backgroundColor: BLANCO(0.12), transform: [{ rotate: '18deg' }] }} />
        <View style={{ ...base, left: 78, top: 82, width: 96, height: 96, borderRadius: 28, backgroundColor: BLANCO(0.16), transform: [{ rotate: '-10deg' }] }} />
      </View>
    );
  }
  // Básico: una cinta ondulada hecha con dos cápsulas
  return (
    <View style={{ position: 'absolute', right: -40, bottom: 70, width: 230, height: 150 }} pointerEvents="none">
      <View style={{ ...base, left: 30, top: 70, width: 150, height: 44, borderRadius: 22, backgroundColor: BLANCO(0.17), transform: [{ rotate: '24deg' }] }} />
      <View style={{ ...base, left: 90, top: 22, width: 150, height: 44, borderRadius: 22, backgroundColor: BLANCO(0.17), transform: [{ rotate: '-30deg' }] }} />
    </View>
  );
}

const eur = (c: number) => `${Math.round(c / 100)} €`;

/**
 * Tarjetas Básico / Medio / Premium (carrusel horizontal). No pinta nada si los paquetes están
 * apagados: así puede publicarse en la app antes de activarlos.
 */
export default function PaquetesSelector({ value, onChange, onDisponibles }: Props) {
  const [paquetes, setPaquetes] = useState<Paquete[] | null>(null);
  const { width } = useWindowDimensions();
  const ancho = Math.min(width - 90, 290);
  const hueco = 12;

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
        Desliza para ver los paquetes. El extra se calcula sobre la oferta que aceptes y lo ves antes de pagar. Si el pago se devuelve, te devolvemos también el extra.
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={ancho + hueco + 6}
        decelerationRate="fast"
        contentContainerStyle={{ paddingVertical: 4, paddingRight: 8 }}
      >
        {paquetes.map((p, i) => {
          const elegido = value === p.codigo;
          const [c1, c2] = DEGRADADO[p.codigo] ?? DEGRADADO.basico;
          const conExtra = p.extra_pct > 0;
          return (
            <Pressable
              key={p.codigo}
              onPress={() => onChange(p.codigo)}
              accessibilityRole="radio"
              accessibilityState={{ selected: elegido }}
              accessibilityLabel={`Paquete ${p.nombre}. ${textoExtra(p)}`}
              style={{
                marginLeft: i === 0 ? 0 : hueco,
                padding: 3,
                borderRadius: 30,
                borderWidth: 3,
                borderColor: elegido ? colors.action : 'transparent',
              }}
            >
              <View style={{ width: ancho, height: 430, borderRadius: 24, overflow: 'hidden' }}>
                <Degradado desde={c1} hasta={c2} />
                <Formas codigo={p.codigo} />
                <View style={{ flex: 1, padding: 20, justifyContent: 'space-between' }}>
                  <View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={{ color: colors.white, fontSize: 28, fontWeight: '700' }}>{p.nombre}</Text>
                      {p.recomendado && (
                        <View style={{ backgroundColor: colors.white, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                          <Text style={{ color: '#1E44C8', fontSize: 11, fontWeight: '700' }}>Recomendado</Text>
                        </View>
                      )}
                    </View>
                    <Text style={{ color: BLANCO(0.92), fontSize: 13, lineHeight: 19, marginTop: 10 }}>{p.descripcion}</Text>
                    <View style={{ marginTop: 14, gap: 6 }}>
                      {p.servicios.map((s) => (
                        <View key={s} style={{ flexDirection: 'row', gap: 7 }}>
                          <Feather name="check" size={13} color={colors.white} style={{ marginTop: 2 }} />
                          <Text style={{ color: colors.white, fontSize: 13, flex: 1 }}>{s}</Text>
                        </View>
                      ))}
                    </View>
                  </View>

                  <View>
                    {conExtra && (
                      <Text style={{ color: BLANCO(0.85), fontSize: 11, marginBottom: 4 }}>
                        Mínimo {eur(p.extra_min_cents)} · máximo {eur(p.extra_max_cents)}
                      </Text>
                    )}
                    {p.plazo_revision_horas !== null && (
                      <Text style={{ color: BLANCO(0.85), fontSize: 11, marginBottom: 8 }}>
                        Revisión en un máximo de {p.plazo_revision_horas} h laborables
                      </Text>
                    )}
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                      <View style={{ backgroundColor: colors.white, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 }}>
                        <Text style={{ color: colors.ink, fontSize: 12.5, fontWeight: '700' }}>
                          {conExtra ? `+${String(p.extra_pct).replace('.', ',')} % de la oferta` : 'Sin extra'}
                        </Text>
                      </View>
                      <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' }}>
                        <Feather name={elegido ? 'check' : 'arrow-right'} size={17} color={elegido ? colors.action : colors.ink} />
                      </View>
                    </View>
                  </View>
                </View>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
