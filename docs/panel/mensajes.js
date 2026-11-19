// Panel de 3B · sección «Mensajes»: el chat de soporte con Administración, igual que en la app del móvil.
// Se carga con <script src="mensajes.js"></script> y usa las utilidades del panel (rpc, esc, $, abrirVentana, cerrarVentana,
// pieVentana, errorVentana, aviso) y el cliente `sb`. Usa las mismas funciones de la base de datos que la app (chat_*, migración 0066):
// no hace falta ninguna migración nueva.
// Privacidad: desde aquí solo se ven los chats de soporte con Administración. Los chats privados entre usuarios no se pueden leer.
// No envía correos: los mensajes se entregan dentro de la app (con aviso en el móvil, como siempre).
(function () {
  'use strict';
  var BUCKET = 'chat-archivos';
  var MS = { conv: [], extra: [], sel: null, msgs: [], filtro: '', canal: null, timer: null, urls: {}, vivo: 0 };

  var ROL = { promotor: 'Promotor', constructora: 'Constructora', arquitecto: 'Arquitecto', proveedor: 'Proveedor', profesional: 'Profesional',
    administrador: 'Inmobiliaria', subcontratista: 'Subcontratista', referidor: 'Referidor', particular: 'Particular', tecnico: 'Técnico' };

  function estilos() {
    if (document.getElementById('ms-estilos')) return;
    var s = document.createElement('style'); s.id = 'ms-estilos';
    s.textContent =
      '.ms-wrap{display:grid;grid-template-columns:320px 1fr;gap:14px;min-height:560px;height:calc(100vh - 250px)}' +
      '.ms-lista,.ms-hilo{background:rgba(255,255,255,.5);border-radius:16px;display:flex;flex-direction:column;min-height:0;overflow:hidden}' +
      '.ms-cab{padding:12px 14px;border-bottom:1px solid rgba(0,0,0,.08);display:flex;gap:8px;align-items:center}' +
      '.ms-cab input{flex:1;min-width:0}' +
      '.ms-items{overflow:auto;flex:1}' +
      '.ms-item{display:flex;gap:10px;padding:11px 14px;cursor:pointer;border-bottom:1px solid rgba(0,0,0,.05);align-items:center}' +
      '.ms-item:hover{background:rgba(255,255,255,.55)}.ms-item.sel{background:rgba(255,255,255,.85)}' +
      '.ms-av{width:38px;height:38px;border-radius:50%;background:#2b5ea8;color:#fff;display:grid;place-items:center;font-weight:600;flex:none}' +
      '.ms-txt{min-width:0;flex:1}.ms-txt b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.ms-txt span{display:block;font-size:13px;opacity:.7;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.ms-n{background:#c0392b;color:#fff;border-radius:10px;min-width:20px;padding:1px 6px;font-size:12px;text-align:center}' +
      '.ms-msgs{flex:1;overflow:auto;padding:14px;display:flex;flex-direction:column;gap:8px}' +
      '.ms-b{max-width:75%;padding:8px 12px;border-radius:14px;white-space:pre-wrap;word-wrap:break-word;overflow-wrap:anywhere;background:rgba(255,255,255,.9)}' +
      '.ms-b.yo{align-self:flex-end;background:#2b5ea8;color:#fff}' +
      '.ms-b.auto{align-self:center;background:rgba(0,0,0,.06);font-size:13px}' +
      '.ms-b .ms-h{display:block !important;width:100%;font-size:11px;opacity:.65;margin-top:3px;text-align:right;white-space:nowrap}' +
      '.ms-b img{max-width:260px;max-height:260px;border-radius:10px;display:block;cursor:pointer}' +
      '.ms-b audio{max-width:240px}' +
      '.ms-env{display:flex;gap:8px;padding:10px 12px;border-top:1px solid rgba(0,0,0,.08);align-items:flex-end}' +
      '.ms-env textarea{flex:1;resize:none;min-height:40px;max-height:140px;border-radius:12px;padding:9px 12px;font:inherit}' +
      '.ms-vacio{margin:auto;opacity:.7;text-align:center;padding:30px}' +
      '.ms-atras{display:none}' +
      '@media (max-width:900px){.ms-wrap{grid-template-columns:1fr;height:calc(100vh - 210px)}' +
      '.ms-wrap.con-sel .ms-lista{display:none}.ms-wrap:not(.con-sel) .ms-hilo{display:none}.ms-atras{display:inline-flex}.ms-b{max-width:88%}}';
    document.head.appendChild(s);
  }

  function ini(n) { return (String(n || '?').trim().charAt(0) || '?').toUpperCase(); }
  function hora(iso) {
    var d = new Date(iso), hoy = new Date();
    var h = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    if (d.toDateString() === hoy.toDateString()) return h;
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }) + ' ' + h;
  }
  function convSel() { return MS.conv.filter(function (c) { return c.id === MS.sel; })[0] || null; }
  function limpiar() {
    if (MS.timer) { clearInterval(MS.timer); MS.timer = null; }
    if (MS.canal) { try { sb.removeChannel(MS.canal); } catch (e) {} MS.canal = null; }
  }
  function urlArchivo(ruta) {
    var g = MS.urls[ruta];
    if (g && g.caduca > Date.now()) return Promise.resolve(g.url);
    return sb.storage.from(BUCKET).createSignedUrl(ruta, 3600).then(function (r) {
      if (r.error) throw r.error;
      MS.urls[ruta] = { url: r.data.signedUrl, caduca: Date.now() + 50 * 60 * 1000 };
      return r.data.signedUrl;
    });
  }

  async function cargarLista() {
    var l = await rpc('chat_mis_conversaciones');
    MS.conv = (l || []).map(function (c) { c.no_leidos = Number(c.no_leidos || 0); return c; });
    // Una conversación recién abierta (aún sin mensajes) no sale en la lista de la base de datos: se mantiene aquí hasta que tenga uno
    MS.extra = MS.extra.filter(function (x) { return !MS.conv.some(function (c) { return c.id === x.id; }); });
    MS.conv = MS.extra.concat(MS.conv);
    actualizarInsignia();
  }
  function actualizarInsignia() {
    var n = MS.conv.reduce(function (a, c) { return a + c.no_leidos; }, 0);
    var e = document.getElementById('cnt-mensajes');
    if (e) { e.textContent = String(n); e.classList.toggle('hidden', n === 0); }
  }
  async function cargarMensajes() {
    if (!MS.sel) { MS.msgs = []; return; }
    var r = await sb.from('chat_mensajes').select('id, conversacion_id, emisor_id, tipo, texto, archivo_path, duracion_seg, created_at')
      .eq('conversacion_id', MS.sel).order('created_at', { ascending: false }).limit(200);
    if (r.error) throw r.error;
    MS.msgs = (r.data || []).reverse();
  }

  function pintarLista(v) {
    var f = MS.filtro.trim().toLowerCase();
    var l = MS.conv.filter(function (c) { return !f || String(c.nombre || '').toLowerCase().indexOf(f) >= 0; });
    var cont = v.querySelector('.ms-items');
    cont.innerHTML = l.length ? l.map(function (c) {
      return '<div class="ms-item' + (c.id === MS.sel ? ' sel' : '') + '" data-c="' + esc(c.id) + '"><div class="ms-av">' + esc(ini(c.nombre)) + '</div>' +
        '<div class="ms-txt"><b>' + esc(c.nombre) + '</b><span>' + esc(c.ultimo_texto || 'Sin mensajes') + '</span></div>' +
        (c.no_leidos > 0 ? '<span class="ms-n">' + c.no_leidos + '</span>' : '') + '</div>';
    }).join('') : '<div class="ms-vacio">' + (MS.conv.length ? 'Ninguna conversación coincide.' : 'Todavía no hay conversaciones de soporte. Cuando alguien escriba a Administración desde la app, aparecerá aquí. También puedes escribir tú primero con «Nuevo mensaje».') + '</div>';
    cont.querySelectorAll('.ms-item').forEach(function (e) { e.onclick = function () { abrir(v, e.dataset.c); }; });
  }

  function burbuja(m, c) {
    var auto = m.emisor_id === null;
    var mio = !auto && m.emisor_id !== c.otro_id;
    var cuerpo = '';
    if (m.tipo === 'texto') cuerpo = esc(m.texto || '');
    else if (m.tipo === 'imagen') cuerpo = '<img data-ruta="' + esc(m.archivo_path) + '" alt="Foto" style="min-width:80px;min-height:60px;background:rgba(0,0,0,.08)">';
    else cuerpo = '🎤 Mensaje de voz (' + esc(m.duracion_seg || '') + ' s)<br><audio controls preload="none" data-ruta="' + esc(m.archivo_path) + '"></audio>';
    return '<div class="ms-b' + (auto ? ' auto' : mio ? ' yo' : '') + '">' + cuerpo + '<span class="ms-h">' + (auto ? 'Mensaje automático · ' : '') + esc(hora(m.created_at)) + '</span></div>';
  }

  function pintarHilo(v, bajar) {
    var c = convSel(), caja = v.querySelector('.ms-hilo');
    if (!c) { caja.innerHTML = '<div class="ms-vacio">Elige una conversación de la izquierda o empieza una nueva.</div>'; return; }
    var previo = caja.querySelector('#ms-texto');
    var borrador = previo ? previo.value : '';
    var msgs = caja.querySelector('.ms-msgs');
    var alFinal = !msgs || (msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < 80);
    caja.innerHTML = '<div class="ms-cab"><button class="btn peq ms-atras" id="ms-atras">‹ Volver</button><div class="ms-av">' + esc(ini(c.nombre)) + '</div>' +
      '<div class="ms-txt"><b>' + esc(c.nombre) + '</b><span>Chat con Administración 3B Conecta</span></div></div>' +
      '<div class="ms-msgs" id="ms-msgs">' + (MS.msgs.length ? MS.msgs.map(function (m) { return burbuja(m, c); }).join('') : '<div class="ms-vacio">Aún no hay mensajes. Escribe el primero.</div>') + '</div>' +
      '<div class="ms-env"><button class="btn peq" id="ms-foto" title="Enviar una foto">📎</button><input type="file" id="ms-archivo" accept="image/*" hidden>' +
      '<textarea id="ms-texto" rows="1" placeholder="Escribe un mensaje…" maxlength="4000"></textarea><button class="btn primario" id="ms-enviar">Enviar</button></div>';
    var ta = $('#ms-texto', caja); ta.value = borrador;
    var m2 = $('#ms-msgs', caja);
    if (bajar || alFinal) m2.scrollTop = m2.scrollHeight;
    // Fotos y audios con enlaces temporales
    m2.querySelectorAll('[data-ruta]').forEach(function (el) {
      urlArchivo(el.dataset.ruta).then(function (u) { el.src = u; if (el.tagName === 'IMG') el.onclick = function () { window.open(u, '_blank', 'noopener'); }; }).catch(function () { el.alt = 'No se ha podido cargar'; });
    });
    $('#ms-atras', caja).onclick = function () { MS.sel = null; history.replaceState(null, '', '#/mensajes'); v.querySelector('.ms-wrap').classList.remove('con-sel'); pintarLista(v); pintarHilo(v); };
    $('#ms-enviar', caja).onclick = function () { enviar(v); };
    ta.onkeydown = function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(v); } };
    $('#ms-foto', caja).onclick = function () { $('#ms-archivo', caja).click(); };
    $('#ms-archivo', caja).onchange = function (e) { var f = e.target.files && e.target.files[0]; if (f) enviarFoto(v, f); e.target.value = ''; };
  }

  async function refrescar(v, bajar) {
    try {
      await cargarLista();
      await cargarMensajes();
      if (MS.sel) { try { await sb.rpc('chat_marcar_leido', { p_conv: MS.sel }); var c = convSel(); if (c && c.no_leidos) { c.no_leidos = 0; actualizarInsignia(); } } catch (e) {} }
      pintarLista(v); pintarHilo(v, bajar);
    } catch (err) { aviso(mensajeError(err), true); }
  }

  async function abrir(v, id) {
    MS.sel = id;
    history.replaceState(null, '', '#/mensajes?c=' + encodeURIComponent(id));
    v.querySelector('.ms-wrap').classList.add('con-sel');
    await refrescar(v, true);
  }

  async function enviar(v) {
    var ta = $('#ms-texto', v), t = ta ? ta.value.trim() : '';
    if (!t || !MS.sel) return;
    var b = $('#ms-enviar', v); b.disabled = true;
    try {
      await rpc('chat_enviar', { p_conv: MS.sel, p_tipo: 'texto', p_texto: t, p_archivo_path: null, p_duracion: null });
      ta.value = '';
      await refrescar(v, true);
    } catch (err) { aviso(mensajeError(err), true); }
    var b2 = $('#ms-enviar', v); if (b2) b2.disabled = false;
  }

  async function enviarFoto(v, f) {
    if (!MS.sel) return;
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) return aviso('Solo se pueden enviar fotos JPG, PNG o WebP.', true);
    if (f.size > 8 * 1024 * 1024) return aviso('La foto pesa más de 8 MB.', true);
    var ext = f.type === 'image/png' ? 'png' : f.type === 'image/webp' ? 'webp' : 'jpg';
    var ruta = MS.sel + '/' + Date.now() + '-' + Math.round(Math.random() * 1e9) + '.' + ext;
    try {
      var up = await sb.storage.from(BUCKET).upload(ruta, f, { contentType: f.type, upsert: false });
      if (up.error) throw up.error;
      await rpc('chat_enviar', { p_conv: MS.sel, p_tipo: 'imagen', p_texto: null, p_archivo_path: ruta, p_duracion: null });
      await refrescar(v, true);
    } catch (err) { aviso(mensajeError(err), true); }
  }

  function nuevo(v) {
    abrirVentana('<h2>Nuevo mensaje</h2><p class="suave">Busca a la persona por su nombre o el de su empresa. Se abre un chat con Administración 3B Conecta.</p>' +
      '<input type="search" id="ms-buscar" placeholder="Buscar persona o empresa" autocomplete="off"><div id="ms-res" style="max-height:320px;overflow:auto;margin-top:8px"></div>' +
      '<div id="v-error" class="error-caja hidden" style="margin-top:8px"></div><div class="pie-modal"><button class="btn" data-cerrar>Cerrar</button></div>', 520);
    $('[data-cerrar]').onclick = cerrarVentana;
    var t = null;
    var buscar = async function () {
      var q = $('#ms-buscar').value.trim();
      try {
        var r = await rpc('chat_usuarios', { p_buscar: q === '' ? null : q, p_limite: 30 });
        $('#ms-res').innerHTML = (r || []).length ? r.map(function (p) {
          return '<div class="ms-item" data-u="' + esc(p.id) + '" data-n="' + esc(p.nombre) + '"><div class="ms-av">' + esc(ini(p.nombre)) + '</div><div class="ms-txt"><b>' + esc(p.nombre) + '</b><span>' +
            esc(ROL[p.rol] || p.rol) + (p.estado_cuenta !== 'verificada' ? ' · cuenta ' + esc(p.estado_cuenta) : '') + '</span></div></div>';
        }).join('') : '<p class="suave">Nadie coincide con esa búsqueda.</p>';
        $('#ms-res').querySelectorAll('[data-u]').forEach(function (e) {
          e.onclick = async function () {
            try {
              var id = await rpc('chat_abrir', { p_usuario_id: e.dataset.u });
              var nom = e.getAttribute('data-n') || 'Conversación';
              if (!MS.conv.some(function (c) { return c.id === id; }) && !MS.extra.some(function (c) { return c.id === id; })) {
                MS.extra.push({ id: id, tipo: 'soporte', otro_id: e.dataset.u, nombre: nom, ultimo_texto: null, ultimo_at: new Date().toISOString(), no_leidos: 0 });
              }
              cerrarVentana(); await abrir(v, id);
            }
            catch (err) { var x = $('#v-error'); if (x) { x.textContent = mensajeError(err); x.classList.remove('hidden'); } else { aviso(mensajeError(err), true); } }
          };
        });
      } catch (err) { $('#ms-res').innerHTML = '<p class="mal-t">' + esc(mensajeError(err)) + '</p>'; }
    };
    $('#ms-buscar').oninput = function () { clearTimeout(t); t = setTimeout(buscar, 250); };
    buscar();
  }

  window.vistaMensajes = async function (v) {
    limpiar(); estilos();
    var params = new URLSearchParams((location.hash.split('?')[1]) || '');
    MS.sel = params.get('c') || null; MS.filtro = '';
    v.innerHTML = '<div class="cab"><div><h1>Mensajes</h1><p class="suave">Chat de soporte con Administración 3B Conecta, igual que en la app. ' +
      'Aquí solo ves las conversaciones con Administración; los chats privados entre usuarios no se pueden leer.</p></div></div>' +
      '<div class="ms-wrap' + (MS.sel ? ' con-sel' : '') + '"><div class="ms-lista"><div class="ms-cab"><input type="search" id="ms-filtro" placeholder="Buscar">' +
      '<button class="btn primario peq" id="ms-nuevo">Nuevo mensaje</button></div><div class="ms-items"></div></div><div class="ms-hilo"></div></div>';
    $('#ms-nuevo', v).onclick = function () { nuevo(v); };
    $('#ms-filtro', v).oninput = function (e) { MS.filtro = e.target.value; pintarLista(v); };
    await refrescar(v, true);
    var mio = ++MS.vivo;
    // Mensajes nuevos al instante, y por si acaso una comprobación cada 20 s
    try {
      MS.canal = sb.channel('panel-mensajes').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_mensajes' }, function () {
        if (mio === MS.vivo && v.isConnected) refrescar(v, false);
      }).subscribe();
    } catch (e) {}
    MS.timer = setInterval(function () {
      if (mio !== MS.vivo || !v.isConnected || location.hash.indexOf('#/mensajes') !== 0) { limpiar(); return; }
      refrescar(v, false);
    }, 20000);
  };

  // Insignia de mensajes sin leer en el menú (cada minuto, también fuera de esta sección)
  async function insignia() {
    try {
      if (typeof sb === 'undefined' || !sb || !document.getElementById('cnt-mensajes')) return;
      var n = await rpc('chat_no_leidos');
      var e = document.getElementById('cnt-mensajes');
      if (e) { e.textContent = String(Number(n || 0)); e.classList.toggle('hidden', !Number(n)); }
    } catch (e) {}
  }
  setTimeout(insignia, 4000); setInterval(insignia, 60000);
})();