// Panel de 3B · sección «Comisión por obra»: comisión de la subcontrata (como antes) y, además, la comisión a quien contrata.
// Se carga con <script src="comision_obra.js"></script> y usa las utilidades del panel (rpc, esc, abrirVentana, cerrarVentana,
// pieVentana, errorVentana, aviso, $). Requiere las migraciones 0081 y 0091.
const CO_ESTADO = { abierta: 'Abierta', adjudicada: 'Adjudicada', cerrada: 'Cerrada', cancelada: 'Cancelada', en_curso: 'En curso', en_revision: 'En revisión', pendiente_info: 'Pendiente de información', rechazada: 'Rechazada' };
const coPct = (p) => (p === null || p === undefined) ? 'sin definir' : String(Number(p)).replace('.', ',') + ' %';
const coNorm = (t) => String(t || '').trim().toLowerCase();
const coEur = (n) => Number(n || 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
const coNum = (raw) => Number(String(raw).trim().replace(',', '.'));

async function vistaComisionObra(v) {
  const params = new URLSearchParams((location.hash.split('?')[1]) || '');
  const q = coNorm(params.get('q'));
  const f = params.get('f') || 'todas';
  const [todas, con, est] = await Promise.all([
    rpc('panel_obras_comision'), rpc('panel_obras_comision_contratante'), rpc('panel_comision_contratante_estado')]);
  const conPropia = {}; (con || []).forEach((c) => { conPropia[c.id] = c.comision_propia; });
  const activa = !!est.activa;
  const pctGeneral = Number(est.pct_general || 0);
  const subGeneral = est.comision_subcontrata_general;
  // Qué se cobrará al contratante en una obra: nada si está apagado o es de un particular
  const alContratante = (x) => {
    if (x.origen === 'particular') return { t: '—', nota: 'Los particulares usan paquetes' };
    if (!activa) return { t: 'Apagada', nota: '' };
    const p = (conPropia[x.id] !== null && conPropia[x.id] !== undefined) ? Number(conPropia[x.id]) : pctGeneral;
    return { t: coPct(p), nota: '' };
  };

  let lista = todas;
  if (f === 'propia') lista = lista.filter((x) => x.comision_propia !== null);
  if (f === 'particular' || f === 'empresa') lista = lista.filter((x) => x.origen === f);
  if (q) lista = lista.filter((x) => coNorm(x.titulo).includes(q));
  const tabs = [['todas', 'Todas'], ['propia', 'Con comisión propia'], ['particular', 'De particulares'], ['empresa', 'De empresas']];

  v.innerHTML = `<div class="cab"><div><h1>Comisión por obra</h1>
    <p class="suave">3B Conecta puede cobrar comisión a los dos lados: a la subcontrata (se descuenta de lo que cobra) y a quien contrata
    (se suma a lo que paga). Aquí fijas ambas, obra a obra. Solo afecta a pagos que aún no se han cobrado.</p></div></div>
    <div class="panel"><h2>Comisión a quien contrata</h2>
      <p>Estado: <b class="${activa ? 'ok' : 'suave'}">${activa ? 'Encendida' : 'Apagada'}</b> · Porcentaje general: <b>${esc(coPct(pctGeneral))}</b>
      · Comisión general de la subcontrata: <b>${esc(coPct(subGeneral))}</b></p>
      <p class="suave">Solo se aplica a obras de empresas. Con la comisión apagada, el cobro es el de siempre. Los pagos con tarjeta siguen su propio interruptor.</p>
      <div class="herramientas">
        <button class="btn primario" data-co="interruptor">${activa ? 'Apagar' : 'Encender'}</button>
        <button class="btn" data-co="general">Cambiar el porcentaje general</button>
        <button class="btn" data-co="simular">Simulador</button>
      </div></div>
    <div class="herramientas">
      ${tabs.map(([k, n]) => `<a class="btn ${k === f ? 'primario' : ''}" href="#/comision-obra?f=${k}${q ? '&q=' + encodeURIComponent(q) : ''}">${n}</a>`).join('')}
      <input type="search" id="co-buscar" placeholder="Buscar obra por título" value="${esc(params.get('q') || '')}">
    </div>
    <div class="panel">${lista.length ? `<div class="tabla-caja"><table class="t"><thead><tr><th>Obra</th><th>Origen</th><th>Estado</th><th>Subcontrata</th><th>Contratante</th><th></th></tr></thead><tbody>
      ${lista.map((x) => { const c = alContratante(x); return `<tr><td><b>${esc(x.titulo)}</b></td><td>${x.origen === 'particular' ? 'Particular' : 'Empresa'}</td><td>${esc(CO_ESTADO[x.estado] || x.estado)}</td>
        <td><b>${esc(coPct(x.comision_aplicable))}</b>${x.comision_propia !== null ? ' <span class="suave">(propia)</span>' : ''}</td>
        <td><b>${esc(c.t)}</b>${(conPropia[x.id] !== null && conPropia[x.id] !== undefined && x.origen !== 'particular') ? ' <span class="suave">(propia)</span>' : ''}</td>
        <td class="acc"><button class="btn peq" data-co="cambiar" data-i="${esc(x.id)}">Subcontrata</button>
        <button class="btn peq" data-co="cero" data-i="${esc(x.id)}">0 % (OH Casas)</button>
        ${x.origen !== 'particular' ? `<button class="btn peq" data-co="contratante" data-i="${esc(x.id)}">Contratante</button>` : ''}
        ${x.comision_propia !== null ? `<button class="btn peq mal" data-co="quitar" data-i="${esc(x.id)}">Quitar</button>` : ''}</td></tr>`; }).join('')}
      </tbody></table></div>` : '<div class="vacio">No hay obras con ese filtro.</div>'}</div>
    ${todas.length >= 500 ? '<p class="suave">Se muestran las 500 obras más recientes.</p>' : ''}`;

  const buscar = $('#co-buscar');
  buscar.onkeydown = (e) => { if (e.key === 'Enter') location.hash = `#/comision-obra?f=${f}&q=${encodeURIComponent(buscar.value.trim())}`; };
  const porId = (id) => todas.find((x) => x.id === id);
  const recargar = async (msg) => { cerrarVentana(); aviso(msg); await vistaComisionObra(v); };
  const guardar = async (id, pct, msg) => {
    try { await rpc('panel_guardar_comision', { p_tipo: 'obra', p_id: id, p_pct: pct }); await recargar(msg); }
    catch (err) { const b = $('#v-ok'); if (b) b.disabled = false; errorVentana(err); }
  };
  const guardarCon = async (fn, args, msg) => {
    try { await rpc(fn, args); await recargar(msg); }
    catch (err) { const b = $('#v-ok'); if (b) b.disabled = false; errorVentana(err); }
  };

  v.querySelectorAll('[data-co]').forEach((b) => {
    b.onclick = () => {
      const k = b.dataset.co;
      const x = porId(b.dataset.i);
      if (k === 'interruptor') {
        abrirVentana(`<h2>${activa ? 'Apagar' : 'Encender'} la comisión a quien contrata</h2>
          <p>${activa ? 'Los pagos nuevos de obras de empresas se cobrarán sin esta comisión.'
            : `Los pagos nuevos de obras de empresas llevarán un <b>${esc(coPct(pctGeneral))}</b> más, a cargo de quien contrata, salvo las obras con porcentaje propio.`}</p>
          ${!activa && pctGeneral <= 0 ? '<p class="mal-t">El porcentaje general está en 0 %: primero fija el porcentaje.</p>' : ''}
          ${pieVentana(activa ? 'Apagar' : 'Encender', 'primario')}`, 480);
        $('[data-cerrar]').onclick = cerrarVentana;
        $('#v-ok').onclick = () => { $('#v-ok').disabled = true; guardarCon('panel_comision_contratante_ajustar', { p_activa: !activa, p_pct: null }, activa ? 'Comisión a quien contrata apagada.' : 'Comisión a quien contrata encendida.'); };
      } else if (k === 'general') {
        abrirVentana(`<h2>Porcentaje general a quien contrata</h2>
          <label class="campo" for="co-g">Porcentaje (0 a 30)</label><input type="number" id="co-g" min="0" max="30" step="0.01" value="${esc(pctGeneral)}" />${pieVentana('Guardar', 'primario')}`, 480);
        $('[data-cerrar]').onclick = cerrarVentana;
        $('#v-ok').onclick = () => {
          const raw = $('#co-g').value; const pct = coNum(raw);
          if (String(raw).trim() === '' || isNaN(pct) || pct < 0 || pct > 30) return errorVentana('Escribe un porcentaje entre 0 y 30.');
          $('#v-ok').disabled = true; guardarCon('panel_comision_contratante_ajustar', { p_activa: null, p_pct: pct }, 'Porcentaje guardado.');
        };
      } else if (k === 'simular') {
        abrirVentana(`<h2>Simulador de comisiones</h2><p class="suave">Solo calcula; no guarda ni cobra nada.</p>
          <label class="campo" for="co-si">Importe de la oferta (€)</label><input type="number" id="co-si" min="1" step="0.01" value="10000" />
          <label class="campo" for="co-ss">Comisión a la subcontrata (%)</label><input type="number" id="co-ss" min="0" max="50" step="0.01" value="${esc(subGeneral === null || subGeneral === undefined ? 15 : subGeneral)}" />
          <label class="campo" for="co-sc">Comisión a quien contrata (%)</label><input type="number" id="co-sc" min="0" max="30" step="0.01" value="${esc(pctGeneral || 15)}" />
          <div id="co-res"></div>${pieVentana('Calcular', 'primario')}`, 520);
        $('[data-cerrar]').onclick = cerrarVentana;
        $('#v-ok').onclick = async () => {
          const imp = coNum($('#co-si').value), s = coNum($('#co-ss').value), c = coNum($('#co-sc').value);
          if (isNaN(imp) || imp <= 0) return errorVentana('Escribe un importe mayor que 0.');
          if (isNaN(s) || s < 0 || s > 50 || isNaN(c) || c < 0 || c > 30) return errorVentana('Revisa los porcentajes.');
          try {
            const r = await rpc('panel_simular_comision_doble', { p_importe: imp, p_pct_subcontrata: s, p_pct_contratante: c });
            $('#co-res').innerHTML = `<div class="tabla-caja"><table class="t"><tbody>
              <tr><td>Quien contrata paga</td><td><b>${esc(coEur(r.paga_el_contratante))}</b></td></tr>
              <tr><td>La subcontrata cobra</td><td><b>${esc(coEur(r.cobra_la_subcontrata))}</b></td></tr>
              <tr><td>3B Conecta ingresa</td><td><b>${esc(coEur(r.ingresa_la_plataforma))}</b> <span class="suave">(${esc(String(r.porcentaje_sobre_oferta).replace('.', ','))} % de la oferta)</span></td></tr>
              </tbody></table></div><p class="suave">${esc(r.aviso)}</p>`;
          } catch (err) { errorVentana(err); }
        };
      } else if (k === 'contratante' && x) {
        const propio = conPropia[x.id];
        abrirVentana(`<h2>Comisión a quien contrata</h2><p><b>${esc(x.titulo)}</b></p>
          <label class="campo" for="co-c">Porcentaje de esta obra (0 a 30). Vacío = usa el general (${esc(coPct(pctGeneral))})</label>
          <input type="number" id="co-c" min="0" max="30" step="0.01" value="${propio !== null && propio !== undefined ? esc(propio) : ''}" />${pieVentana('Guardar', 'primario')}`, 480);
        $('[data-cerrar]').onclick = cerrarVentana;
        $('#v-ok').onclick = () => {
          const raw = $('#co-c').value.trim(); const pct = raw === '' ? null : coNum(raw);
          if (pct !== null && (isNaN(pct) || pct < 0 || pct > 30)) return errorVentana('Escribe un porcentaje entre 0 y 30, o déjalo vacío.');
          $('#v-ok').disabled = true; guardarCon('panel_comision_contratante_obra', { p_obra_id: x.id, p_pct: pct }, 'Comisión de la obra guardada.');
        };
      } else if (k === 'quitar' && x) {
        abrirVentana(`<h2>Quitar comisión propia</h2><p><b>${esc(x.titulo)}</b> volverá a usar la comisión de la empresa o la general.</p>${pieVentana('Quitar', 'primario')}`, 480);
        $('[data-cerrar]').onclick = cerrarVentana; $('#v-ok').onclick = () => { $('#v-ok').disabled = true; guardar(x.id, null, 'Comisión propia quitada.'); };
      } else if (k === 'cero' && x) {
        abrirVentana(`<h2>Obra sin comisión de subcontrata</h2><p><b>${esc(x.titulo)}</b> se cobrará con <b>0 %</b> de comisión a la subcontrata (publicada en nombre de OH Casas).</p>${pieVentana('Fijar 0 %', 'primario')}`, 480);
        $('[data-cerrar]').onclick = cerrarVentana; $('#v-ok').onclick = () => { $('#v-ok').disabled = true; guardar(x.id, 0, 'Comisión fijada en 0 %.'); };
      } else if (k === 'cambiar' && x) {
        abrirVentana(`<h2>Comisión de la subcontrata</h2><p><b>${esc(x.titulo)}</b></p>
          <label class="campo" for="co-pct">Comisión (%)</label><input type="number" id="co-pct" min="0" max="50" step="0.01" value="${x.comision_propia !== null ? esc(x.comision_propia) : ''}" />${pieVentana('Guardar', 'primario')}`, 480);
        $('[data-cerrar]').onclick = cerrarVentana;
        $('#v-ok').onclick = () => {
          const raw = $('#co-pct').value.trim(); const pct = coNum(raw);
          if (raw === '' || isNaN(pct) || pct < 0 || pct > 50) return errorVentana('Escribe una comisión entre 0 y 50.');
          $('#v-ok').disabled = true; guardar(x.id, pct, 'Comisión guardada.');
        };
      }
    };
  });
}