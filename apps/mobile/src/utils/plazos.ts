/**
 * Utilidades de plazo de cierre de una licitación (`obras.plazo_cierre`).
 *
 * Regla de "licitación prioritaria": una obra abierta cuyo plazo de cierre
 * vence en 48 horas o menos (y todavía no ha vencido). Vive aquí, en un solo
 * sitio, para que la lista, el detalle y el panel de admin coincidan siempre.
 */
export const HORAS_PRIORITARIA = 48;
const MS_PRIORITARIA = HORAS_PRIORITARIA * 60 * 60 * 1000;

/** Milisegundos que faltan para el cierre (negativo si ya venció), o null si no hay plazo. */
export function msHastaCierre(plazoCierre: string | null, ahora: number): number | null {
  if (plazoCierre === null) return null;
  const cierre = Date.parse(plazoCierre);
  if (Number.isNaN(cierre)) return null;
  return cierre - ahora;
}

/** ¿Vence en ≤48 h y aún no ha vencido? */
export function esPrioritaria(plazoCierre: string | null, ahora: number): boolean {
  const ms = msHastaCierre(plazoCierre, ahora);
  return ms !== null && ms > 0 && ms <= MS_PRIORITARIA;
}

/** "48h", "5h", "20 min"… para el badge "Cierra en …". */
export function textoCuentaAtras(ms: number): string {
  const minutos = Math.max(Math.ceil(ms / 60000), 1);
  if (minutos < 60) return `${minutos} min`;
  return `${Math.ceil(minutos / 60)}h`;
}

/** Cuenta atrás para plazos largos (admin): "3 días", "36h", "20 min". */
export function textoCuentaAtrasLarga(ms: number): string {
  if (ms <= 0) return 'vencido';
  const horas = ms / 3600000;
  if (horas >= 48) return `${Math.floor(horas / 24)} días`;
  return textoCuentaAtras(ms);
}

/** 21 → "3 semanas", 14 → "2 semanas", 10 → "10 días", 1 → "1 día". */
export function textoDuracion(dias: number): string {
  if (dias >= 7 && dias % 7 === 0) {
    const semanas = dias / 7;
    return `${semanas} semana${semanas === 1 ? '' : 's'}`;
  }
  return `${dias} día${dias === 1 ? '' : 's'}`;
}

export function formatearFechaHora(fechaIso: string): string {
  return new Date(fechaIso).toLocaleString('es-ES', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}