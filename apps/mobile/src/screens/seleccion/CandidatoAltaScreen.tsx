import { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, KeyboardAvoidingView, Platform, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { colors } from '../../design-system/tokens';
import { URL_POLITICA_PRIVACIDAD } from '../../constants/enlaces';
import { registrarCandidato, guardarPerfilProfesional, entrarBolsa, mensajeDeErrorSeleccion } from '../../services/seleccion';
import { Aviso, BotonPrimario } from './ui';

/** Primer paso tras entrar con una cuenta de candidato: datos básicos y consentimiento explícito. */
export default function CandidatoAltaScreen({ onHecho }: { onHecho: () => void }) {
  const insets = useSafeAreaInsets();
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [localidad, setLocalidad] = useState('');
  const [resumen, setResumen] = useState('');
  const [acepta, setAcepta] = useState(false);
  const [oficios, setOficios] = useState('');
  const [provincias, setProvincias] = useState('');
  const [quiereBolsa, setQuiereBolsa] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const guardar = async () => {
    setError(null);
    if (nombre.trim().length < 3) return setError('Escribe tu nombre completo.');
    if (!acepta) return setError('Para continuar tienes que aceptar el tratamiento de tus datos.');
    const lista = (t: string) => t.split(',').map((x) => x.trim()).filter((x) => x.length > 0);
    if (quiereBolsa && lista(oficios).length === 0) return setError('Para entrar en la bolsa indica al menos un oficio.');
    setCargando(true);
    try {
      await registrarCandidato({ nombre, telefono, localidad, resumen });
      if (quiereBolsa) {
        // El registro ya está hecho: si la bolsa falla, la persona puede entrar después desde «Mis datos».
        try {
          await guardarPerfilProfesional({ oficios: lista(oficios), anios: null, provincias: lista(provincias), disponibilidad: null, vehiculo: false, formacion: [] });
          await entrarBolsa();
        } catch {
          /* se reintenta desde «Mis datos» */
        }
      }
      onHecho();
    } catch (e) {
      setError(mensajeDeErrorSeleccion(e));
    } finally {
      setCargando(false);
    }
  };

  const campo = (etiqueta: string, valor: string, set: (v: string) => void, extra?: object) => (
    <>
      <Text className="text-ink text-xs font-sansSemiBold mb-1 mt-3">{etiqueta}</Text>
      <TextInput value={valor} onChangeText={set} className="bg-surface border border-border rounded-xl px-3 py-3 text-ink" {...extra} />
    </>
  );

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView className="flex-1 px-6" keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingVertical: 20 }}>
          <Text className="text-ink text-2xl font-sansBold">Tus datos</Text>
          <Text className="text-inkMuted text-sm mt-1 mb-2">
            No hace falta que haya una oferta abierta: puedes dejar tu perfil y entrar en la bolsa de empleo. Solo lo verá el equipo de selección de 3B.
          </Text>
          {error !== null && <Aviso texto={error} />}
          {campo('Nombre completo', nombre, setNombre, { autoComplete: 'name' })}
          {campo('Teléfono (opcional)', telefono, setTelefono, { keyboardType: 'phone-pad' })}
          {campo('Localidad (opcional)', localidad, setLocalidad)}
          {campo('Cuéntanos brevemente tu experiencia (opcional)', resumen, setResumen, { multiline: true, style: { minHeight: 90, textAlignVertical: 'top' } })}
          {campo('Oficio (separados por comas)', oficios, setOficios, { placeholder: 'Ej: Encofrador, albañil' })}
          {campo('Provincias donde puedes trabajar', provincias, setProvincias, { placeholder: 'Ej: Albacete, Cuenca' })}
          <Pressable onPress={() => setAcepta((v) => !v)} accessibilityRole="checkbox" accessibilityState={{ checked: acepta }} className="flex-row mt-5">
            <View className={`w-5 h-5 rounded border-2 items-center justify-center mt-0.5 ${acepta ? 'bg-action border-action' : 'border-borderStrong bg-surface'}`}>
              {acepta && <Feather name="check" size={13} color={colors.white} />}
            </View>
            <Text className="text-ink text-sm flex-1 ml-3">
              Acepto el tratamiento de mis datos para el proceso de selección. Sé que puedo consultarlos, rectificarlos o pedir su supresión desde «Mis datos».
            </Text>
          </Pressable>
          <Pressable onPress={() => Linking.openURL(URL_POLITICA_PRIVACIDAD)} className="mt-2 ml-8">
            <Text className="text-action text-sm">Política de privacidad</Text>
          </Pressable>
          <Pressable onPress={() => setQuiereBolsa((v) => !v)} accessibilityRole="checkbox" accessibilityState={{ checked: quiereBolsa }} className="flex-row mt-5">
            <View className={`w-5 h-5 rounded border-2 items-center justify-center mt-0.5 ${quiereBolsa ? 'bg-action border-action' : 'border-borderStrong bg-surface'}`}>
              {quiereBolsa && <Feather name="check" size={13} color={colors.white} />}
            </View>
            <Text className="text-ink text-sm flex-1 ml-3">
              Autorizo a 3B GROUP ARQUITECTURA, S.L.U. a conservar mi perfil profesional y mis datos de contacto en su bolsa de empleo y a que su equipo de
              selección los consulte para ofrecerme futuras oportunidades, aunque no haya una oferta abierta. Ninguna decisión de contratación se toma de
              forma automática. Puedo salir de la bolsa cuando quiera. (Opcional)
            </Text>
          </Pressable>
          <View className="mt-6">
            <BotonPrimario texto="Continuar" onPress={guardar} cargando={cargando} />
          </View>
          <Pressable onPress={() => supabase.auth.signOut()} className="self-center mt-5 py-1">
            <Text className="text-inkMuted text-sm">Salir</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}