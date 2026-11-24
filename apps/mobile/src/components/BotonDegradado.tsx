import { Pressable, Text, View, ActivityIndicator, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

type NombreIcono = ComponentProps<typeof Feather>['name'];

type Props = {
  etiqueta: string;
  onPress: () => void;
  icono?: NombreIcono;
  iconoDerecha?: NombreIcono;
  cargando?: boolean;
  deshabilitado?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * Botón principal del prediseño: píldora con degradado azul claro -> azul -> azul oscuro
 * y una sombra azul suave. Se usa para la acción principal de cada pantalla.
 */
export default function BotonDegradado({ etiqueta, onPress, icono, iconoDerecha, cargando = false, deshabilitado = false, style }: Props) {
  const apagado = deshabilitado || cargando;
  return (
    <Pressable
      onPress={onPress}
      disabled={apagado}
      accessibilityRole="button"
      accessibilityLabel={etiqueta}
      accessibilityState={{ disabled: apagado, busy: cargando }}
      style={[estilos.sombra, apagado && { opacity: 0.6 }, style]}
    >
      <LinearGradient
        colors={['#6FB6FF', '#1951FC', '#0B2CB1']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={estilos.boton}
      >
        <View style={estilos.fila}>
          {cargando ? <ActivityIndicator color="#FFFFFF" /> : icono !== undefined ? <Feather name={icono} size={17} color="#FFFFFF" /> : null}
          <Text style={estilos.texto} numberOfLines={1}>{etiqueta}</Text>
          {iconoDerecha !== undefined && !cargando && <Feather name={iconoDerecha} size={17} color="#FFFFFF" />}
        </View>
      </LinearGradient>
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  sombra: {
    borderRadius: 28,
    shadowColor: '#1951FC',
    shadowOpacity: 0.3,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  boton: { height: 52, borderRadius: 28, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  fila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  texto: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});