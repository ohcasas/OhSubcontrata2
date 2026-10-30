import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { ReferidorTabParamList } from './types';
import { colors } from '../design-system/tokens';
import AnimatedTabBar from '../components/AnimatedTabBar';
import MensajesScreen from '../screens/chat/MensajesScreen';
import { useChatNoLeidos } from '../services/chat';
import RecomiendaScreen from '../screens/recomienda/RecomiendaScreen';
import PerfilScreen from '../screens/perfil/PerfilScreen';

const Tab = createBottomTabNavigator<ReferidorTabParamList>();

const ICONOS = {
  Mensajes: 'message-circle',
  Recomienda: 'users',
  Perfil: 'user',
} as const;

export default function ReferidorTabs() {
  const noLeidos = useChatNoLeidos();
  return (
    <Tab.Navigator
      screenOptions={{ headerShown: false }}
      tabBar={(props) => (
        <AnimatedTabBar {...props} icons={ICONOS} badges={{ Mensajes: noLeidos }} barColor={colors.navySurface} activeColor={colors.action} />
      )}
    >
      <Tab.Screen name="Recomienda" component={RecomiendaScreen} />
      <Tab.Screen name="Mensajes" component={MensajesScreen} />
      <Tab.Screen name="Perfil" component={PerfilScreen} />
    </Tab.Navigator>
  );
}