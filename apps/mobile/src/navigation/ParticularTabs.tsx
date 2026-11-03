import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { ParticularTabParamList } from './types';
import { colors } from '../design-system/tokens';
import AnimatedTabBar from '../components/AnimatedTabBar';
import MisPeticionesScreen from '../screens/peticiones/MisPeticionesScreen';
import PerfilScreen from '../screens/perfil/PerfilScreen';

const Tab = createBottomTabNavigator<ParticularTabParamList>();

const ICONOS = {
  Peticiones: 'home',
  Perfil: 'user',
} as const;

export default function ParticularTabs() {
  return (
    <Tab.Navigator
      screenOptions={{ headerShown: false }}
      tabBar={(props) => (
        <AnimatedTabBar {...props} icons={ICONOS} barColor={colors.navySurface} activeColor={colors.action} />
      )}
    >
      <Tab.Screen name="Peticiones" component={MisPeticionesScreen} />
      <Tab.Screen name="Perfil" component={PerfilScreen} />
    </Tab.Navigator>
  );
}