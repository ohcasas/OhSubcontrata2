// Panel de 3B · sección «Bolsa de empleo»: candidatos agrupados por oficio (desplegables), verificación de su
// documentación y ficha con fotos y PDF. Se carga con <script src="bolsa.js"></script> en index.html y usa las
// utilidades del propio panel (sb, rpc, esc, htmlTabla, abrirVentana, cerrarVentana, aviso, fechaHora, mensajeError, $).
// Solo lo ven los usuarios del equipo de selección con rol responsable o superadmin (lo exige la base de datos).
const BZ_VERIF = { pendiente: ['Por verificar', 'aviso'], verificado: ['Verificado', 'ok'], rechazado: ['Rechazado', 'mal'] };
const BZ_BUCKET = 'seleccion-docs';
const BZ_MAX = 10 * 1024 * 1024;
const BZ_TIPOS = { 'application/pdf': 'pdf', 'image/jpeg': 'foto', 'image/png': 'foto', 'image/webp': 'foto' };
let bzVista = null;

const bzMarca = (k) => { const e = BZ_VERIF[k] || [k, 'neutro']; return `<span class="e ${e[1]}">${esc(e[0])}</span>`; };
const bzNorm = (t) => String(t || '').trim().toLowerCase();
const bzTitulo = (t) => { const s = String(t || '').trim(); return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; };

async function vistaBolsa(v) {
  bzVista = v;
  const params = new URLSearchParams((location.hash.split('?')[1]) || '');
  const t = params.get('t') || 'todos';
  const q = bzNorm(params.get('q'));
  const todos = await rpc('sel_bolsa_panel', { p_estado: null });
  const cuenta = (e) => todos.filter((x) => x.verificacion === e).length;
  let lista = t === 'todos' ? todos : todos.filter((x) => x.verificacion === t);
  if (q) lista = lista.filter((x) => bzNorm([x.nombre_completo, x.email, x.localidad, (x.oficios || []).join(' ')].join(' ')).includes(q));

  // Agrupar por el primer oficio de cada persona (los demás se ven como etiquetas)
  const grupos = new Map();
  lista.forEach((x) => {
    const oficio = (x.oficios && x.oficios[0]) ? x.oficios[0] : '';
    const clave = bzNorm(oficio) || '~sin';
    if (!grupos.has(clave)) grupos.set(clave, { nombre: oficio ? bzTitulo(oficio) : 'Sin oficio indicado', filas: [] });
    grupos.get(clave).filas.push(x);
  });
  const orden = [...grupos.entries()].sort((a, b) => (a[0] === '~sin') - (b[0] === '~sin') || a[1].nombre.localeCompare(b[1].nombre, 'es'));

  const pestanas = [['todos', 'Todos', todos.length], ['pendiente', 'Por verificar', cuenta('pendiente')],
    ['verificado', 'Verificados', cuenta('verificado')], ['rechazado', 'Rechazados', cuenta('rechazado')]];
  v.innerHTML = `<div class="cab"><div><h1>Bolsa de empleo</h1>
    <p class="suave">Personas que se han registrado desde la app. Cuando envían su documentación en PDF por correo, ábreles la ficha, súbela aquí (fotos y PDF) y pulsa «Verificar»: así pueden entrar a su panel. Los desplegables agrupan por oficio.</p></div></div>
    <div class="herramientas">
      ${pestanas.map(([k, n, c]) => `<a class="btn ${k === t ? 'primario' : ''}" href="#/bolsa?t=${k}${q ? '&q=' + encodeURIComponent(q) : ''}">${n} (${c})</a>`).join('')}
      <input type="search" id="bz-buscar" placeholder="Buscar por nombre, oficio o localidad" value="${esc(params.get('q') || '')}">
    </div>
    <div id="bz-grupos">${orden.length ? '' : `<div class="panel"><div class="vacio">${todos.length ? 'No hay resultados con ese filtro.' : 'Todavía no se ha registrado nadie.'}</div></div>`}</div>`;

  const cont = $('#bz-grupos');
  orden.forEach(([clave, g], i) => {
    const d = document.createElement('details');
    d.className = 'panel'; d.style.marginBottom = '10px';
    d.open = !!q || orden.length === 1;
    const porVerificar = g.filas.filter((x) => x.verificacion === 'pendiente').length;
    d.innerHTML = `<summary style="cursor:pointer;padding:12px 16px;font-weight:700;font-size:15px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        ${esc(g.nombre)} <span class="suave" style="font-weight:400">${g.filas.length} ${g.filas.length === 1 ? 'persona' : 'personas'}</span>
        ${porVerificar ? `<span class="e aviso" style="font-weight:600">${porVerificar} por verificar</span>` : ''}</summary>
      <div id="bz-g${i}"></div>`;
    cont.appendChild(d);
    $('#bz-g' + i).innerHTML = htmlTabla('bolsa-' + i, [
      { t: 'Nombre', f: (x) => `<b>${esc(x.nombre_completo)}</b><span class="sub">${esc(x.email)}${x.telefono ? ' · ' + esc(x.telefono) : ''}</span>`, s: (x) => x.nombre_completo },
      { t: 'Oficios', f: (x) => esc((x.oficios || []).join(', ') || '—'), s: (x) => (x.oficios || []).join(', ') },
      { t: 'Localidad', f: (x) => esc(x.localidad || '—'), s: (x) => x.localidad },
      { t: 'Años', f: (x) => (x.anios_experiencia ?? '—'), s: (x) => x.anios_experiencia ?? -1 },
      { t: 'Verificación', f: (x) => bzMarca(x.verificacion), s: (x) => x.verificacion },
      { t: 'En la bolsa', f: (x) => (x.en_bolsa ? '<span class="e ok">Sí</span>' : '<span class="e neutro">No</span>'), s: (x) => (x.en_bolsa ? 1 : 0) },
      { t: 'Archivos', f: (x) => String(x.num_documentos), s: (x) => Number(x.num_documentos) },
      { t: '', cls: 'acc', f: (x) => `<button class="btn peq" data-bz="${esc(x.user_id)}">Abrir ficha</button>` }
    ], g.filas, 'Sin personas.');
    $('#bz-g' + i).onclick = (e) => { const b = e.target.closest('[data-bz]'); if (b) bzAbrirFicha(b.dataset.bz); };
  });

  const caja = $('#bz-buscar');
  caja.onchange = () => { const p = new URLSearchParams({ t }); if (caja.value.trim()) p.set('q', caja.value.trim()); location.hash = '#/bolsa?' + p.toString(); };
}

async function bzAbrirFicha(uid) {
  let f;
  try { f = await rpc('sel_candidato_ficha', { p_user: uid }); } catch (err) { aviso(mensajeError(err), true); return; }
  const c = f.candidato, p = f.perfil || {}, docs = f.documentos || [], form = f.formacion || [];

  // Enlaces temporales a los archivos (fotos en miniatura, PDF y CV)
  const urls = {};
  if (docs.length) {
    const { data } = await sb.storage.from(BZ_BUCKET).createSignedUrls(docs.map((d) => d.ruta), 600);
    (data || []).forEach((x) => { if (x.signedUrl) urls[x.path] = x.signedUrl; });
  }
  let cvUrl = null;
  if (c.cv_path) { const { data } = await sb.storage.from('seleccion-cv').createSignedUrl(c.cv_path, 600); cvUrl = data ? data.signedUrl : null; }

  const disp = { inmediata: 'Inmediata', un_mes: 'En un mes', a_consultar: 'A consultar' }[p.disponibilidad] || '—';
  const fotos = docs.filter((d) => d.tipo === 'foto'), pdfs = docs.filter((d) => d.tipo === 'pdf');
  const fila = (a, b) => `<tr><td style="color:var(--suave);padding:4px 12px 4px 0;white-space:nowrap;vertical-align:top">${a}</td><td style="padding:4px 0">${b}</td></tr>`;

  abrirVentana(`<h2>${esc(c.nombre_completo)}</h2>
    <p class="suave">${bzMarca(c.verificacion)}${c.verificado_at ? ' · ' + fechaHora(c.verificado_at) : ''} · Registrado el ${fechaHora(c.registrado)}</p>
    ${c.verificacion_nota ? `<p class="suave">Nota: ${esc(c.verificacion_nota)}</p>` : ''}
    <table style="width:100%;margin:8px 0">
      ${fila('Correo', `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>`)}
      ${fila('Teléfono', esc(c.telefono || '—'))}
      ${fila('Localidad', esc(c.localidad || '—'))}
      ${fila('Oficios', esc((p.oficios || []).join(', ') || '—'))}
      ${fila('Experiencia', p.anios_experiencia != null ? esc(p.anios_experiencia) + ' años' : '—')}
      ${fila('Provincias', esc((p.provincias || []).join(', ') || '—'))}
      ${fila('Disponibilidad', esc(disp) + (p.tiene_vehiculo ? ' · vehículo propio' : ''))}
      ${fila('En la bolsa', p.en_bolsa ? 'Sí' : 'No')}
      ${c.resumen ? fila('Resumen', esc(c.resumen)) : ''}
      ${form.length ? fila('Formación', form.map((x) => `${esc(x.nombre)}${x.entidad ? ' · ' + esc(x.entidad) : ''}${x.anio ? ' · ' + esc(x.anio) : ''}`).join('<br>')) : ''}
      ${cvUrl ? fila('CV', `<a href="${esc(cvUrl)}" target="_blank" rel="noopener">Abrir CV</a>`) : ''}
    </table>

    <h3 style="font-size:14px;margin:14px 0 6px">Verificación de la documentación</h3>
    <div class="herramientas" style="margin-bottom:6px">
      <button class="btn primario peq" id="bz-ok" ${c.verificacion === 'verificado' ? 'disabled' : ''}>Verificar</button>
      <button class="btn mal peq" id="bz-no">Rechazar</button>
      <button class="btn peq" id="bz-pend" ${c.verificacion === 'pendiente' ? 'disabled' : ''}>Volver a «por verificar»</button>
    </div>
    <input type="text" id="bz-nota" maxlength="500" placeholder="Nota para la persona (se le muestra si rechazas; ej. «Falta el DNI legible»)" style="width:100%">

    <h3 style="font-size:14px;margin:16px 0 6px">Fotos y PDF</h3>
    ${fotos.length ? `<div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:8px">${fotos.map((d) => `
      <div style="width:120px"><a href="${esc(urls[d.ruta] || '#')}" target="_blank" rel="noopener"><img src="${esc(urls[d.ruta] || '')}" alt="${esc(d.nombre)}" style="width:120px;height:90px;object-fit:cover;border-radius:8px;border:1px solid var(--linea,#d7e0eb)"></a>
      <div class="suave peq" style="word-break:break-all">${esc(d.nombre)}</div><button class="btn peq mal" data-bz-del="${esc(d.id)}">Quitar</button></div>`).join('')}</div>` : ''}
    ${pdfs.length ? `<ul style="margin:0 0 8px;padding-left:18px">${pdfs.map((d) => `
      <li style="margin:4px 0"><a href="${esc(urls[d.ruta] || '#')}" target="_blank" rel="noopener">${esc(d.nombre)}</a> <span class="suave peq">${fechaHora(d.fecha)}</span>
      <button class="btn peq mal" data-bz-del="${esc(d.id)}">Quitar</button></li>`).join('')}</ul>` : ''}
    ${docs.length ? '' : '<p class="suave">Todavía no hay archivos en esta ficha.</p>'}
    <div class="herramientas" style="margin-top:6px"><input type="file" id="bz-archivos" multiple accept="application/pdf,image/jpeg,image/png,image/webp">
      <button class="btn peq" id="bz-subir">Subir</button></div>
    <p class="suave peq">PDF, JPG, PNG o WebP · máximo 10 MB por archivo · 30 por ficha. Solo los ve el equipo de 3B y la propia persona.</p>
    <div id="bz-err" class="error-caja hidden"></div>
    <div class="pie-modal"><button class="btn" id="bz-cerrar">Cerrar</button></div>`, 760);

  const error = (m) => { const e = $('#bz-err'); e.textContent = m; e.classList.remove('hidden'); };
  const recargar = () => bzAbrirFicha(uid);
  $('#bz-cerrar').onclick = () => { cerrarVentana(); if (bzVista && /^#\/bolsa/.test(location.hash)) vistaBolsa(bzVista).catch(() => {}); };

  const verificar = async (estado) => {
    const nota = $('#bz-nota').value.trim();
    if (estado === 'rechazado' && !nota && !confirm('¿Rechazar sin escribir ninguna nota? La persona verá un mensaje genérico.')) return;
    try { await rpc('sel_verificar_candidato', { p_user: uid, p_estado: estado, p_nota: nota || null }); aviso(estado === 'verificado' ? 'Verificado. La persona ya puede acceder a su panel.' : 'Estado actualizado.'); recargar(); }
    catch (err) { error(mensajeError(err)); }
  };
  $('#bz-ok').onclick = () => verificar('verificado');
  $('#bz-no').onclick = () => verificar('rechazado');
  $('#bz-pend').onclick = () => verificar('pendiente');

  $('#bz-subir').onclick = async () => {
    const lista = [...($('#bz-archivos').files || [])];
    if (!lista.length) return error('Elige uno o varios archivos.');
    const malo = lista.find((a) => !BZ_TIPOS[a.type] || a.size > BZ_MAX);
    if (malo) return error(`«${malo.name}»: solo PDF, JPG, PNG o WebP de hasta 10 MB.`);
    $('#bz-subir').disabled = true; $('#bz-subir').textContent = 'Subiendo…';
    try {
      for (const a of lista) {
        const limpio = a.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').slice(-80);
        const ruta = `${uid}/${Date.now()}-${limpio}`;
        const { error: eSub } = await sb.storage.from(BZ_BUCKET).upload(ruta, a, { contentType: a.type, upsert: false });
        if (eSub) throw eSub;
        try { await rpc('sel_registrar_documento', { p_user: uid, p_tipo: BZ_TIPOS[a.type], p_nombre: a.name, p_ruta: ruta }); }
        catch (eReg) { await sb.storage.from(BZ_BUCKET).remove([ruta]); throw eReg; }
      }
      aviso('Archivos subidos.'); recargar();
    } catch (err) { error(mensajeError(err)); $('#bz-subir').disabled = false; $('#bz-subir').textContent = 'Subir'; }
  };

  document.querySelectorAll('[data-bz-del]').forEach((b) => {
    b.onclick = async () => {
      if (!confirm('¿Quitar este archivo de la ficha? Se borra de forma definitiva.')) return;
      try {
        const ruta = await rpc('sel_eliminar_documento', { p_id: b.dataset.bzDel });
        if (ruta) await sb.storage.from(BZ_BUCKET).remove([ruta]);
        aviso('Archivo quitado.'); recargar();
      } catch (err) { error(mensajeError(err)); }
    };
  });
}