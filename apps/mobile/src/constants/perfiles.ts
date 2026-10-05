/** Nombre visible de cada tipo de cuenta (valor de profiles.role). */
export const ETIQUETA_PERFIL: Record<string, string> = {
  subcontratista: 'Oficios',
  referidor: 'Recomendador',
  promotor: 'Promotor',
  constructora: 'Constructora',
  arquitecto: 'Arquitecto',
  proveedor: 'Proveedor',
  profesional: 'Profesional',
  administrador: 'Inmobiliaria / Administrador',
};

/** Todos los tipos de cuenta que se registran solos, salvo Oficios (que tiene su pantalla, Gremios). */
export const ROLES_RED = ['referidor', 'promotor', 'constructora', 'arquitecto', 'proveedor', 'profesional', 'administrador'];