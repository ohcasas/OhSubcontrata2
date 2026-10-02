/**
 * Bottom tabs — rol Administrador OH Club.
 * Coincide con la bottom nav bar vista en perfil_administrador del export
 * de Stitch: Obras / Postulaciones / Gremios / Perfil Admin (distinta de la
 * del subcontratista: cambia "Partner" por "Gremios" y "Perfil" por "Perfil Admin").
 */
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { AdminTabParamList } from './types';
import { colors } from '../design-system/tokens';
import AnimatedTabBar from '../components/AnimatedTabBar';
import AdminObrasScreen from '../screens/admin/AdminObrasScreen';
import AdminPostulacionesScreen from '../screens/admin/AdminPostulacionesScreen';
import GremiosScreen from '../screens/admin/GremiosScreen';
import RecompensasAdminScreen from '../screens/admin/RecompensasAdminScreen';
import AdminReferidosScreen from '../screens/admin/AdminReferidosScreen';
import PerfilAdminScreen from '../screens/admin/PerfilAdminScreen';

const Tab = createBottomTabNavigator<AdminTabParamList>();

const ICONOS = {
  ObrasAdmin: 'briefcase',
  PostulacionesAdmin: 'inbox',
  Gremios: 'users',
  RecompensasAdmin: 'gift',
  Referidos: 'user-plus',
  PerfilAdmin: 'shield',
} as const;

export default function AdminTabs() {
  return (
    <Tab.Navigator
      screenOptions={{ headerShown: false }}
      tabBar={(props) => (
        <AnimatedTabBar {...props} icons={ICONOS} barColor={colors.navySurface} activeColor={colors.action} />
      )}
    >
      <Tab.Screen name="ObrasAdmin" component={AdminObrasScreen} />
      <Tab.Screen name="PostulacionesAdmin" component={AdminPostulacionesScreen} />
      <Tab.Screen name="Gremios" component={GremiosScreen} />
      <Tab.Screen name="RecompensasAdmin" component={RecompensasAdminScreen} />
      <Tab.Screen name="Referidos" component={AdminReferidosScreen} />
      <Tab.Screen name="PerfilAdmin" component={PerfilAdminScreen} />
    </Tab.Navigator>
  );
}