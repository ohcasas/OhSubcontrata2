import { useState } from 'react';
import { View, Text, Pressable, TextInput, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../design-system/tokens';
import type { Etiqueta } from '../services/etiquetas';
import IconoEtiqueta from './IconoEtiqueta';

/**
 * Cuadrícula para elegir las etiquetas de una obra al publicarla. Al final lleva
 * el botón "Crear etiqueta": se abre un cuadro para escribir el nombre y la
 * etiqueta nueva se propone al equipo de 3B, que la revisa antes de que la vean
 * los demás. Mientras tanto, quien la propone ya puede usarla en su obra.
 */
export default function SelectorEtiquetas({
  etiquetas,
  seleccion,
  maximo,
  deshabilitado,
  onAlternar,
  onProponer,
}: {
  etiquetas: Etiqueta[];
  seleccion: Set<string>;
  maximo: number;
  deshabilitado?: boolean;
  onAlternar: (id: string) => void;
  /** Debe proponer la etiqueta y devolver un texto para el usuario. Si falla, lanza un Error. */
  onProponer: (nombre: string) => Promise<string>;
}) {
  const [creando, setCreando] = useState(false);
  const [nombre, setNombre] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState<{ texto: string; ok: boolean } | null>(null);

  const proponer = async () => {
    setMensaje(null);
    if (nombre.trim().length < 3) {
      setMensaje({ texto: 'Escribe al menos 3 letras.', ok: false });
      return;
    }
    setEnviando(true);
    try {
      const texto = await onProponer(nombre.trim());
      setMensaje({ texto, ok: true });
      setNombre('');
      setCreando(false);
    } catch (e) {
      setMensaje({ texto: e instanceof Error ? e.message : 'No se ha podido crear la etiqueta.', ok: false });
    }
    setEnviando(false);
  };

  return (
    <View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5 }}>
        {etiquetas.map((e) => {
          const activa = seleccion.has(e.id);
          const enRevision = e.estado === 'propuesta';
          return (
            <Pressable
              key={e.id}
              onPress={() => onAlternar(e.id)}
              disabled={deshabilitado}
              accessibilityRole="button"
              accessibilityState={{ selected: activa }}
              accessibilityLabel={e.nombre}
              style={{ width: '33.33%', paddingHorizontal: 5, marginBottom: 12, alignItems: 'center' }}
            >
              <View style={{ width: '100%', aspectRatio: 1 }}>
                <View
                  style={{
                    flex: 1,
                    borderRadius: 22,
                    borderWidth: 2.5,
                    borderColor: activa ? colors.action : 'transparent',
                    padding: 2,
                  }}
                >
                  <IconoEtiqueta icono={e.icono} size={0} radio={18} llenar />
                </View>
                {activa && (
                  <View
                    style={{
                      position: 'absolute',
                      top: 4,
                      right: 4,
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      backgroundColor: colors.action,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Feather name="check" size={14} color={colors.white} />
                  </View>
                )}
              </View>
              <Text
                numberOfLines={2}
                className="text-ink text-[12px] font-sansMedium text-center mt-1.5"
                style={{ lineHeight: 15 }}
              >
                {e.nombre}
              </Text>
              {enRevision && <Text className="text-inkMuted text-[11px] text-center">En revisión</Text>}
            </Pressable>
          );
        })}

        <Pressable
          onPress={() => setCreando((v) => !v)}
          disabled={deshabilitado}
          accessibilityRole="button"
          accessibilityLabel="Crear etiqueta"
          style={{ width: '33.33%', paddingHorizontal: 5, marginBottom: 12, alignItems: 'center' }}
        >
          <View
            style={{
              width: '100%',
              aspectRatio: 1,
              borderRadius: 22,
              borderWidth: 2,
              borderStyle: 'dashed',
              borderColor: colors.action,
              backgroundColor: colors.actionTint,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Feather name="plus" size={30} color={colors.action} />
          </View>
          <Text className="text-action text-[12px] font-sansBold text-center mt-1.5" style={{ lineHeight: 15 }}>
            Crear etiqueta
          </Text>
        </Pressable>
      </View>

      {creando && (
        <View className="bg-surface border border-border rounded-xl p-3 mb-2">
          <Text className="text-ink text-xs font-sansSemiBold mb-1">Nombre de la etiqueta nueva</Text>
          <View className="border border-border rounded-lg px-3">
            <TextInput
              value={nombre}
              onChangeText={setNombre}
              placeholder="Ej: Aislamientos"
              placeholderTextColor={colors.inkSubtle}
              maxLength={30}
              editable={!enviando}
              autoFocus
              className="py-2.5 text-ink"
            />
          </View>
          <Text className="text-inkMuted text-[12px] mt-1.5">
            La revisa el equipo de 3B antes de que la vean los demás. Mientras tanto puedes usarla en tu obra.
          </Text>
          <View className="flex-row mt-2.5" style={{ gap: 8 }}>
            <Pressable
              onPress={proponer}
              disabled={enviando}
              className="bg-action rounded-lg px-4 py-2 flex-row items-center gap-2"
            >
              {enviando && <ActivityIndicator size="small" color={colors.white} />}
              <Text className="text-white text-xs font-sansBold">Proponer</Text>
            </Pressable>
            <Pressable onPress={() => setCreando(false)} disabled={enviando} className="px-3 py-2">
              <Text className="text-inkMuted text-xs">Cancelar</Text>
            </Pressable>
          </View>
        </View>
      )}

      {mensaje !== null && (
        <Text className={`text-xs mb-1 ${mensaje.ok ? 'text-success' : 'text-error'}`}>{mensaje.texto}</Text>
      )}
      <Text className="text-inkMuted text-[12px]">
        {seleccion.size} de {maximo} elegidas
      </Text>
    </View>
  );
}