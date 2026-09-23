/**
 * Bottom tabs — rol Subcontratista.
 * Coincide con la bottom nav bar vista en obras_disponibles, club_oh_partner
 * y perfil_profesional del export de Stitch: Obras / Postulaciones / Partner / Perfil.
 */
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Feather } from '@expo/vector-icons';
import type { SubcontratistaTabParamList } from './types';
import { colors } from '../design-system/tokens';
import ObrasScreen from '../screens/obras/ObrasScreen';
import PostulacionesScreen from '../screens/postulaciones/PostulacionesScreen';
import ClubPartnerScreen from '../screens/partner/ClubPartnerScreen';
import PerfilScreen from '../screens/perfil/PerfilScreen';

const Tab = createBottomTabNavigator<SubcontratistaTabParamList>();

export default function SubcontratistaTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.tertiary,
        tabBarInactiveTintColor: colors.onSurfaceVariant,
        tabBarStyle: { backgroundColor: colors.primary },
      }}
    >
      <Tab.Screen
        name="Obras"
        component={ObrasScreen}
        options={{ tabBarIcon: ({ color, size }) => <Feather name="briefcase" color={color} size={size} /> }}
      />
      <Tab.Screen
        name="Postulaciones"
        component={PostulacionesScreen}
        options={{ tabBarIcon: ({ color, size }) => <Feather name="file-text" color={color} size={size} /> }}
      />
      <Tab.Screen
        name="Partner"
        component={ClubPartnerScreen}
        options={{ tabBarIcon: ({ color, size }) => <Feather name="award" color={color} size={size} /> }}
      />
      <Tab.Screen
        name="Perfil"
        component={PerfilScreen}
        options={{ tabBarIcon: ({ color, size }) => <Feather name="user" color={color} size={size} /> }}
      />
    </Tab.Navigator>
  );
}
