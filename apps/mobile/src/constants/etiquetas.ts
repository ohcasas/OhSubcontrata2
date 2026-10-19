import type { ImageSourcePropType } from 'react-native';

/**
 * Iconos cromados de las etiquetas de obras (oficios). La clave es la columna
 * `icono` de la tabla `etiquetas`. Una etiqueta sin icono propio (por ejemplo
 * una creada después por el equipo o propuesta por una constructora) usa el
 * icono genérico de la app: ver IconoEtiqueta.
 */
const ICONOS: Record<string, ImageSourcePropType> = {
  demoliciones: require('../../assets/categorias/demoliciones.png'),
  excavaciones: require('../../assets/categorias/excavaciones.png'),
  estructuristas: require('../../assets/categorias/estructuristas.png'),
  pladuristas: require('../../assets/categorias/pladuristas.png'),
  carpinerias: require('../../assets/categorias/carpinerias.png'),
  fontaneria: require('../../assets/categorias/fontaneria.png'),
  climatizacion: require('../../assets/categorias/climatizacion.png'),
  electricistas: require('../../assets/categorias/electricistas.png'),
  pintores: require('../../assets/categorias/pintores.png'),
  impermeabilizadores: require('../../assets/categorias/impermeabilizadores.png'),
  albanileria: require('../../assets/categorias/albanileria.png'),
  jardineria: require('../../assets/categorias/jardineria.png'),
  residuos: require('../../assets/categorias/residuos.png'),
  piscinas: require('../../assets/categorias/piscinas.png'),
  mudanzas: require('../../assets/categorias/mudanzas.png'),
  transportes: require('../../assets/categorias/transportes.png'),
};

export function iconoEtiqueta(clave: string | null | undefined): ImageSourcePropType | null {
  if (clave === null || clave === undefined) return null;
  return ICONOS[clave] ?? null;
}

/** Máximo de etiquetas por obra y por oficio (el mismo límite que aplica la base de datos). */
export const MAX_ETIQUETAS_OBRA = 5;
export const MAX_MIS_ETIQUETAS = 8;