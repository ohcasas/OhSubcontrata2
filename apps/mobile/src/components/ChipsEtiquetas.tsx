import { View, Text } from 'react-native';
import { colors } from '../design-system/tokens';
import type { Etiqueta } from '../services/etiquetas';
import IconoEtiqueta from './IconoEtiqueta';

/** Las etiquetas de una obra, en pequeño, para las tarjetas. */
export default function ChipsEtiquetas({ etiquetas }: { etiquetas: Etiqueta[] | undefined }) {
  if (!etiquetas || etiquetas.length === 0) return null;
  return (
    <View className="flex-row flex-wrap" style={{ gap: 6 }}>
      {etiquetas.map((e) => (
        <View
          key={e.id}
          className="flex-row items-center rounded-full"
          style={{ backgroundColor: colors.actionTint, paddingVertical: 2, paddingLeft: 2, paddingRight: 10, gap: 6 }}
        >
          <IconoEtiqueta icono={e.icono} size={22} radio={11} />
          <Text className="text-actionDark text-[12px] font-sansMedium">{e.nombre}</Text>
        </View>
      ))}
    </View>
  );
}