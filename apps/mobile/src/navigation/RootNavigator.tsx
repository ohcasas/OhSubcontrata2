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
import ParticularTabs from './ParticularTabs';
import TecnicoTabs from './TecnicoTabs';
import AdminTabs from './AdminTabs';
import DetalleObraScreen from '../screens/obras/DetalleObraScreen';
import NotificacionesScreen from '../screens/notificaciones/NotificacionesScreen';
import GremioDetalleScreen from '../screens/admin/GremioDetalleScreen';
import AdminObraDetalleScreen from '../screens/admin/AdminObraDetalleScreen';
import TarjetaComisionFlotante from '../components/TarjetaComisionFlotante';
import ConectaTabs from './ConectaTabs';
import MensajesScreen from '../screens/chat/MensajesScreen';
import ChatScreen from '../screens/chat/ChatScreen';
import ChatNuevoScreen from '../screens/chat/ChatNuevoScreen';
import CuentaNoActivaScreen from '../screens/auth/CuentaNoActivaScreen';
import MisDocumentosScreen from '../screens/documentos/MisDocumentosScreen';
import MisTrabajadoresScreen from '../screens/documentos/MisTrabajadoresScreen';
import TrabajadorDetalleScreen from '../screens/documentos/TrabajadorDetalleScreen';
import TrabajadorFormScreen from '../screens/documentos/TrabajadorFormScreen';
import CandidatoTabs from './CandidatoTabs';
import EmpleoOfertaScreen from '../screens/seleccion/EmpleoOfertaScreen';
import PostularScreen from '../screens/seleccion/PostularScreen';
import CandidaturaDetalleScreen from '../screens/seleccion/CandidaturaDetalleScreen';
import { ActualizarAppScreen, AvisoActualizacion } from '../screens/ActualizarAppScreen';
import { comprobarVersionApp, type EstadoVersion } from '../services/versionApp';
import CandidatoPendienteScreen from '../screens/seleccion/CandidatoPendienteScreen';
import CandidatoAltaScreen from '../screens/seleccion/CandidatoAltaScreen';
import { obtenerMiCandidato } from '../services/seleccion';
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
  | 'administrador'
  | 'particular'
  | 'tecnico';

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
  // «Trabaja con nosotros»: 'si' = candidato con datos; 'alta' = cuenta de candidato sin «Tus datos» aún.
  const [version, setVersion] = useState<EstadoVersion>({ nivel: 'ok', urlTienda: null, mensaje: null });
  const [avisoCerrado, setAvisoCerrado] = useState(false);
  useEffect(() => {
    comprobarVersionApp().then(setVersion);
  }, []);
  const [candidatoNota, setCandidatoNota] = useState<string | null>(null);
  const [candidato, setCandidato] = useState<'si' | 'pendiente' | 'alta' | null>(null);

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
      setCandidato(null);
      return;
    }

    let activo = true;
    supabase
      .from('profiles')
      .select('role, estado_cuenta, estado_cuenta_motivo')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(async ({ data, error }) => {
        if (!activo) return;
        setComprobando(false);
        // Un candidato de «Trabaja con nosotros» NO tiene perfil del marketplace: es otra cuenta.
        if (!error && !data) {
          const cand = await obtenerMiCandidato(session.user.id).catch(() => null);
          if (!activo) return;
          if (cand) {
            setCandidato(cand.verificacion === 'verificado' ? 'si' : 'pendiente');
            setCandidatoNota(cand.verificacion === 'rechazado' ? cand.verificacion_nota : null);
            setEstadoCuenta('verificada');
            return;
          }
          if (session.user.user_metadata?.tipo_cuenta === 'candidato') {
            setCandidato('alta');
            setEstadoCuenta('verificada');
            return;
          }
        }
        setCandidato(null);
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

  // Version de la app demasiado antigua: nada de lo demas se ensena hasta actualizar.
  if (version.nivel === 'obligatoria') {
    return <ActualizarAppScreen urlTienda={version.urlTienda} mensaje={version.mensaje} />;
  }
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

  // Documentación de la cuenta y de sus trabajadores (subir, renovar, ver). Se abre desde el Perfil.
  const opcionesDocumentos = (titulo: string) => ({
    headerShown: true,
    title: titulo,
    headerStyle: { backgroundColor: colors.canvas },
    headerTintColor: colors.ink,
    headerTitleStyle: { color: colors.ink },
  });
  const pantallasDocumentos = [
    <Stack.Screen key="MisDocumentos" name="MisDocumentos" component={MisDocumentosScreen} options={opcionesDocumentos('Mis documentos')} />,
    <Stack.Screen key="MisTrabajadores" name="MisTrabajadores" component={MisTrabajadoresScreen} options={opcionesDocumentos('Mis trabajadores')} />,
    <Stack.Screen key="TrabajadorDetalle" name="TrabajadorDetalle" component={TrabajadorDetalleScreen} options={opcionesDocumentos('Trabajador')} />,
    <Stack.Screen key="TrabajadorForm" name="TrabajadorForm" component={TrabajadorFormScreen} options={opcionesDocumentos('Datos del trabajador')} />,
  ];

  // Chat: la conversación y el buscador para escribir a alguien (la bandeja se abre desde el icono de mensajes de la cabecera).
  const pantallasChat = [
    <Stack.Screen key="Mensajes" name="Mensajes" component={MensajesScreen} options={opcionesDocumentos('Mensajes')} />,
    <Stack.Screen key="Chat" name="Chat" component={ChatScreen} options={opcionesDocumentos('Chat')} />,
    <Stack.Screen key="ChatNuevo" name="ChatNuevo" component={ChatNuevoScreen} options={opcionesDocumentos('Escribir a alguien')} />,
  ];

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!session ? (
          <Stack.Screen name="Auth" component={AuthStack} />
        ) : candidato === 'alta' ? (
          <Stack.Screen name="CandidatoAlta">
            {() => <CandidatoAltaScreen onHecho={() => setRecargas((n) => n + 1)} />}
          </Stack.Screen>
        ) : candidato === 'pendiente' ? (
          <Stack.Screen name="CandidatoPendiente">
            {() => <CandidatoPendienteScreen nota={candidatoNota} onComprobar={() => setRecargas((n) => n + 1)} />}
          </Stack.Screen>
        ) : candidato === 'si' ? (
          <>
            <Stack.Screen name="AppCandidato" component={CandidatoTabs} />
            <Stack.Screen name="EmpleoOferta" component={EmpleoOfertaScreen} />
            <Stack.Screen name="Postular" component={PostularScreen} />
            <Stack.Screen name="CandidaturaDetalle" component={CandidaturaDetalleScreen} />
          </>
        ) : !cuentaActiva ? (
          <Stack.Screen name="CuentaNoActiva">
            {() => (
              <CuentaNoActivaScreen
                estado={estadoCuenta === 'suspendida' ? 'suspendida' : estadoCuenta === 'error' ? 'error' : 'pendiente'}
                motivo={motivoCuenta}
                userId={session!.user.id}
                rol={rol ?? undefined}
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
            {pantallasChat}
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
        ) : rol === 'particular' ? (
          <>
            <Stack.Screen name="AppParticular" component={ParticularTabs} />
            {pantallaNotificaciones}
            {pantallasChat}
          </>
        ) : rol === 'tecnico' ? (
          <>
            <Stack.Screen name="AppTecnico" component={TecnicoTabs} />
            {pantallaNotificaciones}
            {pantallasChat}
          </>
        ) : rol === 'referidor' ? (
          <>
            <Stack.Screen name="AppReferidor" component={ReferidorTabs} />
            {pantallaNotificaciones}
            {pantallasChat}
            {pantallasDocumentos}
          </>
        ) : rol !== null && ROLES_CONECTA.includes(rol) ? (
          <>
            <Stack.Screen name="AppConecta">
              {() => <ConectaTabs rol={rol} userId={session!.user.id} />}
            </Stack.Screen>
            {pantallaNotificaciones}
            {pantallasChat}
            {pantallasDocumentos}
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
            {pantallasChat}
            {pantallasDocumentos}
          </>
        )}
      </Stack.Navigator>

      {/* Tarjeta flotante de comisión pendiente: por encima de toda la
          navegación, para subcontratistas y referidores (quien haga la
          recomendación), nunca para el admin. */}
      {session !== null && cuentaActiva && (rol === 'subcontratista' || rol === 'referidor' || rol === 'administrador') && (
        <TarjetaComisionFlotante userId={session.user.id} />
      )}
      {version.nivel === 'recomendada' && !avisoCerrado && (
        <AvisoActualizacion urlTienda={version.urlTienda} mensaje={version.mensaje} onCerrar={() => setAvisoCerrado(true)} />
      )}
    </NavigationContainer>
  );
}