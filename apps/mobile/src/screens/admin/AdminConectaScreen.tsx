import { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { supabase } from '../../services/supabase';
import ScreenHeader from '../../components/ScreenHeader';
import AdminReferidosScreen from './AdminReferidosScreen';
import { ComisionesConecta, CuentasConecta, TablonModeracion, DirectorioModeracion } from './AdminConectaSecciones';

type Seccion = 'recomendaciones' | 'comisiones' | 'cuentas' | 'tablon' | 'directorio';

const SECCIONES: { clave: Seccion; etiqueta: string }[] = [
  { clave: 'recomendaciones', etiqueta: 'Recomendaciones' },
  { clave: 'comisiones', etiqueta: 'Comisiones' },
  { clave: 'cuentas', etiqueta: 'Cuentas' },
  { clave: 'tablon', etiqueta: 'Tablón' },
  { clave: 'directorio', etiqueta: 'Directorio' },
];

/** Pestaña "Conecta" del admin: todo lo de OH Conecta en un solo sitio. */
export default function AdminConectaScreen() {
  const [seccion, setSeccion] = useState<Seccion>('recomendaciones');
  const [pendientes, setPendientes] = useState(0);

  // Cuentas por verificar: se cuenta al abrir y cada vez que se cambia de sección (así baja al aprobar).
  useEffect(() => {
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('estado_cuenta', 'pendiente')
      .then(({ count }) => setPendientes(count ?? 0));
  }, [seccion]);

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader title="Conecta" subtitle="Gestión de la red de profesionales" />

      <View className="pt-3">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16 }}>
          <View className="flex-row" style={{ gap: 6 }}>
            {SECCIONES.map((s) => {
              const activa = seccion === s.clave;
              return (
                <Pressable
                  key={s.clave}
                  onPress={() => setSeccion(s.clave)}
                  className={`rounded-full px-4 py-2 border ${activa ? 'bg-action border-action' : 'bg-surface border-border'}`}
                >
                  <Text className={`text-xs font-sansSemiBold ${activa ? 'text-white' : 'text-ink'}`}>
                    {s.etiqueta}
                    {s.clave === 'cuentas' && pendientes > 0 ? `  ·  ${pendientes} por verificar` : ''}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      </View>

      <View className="flex-1">
        {seccion === 'recomendaciones' && <AdminReferidosScreen embebida />}
        {seccion === 'comisiones' && <ComisionesConecta />}
        {seccion === 'cuentas' && <CuentasConecta />}
        {seccion === 'tablon' && <TablonModeracion />}
        {seccion === 'directorio' && <DirectorioModeracion />}
      </View>
    </View>
  );
}