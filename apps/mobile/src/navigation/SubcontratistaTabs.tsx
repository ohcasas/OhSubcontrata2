import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { SubcontratistaTabParamList } from './types';
import { colors } from '../design-system/tokens';
import AnimatedTabBar from '../components/AnimatedTabBar';
import MensajesScreen from '../screens/chat/MensajesScreen';
import { useChatNoLeidos } from '../services/chat';
import ObrasScreen from '../screens/obras/ObrasScreen';
import PostulacionesScreen from '../screens/postulaciones/PostulacionesScreen';
import TablonScreen from '../screens/conecta/TablonScreen';
import RecomiendaScreen from '../screens/recomienda/RecomiendaScreen';
import ClubPartnerScreen from '../screens/partner/ClubPartnerScreen';
import PerfilScreen from '../screens/perfil/PerfilScreen';

const Tab = createBottomTabNavigator<SubcontratistaTabParamList>();

const ICONOS = {
  Mensajes: 'message-circle',
  Obras: 'briefcase',
  Postulaciones: 'file-text',
  Tablon: 'clipboard',
  Recomienda: 'users',
  Partner: 'award',
  Perfil: 'user',
} as const;

export default function SubcontratistaTabs() {
  const noLeidos = useChatNoLeidos();
  return (
    <Tab.Navigator
      screenOptions={{ headerShown: false }}
      tabBar={(props) => (
        <AnimatedTabBar {...props} icons={ICONOS} badges={{ Mensajes: noLeidos }} barColor={colors.navySurface} activeColor={colors.action} />
      )}
    >
      <Tab.Screen name="Obras" component={ObrasScreen} />
      <Tab.Screen name="Postulaciones" component={PostulacionesScreen} />
      {/* Solo lectura: el Tablón es donde promotores y constructoras dicen lo que necesitan. */}
      <Tab.Screen name="Tablon">{() => <TablonScreen rol="subcontratista" />}</Tab.Screen>
      <Tab.Screen name="Recomienda" component={RecomiendaScreen} />
      <Tab.Screen name="Partner" component={ClubPartnerScreen} />
      <Tab.Screen name="Mensajes" component={MensajesScreen} />
      <Tab.Screen name="Perfil" component={PerfilScreen} />
    </Tab.Navigator>
  );
}