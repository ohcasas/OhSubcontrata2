import { View, Text, TextInput, Pressable } from 'react-native';
import { colors } from '../design-system/tokens';
import type { CampoRegistro } from '../services/catalogoRegistro';

type Props = {
  campos: CampoRegistro[];
  valores: Record<string, string>;
  errores: Record<string, string>;
  onCambio: (clave: string, valor: string) => void;
  deshabilitado?: boolean;
};

/** Pinta los campos propios de un perfil (texto o selección) a partir de su definición en la base de datos. */
export default function CamposDinamicos({ campos, valores, errores, onCambio, deshabilitado = false }: Props) {
  return (
    <View>
      {campos.map((c) => (
        <View key={c.clave} className="mb-3">
          <Text className="text-ink text-xs font-sansSemiBold mb-1">
            {c.etiqueta}
            {c.obligatorio ? ' *' : ''}
          </Text>

          {c.tipo === 'seleccion' ? (
            <View className="flex-row flex-wrap" style={{ gap: 6 }}>
              {(c.opciones ?? []).map((opcion) => {
                const activa = valores[c.clave] === opcion;
                return (
                  <Pressable
                    key={opcion}
                    disabled={deshabilitado}
                    // Pulsar la opción ya elegida la quita (en los campos opcionales)
                    onPress={() => onCambio(c.clave, activa && !c.obligatorio ? '' : opcion)}
                    className={`rounded-full px-3.5 py-2 border ${activa ? 'bg-ink border-ink' : 'bg-surface border-border'}`}
                  >
                    <Text className={`text-xs font-sansSemiBold ${activa ? 'text-white' : 'text-ink'}`}>{opcion}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <View className="bg-surface border border-border rounded-xl px-3">
              <TextInput
                value={valores[c.clave] ?? ''}
                onChangeText={(t) => onCambio(c.clave, t)}
                placeholder={c.placeholder ?? undefined}
                placeholderTextColor={colors.inkSubtle}
                editable={!deshabilitado}
                autoCapitalize={c.clave === 'cif' ? 'characters' : 'none'}
                autoCorrect={false}
                keyboardType={c.clave === 'web' ? 'url' : 'default'}
                className="py-3 text-ink"
              />
            </View>
          )}

          {c.ayuda !== null && errores[c.clave] === undefined && (
            <Text className="text-inkMuted text-[11px] mt-1">{c.ayuda}</Text>
          )}
          {errores[c.clave] !== undefined && <Text className="text-error text-xs mt-1">{errores[c.clave]}</Text>}
        </View>
      ))}
    </View>
  );
}