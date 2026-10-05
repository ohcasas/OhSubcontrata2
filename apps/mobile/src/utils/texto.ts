/**
 * Búsqueda de texto sin distinguir mayúsculas ni tildes ("arquitecto" encuentra
 * "Arquitecto" y "Aparejador" encuentra "aparejador").
 *
 * Las tildes se quitan a mano, con una tabla, en vez de usar
 * String.prototype.normalize: en Android el motor de JS (Hermes) no siempre
 * lleva todos los datos de idioma — nos pasó con el formato de moneda — y
 * así el resultado es el mismo en cualquier dispositivo.
 */
const SIN_TILDE: Record<string, string> = {
  á: 'a', à: 'a', ä: 'a', â: 'a',
  é: 'e', è: 'e', ë: 'e', ê: 'e',
  í: 'i', ì: 'i', ï: 'i', î: 'i',
  ó: 'o', ò: 'o', ö: 'o', ô: 'o',
  ú: 'u', ù: 'u', ü: 'u', û: 'u',
  ñ: 'n', ç: 'c',
};

export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .replace(/[áàäâéèëêíìïîóòöôúùüûñç]/g, (c) => SIN_TILDE[c] ?? c)
    .trim();
}

/** true si la búsqueda está vacía o aparece en alguno de los campos. */
export function coincide(busqueda: string, ...campos: (string | null | undefined)[]): boolean {
  const q = normalizar(busqueda);
  if (q === '') return true;
  return campos.some((c) => c !== null && c !== undefined && normalizar(c).includes(q));
}