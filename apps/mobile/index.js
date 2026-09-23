import { registerRootComponent } from 'expo';
import App from './App';

// registerRootComponent llama a AppRegistry.registerComponent('main', ...)
// y se encarga de envolver la app tanto si corre en Expo Go como en un build nativo.
registerRootComponent(App);
