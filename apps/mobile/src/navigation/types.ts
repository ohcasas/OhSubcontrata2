/**
 * Tipos de navegación. Se irán ampliando con los parámetros reales de cada
 * pantalla (p.ej. DetalleObra necesitará obraId) en la siguiente fase.
 */

import type { NavigatorScreenParams } from '@react-navigation/native';
import type { OfertaPublica, MiCandidatura } from '../services/seleccion';

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
  RegistroParticular: undefined;
  RegistroEmpresa: { rol: RolEmpresaColaboradora };
  // «Trabaja con nosotros» (candidatos). Las ofertas se pueden ver sin sesión.
  EmpleoOfertas: undefined;
  EmpleoOferta: { oferta: OfertaPublica };
  RegistroCandidato: undefined;
};

export type CandidatoTabParamList = {
  MiCandidatura: undefined;
  Ofertas: undefined;
  MensajesCandidato: undefined;
  MisDatos: undefined;
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

export type ParticularTabParamList = {
  Peticiones: undefined;
  Perfil: undefined;
};

export type TecnicoTabParamList = {
  Visitas: undefined;
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
  AppParticular: NavigatorScreenParams<ParticularTabParamList> | undefined;
  AppTecnico: NavigatorScreenParams<TecnicoTabParamList> | undefined;
  AppConecta: undefined;
  CuentaNoActiva: undefined;
  // Espacio del candidato de «Trabaja con nosotros» (cuenta sin perfil del marketplace).
  AppCandidato: undefined;
  CandidatoAlta: undefined;
  CandidatoPendiente: undefined;
  EmpleoOferta: { oferta: OfertaPublica };
  Postular: { oferta: OfertaPublica };
  CandidaturaDetalle: { candidatura: MiCandidatura };
  Notificaciones: undefined;
  Chat: { conversacionId: string; nombre: string; tipo: 'privado' | 'soporte'; otroId: string | null };
  Mensajes: undefined;
  ChatNuevo: undefined;
  AppAdmin: undefined;
  DetalleObra: { obraId: string };
  GremioDetalle: { empresaId: string };
  AdminObraDetalle: { obraId: string };
  MisDocumentos: undefined;
  MisTrabajadores: undefined;
  TrabajadorDetalle: { trabajadorId: string };
  TrabajadorForm: { trabajadorId?: string } | undefined;
};