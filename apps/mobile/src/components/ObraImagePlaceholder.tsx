import { useEffect, useState } from 'react';
import { View, Image } from 'react-native';
import type { ComponentProps } from 'react';
import type { Feather } from '@expo/vector-icons';

type Props = {
  imageUrl?: string | null;
  height?: number;
  /** Ya no se usa: el marcador ahora es siempre el logo de OH Contratas. Se mantiene para no tocar a quien lo pasa. */
  icon?: ComponentProps<typeof Feather>['name'];
  rounded?: 'top' | 'all';
};

const LOGO = require('../../assets/branding/oh-casas-logo.jpg');

/**
 * Banner de portada de una obra. Si `imageUrl` tiene un valor, muestra la
 * foto real; si es null (obra sin foto) O si la foto falla al cargar, muestra
 * el logo de OH Contratas sobre el fondo navy de marca — nunca un <Image> roto ni
 * un hueco en blanco. El logo es el aspecto "normal" de una obra sin foto, no
 * un estado de error.
 */
export default function ObraImagePlaceholder({ imageUrl = null, height = 96, rounded = 'top' }: Props) {
  const [fallo, setFallo] = useState(false);
  const claseRedondeo = rounded === 'top' ? 'rounded-t-2xl' : 'rounded-2xl';

  // Si la obra cambia de foto (p.ej. el admin sube una nueva), se vuelve a intentar.
  useEffect(() => {
    setFallo(false);
  }, [imageUrl]);

  if (imageUrl !== null && !fallo) {
    return (
      <Image
        source={{ uri: imageUrl }}
        style={{ height, width: '100%' }}
        className={claseRedondeo}
        resizeMode="cover"
        onError={() => setFallo(true)}
      />
    );
  }

  const lado = Math.min(Math.round(height * 0.5), 110);
  return (
    <View className={`bg-navySurface items-center justify-center ${claseRedondeo}`} style={{ height }}>
      <Image
        source={LOGO}
        style={{ width: lado, height: lado, borderRadius: Math.round(lado * 0.18) }}
        resizeMode="contain"
      />
    </View>
  );
}