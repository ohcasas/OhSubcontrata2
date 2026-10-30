import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { TecnicoTabParamList } from './types';
import { colors } from '../design-system/tokens';
import AnimatedTabBar from '../components/AnimatedTabBar';
import MensajesScreen from '../screens/chat/MensajesScreen';
import { useChatNoLeidos } from '../services/chat';
import MisVisitasScreen from '../screens/tecnico/MisVisitasScreen';
import PerfilScreen from '../screens/perfil/PerfilScreen';

const Tab = createBottomTabNavigator<TecnicoTabParamList>();

const ICONOS = {
  Mensajes: 'message-circle',
  Visitas: 'map-pin',
  Perfil: 'user',
} as const;

export default function TecnicoTabs() {
  const noLeidos = useChatNoLeidos();
  return (
    <Tab.Navigator
      screenOptions={{ headerShown: false }}
      tabBar={(props) => (
        <AnimatedTabBar {...props} icons={ICONOS} badges={{ Mensajes: noLeidos }} barColor={colors.navySurface} activeColor={colors.action} />
      )}
    >
      <Tab.Screen name="Visitas" component={MisVisitasScreen} />
      <Tab.Screen name="Mensajes" component={MensajesScreen} />
      <Tab.Screen name="Perfil" component={PerfilScreen} />
    </Tab.Navigator>
  );
}