import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { ParticularTabParamList } from './types';
import { colors } from '../design-system/tokens';
import AnimatedTabBar from '../components/AnimatedTabBar';
import MensajesScreen from '../screens/chat/MensajesScreen';
import { useChatNoLeidos } from '../services/chat';
import MisPeticionesScreen from '../screens/peticiones/MisPeticionesScreen';
import PerfilScreen from '../screens/perfil/PerfilScreen';

const Tab = createBottomTabNavigator<ParticularTabParamList>();

const ICONOS = {
  Mensajes: 'message-circle',
  Peticiones: 'home',
  Perfil: 'user',
} as const;

export default function ParticularTabs() {
  const noLeidos = useChatNoLeidos();
  return (
    <Tab.Navigator
      screenOptions={{ headerShown: false }}
      tabBar={(props) => (
        <AnimatedTabBar {...props} icons={ICONOS} badges={{ Mensajes: noLeidos }} barColor={colors.navySurface} activeColor={colors.action} />
      )}
    >
      <Tab.Screen name="Peticiones" component={MisPeticionesScreen} />
      <Tab.Screen name="Mensajes" component={MensajesScreen} />
      <Tab.Screen name="Perfil" component={PerfilScreen} />
    </Tab.Navigator>
  );
}