/**
 * Tarjeta "de cristal" del perfil: degradado azul, luces suaves, reflejo
 * diagonal y un dibujo de línea de fondo. La primera de cada perfil es el
 * carnet 3B (con chip). NO es una tarjeta de pago: solo identifica la cuenta.
 */
import { View, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

type NombreIcono = ComponentProps<typeof Feather>['name'];
type Gama = 'azul' | 'noche' | 'cielo';
type Dibujo = 'ondas' | 'planos' | 'arcos';
type Degradado = readonly [string, string, string];

const DEGRADADOS: Record<Gama, Degradado> = {
  azul: ['#6fb6ff', '#1951fc', '#0b2cb1'],
  noche: ['#2a5cff', '#0b2cb1', '#06185f'],
  cielo: ['#bfe6ff', '#5aa9ff', '#2a6bff'],
};
const LUCES: Record<Gama, [string, string]> = {
  azul: ['rgba(255,255,255,0.55)', 'rgba(150,110,255,0.45)'],
  noche: ['rgba(120,170,255,0.45)', 'rgba(110,70,255,0.50)'],
  cielo: ['rgba(255,255,255,0.65)', 'rgba(255,170,225,0.40)'],
};

export const ANCHO_TARJETA = 220;
export const ALTO_TARJETA = 138;

function Luz({ color, tamano, style }: { color: string; tamano: number; style: object }) {
  // Sin desenfoque nativo: tres círculos concéntricos cada vez más tenues dan el efecto de luz suave.
  return (
    <View pointerEvents="none" style={[{ position: 'absolute', width: tamano, height: tamano }, style]}>
      {[1, 0.72, 0.44].map((f, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: (tamano * (1 - f)) / 2,
            top: (tamano * (1 - f)) / 2,
            width: tamano * f,
            height: tamano * f,
            borderRadius: tamano,
            backgroundColor: color,
            opacity: 0.35,
          }}
        />
      ))}
    </View>
  );
}

function DibujoFondo({ tipo }: { tipo: Dibujo }) {
  const linea = 'rgba(255,255,255,0.28)';
  if (tipo === 'ondas') {
    return (
      <View pointerEvents="none" style={{ position: 'absolute', right: -60, bottom: -70, width: 200, height: 200 }}>
        {[60, 110, 160, 210].map((d) => (
          <View
            key={d}
            style={{
              position: 'absolute',
              right: 100 - d / 2,
              bottom: 100 - d / 2,
              width: d,
              height: d,
              borderRadius: d,
              borderWidth: 1.3,
              borderColor: linea,
            }}
          />
        ))}
      </View>
    );
  }
  if (tipo === 'planos') {
    return (
      <View pointerEvents="none" style={{ position: 'absolute', inset: 0 } as object}>
        {[70, 100].map((y) => (
          <View key={y} style={{ position: 'absolute', left: 0, right: 0, top: y, height: 1, backgroundColor: 'rgba(255,255,255,0.14)' }} />
        ))}
        {[60, 130].map((x) => (
          <View key={x} style={{ position: 'absolute', top: 0, bottom: 0, left: x, width: 1, backgroundColor: 'rgba(255,255,255,0.14)' }} />
        ))}
        <View style={{ position: 'absolute', right: 22, bottom: 20, width: 64, height: 40, borderWidth: 1.2, borderColor: linea, borderRadius: 3 }} />
        <View style={{ position: 'absolute', right: 40, bottom: 20, width: 24, height: 24, borderWidth: 1.2, borderColor: linea, borderBottomWidth: 0 }} />
      </View>
    );
  }
  return (
    <View pointerEvents="none" style={{ position: 'absolute', inset: 0 } as object}>
      {[0, 22, 44].map((o) => (
        <View
          key={o}
          style={{
            position: 'absolute',
            left: -60,
            top: 40 + o,
            width: 340,
            height: 150,
            borderRadius: 170,
            borderWidth: 1.4,
            borderColor: linea,
            transform: [{ rotate: '-12deg' }],
          }}
        />
      ))}
    </View>
  );
}

export type DatosTarjeta = {
  icono: NombreIcono;
  titulo: string;
  valor: string;
  subtitulo: string;
  dibujo?: Dibujo;
  gama?: Gama;
  chip?: boolean;
};

export default function TarjetaCristal({ icono, titulo, valor, subtitulo, dibujo = 'ondas', gama = 'azul', chip = false }: DatosTarjeta) {
  const luces = LUCES[gama];
  return (
    <View
      style={{
        width: ANCHO_TARJETA,
        height: ALTO_TARJETA,
        borderRadius: 24,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.55)',
        shadowColor: '#031959',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.35,
        shadowRadius: 16,
        elevation: 8,
      }}
    >
      <LinearGradient colors={DEGRADADOS[gama]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1, padding: 14, paddingHorizontal: 16 }}>
        <Luz color={luces[0]} tamano={170} style={{ right: -50, top: -60 }} />
        <Luz color={luces[1]} tamano={190} style={{ left: -60, bottom: -80 }} />
        <DibujoFondo tipo={dibujo} />
        {/* reflejo diagonal */}
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.30)', 'rgba(255,255,255,0.05)', 'rgba(255,255,255,0)']}
          locations={[0.25, 0.42, 0.55, 0.65]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0.7 }}
          style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
        />
        {/* sombra inferior para que el texto se lea */}
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(3,15,70,0)', 'rgba(3,15,70,0.40)']}
          start={{ x: 0, y: 0.45 }}
          end={{ x: 0, y: 1 }}
          style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
        />
        {/* borde de luz superior */}
        <View pointerEvents="none" style={{ position: 'absolute', left: 14, right: 14, top: 0, height: 1.5, backgroundColor: 'rgba(255,255,255,0.8)' }} />

        <View className="flex-row justify-between items-center">
          <Text className="text-white text-[13px] font-sansBold">{titulo}</Text>
          <Feather name={icono} size={20} color="#FFFFFF" />
        </View>
        {chip && (
          <View
            style={{
              width: 38,
              height: 28,
              borderRadius: 7,
              backgroundColor: '#E6C673',
              marginTop: 10,
              borderWidth: 1,
              borderColor: 'rgba(90,60,0,0.35)',
            }}
          >
            <View style={{ position: 'absolute', left: 18, top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(90,60,0,0.35)' }} />
            <View style={{ position: 'absolute', top: 12, left: 0, right: 0, height: 1, backgroundColor: 'rgba(90,60,0,0.35)' }} />
          </View>
        )}
        <View style={{ position: 'absolute', left: 16, right: 16, bottom: 13 }}>
          <Text
            numberOfLines={1}
            className="text-white font-sansBold"
            style={{ fontSize: chip ? 16 : 23, textShadowColor: 'rgba(3,15,70,0.45)', textShadowRadius: 6 }}
          >
            {valor}
          </Text>
          <Text numberOfLines={1} className="text-[12px] mt-0.5" style={{ color: '#E8F4FF' }}>
            {subtitulo}
          </Text>
        </View>
      </LinearGradient>
    </View>
  );
}