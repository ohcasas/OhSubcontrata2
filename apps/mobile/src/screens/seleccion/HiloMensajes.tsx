import { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput } from 'react-native';
import { enviarMensaje, listarMensajes, mensajeDeErrorSeleccion } from '../../services/seleccion';
import type { Mensaje } from '../../services/seleccion';
import { Aviso, BotonPrimario, fechaHora } from './ui';

/** Conversación del candidato con el equipo de selección sobre una candidatura. */
export default function HiloMensajes({ candidaturaId, cerrada }: { candidaturaId: string; cerrada?: boolean }) {
  const [mensajes, setMensajes] = useState<Mensaje[] | null>(null);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      setMensajes(await listarMensajes(candidaturaId));
    } catch (e) {
      setError(mensajeDeErrorSeleccion(e));
      setMensajes([]);
    }
  }, [candidaturaId]);

  useEffect(() => {
    setMensajes(null);
    cargar();
  }, [cargar]);

  const enviar = async () => {
    if (!texto.trim()) return;
    setEnviando(true);
    setError(null);
    try {
      await enviarMensaje(candidaturaId, texto);
      setTexto('');
      await cargar();
    } catch (e) {
      setError(mensajeDeErrorSeleccion(e));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <View>
      {error !== null && <Aviso texto={error} />}
      {mensajes !== null && mensajes.length === 0 && (
        <Text className="text-inkMuted text-sm mb-3">Todavía no hay mensajes. Puedes escribir al equipo de selección aquí.</Text>
      )}
      {(mensajes ?? []).map((m) => (
        <View key={m.id} className={`mb-2 max-w-[88%] rounded-2xl px-3 py-2 ${m.de_candidato ? 'self-end bg-action' : 'self-start bg-surface border border-border'}`}>
          <Text className={`text-sm ${m.de_candidato ? 'text-white' : 'text-ink'}`}>{m.texto}</Text>
          <Text className={`text-[11px] mt-0.5 ${m.de_candidato ? 'text-white/70' : 'text-inkSubtle'}`}>{fechaHora(m.created_at)}</Text>
        </View>
      ))}
      {cerrada ? (
        <Text className="text-inkMuted text-xs mt-2">El proceso está cerrado; puedes seguir escribiendo si necesitas aclarar algo.</Text>
      ) : null}
      <TextInput
        value={texto}
        onChangeText={setTexto}
        placeholder="Escribe un mensaje…"
        multiline
        maxLength={2000}
        className="bg-surface border border-border rounded-xl px-3 py-3 text-ink mt-2"
        style={{ minHeight: 48, textAlignVertical: 'top' }}
      />
      <View className="mt-2.5">
        <BotonPrimario texto="Enviar" onPress={enviar} cargando={enviando} desactivado={!texto.trim()} />
      </View>
    </View>
  );
}