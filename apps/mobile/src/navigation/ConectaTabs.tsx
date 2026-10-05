import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { colors } from '../design-system/tokens';
import AnimatedTabBar from '../components/AnimatedTabBar';
import TablonScreen from '../screens/conecta/TablonScreen';
import DirectorioScreen from '../screens/conecta/DirectorioScreen';
import PerfilScreen from '../screens/perfil/PerfilScreen';

const Tab = createBottomTabNavigator();

const ICONOS = {
  Tablon: 'clipboard',
  Directorio: 'book-open',
  Perfil: 'user',
} as const;

/**
 * Pestañas de los 6 perfiles de OH Conecta (promotor, constructora,
 * arquitecto, proveedor, profesional, administrador). Todos ven el Tablón
 * y el Directorio completos; lo que cambia según el rol es qué pueden
 * PUBLICAR (ver TablonScreen y DirectorioScreen).
 */
export default function ConectaTabs({ rol, userId }: { rol: string; userId: string }) {
  return (
    <Tab.Navigator
      screenOptions={{ headerShown: false }}
      tabBar={(props) => (
        <AnimatedTabBar {...props} icons={ICONOS} barColor={colors.navySurface} activeColor={colors.action} />
      )}
    >
      <Tab.Screen name="Tablon">{() => <TablonScreen rol={rol} userId={userId} />}</Tab.Screen>
      <Tab.Screen name="Directorio">{() => <DirectorioScreen rol={rol} userId={userId} />}</Tab.Screen>
      <Tab.Screen name="Perfil" component={PerfilScreen} />
    </Tab.Navigator>
  );
}