import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { ComponentProps } from 'react';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type NombreIcono = ComponentProps<typeof Feather>['name'];

type Props = BottomTabBarProps & {
  /** Icono Feather de cada pestaña, por nombre de ruta. */
  icons: Record<string, NombreIcono>;
  /** Se mantienen por compatibilidad con quien llama; el estilo cristal fija sus propios colores. */
  barColor?: string;
  activeColor?: string;
  inactiveColor?: string;
  /** Número (p. ej. mensajes sin leer) que se muestra en un globo sobre la pestaña, por nombre de ruta. */
  badges?: Record<string, number>;
};

const ETIQUETAS: Record<string, string> = {
  Tablon: 'Tablón',
  Catalogo: 'Catálogo',
  Recomienda: 'Recomienda',
  Postulaciones: 'Postulaciones',
  ObrasAdmin: 'Obras',
  PostulacionesAdmin: 'Postulaciones',
  RecompensasAdmin: 'Recompensas',
  PerfilAdmin: 'Perfil',
  MiCandidatura: 'Candidatura',
  MensajesCandidato: 'Mensajes',
  MisDatos: 'Mis datos',
};

/**
 * Barra inferior de cristal, fiel al prediseño: píldora clara translúcida con
 * los iconos en gris y, en la pestaña activa, una píldora azul en degradado con
 * el icono y el nombre.
 */
export default function AnimatedTabBar({ state, navigation, icons, inactiveColor = '#5B6E84', badges }: Props) {
  const insets = useSafeAreaInsets();
  const muchas = state.routes.length >= 5;

  return (
    <View style={{ paddingHorizontal: 16, paddingBottom: Math.max(insets.bottom, 12), paddingTop: 4, backgroundColor: '#F2F7FF' }}>
      <View style={estilos.barra}>
        {state.routes.map((route, index) => {
          const enfocado = state.index === index;
          const icono = icons[route.name] ?? 'circle';
          const etiqueta = ETIQUETAS[route.name] ?? route.name;
          const aviso = badges?.[route.name] ?? 0;

          const onPress = () => {
            const evento = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!enfocado && !evento.defaultPrevented) navigation.navigate(route.name);
          };

          if (enfocado) {
            return (
              <Pressable key={route.key} onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: true }} style={{ flexShrink: 1 }}>
                <LinearGradient
                  colors={['#6FB6FF', '#1951FC', '#0B2CB1']}
                  start={{ x: 0.1, y: 0 }}
                  end={{ x: 0.9, y: 1 }}
                  style={[estilos.activa, { paddingHorizontal: muchas ? 13 : 18 }]}
                >
                  <Feather name={icono} size={20} color="#FFFFFF" />
                  <Text numberOfLines={1} style={estilos.textoActiva}>{etiqueta}</Text>
                </LinearGradient>
              </Pressable>
            );
          }

          return (
            <Pressable key={route.key} onPress={onPress} accessibilityRole="button" accessibilityLabel={etiqueta} style={[estilos.inactiva, muchas && { width: 38 }]}>
              <Feather name={icono} size={22} color={inactiveColor} />
              {aviso > 0 && (
                <View pointerEvents="none" style={estilos.globo}>
                  <Text style={estilos.globoTexto}>{aviso > 99 ? '99+' : aviso}</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  barra: {
    flexDirection: 'row',
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
    shadowColor: '#1951FC',
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  inactiva: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  activa: { height: 48, borderRadius: 24, flexDirection: 'row', alignItems: 'center', gap: 7 },
  textoActiva: { color: '#FFFFFF', fontSize: 14, fontWeight: '700', flexShrink: 1 },
  globo: {
    position: 'absolute',
    top: 2,
    right: 0,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    backgroundColor: '#B33A3A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  globoTexto: { color: '#ffffff', fontSize: 11, fontWeight: '700' },
});