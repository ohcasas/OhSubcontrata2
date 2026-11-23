import { useEffect, useState } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { ParticularTabParamList } from './types';
import { colors } from '../design-system/tokens';
import AnimatedTabBar from '../components/AnimatedTabBar';
import MisPeticionesScreen from '../screens/peticiones/MisPeticionesScreen';
import CatalogoScreen from '../screens/catalogo/CatalogoScreen';
import PerfilScreen from '../screens/perfil/PerfilScreen';
import { catalogoActivo } from '../services/catalogo';

const Tab = createBottomTabNavigator<ParticularTabParamList>();

const ICONOS = {
  Peticiones: 'home',
  Catalogo: 'grid',
  Perfil: 'user',
} as const;

export default function ParticularTabs() {
  // La pestaña «Catálogo» solo aparece cuando Administración enciende el catálogo en Supabase
  const [hayCatalogo, setHayCatalogo] = useState(false);
  useEffect(() => {
    let vivo = true;
    catalogoActivo().then((ok) => vivo && setHayCatalogo(ok));
    return () => {
      vivo = false;
    };
  }, []);

  return (
    <Tab.Navigator
      screenOptions={{ headerShown: false }}
      tabBar={(props) => (
        <AnimatedTabBar {...props} icons={ICONOS} barColor={colors.navySurface} activeColor={colors.action} />
      )}
    >
      <Tab.Screen name="Peticiones" component={MisPeticionesScreen} />
      {hayCatalogo && <Tab.Screen name="Catalogo" component={CatalogoScreen} options={{ title: 'Catálogo' }} />}
      <Tab.Screen name="Perfil" component={PerfilScreen} />
    </Tab.Navigator>
  );
}