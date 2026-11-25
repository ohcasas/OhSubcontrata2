import { Image, StyleSheet, View } from 'react-native';

/**
 * Fondo de las pantallas de acceso (inicio de sesión y crear cuenta):
 * imagen azul con degradado de luz. Se coloca como primer hijo de la pantalla
 * y no recibe toques. Los textos que quedan sobre la zona oscura van en blanco
 * y los que quedan sobre la zona clara van dentro de una píldora blanca.
 */
export default function FondoAuth() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Image
        source={require('../../../assets/branding/fondo-acceso.jpg')}
        resizeMode="cover"
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}