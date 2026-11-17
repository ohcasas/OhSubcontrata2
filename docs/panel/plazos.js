// Panel de 3B · sección «Plazos de obra»: fechas de inicio y fin pactadas y penalización por retraso.
// Se carga con <script src="plazos.js"></script> y usa las utilidades del panel (rpc, esc, abrirVentana, cerrarVentana,
// pieVentana, errorVentana, aviso, $). Usa panel_plazos_obras y panel_guardar_plazos (migración 0084).
// Cláusula: «El retraso sobre las fechas de inicio y fin pactadas conlleva una penalización del 2 % diario sobre el valor
// total del contrato». Esta pantalla solo CALCULA y MUESTRA: no cobra ni descuenta nada.
const PL_EST = { abierta: 'Abierta', adjudicada: 'Adjudicada', en_curso: 'En curso', cerrada: 'Cerrada', cancelada: 'Cancelada' };
const PL_EUR = (n) => (n === null || n === undefined) ? '—' : Number(n).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const PL_PCT = (p) => String(Number(p)).replace('.', ',') + ' %';
const plFecha = (d) => { if (!d) return '—'; const [a, m, dd] = String(d).slice(0, 10).split('-'); return `${dd}/${m}/${a}`; };
const plNorm = (t) => String(t || '').trim().toLowerCase();

async function vistaPlazos(v) {
  const params = new URLSearchParams((location.hash.split('?')[1]) || '');
  const f = params.get('f') || 'todas';
  const q = plNorm(params.get('q'));
  const todas = await rpc('panel_plazos_obras');
  let lista = todas;
  if (f === 'retraso') lista = lista.filter((x) => Number(x.dias_retraso) > 0);
  if (f === 'sin') lista = lista.filter((x) => !x.fecha_fin);
  if (q) lista = lista.filter((x) => plNorm(x.titulo).includes(q) || plNorm(x.referencia).includes(q));
  const tabs = [['todas', 'Todas'], ['retraso', 'Con retraso'], ['sin', 'Sin fecha de fin']];
  const conRetraso = todas.filter((x) => Number(x.dias_retraso) > 0).length;

  v.innerHTML = `<div class="cab"><div><h1>Plazos de obra</h1>
    <p class="suave">Fecha de inicio y de fin pactadas de cada obra. El retraso sobre esas fechas conlleva una penalización del <b>2 % diario sobre el valor total del contrato</b> (el porcentaje se puede ajustar por obra).</p></div></div>
    <div class="panel" style="margin-bottom:16px;border-left:4px solid #D99A1E"><div style="padding:14px 18px">
      <b>Solo cálculo.</b> Aquí se calcula y se muestra el importe estimado. No se cobra, no se descuenta ni se retiene nada automáticamente: cualquier penalización la decide una persona.
      <div class="suave">Con un 2 % diario, 50 días de retraso equivalen al 100 % del contrato. Conviene validar con asesoría legal la cláusula y si lleva un tope máximo antes de aplicarla a un pago.</div></div></div>
    <div id="pl-avisos"></div>
    <div class="herramientas">
      ${tabs.map(([k, n]) => `<a class="btn ${k === f ? 'primario' : ''}" href="#/plazos?f=${k}${q ? '&q=' + encodeURIComponent(q) : ''}">${n}${k === 'retraso' && conRetraso ? ' (' + conRetraso + ')' : ''}</a>`).join('')}
      <input type="search" id="pl-buscar" placeholder="Buscar por título o referencia" value="${esc(params.get('q') || '')}">
    </div>
    <div class="panel">${lista.length ? `<div class="tabla-caja"><table class="t"><thead><tr><th>Obra</th><th>Estado</th><th>Inicio pactado</th><th>Fin pactado</th><th>Retraso</th><th>Valor del contrato</th><th>Penalización estimada</th><th></th></tr></thead><tbody>
      ${lista.map((x) => {
        const r = Number(x.dias_retraso) || 0;
        return `<tr><td><b>${esc(x.titulo)}</b><div class="suave">${esc(x.referencia)}</div></td>
        <td>${esc(PL_EST[x.estado] || x.estado)}</td>
        <td>${esc(plFecha(x.fecha_inicio))}${Number(x.dias_retraso_inicio) > 0 ? `<div class="suave mal-t">Empezó con ${esc(x.dias_retraso_inicio)} d de retraso</div>` : ''}</td>
        <td>${esc(plFecha(x.fecha_fin))}${x.fecha_fin_real ? `<div class="suave">Terminó el ${esc(plFecha(x.fecha_fin_real))}</div>` : ''}</td>
        <td>${x.fecha_fin ? (r > 0 ? `<b class="mal-t">${r} día${r === 1 ? '' : 's'}</b>` : 'En plazo') : '—'}</td>
        <td>${esc(PL_EUR(x.valor_contrato))}<div class="suave">${esc(x.valor_origen)}</div></td>
        <td>${r > 0 ? `<b>${esc(PL_EUR(x.penalizacion_estimada))}</b><div class="suave">${esc(PL_PCT(x.penalizacion_pct_total))} del contrato</div>` : '—'}</td>
        <td class="acc"><button class="btn peq" data-pl="${esc(x.id)}">Fechas</button></td></tr>`;
      }).join('')}
      </tbody></table></div>` : '<div class="vacio">No hay obras con ese filtro.</div>'}</div>
    ${todas.length >= 500 ? '<p class="suave">Se muestran las 500 obras más recientes.</p>' : ''}`;

  const buscar = $('#pl-buscar');
  buscar.onkeydown = (e) => { if (e.key === 'Enter') location.hash = `#/plazos?f=${f}&q=${encodeURIComponent(buscar.value.trim())}`; };
  plAvisos();

  v.querySelectorAll('[data-pl]').forEach((b) => {
    b.onclick = () => {
      const x = todas.find((o) => o.id === b.dataset.pl); if (!x) return;
      abrirVentana(`<h2>Fechas de «${esc(x.titulo)}»</h2>
        <p class="suave">Las fechas pactadas son las del contrato. Las reales se rellenan cuando la obra empieza y termina, y sirven para contar el retraso.</p>
        <div class="form-rejilla">
          <div><label class="campo" for="pl-ini">Inicio pactado</label><input type="date" id="pl-ini" value="${esc(x.fecha_inicio ? String(x.fecha_inicio).slice(0, 10) : '')}" /></div>
          <div><label class="campo" for="pl-fin">Fin pactado</label><input type="date" id="pl-fin" value="${esc(x.fecha_fin ? String(x.fecha_fin).slice(0, 10) : '')}" /></div>
          <div><label class="campo" for="pl-ini-r">Inicio real (opcional)</label><input type="date" id="pl-ini-r" value="${esc(x.fecha_inicio_real ? String(x.fecha_inicio_real).slice(0, 10) : '')}" /></div>
          <div><label class="campo" for="pl-fin-r">Fin real (opcional)</label><input type="date" id="pl-fin-r" value="${esc(x.fecha_fin_real ? String(x.fecha_fin_real).slice(0, 10) : '')}" /></div>
          <div style="grid-column:1/-1"><label class="campo" for="pl-pct">Penalización por cada día de retraso (% del valor del contrato)</label>
            <input type="number" id="pl-pct" min="0" max="100" step="0.01" value="${esc(x.penalizacion_diaria_pct)}" />
            <span class="suave peq">Por defecto 2 %. Valor del contrato: ${esc(PL_EUR(x.valor_contrato))} (${esc(x.valor_origen)}).</span></div>
        </div><div class="suave" id="pl-ejemplo" style="margin-top:8px"></div>${pieVentana('Guardar fechas', 'primario')}`, 560);
      $('[data-cerrar]').onclick = cerrarVentana;
      const ejemplo = () => {
        const pct = Number($('#pl-pct').value.replace(',', '.'));
        $('#pl-ejemplo').textContent = isNaN(pct) ? '' : `Cada día de retraso: ${PL_EUR(Number(x.valor_contrato) * pct / 100)} · 10 días: ${PL_EUR(Number(x.valor_contrato) * pct / 100 * 10)}`;
      };
      $('#pl-pct').oninput = ejemplo; ejemplo();
      $('#v-ok').onclick = async () => {
        const val = (s) => $(s).value || null;
        const pct = Number($('#pl-pct').value.replace(',', '.'));
        if (isNaN(pct) || pct < 0 || pct > 100) return errorVentana('La penalización diaria debe estar entre 0 y 100 %.');
        if (val('#pl-ini') && val('#pl-fin') && val('#pl-fin') < val('#pl-ini')) return errorVentana('El fin pactado no puede ser anterior al inicio.');
        if (val('#pl-ini-r') && val('#pl-fin-r') && val('#pl-fin-r') < val('#pl-ini-r')) return errorVentana('El fin real no puede ser anterior al inicio real.');
        $('#v-ok').disabled = true;
        try {
          await rpc('panel_guardar_plazos', { p_obra_id: x.id, p_inicio: val('#pl-ini'), p_fin: val('#pl-fin'), p_inicio_real: val('#pl-ini-r'), p_fin_real: val('#pl-fin-r'), p_pct: pct });
          cerrarVentana(); aviso('Fechas guardadas.'); await vistaPlazos(v);
        } catch (err) { const bt = $('#v-ok'); if (bt) bt.disabled = false; errorVentana(err); }
      };
    };
  });
}


// ---- Avisos automaticos de plazos (migracion 0085). Si aun no esta aplicada, la tarjeta no aparece. ----
async function plAvisos() {
  const caja = document.getElementById('pl-avisos');
  if (!caja) return;
  let a;
  try { a = await rpc('panel_avisos_plazos_estado'); } catch (e) { return; }
  if (!a) return;
  const pend = a.pendientes || [];
  const fuera = pend.filter((p) => p.destino !== 'admin');
  caja.innerHTML = `<div class="panel" style="margin-bottom:16px;border-left:4px solid ${a.activos ? '#16A34A' : '#94A3B8'}"><div style="padding:14px 18px">
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <b style="font-size:15px">Avisos automáticos de plazos: ${a.activos ? 'ACTIVADOS' : 'APAGADOS'}</b>
      <button class="btn peq ${a.activos ? '' : 'primario'}" id="pl-av-sw">${a.activos ? 'Apagar' : 'Activar'}</button>
      <button class="btn peq" id="pl-av-ver">Ver qué saldría hoy (${pend.length})</button>
    </div>
    <div class="suave" style="margin-top:6px">Avisa a la empresa adjudicada y a quien publicó la obra ${esc((a.dias_antes || []).join(', '))} días antes del fin, el día del fin y cada día de retraso. A administración le llega por la campana. Al activarlo, las empresas reciben <b>notificación y aviso en el móvil</b>. No se envían correos ni se cobra nada. Para que corra solo cada día hay que programarlo una vez (ver instrucciones del archivo 0085).</div>
    <div id="pl-av-lista" style="display:none;margin-top:12px"></div></div></div>`;
  document.getElementById('pl-av-ver').onclick = () => {
    const l = document.getElementById('pl-av-lista');
    l.style.display = l.style.display === 'none' ? 'block' : 'none';
    l.innerHTML = pend.length ? `<div class="tabla-caja"><table class="t"><thead><tr><th>Para</th><th>Obra</th><th>Aviso</th></tr></thead><tbody>${pend.map((p) =>
      `<tr><td>${esc(p.destino === 'admin' ? 'Administración (campana)' : p.destino_nombre)}</td><td>${esc(p.obra)}</td><td><b>${esc(p.titulo)}</b><div class="suave">${esc(p.cuerpo)}</div></td></tr>`).join('')}</tbody></table></div>`
      : '<span class="suave">Hoy no toca avisar nada.</span>';
  };
  document.getElementById('pl-av-sw').onclick = async () => {
    const quiere = !a.activos;
    if (quiere && !confirm(`Al activar, ${fuera.length} aviso(s) de hoy llegarán a las empresas (con notificación en el móvil). ¿Activar?`)) return;
    try { await rpc('panel_avisos_plazos_ajustar', { p_activos: quiere }); aviso(quiere ? 'Avisos activados' : 'Avisos apagados'); plAvisos(); }
    catch (e) { aviso('No se pudo cambiar: ' + (e.message || e)); }
  };
}