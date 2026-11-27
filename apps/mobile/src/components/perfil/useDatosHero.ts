/**
 * Datos de la cabecera del Perfil según el tipo de cuenta. Todo son cifras
 * de actividad (puntos, licitaciones, peticiones...), nunca dinero.
 */
import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../services/supabase';
import { misPeticiones } from '../../services/peticiones';
import { catalogoActivo } from '../../services/catalogo';
import { ETIQUETA_NIVEL, progresoHaciaSiguiente, type NivelPartner } from '../../constants/niveles';
import type { DatosTarjeta } from './TarjetaCristal';
import type { Acceso } from './PerfilHero';

export type DatosHero = {
  etiqueta: string;
  numero: string;
  subtitulo: string;
  tarjetas: DatosTarjeta[];
  accesos: Acceso[];
};

const ROLES_LICITACIONES = ['promotor', 'constructora', 'administrador'];
const ROLES_DIRECTORIO = ['arquitecto', 'proveedor', 'profesional'];

const NOMBRE_ROL: Record<string, string> = {
  subcontratista: 'Subcontratista',
  particular: 'Particular',
  constructora: 'Constructora',
  promotor: 'Promotor',
  administrador: 'Inmobiliaria',
  arquitecto: 'Arquitecto',
  proveedor: 'Proveedor',
  profesional: 'Profesional',
  referidor: 'Recomendador',
  tecnico: 'Técnico',
};

const fmt = (n: number) => n.toLocaleString('es-ES');

function carnet(nombre: string, rol: string, userId: string): DatosTarjeta {
  return {
    icono: 'shield',
    titulo: 'Carnet 3B',
    valor: `${nombre.trim().split(' ')[0] || nombre} · ${NOMBRE_ROL[rol] ?? 'Cuenta'}`,
    subtitulo: `N.º 3B-${userId.replace(/-/g, '').slice(0, 4).toUpperCase()}`,
    dibujo: 'arcos',
    gama: 'azul',
    chip: true,
  };
}

const COMUNES: Acceso[] = [
  { etiqueta: 'Mensajes', icono: 'message-circle', destino: 'Mensajes' },
  { etiqueta: 'Avisos', icono: 'bell', destino: 'Notificaciones' },
  { etiqueta: 'Guía', icono: 'help-circle', destino: 'Guia' },
  { etiqueta: 'Tutorial', icono: 'play-circle', destino: 'Tutorial' },
];

export function useDatosHero(rol: string | null, userId: string | null, nombre: string): DatosHero | null {
  const [datos, setDatos] = useState<DatosHero | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (rol === null || userId === null) return;
      let activo = true;
      (async () => {
        const base = carnet(nombre, rol, userId);
        let d: DatosHero;

        if (rol === 'subcontratista') {
          const { data: perfil } = await supabase.from('profiles').select('empresa_id').eq('id', userId).maybeSingle();
          const empresaId = (perfil?.empresa_id as string | null) ?? null;
          let puntos = 0;
          let totales = 0;
          let nivel: NivelPartner = 'bronce';
          let docsVigentes = 0;
          let docsTotal = 0;
          if (empresaId !== null) {
            const [{ data: emp }, { data: docs }] = await Promise.all([
              supabase.from('empresas_subcontratistas').select('nivel_partner, puntos_disponibles, puntos_totales').eq('id', empresaId).maybeSingle(),
              supabase.from('documentos_homologacion').select('estado').eq('empresa_id', empresaId),
            ]);
            if (emp) {
              puntos = Number(emp.puntos_disponibles ?? 0);
              totales = Number(emp.puntos_totales ?? 0);
              nivel = (emp.nivel_partner as NivelPartner) ?? 'bronce';
            }
            const lista = (docs as { estado: string }[] | null) ?? [];
            docsTotal = lista.length;
            docsVigentes = lista.filter((x) => x.estado === 'vigente').length;
          }
          const { siguiente, puntosFaltan } = progresoHaciaSiguiente(nivel, totales);
          d = {
            etiqueta: 'Puntos disponibles',
            numero: fmt(puntos),
            subtitulo: siguiente === null ? `Nivel ${ETIQUETA_NIVEL[nivel]} · el más alto` : `Nivel ${ETIQUETA_NIVEL[nivel]} · ${fmt(puntosFaltan)} para ${ETIQUETA_NIVEL[siguiente]}`,
            tarjetas: [
              base,
              { icono: 'award', titulo: 'Nivel partner', valor: ETIQUETA_NIVEL[nivel], subtitulo: `${fmt(totales)} puntos ganados`, dibujo: 'ondas', gama: 'noche' },
              {
                icono: 'file-text',
                titulo: 'Documentos',
                valor: docsTotal === 0 ? 'Sin subir' : `${docsVigentes} de ${docsTotal}`,
                subtitulo: docsTotal === 0 ? 'Empieza por el alta' : docsTotal - docsVigentes > 0 ? `${docsTotal - docsVigentes} por revisar` : 'Todos vigentes',
                dibujo: 'planos',
                gama: 'cielo',
              },
            ],
            accesos: [
              { etiqueta: 'Documentos', icono: 'file-text', destino: 'MisDocumentos' },
              { etiqueta: 'Trabajadores', icono: 'users', destino: 'MisTrabajadores' },
              { etiqueta: 'Recomienda', icono: 'share-2', destino: 'Recomienda' },
              { etiqueta: 'Partner', icono: 'award', destino: 'Partner' },
              ...COMUNES,
            ],
          };
        } else if (ROLES_LICITACIONES.includes(rol)) {
          const { data } = await supabase.rpc('mis_licitaciones');
          const lista = (data as { estado: string }[] | null) ?? [];
          const abiertas = lista.filter((l) => l.estado === 'abierta').length;
          d = {
            etiqueta: 'Licitaciones abiertas',
            numero: String(abiertas),
            subtitulo: `${lista.length} publicadas en total`,
            tarjetas: [
              base,
              { icono: 'list', titulo: 'Licitaciones', valor: String(lista.length), subtitulo: `${abiertas} abiertas`, dibujo: 'planos', gama: 'noche' },
              { icono: 'clipboard', titulo: 'Tablón', valor: 'Novedades', subtitulo: 'Lo que se necesita hoy', dibujo: 'ondas', gama: 'cielo' },
            ],
            accesos: [
              { etiqueta: 'Licitaciones', icono: 'list', destino: 'Licitaciones' },
              { etiqueta: 'Tablón', icono: 'clipboard', destino: 'Tablon' },
              { etiqueta: 'Directorio', icono: 'book-open', destino: 'Directorio' },
              { etiqueta: 'Documentos', icono: 'file-text', destino: 'MisDocumentos' },
              ...COMUNES,
            ],
          };
        } else if (rol === 'particular') {
          const [lista, catalogo] = await Promise.all([misPeticiones().catch(() => []), catalogoActivo().catch(() => false)]);
          const activas = lista.filter((p) => !['cancelada', 'cerrada', 'descartada'].includes(p.estado));
          const enRevision = activas.filter((p) => p.estado === 'en_revision').length;
          const tarjetas: DatosTarjeta[] = [
            base,
            { icono: 'home', titulo: 'Mis peticiones', valor: String(activas.length), subtitulo: enRevision > 0 ? `${enRevision} en revisión` : 'Todo al día', dibujo: 'planos', gama: 'noche' },
          ];
          const accesos: Acceso[] = [{ etiqueta: 'Peticiones', icono: 'home', destino: 'Peticiones' }];
          if (catalogo) {
            tarjetas.push({ icono: 'grid', titulo: 'Catálogo', valor: 'Presupuesto', subtitulo: 'Calcula tu reforma', dibujo: 'ondas', gama: 'cielo' });
            accesos.push({ etiqueta: 'Catálogo', icono: 'grid', destino: 'Inicio' });
          }
          d = {
            etiqueta: 'Peticiones activas',
            numero: String(activas.length),
            subtitulo: enRevision > 0 ? `${enRevision} en revisión` : 'Aquí verás cómo avanza cada una',
            tarjetas,
            accesos: [...accesos, ...COMUNES],
          };
        } else if (rol === 'referidor') {
          const { data } = await supabase.from('referencias_comerciales').select('estado').eq('referidor_id', userId);
          const lista = (data as { estado: string }[] | null) ?? [];
          const ventas = lista.filter((r) => ['venta', 'comision_disponible'].includes(r.estado)).length;
          d = {
            etiqueta: 'Recomendaciones enviadas',
            numero: String(lista.length),
            subtitulo: `${ventas} han llegado a venta`,
            tarjetas: [base, { icono: 'share-2', titulo: 'Recomienda', valor: String(lista.length), subtitulo: `${ventas} en venta`, dibujo: 'ondas', gama: 'noche' }],
            accesos: [
              { etiqueta: 'Recomienda', icono: 'share-2', destino: 'Recomienda' },
              { etiqueta: 'Documentos', icono: 'file-text', destino: 'MisDocumentos' },
              ...COMUNES,
            ],
          };
        } else {
          const { count } = await supabase.from('notificaciones').select('id', { count: 'exact', head: true }).eq('leida', false);
          d = {
            etiqueta: 'Avisos sin leer',
            numero: String(count ?? 0),
            subtitulo: ROLES_DIRECTORIO.includes(rol) ? 'Tu ficha del Directorio está debajo' : 'Tu actividad en 3B Conecta',
            tarjetas: [base],
            accesos: [
              ...(ROLES_DIRECTORIO.includes(rol)
                ? ([
                    { etiqueta: 'Tablón', icono: 'clipboard', destino: 'Tablon' },
                    { etiqueta: 'Directorio', icono: 'book-open', destino: 'Directorio' },
                    { etiqueta: 'Documentos', icono: 'file-text', destino: 'MisDocumentos' },
                  ] as Acceso[])
                : []),
              ...COMUNES,
            ],
          };
        }
        if (activo) setDatos(d);
      })();
      return () => {
        activo = false;
      };
    }, [rol, userId, nombre]),
  );

  return datos;
}


