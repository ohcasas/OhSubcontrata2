import { useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../design-system/tokens';
import { MAX_MIS_ETIQUETAS } from '../constants/etiquetas';
import { cargarEtiquetas, guardarMisEtiquetas, misEtiquetasIds, type Etiqueta } from '../services/etiquetas';
import IconoEtiqueta from './IconoEtiqueta';

/**
 * Tarjeta del perfil de los oficios: a qué se dedican. Con esto la pestaña Obras
 * puede enseñarles primero las obras de su especialidad ("Mis especialidades").
 */
export default function MisEspecialidades({ empresaId }: { empresaId: string }) {
  const [etiquetas, setEtiquetas] = useState<Etiqueta[]>([]);
  const [guardadas, setGuardadas] = useState<Set<string>>(new Set());
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<{ texto: string; ok: boolean } | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const [todas, mias] = await Promise.all([cargarEtiquetas(false), misEtiquetasIds(empresaId)]);
        if (!vivo) return;
        setEtiquetas(todas);
        setGuardadas(new Set(mias));
        setSeleccion(new Set(mias));
      } catch {
        if (vivo) setMensaje({ texto: 'No se han podido cargar las especialidades.', ok: false });
      }
      if (vivo) setCargando(false);
    })();
    return () => {
      vivo = false;
    };
  }, [empresaId]);

  const alternar = (id: string) => {
    setMensaje(null);
    if (seleccion.has(id)) {
      const nueva = new Set(seleccion);
      nueva.delete(id);
      setSeleccion(nueva);
      return;
    }
    if (seleccion.size >= MAX_MIS_ETIQUETAS) {
      setMensaje({ texto: `Puedes marcar como máximo ${MAX_MIS_ETIQUETAS}.`, ok: false });
      return;
    }
    setSeleccion(new Set(seleccion).add(id));
  };

  const cambios = seleccion.size !== guardadas.size || [...seleccion].some((id) => !guardadas.has(id));

  const guardar = async () => {
    setGuardando(true);
    setMensaje(null);
    try {
      await guardarMisEtiquetas([...seleccion]);
      setGuardadas(new Set(seleccion));
      setMensaje({ texto: 'Especialidades guardadas.', ok: true });
    } catch (e) {
      setMensaje({ texto: e instanceof Error ? e.message : 'No se han podido guardar.', ok: false });
    }
    setGuardando(false);
  };

  return (
    <View className="bg-surface rounded-2xl border border-border p-4 mt-3">
      <Text className="text-ink text-xs font-sansBold uppercase" style={{ letterSpacing: 1 }}>
        Mis especialidades
      </Text>
      <Text className="text-inkMuted text-xs mt-1 mb-3">
        Marca a qué os dedicáis (hasta {MAX_MIS_ETIQUETAS}). En Obras podrás ver primero las de tu oficio.
      </Text>

      {cargando ? (
        <ActivityIndicator color={colors.action} />
      ) : (
        <View className="flex-row flex-wrap" style={{ gap: 8 }}>
          {etiquetas.map((e) => {
            const activa = seleccion.has(e.id);
            return (
              <Pressable
                key={e.id}
                onPress={() => alternar(e.id)}
                disabled={guardando}
                accessibilityRole="button"
                accessibilityState={{ selected: activa }}
                className="flex-row items-center rounded-full border"
                style={{
                  gap: 6,
                  paddingVertical: 3,
                  paddingLeft: 3,
                  paddingRight: 12,
                  borderColor: activa ? colors.action : colors.border,
                  backgroundColor: activa ? colors.actionTint : colors.surface,
                }}
              >
                <IconoEtiqueta icono={e.icono} size={28} radio={14} />
                <Text className={`text-xs ${activa ? 'text-actionDark font-sansBold' : 'text-ink font-sansMedium'}`}>
                  {e.nombre}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {mensaje !== null && (
        <Text className={`text-xs mt-2.5 ${mensaje.ok ? 'text-success' : 'text-error'}`}>{mensaje.texto}</Text>
      )}

      {cambios && !cargando && (
        <Pressable
          onPress={guardar}
          disabled={guardando}
          className="bg-action rounded-xl py-2.5 items-center flex-row justify-center gap-2 mt-3"
        >
          {guardando ? <ActivityIndicator size="small" color={colors.white} /> : <Feather name="check" size={15} color={colors.white} />}
          <Text className="text-white font-sansBold text-sm">Guardar especialidades</Text>
        </Pressable>
      )}
    </View>
  );
}