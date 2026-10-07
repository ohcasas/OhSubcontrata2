/**
 * Comprueba si un CIF, NIF o NIE tiene un formato válido (letra o dígito de control
 * correctos). Sirve para que el admin sepa a cuáles mirar con más atención; NO
 * comprueba que la empresa o la persona existan: eso hay que hacerlo a mano.
 *
 * Acepta mayúsculas o minúsculas y separadores (espacios, guiones, puntos).
 * Devuelve el tipo de documento si es válido, o null si no lo es.
 */
const LETRAS_NIF = 'TRWAGMYFPDXBNJZSQVHLCKE';

export type TipoDocumento = 'NIF' | 'NIE' | 'CIF';

export function validarDocumentoFiscal(texto: string | null | undefined): TipoDocumento | null {
  if (texto === null || texto === undefined) return null;
  const d = texto.toUpperCase().replace(/[\s.\-/]/g, '');

  // NIF de persona física (autónomos): 8 dígitos + letra
  if (/^\d{8}[A-Z]$/.test(d)) {
    return LETRAS_NIF[Number(d.slice(0, 8)) % 23] === d[8] ? 'NIF' : null;
  }

  // NIE (extranjeros): X, Y o Z + 7 dígitos + letra. X, Y, Z equivalen a 0, 1, 2.
  if (/^[XYZ]\d{7}[A-Z]$/.test(d)) {
    const numero = Number('XYZ'.indexOf(d[0]) + d.slice(1, 8));
    return LETRAS_NIF[numero % 23] === d[8] ? 'NIE' : null;
  }

  // CIF (sociedades): letra + 7 dígitos + control (dígito o letra según el tipo de entidad)
  if (/^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(d)) {
    const cuerpo = d.slice(1, 8);
    let suma = 0;
    for (let i = 0; i < 7; i++) {
      const cifra = Number(cuerpo[i]);
      if (i % 2 === 0) {
        // posiciones 1.ª, 3.ª, 5.ª y 7.ª: se duplican y se suman sus dígitos
        const doble = cifra * 2;
        suma += Math.floor(doble / 10) + (doble % 10);
      } else {
        suma += cifra;
      }
    }
    const control = (10 - (suma % 10)) % 10;
    const letra = 'JABCDEFGHI'[control];
    const ultimo = d[8];
    const exigeLetra = 'PQRSNW'.includes(d[0]); // entidades públicas y extranjeras: letra
    const exigeNumero = 'ABEH'.includes(d[0]); // sociedades anónimas, limitadas...: número
    const valido = exigeLetra ? ultimo === letra : exigeNumero ? ultimo === String(control) : ultimo === String(control) || ultimo === letra;
    return valido ? 'CIF' : null;
  }

  return null;
}