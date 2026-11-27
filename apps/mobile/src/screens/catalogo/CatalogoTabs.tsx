import { Explorador } from './CatalogoScreen';

/** Las tres pestañas del catálogo en la app del particular (estilo Uber). Comparten el pedido mediante CestaProvider. */
export function InicioScreen() {
  return <Explorador raiz="inicio" />;
}
export function BuscarScreen() {
  return <Explorador raiz="buscar" />;
}
export function PedidoScreen() {
  return <Explorador raiz="pedido" />;
}