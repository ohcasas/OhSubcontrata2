// 3B Conecta · Panel en el móvil. Se carga después de panel-campana.js. No cambia nada en ordenador.
(function () {
  'use strict';
  if (window.__movil3b) return; window.__movil3b = true;

  // 1) Etiquetas en las tablas: cada celda recibe el título de su columna para verse como tarjeta en el móvil.
  function etiquetar(raiz) {
    Array.prototype.forEach.call((raiz || document).querySelectorAll('table.t'), function (t) {
      var ths = Array.prototype.map.call(t.querySelectorAll('thead th'), function (th) { return th.textContent.trim(); });
      if (!ths.length) return;
      Array.prototype.forEach.call(t.querySelectorAll('tbody tr'), function (tr) {
        Array.prototype.forEach.call(tr.children, function (td, i) {
          if (td.tagName === 'TD' && !td.hasAttribute('data-l')) td.setAttribute('data-l', ths[i] || '');
        });
      });
    });
  }

  // 2) La campana vive en la barra superior del móvil y en la del ordenador según el ancho de pantalla.
  var mq = window.matchMedia('(max-width: 900px)');
  function colocarCampana() {
    var c = document.getElementById('pc-campana'); if (!c) return;
    var destino = mq.matches ? document.querySelector('.barra-movil') : document.getElementById('pc-top');
    if (destino && c.parentNode !== destino) {
      if (mq.matches) destino.appendChild(c);
      else destino.insertBefore(c, destino.querySelector('.pc-quien') || null);
    }
  }
  function iniciar() {
    var vista = document.getElementById('vista');
    if (!vista) return setTimeout(iniciar, 250);
    new MutationObserver(function () { etiquetar(vista); }).observe(vista, { childList: true, subtree: true });
    etiquetar(vista);
    var n = 0, t = setInterval(function () { colocarCampana(); if (++n > 20) clearInterval(t); }, 300);
    (mq.addEventListener ? mq.addEventListener('change', colocarCampana) : mq.addListener(colocarCampana));
    // 3) Cerrar el menú con la tecla Atrás del móvil no existe en web; sí con Escape y al girar la pantalla.
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') document.body.classList.remove('menu-abierto'); });
    window.addEventListener('orientationchange', function () { document.body.classList.remove('menu-abierto'); });
  }
  iniciar();
})();