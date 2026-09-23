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
import { colors } from '../design-system/tokens';
import AuthStack from './AuthStack';
import SubcontratistaTabs from './SubcontratistaTabs';
import AdminTabs from './AdminTabs';
import DetalleObraScreen from '../screens/obras/DetalleObraScreen';
import type { RootStackParamList } from './types';

type Rol = 'subcontratista' | 'admin' | 'superadmin';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const [session, setSession] = useState<Session | null>(null);
  const [rol, setRol] = useState<Rol | null>(null);
  const [cargando, setCargando] = useState(true);

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

  useEffect(() => {
    if (!session) {
      setRol(null);
      return;
    }

    let activo = true;
    supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single()
      .then(({ data, error }) => {
        if (!activo) return;
        if (error) {
          // Sin fila en profiles todavía (p.ej. usuario creado a mano en
          // Supabase Auth sin su fila correspondiente) -> fallback seguro.
          console.warn('No se pudo cargar el perfil, usando rol por defecto:', error.message);
          setRol('subcontratista');
          return;
        }
        setRol((data?.role as Rol) ?? 'subcontratista');
      });

    return () => {
      activo = false;
    };
  }, [session]);

  if (cargando || (session !== null && rol === null)) {
    return (
      <View className="flex-1 items-center justify-center bg-surface">
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!session ? (
          <Stack.Screen name="Auth" component={AuthStack} />
        ) : rol === 'admin' || rol === 'superadmin' ? (
          <Stack.Screen name="AppAdmin" component={AdminTabs} />
        ) : (
          <>
            <Stack.Screen name="AppSubcontratista" component={SubcontratistaTabs} />
            <Stack.Screen
              name="DetalleObra"
              component={DetalleObraScreen}
              options={{
                headerShown: true,
                title: 'Detalle de obra',
                headerStyle: { backgroundColor: colors.primary },
                headerTintColor: colors.onPrimary,
                headerTitleStyle: { color: colors.onPrimary },
              }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
