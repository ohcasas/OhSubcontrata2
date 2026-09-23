/**
 * Tipos de navegación. Se irán ampliando con los parámetros reales de cada
 * pantalla (p.ej. DetalleObra necesitará obraId) en la siguiente fase.
 */

export type AuthStackParamList = {
  Login: undefined;
  Registro: undefined;
  RecuperarPassword: undefined;
};

export type SubcontratistaTabParamList = {
  Obras: undefined;
  Postulaciones: undefined;
  Partner: undefined;
  Perfil: undefined;
};

export type AdminTabParamList = {
  ObrasAdmin: undefined;
  PostulacionesAdmin: undefined;
  Gremios: undefined;
  PerfilAdmin: undefined;
};

export type RootStackParamList = {
  Auth: undefined;
  AppSubcontratista: undefined;
  AppAdmin: undefined;
  DetalleObra: { obraId: string };
};
