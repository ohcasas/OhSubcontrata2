// Contrato y pagos por obra (opcion B). Requiere la migracion 0099.
// La contrata paga al subcontratista directamente, por plazos; el subcontratista paga a 3B la comision
// contra factura. El panel NO mueve dinero: solo registra lo que ocurre. Sin Stripe ni correos.
const CT_PAGO = { pendiente: ['Pendiente', 'aviso'], pagado: ['Pagado', 'ok'] };
const CT_COM = { pendiente: ['Sin facturar', 'neutro'], facturada: ['Facturada', 'aviso'], cobrada: ['Cobrada', 'ok'] };
const CT_EST = { borrador: ['Borrador', 'aviso'], firmado: ['Firmado', 'ok'], anulado: ['Anulado', 'neutro'] };
const ctCents = (t) => Math.round(Number(String(t).replace(/\./g, '').replace(',', '.')) * 100);
const ctPar = (m, k) => { const e = m[k] || [k, 'neutro']; return `<span class="e ${e[1]}">${esc(e[0])}</span>`; };

async function vistaContratoPagos(v) {
  let obras, res;
  try { [obras, res] = await Promise.all([rpc('panel_ct_obras'), rpc('panel_ct_resumen')]); }
  catch (e) {
    v.innerHTML = `<div class="cab"><div><h1>Contrato y pagos</h1></div></div><div class="panel" style="padding:14px 18px">Todavía no está activada esta sección. Ejecuta primero la migración 0099 en Supabase. <span class="suave">(${esc(mensajeError(e))})</span></div>`;
    return;
  }
  window.__ct = { obras };
  v.innerHTML = `<div class="cab"><div><h1>Contrato y pagos</h1>
      <p class="suave">La contrata paga al subcontratista directamente, por plazos. El subcontratista paga a 3B la comisión contra factura. Aquí solo se <b>registra</b>: el panel no mueve dinero.</p></div></div>
    <div class="panel" style="padding:14px 18px;margin-bottom:14px"><b>Importante:</b> nunca escribas aquí números de tarjeta ni de cuenta. Los importes son sin IVA.</div>
    <div class="resumen" style="margin-bottom:14px">
      <a href="#/contrato-pagos"><b>${eurosC(res.contratado_cents)}</b><span>Contratado (plazos)</span></a>
      <a href="#/contrato-pagos"><b>${eurosC(res.pagado_cents)}</b><span>Pagado por las contratas</span></a>
      <a href="#/contrato-pagos"><b>${eurosC(res.comision_por_facturar)}</b><span>Comisión por facturar</span></a>
      <a href="#/contrato-pagos"><b>${eurosC(res.comision_cobrada_cents)}</b><span>Comisión cobrada</span><span style="display:block">de ${eurosC(res.comision_total_cents)} prevista</span></a>
    </div>
    <div class="panel"><div style="padding:14px 18px 0"><b>Obras adjudicadas</b></div><div id="ct-obras"></div></div>`;
  $('#ct-obras').innerHTML = htmlTabla('ct-obras', [
    { t: 'Obra', f: (x) => `<b>${esc(x.referencia || '')}</b> ${esc(x.titulo)}<span class="sub">${esc(x.empresa)}</span>`, s: (x) => String(x.titulo).toLowerCase() },
    { t: 'Oferta', f: (x) => eurosC(x.oferta_cents), s: (x) => Number(x.oferta_cents) },
    { t: 'Contrato', f: (x) => x.contrato_id ? ctPar(CT_EST, x.contrato_estado) : '<span class="suave">Sin crear</span>' },
    { t: 'Pagado', f: (x) => x.contrato_id ? `${eurosC(x.pagado_cents)}<span class="sub">de ${eurosC(x.importe_cents)}</span>` : '—', s: (x) => Number(x.pagado_cents || 0) },
    { t: 'Comisión', f: (x) => x.contrato_id ? `${eurosC(x.comision_cobrada_cents)}<span class="sub">de ${eurosC(x.comision_total_cents)} · ${esc(pctTxt(x.comision_pct))}</span>` : esc(pctTxt(x.comision_pct)) },
    { t: '', cls: 'acc', f: (x) => `<button class="btn peq primario" data-act="ct-abrir" data-id="${esc(x.obra_id)}">${x.contrato_id ? 'Ver contrato' : 'Crear contrato'}</button>` },
  ], obras, 'No hay obras adjudicadas todavía.');
}

async function ctCargarDetalle(obraId) {
  const o = window.__ct.obras.find((x) => x.obra_id === obraId); if (!o) return;
  let c = null, plazos = [];
  if (o.contrato_id) {
    const a = await sb.from('obra_contratos').select('*').eq('id', o.contrato_id).single(); if (a.error) throw a.error;
    const b = await sb.from('obra_plazos').select('*').eq('contrato_id', o.contrato_id).order('orden'); if (b.error) throw b.error;
    c = a.data; plazos = b.data || [];
  }
  window.__ctd = { o, c, plazos };
  ctPintar();
}

function ctPintar() {
  const { o, c, plazos } = window.__ctd;
  const bloqueado = plazos.some((p) => p.pago_estado !== 'pendiente' || p.comision_estado !== 'pendiente');
  const firmado = c && c.estado === 'firmado';
  const filas = plazos.length ? plazos : [{ concepto: 'Anticipo', importe_cents: '', fecha_prevista: '' }, { concepto: 'Final de obra', importe_cents: '', fecha_prevista: '' }];
  const imp = c ? (c.importe_cents / 100).toFixed(2).replace('.', ',') : (o.oferta_cents / 100).toFixed(2).replace('.', ',');
  const edit = !bloqueado && (!c || c.estado !== 'anulado');
  const sinFin = !c || !c.fecha_fin;
  abrirVentana(`<h2>Contrato y pagos</h2><p><b>${esc(o.referencia || '')} ${esc(o.titulo)}</b> · ${esc(o.empresa)}</p>
    <h3>Contrato ${c ? ctPar(CT_EST, c.estado) : ''}</h3>
    <label class="campo" for="ct-imp">Importe acordado (€, sin IVA)</label><input type="text" inputmode="decimal" id="ct-imp" value="${imp}" ${edit ? '' : 'disabled'} />
    <p class="suave" id="ct-calc">Comisión ${esc(pctTxt(o.comision_pct))}.</p>
    <label class="campo" for="ct-ini">Inicio de obra</label><input type="date" id="ct-ini" value="${c && c.fecha_inicio ? c.fecha_inicio : ''}" ${edit ? '' : 'disabled'} />
    <label class="campo" for="ct-fin">Fin previsto</label><input type="date" id="ct-fin" value="${c && c.fecha_fin ? c.fecha_fin : ''}" ${edit && !sinFin ? '' : 'disabled'} />
    <label style="display:block;margin-top:4px"><input type="checkbox" id="ct-sinfin" ${sinFin ? 'checked' : ''} ${edit ? '' : 'disabled'} /> No especificado (depende de la obra)</label>
    <label class="campo" for="ct-forma">Forma de pago pactada</label><input type="text" id="ct-forma" maxlength="300" placeholder="Transferencia a 7 días de cada certificación" value="${esc(c ? c.forma_pago || '' : '')}" ${edit ? '' : 'disabled'} />
    <label class="campo" for="ct-notas">Notas (sin números de tarjeta ni cuenta)</label><textarea id="ct-notas" rows="2" maxlength="500" ${edit ? '' : 'disabled'}>${esc(c ? c.notas || '' : '')}</textarea>
    <h3>Plazos de pago</h3>
    <p class="suave">Lo que la contrata paga al subcontratista. La suma debe coincidir con el importe del contrato. La fecha prevista es opcional: déjala vacía si depende de la obra.</p>
    <div id="ct-plazos">${filas.map((p, i) => ctFilaEditable(p, i, edit)).join('')}</div>
    ${edit ? '<p><button class="btn peq" id="ct-mas">Añadir plazo</button> <span id="ct-suma" class="suave"></span></p>' : (bloqueado ? '<p class="suave">Hay pagos o facturas registrados: los plazos ya no se pueden rehacer.</p>' : '')}
    ${edit ? '<p><button class="btn primario" id="ct-guardar">Guardar contrato y plazos</button></p>' : ''}
    ${c && c.estado !== 'anulado' ? ctBloqueSeguimiento(c, plazos) : ''}
    <p style="text-align:right"><button class="btn" data-cerrar>Cerrar</button></p>`, 760);
  $('[data-cerrar]').onclick = () => { cerrarVentana(); recargar(); };
  ctRecalcular();
  if (edit) {
    $('#ct-imp').oninput = ctRecalcular;
    $('#ct-sinfin').onchange = () => { $('#ct-fin').disabled = $('#ct-sinfin').checked; if ($('#ct-sinfin').checked) $('#ct-fin').value = ''; };
    $('#ct-plazos').oninput = ctRecalcular;
    $('#ct-mas').onclick = () => { const d = document.createElement('div'); d.innerHTML = ctFilaEditable({ concepto: '', importe_cents: '', fecha_prevista: '' }, $('#ct-plazos').children.length, true); $('#ct-plazos').appendChild(d.firstElementChild); };
    $('#ct-guardar').onclick = ctGuardar;
  }
  if (c && c.estado !== 'anulado') ctEnlazar(c, plazos);
}

function ctFilaEditable(p, i, edit) {
  const dis = edit ? '' : 'disabled';
  const val = p.importe_cents === '' || p.importe_cents == null ? '' : (p.importe_cents / 100).toFixed(2).replace('.', ',');
  return `<div class="ct-fila" style="display:grid;grid-template-columns:2fr 1fr 1fr auto;gap:8px;margin-bottom:6px;align-items:center">
    <input type="text" class="ct-conc" maxlength="120" placeholder="Concepto" value="${esc(p.concepto || '')}" ${dis} aria-label="Concepto" />
    <input type="date" class="ct-fec" value="${esc(p.fecha_prevista || '')}" ${dis} aria-label="Fecha prevista" />
    <input type="text" inputmode="decimal" class="ct-val" placeholder="0,00" value="${val}" ${dis} aria-label="Importe" />
    ${edit ? '<button class="btn peq" type="button" onclick="this.closest(\'.ct-fila\').remove();ctRecalcular()" aria-label="Quitar plazo">Quitar</button>' : '<span></span>'}</div>`;
}

function ctRecalcular() {
  const d = window.__ctd; if (!d || !$('#ct-calc')) return;
  const pct = Number(d.o.comision_pct || 0);
  const total = ctCents($('#ct-imp').value || '0');
  const com = Math.round(total * pct / 100);
  $('#ct-calc').textContent = total > 0 ? `Comisión ${pctTxt(d.o.comision_pct)} = ${eurosC(com)}. Neto para el subcontratista: ${eurosC(total - com)}.` : `Comisión ${pctTxt(d.o.comision_pct)}.`;
  const s = $('#ct-suma'); if (!s) return;
  const suma = [...document.querySelectorAll('.ct-val')].reduce((a, i) => a + (ctCents(i.value || '0') || 0), 0);
  s.textContent = `Suma de plazos: ${eurosC(suma)}${suma === total ? ' ✓' : ` (faltan ${eurosC(total - suma)})`}`;
}

async function ctGuardar() {
  const { o } = window.__ctd;
  const total = ctCents($('#ct-imp').value);
  if (!(total > 0)) return errorVentana('Escribe el importe del contrato.');
  const plazos = [...document.querySelectorAll('.ct-fila')].map((f) => ({
    concepto: f.querySelector('.ct-conc').value.trim(), fecha_prevista: f.querySelector('.ct-fec').value || null, importe_cents: ctCents(f.querySelector('.ct-val').value || '0') }));
  if (!plazos.length || plazos.some((p) => p.concepto.length < 3 || !(p.importe_cents > 0))) return errorVentana('Cada plazo necesita concepto (mínimo 3 letras) e importe.');
  if (plazos.reduce((a, p) => a + p.importe_cents, 0) !== total) return errorVentana('Los plazos no suman el importe del contrato.');
  $('#ct-guardar').disabled = true;
  try {
    await rpc('panel_ct_guardar', { p_obra_id: o.obra_id, p_importe_cents: total, p_forma_pago: $('#ct-forma').value || null,
      p_fecha_inicio: $('#ct-ini').value || null, p_fecha_fin: $('#ct-sinfin').checked ? null : ($('#ct-fin').value || null), p_notas: $('#ct-notas').value || null, p_plazos: plazos });
    aviso('Contrato guardado.');
    window.__ct.obras = await rpc('panel_ct_obras'); await ctCargarDetalle(o.obra_id);
  } catch (err) { $('#ct-guardar').disabled = false; errorVentana(err); }
}

function ctBloqueSeguimiento(c, plazos) {
  const hoy = new Date().toISOString().slice(0, 10);
  const doc = (id, txt, on) => `<label style="display:block"><input type="checkbox" id="${id}" ${on ? 'checked' : ''} /> ${txt}</label>`;
  return `<h3>Firma y documentación</h3>
    ${doc('ct-d1', 'Certificado de estar al corriente con Hacienda', c.doc_hacienda)}
    ${doc('ct-d2', 'Certificado de la Seguridad Social', c.doc_seguridad_social)}
    ${doc('ct-d3', 'Seguro de responsabilidad civil en vigor', c.doc_seguro_rc)}
    <label class="campo" for="ct-firma">Fecha de firma del contrato</label><input type="date" id="ct-firma" max="${hoy}" value="${c.fecha_firma || ''}" />
    <p><button class="btn" id="ct-estado-g">Guardar firma y documentación</button> ${c.estado === 'firmado' ? '' : '<span class="suave">Con fecha de firma el contrato pasa a «Firmado» y se pueden registrar pagos.</span>'}</p>
    <h3>Contrato en PDF</h3>
    ${c.pdf_path ? `<p>Archivo: <b>${esc(c.pdf_nombre || 'contrato.pdf')}</b> <span class="suave">(${fechaHora(c.pdf_subido_at)})</span> <button class="btn peq" id="ct-pdf-ver">Abrir</button></p>` : '<p class="suave">Todavía no hay PDF subido.</p>'}
    <input type="file" id="ct-pdf" accept="application/pdf" aria-label="PDF del contrato" /> <button class="btn peq" id="ct-pdf-subir">${c.pdf_path ? 'Subir otra versión' : 'Subir PDF'}</button>
    <p class="suave">Solo PDF, hasta 15 MB. Las versiones anteriores se conservan.</p>
    <h3>Seguimiento</h3>
    <div class="tabla-caja"><table class="t"><thead><tr><th>Plazo</th><th>Previsto</th><th>Importe al sub.</th><th>Comisión 3B</th><th>Pago de la contrata</th><th>Factura de comisión</th></tr></thead><tbody>${
      plazos.map((p) => `<tr><td data-l="Plazo"><b>${esc(p.orden)}.</b> ${esc(p.concepto)}</td><td data-l="Previsto">${p.fecha_prevista ? fecha(p.fecha_prevista) : 'Sin fecha'}</td>
        <td data-l="Importe">${eurosC(p.importe_cents)}<span class="sub">Neto ${eurosC(p.neto_cents)}</span></td><td data-l="Comisión">${eurosC(p.comision_cents)}</td>
        <td data-l="Pago">${ctPar(CT_PAGO, p.pago_estado)}${p.pago_estado === 'pagado' ? `<span class="sub">${fecha(p.pago_fecha)}${p.pago_referencia ? ' · ' + esc(p.pago_referencia) : ''}</span>` : (c.estado === 'firmado' ? `<button class="btn peq primario" data-ctp="pago" data-id="${esc(p.id)}">Marcar pagado</button>` : '')}</td>
        <td data-l="Factura">${ctPar(CT_COM, p.comision_estado)}${p.comision_estado !== 'pendiente' ? `<span class="sub">${esc(p.factura_numero)} · ${fecha(p.factura_fecha)}${p.comision_estado === 'cobrada' ? ' · cobrada ' + fecha(p.comision_cobro_fecha) : ''}</span>` : ''}${p.pago_estado === 'pagado' && p.comision_estado !== 'cobrada' ? `<button class="btn peq" data-ctp="com" data-id="${esc(p.id)}">${p.comision_estado === 'facturada' ? 'Marcar cobrada' : 'Registrar factura'}</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
}

function ctEnlazar(c, plazos) {

  const ver = $('#ct-pdf-ver');
  if (ver) ver.onclick = async () => {
    try { const { data, error } = await sb.storage.from('contratos-obra').createSignedUrl(c.pdf_path, 300); if (error) throw error; window.open(data.signedUrl, '_blank', 'noopener'); }
    catch (err) { aviso(mensajeError(err), true); }
  };
  const sub = $('#ct-pdf-subir');
  if (sub) sub.onclick = async () => {
    const f = $('#ct-pdf').files[0];
    if (!f) return aviso('Elige primero el PDF.', true);
    if (!(f.type === 'application/pdf' || /\.pdf$/i.test(f.name))) return aviso('Tiene que ser un PDF.', true);
    if (f.size > 15 * 1024 * 1024) return aviso('El PDF pesa más de 15 MB.', true);
    sub.disabled = true;
    try {
      const ruta = `${c.id}/${Date.now()}.pdf`;
      const { error: eu } = await sb.storage.from('contratos-obra').upload(ruta, f, { contentType: 'application/pdf', upsert: false }); if (eu) throw eu;
      await rpc('panel_ct_pdf', { p_contrato_id: c.id, p_path: ruta, p_nombre: f.name });
      aviso('PDF subido.'); await ctCargarDetalle(window.__ctd.o.obra_id);
    } catch (err) { sub.disabled = false; aviso(mensajeError(err), true); }
  };
  const g = $('#ct-estado-g');
  if (g) g.onclick = async () => {
    const f = $('#ct-firma').value;
    g.disabled = true;
    try {
      await rpc('panel_ct_estado', { p_contrato_id: c.id, p_estado: f ? 'firmado' : 'borrador', p_fecha_firma: f || null,
        p_hacienda: $('#ct-d1').checked, p_seg_social: $('#ct-d2').checked, p_seguro_rc: $('#ct-d3').checked });
      aviso('Guardado.'); window.__ct.obras = await rpc('panel_ct_obras'); await ctCargarDetalle(window.__ctd.o.obra_id);
    } catch (err) { g.disabled = false; errorVentana(err); }
  };
}

function ctVentanaPago(id) {
  const p = window.__ctd.plazos.find((x) => x.id === id); if (!p) return;
  const hoy = new Date().toISOString().slice(0, 10);
  abrirVentana(`<h2>Pago de la contrata</h2><p><b>${esc(p.concepto)}</b> · ${eurosC(p.importe_cents)} <span class="suave">(neto ${eurosC(p.neto_cents)})</span></p>
    <p class="suave">Marca esto solo cuando la contrata ya haya pagado al subcontratista.</p>
    <label class="campo" for="ctp-f">Fecha del pago</label><input type="date" id="ctp-f" value="${hoy}" max="${hoy}" />
    <label class="campo" for="ctp-r">Referencia (opcional, nunca un número de tarjeta o cuenta)</label><input type="text" id="ctp-r" maxlength="80" />
    ${pieVentana('Marcar pagado', 'primario')}`, 480);
  $('[data-cerrar]').onclick = ctPintar;
  $('#v-ok').onclick = async () => {
    $('#v-ok').disabled = true;
    try { await rpc('panel_ct_plazo_pagado', { p_plazo_id: id, p_fecha: $('#ctp-f').value, p_referencia: $('#ctp-r').value || null }); aviso('Pago registrado.');
      window.__ct.obras = await rpc('panel_ct_obras'); await ctCargarDetalle(window.__ctd.o.obra_id); }
    catch (err) { $('#v-ok').disabled = false; errorVentana(err); }
  };
}

function ctVentanaComision(id) {
  const p = window.__ctd.plazos.find((x) => x.id === id); if (!p) return;
  const hoy = new Date().toISOString().slice(0, 10);
  const ya = p.comision_estado === 'facturada';
  abrirVentana(`<h2>Comisión de 3B</h2><p><b>${esc(p.concepto)}</b> · comisión <b>${eurosC(p.comision_cents)}</b></p>
    <label class="campo" for="ctc-n">Número de factura de 3B</label><input type="text" id="ctc-n" maxlength="40" value="${esc(p.factura_numero || '')}" ${ya ? 'disabled' : ''} />
    <label class="campo" for="ctc-f">Fecha de la factura</label><input type="date" id="ctc-f" max="${hoy}" value="${p.factura_fecha || hoy}" ${ya ? 'disabled' : ''} />
    <label class="campo" for="ctc-e">Situación</label><select id="ctc-e"><option value="facturada" ${ya ? '' : 'selected'}>Factura emitida (pendiente de cobro)</option><option value="cobrada" ${ya ? 'selected' : ''}>Factura cobrada</option></select>
    <label class="campo" for="ctc-c">Fecha de cobro (si está cobrada)</label><input type="date" id="ctc-c" max="${hoy}" value="${hoy}" />
    <p class="suave">El panel no emite ni envía facturas: aquí solo anotas la que ya has hecho.</p>
    ${pieVentana('Guardar', 'primario')}`, 500);
  $('[data-cerrar]').onclick = ctPintar;
  $('#v-ok').onclick = async () => {
    $('#v-ok').disabled = true;
    try { await rpc('panel_ct_plazo_comision', { p_plazo_id: id, p_estado: $('#ctc-e').value, p_factura_numero: $('#ctc-n').value, p_factura_fecha: $('#ctc-f').value || null, p_cobro_fecha: $('#ctc-e').value === 'cobrada' ? ($('#ctc-c').value || null) : null });
      aviso('Comisión actualizada.'); window.__ct.obras = await rpc('panel_ct_obras'); await ctCargarDetalle(window.__ctd.o.obra_id); }
    catch (err) { $('#v-ok').disabled = false; errorVentana(err); }
  };
}

document.addEventListener('click', async (e) => {
  const a = e.target.closest('[data-act="ct-abrir"]');
  const b = e.target.closest('[data-ctp]');
  try {
    if (a) return await ctCargarDetalle(a.dataset.id);
    if (b) return b.dataset.ctp === 'pago' ? ctVentanaPago(b.dataset.id) : ctVentanaComision(b.dataset.id);
  } catch (err) { aviso(mensajeError(err), true); }
});