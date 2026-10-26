import { supabase } from './supabase';

export type Etiqueta = {
  id: string;
  nombre: string;
  icono: string | null;
  estado: string;
  orden: number;
};

const CAMPOS = 'id, nombre, icono, estado, orden';

/**
 * Etiquetas que se pueden usar. Siempre salen las activas; con `incluirPropias`
 * salen también las que el usuario ha propuesto y aún están en revisión (la base
 * de datos solo le enseña las suyas), para que pueda usarlas en sus obras.
 */
export async function cargarEtiquetas(incluirPropias = false): Promise<Etiqueta[]> {
  // Petición directa a la API REST (con la sesión del usuario): evita el constructor de
  // consultas del cliente, que en algunos móviles falla con "undefined is not a function".
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const clave = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  const { data: sesion } = await supabase.auth.getSession();
  const token = sesion?.session?.access_token;
  if (!url || !clave || !token) throw new Error('No hay sesión iniciada.');
  const estados = incluirPropias ? 'activa,propuesta' : 'activa';
  const respuesta = await fetch(
    `${url}/rest/v1/etiquetas?select=${encodeURIComponent(CAMPOS.replace(/ /g, ''))}&estado=in.(${estados})&order=orden.asc,nombre.asc`,
    { headers: { apikey: clave, Authorization: `Bearer ${token}` } },
  );
  const texto = await respuesta.text();
  if (!respuesta.ok) throw new Error(`Error ${respuesta.status}: ${texto.slice(0, 200)}`);
  const lista = JSON.parse(texto) as Etiqueta[];
  return Array.isArray(lista) ? lista : [];
}

type FilaObraEtiqueta = { obra_id: string; etiquetas: Etiqueta | Etiqueta[] | null };

/** Etiquetas de un grupo de obras, agrupadas por obra. Si falla, devuelve un mapa vacío. */
export async function etiquetasDeObras(obraIds: string[]): Promise<Map<string, Etiqueta[]>> {
  const mapa = new Map<string, Etiqueta[]>();
  for (let i = 0; i < obraIds.length; i += 100) {
    const trozo = obraIds.slice(i, i + 100);
    const { data, error } = await supabase
      .from('obras_etiquetas')
      .select(`obra_id, etiquetas (${CAMPOS})`)
      .in('obra_id', trozo);
    if (error) continue;
    for (const fila of ((data as unknown as FilaObraEtiqueta[] | null) ?? [])) {
      const e = Array.isArray(fila.etiquetas) ? fila.etiquetas[0] : fila.etiquetas;
      if (!e) continue;
      const lista = mapa.get(fila.obra_id) ?? [];
      lista.push(e);
      mapa.set(fila.obra_id, lista);
    }
  }
  for (const lista of mapa.values()) lista.sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre));
  return mapa;
}

export async function misEtiquetasIds(empresaId: string): Promise<string[]> {
  const { data, error } = await supabase.from('empresa_etiquetas').select('etiqueta_id').eq('empresa_id', empresaId);
  if (error) return [];
  return ((data as { etiqueta_id: string }[] | null) ?? []).map((f) => f.etiqueta_id);
}

export async function guardarMisEtiquetas(ids: string[]): Promise<void> {
  const { error } = await supabase.rpc('guardar_mis_etiquetas', { p_etiquetas: ids });
  if (error) throw new Error(error.message);
}

export async function asignarEtiquetasObra(obraId: string, ids: string[]): Promise<void> {
  const { error } = await supabase.rpc('asignar_etiquetas_obra', { p_obra_id: obraId, p_etiquetas: ids });
  if (error) throw new Error(error.message);
}

/** Devuelve el id de la etiqueta propuesta. Si quien propone es de 3B, queda activa al momento. */
export async function proponerEtiqueta(nombre: string): Promise<string> {
  const { data, error } = await supabase.rpc('proponer_etiqueta', { p_nombre: nombre });
  if (error || typeof data !== 'string') throw new Error(error?.message ?? 'No se ha podido proponer la etiqueta.');
  return data;
}