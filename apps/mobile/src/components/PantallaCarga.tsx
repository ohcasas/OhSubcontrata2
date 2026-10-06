/**
 * Pantalla de carga con el logo de OH Conecta y los dibujos arquitectónicos.
 *
 * Por qué es un componente y no la pantalla de carga "normal": desde Android 12
 * la pantalla de carga NATIVA solo puede ser un icono pequeño sobre un color
 * liso; no admite una imagen a pantalla completa. Así que la nativa se deja en
 * negro y vacía (ver app.config.ts) y, en cuanto arranca la app, esta pantalla
 * se funde por encima con la composición completa. Para quien usa la app es
 * una única pantalla de carga: negro, el logo aparece, y se va hacia el Login.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet } from 'react-native';
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

  // Se guarda la última función recibida para no reiniciar el temporizador si
  // quien nos usa vuelve a pintarse.
  const terminadaRef = useRef(onTerminada);
  terminadaRef.current = onTerminada;

  // Cuando esta pantalla ya está dibujada: se quita la nativa (negra) y el logo se funde.
  const alMaquetar = useCallback(() => {
    if (apareceEn !== null) return;
    setApareceEn(Date.now());
    SplashScreen.hideAsync().catch(() => {});
    Animated.timing(arte, { toValue: 1, duration: FUNDIDO_ENTRADA_MS, useNativeDriver: true }).start();
  }, [apareceEn, arte]);

  // Cuando la app está lista Y el logo lleva el tiempo mínimo a la vista: fundido de salida.
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
      <Animated.Image
        source={require('../../assets/branding/splash-conecta.png')}
        resizeMode="cover"
        style={[StyleSheet.absoluteFill, { opacity: arte }]}
      />
    </Animated.View>
  );
}

const estilos = StyleSheet.create({
  // elevation: en Android, un elemento con más elevación se pinta por encima
  // aunque vaya antes en el árbol (la barra de pestañas tiene sombra).
  contenedor: { backgroundColor: '#000000', zIndex: 100, elevation: 100 },
});