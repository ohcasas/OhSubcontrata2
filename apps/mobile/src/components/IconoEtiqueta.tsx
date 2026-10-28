import { View, Image } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../design-system/tokens';
import { iconoEtiqueta } from '../constants/etiquetas';

/**
 * Icono isométrico de una etiqueta sobre un fondo azul muy claro de la marca. Sin icono
 * propio muestra una etiqueta genérica.
 */
export default function IconoEtiqueta({
  icono,
  size,
  radio,
  llenar,
}: {
  icono: string | null;
  size: number;
  radio?: number;
  /** Ocupa todo el hueco del contenedor en lugar de un tamaño fijo. */
  llenar?: boolean;
}) {
  const fuente = iconoEtiqueta(icono);
  return (
    <View
      style={{
        ...(llenar === true ? { flex: 1 } : { width: size, height: size }),
        borderRadius: radio ?? Math.round(size * 0.3),
        backgroundColor: colors.actionTint,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {fuente !== null ? (
        <Image
          source={fuente}
          style={llenar === true ? { width: '88%', height: '88%' } : { width: size * 0.88, height: size * 0.88 }}
          resizeMode="contain"
        />
      ) : (
        <Feather name="tag" size={Math.round(size * 0.42)} color={colors.action} />
      )}
    </View>
  );
}