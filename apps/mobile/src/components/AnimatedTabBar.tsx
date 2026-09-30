import { useEffect, useRef } from 'react';
import { View, Pressable, Animated, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type NombreIcono = ComponentProps<typeof Feather>['name'];

type Props = BottomTabBarProps & {
  /** Icono Feather de cada pestaña, por nombre de ruta. */
  icons: Record<string, NombreIcono>;
  /** Color de fondo de la barra (pensada para ser oscura, tipo píldora). */
  barColor: string;
  /** Color de la burbuja de la pestaña activa. */
  activeColor: string;
  /** Color del icono cuando la pestaña está inactiva. */
  inactiveColor?: string;
};

const ALTURA_BARRA = 64;
const DIAMETRO_BURBUJA = 52;

/**
 * Barra de navegación inferior con la pestaña activa "flotando" en una
 * burbuja de color por encima de la barra (basada en el diseño de
 * referencia en Figma que pasó Ainhoa: "Mobile Navigation Menu Bar UI
 * Template"). Las pestañas inactivas se quedan como icono simple de
 * contorno, dentro de la barra oscura.
 *
 * Usa Animated (núcleo de React Native), no Reanimated: el proyecto ya
 * tenía react-native-reanimated como dependencia pero sin el plugin de
 * Babel configurado ni ningún uso real — añadirlo ahora habría sido meterse
 * en configuración de babel/New Architecture sin necesidad, cuando esta
 * animación (opacidad + traslación + escala) la cubre de sobra el
 * Animated de siempre, sin tocar nada más del proyecto.
 */
export default function AnimatedTabBar({
  state,
  navigation,
  icons,
  barColor,
  activeColor,
  inactiveColor = 'rgba(255,255,255,0.72)',
}: Props) {
  const insets = useSafeAreaInsets();
  const progresos = useRef(
    state.routes.map((_, i) => new Animated.Value(i === state.index ? 1 : 0)),
  ).current;

  useEffect(() => {
    state.routes.forEach((_, i) => {
      Animated.spring(progresos[i], {
        toValue: i === state.index ? 1 : 0,
        useNativeDriver: true,
        friction: 7,
        tension: 90,
      }).start();
    });
  }, [state.index]);

  return (
    <View style={{ paddingHorizontal: 16, paddingBottom: Math.max(insets.bottom, 12) }}>
      <View style={[styles.barra, { backgroundColor: barColor }]}>
        {state.routes.map((route, index) => {
          const enfocado = state.index === index;
          const progreso = progresos[index];
          const nombreIcono = icons[route.name] ?? 'circle';

          const traslacionBurbuja = progreso.interpolate({
            inputRange: [0, 1],
            outputRange: [14, -16],
          });
          const escalaBurbuja = progreso.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });
          const opacidadIcono = progreso.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

          const onPress = () => {
            const evento = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!enfocado && !evento.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              accessibilityRole="button"
              accessibilityState={enfocado ? { selected: true } : {}}
              style={styles.tab}
            >
              <Animated.View style={{ opacity: opacidadIcono }}>
                <Feather name={nombreIcono} size={22} color={inactiveColor} />
              </Animated.View>
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.burbuja,
                  {
                    backgroundColor: activeColor,
                    opacity: progreso,
                    transform: [{ translateY: traslacionBurbuja }, { scale: escalaBurbuja }],
                  },
                ]}
              >
                <Feather name={nombreIcono} size={23} color="#ffffff" />
              </Animated.View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  barra: {
    flexDirection: 'row',
    height: ALTURA_BARRA,
    borderRadius: ALTURA_BARRA / 2,
    alignItems: 'center',
    justifyContent: 'space-around',
    // shadow.nav de la guía de estilo del rediseño
    shadowColor: '#0B1F35',
    shadowOpacity: 0.16,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  tab: {
    flex: 1,
    height: ALTURA_BARRA,
    alignItems: 'center',
    justifyContent: 'center',
  },
  burbuja: {
    position: 'absolute',
    width: DIAMETRO_BURBUJA,
    height: DIAMETRO_BURBUJA,
    borderRadius: DIAMETRO_BURBUJA / 2,
    alignItems: 'center',
    justifyContent: 'center',
    // shadow.active de la guía de estilo del rediseño
    shadowColor: '#0057FF',
    shadowOpacity: 0.24,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
});