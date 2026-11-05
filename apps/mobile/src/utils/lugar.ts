/** Texto de ubicación de una obra: la ubicación escrita y, si no la incluye, la provincia. */
export function lugarObra(ubicacion: string | null | undefined, provincia: string | null | undefined): string | null {
  const u = (ubicacion ?? '').trim();
  const p = (provincia ?? '').trim();
  if (u === '' && p === '') return null;
  if (p === '') return u;
  if (u === '') return p;
  return quitarAcentos(u).includes(quitarAcentos(p)) ? u : `${u} · ${p}`;
}

/** Minúsculas y sin acentos, para comparar nombres de provincia. */
export function quitarAcentos(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}