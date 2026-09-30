/**
 * Bottom tabs — rol Subcontratista.
 * Coincide con la bottom nav bar vista en obras_disponibles, club_oh_partner
 * y perfil_profesional del export de Stitch: Obras / Postulaciones / Partner / Perfil.
 */
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { SubcontratistaTabParamList } from './types';
import { colors } from '../design-system/tokens';
import AnimatedTabBar from '../components/AnimatedTabBar';
import ObrasScreen from '../screens/obras/ObrasScreen';
import PostulacionesScreen from '../screens/postulaciones/PostulacionesScreen';
import ClubPartnerScreen from '../screens/partner/ClubPartnerScreen';
import PerfilScreen from '../screens/perfil/PerfilScreen';

const Tab = createBottomTabNavigator<SubcontratistaTabParamList>();

const ICONOS = {
  Obras: 'briefcase',
  Postulaciones: 'file-text',
  Partner: 'award',
  Perfil: 'user',
} as const;

export default function SubcontratistaTabs() {
  return (
    <Tab.Navigator
      screenOptions={{ headerShown: false }}
      tabBar={(props) => (
        <AnimatedTabBar {...props} icons={ICONOS} barColor={colors.navySurface} activeColor={colors.action} />
      )}
    >
      <Tab.Screen name="Obras" component={ObrasScreen} />
      <Tab.Screen name="Postulaciones" component={PostulacionesScreen} />
      <Tab.Screen name="Partner" component={ClubPartnerScreen} />
      <Tab.Screen name="Perfil" component={PerfilScreen} />
    </Tab.Navigator>
  );
}