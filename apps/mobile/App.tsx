import './global.css';
import 'react-native-gesture-handler';
import { useState } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
  DMSans_700Bold,
} from '@expo-google-fonts/dm-sans';
import RootNavigator from './src/navigation/RootNavigator';
import PantallaCarga from './src/components/PantallaCarga';

// La pantalla de carga nativa (negra) se queda puesta hasta que PantallaCarga
// la quite, para que no haya un parpadeo entre una y otra.
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  const [fuentesListas] = useFonts({
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
  });
  const [cargaVisible, setCargaVisible] = useState(true);

  // La app no se pinta hasta que DM Sans está cargada (si no, la primera pantalla
  // parpadearía con la fuente del sistema). Mientras tanto, PantallaCarga cubre todo.
  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: '#000000' }}>
        {fuentesListas && <RootNavigator />}
        {cargaVisible && <PantallaCarga listo={fuentesListas} onTerminada={() => setCargaVisible(false)} />}
      </View>
    </SafeAreaProvider>
  );
}