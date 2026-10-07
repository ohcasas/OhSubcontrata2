/**
 * Navegador raíz.
 *
 * Lee la sesión de Supabase y, si existe, el rol guardado en `profiles`
 * para decidir qué conjunto de tabs mostrar. Sin sesión -> AuthStack.
 *
 * NOTA de Fase 0: la consulta a `profiles` y el guardado de estado de auth
 * en un store global (Zustand) se implementarán en la siguiente fase, junto
 * con las pantallas reales. Aquí sólo se deja el esqueleto de decisión.
 */
import { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, ActivityIndicator } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../services/supabase';
import { registrarPush } from '../services/pushNotifications';
import { colors } from '../design-system/tokens';
import AuthStack from './AuthStack';
import SubcontratistaTabs from './SubcontratistaTabs';
import ReferidorTabs from './ReferidorTabs';
import AdminTabs from './AdminTabs';
import DetalleObraScreen from '../screens/obras/DetalleObraScreen';
import NotificacionesScreen from '../screens/notificaciones/NotificacionesScreen';
import GremioDetalleScreen from '../screens/admin/GremioDetalleScreen';
import AdminObraDetalleScreen from '../screens/admin/AdminObraDetalleScreen';
import TarjetaComisionFlotante from '../components/TarjetaComisionFlotante';
import ConectaTabs from './ConectaTabs';
import CuentaNoActivaScreen from '../screens/auth/CuentaNoActivaScreen';
import type { RootStackParamList } from './types';

type Rol =
  | 'subcontratista'
  | 'referidor'
  | 'admin'
  | 'superadmin'
  | 'promotor'
  | 'constructora'
  | 'arquitecto'
  | 'proveedor'
  | 'profesional'
  | 'administrador';

const ROLES_CONECTA: Rol[] = [
  'promotor',
  'constructora',
  'arquitecto',
  'proveedor',
  'profesional',
  'administrador',
];

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const [session, setSession] = useState<Session | null>(null);
  const [rol, setRol] = useState<Rol | null>(null);
  const [cargando, setCargando] = useState(true);
  const [estadoCuenta, setEstadoCuenta] = useState<'pendiente' | 'verificada' | 'suspendida' | 'error' | null>(null);
  const [motivoCuenta, setMotivoCuenta] = useState<string | null>(null);
  const [recargas, setRecargas] = useState(0);
  const [comprobando, setComprobando] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setCargando(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nuevaSesion) => {
      setSession(nuevaSesion);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  // Registra el token de push de este dispositivo en cuanto hay sesión —
  // una vez por inicio de sesión, no en cada render. Sin efecto en Expo Go
  // (ver services/pushNotifications.ts); en una development build, guarda
  // el token para que el servidor pueda enviar avisos reales.
  useEffect(() => {
    if (session !== null) {
      registrarPush(session.user.id);
    }
  }, [session]);

  // Rol y estado de la cuenta. Se vuelve a leer cuando alguien pulsa "Comprobar ahora"
  // en la pantalla de cuenta pendiente (recargas).
  useEffect(() => {
    if (!session) {
      setRol(null);
      setEstadoCuenta(null);
      setMotivoCuenta(null);
      return;
    }

    let activo = true;
    supabase
      .from('profiles')
      .select('role, estado_cuenta, estado_cuenta_motivo')
      .eq('id', session.user.id)
      .single()
      .then(({ data, error }) => {
        if (!activo) return;
        setComprobando(false);
        if (error || !data) {
          // Antes aquí se asumía el rol 'subcontratista'. Ahora NO: sin poder leer la
          // cuenta no se da por buena (la base de datos tampoco dejaría leer nada).
          console.warn('No se pudo cargar el perfil:', error?.message);
          setEstadoCuenta('error');
          return;
        }
        setRol((data.role as Rol) ?? null);
        setMotivoCuenta((data.estado_cuenta_motivo as string | null) ?? null);
        setEstadoCuenta(
          data.estado_cuenta === 'verificada' || data.estado_cuenta === 'suspendida' ? data.estado_cuenta : 'pendiente',
        );
      });

    return () => {
      activo = false;
    };
  }, [session, recargas]);

  if (cargando || (session !== null && estadoCuenta === null)) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <ActivityIndicator color={colors.action} />
      </View>
    );
  }

  // Solo las cuentas verificadas (y el personal de OH) entran en la app. Esto es la parte
  // visible; lo que de verdad lo impide es la base de datos (ver migración 0034).
  const cuentaActiva = rol === 'admin' || rol === 'superadmin' || estadoCuenta === 'verificada';

  // La campana de notificaciones (en el Perfil, Recomienda, etc.) navega a
  // esta pantalla. Tiene que estar registrada en TODOS los perfiles que
  // enseñan la campana, no solo en Oficios.
  const pantallaNotificaciones = (
    <Stack.Screen
      name="Notificaciones"
      component={NotificacionesScreen}
      options={{
        headerShown: true,
        title: 'Notificaciones',
        headerStyle: { backgroundColor: colors.canvas },
        headerTintColor: colors.ink,
        headerTitleStyle: { color: colors.ink },
      }}
    />
  );

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!session ? (
          <Stack.Screen name="Auth" component={AuthStack} />
        ) : !cuentaActiva ? (
          <Stack.Screen name="CuentaNoActiva">
            {() => (
              <CuentaNoActivaScreen
                estado={estadoCuenta === 'suspendida' ? 'suspendida' : estadoCuenta === 'error' ? 'error' : 'pendiente'}
                motivo={motivoCuenta}
                userId={session!.user.id}
                comprobando={comprobando}
                onComprobar={() => {
                  setComprobando(true);
                  setRecargas((n) => n + 1);
                }}
              />
            )}
          </Stack.Screen>
        ) : rol === 'admin' || rol === 'superadmin' ? (
          <>
            <Stack.Screen name="AppAdmin" component={AdminTabs} />
            <Stack.Screen
              name="GremioDetalle"
              component={GremioDetalleScreen}
              options={{
                headerShown: true,
                title: 'Empresa',
                headerStyle: { backgroundColor: colors.canvas },
                headerTintColor: colors.ink,
                headerTitleStyle: { color: colors.ink },
              }}
            />
            <Stack.Screen
              name="AdminObraDetalle"
              component={AdminObraDetalleScreen}
              options={{
                headerShown: true,
                title: 'Obra',
                headerStyle: { backgroundColor: colors.canvas },
                headerTintColor: colors.ink,
                headerTitleStyle: { color: colors.ink },
              }}
            />
          </>
        ) : rol === 'referidor' ? (
          <>
            <Stack.Screen name="AppReferidor" component={ReferidorTabs} />
            {pantallaNotificaciones}
          </>
        ) : rol !== null && ROLES_CONECTA.includes(rol) ? (
          <>
            <Stack.Screen name="AppConecta">
              {() => <ConectaTabs rol={rol} userId={session!.user.id} />}
            </Stack.Screen>
            {pantallaNotificaciones}
          </>
        ) : (
          <>
            <Stack.Screen name="AppSubcontratista" component={SubcontratistaTabs} />
            <Stack.Screen
              name="DetalleObra"
              component={DetalleObraScreen}
              options={{
                headerShown: true,
                title: 'Detalle de obra',
                headerStyle: { backgroundColor: colors.canvas },
                headerTintColor: colors.ink,
                headerTitleStyle: { color: colors.ink },
              }}
            />
            {pantallaNotificaciones}
          </>
        )}
      </Stack.Navigator>

      {/* Tarjeta flotante de comisión pendiente: por encima de toda la
          navegación, para subcontratistas y referidores (quien haga la
          recomendación), nunca para el admin. */}
      {session !== null && cuentaActiva && (rol === 'subcontratista' || rol === 'referidor' || rol === 'administrador') && (
        <TarjetaComisionFlotante userId={session.user.id} />
      )}
    </NavigationContainer>
  );
}