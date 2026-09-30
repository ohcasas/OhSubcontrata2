/**
 * Niveles del Club OH Partner.
 *
 * IMPORTANTE: estos umbrales son un ESPEJO de los que están fijados a mano
 * dentro de la función SQL `finalizar_obra()` (migraciones 0005/0012), que
 * es quien realmente recalcula `empresas_subcontratistas.nivel_partner`.
 * Si se cambia un umbral, hay que cambiarlo en los dos sitios. Cuando haya
 * una tabla de configuración en la base de datos, esto debería leerse de ahí.
 */
export type NivelPartner = 'bronce' | 'plata' | 'oro' | 'platino';

/**
 * Obras que una empresa debe completar para desbloquear el Club OH Partner
 * (los puntos empiezan a sumarse con la 3ª obra y el canje se habilita).
 * Espejo de las constantes `c_obras_para_puntos` / `c_obras_para_canje` de
 * las funciones SQL `cambiar_estado_obra()` y `solicitar_canje()`.
 */
export const OBRAS_PARA_DESBLOQUEAR_CLUB = 3;

export const ORDEN_NIVELES: NivelPartner[] = ['bronce', 'plata', 'oro', 'platino'];

/** Puntos mínimos para estar en cada nivel. */
export const UMBRAL_NIVEL: Record<NivelPartner, number> = {
  bronce: 0,
  plata: 1000,
  oro: 2500,
  platino: 5000,
};

export const ETIQUETA_NIVEL: Record<NivelPartner, string> = {
  bronce: 'Bronce',
  plata: 'Plata',
  oro: 'Oro',
  platino: 'Platino',
};

/** Bronce = nivel 1 … Platino = nivel 4. */
export function numeroNivel(nivel: NivelPartner): number {
  return ORDEN_NIVELES.indexOf(nivel) + 1;
}

/**
 * Cuánto le falta a una empresa para el siguiente nivel, partiendo del nivel
 * que tiene guardado. `puntos` deben ser los puntos TOTALES ganados (no el
 * saldo canjeable: el rango no baja al canjear). `siguiente` es null si ya está en el máximo.
 */
export function progresoHaciaSiguiente(nivel: NivelPartner, puntos: number) {
  const siguiente = ORDEN_NIVELES[ORDEN_NIVELES.indexOf(nivel) + 1] ?? null;
  if (siguiente === null) {
    return { siguiente: null, progreso: 1, puntosFaltan: 0 };
  }
  const desde = UMBRAL_NIVEL[nivel];
  const hasta = UMBRAL_NIVEL[siguiente];
  const progreso = (puntos - desde) / (hasta - desde);
  return {
    siguiente,
    progreso: Math.min(Math.max(progreso, 0), 1),
    puntosFaltan: Math.max(hasta - puntos, 0),
  };
}