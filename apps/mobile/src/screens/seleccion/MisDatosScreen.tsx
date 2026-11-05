import { useCallback, useState } from 'react';
import { View, Text, ScrollView, TextInput, Linking, Share, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import { supabase } from '../../services/supabase';
import {
  actualizarMisDatos,
  exportarMisDatos,
  mensajeDeErrorSeleccion,
  obtenerMiCandidato,
  solicitarDerecho,
  subirCv,
} from '../../services/seleccion';
import type { Candidato } from '../../services/seleccion';
import { Aviso, BotonPrimario, BotonSecundario, Tarjeta } from './ui';

const URL_POLITICA = 'https://3bconecta.com/privacidad.html';

/** Pestaña «Mis datos»: ver y corregir, CV, copia de los datos y solicitudes de acceso / rectificación / supresión. */
export default function MisDatosScreen() {
  const insets = useSafeAreaInsets();
  const [c, setC] = useState<Candidato | null>(null);
  const [telefono, setTelefono] = useState('');
  const [localidad, setLocalidad] = useState('');
  const [resumen, setResumen] = useState('');
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);

  useFocusEffect(
    useCallback(() => {
      supabase.auth.getSession().then(async ({ data }) => {
        const uid = data.session?.user.id;
        if (!uid) return;
        const x = await obtenerMiCandidato(uid).catch(() => null);
        setC(x);
        setTelefono(x?.telefono ?? '');
        setLocalidad(x?.localidad ?? '');
        setResumen(x?.resumen ?? '');
      });
    }, []),
  );

  const ejecutar = async (clave: string, f: () => Promise<string | void>) => {
    setOcupado(clave);
    setMsg(null);
    try {
      const texto = await f();
      if (texto) setMsg({ tipo: 'ok', texto });
    } catch (e) {
      setMsg({ tipo: 'error', texto: mensajeDeErrorSeleccion(e) });
    } finally {
      setOcupado(null);
    }
  };

  const guardar = () =>
    ejecutar('guardar', async () => {
      if (!c) return;
      await actualizarMisDatos(c.user_id, { telefono, localidad, resumen });
      return 'Datos guardados.';
    });

  const cambiarCv = () =>
    ejecutar('cv', async () => {
      if (!c) return;
      const r = await DocumentPicker.getDocumentAsync({
        type: [
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ],
        copyToCacheDirectory: true,
      });
      if (r.canceled || !r.assets?.[0]) return;
      const a = r.assets[0];
      if (a.size && a.size > 5 * 1024 * 1024) throw new Error('El CV pesa más de 5 MB.');
      const ruta = await subirCv(c.user_id, a.uri, a.mimeType ?? 'application/pdf', a.name);
      setC({ ...c, cv_path: ruta });
      return 'CV actualizado.';
    });

  const copia = () =>
    ejecutar('copia', async () => {
      const datos = await exportarMisDatos();
      await Share.share({ message: JSON.stringify(datos, null, 2), title: 'Mis datos de candidatura' });
    });

  const derecho = (tipo: 'acceso' | 'rectificacion' | 'supresion', texto: string, confirmar?: string) => {
    const lanzar = () =>
      ejecutar(tipo, async () => {
        await solicitarDerecho(tipo, '');
        return texto;
      });
    if (confirmar) {
      Alert.alert('Confirmar solicitud', confirmar, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Solicitar', style: 'destructive', onPress: lanzar },
      ]);
    } else {
      lanzar();
    }
  };

  const cerrarSesion = () => supabase.auth.signOut();

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
      <ScrollView className="flex-1 px-4" keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}>
        <Text className="text-ink text-2xl font-sansBold pt-4 mb-3">Mis datos</Text>
        {msg !== null && <Aviso texto={msg.texto} tipo={msg.tipo} />}

        <Tarjeta>
          <Text className="text-ink text-base font-sansBold">{c?.nombre_completo ?? '…'}</Text>
          <Text className="text-inkMuted text-sm mb-3">{c?.email ?? ''}</Text>
          <Text className="text-ink text-sm font-sansSemiBold mb-1">Teléfono</Text>
          <TextInput value={telefono} onChangeText={setTelefono} keyboardType="phone-pad" className="bg-surface border border-border rounded-xl px-3 py-2.5 text-ink mb-3" />
          <Text className="text-ink text-sm font-sansSemiBold mb-1">Localidad</Text>
          <TextInput value={localidad} onChangeText={setLocalidad} className="bg-surface border border-border rounded-xl px-3 py-2.5 text-ink mb-3" />
          <Text className="text-ink text-sm font-sansSemiBold mb-1">Sobre ti</Text>
          <TextInput
            value={resumen}
            onChangeText={setResumen}
            multiline
            maxLength={1500}
            className="bg-surface border border-border rounded-xl px-3 py-2.5 text-ink mb-3"
            style={{ minHeight: 80, textAlignVertical: 'top' }}
          />
          <BotonPrimario texto="Guardar cambios" onPress={guardar} cargando={ocupado === 'guardar'} desactivado={c === null} />
        </Tarjeta>

        <Tarjeta>
          <Text className="text-ink text-base font-sansBold">Mi CV</Text>
          <Text className="text-inkMuted text-sm mt-0.5 mb-3">{c?.cv_path ? 'Tienes un CV guardado.' : 'Todavía no has subido ningún CV.'}</Text>
          <BotonSecundario texto={c?.cv_path ? 'Cambiar CV' : 'Subir CV'} onPress={cambiarCv} desactivado={ocupado === 'cv' || c === null} />
        </Tarjeta>

        <Tarjeta>
          <Text className="text-ink text-base font-sansBold">Tus derechos sobre tus datos</Text>
          <Text className="text-inkMuted text-sm mt-0.5 mb-3">
            Puedes pedir una copia, corregir tus datos o que los eliminemos. Una persona del equipo atiende cada solicitud.
          </Text>
          <BotonSecundario texto="Descargar una copia de mis datos" onPress={copia} desactivado={ocupado === 'copia' || c === null} />
          <View className="h-2" />
          <BotonSecundario
            texto="Solicitar acceso a mis datos"
            onPress={() => derecho('acceso', 'Solicitud de acceso enviada. Te responderá el equipo de selección.')}
          />
          <View className="h-2" />
          <BotonSecundario
            texto="Solicitar corrección de datos"
            onPress={() => derecho('rectificacion', 'Solicitud de corrección enviada. Te responderá el equipo de selección.')}
          />
          <View className="h-2" />
          <BotonSecundario
            texto="Solicitar la eliminación de mis datos"
            onPress={() =>
              derecho(
                'supresion',
                'Solicitud de eliminación enviada. Una persona del equipo la revisará.',
                'Pediremos al equipo que elimine tus datos y tus candidaturas. Esto no se hace al instante: lo revisa una persona.',
              )
            }
          />
        </Tarjeta>

        <BotonSecundario texto="Política de privacidad" onPress={() => Linking.openURL(URL_POLITICA)} />
        <View className="h-2" />
        <BotonSecundario texto="Cerrar sesión" onPress={cerrarSesion} />
      </ScrollView>
    </View>
  );
}