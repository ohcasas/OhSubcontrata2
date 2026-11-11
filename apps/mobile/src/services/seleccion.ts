/**
 * «Trabaja con nosotros» — acceso a datos del candidato.
 *
 * Toda la lógica y los permisos viven en la base de datos (migración 0073: RLS y funciones sel_*).
 * Aquí solo se llama a esas funciones y a las vistas del candidato; no se decide nada de seguridad.
 * El candidato usa la misma autenticación de Supabase, pero NO tiene perfil del marketplace.
 */
import { supabase } from './supabase';
import { subirArchivoPrivado } from './storage';

export type OfertaPublica = {
  id: string;
  titulo: string;
  descripcion: string;
  ubicacion: string | null;
  modalidad: string | null;
  tipo_contrato: string | null;
  preguntas: { id: string; texto: string }[];
  publicada_at: string | null;
};

export type Candidato = {
  user_id: string;
  nombre_completo: string;
  email: string;
  telefono: string | null;
  localidad: string | null;
  resumen: string | null;
  cv_path: string | null;
};

export type MiCandidatura = {
  id: string;
  oferta_id: string;
  oferta_titulo: string;
  ubicacion: string | null;
  modalidad: string | null;
  estado: EstadoCandidatura;
  created_at: string;
  updated_at: string;
};

export type EstadoCandidatura =
  | 'recibida'
  | 'en_revision'
  | 'preseleccionada'
  | 'entrevista_programada'
  | 'entrevista_realizada'
  | 'en_decision'
  | 'oferta_enviada'
  | 'contratada'
  | 'rechazada'
  | 'retirada'
  | 'descartada_por_caducidad';

export type MiEntrevista = {
  id: string;
  candidatura_id: string;
  fecha_hora: string;
  duracion_min: number;
  modalidad: string;
  lugar_enlace: string | null;
  estado: 'programada' | 'realizada' | 'cancelada';
};

export type Mensaje = {
  id: number;
  candidatura_id: string;
  de_candidato: boolean;
  texto: string;
  created_at: string;
};

/** Texto del estado tal como lo ve el candidato (no se enseña nada interno). */
export const TEXTO_ESTADO: Record<EstadoCandidatura, string> = {
  recibida: 'Recibida',
  en_revision: 'En revisión',
  preseleccionada: 'Preseleccionada',
  entrevista_programada: 'Entrevista programada',
  entrevista_realizada: 'Entrevista realizada',
  en_decision: 'En decisión',
  oferta_enviada: 'Oferta enviada',
  contratada: 'Contratada',
  rechazada: 'Proceso cerrado',
  retirada: 'Retirada',
  descartada_por_caducidad: 'Proceso cerrado',
};

/** Pasos del seguimiento que se dibujan en pantalla (el orden es solo visual). */
export const PASOS_SEGUIMIENTO: { clave: string; texto: string; estados: EstadoCandidatura[] }[] = [
  { clave: 'recibida', texto: 'Recibida', estados: ['recibida'] },
  { clave: 'revision', texto: 'En revisión', estados: ['en_revision', 'preseleccionada'] },
  { clave: 'entrevista', texto: 'Entrevista', estados: ['entrevista_programada', 'entrevista_realizada'] },
  { clave: 'decision', texto: 'Decisión', estados: ['en_decision', 'oferta_enviada', 'contratada'] },
];

export function esProcesoCerrado(e: EstadoCandidatura): boolean {
  return ['contratada', 'rechazada', 'retirada', 'descartada_por_caducidad'].includes(e);
}

export function mensajeDeErrorSeleccion(e: unknown): string {
  const m = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : '';
  // Los mensajes de las funciones de la base de datos ya están en español y pensados para mostrarse.
  if (m && m.length < 220 && !/^(JWT|FetchError|TypeError|Network)/i.test(m)) return m;
  return 'No se ha podido completar la acción. Inténtalo de nuevo.';
}

export async function listarOfertasPublicas(): Promise<OfertaPublica[]> {
  const { data, error } = await supabase
    .from('seleccion_ofertas_publicas')
    .select('*')
    .order('publicada_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as OfertaPublica[];
}

export async function obtenerMiCandidato(userId: string): Promise<Candidato | null> {
  const { data, error } = await supabase
    .from('seleccion_candidatos')
    .select('user_id,nombre_completo,email,telefono,localidad,resumen,cv_path')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return (data as Candidato | null) ?? null;
}

export const VERSION_CONSENTIMIENTO = 'v1';

export async function registrarCandidato(d: {
  nombre: string;
  telefono: string;
  localidad: string;
  resumen: string;
}): Promise<void> {
  const { error } = await supabase.rpc('sel_registrar_candidato', {
    p_nombre: d.nombre.trim(),
    p_telefono: d.telefono.trim() || null,
    p_localidad: d.localidad.trim() || null,
    p_resumen: d.resumen.trim() || null,
    p_version_consentimiento: VERSION_CONSENTIMIENTO,
    p_acepta: true,
  });
  if (error) throw error;
}

export async function actualizarMisDatos(userId: string, d: { telefono: string; localidad: string; resumen: string }) {
  const { error } = await supabase
    .from('seleccion_candidatos')
    .update({ telefono: d.telefono.trim() || null, localidad: d.localidad.trim() || null, resumen: d.resumen.trim() || null })
    .eq('user_id', userId);
  if (error) throw error;
}

/** Sube el CV al bucket privado (carpeta = id del usuario) y guarda la ruta en el perfil del candidato. */
export async function subirCv(userId: string, uri: string, mime: string, nombre: string): Promise<string> {
  const ruta = await subirArchivoPrivado('seleccion-cv', userId, uri, mime, nombre);
  const { error } = await supabase.from('seleccion_candidatos').update({ cv_path: ruta }).eq('user_id', userId);
  if (error) throw error;
  return ruta;
}

export async function postular(ofertaId: string, respuestas: Record<string, string>, carta: string): Promise<string> {
  const { data, error } = await supabase.rpc('sel_postular', {
    p_oferta: ofertaId,
    p_respuestas: respuestas,
    p_carta: carta.trim() || null,
  });
  if (error) throw error;
  return data as string;
}

export async function retirarCandidatura(id: string): Promise<void> {
  const { error } = await supabase.rpc('sel_retirar_candidatura', { p_id: id });
  if (error) throw error;
}

export async function misCandidaturas(): Promise<MiCandidatura[]> {
  const { data, error } = await supabase
    .from('seleccion_mis_candidaturas')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as MiCandidatura[];
}

export async function misEntrevistas(candidaturaId: string): Promise<MiEntrevista[]> {
  const { data, error } = await supabase
    .from('seleccion_mis_entrevistas')
    .select('*')
    .eq('candidatura_id', candidaturaId)
    .order('fecha_hora', { ascending: true });
  if (error) throw error;
  return (data ?? []) as MiEntrevista[];
}

export async function listarMensajes(candidaturaId: string): Promise<Mensaje[]> {
  const { data, error } = await supabase
    .from('seleccion_mensajes')
    .select('id,candidatura_id,de_candidato,texto,created_at')
    .eq('candidatura_id', candidaturaId)
    .order('id', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Mensaje[];
}

export async function enviarMensaje(candidaturaId: string, texto: string): Promise<void> {
  const { error } = await supabase.rpc('sel_enviar_mensaje', { p_candidatura: candidaturaId, p_texto: texto.trim() });
  if (error) throw error;
  await supabase.rpc('sel_marcar_leidos', { p_candidatura: candidaturaId });
}

export async function solicitarDerecho(tipo: 'acceso' | 'rectificacion' | 'supresion', detalle: string): Promise<void> {
  const { error } = await supabase.rpc('sel_solicitar_derecho', { p_tipo: tipo, p_detalle: detalle.trim() || null });
  if (error) throw error;
}

/** Copia de los datos del propio candidato (derecho de acceso). No incluye notas internas del equipo. */
export async function exportarMisDatos(): Promise<unknown> {
  const { data, error } = await supabase.rpc('sel_exportar_datos', {});
  if (error) throw error;
  return data;
}

// ───────────────────────── Perfil profesional y bolsa de empleo (migración 0078) ─────────────────────────
export type FormacionItem = { tipo: 'curso' | 'certificacion'; nombre: string; entidad: string | null; anio: number | null };
export type Disponibilidad = 'inmediata' | 'un_mes' | 'a_consultar';
export type PerfilProfesional = {
  oficios: string[];
  anios_experiencia: number | null;
  provincias: string[];
  disponibilidad: Disponibilidad | null;
  tiene_vehiculo: boolean;
  en_bolsa: boolean;
  bolsa_consentimiento_at: string | null;
};

/** Versión del texto de consentimiento de la bolsa. Si cambia el texto, cambia esta versión. */
export const VERSION_CONSENTIMIENTO_BOLSA = 'bolsa-v1';

export async function miPerfilProfesional(): Promise<{ perfil: PerfilProfesional | null; formacion: FormacionItem[] }> {
  const { data, error } = await supabase.rpc('sel_mi_perfil_profesional');
  if (error) throw error;
  const d = data as { perfil: PerfilProfesional | null; formacion: FormacionItem[] | null } | null;
  return { perfil: d?.perfil ?? null, formacion: d?.formacion ?? [] };
}

export async function guardarPerfilProfesional(d: {
  oficios: string[];
  anios: number | null;
  provincias: string[];
  disponibilidad: Disponibilidad | null;
  vehiculo: boolean;
  formacion: FormacionItem[];
}): Promise<void> {
  const { error } = await supabase.rpc('sel_guardar_perfil_profesional', {
    p_oficios: d.oficios,
    p_anios: d.anios,
    p_provincias: d.provincias,
    p_disponibilidad: d.disponibilidad,
    p_vehiculo: d.vehiculo,
    p_formacion: d.formacion,
  });
  if (error) throw error;
}

export async function entrarBolsa(): Promise<void> {
  const { error } = await supabase.rpc('sel_entrar_bolsa', { p_version_consentimiento: VERSION_CONSENTIMIENTO_BOLSA, p_acepta: true });
  if (error) throw error;
}

export async function salirBolsa(): Promise<void> {
  const { error } = await supabase.rpc('sel_salir_bolsa');
  if (error) throw error;
}