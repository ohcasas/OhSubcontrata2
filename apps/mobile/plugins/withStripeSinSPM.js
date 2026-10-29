// El SDK de Stripe para iPhone intenta resolverse con Swift Package Manager, y eso exige frameworks
// dinámicos, que Expo desactiva para los módulos precompilados. Stripe deja una salida oficial:
// `$StripeDisableSPM = true` al principio del Podfile, que lo resuelve con CocoaPods en enlace estático.
const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const LINEA = '$StripeDisableSPM = true';

module.exports = function withStripeSinSPM(config) {
  return withDangerousMod(config, [
    'ios',
    (cfg) => {
      const podfile = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      const texto = fs.readFileSync(podfile, 'utf8');
      if (!texto.includes(LINEA)) fs.writeFileSync(podfile, LINEA + '\n' + texto);
      return cfg;
    },
  ]);
};