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

/** Todas las cuentas que se registran solas, Oficios incluidos (para verificarlas en el panel de admin). */
export const ROLES_CUENTAS = ['subcontratista', 'referidor', 'promotor', 'constructora', 'arquitecto', 'proveedor', 'profesional', 'administrador'];

/** Todos los tipos de cuenta que se registran solos, salvo Oficios (que tiene su pantalla, Gremios). */
export const ROLES_RED = ['referidor', 'promotor', 'constructora', 'arquitecto', 'proveedor', 'profesional', 'administrador'];