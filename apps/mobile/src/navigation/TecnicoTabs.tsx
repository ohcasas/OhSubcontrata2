import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { TecnicoTabParamList } from './types';
import { colors } from '../design-system/tokens';
import AnimatedTabBar from '../components/AnimatedTabBar';
import MisVisitasScreen from '../screens/tecnico/MisVisitasScreen';
import PerfilScreen from '../screens/perfil/PerfilScreen';

const Tab = createBottomTabNavigator<TecnicoTabParamList>();

const ICONOS = {
  Visitas: 'map-pin',
  Perfil: 'user',
} as const;

export default function TecnicoTabs() {
  return (
    <Tab.Navigator
      screenOptions={{ headerShown: false }}
      tabBar={(props) => (
        <AnimatedTabBar {...props} icons={ICONOS} barColor={colors.navySurface} activeColor={colors.action} />
      )}
    >
      <Tab.Screen name="Visitas" component={MisVisitasScreen} />
      <Tab.Screen name="Perfil" component={PerfilScreen} />
    </Tab.Navigator>
  );
}