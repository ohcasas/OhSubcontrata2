/**
 * Tipos de navegación. Se irán ampliando con los parámetros reales de cada
 * pantalla (p.ej. DetalleObra necesitará obraId) en la siguiente fase.
 */

import type { NavigatorScreenParams } from '@react-navigation/native';

export type AuthStackParamList = {
  Login: undefined;
  ElegirTipoCuenta: undefined;
  Registro: undefined;
  RegistroReferidor: undefined;
};

export type SubcontratistaTabParamList = {
  Obras: undefined;
  Postulaciones: undefined;
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
  Referidos: undefined;
  PerfilAdmin: undefined;
};

export type RootStackParamList = {
  Auth: undefined;
  AppSubcontratista: NavigatorScreenParams<SubcontratistaTabParamList> | undefined;
  AppReferidor: NavigatorScreenParams<ReferidorTabParamList> | undefined;
  Notificaciones: undefined;
  AppAdmin: undefined;
  DetalleObra: { obraId: string };
  GremioDetalle: { empresaId: string };
  AdminObraDetalle: { obraId: string };
};