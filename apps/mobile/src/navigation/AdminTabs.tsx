/**
 * Bottom tabs — rol Administrador OH Casas.
 * Coincide con la bottom nav bar vista en perfil_administrador del export
 * de Stitch: Obras / Postulaciones / Gremios / Perfil Admin (distinta de la
 * del subcontratista: cambia "Partner" por "Gremios" y "Perfil" por "Perfil Admin").
 */
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Feather } from '@expo/vector-icons';
import type { AdminTabParamList } from './types';
import { colors } from '../design-system/tokens';
import AdminObrasScreen from '../screens/admin/AdminObrasScreen';
import AdminPostulacionesScreen from '../screens/admin/AdminPostulacionesScreen';
import GremiosScreen from '../screens/admin/GremiosScreen';
import PerfilAdminScreen from '../screens/admin/PerfilAdminScreen';

const Tab = createBottomTabNavigator<AdminTabParamList>();

export default function AdminTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.tertiary,
        tabBarInactiveTintColor: colors.onSurfaceVariant,
        tabBarStyle: { backgroundColor: colors.surfaceContainerLowest },
      }}
    >
      <Tab.Screen
        name="ObrasAdmin"
        component={AdminObrasScreen}
        options={{ tabBarIcon: ({ color, size }) => <Feather name="briefcase" color={color} size={size} /> }}
      />
      <Tab.Screen
        name="PostulacionesAdmin"
        component={AdminPostulacionesScreen}
        options={{ tabBarIcon: ({ color, size }) => <Feather name="inbox" color={color} size={size} /> }}
      />
      <Tab.Screen
        name="Gremios"
        component={GremiosScreen}
        options={{ tabBarIcon: ({ color, size }) => <Feather name="users" color={color} size={size} /> }}
      />
      <Tab.Screen
        name="PerfilAdmin"
        component={PerfilAdminScreen}
        options={{ tabBarIcon: ({ color, size }) => <Feather name="shield" color={color} size={size} /> }}
      />
    </Tab.Navigator>
  );
}
