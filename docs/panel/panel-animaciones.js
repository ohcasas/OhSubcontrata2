// Panel de 3B · cuenta las cifras de las tarjetas de 0 hasta su valor al abrir una pantalla.
// Solo cambia cómo se ve el número durante ~0,8 s: al terminar queda EXACTAMENTE el texto original.
// Se ignora si la persona tiene activado «reducir movimiento». Para quitarlo, borra su línea <script> de index.html.
(function () {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var vista = document.getElementById('vista');
  if (!vista || !window.MutationObserver) return;
  var re = /^(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d+))?(\s?(?:€|%))?$/; // 1.234,56 € · 15 % · 42
  var DURACION = 800;
  function animar(el) {
    var orig = el.textContent.trim();
    var m = re.exec(orig);
    if (!m) return;
    var dec = m[2] ? m[2].length : 0;
    var fin = parseFloat(m[1].replace(/\./g, '') + (m[2] ? '.' + m[2] : ''));
    if (!isFinite(fin) || fin <= 0) return;
    var sufijo = m[3] || '';
    var t0 = null;
    el.setAttribute('data-anim', '1');
    function formato(v) { return v.toLocaleString('es-ES', { minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: 'always' }) + sufijo; }
    function paso(t) {
      if (t0 === null) t0 = t;
      var p = Math.min(1, (t - t0) / DURACION);
      var e = 1 - Math.pow(1 - p, 3);
      if (p < 1) { el.textContent = formato(fin * e); requestAnimationFrame(paso); }
      else el.textContent = orig;
    }
    el.textContent = formato(0);
    requestAnimationFrame(paso);
  }
  var pendiente = false;
  function barrer() {
    pendiente = false;
    vista.querySelectorAll('.resumen b, .kpis b').forEach(function (el) {
      if (!el.hasAttribute('data-anim')) animar(el);
    });
  }
  new MutationObserver(function () {
    if (!pendiente) { pendiente = true; requestAnimationFrame(barrer); }
  }).observe(vista, { childList: true, subtree: true });
})();
