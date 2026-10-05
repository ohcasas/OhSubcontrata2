import { View, Text, TextInput, Pressable, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../design-system/tokens';

export type OpcionFiltro = { clave: string; etiqueta: string };

type Props = {
  busqueda: string;
  onBusqueda: (texto: string) => void;
  placeholder: string;
  opciones?: OpcionFiltro[];
  seleccion?: string;
  onSeleccion?: (clave: string) => void;
  /** Solo las píldoras de filtro, sin la caja de texto. */
  sinBusqueda?: boolean;
};

/** Caja de búsqueda + fila de filtros en forma de píldora (opcional). */
export default function BuscadorFiltros({
  busqueda,
  onBusqueda,
  placeholder,
  opciones,
  seleccion,
  onSeleccion,
  sinBusqueda = false,
}: Props) {
  return (
    <View className="mb-3">
      {!sinBusqueda && (
      <View className="flex-row items-center bg-surface border border-border rounded-xl px-3">
        <Feather name="search" size={15} color={colors.inkSubtle} />
        <TextInput
          value={busqueda}
          onChangeText={onBusqueda}
          placeholder={placeholder}
          placeholderTextColor={colors.inkSubtle}
          autoCapitalize="none"
          autoCorrect={false}
          className="flex-1 py-2.5 pl-2.5 text-ink"
        />
        {busqueda !== '' && (
          <Pressable onPress={() => onBusqueda('')} hitSlop={8}>
            <Feather name="x" size={15} color={colors.inkMuted} />
          </Pressable>
        )}
      </View>
      )}

      {opciones !== undefined && onSeleccion !== undefined && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className={sinBusqueda ? '' : 'mt-2.5'}>
          <View className="flex-row" style={{ gap: 6 }}>
            {opciones.map((op) => {
              const activa = seleccion === op.clave;
              return (
                <Pressable
                  key={op.clave}
                  onPress={() => onSeleccion(op.clave)}
                  className={`rounded-full px-3.5 py-1.5 border ${activa ? 'bg-ink border-ink' : 'bg-surface border-border'}`}
                >
                  <Text className={`text-xs font-sansSemiBold ${activa ? 'text-white' : 'text-ink'}`}>{op.etiqueta}</Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      )}
    </View>
  );
}