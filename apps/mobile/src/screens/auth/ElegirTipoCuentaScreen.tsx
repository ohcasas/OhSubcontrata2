import { View, Text, Pressable, Image, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import type { AuthStackParamList, RolEmpresaColaboradora } from '../../navigation/types';
import { colors } from '../../design-system/tokens';

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
    icono: 'briefcase',
    titulo: 'Oficios',
    subtitulo: 'Postula a licitaciones, ejecuta obras y gana puntos del Club OH Partner.',
  },
  {
    tipo: 'referidor',
    icono: 'users',
    titulo: 'Recomienda clientes',
    subtitulo: 'Quieres recomendar clientes y ganar comisión.',
  },
];

const OPCIONES_EMPRESA: OpcionEmpresa[] = [
  { tipo: 'promotor', icono: 'home', titulo: 'Promotor', subtitulo: 'Publica proyectos, obras y necesidades.' },
  {
    tipo: 'constructora',
    icono: 'tool',
    titulo: 'Constructora',
    subtitulo: 'Busca subcontratas, proveedores y técnicos.',
  },
  {
    tipo: 'arquitecto',
    icono: 'edit-3',
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
    icono: 'file-text',
    titulo: 'Inmobiliaria / Administrador',
    subtitulo: 'Avisos, oportunidades y recomendación de clientes.',
  },
];

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
      <ScrollView contentContainerStyle={{ padding: 24 }}>
        <View className="items-center mb-6">
          <Image
            source={require('../../../assets/branding/oh-casas-logo.jpg')}
            style={{ width: 52, height: 52, borderRadius: 13 }}
            className="mb-3"
          />
          <Text className="text-ink text-2xl font-sansBold text-center">¿Qué quieres hacer?</Text>
          <Text className="text-inkMuted text-sm text-center mt-1.5">
            Puedes cambiarlo más adelante contactando con OH.
          </Text>
        </View>

        <Text className="text-ink text-xs font-sansBold uppercase mb-2" style={{ letterSpacing: 1 }}>
          Necesito una obra o reforma
        </Text>
        <View className="gap-2 mb-5">
          <Pressable
            onPress={irAParticular}
            className="bg-surface border border-border rounded-xl p-4 flex-row items-center gap-3"
          >
            <View className="w-10 h-10 rounded-lg bg-actionTint items-center justify-center">
              <Feather name="home" size={18} color={colors.action} />
            </View>
            <View className="flex-1">
              <Text className="text-ink text-sm font-sansBold">Soy particular</Text>
              <Text className="text-inkMuted text-xs mt-0.5">
                Cuéntanos qué necesitas en tu casa: lo revisamos y las empresas te envían su oferta.
              </Text>
            </View>
            <Feather name="chevron-right" size={18} color={colors.inkSubtle} />
          </Pressable>
        </View>

        <Text className="text-ink text-xs font-sansBold uppercase mb-2" style={{ letterSpacing: 1 }}>
          Trabajo en obras
        </Text>
        <View className="gap-2 mb-5">
          {OPCIONES_TRABAJO.map((op) => (
            <Pressable
              key={op.tipo}
              onPress={() => irATrabajo(op.tipo)}
              className="bg-surface border border-border rounded-xl p-4 flex-row items-center gap-3"
            >
              <View className="w-10 h-10 rounded-lg bg-actionTint items-center justify-center">
                <Feather name={op.icono} size={18} color={colors.action} />
              </View>
              <View className="flex-1">
                <Text className="text-ink text-sm font-sansBold">{op.titulo}</Text>
                <Text className="text-inkMuted text-xs mt-0.5">{op.subtitulo}</Text>
              </View>
              <Feather name="chevron-right" size={18} color={colors.inkSubtle} />
            </Pressable>
          ))}
        </View>

        <Text className="text-ink text-xs font-sansBold uppercase mb-2" style={{ letterSpacing: 1 }}>
          Soy una empresa o profesional del sector
        </Text>
        <View className="gap-2">
          {OPCIONES_EMPRESA.map((op) => (
            <Pressable
              key={op.tipo}
              onPress={() => irAEmpresa(op.tipo)}
              className="bg-surface border border-border rounded-xl p-4 flex-row items-center gap-3"
            >
              <View className="w-10 h-10 rounded-lg bg-actionTint items-center justify-center">
                <Feather name={op.icono} size={18} color={colors.action} />
              </View>
              <View className="flex-1">
                <Text className="text-ink text-sm font-sansBold">{op.titulo}</Text>
                <Text className="text-inkMuted text-xs mt-0.5">{op.subtitulo}</Text>
              </View>
              <Feather name="chevron-right" size={18} color={colors.inkSubtle} />
            </Pressable>
          ))}
        </View>

        <Pressable onPress={() => navigation.navigate('Login')} className="self-center mt-8">
          <Text className="text-inkMuted text-sm">
            ¿Ya tienes cuenta? <Text className="text-action font-sansSemiBold">Iniciar sesión</Text>
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}