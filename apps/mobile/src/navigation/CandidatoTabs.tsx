import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { CandidatoTabParamList } from './types';
import { colors } from '../design-system/tokens';
import AnimatedTabBar from '../components/AnimatedTabBar';
import MiCandidaturaScreen from '../screens/seleccion/MiCandidaturaScreen';
import EmpleoOfertasScreen from '../screens/seleccion/EmpleoOfertasScreen';
import MensajesCandidatoScreen from '../screens/seleccion/MensajesCandidatoScreen';
import MisDatosScreen from '../screens/seleccion/MisDatosScreen';

const Tab = createBottomTabNavigator<CandidatoTabParamList>();

const ICONOS = {
  MiCandidatura: 'briefcase',
  Ofertas: 'search',
  MensajesCandidato: 'message-circle',
  MisDatos: 'user',
} as const;

/** App del candidato de «Trabaja con nosotros». No es una cuenta del marketplace. */
export default function CandidatoTabs() {
  return (
    <Tab.Navigator
      screenOptions={{ headerShown: false }}
      tabBar={(props) => (
        <AnimatedTabBar {...props} icons={ICONOS} barColor={colors.navySurface} activeColor={colors.action} />
      )}
    >
      <Tab.Screen name="MiCandidatura" component={MiCandidaturaScreen} />
      <Tab.Screen name="Ofertas" component={EmpleoOfertasScreen} />
      <Tab.Screen name="MensajesCandidato" component={MensajesCandidatoScreen} />
      <Tab.Screen name="MisDatos" component={MisDatosScreen} />
    </Tab.Navigator>
  );
}