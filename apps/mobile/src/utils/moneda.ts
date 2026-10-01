/**
 * Formatea un importe en euros, a mano, sin depender de Intl.NumberFormat.
 *
 * Por qué: en Android, el motor de JS (Hermes) no siempre lleva los datos
 * de formato de cada configuración regional — Intl.NumberFormat('es-ES',
 * { currency: 'EUR' }) puede acabar mostrando '$' en vez de '€' en una
 * compilación real, aunque en desarrollo se vea bien. Formateando el
 * número nosotros mismos (miles con punto, decimales con coma, símbolo al
 * final) el resultado es siempre el mismo, en cualquier dispositivo.
 *
 * Todos los importes de la app son en euros — el parámetro `moneda` se
 * mantiene solo por compatibilidad con las llamadas ya existentes.
 */
export function formatearMoneda(valor: number, _moneda?: string): string {
  const conDecimales = valor.toFixed(2);
  const [entero, decimales] = conDecimales.split('.');
  const enteroConPuntos = entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${enteroConPuntos},${decimales} €`;
}