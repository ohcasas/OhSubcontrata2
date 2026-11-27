import { listarCategorias, listarPartidas, type CategoriaCatalogo, type PartidaCatalogo } from '../../services/catalogo';

export type DatosCatalogo = {
  categorias: CategoriaCatalogo[];
  /** Partidas publicadas por categoría (solo las categorías que no son formulario). */
  partidas: Record<string, PartidaCatalogo[]>;
};

const VIGENCIA_MS = 60_000;
let cache: { t: number; datos: DatosCatalogo } | null = null;
let enCurso: Promise<DatosCatalogo> | null = null;

/**
 * Carga categorías y partidas una vez y las comparte entre Inicio y Buscar (sin repetir llamadas al cambiar de
 * pestaña). Los precios se piden al servidor, que solo devuelve lo que Administración ha publicado.
 */
export function cargarCatalogo(forzar = false): Promise<DatosCatalogo> {
  if (!forzar && cache !== null && Date.now() - cache.t < VIGENCIA_MS) return Promise.resolve(cache.datos);
  if (enCurso !== null) return enCurso;
  enCurso = (async () => {
    try {
      const categorias = await listarCategorias();
      const pares = await Promise.all(
        categorias
          .filter((c) => !c.es_formulario)
          .map(async (c) => {
            try {
              return [c.codigo, await listarPartidas(c.codigo)] as const;
            } catch {
              return [c.codigo, [] as PartidaCatalogo[]] as const;
            }
          }),
      );
      const datos: DatosCatalogo = { categorias, partidas: Object.fromEntries(pares) };
      cache = { t: Date.now(), datos };
      return datos;
    } finally {
      enCurso = null;
    }
  })();
  return enCurso;
}

/** Quita acentos y mayúsculas para buscar «bano» y encontrar «Baño». */
export function normalizar(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}