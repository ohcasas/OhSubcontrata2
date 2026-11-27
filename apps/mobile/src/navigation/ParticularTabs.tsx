import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { ParticularTabParamList } from './types';
import { colors } from '../design-system/tokens';
import AnimatedTabBar from '../components/AnimatedTabBar';
import MisPeticionesScreen from '../screens/peticiones/MisPeticionesScreen';
import PerfilScreen from '../screens/perfil/PerfilScreen';
import { BuscarScreen, InicioScreen, PedidoScreen } from '../screens/catalogo/CatalogoTabs';
import { CestaProvider, useCestaCantidad } from '../screens/catalogo/CestaContext';
import { catalogoActivo } from '../services/catalogo';

const Tab = createBottomTabNavigator<ParticularTabParamList>();

const ICONOS = {
  Inicio: 'home',
  Buscar: 'search',
  Pedido: 'shopping-bag',
  Peticiones: 'clipboard',
  Perfil: 'user',
} as const;

/**
 * App del particular. Con el catálogo encendido (ajustes_catalogo.activo, lo cambia Administración en Supabase) se ve
 * como Uber: Inicio (todo a la vista), Buscar (concepto + filtros), Pedido (con globo de cantidad), Peticiones y Perfil.
 * Con el catálogo apagado solo existen Peticiones y Perfil, igual que antes.
 */
export default function ParticularTabs() {
  // Se espera a saber si el catálogo está encendido para abrir ya en la pestaña correcta (si tarda, se considera apagado)
  const [conCatalogo, setConCatalogo] = useState<boolean | null>(null);
  useEffect(() => {
    let vivo = true;
    const limite = new Promise<boolean>((resolver) => setTimeout(() => resolver(false), 6000));
    Promise.race([catalogoActivo(), limite]).then((ok) => vivo && setConCatalogo(ok));
    return () => {
      vivo = false;
    };
  }, []);

  if (conCatalogo === null) {
    return (
      <View className="flex-1 bg-canvas items-center justify-center">
        <ActivityIndicator color={colors.action} />
      </View>
    );
  }
  return (
    <CestaProvider>
      <Navegador conCatalogo={conCatalogo} />
    </CestaProvider>
  );
}

function Navegador({ conCatalogo }: { conCatalogo: boolean }) {
  const enPedido = useCestaCantidad();
  const globos = useMemo(() => ({ Pedido: enPedido }), [enPedido]);

  return (
    <Tab.Navigator
      initialRouteName={conCatalogo ? 'Inicio' : 'Peticiones'}
      screenOptions={{ headerShown: false }}
      tabBar={(props) => (
        <AnimatedTabBar {...props} icons={ICONOS} badges={globos} barColor={colors.navySurface} activeColor={colors.action} />
      )}
    >
      {conCatalogo && <Tab.Screen name="Inicio" component={InicioScreen} />}
      {conCatalogo && <Tab.Screen name="Buscar" component={BuscarScreen} />}
      {conCatalogo && <Tab.Screen name="Pedido" component={PedidoScreen} />}
      <Tab.Screen name="Peticiones" component={MisPeticionesScreen} />
      <Tab.Screen name="Perfil" component={PerfilScreen} />
    </Tab.Navigator>
  );
}