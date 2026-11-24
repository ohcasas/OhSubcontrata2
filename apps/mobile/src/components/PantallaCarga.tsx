/**
 * Pantalla de carga de 3B Conecta, estilo cristal del rediseño: degradado azul,
 * anillos concéntricos, el logo en una tarjeta de cristal y el nombre debajo.
 *
 * Por qué es un componente y no la pantalla de carga "normal": desde Android 12
 * la pantalla de carga NATIVA solo puede ser un icono sobre un color liso. Así que
 * la nativa se deja de un azul liso y vacía (ver app.config.ts) y, en cuanto
 * arranca la app, esta pantalla se funde por encima con la composición completa.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Image, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as SplashScreen from 'expo-splash-screen';

/** Lo mínimo que se ve el logo, contado desde que aparece (ms). */
const MINIMO_VISIBLE_MS = 1400;
const FUNDIDO_ENTRADA_MS = 500;
const FUNDIDO_SALIDA_MS = 400;
/** Por si algo fallara: la pantalla nativa nunca se queda puesta más de esto (ms). */
const SEGURIDAD_MS = 5000;

type Props = {
  /** true cuando la app ya puede enseñarse (fuentes cargadas). */
  listo: boolean;
  onTerminada: () => void;
};

export default function PantallaCarga({ listo, onTerminada }: Props) {
  const arte = useRef(new Animated.Value(0)).current;
  const pantalla = useRef(new Animated.Value(1)).current;
  const [apareceEn, setApareceEn] = useState<number | null>(null);

  const terminadaRef = useRef(onTerminada);
  terminadaRef.current = onTerminada;

  const alMaquetar = useCallback(() => {
    if (apareceEn !== null) return;
    setApareceEn(Date.now());
    SplashScreen.hideAsync().catch(() => {});
    Animated.timing(arte, { toValue: 1, duration: FUNDIDO_ENTRADA_MS, useNativeDriver: true }).start();
  }, [apareceEn, arte]);

  useEffect(() => {
    if (!listo || apareceEn === null) return;
    const espera = Math.max(0, MINIMO_VISIBLE_MS - (Date.now() - apareceEn));
    const temporizador = setTimeout(() => {
      Animated.timing(pantalla, { toValue: 0, duration: FUNDIDO_SALIDA_MS, useNativeDriver: true }).start(() =>
        terminadaRef.current(),
      );
    }, espera);
    return () => clearTimeout(temporizador);
  }, [listo, apareceEn, pantalla]);

  useEffect(() => {
    const seguro = setTimeout(() => SplashScreen.hideAsync().catch(() => {}), SEGURIDAD_MS);
    return () => clearTimeout(seguro);
  }, []);

  return (
    <Animated.View style={[StyleSheet.absoluteFill, estilos.contenedor, { opacity: pantalla }]} onLayout={alMaquetar}>
      <LinearGradient
        colors={['#8FD0FF', '#3781FC', '#1951FC', '#0B2CB1']}
        locations={[0, 0.3, 0.65, 1]}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.7, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Animated.View style={[StyleSheet.absoluteFill, estilos.centro, { opacity: arte }]}>
        {[220, 340, 460, 580].map((d) => (
          <View key={d} style={{ position: 'absolute', width: d, height: d, borderRadius: d, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.22)' }} />
        ))}
        <View style={estilos.tarjeta}>
          <LinearGradient
            colors={['rgba(255,255,255,0.45)', 'rgba(255,255,255,0.12)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <Image source={require('../../assets/branding/logo-3b-simbolo-blanco.png')} style={{ width: 92, height: 52 }} resizeMode="contain" />
        </View>
        <Text style={estilos.nombre}>3B CONECTA</Text>
      </Animated.View>
    </Animated.View>
  );
}

const estilos = StyleSheet.create({
  // elevation: en Android, un elemento con más elevación se pinta por encima
  // aunque vaya antes en el árbol (la barra de pestañas tiene sombra).
  contenedor: { backgroundColor: '#1951FC', zIndex: 100, elevation: 100 },
  centro: { alignItems: 'center', justifyContent: 'center' },
  tarjeta: {
    width: 150,
    height: 150,
    borderRadius: 44,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
  },
  nombre: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', letterSpacing: 4, marginTop: 22 },
});