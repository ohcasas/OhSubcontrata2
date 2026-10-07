/**
 * Lo que se pide a cada perfil al darse de alta: campos del formulario y documentos para
 * verificar la cuenta. Viene de la base de datos (tablas campos_registro y
 * documentos_requeridos), así que cambiarlo no exige recompilar la app.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { validarDocumentoFiscal } from '../utils/documentoFiscal';

export type CampoRegistro = {
  clave: string;
  etiqueta: string;
  tipo: 'texto' | 'seleccion';
  opciones: string[] | null;
  obligatorio: boolean;
  placeholder: string | null;
  ayuda: string | null;
  orden: number;
};

export type DocumentoRequerido = {
  tipo: string;
  etiqueta: string;
  descripcion: string | null;
  obligatorio: boolean;
  orden: number;
};

export const MENSAJE_DOCUMENTO_NO_VALIDO =
  'Revisa este número: no parece un CIF, NIF o NIE válido. Si es de otro país, escríbenos a software@ohcasas.es.';

export function useCatalogoRegistro(role: string) {
  const [campos, setCampos] = useState<CampoRegistro[]>([]);
  const [documentos, setDocumentos] = useState<DocumentoRequerido[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let activo = true;
    setCargando(true);
    setError(null);
    (async () => {
      const [c, d] = await Promise.all([
        supabase
          .from('campos_registro')
          .select('clave, etiqueta, tipo, opciones, obligatorio, placeholder, ayuda, orden')
          .eq('role', role)
          .order('orden', { ascending: true }),
        supabase
          .from('documentos_requeridos')
          .select('tipo, etiqueta, descripcion, obligatorio, orden')
          .eq('role', role)
          .order('orden', { ascending: true }),
      ]);
      if (!activo) return;
      if (c.error || d.error) {
        setError((c.error ?? d.error)?.message ?? 'No se ha podido cargar el formulario.');
      } else {
        setCampos((c.data as CampoRegistro[] | null) ?? []);
        setDocumentos((d.data as DocumentoRequerido[] | null) ?? []);
      }
      setCargando(false);
    })();
    return () => {
      activo = false;
    };
  }, [role, intento]);

  const recargar = useCallback(() => setIntento((n) => n + 1), []);
  return { campos, documentos, cargando, error, recargar };
}

/** Errores de los campos del perfil: obligatorios vacíos y CIF/NIF/NIE mal formado. */
export function validarCampos(campos: CampoRegistro[], valores: Record<string, string>): Record<string, string> {
  const errores: Record<string, string> = {};
  for (const c of campos) {
    const v = (valores[c.clave] ?? '').trim();
    if (c.obligatorio && v === '') {
      errores[c.clave] = 'Este dato es obligatorio.';
      continue;
    }
    if (c.clave === 'cif' && v !== '' && validarDocumentoFiscal(v) === null) {
      errores[c.clave] = MENSAJE_DOCUMENTO_NO_VALIDO;
    }
  }
  return errores;
}

/**
 * nombre_empresa y cif viajan aparte (los leen los disparadores de registro de siempre);
 * el resto va dentro de datos_perfil.
 */
export function separarValores(valores: Record<string, string>) {
  const limpios: Record<string, string> = {};
  for (const [clave, valor] of Object.entries(valores)) {
    const v = valor.trim();
    if (v !== '') limpios[clave] = v;
  }
  const { nombre_empresa, cif, ...resto } = limpios;
  return {
    nombre_empresa: nombre_empresa as string | undefined,
    cif: cif !== undefined ? cif.toUpperCase() : undefined,
    datos_perfil: resto,
  };
}