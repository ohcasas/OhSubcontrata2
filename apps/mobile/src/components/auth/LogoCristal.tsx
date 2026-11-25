import { Image, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

type Props = { tamano?: number };

/** Círculo degradado con el símbolo 3B en blanco y un brillo de cristal arriba. */
export default function LogoCristal({ tamano = 72 }: Props) {
  const interior = Math.round(tamano * 0.52);
  return (
    <View
      style={[
        estilos.sombra,
        { width: tamano, height: tamano, borderRadius: tamano / 2, marginBottom: 14 },
      ]}
      accessibilityRole="image"
      accessibilityLabel="3B Conecta"
    >
      <LinearGradient
        colors={['#6FB6FF', '#1951FC', '#0B2CB1']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[estilos.circulo, { borderRadius: tamano / 2 }]}
      >
        <View
          style={{
            position: 'absolute',
            top: 5,
            left: tamano * 0.14,
            width: tamano * 0.72,
            height: tamano * 0.36,
            borderRadius: tamano,
            backgroundColor: 'rgba(255,255,255,0.22)',
          }}
        />
        <Image
          source={require('../../../assets/branding/logo-3b-simbolo-blanco.png')}
          resizeMode="contain"
          style={{ width: interior, height: interior }}
        />
      </LinearGradient>
    </View>
  );
}

const estilos = StyleSheet.create({
  sombra: {
    shadowColor: '#1951FC',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  circulo: { flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});