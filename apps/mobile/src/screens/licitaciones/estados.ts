/** Textos y colores de los estados de una licitación y de sus postulaciones. */
export const ETIQUETA_ESTADO_OBRA: Record<string, string> = {
  abierta: 'Abierta',
  adjudicada: 'Adjudicada',
  en_curso: 'En curso',
  cerrada: 'Finalizada',
  cancelada: 'Cancelada',
};

// Clases escritas completas (no construidas con texto) para que Tailwind las detecte.
export const ESTILO_ESTADO_OBRA: Record<string, { fondo: string; texto: string }> = {
  abierta: { fondo: 'bg-actionTint', texto: 'text-action' },
  adjudicada: { fondo: 'bg-warningTint', texto: 'text-warning' },
  en_curso: { fondo: 'bg-actionTint', texto: 'text-action' },
  cerrada: { fondo: 'bg-successTint', texto: 'text-success' },
  cancelada: { fondo: 'bg-errorTint', texto: 'text-error' },
};

export const ETIQUETA_ESTADO_POSTULACION: Record<string, string> = {
  enviada: 'Pendiente',
  en_revision: 'En revisión',
  aceptada: 'Aceptada',
  rechazada: 'Rechazada',
};

export function fechaCorta(iso: string | null): string {
  if (iso === null) return '—';
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** "50.000", "50000,50", "50 000 €" → número. Devuelve null si no se entiende. */
export function parsearImporte(texto: string): number | null {
  let t = texto.replace(/[€\s]/g, '');
  if (t === '') return null;
  if (t.includes(',')) {
    t = t.replace(/\./g, '').replace(',', '.'); // 1.234,56
  } else if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
    t = t.replace(/\./g, ''); // 50.000
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}