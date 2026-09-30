import './global.css';
import 'react-native-gesture-handler';
import { View, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
  DMSans_700Bold,
} from '@expo-google-fonts/dm-sans';
import RootNavigator from './src/navigation/RootNavigator';
import { colors } from './src/design-system/tokens';

export default function App() {
  const [fuentesListas] = useFonts({
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
  });

  // Pantalla de carga mínima mientras se cargan los pesos de DM Sans — sin
  // esto, la primera pantalla parpadearía con la fuente del sistema y luego
  // cambiaría a DM Sans en cuanto termine de cargar.
  if (!fuentesListas) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.canvas }}>
        <ActivityIndicator color={colors.action} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <RootNavigator />
    </SafeAreaProvider>
  );
}