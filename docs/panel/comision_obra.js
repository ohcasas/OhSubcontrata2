// Panel de 3B · sección «Comisión por obra»: lista las obras y permite fijar la comisión de cada una
// (por ejemplo 0 % en las que publica la administración en nombre de OH Casas). Se carga con
// <script src="comision_obra.js"></script> y usa las utilidades del panel (rpc, esc, abrirVentana, cerrarVentana,
// pieVentana, errorVentana, aviso, $). No cambia la sección «Comisiones» existente: usa la misma función
// de la base de datos (panel_guardar_comision) y por tanto las mismas reglas (0–50 %, obra > empresa > general).
const CO_ESTADO = { abierta: 'Abierta', adjudicada: 'Adjudicada', cerrada: 'Cerrada', cancelada: 'Cancelada' };
const coPct = (p) => (p === null || p === undefined) ? 'sin definir' : String(Number(p)).replace('.', ',') + ' %';
const coNorm = (t) => String(t || '').trim().toLowerCase();

async function vistaComisionObra(v) {
  const params = new URLSearchParams((location.hash.split('?')[1]) || '');
  const q = coNorm(params.get('q'));
  const f = params.get('f') || 'todas';
  const todas = await rpc('panel_obras_comision');
  let lista = todas;
  if (f === 'propia') lista = lista.filter((x) => x.comision_propia !== null);
  if (f === 'particular' || f === 'empresa') lista = lista.filter((x) => x.origen === f);
  if (q) lista = lista.filter((x) => coNorm(x.titulo).includes(q));
  const tabs = [['todas', 'Todas'], ['propia', 'Con comisión propia'], ['particular', 'De particulares'], ['empresa', 'De empresas']];

  v.innerHTML = `<div class="cab"><div><h1>Comisión por obra</h1>
    <p class="suave">Aquí fijas la comisión de una obra concreta. Tiene prioridad sobre la de la empresa, sobre las reglas de comisión y sobre la general.
    Para las obras que publica la administración en nombre de OH Casas, pon 0 %. Solo afecta a pagos que aún no se han cobrado.</p></div></div>
    <div class="herramientas">
      ${tabs.map(([k, n]) => `<a class="btn ${k === f ? 'primario' : ''}" href="#/comision-obra?f=${k}${q ? '&q=' + encodeURIComponent(q) : ''}">${n}</a>`).join('')}
      <input type="search" id="co-buscar" placeholder="Buscar obra por título" value="${esc(params.get('q') || '')}">
    </div>
    <div class="panel">${lista.length ? `<table class="tabla"><thead><tr><th>Obra</th><th>Origen</th><th>Estado</th><th>Comisión propia</th><th>Se aplicará</th><th></th></tr></thead><tbody>
      ${lista.map((x) => `<tr><td><b>${esc(x.titulo)}</b></td><td>${x.origen === 'particular' ? 'Particular' : 'Empresa'}</td><td>${esc(CO_ESTADO[x.estado] || x.estado)}</td>
        <td>${esc(coPct(x.comision_propia))}</td><td><b>${esc(coPct(x.comision_aplicable))}</b></td>
        <td class="acc"><button class="btn peq" data-co="cambiar" data-i="${esc(x.id)}">Cambiar</button>
        <button class="btn peq" data-co="cero" data-i="${esc(x.id)}">0 % (OH Casas)</button>
        ${x.comision_propia !== null ? `<button class="btn peq mal" data-co="quitar" data-i="${esc(x.id)}">Quitar</button>` : ''}</td></tr>`).join('')}
      </tbody></table>` : '<div class="vacio">No hay obras con ese filtro.</div>'}</div>
    ${todas.length >= 500 ? '<p class="suave">Se muestran las 500 obras más recientes.</p>' : ''}`;

  const buscar = $('#co-buscar');
  buscar.onkeydown = (e) => { if (e.key === 'Enter') location.hash = `#/comision-obra?f=${f}&q=${encodeURIComponent(buscar.value.trim())}`; };
  const porId = (id) => todas.find((x) => x.id === id);
  const guardar = async (id, pct, msg) => {
    try { await rpc('panel_guardar_comision', { p_tipo: 'obra', p_id: id, p_pct: pct }); cerrarVentana(); aviso(msg); await vistaComisionObra(v); }
    catch (err) { const b = $('#v-ok'); if (b) b.disabled = false; errorVentana(err); }
  };
  v.querySelectorAll('[data-co]').forEach((b) => {
    b.onclick = () => {
      const x = porId(b.dataset.i); if (!x) return;
      if (b.dataset.co === 'quitar') {
        abrirVentana(`<h2>Quitar comisión propia</h2><p><b>${esc(x.titulo)}</b> volverá a usar la comisión de la empresa o la general.</p>${pieVentana('Quitar', 'primario')}`, 480);
        $('[data-cerrar]').onclick = cerrarVentana; $('#v-ok').onclick = () => { $('#v-ok').disabled = true; guardar(x.id, null, 'Comisión propia quitada.'); };
      } else if (b.dataset.co === 'cero') {
        abrirVentana(`<h2>Obra sin comisión</h2><p><b>${esc(x.titulo)}</b> se cobrará con <b>0 %</b> de comisión (publicada en nombre de OH Casas).</p>${pieVentana('Fijar 0 %', 'primario')}`, 480);
        $('[data-cerrar]').onclick = cerrarVentana; $('#v-ok').onclick = () => { $('#v-ok').disabled = true; guardar(x.id, 0, 'Comisión fijada en 0 %.'); };
      } else {
        abrirVentana(`<h2>Comisión de la obra</h2><p><b>${esc(x.titulo)}</b></p>
          <label class="campo" for="co-pct">Comisión (%)</label><input type="number" id="co-pct" min="0" max="50" step="0.01" value="${x.comision_propia !== null ? esc(x.comision_propia) : ''}" />${pieVentana('Guardar', 'primario')}`, 480);
        $('[data-cerrar]').onclick = cerrarVentana;
        $('#v-ok').onclick = () => {
          const raw = $('#co-pct').value.trim().replace(',', '.'); const pct = Number(raw);
          if (raw === '' || isNaN(pct) || pct < 0 || pct > 50) return errorVentana('Escribe una comisión entre 0 y 50.');
          $('#v-ok').disabled = true; guardar(x.id, pct, 'Comisión guardada.');
        };
      }
    };
  });
}