/**
 * Textos de la ayuda dentro de la app: glosario (Guía) y pasos del tutorial
 * de bienvenida, por tipo de cuenta. Están escritos en lenguaje llano; si
 * cambia una regla (puntos, niveles, precios), se cambia aquí.
 */
import { UMBRAL_NIVEL, ETIQUETA_NIVEL, ORDEN_NIVELES } from './niveles';
import type { ComponentProps } from 'react';
import type { Feather } from '@expo/vector-icons';

type NombreIcono = ComponentProps<typeof Feather>['name'];

export type GrupoAyuda = 'subcontratista' | 'licitaciones' | 'particular' | 'directorio' | 'referidor' | 'general';

export function grupoDeAyuda(rol: string | null): GrupoAyuda {
  if (rol === 'subcontratista') return 'subcontratista';
  if (rol === 'constructora' || rol === 'promotor' || rol === 'administrador') return 'licitaciones';
  if (rol === 'particular') return 'particular';
  if (rol === 'arquitecto' || rol === 'proveedor' || rol === 'profesional') return 'directorio';
  if (rol === 'referidor') return 'referidor';
  return 'general';
}

export type Termino = { pregunta: string; respuesta: string; grupos: GrupoAyuda[] | 'todos' };

const NIVELES_TEXTO = ORDEN_NIVELES.map((n) => `${ETIQUETA_NIVEL[n]} (${UMBRAL_NIVEL[n].toLocaleString('es-ES')} puntos)`).join(', ');

export const GLOSARIO: Termino[] = [
  {
    pregunta: '¿Qué es el carnet 3B?',
    respuesta: 'Es la tarjeta que te identifica dentro de la app, con tu nombre, tu tipo de cuenta y tu número. No es una tarjeta de pago y no se puede usar para pagar.',
    grupos: 'todos',
  },
  {
    pregunta: '¿Qué son los puntos?',
    respuesta: 'Son los puntos del Club 3B Partner. Se acreditan cuando completas obras con 3B y se canjean por recompensas desde la pestaña Partner. No son dinero.',
    grupos: ['subcontratista'],
  },
  {
    pregunta: '¿Qué es el nivel partner?',
    respuesta: `Tu rango en el Club 3B Partner: ${NIVELES_TEXTO}. Depende de todos los puntos que has ganado, así que no baja cuando canjeas.`,
    grupos: ['subcontratista'],
  },
  {
    pregunta: '¿Qué significa «homologado»?',
    respuesta: 'Que tu empresa tiene entregados y vigentes los documentos que pedimos: alta de autónomo, seguro de responsabilidad civil, certificado PRL y corriente de pagos con Hacienda y Seguridad Social. Si uno vence, tendrás que renovarlo.',
    grupos: ['subcontratista'],
  },
  {
    pregunta: '¿Qué es una postulación?',
    respuesta: 'Es tu oferta para trabajar en una obra. Verás su estado en la pestaña Postulaciones: enviada, en revisión o aceptada.',
    grupos: ['subcontratista', 'licitaciones'],
  },
  {
    pregunta: '¿Por qué el precio de las obras es fijo?',
    respuesta: 'En las obras de 3B el precio es el que aparece publicado. Al postularte aceptas ese precio: no hay contraoferta.',
    grupos: ['subcontratista', 'licitaciones'],
  },
  {
    pregunta: '¿Qué es una licitación?',
    respuesta: 'Es una obra que publicas para que otras empresas se postulen. Tú ves las ofertas que llegan y adjudicas la que prefieras.',
    grupos: ['licitaciones'],
  },
  {
    pregunta: '¿Qué es una petición?',
    respuesta: 'Es lo que necesitas hacer en tu vivienda. Nosotros la revisamos y, si hace falta, un técnico te visita. Cuando está lista se publica y las empresas envían sus ofertas.',
    grupos: ['particular'],
  },
  {
    pregunta: '¿Para qué sirve el catálogo?',
    respuesta: 'Para hacerte una idea del coste de una reforma eligiendo partidas. Es una estimación orientativa, no un presupuesto cerrado: el precio definitivo lo confirman las empresas.',
    grupos: ['particular'],
  },
  {
    pregunta: '¿Qué es el Tablón?',
    respuesta: 'Un tablón de avisos donde promotores y constructoras publican lo que necesitan. Todas las cuentas pueden leerlo.',
    grupos: ['subcontratista', 'licitaciones', 'directorio'],
  },
  {
    pregunta: '¿Qué es el Directorio?',
    respuesta: 'La lista de empresas y profesionales de 3B Conecta. Tu ficha es lo que ven los demás de ti: cuanto más completa, más fácil es que te encuentren.',
    grupos: ['licitaciones', 'directorio'],
  },
  {
    pregunta: '¿Cómo funciona Recomienda?',
    respuesta: 'Puedes recomendar a un cliente o a una empresa. Verás en qué punto está cada recomendación y si llega a venta.',
    grupos: ['subcontratista', 'referidor'],
  },
  {
    pregunta: '¿Qué son los avisos?',
    respuesta: 'La campana de arriba te avisa de lo que pasa con tu cuenta: ofertas, cambios de estado o documentos por renovar. El número rojo son los que no has leído.',
    grupos: 'todos',
  },
];

export function glosarioPara(grupo: GrupoAyuda): Termino[] {
  return GLOSARIO.filter((t) => t.grupos === 'todos' || t.grupos.includes(grupo));
}

export type PasoTutorial = { icono: NombreIcono; titulo: string; texto: string };

const PASO_CARNET: PasoTutorial = {
  icono: 'user',
  titulo: 'Tu perfil, de un vistazo',
  texto: 'Arriba ves lo más importante de tu cuenta. Desliza las tarjetas para ver más; la primera es tu carnet 3B.',
};
const PASO_AYUDA: PasoTutorial = {
  icono: 'help-circle',
  titulo: 'Si algo no se entiende',
  texto: 'En tu Perfil, pulsa Guía para ver qué significa cada palabra. Puedes repetir este tutorial cuando quieras.',
};

export const TUTORIAL: Record<GrupoAyuda, PasoTutorial[]> = {
  subcontratista: [
    { icono: 'briefcase', titulo: 'Bienvenido a 3B Conecta', texto: 'Aquí encuentras obras de 3B para tu empresa y sigues todo lo que pasa con ellas.' },
    { icono: 'file-text', titulo: 'Postula a las obras que encajan', texto: 'Abre una obra, mira el detalle y pulsa Postular. El precio es el publicado. Después sigue el estado en Postulaciones.' },
    { icono: 'award', titulo: 'Puntos y nivel partner', texto: 'Cada obra completada suma puntos. Con ellos subes de nivel y puedes canjear recompensas en la pestaña Partner.' },
    PASO_CARNET,
    PASO_AYUDA,
  ],
  licitaciones: [
    { icono: 'briefcase', titulo: 'Bienvenido a 3B Conecta', texto: 'Publica lo que necesitas y recibe ofertas de empresas verificadas.' },
    { icono: 'list', titulo: 'Publica una licitación', texto: 'En la pestaña Licitaciones describes la obra. Las empresas se postulan y tú ves cada oferta.' },
    { icono: 'check-circle', titulo: 'Adjudica con calma', texto: 'Compara las ofertas, elige una y la obra pasa a ejecución. Puedes seguir su estado desde la misma pantalla.' },
    PASO_CARNET,
    PASO_AYUDA,
  ],
  particular: [
    { icono: 'home', titulo: 'Bienvenido a 3B Conecta', texto: 'Cuéntanos qué quieres hacer en tu vivienda y te ayudamos a encontrar quién lo haga.' },
    { icono: 'edit-3', titulo: 'Crea una petición', texto: 'Describe tu reforma. La revisamos y, si hace falta, un técnico pasa a verla antes de publicarla.' },
    { icono: 'grid', titulo: 'Calcula una idea de precio', texto: 'Si ves la pestaña Catálogo, elige partidas y obtén una estimación orientativa de tu reforma.' },
    PASO_CARNET,
    PASO_AYUDA,
  ],
  directorio: [
    { icono: 'book-open', titulo: 'Bienvenido a 3B Conecta', texto: 'Tu ficha en el Directorio es la forma en que te encuentran las demás cuentas.' },
    { icono: 'edit-2', titulo: 'Completa tu ficha', texto: 'Añade categoría, zona de cobertura y descripción. Una ficha completa se encuentra mejor.' },
    { icono: 'clipboard', titulo: 'Mira el Tablón', texto: 'Ahí se publican las necesidades de promotores y constructoras.' },
    PASO_CARNET,
    PASO_AYUDA,
  ],
  referidor: [
    { icono: 'share-2', titulo: 'Bienvenido a 3B Conecta', texto: 'Recomienda a quien pueda necesitar una obra y sigue cómo avanza cada recomendación.' },
    { icono: 'send', titulo: 'Envía una recomendación', texto: 'Desde la pestaña Recomienda indicas a quién recomiendas. Verás si llega a venta.' },
    PASO_CARNET,
    PASO_AYUDA,
  ],
  general: [
    { icono: 'home', titulo: 'Bienvenido a 3B Conecta', texto: 'Aquí tienes tu espacio. Desde el Perfil puedes ver tu actividad y encontrar ayuda.' },
    PASO_CARNET,
    PASO_AYUDA,
  ],
};