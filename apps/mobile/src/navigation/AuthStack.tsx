import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { AuthStackParamList } from './types';
import LoginScreen from '../screens/auth/LoginScreen';
import RecuperarPasswordScreen from '../screens/auth/RecuperarPasswordScreen';
import ElegirTipoCuentaScreen from '../screens/auth/ElegirTipoCuentaScreen';
import RegistroScreen from '../screens/auth/RegistroScreen';
import RegistroReferidorScreen from '../screens/auth/RegistroReferidorScreen';
import RegistroEmpresaScreen from '../screens/auth/RegistroEmpresaScreen';
import RegistroParticularScreen from '../screens/auth/RegistroParticularScreen';

const Stack = createNativeStackNavigator<AuthStackParamList>();

export default function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="RecuperarPassword" component={RecuperarPasswordScreen} />
      <Stack.Screen name="ElegirTipoCuenta" component={ElegirTipoCuentaScreen} />
      <Stack.Screen name="Registro" component={RegistroScreen} />
      <Stack.Screen name="RegistroReferidor" component={RegistroReferidorScreen} />
      <Stack.Screen name="RegistroEmpresa" component={RegistroEmpresaScreen} />
      <Stack.Screen name="RegistroParticular" component={RegistroParticularScreen} />
    </Stack.Navigator>
  );
}