// Panel de 3B · sección «Contratos»: contratos de encargo y de conformidad firmados por los clientes.
// Se carga con <script src="contratos.js"></script> en index.html y usa las utilidades del propio panel
// (rpc, esc, htmlTabla, abrirVentana, fechaHora…). Solo lee: no cambia ningún dato.
const ESTADO_CONTRATO = {
  pendiente: ['Pendiente de firma', 'aviso'], firmado: ['Firmado', 'ok'],
  tacito: ['Conformidad tácita', 'neutro'], anulado: ['Anulado', 'mal']
};
const TIPO_CONTRATO = { encargo: 'Encargo y condiciones del pago', conformidad: 'Conformidad con la obra' };

async function vistaContratos(v) {
  const t = new URLSearchParams((location.hash.split('?')[1]) || '').get('t') || 'todos';
  const todos = await rpc('panel_contratos', { p_estado: null });
  const cuenta = (e) => todos.filter((x) => x.estado === e).length;
  const lista = t === 'todos' ? todos : todos.filter((x) => x.estado === t);
  const pestanas = [['todos', 'Todos', todos.length], ['pendiente', 'Pendientes', cuenta('pendiente')],
    ['firmado', 'Firmados', cuenta('firmado')], ['tacito', 'Tácitos', cuenta('tacito')], ['anulado', 'Anulados', cuenta('anulado')]];
  v.innerHTML = `<div class="cab"><div><h1>Contratos</h1>
    <p class="suave">Contratos de encargo (antes de pagar) y de conformidad (al terminar la obra o cada tramo). Abre uno para ver el texto exacto que se firmó, la huella y los datos de la firma.</p></div></div>
    <div class="herramientas">${pestanas.map(([k, n, c]) => `<a class="btn ${k === t ? 'primario' : ''}" href="#/contratos?t=${k}">${n} (${c})</a>`).join('')}</div>
    <div class="panel" id="lista-contratos"></div>`;
  $('#lista-contratos').innerHTML = htmlTabla('contratos-' + t, [
    { t: 'Contrato', f: (x) => `<b>${esc(TIPO_CONTRATO[x.tipo] || x.tipo)}</b>${x.tramo_titulo ? `<span class="sub">${esc(x.tramo_titulo)}</span>` : ''}`, s: (x) => x.tipo },
    { t: 'Obra', f: (x) => esc(x.obra_titulo || '—'), s: (x) => x.obra_titulo },
    { t: 'Cliente', f: (x) => `${esc(x.cliente_email || '—')}${x.firmante_nombre ? `<span class="sub">Firma: ${esc(x.firmante_nombre)}</span>` : ''}`, s: (x) => x.cliente_email },
    { t: 'Oficio', f: (x) => esc(x.empresa_nombre || '—'), s: (x) => x.empresa_nombre },
    { t: 'Estado', f: (x) => { const e = ESTADO_CONTRATO[x.estado] || [x.estado, 'neutro']; return `<span class="e ${e[1]}">${esc(e[0])}</span>${x.nota ? `<span class="sub" style="white-space:normal">${esc(x.nota)}</span>` : ''}`; }, s: (x) => x.estado },
    { t: 'Firmado', f: (x) => fechaHora(x.firmado_at), s: (x) => x.firmado_at },
    { t: 'Creado', f: (x) => fechaHora(x.created_at), s: (x) => x.created_at },
    { t: '', cls: 'acc', f: (x) => `<button class="btn peq" data-contrato="${esc(x.id)}">Ver</button>` }
  ], lista, t === 'todos' ? 'Todavía no hay contratos.' : 'No hay contratos en este estado.');
  $('#lista-contratos').onclick = (e) => {
    const b = e.target.closest('[data-contrato]'); if (!b) return;
    abrirContrato(b.dataset.contrato);
  };
}

async function abrirContrato(id) {
  let c;
  try { c = await rpc('panel_contrato_detalle', { p_id: id }); } catch (err) { aviso(mensajeError(err), true); return; }
  const e = ESTADO_CONTRATO[c.estado] || [c.estado, 'neutro'];
  abrirVentana(`<h2>${esc(c.titulo)}</h2>
    <p class="suave"><span class="e ${e[1]}">${esc(e[0])}</span> · Versión de la plantilla: ${esc(c.plantilla_version)}</p>
    <table class="ficha" style="width:100%;margin:10px 0">
      <tr><td>Obra</td><td>${esc(c.obra_titulo || '—')}${c.obra_referencia ? ' (' + esc(c.obra_referencia) + ')' : ''}${c.tramo_titulo ? ' · ' + esc(c.tramo_titulo) : ''}</td></tr>
      <tr><td>Cliente</td><td>${esc(c.cliente_email || '—')}</td></tr>
      <tr><td>Oficio</td><td>${esc(c.empresa_nombre || '—')}${c.empresa_cif ? ' (' + esc(c.empresa_cif) + ')' : ''}</td></tr>
      <tr><td>Firmante</td><td>${esc(c.firmante_nombre || '—')}</td></tr>
      <tr><td>Firmado</td><td>${fechaHora(c.firmado_at)}</td></tr>
      <tr><td>IP</td><td>${esc(c.firmado_ip || '—')}</td></tr>
      <tr><td>Dispositivo</td><td style="word-break:break-all">${esc(c.firmado_agente || '—')}</td></tr>
      <tr><td>Huella SHA-256</td><td style="word-break:break-all;font-family:monospace;font-size:12px">${esc(c.hash)}</td></tr>
      ${c.nota ? `<tr><td>Nota</td><td>${esc(c.nota)}</td></tr>` : ''}
    </table>
    <div style="max-height:42vh;overflow:auto;border:1px solid var(--borde,#d7e0eb);border-radius:10px;padding:12px;background:#fff"><pre style="white-space:pre-wrap;font-family:inherit;margin:0;font-size:13px;line-height:1.5">${esc(c.cuerpo)}</pre></div>
    <div class="pie-modal"><button class="btn" data-cerrar>Cerrar</button><button class="btn primario" id="c-imprimir">Imprimir / guardar PDF</button></div>`, 760);
  $('[data-cerrar]').onclick = cerrarVentana;
  $('#c-imprimir').onclick = () => imprimirContrato(c);
}

// Abre el contrato en otra pestaña con formato de documento; desde ahí se imprime o se guarda como PDF.
function imprimirContrato(c) {
  const firma = c.estado === 'tacito'
    ? 'Conformidad tácita: el cliente no respondió en el plazo y la obra se dio por conforme.'
    : `Firmado electrónicamente por ${esc(c.firmante_nombre || '—')} el ${esc(fechaHora(c.firmado_at))}.`;
  const w = window.open('', '_blank');
  if (!w) { aviso('El navegador ha bloqueado la ventana. Permite las ventanas emergentes para este sitio.', true); return; }
  w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(c.titulo)}</title><style>
    @page { margin: 22mm 18mm; } body { font-family: "Times New Roman", Times, serif; font-size: 12pt; line-height: 1.45; color: #111; max-width: 760px; margin: 24px auto; padding: 0 16px; }
    h1 { font-size: 15pt; text-align: center; margin: 0 0 4px; } .sub { text-align: center; color: #555; font-size: 10pt; margin-bottom: 18px; }
    pre { white-space: pre-wrap; font-family: inherit; margin: 0; text-align: justify; }
    .firma { margin-top: 26px; padding-top: 10px; border-top: 1px solid #999; font-size: 10.5pt; }
    .hash { font-family: monospace; font-size: 8.5pt; color: #555; word-break: break-all; margin-top: 6px; }
    .pie { margin-top: 18px; font-size: 8.5pt; color: #666; text-align: center; }
  </style></head><body>
    <h1>${esc(c.titulo)}</h1><div class="sub">${c.tramo_titulo ? esc(c.tramo_titulo) + ' · ' : ''}3B Conecta</div>
    <pre>${esc(c.cuerpo)}</pre>
    <div class="firma">${firma}<div class="hash">Huella SHA-256 del texto: ${esc(c.hash)}</div></div>
    <div class="pie">3B GROUP ARQUITECTURA, S.L.U. · NIF B02601367 · C/ Cervantes 39, 02250 Albacete · contacto3b@3bconecta.com</div>
  </body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => { try { w.print(); } catch (e) { /* el usuario puede imprimir a mano */ } }, 300);
}