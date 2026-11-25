import { View, Text, Pressable, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { AuthStackParamList, RolEmpresaColaboradora } from '../../navigation/types';
import { colors } from '../../design-system/tokens';
import FondoAuth from '../../components/auth/FondoAuth';
import LogoCristal from '../../components/auth/LogoCristal';

type OpcionTrabajo = {
  tipo: 'subcontratista' | 'referidor';
  icono: keyof typeof Feather.glyphMap;
  titulo: string;
  subtitulo: string;
};

type OpcionEmpresa = {
  tipo: RolEmpresaColaboradora;
  icono: keyof typeof Feather.glyphMap;
  titulo: string;
  subtitulo: string;
};

const OPCIONES_TRABAJO: OpcionTrabajo[] = [
  {
    tipo: 'subcontratista',
    icono: 'tool',
    titulo: 'Oficios',
    subtitulo: 'Postula a licitaciones, ejecuta obras y gana puntos del Club 3B Partner.',
  },
  {
    tipo: 'referidor',
    icono: 'users',
    titulo: 'Recomienda clientes',
    subtitulo: 'Quieres recomendar clientes y ganar comisión.',
  },
];

const OPCIONES_EMPRESA: OpcionEmpresa[] = [
  { tipo: 'promotor', icono: 'layers', titulo: 'Promotor', subtitulo: 'Publica proyectos, obras y necesidades.' },
  {
    tipo: 'constructora',
    icono: 'truck',
    titulo: 'Constructora',
    subtitulo: 'Busca subcontratas, proveedores y técnicos.',
  },
  {
    tipo: 'arquitecto',
    icono: 'pen-tool',
    titulo: 'Arquitecto',
    subtitulo: 'Proyectos, dirección de obra, colaboraciones.',
  },
  {
    tipo: 'proveedor',
    icono: 'package',
    titulo: 'Proveedor',
    subtitulo: 'Materiales, maquinaria, transporte, alquileres.',
  },
  {
    tipo: 'profesional',
    icono: 'award',
    titulo: 'Profesional',
    subtitulo: 'Aparejadores, ingenieros, coordinadores, topografía.',
  },
  {
    tipo: 'administrador',
    icono: 'key',
    titulo: 'Inmobiliaria / Administrador',
    subtitulo: 'Avisos, oportunidades y recomendación de clientes.',
  },
];

/** Icono del perfil: círculo degradado azul con el icono en blanco y brillo de cristal. */
function IconoPerfil({ nombre }: { nombre: keyof typeof Feather.glyphMap }) {
  return (
    <View
      style={{
        width: 48,
        height: 48,
        borderRadius: 24,
        shadowColor: '#1951FC',
        shadowOpacity: 0.3,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
        elevation: 4,
      }}
    >
      <LinearGradient
        colors={['#6FB6FF', '#1951FC', '#0B2CB1']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ flex: 1, borderRadius: 24, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
      >
        <View
          style={{
            position: 'absolute',
            top: 3,
            left: 7,
            width: 34,
            height: 17,
            borderRadius: 20,
            backgroundColor: 'rgba(255,255,255,0.22)',
          }}
        />
        <Feather name={nombre} size={21} color="#FFFFFF" />
      </LinearGradient>
    </View>
  );
}

export default function ElegirTipoCuentaScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();

  const irAParticular = () => {
    navigation.navigate('RegistroParticular');
  };

  const irATrabajo = (tipo: OpcionTrabajo['tipo']) => {
    if (tipo === 'subcontratista') {
      navigation.navigate('Registro');
    } else {
      navigation.navigate('RegistroReferidor');
    }
  };

  const irAEmpresa = (tipo: RolEmpresaColaboradora) => {
    navigation.navigate('RegistroEmpresa', { rol: tipo });
  };

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <FondoAuth />
      <ScrollView contentContainerStyle={{ padding: 24 }}>
        <View className="items-center mb-6">
          <LogoCristal tamano={64} />
          <Text className="text-white text-2xl font-sansBold text-center">¿Qué quieres hacer?</Text>
          <Text className="text-white/85 text-sm text-center mt-1.5">
            Puedes cambiarlo más adelante contactando con 3B.
          </Text>
        </View>

        <Text className="text-ink text-xs font-sansBold uppercase mb-2 self-start bg-white/75 rounded-full px-3 py-1 overflow-hidden" style={{ letterSpacing: 1 }}>
          Necesito una obra o reforma
        </Text>
        <View className="gap-2 mb-5">
          <Pressable
            onPress={irAParticular}
            className="bg-white/70 border border-white rounded-3xl p-4 flex-row items-center gap-3"
          >
            <IconoPerfil nombre="home" />
            <View className="flex-1">
              <Text className="text-ink text-sm font-sansBold">Soy particular</Text>
              <Text className="text-inkMuted text-xs mt-0.5">
                Cuéntanos qué necesitas en tu casa: lo revisamos y las empresas te envían su oferta.
              </Text>
            </View>
            <Feather name="chevron-right" size={18} color={colors.inkSubtle} />
          </Pressable>
        </View>

        <Text className="text-ink text-xs font-sansBold uppercase mb-2 self-start bg-white/75 rounded-full px-3 py-1 overflow-hidden" style={{ letterSpacing: 1 }}>
          Trabajo en obras
        </Text>
        <View className="gap-2 mb-5">
          {OPCIONES_TRABAJO.map((op) => (
            <Pressable
              key={op.tipo}
              onPress={() => irATrabajo(op.tipo)}
              className="bg-white/70 border border-white rounded-3xl p-4 flex-row items-center gap-3"
            >
              <IconoPerfil nombre={op.icono} />
              <View className="flex-1">
                <Text className="text-ink text-sm font-sansBold">{op.titulo}</Text>
                <Text className="text-inkMuted text-xs mt-0.5">{op.subtitulo}</Text>
              </View>
              <Feather name="chevron-right" size={18} color={colors.inkSubtle} />
            </Pressable>
          ))}
        </View>

        <Text className="text-ink text-xs font-sansBold uppercase mb-2 self-start bg-white/75 rounded-full px-3 py-1 overflow-hidden" style={{ letterSpacing: 1 }}>
          Soy una empresa o profesional del sector
        </Text>
        <View className="gap-2">
          {OPCIONES_EMPRESA.map((op) => (
            <Pressable
              key={op.tipo}
              onPress={() => irAEmpresa(op.tipo)}
              className="bg-white/70 border border-white rounded-3xl p-4 flex-row items-center gap-3"
            >
              <IconoPerfil nombre={op.icono} />
              <View className="flex-1">
                <Text className="text-ink text-sm font-sansBold">{op.titulo}</Text>
                <Text className="text-inkMuted text-xs mt-0.5">{op.subtitulo}</Text>
              </View>
              <Feather name="chevron-right" size={18} color={colors.inkSubtle} />
            </Pressable>
          ))}
        </View>

        <Pressable onPress={() => navigation.navigate('Login')} className="self-center mt-8 bg-white/75 rounded-full px-5 py-2.5">
          <Text className="text-inkMuted text-sm">
            ¿Ya tienes cuenta? <Text className="text-action font-sansSemiBold">Iniciar sesión</Text>
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}