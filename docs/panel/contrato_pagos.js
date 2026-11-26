// Contrato y pagos por obra. Requiere la migracion 0099.
// La contrata paga a 3B cada plazo (precio + comision); 3B paga a la subcontrata el precio menos la comision,
// y solo despues de haber cobrado. El panel NO mueve dinero: solo registra lo que ocurre. Sin Stripe ni correos.
const CT_COBRO = { pendiente: ['Pendiente de cobro', 'aviso'], cobrado: ['Cobrado', 'ok'] };
const CT_PAGO = { pendiente: ['Pendiente', 'aviso'], pagado: ['Pagado', 'ok'] };
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
      <p class="suave">La contrata paga a 3B cada plazo (precio + comisión). 3B paga a la subcontrata el precio menos la comisión, solo después de cobrar. Aquí solo se <b>registra</b>: el panel no mueve dinero.</p></div></div>
    <div class="panel" style="padding:14px 18px;margin-bottom:14px"><b>Importante:</b> nunca escribas aquí números de tarjeta ni de cuenta. Los importes son sin IVA.</div>
    <div class="resumen" style="margin-bottom:14px">
      <a href="#/contrato-pagos"><b>${eurosC(res.a_cobrar_cents)}</b><span>Pendiente de cobrar a las contratas</span></a>
      <a href="#/contrato-pagos"><b>${eurosC(res.custodia_cents)}</b><span>En custodia (cobrado, sin pagar a la subcontrata)</span></a>
      <a href="#/contrato-pagos"><b>${eurosC(res.pagado_sub_cents)}</b><span>Pagado a subcontratas</span></a>
      <a href="#/contrato-pagos"><b>${eurosC(res.comision_cobrada_cents)}</b><span>Comisión de 3B cobrada</span><span style="display:block">de ${eurosC(res.comision_total_cents)} prevista</span></a>
    </div>
    <div class="panel"><div style="padding:14px 18px 0"><b>Obras adjudicadas</b></div><div id="ct-obras"></div></div>`;
  $('#ct-obras').innerHTML = htmlTabla('ct-obras', [
    { t: 'Obra', f: (x) => `<b>${esc(x.referencia || '')}</b> ${esc(x.titulo)}<span class="sub">${esc(x.empresa)}</span>`, s: (x) => String(x.titulo).toLowerCase() },
    { t: 'Oferta', f: (x) => eurosC(x.oferta_cents), s: (x) => Number(x.oferta_cents) },
    { t: 'Contrato', f: (x) => x.contrato_id ? ctPar(CT_EST, x.contrato_estado) : '<span class="suave">Sin crear</span>' },
    { t: 'Cobrado a la contrata', f: (x) => x.contrato_id ? `${eurosC(x.cobrado_cents)}<span class="sub">de ${eurosC(x.total_cents)}</span>` : '—', s: (x) => Number(x.cobrado_cents || 0) },
    { t: 'Pagado a la subcontrata', f: (x) => x.contrato_id ? `${eurosC(x.pagado_sub_cents)}<span class="sub">de ${eurosC(x.neto_sub_cents)} · en custodia ${eurosC(x.custodia_cents)}</span>` : '—', s: (x) => Number(x.pagado_sub_cents || 0) },
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
  const bloqueado = plazos.some((p) => p.cobro_estado !== 'pendiente' || p.pago_estado !== 'pendiente' || p.factura_numero);
  const firmado = c && c.estado === 'firmado';
  const filas = plazos.length ? plazos : [{ concepto: 'Anticipo', importe_cents: '', fecha_prevista: '' }, { concepto: 'Final de obra', importe_cents: '', fecha_prevista: '' }];
  const imp = c ? (c.importe_cents / 100).toFixed(2).replace('.', ',') : (o.oferta_cents / 100).toFixed(2).replace('.', ',');
  const edit = !bloqueado && (!c || c.estado !== 'anulado');
  const sinFin = !c || !c.fecha_fin;
  abrirVentana(`<h2>Contrato y pagos</h2><p><b>${esc(o.referencia || '')} ${esc(o.titulo)}</b> · ${esc(o.empresa)}</p>
    <h3>Contrato ${c ? ctPar(CT_EST, c.estado) : ''}</h3>
    <label class="campo" for="ct-imp">Precio de la obra (€, sin IVA)</label><input type="text" inputmode="decimal" id="ct-imp" value="${imp}" ${edit ? '' : 'disabled'} />
    <p class="suave" id="ct-calc">Comisión ${esc(pctTxt(o.comision_pct))}.</p>
    <label class="campo" for="ct-ini">Inicio de obra</label><input type="date" id="ct-ini" value="${c && c.fecha_inicio ? c.fecha_inicio : ''}" ${edit ? '' : 'disabled'} />
    <label class="campo" for="ct-fin">Fin previsto</label><input type="date" id="ct-fin" value="${c && c.fecha_fin ? c.fecha_fin : ''}" ${edit && !sinFin ? '' : 'disabled'} />
    <label style="display:block;margin-top:4px"><input type="checkbox" id="ct-sinfin" ${sinFin ? 'checked' : ''} ${edit ? '' : 'disabled'} /> No especificado (depende de la obra)</label>
    <label class="campo" for="ct-forma">Forma de pago pactada</label><input type="text" id="ct-forma" maxlength="300" placeholder="Transferencia a 7 días de cada certificación" value="${esc(c ? c.forma_pago || '' : '')}" ${edit ? '' : 'disabled'} />
    <label class="campo" for="ct-notas">Notas (sin números de tarjeta ni cuenta)</label><textarea id="ct-notas" rows="2" maxlength="500" ${edit ? '' : 'disabled'}>${esc(c ? c.notas || '' : '')}</textarea>
    <h3>Plazos de pago</h3>
    <p class="suave">Precio de cada plazo, sin comisión. La suma debe coincidir con el precio del contrato. La fecha prevista es opcional: déjala vacía si depende de la obra.</p>
    <div id="ct-plazos">${filas.map((p, i) => ctFilaEditable(p, i, edit)).join('')}</div>
    ${edit ? '<p><button class="btn peq" id="ct-mas">Añadir plazo</button> <span id="ct-suma" class="suave"></span></p>' : (bloqueado ? '<p class="suave">Hay cobros, pagos o facturas registrados: los plazos ya no se pueden rehacer.</p>' : '')}
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
  $('#ct-calc').textContent = total > 0 ? `Comisión ${pctTxt(d.o.comision_pct)} = ${eurosC(com)} a cada lado. La contrata paga a 3B ${eurosC(total + com)} (precio + comisión) y la subcontrata recibe ${eurosC(total - com)} (precio − comisión). 3B se queda ${eurosC(2 * com)} (sin IVA).` : `Comisión ${pctTxt(d.o.comision_pct)}: se suma a la contrata y se resta a la subcontrata.`;
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
    <div class="tabla-caja"><table class="t"><thead><tr><th>Plazo</th><th>Previsto</th><th>Precio</th><th>Paga la contrata</th><th>Recibe la subcontrata</th><th>Comisión 3B</th><th>1. Cobro a la contrata</th><th>2. Pago a la subcontrata</th><th>Factura de 3B</th></tr></thead><tbody>${
      plazos.map((p) => `<tr><td data-l="Plazo"><b>${esc(p.orden)}.</b> ${esc(p.concepto)}</td><td data-l="Previsto">${p.fecha_prevista ? fecha(p.fecha_prevista) : 'Sin fecha'}</td>
        <td data-l="Precio">${eurosC(p.importe_cents)}</td><td data-l="Paga la contrata"><b>${eurosC(p.total_cents)}</b><span class="sub">+${eurosC(p.comision_contrata_cents)}</span></td><td data-l="Recibe la subcontrata"><b>${eurosC(p.neto_sub_cents)}</b><span class="sub">−${eurosC(p.comision_sub_cents)}</span></td><td data-l="Comisión">${eurosC(p.comision_contrata_cents + p.comision_sub_cents)}</td>
        <td data-l="Cobro">${ctPar(CT_COBRO, p.cobro_estado)}${p.cobro_estado === 'cobrado' ? `<span class="sub">${fecha(p.cobro_fecha)}${p.cobro_referencia ? ' · ' + esc(p.cobro_referencia) : ''}</span>` : (c.estado === 'firmado' ? `<button class="btn peq primario" data-ctp="cobro" data-id="${esc(p.id)}">Marcar cobrado</button>` : '')}</td>
        <td data-l="Pago">${ctPar(CT_PAGO, p.pago_estado)}${p.pago_estado === 'pagado' ? `<span class="sub">${fecha(p.pago_fecha)}${p.pago_referencia ? ' · ' + esc(p.pago_referencia) : ''}</span>` : (p.cobro_estado === 'cobrado' ? `<button class="btn peq primario" data-ctp="pago" data-id="${esc(p.id)}">Marcar pagado</button>` : '<span class="sub">Tras cobrar</span>')}</td>
        <td data-l="Factura">${p.factura_numero ? `${esc(p.factura_numero)}<span class="sub">${fecha(p.factura_fecha)}</span><button class="btn peq" data-ctp="odoo" data-id="${esc(p.id)}">Comprobar en Odoo</button>` : '<span class="suave">Sin anotar</span>'} <button class="btn peq" data-ctp="fact" data-id="${esc(p.id)}">${p.factura_numero ? 'Cambiar' : 'Anotar factura'}</button></td></tr>`).join('')}</tbody></table></div>`;
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

function ctVentanaCobro(id) {
  const p = window.__ctd.plazos.find((x) => x.id === id); if (!p) return;
  const hoy = new Date().toISOString().slice(0, 10);
  abrirVentana(`<h2>Cobro a la contrata</h2><p><b>${esc(p.concepto)}</b> · la contrata debe pagar a 3B <b>${eurosC(p.total_cents)}</b> <span class="suave">(precio ${eurosC(p.importe_cents)} + comisión ${eurosC(p.comision_contrata_cents)}, sin IVA)</span></p>
    <p class="suave">Marca esto solo cuando el dinero ya esté en la cuenta de 3B.</p>
    <label class="campo" for="ctc-f">Fecha del cobro</label><input type="date" id="ctc-f" value="${hoy}" max="${hoy}" />
    <label class="campo" for="ctc-r">Referencia (opcional, nunca un número de tarjeta o cuenta)</label><input type="text" id="ctc-r" maxlength="80" />
    ${pieVentana('Marcar cobrado', 'primario')}`, 500);
  $('[data-cerrar]').onclick = ctPintar;
  $('#v-ok').onclick = () => ctLlamar('panel_ct_plazo_cobrado', { p_plazo_id: id, p_fecha: $('#ctc-f').value, p_referencia: $('#ctc-r').value || null }, 'Cobro registrado.');
}

function ctVentanaPago(id) {
  const p = window.__ctd.plazos.find((x) => x.id === id); if (!p) return;
  const hoy = new Date().toISOString().slice(0, 10);
  abrirVentana(`<h2>Pago a la subcontrata</h2><p><b>${esc(p.concepto)}</b> · 3B paga a la subcontrata <b>${eurosC(p.neto_sub_cents)}</b> <span class="suave">(precio ${eurosC(p.importe_cents)} − comisión ${eurosC(p.comision_sub_cents)}, sin IVA)</span></p>
    <p class="suave">Marca esto solo cuando la transferencia ya se haya hecho en el banco.</p>
    <label class="campo" for="ctp-f">Fecha del pago</label><input type="date" id="ctp-f" value="${hoy}" max="${hoy}" />
    <label class="campo" for="ctp-r">Referencia (opcional, nunca un número de tarjeta o cuenta)</label><input type="text" id="ctp-r" maxlength="80" />
    ${pieVentana('Marcar pagado', 'primario')}`, 500);
  $('[data-cerrar]').onclick = ctPintar;
  $('#v-ok').onclick = () => ctLlamar('panel_ct_plazo_pagado', { p_plazo_id: id, p_fecha: $('#ctp-f').value, p_referencia: $('#ctp-r').value || null }, 'Pago registrado.');
}

function ctVentanaFactura(id) {
  const p = window.__ctd.plazos.find((x) => x.id === id); if (!p) return;
  const hoy = new Date().toISOString().slice(0, 10);
  abrirVentana(`<h2>Factura de 3B</h2><p><b>${esc(p.concepto)}</b></p>
    <label class="campo" for="ctf-n">Número de factura</label><input type="text" id="ctf-n" maxlength="40" value="${esc(p.factura_numero || '')}" />
    <label class="campo" for="ctf-f">Fecha de la factura</label><input type="date" id="ctf-f" max="${hoy}" value="${p.factura_fecha || hoy}" />
    <p class="suave">El panel no emite ni envía facturas: aquí solo anotas la que ya has hecho. Qué se factura y con qué IVA lo decide la asesoría.</p>
    ${pieVentana('Guardar', 'primario')}`, 500);
  $('[data-cerrar]').onclick = ctPintar;
  $('#v-ok').onclick = () => ctLlamar('panel_ct_plazo_factura', { p_plazo_id: id, p_numero: $('#ctf-n').value, p_fecha: $('#ctf-f').value || null }, 'Factura anotada.');
}

async function ctLlamar(fn, args, okTxt) {
  $('#v-ok').disabled = true;
  try { await rpc(fn, args); aviso(okTxt); window.__ct.obras = await rpc('panel_ct_obras'); await ctCargarDetalle(window.__ctd.o.obra_id); }
  catch (err) { $('#v-ok').disabled = false; errorVentana(err); }
}

const ODOO_PAGO = { not_paid: 'Sin pagar', in_payment: 'En pago', paid: 'Pagada', partial: 'Pago parcial', reversed: 'Revertida', invoicing_legacy: 'Antigua' };
async function ctComprobarOdoo(id, boton) {
  boton.disabled = true;
  try {
    const { data, error } = await sb.functions.invoke('odoo-consultar-factura', { body: { plazo_id: id } });
    if (error) { let m = error.message; try { const j = await error.context.json(); if (j && j.error) m = j.error; } catch (e) {} throw new Error(m); }
    if (!data.encontrada) aviso(`Odoo no tiene ninguna factura de cliente con el número ${data.factura_numero}.`, true);
    else aviso(`Odoo · ${data.factura_numero}: ${ODOO_PAGO[data.pago] || data.pago}${data.estado !== 'posted' ? ' (factura no confirmada)' : ''}. Base ${eurosC(Math.round(data.base_imponible * 100))}${data.coincide_importe ? ' ✓ coincide con el plazo' : ' (no coincide con el total ' + eurosC(Math.round(data.total_esperado_sin_iva * 100)) + ' ni con la comisión ' + eurosC(Math.round(data.comision_esperada * 100)) + ')'}. Esto no cambia nada en el panel.`);
  } catch (err) { aviso(mensajeError(err), true); }
  boton.disabled = false;
}

document.addEventListener('click', async (e) => {
  const a = e.target.closest('[data-act="ct-abrir"]');
  const b = e.target.closest('[data-ctp]');
  try {
    if (a) return await ctCargarDetalle(a.dataset.id);
    if (b) { const k = b.dataset.ctp; return k === 'cobro' ? ctVentanaCobro(b.dataset.id) : k === 'pago' ? ctVentanaPago(b.dataset.id) : k === 'fact' ? ctVentanaFactura(b.dataset.id) : ctComprobarOdoo(b.dataset.id, b); }
  } catch (err) { aviso(mensajeError(err), true); }
});