// Panel de 3B · sección «Paquetes» (particulares): interruptor general, tabla de paquetes y ventana de edición.
// Se carga con <script src="paquetes.js"></script> y usa las utilidades del panel (rpc, esc, abrirVentana, cerrarVentana,
// pieVentana, errorVentana, aviso, $). Usa panel_paquetes, panel_guardar_paquete y panel_paquetes_interruptor (migración 0082).
// El interruptor está APAGADO hasta que alguien lo encienda aquí: mientras tanto la app no muestra paquetes ni cobra extra.
const PQ_EUR = (c) => (Number(c) / 100).toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' €';
const PQ_PCT = (p) => String(Number(p)).replace('.', ',') + ' %';
function pqExtra(oferta, p) {
  if (!p || Number(p.extra_pct) <= 0) return 0;
  const x = Math.round(oferta * 100 * Number(p.extra_pct) / 100);
  return Math.min(Math.max(x, Number(p.extra_min_cents)), Number(p.extra_max_cents));
}

async function vistaPaquetes(v) {
  const d = await rpc('panel_paquetes');
  const lista = d.paquetes || [];
  const obras = d.obras_por_paquete || {};
  const activos = d.activos === true;

  v.innerHTML = `<div class="cab"><div><h1>Paquetes para particulares</h1>
    <p class="suave">Básico, Medio y Premium. El particular elige uno al publicar y paga la oferta más el extra del paquete; el oficio sigue cobrando su oferta menos la comisión de siempre.
    Si el pago se devuelve, se devuelve también el extra. Los cambios solo afectan a pagos que aún no se han iniciado.</p></div></div>
    <div class="panel" style="margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;justify-content:space-between">
        <div><b>Paquetes en la app: ${activos ? '<span style="color:#197A55">ACTIVADOS</span>' : '<span style="color:#9A6100">APAGADOS</span>'}</b>
        <div class="suave">${activos ? 'Los particulares ven las tarjetas y se cobra el extra.' : 'Los particulares no ven las tarjetas y no se cobra ningún extra.'}</div></div>
        <button class="btn ${activos ? '' : 'primario'}" id="pq-interruptor">${activos ? 'Apagar paquetes' : 'Activar paquetes'}</button>
      </div>
    </div>
    <div class="panel">${lista.length ? `<table class="tabla"><thead><tr><th>Paquete</th><th>Extra</th><th>Mínimo</th><th>Máximo</th><th>Revisión</th><th>Obras</th><th>Estado</th><th></th></tr></thead><tbody>
      ${lista.map((p) => `<tr><td><b>${esc(p.nombre)}</b>${p.recomendado ? ' <span class="suave">(recomendado)</span>' : ''}<div class="suave">${esc(p.descripcion || '')}</div></td>
        <td>${Number(p.extra_pct) > 0 ? esc(PQ_PCT(p.extra_pct)) : 'Sin extra'}</td>
        <td>${Number(p.extra_pct) > 0 ? esc(PQ_EUR(p.extra_min_cents)) : '—'}</td>
        <td>${Number(p.extra_pct) > 0 ? esc(PQ_EUR(p.extra_max_cents)) : '—'}</td>
        <td>${p.plazo_revision_horas ? esc(p.plazo_revision_horas) + ' h' : '—'}</td>
        <td>${esc(obras[p.codigo] || 0)}</td>
        <td>${p.activo ? 'Disponible' : 'Oculto'}</td>
        <td class="acc"><button class="btn peq" data-pq="${esc(p.codigo)}">Editar</button></td></tr>`).join('')}
      </tbody></table>` : '<div class="vacio">No hay paquetes definidos. Aplica la migración 0082.</div>'}</div>
    ${obras.ninguno ? `<p class="suave">${esc(obras.ninguno)} obras de particulares sin paquete elegido.</p>` : ''}`;

  $('#pq-interruptor').onclick = () => {
    const nuevo = !activos;
    abrirVentana(`<h2>${nuevo ? 'Activar paquetes' : 'Apagar paquetes'}</h2>
      <p>${nuevo
        ? 'Los particulares verán las tarjetas al publicar y se les cobrará el extra del paquete que elijan. Comprueba antes los porcentajes y que los pagos funcionan.'
        : 'Los particulares dejarán de ver las tarjetas y no se cobrará extra en pagos nuevos. Los pagos ya iniciados no cambian.'}</p>${pieVentana(nuevo ? 'Activar' : 'Apagar', 'primario')}`, 520);
    $('[data-cerrar]').onclick = cerrarVentana;
    $('#v-ok').onclick = async () => {
      $('#v-ok').disabled = true;
      try { await rpc('panel_paquetes_interruptor', { p_activos: nuevo }); cerrarVentana(); aviso(nuevo ? 'Paquetes activados.' : 'Paquetes apagados.'); await vistaPaquetes(v); }
      catch (err) { const b = $('#v-ok'); if (b) b.disabled = false; errorVentana(err); }
    };
  };

  v.querySelectorAll('[data-pq]').forEach((b) => {
    b.onclick = () => {
      const p = lista.find((x) => x.codigo === b.dataset.pq); if (!p) return;
      const servicios = (Array.isArray(p.servicios) ? p.servicios : []).join('\n');
      abrirVentana(`<h2>Editar paquete ${esc(p.nombre)}</h2>
        <label class="campo" for="pq-nombre">Nombre</label><input type="text" id="pq-nombre" maxlength="40" value="${esc(p.nombre)}" />
        <label class="campo" for="pq-desc">Descripción corta</label><input type="text" id="pq-desc" maxlength="300" value="${esc(p.descripcion || '')}" />
        <label class="campo" for="pq-pct">Extra (% de la oferta, 0–30)</label><input type="number" id="pq-pct" min="0" max="30" step="0.01" value="${esc(p.extra_pct)}" />
        <label class="campo" for="pq-min">Extra mínimo (€)</label><input type="number" id="pq-min" min="0" step="1" value="${esc(Number(p.extra_min_cents) / 100)}" />
        <label class="campo" for="pq-max">Extra máximo (€)</label><input type="number" id="pq-max" min="0" step="1" value="${esc(Number(p.extra_max_cents) / 100)}" />
        <label class="campo" for="pq-horas">Plazo de revisión (horas; vacío = sin plazo)</label><input type="number" id="pq-horas" min="1" max="720" step="1" value="${p.plazo_revision_horas ? esc(p.plazo_revision_horas) : ''}" />
        <label class="campo" for="pq-serv">Qué incluye (una línea por servicio)</label><textarea id="pq-serv" rows="6">${esc(servicios)}</textarea>
        <label class="campo"><input type="checkbox" id="pq-activo" ${p.activo ? 'checked' : ''} /> Disponible para elegir</label>
        <div class="suave" id="pq-ejemplo" style="margin-top:8px"></div>${pieVentana('Guardar', 'primario')}`, 560);
      $('[data-cerrar]').onclick = cerrarVentana;
      const leer = () => ({
        extra_pct: Number($('#pq-pct').value.replace(',', '.')),
        extra_min_cents: Math.round(Number($('#pq-min').value.replace(',', '.')) * 100),
        extra_max_cents: Math.round(Number($('#pq-max').value.replace(',', '.')) * 100),
      });
      const ejemplo = () => {
        const q = leer();
        if (!(q.extra_pct > 0) || isNaN(q.extra_min_cents) || isNaN(q.extra_max_cents)) { $('#pq-ejemplo').textContent = 'Sin extra en este paquete.'; return; }
        $('#pq-ejemplo').textContent = [5000, 20000, 60000].map((o) => `Oferta ${PQ_EUR(o * 100)} → extra ${PQ_EUR(pqExtra(o, q))}`).join(' · ');
      };
      ['#pq-pct', '#pq-min', '#pq-max'].forEach((s) => { $(s).oninput = ejemplo; });
      ejemplo();
      $('#v-ok').onclick = async () => {
        const q = leer();
        const nombre = $('#pq-nombre').value.trim();
        const horasRaw = $('#pq-horas').value.trim();
        const horas = horasRaw === '' ? null : Number(horasRaw);
        if (nombre.length < 2) return errorVentana('Escribe un nombre para el paquete.');
        if (isNaN(q.extra_pct) || q.extra_pct < 0 || q.extra_pct > 30) return errorVentana('El extra debe estar entre 0 y 30 %.');
        if (isNaN(q.extra_min_cents) || isNaN(q.extra_max_cents) || q.extra_min_cents < 0 || q.extra_max_cents < q.extra_min_cents) return errorVentana('El máximo no puede ser menor que el mínimo.');
        if (horas !== null && (!Number.isInteger(horas) || horas < 1 || horas > 720)) return errorVentana('El plazo de revisión debe ser de 1 a 720 horas, o vacío.');
        const serv = $('#pq-serv').value.split('\n').map((s) => s.trim()).filter(Boolean);
        $('#v-ok').disabled = true;
        try {
          await rpc('panel_guardar_paquete', {
            p_codigo: p.codigo, p_nombre: nombre, p_descripcion: $('#pq-desc').value.trim(),
            p_extra_pct: q.extra_pct, p_extra_min_cents: q.extra_min_cents, p_extra_max_cents: q.extra_max_cents,
            p_servicios: serv, p_plazo_revision_horas: horas, p_activo: $('#pq-activo').checked,
          });
          cerrarVentana(); aviso('Paquete guardado.'); await vistaPaquetes(v);
        } catch (err) { const b = $('#v-ok'); if (b) b.disabled = false; errorVentana(err); }
      };
    };
  });
}