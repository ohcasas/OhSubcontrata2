/**
 * Iconos planos y "flotantes" del catálogo (imágenes PNG con fondo transparente en assets/catalogo).
 * Son los mismos que se eligen en el panel de administración, así que cada partida se ve igual en las dos partes.
 * Se usan imágenes (no SVG) para no añadir ninguna dependencia nueva a la app.
 */
import type { ImageSourcePropType } from 'react-native';

const ICONOS: Record<string, ImageSourcePropType> = {
  albanileria: require('../../../assets/catalogo/albanileria.png'),
  pintura: require('../../../assets/catalogo/pintura.png'),
  electricidad: require('../../../assets/catalogo/electricidad.png'),
  fontaneria: require('../../../assets/catalogo/fontaneria.png'),
  carpinteria: require('../../../assets/catalogo/carpinteria.png'),
  climatizacion: require('../../../assets/catalogo/climatizacion.png'),
  pladur: require('../../../assets/catalogo/pladur.png'),
  bano: require('../../../assets/catalogo/bano.png'),
  suelos: require('../../../assets/catalogo/suelos.png'),
  ventanas: require('../../../assets/catalogo/ventanas.png'),
  cocina: require('../../../assets/catalogo/cocina.png'),
  casa: require('../../../assets/catalogo/casa.png'),
  fachada: require('../../../assets/catalogo/fachada.png'),
  otro: require('../../../assets/catalogo/otro.png'),
};

/** Las categorías de la migración 0094 traen una clave antigua (banera, rodillo...): se traduce a los iconos nuevos. */
const DESDE_CLAVE_CATEGORIA: Record<string, string> = {
  casa: 'casa',
  banera: 'bano',
  cocina: 'cocina',
  capas: 'suelos',
  rodillo: 'pintura',
  rayo: 'electricidad',
  gota: 'fontaneria',
  puerta: 'carpinteria',
  ventana: 'ventanas',
  edificio: 'fachada',
  mas: 'otro',
};

/** Si una partida no tiene icono propio, usa el de su categoría. */
const DESDE_CODIGO_CATEGORIA: Record<string, string> = {
  reforma_integral: 'casa',
  bano: 'bano',
  cocina: 'cocina',
  suelos: 'suelos',
  pintura: 'pintura',
  electricidad: 'electricidad',
  fontaneria: 'fontaneria',
  carpinteria: 'carpinteria',
  ventanas: 'ventanas',
  fachada: 'fachada',
};

export function iconoCatalogo(clave?: string | null, codigoCategoria?: string | null): ImageSourcePropType {
  const k = clave ?? '';
  if (ICONOS[k] !== undefined) return ICONOS[k];
  if (DESDE_CLAVE_CATEGORIA[k] !== undefined) return ICONOS[DESDE_CLAVE_CATEGORIA[k]];
  const c = DESDE_CODIGO_CATEGORIA[codigoCategoria ?? ''];
  return ICONOS[c ?? 'casa'];
}