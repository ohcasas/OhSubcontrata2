// Panel de 3B · pantalla de Inicio con el estilo «cristal» y barra superior.
// Usa SOLO datos que el panel ya consulta (panel_resumen, panel_metricas_pagos, panel_cola_peticiones y la lista de obras).
// No cambia ninguna otra pantalla, ni escribe datos. Se carga al final de index.html (después del script principal).
// Para quitarlo: borra su línea <script src="panel-cristal.js"> y el panel vuelve al Inicio de antes.
(function () {
  'use strict';
  var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  function compacto(c) {
    var e = Number(c || 0) / 100;
    if (e >= 1000) return (e / 1000).toFixed(1).replace('.', ',') + ' k€';
    return Math.round(e) + ' €';
  }
  function saludo() { var h = new Date().getHours(); return h < 6 ? 'Buenas noches' : h < 14 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches'; }

  // ---- Barra superior (buscador de obras + usuario) ----
  function barraSuperior() {
    var vista = document.getElementById('vista');
    if (!vista || document.getElementById('pc-top')) return;
    var top = document.createElement('div');
    top.id = 'pc-top';
    top.innerHTML = '<form id="pc-buscar" role="search"><input type="search" id="pc-q" placeholder="Buscar obras por título, referencia o ubicación" aria-label="Buscar obras"></form>' +
      '<div class="pc-quien"><span id="pc-nombre"></span><small>Administración</small></div><div class="pc-avatar" id="pc-avatar" aria-hidden="true"></div>';
    vista.parentNode.insertBefore(top, vista);
    document.getElementById('pc-buscar').addEventListener('submit', function (e) {
      e.preventDefault();
      var q = document.getElementById('pc-q').value.trim();
      location.hash = '#/obras';
      if (!q) return;
      var n = 0;
      var t = setInterval(function () {
        var campo = document.getElementById('o-texto');
        if (campo || ++n > 25) { clearInterval(t); if (campo) { campo.value = q; campo.dispatchEvent(new Event('input', { bubbles: true })); } }
      }, 120);
    });
  }
  function ponerUsuario() {
    var n = document.getElementById('pc-nombre'), a = document.getElementById('pc-avatar');
    if (!n || typeof yo === 'undefined' || !yo) return false;
    var nombre = yo.nombre_completo || yo.email || '';
    n.textContent = nombre; a.textContent = (nombre.trim().charAt(0) || 'A').toUpperCase();
    return true;
  }
  barraSuperior();
  var intentos = 0, espera = setInterval(function () { if (ponerUsuario() || ++intentos > 40) clearInterval(espera); }, 300);

  // ---- Inicio ----
  var ICO = {
    obra: '<path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M9 13h.01M9 17h.01M15 9h.01M15 13h.01M15 17h.01"/>',
    curso: '<path d="M12 8v4l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"/>',
    pet: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5"/>',
    emp: '<path d="M3 7h18v13H3zM8 7V4h8v3"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    ok: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4 12 14.01l-3-3"/>',
    eur: '<path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>'
  };
  function kpi(href, icono, valor, etiqueta, nota, alerta) {
    return '<a class="pc-kpi" href="' + href + '"><span class="pc-ic"><svg viewBox="0 0 24 24">' + ICO[icono] + '</svg></span>' +
      '<b' + (alerta ? ' class="mal"' : '') + '>' + valor + '</b><span class="pc-et">' + etiqueta + '</span>' + (nota ? '<small>' + nota + '</small>' : '') + '</a>';
  }
  function graficoMeses(m) {
    if (!m || !m.por_mes || !m.por_mes.length) return '<p class="suave" style="padding:14px 16px;margin:0">Todavía no hay cobros que mostrar.</p>';
    var max = Math.max(1, Math.max.apply(null, m.por_mes.map(function (x) { return Number(x.cobrado_cents); })));
    return '<div class="columnas">' + m.por_mes.map(function (x) {
      var c = Number(x.cobrado_cents);
      return '<div class="col"><em>' + (c ? compacto(c) : '') + '</em><i class="' + (c ? '' : 'cero') + '" style="height:' + Math.max(2, Math.round(c / max * 150)) + 'px"></i><span class="mes">' + MESES[Number(String(x.mes).slice(5, 7)) - 1] + '</span></div>';
    }).join('') + '</div>';
  }
  function anillo(r) {
    var total = Number(r.cuentas || 0), v = Number(r.verde || 0), a = Number(r.ambar || 0), ro = Number(r.rojo || 0);
    var s = v + a + ro || 1, p1 = v / s * 100, p2 = p1 + a / s * 100;
    return '<div class="pc-anillo-caja"><div class="pc-anillo" style="background:conic-gradient(var(--ok) 0 ' + p1 + '%,#D99A1E ' + p1 + '% ' + p2 + '%,var(--mal) ' + p2 + '% 100%)" role="img" aria-label="Al día ' + v + ', pendientes ' + a + ', con incidencias ' + ro + '"><b>' + total + '<small>cuentas</small></b></div>' +
      '<div class="pc-leyenda"><a href="#/empresas"><i style="background:var(--ok)"></i>Al día<b>' + v + '</b></a><a href="#/empresas?f=ambar"><i style="background:#D99A1E"></i>Pendientes<b>' + a + '</b></a><a href="#/empresas?f=rojo"><i style="background:var(--mal)"></i>Con incidencias<b>' + ro + '</b></a></div></div>';
  }

  window.vistaInicio = async function (v) {
    var res = await Promise.all([
      consultarObras().catch(function () { return []; }),
      rpc('panel_resumen').catch(function () { return {}; }),
      rpc('panel_cola_peticiones').catch(function () { return []; }),
      rpc('panel_metricas_pagos').catch(function () { return null; })
    ]);
    var obras = res[0], r = res[1] || {}, cola = res[2] || [], m = res[3];
    ponerUsuario();
    var nombre = ((yo && yo.nombre_completo) || '').split(' ')[0];
    var hoy = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
    var cuenta = function (e) { return obras.filter(function (o) { return o.estado === e; }).length; };
    var petsRev = cola.filter(function (p) { return p.estado === 'en_revision'; }).length;
    var tarjetas = [
      kpi('#/obras?e=abierta', 'obra', cuenta('abierta'), 'Obras abiertas a ofertas'),
      kpi('#/obras?e=en_curso', 'curso', cuenta('en_curso'), 'Obras en curso'),
      kpi('#/peticiones', 'pet', petsRev, 'Peticiones por revisar', 'de particulares', petsRev > 0),
      kpi('#/revision', 'doc', r.por_revisar || 0, 'Documentos por revisar', '', (r.por_revisar || 0) > 0),
      kpi('#/empresas?f=pendiente', 'emp', r.cuentas_pendientes || 0, 'Cuentas por verificar')
    ];
    if (m) {
      tarjetas.push(kpi('#/pagos?t=curso', 'lock', eurosC(m.retenido_cents), 'Pagos retenidos', 'en Stripe, pendiente de liberar'));
      tarjetas.push(kpi('#/pagos?t=aprobar', 'ok', m.por_aprobar_n || 0, 'Pagos por aprobar', 'esperando tu visto bueno', (m.por_aprobar_n || 0) > 0));
      tarjetas.push(kpi('#/pagos?t=cerrados', 'eur', eurosC(m.comision_cobrada_cents), 'Comisión cobrada', 'prevista: ' + eurosC(m.comision_prevista_cents)));
    }
    v.innerHTML = '<div class="cab"><div><h1>' + saludo() + (nombre ? ', ' + esc(nombre) : '') + '</h1><p class="suave">' + esc(hoy.charAt(0).toUpperCase() + hoy.slice(1)) + '. Esto es lo que hay hoy en 3B Conecta.</p></div>' +
      '<div class="cab-acc"><a class="btn" href="#/actividad">Ver actividad</a> <button class="btn oscuro" data-act="ob-nueva">+ Nueva obra</button></div></div>' +
      '<div class="pc-fila">' +
        '<div class="panel"><header><h2>Cobrado a clientes</h2><span class="suave peq">últimos 6 meses</span></header>' + graficoMeses(m) + '</div>' +
        '<div class="panel"><header><h2>Estado de las cuentas</h2><a href="#/empresas">Ver cuentas</a></header>' + anillo(r) + '</div>' +
      '</div>' +
      '<div class="pc-kpis">' + tarjetas.join('') + '</div>' +
      '<div class="panel" style="margin-top:16px"><header><h2>Obras recientes</h2><a href="#/obras">Ver todas (' + obras.length + ')</a></header>' + htmlTabla('i-obras', [
        { t: 'Estado', f: function (o) { return obraEst(o.estado); } },
        { t: 'Obra', f: function (o) { return '<b>' + esc(o.titulo) + '</b><span class="sub">' + esc(o.referencia) + (o.ubicacion ? ' · ' + esc(o.ubicacion) : '') + '</span>'; } },
        { t: 'Presupuesto', cls: 'der', f: function (o) { return euros(o.presupuesto, o.moneda); } },
        { t: 'Ofertas', cls: 'der', f: function (o) { return nOfertas(o); } }], obras.slice(0, 6), 'Todavía no hay obras.', function (o) { return '#/obra/' + o.id; }) + '</div>' +
      '<h2 class="sec">Documentación de las empresas</h2><div id="ini-doc"></div>';
    await vistaResumen(document.getElementById('ini-doc'), true);
  };
})();

// ---- Efecto «abrir ventana» de macOS cada vez que se cambia de pantalla ----
(function () {
  function abre() {
    var v = document.getElementById('vista'); if (!v) return;
    v.dataset.ruta = (location.hash || '#/panel').replace(/^#\//, '').split(/[?\/]/)[0];
    v.classList.remove('mac-abre'); void v.offsetWidth; v.classList.add('mac-abre');
  }
  window.addEventListener('hashchange', abre);
  abre();
})();