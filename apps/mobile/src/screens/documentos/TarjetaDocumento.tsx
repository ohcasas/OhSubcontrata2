import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../../design-system/tokens';
import type { DocumentoApp, EstadoReal } from '../../services/documentos';

const ESTILO_ESTADO: Record<EstadoReal, { fondo: string; texto: string; etiqueta: string }> = {
  faltante: { fondo: 'bg-warningTint', texto: 'text-warning', etiqueta: 'Falta' },
  pendiente: { fondo: 'bg-actionTint', texto: 'text-action', etiqueta: 'En revisión' },
  rechazado: { fondo: 'bg-errorTint', texto: 'text-error', etiqueta: 'Rechazado' },
  vigente: { fondo: 'bg-successTint', texto: 'text-success', etiqueta: 'Vigente' },
  por_caducar: { fondo: 'bg-warningTint', texto: 'text-warning', etiqueta: 'Caduca pronto' },
  caducado: { fondo: 'bg-errorTint', texto: 'text-error', etiqueta: 'Caducado' },
};

/** 2026-10-13 -> 13/10/2026 (sin pasar por Date, para que no cambie de día según la zona horaria) */
export function formatearFecha(iso: string | null): string {
  if (iso === null) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function textoCaducidad(doc: DocumentoApp): string | null {
  if (doc.caduca_en === null || doc.dias_restantes === null) return null;
  const fecha = formatearFecha(doc.caduca_en);
  const dias = doc.dias_restantes;
  if (dias < 0) return `Caducó el ${fecha} (hace ${-dias} ${-dias === 1 ? 'día' : 'días'})`;
  if (dias === 0) return `Caduca hoy (${fecha})`;
  if (dias === 1) return `Caduca mañana (${fecha})`;
  return `Caduca el ${fecha} (en ${dias} días)`;
}

function textoBoton(doc: DocumentoApp): string {
  switch (doc.estado_real) {
    case 'faltante':
      return 'Subir documento';
    case 'rechazado':
      return 'Subir de nuevo';
    case 'caducado':
      return 'Subir uno nuevo';
    case 'por_caducar':
      return 'Renovar';
    default:
      return 'Cambiar archivo';
  }
}

type Props = {
  doc: DocumentoApp;
  subiendo: boolean;
  /** Hay otra subida en curso: se bloquean los botones */
  ocupado: boolean;
  onSubir: (doc: DocumentoApp) => void;
  onVer: (ruta: string) => void;
};

export default function TarjetaDocumento({ doc, subiendo, ocupado, onSubir, onVer }: Props) {
  const estilo = ESTILO_ESTADO[doc.estado_real];
  const caducidad = doc.estado === 'aprobado' ? textoCaducidad(doc) : null;
  const urgente = doc.estado_real === 'caducado' || doc.estado_real === 'por_caducar';
  const destacado = doc.estado_real === 'faltante' || doc.estado_real === 'rechazado' || urgente;

  return (
    <View className="bg-surface rounded-xl border border-border p-3.5">
      <View className="flex-row justify-between items-start">
        <Text className="text-ink text-sm font-sansBold flex-1 pr-2">
          {doc.etiqueta}
          {doc.obligatorio ? ' *' : ''}
        </Text>
        <View className={`rounded-md px-2 py-0.5 ${estilo.fondo}`}>
          <Text className={`text-[11px] font-sansBold ${estilo.texto}`}>{estilo.etiqueta}</Text>
        </View>
      </View>

      {doc.descripcion !== null && <Text className="text-inkMuted text-xs mt-1">{doc.descripcion}</Text>}

      {caducidad !== null && (
        <View className="flex-row items-center gap-1.5 mt-2">
          <Feather name="calendar" size={13} color={urgente ? colors.warning : colors.inkMuted} />
          <Text className={`text-xs font-sansSemiBold ${doc.estado_real === 'caducado' ? 'text-error' : urgente ? 'text-warning' : 'text-inkMuted'}`}>
            {caducidad}
          </Text>
        </View>
      )}

      {doc.nombre_archivo !== null && (
        <Text className="text-inkMuted text-xs mt-1.5" numberOfLines={1}>
          Archivo: {doc.nombre_archivo}
        </Text>
      )}

      {doc.estado === 'rechazado' && doc.motivo_rechazo !== null && (
        <Text className="text-error text-xs mt-1.5">Motivo del rechazo: {doc.motivo_rechazo}</Text>
      )}

      {doc.renovacion_pendiente && (
        <View className="bg-actionTint rounded-lg px-3 py-2 mt-2.5 flex-row items-start gap-2">
          <Feather name="clock" size={14} color={colors.action} style={{ marginTop: 1 }} />
          <Text className="text-action text-xs flex-1">
            Has enviado la renovación y la estamos revisando. Mientras tanto, el documento actual sigue vigente.
          </Text>
        </View>
      )}
      {!doc.renovacion_pendiente && doc.renovacion_motivo !== null && (
        <View className="bg-errorTint rounded-lg px-3 py-2 mt-2.5">
          <Text className="text-error text-xs">
            No hemos aceptado tu última renovación: {doc.renovacion_motivo}. Súbela de nuevo.
          </Text>
        </View>
      )}

      <View className="flex-row gap-2 mt-2.5">
        {doc.storage_path !== null && (
          <Pressable
            onPress={() => onVer(doc.storage_path as string)}
            disabled={ocupado}
            className="flex-1 border border-border rounded-lg py-2.5 items-center flex-row justify-center gap-1.5"
          >
            <Feather name="eye" size={13} color={colors.inkMuted} />
            <Text className="text-inkMuted text-xs font-sansBold">Ver</Text>
          </Pressable>
        )}
        {doc.puede_renovar && (
          <Pressable
            onPress={() => onSubir(doc)}
            disabled={ocupado}
            className={`flex-1 rounded-lg py-2.5 items-center flex-row justify-center gap-1.5 ${
              destacado ? 'bg-action' : 'border border-border'
            }`}
          >
            {subiendo ? (
              <ActivityIndicator size="small" color={destacado ? colors.white : colors.action} />
            ) : (
              <Feather name="upload" size={13} color={destacado ? colors.white : colors.inkMuted} />
            )}
            <Text className={`text-xs font-sansBold ${destacado ? 'text-white' : 'text-inkMuted'}`}>
              {subiendo ? 'Subiendo…' : textoBoton(doc)}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}