import { View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { colors } from '../design-system/tokens';

type NombreIcono = ComponentProps<typeof Feather>['name'];

type Props = {
  height?: number;
  icon?: NombreIcono;
  rounded?: 'top' | 'all';
};

/**
 * Banner de sustitución para obras sin foto real todavía (el catálogo de
 * imágenes es una fase pendiente — ver informe técnico). Navy + icono en
 * vez de un <Image> roto o un hueco en blanco.
 */
export default function ObraImagePlaceholder({ height = 96, icon = 'home', rounded = 'top' }: Props) {
  return (
    <View
      className={`bg-primary items-center justify-center ${
        rounded === 'top' ? 'rounded-t-2xl' : 'rounded-2xl'
      }`}
      style={{ height }}
    >
      <Feather name={icon} size={Math.round(height * 0.32)} color={colors.tertiaryLight} />
    </View>
  );
}
