import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { colors } from '../design-system/tokens';
import AnimatedTabBar from '../components/AnimatedTabBar';
import TablonScreen from '../screens/conecta/TablonScreen';
import DirectorioScreen from '../screens/conecta/DirectorioScreen';
import RecomiendaScreen from '../screens/recomienda/RecomiendaScreen';
import MisLicitacionesScreen from '../screens/licitaciones/MisLicitacionesScreen';
import ObrasScreen from '../screens/obras/ObrasScreen';
import PostulacionesScreen from '../screens/postulaciones/PostulacionesScreen';
import PerfilScreen from '../screens/perfil/PerfilScreen';

const Tab = createBottomTabNavigator();

const ICONOS = {
  Licitaciones: 'briefcase',
  Obras: 'search',
  Postulaciones: 'file-text',
  Tablon: 'clipboard',
  Directorio: 'book-open',
  Recomienda: 'users',
  Perfil: 'user',
} as const;

/**
 * Pestañas de los 6 perfiles de 3B Conecta (promotor, constructora,
 * arquitecto, proveedor, profesional, administrador). Todos ven el Tablón
 * y el Directorio completos; lo que cambia según el rol es qué pueden
 * PUBLICAR (ver TablonScreen y DirectorioScreen).
 *
 * Promotoras, constructoras e inmobiliarias tienen además la pestaña Licitaciones (primera): ahí
 * publican licitaciones a las que se postulan los oficios, y adjudican.
 *
 * Las CONSTRUCTORAS pueden además ver las obras abiertas y postularse a ellas, como un oficio
 * (pestañas Obras y Postulaciones): hay empresas que son contratista y subcontrata a la vez. La base de datos
 * ya lo permitía (tienen empresa propia) y no pueden postularse a sus propias licitaciones.
 *
 * El 'administrador' es también el perfil de las INMOBILIARIAS: además tiene
 * la pestaña Recomienda, porque su negocio es traer clientes (2 % de comisión).
 */
export default function ConectaTabs({ rol, userId }: { rol: string; userId: string }) {
  return (
    <Tab.Navigator
      screenOptions={{ headerShown: false }}
      tabBar={(props) => (
        <AnimatedTabBar {...props} icons={ICONOS} barColor={colors.navySurface} activeColor={colors.action} />
      )}
    >
      {(rol === 'promotor' || rol === 'constructora' || rol === 'administrador') && (
        <Tab.Screen name="Licitaciones" component={MisLicitacionesScreen} />
      )}
      {rol === 'constructora' && <Tab.Screen name="Obras" component={ObrasScreen} />}
      {rol === 'constructora' && <Tab.Screen name="Postulaciones" component={PostulacionesScreen} />}
      <Tab.Screen name="Tablon">{() => <TablonScreen rol={rol} userId={userId} />}</Tab.Screen>
      <Tab.Screen name="Directorio">{() => <DirectorioScreen rol={rol} userId={userId} />}</Tab.Screen>
      {rol === 'administrador' && <Tab.Screen name="Recomienda" component={RecomiendaScreen} />}
      <Tab.Screen name="Perfil" component={PerfilScreen} />
    </Tab.Navigator>
  );
}