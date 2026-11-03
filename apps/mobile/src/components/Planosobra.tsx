import { useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Linking, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../services/supabase';
import { obtenerUrlFirmada } from '../services/storage';
import { colors } from '../design-system/tokens';

type Plano = { id: string; nombre: string; archivo_path: string; tamano_bytes: number | null };

const BUCKET_PLANOS = 'obras-planos';

function tamano(bytes: number | null): string {
  if (bytes === null || bytes <= 0) return '';
  return bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Planos en PDF de una obra, subidos por el equipo de 3B desde el panel. Solo aparece si la obra tiene planos.
 * El PDF se abre con un enlace temporal (el almacén es privado).
 */
export default function PlanosObra({ obraId }: { obraId: string }) {
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [abriendo, setAbriendo] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    supabase
      .from('obras_planos')
      .select('id, nombre, archivo_path, tamano_bytes')
      .eq('obra_id', obraId)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (vigente) setPlanos((data as Plano[] | null) ?? []);
      });
    return () => {
      vigente = false;
    };
  }, [obraId]);

  if (planos.length === 0) return null;

  const abrir = async (p: Plano) => {
    setAbriendo(p.id);
    try {
      const url = await obtenerUrlFirmada(BUCKET_PLANOS, p.archivo_path, 600);
      await Linking.openURL(url);
    } catch {
      Alert.alert('Planos', 'No se ha podido abrir el plano. Inténtalo de nuevo en un momento.');
    } finally {
      setAbriendo(null);
    }
  };

  return (
    <View className="bg-surface rounded-2xl border border-border p-4 mt-3">
      <Text className="text-ink text-xs font-sansBold uppercase mb-2" style={{ letterSpacing: 1 }}>
        Planos
      </Text>
      {planos.map((p, i) => (
        <Pressable
          key={p.id}
          onPress={() => abrir(p)}
          disabled={abriendo !== null}
          accessibilityLabel={`Abrir el plano ${p.nombre}`}
          className={`flex-row items-center gap-3 py-3 ${i > 0 ? 'border-t border-border' : ''}`}
        >
          <View className="w-10 h-10 rounded-xl bg-errorTint items-center justify-center">
            <Feather name="file-text" size={20} color={colors.error} />
          </View>
          <View className="flex-1">
            <Text className="text-ink text-sm font-sansSemiBold" numberOfLines={2}>
              {p.nombre}
            </Text>
            <Text className="text-inkMuted text-xs">PDF{tamano(p.tamano_bytes) !== '' ? ` · ${tamano(p.tamano_bytes)}` : ''}</Text>
          </View>
          {abriendo === p.id ? (
            <ActivityIndicator color={colors.action} />
          ) : (
            <Feather name="external-link" size={18} color={colors.action} />
          )}
        </Pressable>
      ))}
    </View>
  );
}