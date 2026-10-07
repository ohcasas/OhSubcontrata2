/**
 * Tipos de navegación. Se irán ampliando con los parámetros reales de cada
 * pantalla (p.ej. DetalleObra necesitará obraId) en la siguiente fase.
 */

import type { NavigatorScreenParams } from '@react-navigation/native';

export type RolEmpresaColaboradora =
  | 'promotor'
  | 'constructora'
  | 'arquitecto'
  | 'proveedor'
  | 'profesional'
  | 'administrador';

export type AuthStackParamList = {
  Login: undefined;
  RecuperarPassword: undefined;
  ElegirTipoCuenta: undefined;
  Registro: undefined;
  RegistroReferidor: undefined;
  RegistroEmpresa: { rol: RolEmpresaColaboradora };
};

export type SubcontratistaTabParamList = {
  Obras: undefined;
  Postulaciones: undefined;
  Tablon: undefined;
  Recomienda: undefined;
  Partner: undefined;
  Perfil: undefined;
};

export type ReferidorTabParamList = {
  Recomienda: undefined;
  Perfil: undefined;
};

export type AdminTabParamList = {
  ObrasAdmin: undefined;
  PostulacionesAdmin: undefined;
  Gremios: undefined;
  RecompensasAdmin: undefined;
  Conecta: undefined;
  PerfilAdmin: undefined;
};

export type RootStackParamList = {
  Auth: undefined;
  AppSubcontratista: NavigatorScreenParams<SubcontratistaTabParamList> | undefined;
  AppReferidor: NavigatorScreenParams<ReferidorTabParamList> | undefined;
  AppConecta: undefined;
  CuentaNoActiva: undefined;
  Notificaciones: undefined;
  AppAdmin: undefined;
  DetalleObra: { obraId: string };
  GremioDetalle: { empresaId: string };
  AdminObraDetalle: { obraId: string };
};