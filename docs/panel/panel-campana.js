// 3B Conecta · Panel · Campana de notificaciones
// Se carga con <script src="panel-campana.js"></script> DESPUES de panel-cristal.js. No toca ninguna otra vista.
// Lee la tabla "notificaciones" del usuario que ha entrado (solo ve las suyas) y solo puede marcarlas como leidas.
(function () {
  'use strict';
  if (window.__campana3b) return; window.__campana3b = true;

  var ICONOS = {
    plazo_proximo: '⏳', plazo_hoy: '📅', plazo_retraso: '⚠️',
    plazo_proximo_admin: '⏳', plazo_hoy_admin: '📅', plazo_retraso_admin: '⚠️',
    cuenta_nueva: '👤', peticion_nueva: '📝', documento_subido: '📄'
  };
  var TITULO_BASE = document.title;
  var estado = { lista: [], abierto: false, expandida: null };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function hace(iso) {
    var s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'ahora';
    if (s < 3600) return 'hace ' + Math.floor(s / 60) + ' min';
    if (s < 86400) return 'hace ' + Math.floor(s / 3600) + ' h';
    var d = Math.floor(s / 86400);
    return d === 1 ? 'ayer' : 'hace ' + d + ' días';
  }
  function noLeidas() { return estado.lista.filter(function (n) { return !n.leida; }).length; }

  function montar() {
    if (document.getElementById('pc-campana')) return true;
    var top = document.getElementById('pc-top');
    var cont = document.createElement('div');
    cont.id = 'pc-campana';
    cont.innerHTML =
      '<button type="button" id="pc-campana-btn" aria-label="Notificaciones" aria-haspopup="true" aria-expanded="false">' +
      '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>' +
      '<span id="pc-campana-n" hidden>0</span></button>' +
      '<div id="pc-campana-panel" role="dialog" aria-label="Notificaciones" hidden>' +
      '<div class="pcc-cab"><b>Notificaciones</b><button type="button" id="pcc-todas">Marcar todas como leídas</button></div>' +
      '<div id="pcc-lista"></div><div id="pcc-permiso"></div></div>';
    if (top) {
      var quien = top.querySelector('.pc-quien');
      top.insertBefore(cont, quien || null);
    } else {
      cont.classList.add('pcc-flotante');
      document.body.appendChild(cont);
    }
    document.getElementById('pc-campana-btn').addEventListener('click', function (e) { e.stopPropagation(); alternar(); });
    document.getElementById('pcc-todas').addEventListener('click', marcarTodas);
    document.getElementById('pc-campana-panel').addEventListener('click', function (e) { e.stopPropagation(); });
    document.addEventListener('click', function () { if (estado.abierto) alternar(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && estado.abierto) { alternar(false); document.getElementById('pc-campana-btn').focus(); } });
    return true;
  }

  function alternar(forzar) {
    estado.abierto = typeof forzar === 'boolean' ? forzar : !estado.abierto;
    var p = document.getElementById('pc-campana-panel'), b = document.getElementById('pc-campana-btn');
    p.hidden = !estado.abierto; b.setAttribute('aria-expanded', String(estado.abierto));
    if (estado.abierto) { pintar(); cargar(); }
  }

  function pintar() {
    var n = noLeidas(), ins = document.getElementById('pc-campana-n');
    if (!ins) return;
    ins.hidden = n === 0; ins.textContent = n > 9 ? '9+' : String(n);
    document.title = (n ? '(' + n + ') ' : '') + TITULO_BASE;
    document.getElementById('pc-campana-btn').setAttribute('aria-label', n ? 'Notificaciones, ' + n + ' sin leer' : 'Notificaciones');
    var pm = document.getElementById('pcc-permiso');
    if (pm) {
      var ok = 'Notification' in window;
      pm.innerHTML = ok && Notification.permission === 'default' ? '<button type="button" id="pcc-activar">Avisarme en este equipo cuando llegue algo</button>'
        : ok && Notification.permission === 'denied' ? '<small>Los avisos del navegador están bloqueados en este equipo. Se pueden permitir en los ajustes del sitio.</small>' : '';
      var bt = document.getElementById('pcc-activar'); if (bt) bt.onclick = permisoEscritorio;
    }
    var l = document.getElementById('pcc-lista');
    if (!estado.lista.length) { l.innerHTML = '<p class="pcc-vacio">No hay notificaciones. Aquí aparecerán los avisos de plazos y otros avisos del panel.</p>'; return; }
    l.innerHTML = estado.lista.map(function (x) {
      var abierta = estado.expandida === x.id;
      return '<div class="pcc-item' + (x.leida ? '' : ' nueva') + (abierta ? ' abierta' : '') + '" data-id="' + esc(x.id) + '">' +
        '<button type="button" class="pcc-fila" aria-expanded="' + abierta + '">' +
        '<span class="pcc-ico" aria-hidden="true">' + (ICONOS[x.tipo] || '🔔') + '</span>' +
        '<span class="pcc-txt"><b>' + esc(x.titulo) + '</b><small>' + esc(hace(x.created_at)) + '</small></span>' +
        '<span class="pcc-flecha" aria-hidden="true">›</span></button>' +
        '<div class="pcc-det"><div><p>' + esc(x.cuerpo || '') + '</p>' + enlace(x) + '</div></div></div>';
    }).join('');
    Array.prototype.forEach.call(l.querySelectorAll('.pcc-fila'), function (b) {
      b.addEventListener('click', function () {
        var id = b.parentNode.getAttribute('data-id');
        estado.expandida = estado.expandida === id ? null : id;
        var it = estado.lista.filter(function (z) { return z.id === id; })[0];
        if (it && !it.leida && estado.expandida === id) marcar([id]);
        pintar();
      });
    });
    Array.prototype.forEach.call(l.querySelectorAll('a.pcc-ir'), function (a) { a.addEventListener('click', function () { alternar(false); }); });
  }
  function enlace(x) {
    var d = x.datos || {}, e = typeof d.enlace === 'string' && /^#\//.test(d.enlace) ? d.enlace : '';
    if (e) return '<a class="pcc-ir" href="' + esc(e) + '">Abrir en el panel</a>';
    if (/^plazo_/.test(x.tipo || '')) return '<a class="pcc-ir" href="#/plazos">Ver plazos de obra</a>';
    return '';
  }

  async function cargar() {
    if (typeof sb === 'undefined' || !sb) return;
    try {
      var r = await sb.from('notificaciones').select('id,tipo,titulo,cuerpo,datos,leida,created_at').order('created_at', { ascending: false }).limit(30);
      if (r.error) return;
      var antes = {}; estado.lista.forEach(function (z) { antes[z.id] = 1; });
      var primera = !estado.cargada; estado.cargada = true;
      estado.lista = r.data || [];
      pintar();
      if (!primera) estado.lista.filter(function (z) { return !z.leida && !antes[z.id]; }).forEach(avisoEscritorio);
    } catch (e) { /* sin red: se reintenta en el siguiente ciclo */ }
  }
  function avisoEscritorio(n) {
    try {
      if (!('Notification' in window) || Notification.permission !== 'granted' || localStorage.getItem('pcc_avisos') === 'no') return;
      var a = new Notification(n.titulo, { body: n.cuerpo || '', tag: n.id });
      a.onclick = function () { window.focus(); var d = n.datos || {}; if (typeof d.enlace === 'string' && /^#\//.test(d.enlace)) location.hash = d.enlace; alternar(true); a.close(); };
    } catch (e) { /* el navegador no lo permite */ }
  }
  function permisoEscritorio() {
    try {
      if (!('Notification' in window) || Notification.permission !== 'default') return;
      Notification.requestPermission().then(pintar);
    } catch (e) { /* sin soporte */ }
  }
  function tiempoReal() {
    try {
      if (!sb.channel || estado.canal) return;
      estado.canal = sb.channel('campana-admin')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notificaciones' }, function () { cargar(); })
        .subscribe();
    } catch (e) { /* si no hay tiempo real, queda la consulta cada minuto */ }
  }
  async function marcar(ids) {
    estado.lista.forEach(function (n) { if (ids.indexOf(n.id) >= 0) n.leida = true; });
    pintar();
    try { await sb.from('notificaciones').update({ leida: true }).in('id', ids); } catch (e) { /* se reintenta al recargar */ }
  }
  function marcarTodas() {
    var ids = estado.lista.filter(function (n) { return !n.leida; }).map(function (n) { return n.id; });
    if (ids.length) marcar(ids);
  }

  var intentos = 0;
  var espera = setInterval(function () {
    if (document.getElementById('pc-top') || ++intentos > 20) {
      clearInterval(espera);
      montar();
      var t = setInterval(function () { if (typeof sb !== 'undefined' && sb) { clearInterval(t); cargar(); tiempoReal(); } }, 400);
      setInterval(function () { cargar(); }, 45000);
    }
  }, 250);
})();