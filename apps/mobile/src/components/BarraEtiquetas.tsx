import { ScrollView, Pressable, Text, View } from 'react-native';
import { colors } from '../design-system/tokens';
import type { Etiqueta } from '../services/etiquetas';
import IconoEtiqueta from './IconoEtiqueta';

/**
 * Fila de iconos para filtrar por oficio, como las categorías de Uber Eats.
 * Se desliza en horizontal; tocar un icono lo marca o lo desmarca.
 */
export default function BarraEtiquetas({
  etiquetas,
  seleccion,
  onAlternar,
}: {
  etiquetas: Etiqueta[];
  seleccion: Set<string>;
  onAlternar: (id: string) => void;
}) {
  if (etiquetas.length === 0) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingVertical: 4, paddingHorizontal: 2, gap: 6 }}
    >
      {etiquetas.map((e) => {
        const activa = seleccion.has(e.id);
        return (
          <Pressable
            key={e.id}
            onPress={() => onAlternar(e.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: activa }}
            accessibilityLabel={e.nombre}
            style={{ width: 92, alignItems: 'center' }}
          >
            <View
              style={{
                borderRadius: 24,
                borderWidth: 2,
                borderColor: activa ? colors.action : 'transparent',
                padding: 2,
              }}
            >
              <IconoEtiqueta icono={e.icono} size={64} radio={20} />
            </View>
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
              className={`text-[12px] text-center mt-1.5 ${activa ? 'text-action font-sansBold' : 'text-ink font-sansMedium'}`}
              style={{ lineHeight: 15 }}
            >
              {e.nombre}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}