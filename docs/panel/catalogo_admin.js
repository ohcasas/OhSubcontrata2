// Catalogo de particulares: alta manual de partidas y precios. Requiere las migraciones 0094, 0101, 0102 y 0104.
// Cada partida tiene precio por acabado (basico, medio, alto) y por modalidad (con materiales / sin materiales).
// Nada se ve en la app hasta que se marca «Publicada». El interruptor general del catalogo NO se cambia desde aqui.
const CAT_ACAB = [['basico', 'Básico'], ['medio', 'Medio'], ['alto', 'Alto']];
const CAT_MOD = [['mano_obra_materiales', 'Con materiales'], ['solo_mano_obra', 'Sin materiales']];
const CAT_ICONOS = ['albanileria', 'pintura', 'electricidad', 'fontaneria', 'carpinteria', 'climatizacion', 'pladur', 'bano', 'suelos', 'ventanas', 'cocina', 'casa', 'fachada'];
const CAT_ICONO_CAT = { reforma_integral: 'casa', bano: 'bano', cocina: 'cocina', suelos: 'suelos', pintura: 'pintura', electricidad: 'electricidad', fontaneria: 'fontaneria', carpinteria: 'carpinteria', ventanas: 'ventanas', fachada: 'fachada' };

const catNum = (t) => { t = String(t == null ? '' : t).trim().replace(/\s/g, '').replace('€', ''); if (t === '') return null; const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t); return Number.isFinite(n) ? n : NaN; };
const catTxt = (n) => (n == null || n === '' ? '' : Number(n).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false }));
const catIconoDe = (p) => (p && p.icono) || CAT_ICONO_CAT[p && p.categoria] || 'casa';
const catIc = (k, px) => `<svg width="${px || 34}" height="${px || 34}" viewBox="0 0 64 64" style="overflow:visible;flex:none"><use href="#ci-${esc(k)}"/></svg>`;

function catSprite() {
  if (document.getElementById('cat-sprite')) return;
  const g = (id, a, b) => `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;
  const s = (id, inner) => `<symbol id="ci-${id}" viewBox="0 0 64 64"><g filter="url(#cg-sh)">${inner}</g></symbol>`;
  const d = document.createElement('div');
  d.id = 'cat-sprite'; d.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
  d.innerHTML = `<svg width="0" height="0"><defs>${g('cg-r', '#FF8A5B', '#D9482B')}${g('cg-b', '#6FA0FF', '#1951FC')}${g('cg-y', '#FFE066', '#F5A300')}${g('cg-w', '#E0A867', '#B9772F')}${g('cg-g', '#E9EEF5', '#AEBBCB')}${g('cg-t', '#7FE3D0', '#1FA58E')}
    <filter id="cg-sh" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="3" stdDeviation="2.5" flood-color="#0B1F35" flood-opacity=".22"/></filter>
    ${s('albanileria', '<rect x="6" y="14" width="26" height="13" rx="3" fill="url(#cg-r)"/><rect x="34" y="14" width="24" height="13" rx="3" fill="url(#cg-r)"/><rect x="2" y="30" width="20" height="13" rx="3" fill="url(#cg-r)"/><rect x="24" y="30" width="26" height="13" rx="3" fill="url(#cg-r)"/><rect x="12" y="46" width="26" height="12" rx="3" fill="url(#cg-r)"/><rect x="40" y="46" width="14" height="12" rx="3" fill="url(#cg-r)"/>')}
    ${s('pintura', '<rect x="8" y="8" width="42" height="18" rx="5" fill="url(#cg-b)"/><path d="M50 17h6v14H30v8" fill="none" stroke="#33415C" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/><rect x="25" y="38" width="10" height="20" rx="4" fill="url(#cg-y)"/>')}
    ${s('electricidad', '<circle cx="32" cy="32" r="26" fill="#FFF3C4"/><path d="M36 6L17 36h13l-3 22 20-31H33l3-21z" fill="url(#cg-y)"/>')}
    ${s('fontaneria', '<path d="M10 22a8 8 0 0 1 8-8h14a10 10 0 0 1 10 10v4h-8v-4a2 2 0 0 0-2-2H18v6h-8z" fill="url(#cg-g)"/><rect x="36" y="28" width="12" height="9" rx="2" fill="url(#cg-g)"/><rect x="14" y="8" width="14" height="7" rx="3" fill="url(#cg-r)"/><path d="M42 44c3 4 5 6 5 9a5 5 0 0 1-10 0c0-3 2-5 5-9z" fill="url(#cg-b)"/>')}
    ${s('carpinteria', '<rect x="14" y="4" width="36" height="56" rx="4" fill="url(#cg-w)"/><rect x="20" y="10" width="24" height="18" rx="2" fill="#fff" opacity=".22"/><rect x="20" y="33" width="24" height="21" rx="2" fill="#fff" opacity=".22"/><circle cx="43" cy="34" r="3" fill="#FFE066"/>')}
    ${s('climatizacion', '<rect x="4" y="14" width="56" height="26" rx="8" fill="url(#cg-g)"/><rect x="10" y="30" width="44" height="4" rx="2" fill="url(#cg-b)"/><path d="M20 46c-3 4 3 5 0 9M32 46c-3 4 3 5 0 9M44 46c-3 4 3 5 0 9" fill="none" stroke="#6FA0FF" stroke-width="3" stroke-linecap="round"/><circle cx="48" cy="22" r="3" fill="#1951FC"/>')}
    ${s('pladur', '<rect x="12" y="4" width="40" height="56" rx="5" fill="url(#cg-g)"/><circle cx="22" cy="14" r="2" fill="#7B8AA0"/><circle cx="42" cy="14" r="2" fill="#7B8AA0"/><circle cx="22" cy="32" r="2" fill="#7B8AA0"/><circle cx="42" cy="32" r="2" fill="#7B8AA0"/><circle cx="22" cy="50" r="2" fill="#7B8AA0"/><circle cx="42" cy="50" r="2" fill="#7B8AA0"/>')}
    ${s('bano', '<path d="M6 30h52v6a14 14 0 0 1-14 14H20A14 14 0 0 1 6 36v-6z" fill="url(#cg-g)"/><path d="M12 30V16a6 6 0 0 1 12 0" fill="none" stroke="#7B8AA0" stroke-width="4" stroke-linecap="round"/><rect x="14" y="52" width="6" height="6" rx="2" fill="#7B8AA0"/><rect x="44" y="52" width="6" height="6" rx="2" fill="#7B8AA0"/><circle cx="46" cy="18" r="4" fill="url(#cg-b)"/>')}
    ${s('suelos', '<path d="M32 6l26 13-26 13L6 19z" fill="url(#cg-t)"/><path d="M6 25l26 13 26-13v8L32 46 6 33z" fill="#1FA58E"/><path d="M6 39l26 13 26-13v7L32 59 6 46z" fill="#168673"/>')}
    ${s('ventanas', '<rect x="6" y="6" width="52" height="52" rx="6" fill="#fff" stroke="#9FB3C8" stroke-width="4"/><rect x="12" y="12" width="18" height="18" rx="2" fill="url(#cg-b)" opacity=".85"/><rect x="34" y="12" width="18" height="18" rx="2" fill="url(#cg-b)" opacity=".85"/><rect x="12" y="34" width="18" height="18" rx="2" fill="url(#cg-b)" opacity=".85"/><rect x="34" y="34" width="18" height="18" rx="2" fill="url(#cg-b)" opacity=".85"/>')}
    ${s('cocina', '<path d="M8 26h40v10a14 14 0 0 1-14 14H22A14 14 0 0 1 8 36z" fill="url(#cg-g)"/><rect x="48" y="28" width="10" height="5" rx="2.5" fill="#7B8AA0"/><rect x="18" y="18" width="20" height="6" rx="3" fill="url(#cg-r)"/><path d="M20 8c-2 3 2 4 0 7M30 8c-2 3 2 4 0 7" fill="none" stroke="#9FB3C8" stroke-width="3" stroke-linecap="round"/>')}
    ${s('casa', '<path d="M32 6L4 30h8v26h40V30h8z" fill="url(#cg-b)"/><rect x="26" y="36" width="12" height="20" rx="2" fill="#fff" opacity=".85"/>')}
    ${s('fachada', '<rect x="12" y="6" width="40" height="52" rx="4" fill="url(#cg-g)"/><rect x="18" y="14" width="10" height="9" rx="1.5" fill="url(#cg-b)"/><rect x="36" y="14" width="10" height="9" rx="1.5" fill="url(#cg-b)"/><rect x="18" y="30" width="10" height="9" rx="1.5" fill="url(#cg-b)"/><rect x="36" y="30" width="10" height="9" rx="1.5" fill="url(#cg-b)"/><rect x="27" y="46" width="10" height="12" rx="2" fill="url(#cg-w)"/>')}
  </defs></svg>`;
  document.body.appendChild(d);
  const st = document.createElement('style'); st.id = 'cat-css';
  st.textContent = `
  .cat-kpis a{cursor:pointer;display:block}.cat-kpis a.on{border-color:var(--azul)!important;box-shadow:0 0 0 3px rgba(11,95,217,.18)}
  .cat-kpis small{display:block;margin-top:2px;font-size:11.5px;color:var(--suave)}
  .cat-wrap{display:grid;grid-template-columns:310px minmax(0,1fr) 310px;gap:14px;align-items:start}
  @media (max-width:1280px){.cat-wrap{grid-template-columns:290px minmax(0,1fr)}.cat-prev{display:none}}
  @media (max-width:860px){.cat-wrap{grid-template-columns:1fr}}
  .cat-chips{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}.cat-chip{font-size:12.5px;font-weight:500;padding:4px 11px;border-radius:99px;background:rgba(11,31,53,.07);border:0;cursor:pointer}.cat-chip.on{background:var(--azul);color:#fff}
  .cat-it{display:flex;gap:8px;align-items:center;padding:7px 8px;border-radius:12px;border:1px solid transparent;cursor:pointer;width:100%;background:none;text-align:left}.cat-it:hover{background:rgba(255,255,255,.7)}.cat-it.on{background:#fff;border-color:var(--azul);box-shadow:0 4px 14px rgba(11,95,217,.15)}
  .cat-it.arr{opacity:.4}.cat-it.sobre{box-shadow:0 -3px 0 var(--azul)}
  .cat-it .nm{flex:1;min-width:0}.cat-it .nm b{font-weight:600;font-size:13px;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.cat-it .nm small{color:var(--suave);font-size:11.5px}
  .cat-asa{cursor:grab;color:#9aa7b6;font-size:14px;line-height:1;user-select:none}
  .cat-pt{display:inline-flex;gap:2px;margin-top:3px}.cat-pt i{width:7px;height:7px;border-radius:2px;background:rgba(11,31,53,.15)}.cat-pt i.v{background:var(--ok)}.cat-pt i.b{background:#D99A1E}
  .cat-sw{width:34px;height:20px;border-radius:10px;background:rgba(11,31,53,.2);position:relative;border:0;cursor:pointer;flex:none;transition:background .15s}.cat-sw:after{content:"";position:absolute;left:3px;top:3px;width:14px;height:14px;border-radius:7px;background:#fff;transition:left .15s}.cat-sw.on{background:var(--ok)}.cat-sw.on:after{left:17px}
  .cat-bulk{position:sticky;bottom:8px;margin-top:10px;background:#0B1F35;color:#fff;border-radius:14px;padding:8px 10px;display:flex;gap:6px;align-items:center;flex-wrap:wrap;box-shadow:0 8px 22px rgba(11,31,53,.35)}
  .cat-bulk .btn{padding:3px 10px;font-size:12.5px}.cat-bulk select{width:auto;padding:3px 6px}
  .cat-f{display:grid;grid-template-columns:2fr 1fr 1fr;gap:10px;margin-bottom:8px}.cat-f label{display:block;font-size:12px;color:var(--suave)}.cat-f input,.cat-f select{width:100%;margin-top:3px}
  .cat-icos{display:flex;gap:6px;flex-wrap:wrap;margin-top:4px}.cat-ico{width:46px;height:46px;border-radius:12px;border:2px solid transparent;background:rgba(255,255,255,.7);display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0;transition:transform .12s}.cat-ico:hover{transform:translateY(-2px)}.cat-ico.on{border-color:var(--azul);background:#fff}
  .cat-g{width:100%;border-collapse:separate;border-spacing:4px}.cat-g th{font-size:12px;color:var(--suave);font-weight:600;padding:2px}.cat-g td.l{font-weight:600;font-size:13px;padding-right:8px;white-space:nowrap}
  .cat-cel input.r{width:100%;text-align:center;font-weight:600;padding:7px 4px;box-sizing:border-box}.cat-cel.falta input.r{background:#FFF8E6!important}.cat-cel.bor input.r{background:#FFF3D6!important;border-color:#E6B74F!important}
  .cat-cel .mm{display:flex;gap:3px;margin-top:3px}.cat-cel .mm input{width:50%;font-size:11.5px;text-align:center;padding:3px 2px;box-sizing:border-box;color:var(--suave)}
  .cat-tools{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:10px;font-size:13px}.cat-tools input{width:56px;text-align:center;padding:4px}
  .cat-av{margin-top:8px;font-size:12.5px;border-radius:10px;padding:8px 10px;background:#FFF4D8;color:var(--aviso)}.cat-av:empty{display:none}.cat-av.mal{background:#FDF1F0;color:var(--mal)}
  .cat-sucio{color:var(--aviso);font-weight:600;font-size:12.5px}
  .cat-gt{width:100%;border-collapse:collapse}.cat-gt th{font-size:12px;color:var(--suave);padding:6px 6px;text-align:center;white-space:nowrap}.cat-gt td{padding:3px 4px;border-top:1px solid var(--linea2)}.cat-gt td.cat-nom{min-width:230px;font-weight:600}.cat-gt input{width:74px;text-align:right;padding:5px 6px}
  .cat-gt input.ch{background:#E4EDFF!important;border-color:var(--azul)!important}.cat-gt input.bor{background:#FFF3D6!important}.cat-gt tr.err td{background:#FDF1F0}.cat-gt .u input{width:100%}
  .cat-phone{box-sizing:border-box;width:100%;max-width:276px;margin:0 auto;border-radius:30px;border:6px solid #0B1F35;padding:12px;background:linear-gradient(180deg,#EEF4FF,#CFE0FF);min-height:470px;position:relative;overflow:hidden}
  .cat-ptabs{display:flex;gap:4px;justify-content:center;margin-bottom:8px}.cat-ptabs button{border:0;background:rgba(11,31,53,.07);padding:3px 10px;border-radius:99px;font-size:12px;cursor:pointer}.cat-ptabs button.on{background:var(--azul);color:#fff}
  .cat-hero{height:112px;border-radius:20px;background:linear-gradient(135deg,#9DB6FF,#5C7DDC);display:flex;align-items:center;justify-content:center;margin-bottom:8px}
  .cat-pvn{font-size:16px;font-weight:700;line-height:1.15;margin:2px 0}.cat-pvk{font-size:11px;color:var(--azul);font-weight:600}
  .cat-pch{display:flex;gap:6px;margin-top:9px;flex-wrap:wrap}.cat-pch button{border:0;padding:6px 12px;border-radius:99px;font-size:12px;font-weight:600;background:#fff;cursor:pointer}.cat-pch button.on,.cat-pseg button.on{background:linear-gradient(180deg,#4A7BFF,#0B2CB1);color:#fff}
  .cat-pseg{display:flex;gap:4px;background:rgba(255,255,255,.8);border-radius:16px;padding:4px;margin-top:9px}.cat-pseg button{flex:1;border:0;background:none;padding:7px 2px;border-radius:12px;font-size:12px;font-weight:600;color:#52657A;cursor:pointer}.cat-pseg small{display:block;font-weight:500;font-size:11px}
  .cat-pq{display:flex;align-items:center;justify-content:space-between;margin-top:9px;font-size:12px;color:#52657A}.cat-pq span{display:inline-flex;gap:10px;align-items:center;background:rgba(255,255,255,.85);border-radius:14px;padding:3px 6px}.cat-pq button{border:0;width:26px;height:26px;border-radius:13px;background:#E4EDFF;color:var(--azul);font-weight:700;cursor:pointer}
  .cat-pdk{position:absolute;left:10px;right:10px;bottom:10px;border-radius:20px;background:rgba(255,255,255,.9);padding:8px 10px;display:flex;justify-content:space-between;align-items:center;font-size:11px;color:#52657A}.cat-pdk b{display:block;font-size:14px;color:#0B1F35}
  .cat-pdk button{border:0;background:linear-gradient(180deg,#4A7BFF,#0B2CB1);color:#fff;padding:9px 14px;border-radius:16px;font-weight:700;font-size:12.5px;cursor:pointer}
  .cat-pcard{background:rgba(255,255,255,.85);border-radius:18px;padding:10px;display:flex;gap:10px;align-items:center;margin-bottom:8px}.cat-pcard .nm{flex:1;font-size:13px;font-weight:600}.cat-pcard .nm small{display:block;font-weight:500;color:#52657A;margin-top:2px}.cat-pcard button.mas{border:0;width:30px;height:30px;border-radius:15px;background:linear-gradient(180deg,#4A7BFF,#0B2CB1);color:#fff;font-size:18px;cursor:pointer}
  .cat-pl{background:rgba(255,255,255,.85);border-radius:16px;padding:9px 10px;margin-bottom:8px;font-size:12.5px}.cat-pl .seg{display:flex;gap:3px;margin-top:6px;background:rgba(11,31,53,.06);border-radius:10px;padding:2px}.cat-pl .seg button{flex:1;border:0;background:none;font-size:11.5px;padding:4px;border-radius:8px;cursor:pointer}.cat-pl .seg button.on{background:var(--azul);color:#fff}
  @keyframes cat-pop{0%{transform:scale(.9);opacity:0}100%{transform:none;opacity:1}}.cat-pop{animation:cat-pop .25s ease-out}
  .cat-toast{position:absolute;left:50%;top:10px;transform:translateX(-50%);background:#0B1F35;color:#fff;font-size:12px;padding:5px 12px;border-radius:99px;animation:cat-pop .25s ease-out}
  `;
  document.head.appendChild(st);
}

// ====================== estado y ayudas ======================
const catPrecioDe = (p, ac, mod) => {
  const l = ((p && p.precios) || []).filter((x) => x.acabado === ac && x.modalidad === mod);
  return l.find((x) => x.estado === 'borrador') || l.find((x) => x.estado === 'publicado') || null;
};
const catEsUnico = (p) => ((p && p.precios) || []).some((x) => x.acabado === 'unico');
const catCombos = (p) => (catEsUnico(p) ? CAT_MOD.map((m) => ['unico', m[0]]) : CAT_ACAB.flatMap((a) => CAT_MOD.map((m) => [a[0], m[0]])));
const catCompleta = (p) => { const c = catCombos(p); return { ok: c.filter(([a, m]) => catPrecioDe(p, a, m)).length, total: c.length }; };
const catPrecioMin = (p) => Math.min(Infinity, ...((p.precios || []).map((x) => Number(x.ref))));
const catEst = (p, e) => { const n = (p.precios || []).length; const c = catCompleta(p);
  return e === '' || (e === 'pub' && p.activa) || (e === 'bor' && !p.activa && n > 0) || (e === 'sin' && n === 0) || (e === 'inc' && p.activa && c.ok < c.total); };
const catEur = (n) => Number(n).toLocaleString('es-ES', { maximumFractionDigits: 2 }) + ' €';
const catSucio = (s) => { const C = window.__cat; C.sucio = s; const e = $('#cat-sucio'); if (e) e.classList.toggle('hidden', !s); window.onbeforeunload = s ? () => 'Hay cambios sin guardar.' : null; };
const catSalir = () => { const C = window.__cat; if (!C.sucio) return true; if (confirm('Hay cambios sin guardar. ¿Descartarlos?')) { catSucio(false); return true; } return false; };

function catVisibles() {
  const C = window.__cat; const q = C.q.trim().toLowerCase();
  let l = C.partidas.filter((p) => (!C.cat || p.categoria === C.cat) && (!q || p.nombre.toLowerCase().includes(q)) && catEst(p, C.estado));
  if (C.orden === 'nombre') l = [...l].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  else if (C.orden === 'precio') l = [...l].sort((a, b) => catPrecioMin(a) - catPrecioMin(b));
  return l;
}

// ====================== pantalla principal ======================
async function vistaCatalogoParticulares(v) {
  catSprite();
  let partidas, cats, ajustes, nuevas = 0, provNuevos = 0;
  try {
    partidas = await rpc('panel_cat_listar');
    const c = await sb.from('catalogo_categorias').select('codigo, nombre, es_formulario, orden').order('orden'); if (c.error) throw c.error;
    cats = c.data || [];
    const a = await sb.from('ajustes_catalogo').select('activo').eq('id', true).maybeSingle(); ajustes = a.data || { activo: false };
    try { nuevas = (await rpc('panel_cat_contactos')).filter((x) => x.estado === 'nuevo').length; } catch (e) { nuevas = 0; }
    try { provNuevos = (await rpc('panel_prov_mensajes')).filter((x) => x.estado === 'nuevo').length; } catch (e) { provNuevos = 0; }
  } catch (e) {
    v.innerHTML = `<div class="cab"><div><h1>Catálogo de particulares</h1></div></div><div class="panel" style="padding:14px 18px">Todavía no está activada esta sección. Comprueba que están ejecutadas las migraciones 0094, 0101 y 0102 en Supabase. <span class="suave">(${esc(mensajeError(e))})</span></div>`;
    return;
  }
  window.__cat = { partidas, cats: cats.filter((c) => !c.es_formulario), ajustes, nuevas, provNuevos, prov: [], provMsgs: [], provSel: null, provNuevo: false, provQ: '', vista: 'partidas', sel: null, nueva: false, estado: '', cat: '', q: '', orden: 'manual',
    marcadas: new Set(), sucio: false, pv: { tab: 'detalle', ac: 'basico', mod: 'mano_obra_materiales', cant: null, cesta: [] } };
  catSucio(false);
  v.innerHTML = `<div class="cab"><div><h1>Catálogo de particulares</h1>
      <p class="suave">Escribe cada partida y su precio, con y sin materiales. Nada se ve en la app hasta que la marques como <b>Publicada</b>.
      El catálogo completo está <b>${ajustes.activo ? 'encendido' : 'apagado'}</b>${ajustes.activo ? '' : ': los particulares todavía no ven nada (se enciende en Supabase, con tu autorización)'}.</p></div>
      <div class="cab-acc"><button class="btn" id="cat-pegar">Pegar desde Excel</button><button class="btn primario" id="cat-nueva">+ Nueva partida</button></div></div>
    <div class="resumen cat-kpis" id="cat-kpis"></div>
    <div class="panel" style="margin-top:14px"><div class="pestanas" id="cat-tabs"></div><div style="padding:14px" id="cat-cuerpo"></div></div>`;
  $('#cat-pegar').onclick = catVentanaPegar;
  $('#cat-nueva').onclick = () => { if (!catSalir()) return; const C = window.__cat; C.vista = 'partidas'; C.sel = null; C.nueva = true; catTodo(); };
  if (!window.__catKey) { window.__catKey = true; document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 's' || !document.getElementById('cat-cuerpo')) return;
    const b = document.getElementById('cat-guardar') || document.getElementById('cat-g-guardar') || document.getElementById('cat-p-guardar'); if (b && !b.disabled) { e.preventDefault(); b.click(); } }); }
  catTodo();
}

function catTodo() { catKpis(); catTabs(); catCuerpo(); }

function catKpis() {
  const C = window.__cat; const P = C.partidas;
  const k = [['pub', P.filter((p) => p.activa).length, 'Publicadas', 'las ve el cliente'], ['bor', P.filter((p) => catEst(p, 'bor')).length, 'En borrador', 'ocultas, con precio'],
    ['sin', P.filter((p) => catEst(p, 'sin')).length, 'Sin precio', 'faltan todos'], ['inc', P.filter((p) => catEst(p, 'inc')).length, 'Publicadas incompletas', 'les falta algún precio']];
  $('#cat-kpis').innerHTML = k.map((x) => `<a class="${C.estado === x[0] ? 'on' : ''}" data-catk="${x[0]}" role="button" tabindex="0"><b>${x[1]}</b><span>${x[2]}</span><small>${x[3]}</small></a>`).join('');
  $('#cat-kpis').onclick = (ev) => { const a = ev.target.closest('[data-catk]'); if (!a) return; if (!catSalir()) return; C.estado = C.estado === a.dataset.catk ? '' : a.dataset.catk; if (C.vista === 'consultas') C.vista = 'partidas'; catTodo(); };
}

function catTabs() {
  const C = window.__cat;
  $('#cat-tabs').innerHTML = [['partidas', 'Partidas'], ['cuadricula', 'Cuadrícula de precios'], ['proveedores', 'Proveedores' + (C.provNuevos ? ` (${C.provNuevos})` : '')], ['consultas', 'Consultas de proveedores' + (C.nuevas ? ` (${C.nuevas})` : '')]]
    .map((t) => `<button class="${C.vista === t[0] ? 'activa' : ''}" data-catv="${t[0]}">${t[1]}</button>`).join('');
  $('#cat-tabs').onclick = (ev) => { const b = ev.target.closest('[data-catv]'); if (!b || !catSalir()) return; C.vista = b.dataset.catv; catTabs(); catCuerpo(); };
}

function catCuerpo() {
  const C = window.__cat;
  if (C.vista === 'consultas') return catConsultas($('#cat-cuerpo'));
  if (C.vista === 'proveedores') return catProveedores();
  if (C.vista === 'cuadricula') return catCuadricula();
  catPartidas();
}

async function catRecargar(idSel) {
  const C = window.__cat; C.partidas = await rpc('panel_cat_listar'); if (idSel) { C.sel = idSel; C.nueva = false; }
  C.marcadas = new Set([...C.marcadas].filter((id) => C.partidas.some((p) => p.id === id))); catSucio(false); catKpis(); catCuerpo();
}

function catFiltrosHtml() {
  const C = window.__cat;
  return `<input type="search" id="cat-q" placeholder="Buscar partida" value="${esc(C.q)}" style="width:100%" />
    <div class="cat-chips"><button class="cat-chip ${C.cat ? '' : 'on'}" data-catf="">Todo</button>${C.cats.map((x) => `<button class="cat-chip ${C.cat === x.codigo ? 'on' : ''}" data-catf="${esc(x.codigo)}">${esc(x.nombre)}</button>`).join('')}</div>`;
}
function catFiltrosEnlazar(rec) {
  const C = window.__cat;
  $('#cat-q').oninput = (e) => { C.q = e.target.value; rec(); };
  document.querySelectorAll('[data-catf]').forEach((b) => { b.onclick = () => { C.cat = b.dataset.catf; document.querySelectorAll('[data-catf]').forEach((x) => x.classList.toggle('on', x === b)); rec(); }; });
}

// ====================== vista «Partidas» ======================
function catPartidas() {
  const C = window.__cat; const sel = C.partidas.find((p) => p.id === C.sel) || null;
  $('#cat-cuerpo').innerHTML = `<div class="cat-wrap">
    <div class="panel"><div style="padding:12px">${catFiltrosHtml()}
      <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px"><label class="suave peq" for="cat-ord">Orden</label><select id="cat-ord" style="width:auto;padding:3px 6px"><option value="manual" ${C.orden === 'manual' ? 'selected' : ''}>Manual (arrastrar)</option><option value="nombre" ${C.orden === 'nombre' ? 'selected' : ''}>Nombre</option><option value="precio" ${C.orden === 'precio' ? 'selected' : ''}>Precio</option></select>
        <label class="peq" style="margin-left:auto"><input type="checkbox" id="cat-todas" /> Todas</label></div>
      <div id="cat-lista"></div><div id="cat-bulk"></div></div></div>
    <div id="cat-editor"></div>
    <div class="panel cat-prev"><header><h2>Así lo verá el cliente</h2></header><div style="padding:12px"><div class="cat-ptabs" id="cat-ptabs"></div><div id="cat-prev"></div></div></div></div>`;
  const rec = () => { catLista(); catBulk(); };
  catFiltrosEnlazar(rec); rec();
  $('#cat-ord').onchange = (e) => { C.orden = e.target.value; rec(); };
  $('#cat-todas').onchange = (e) => { const l = catVisibles(); if (e.target.checked) l.forEach((p) => C.marcadas.add(p.id)); else l.forEach((p) => C.marcadas.delete(p.id)); rec(); };
  $('#cat-lista').onclick = catListaClick;
  catEditorPintar();
}

function catLista() {
  const C = window.__cat; const l = catVisibles(); const arrastrable = C.orden === 'manual';
  $('#cat-lista').innerHTML = l.length ? l.map((p) => { const c = catCombos(p);
    const dots = c.map(([a, m]) => { const x = catPrecioDe(p, a, m); return `<i class="${x ? (x.estado === 'borrador' ? 'b' : 'v') : ''}"></i>`; }).join('');
    return `<div class="cat-it ${p.id === C.sel ? 'on' : ''}" data-cat-id="${esc(p.id)}" draggable="${arrastrable}" role="button" tabindex="0">
      <input type="checkbox" data-sel ${C.marcadas.has(p.id) ? 'checked' : ''} aria-label="Seleccionar" />${arrastrable ? '<span class="cat-asa" title="Arrastra para ordenar">⋮⋮</span>' : ''}${catIc(catIconoDe(p), 34)}
      <span class="nm"><b>${esc(p.nombre)}</b><small>${esc(p.categoria_nombre)} · ${esc(p.unidad)}</small><span class="cat-pt" title="Precios puestos (verde publicado, ámbar borrador)">${dots}</span></span>
      <button class="cat-sw ${p.activa ? 'on' : ''}" data-tog type="button" title="${p.activa ? 'Publicada: pulsa para ocultar' : 'Oculta: pulsa para publicar'}" aria-pressed="${p.activa}"></button></div>`; }).join('')
    : '<p class="suave peq">No hay partidas con estos filtros. Pulsa «Nueva partida» o «Pegar desde Excel».</p>';
  if (arrastrable) catArrastre();
}

async function catListaClick(ev) {
  const C = window.__cat; const it = ev.target.closest('[data-cat-id]'); if (!it) return; const id = it.dataset.catId;
  if (ev.target.closest('[data-sel]')) { if (ev.target.checked) C.marcadas.add(id); else C.marcadas.delete(id); catBulk(); return; }
  if (ev.target.closest('[data-tog]')) {
    const p = C.partidas.find((x) => x.id === id);
    try { await rpc('panel_cat_activar', { p_id: id, p_activa: !p.activa }); p.activa = !p.activa; catKpis(); catLista(); if (C.sel === id && !C.sucio) catEditorPintar(); aviso(p.activa ? 'Partida publicada.' : 'Partida oculta.'); }
    catch (e) { aviso(mensajeError(e), true); }
    return;
  }
  if (C.sel === id && !C.nueva) return; if (!catSalir()) return;
  C.sel = id; C.nueva = false; C.pv.cant = null; C.pv.cesta = []; catLista(); catEditorPintar();
}

function catArrastre() {
  const C = window.__cat; let origen = null;
  document.querySelectorAll('#cat-lista .cat-it').forEach((el) => {
    el.ondragstart = (e) => { origen = el.dataset.catId; el.classList.add('arr'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', origen); } catch (x) { /* ok */ } };
    el.ondragend = () => { el.classList.remove('arr'); document.querySelectorAll('.cat-it.sobre').forEach((x) => x.classList.remove('sobre')); };
    el.ondragover = (e) => { e.preventDefault(); el.classList.add('sobre'); };
    el.ondragleave = () => el.classList.remove('sobre');
    el.ondrop = async (e) => {
      e.preventDefault(); el.classList.remove('sobre'); const dest = el.dataset.catId; if (!origen || origen === dest) return;
      const ids = catVisibles().map((p) => p.id).filter((i) => i !== origen); ids.splice(ids.indexOf(dest), 0, origen);
      try { await rpc('panel_cat_orden', { p_ids: ids }); ids.forEach((id, i) => { C.partidas.find((p) => p.id === id).orden = i + 1; });
        C.partidas.sort((a, b) => (a.orden_cat + String(a.orden).padStart(6, '0') + a.nombre).localeCompare(b.orden_cat + String(b.orden).padStart(6, '0') + b.nombre)); catLista(); aviso('Orden guardado.'); }
      catch (x) { aviso(mensajeError(x), true); }
    };
  });
}

function catBulk() {
  const C = window.__cat; const n = C.marcadas.size; const e = $('#cat-bulk'); if (!e) return;
  e.innerHTML = n ? `<div class="cat-bulk"><b>${n} seleccionada${n > 1 ? 's' : ''}</b><button class="btn" data-bk="mostrar">Publicar</button><button class="btn" data-bk="ocultar">Ocultar</button>
    <select id="cat-bcat" aria-label="Mover a categoría"><option value="">Mover a…</option>${C.cats.map((x) => `<option value="${esc(x.codigo)}">${esc(x.nombre)}</option>`).join('')}</select>
    <button class="btn" data-bk="ajustar">Ajustar precios…</button><button class="btn" data-bk="nada">Quitar selección</button></div>` : '';
  e.onclick = async (ev) => { const b = ev.target.closest('[data-bk]'); if (!b) return; const ids = [...C.marcadas];
    if (b.dataset.bk === 'nada') { C.marcadas.clear(); catLista(); catBulk(); return; }
    if (b.dataset.bk === 'ajustar') return catVentanaAjuste(ids);
    if (!catSalir()) return;
    try { const r = await rpc('panel_cat_masivo', { p_ids: ids, p_accion: b.dataset.bk, p_valor: null }); await catRecargar();
      aviso(b.dataset.bk === 'mostrar' ? `${r.cambiadas} publicadas${r.sin_precio_publicado ? `; ${r.sin_precio_publicado} no se pueden publicar sin un precio publicado` : ''}.` : `${r.cambiadas} ocultadas.`); } catch (x) { aviso(mensajeError(x), true); } };
  const s = $('#cat-bcat'); if (s) s.onchange = async () => { if (!s.value || !catSalir()) return; try { const r = await rpc('panel_cat_masivo', { p_ids: [...C.marcadas], p_accion: 'categoria', p_valor: s.value }); await catRecargar(); aviso(`${r.cambiadas} movidas.`); } catch (x) { aviso(mensajeError(x), true); } };
}

// ---- Ajustar precios en bloque (con vista previa antes/después) ----
function catAjustar(p, pct) {
  const f = 1 + pct / 100; const out = [];
  for (const [a, m] of catCombos(p)) { const x = catPrecioDe(p, a, m); if (!x) continue;
    const r = Math.round(Number(x.ref) * f * 100) / 100; out.push({ acabado: a, modalidad: m, ref: r, bajo: Math.round(Number(x.bajo) * f * 100) / 100, alto: Math.round(Number(x.alto) * f * 100) / 100, antes: Number(x.ref) }); }
  return out;
}
function catVentanaAjuste(ids) {
  const C = window.__cat; const ps = ids.map((id) => C.partidas.find((p) => p.id === id)).filter(Boolean);
  abrirVentana(`<h2>Ajustar precios de ${ps.length} partidas</h2><p class="suave">Sube o baja todos sus precios (con y sin materiales, todos los acabados) un porcentaje que eliges tú. Si una casilla tenía rango, se mantiene en proporción.</p>
    <label class="campo" for="cat-ap">Porcentaje (por ejemplo 5 o -3,5)</label><input type="text" id="cat-ap" inputmode="decimal" placeholder="%" />
    <div id="cat-apv" style="margin-top:10px"></div>
    <label style="display:block;margin-top:10px"><input type="radio" name="cat-apm" value="0" checked /> Guardar como <b>borrador</b> (lo revisas en la cuadrícula y lo publicas)</label>
    <label style="display:block;margin-top:4px"><input type="radio" name="cat-apm" value="1" /> <b>Publicar ahora</b> (cambia lo que ve el cliente)</label>
    <p style="text-align:right"><button class="btn" data-cerrar>Cancelar</button> <button class="btn primario" id="cat-apok" disabled>Aplicar</button></p>`, 720);
  $('[data-cerrar]').onclick = cerrarVentana;
  $('#cat-ap').oninput = () => { const p = catNum($('#cat-ap').value); const ok = p != null && !Number.isNaN(p) && p > -90 && p < 300;
    $('#cat-apok').disabled = !ok; if (!ok) { $('#cat-apv').innerHTML = ''; return; }
    $('#cat-apv').innerHTML = `<table class="t"><thead><tr><th>Partida</th><th>Antes</th><th>Después</th></tr></thead><tbody>${ps.slice(0, 6).map((q) => { const r = catAjustar(q, p)[0]; return `<tr><td>${esc(q.nombre)}</td><td>${r ? catEur(r.antes) : '—'}</td><td><b>${r ? catEur(r.ref) : '—'}</b></td></tr>`; }).join('')}</tbody></table>${ps.length > 6 ? `<p class="suave peq">…y ${ps.length - 6} más (se muestra el primer precio de cada una).</p>` : ''}`; };
  $('#cat-apok').onclick = async () => { const p = catNum($('#cat-ap').value); const pub = document.querySelector('input[name="cat-apm"]:checked').value === '1'; $('#cat-apok').disabled = true; let ok = 0; const fallos = [];
    for (const q of ps) { try { const pr = catAjustar(q, p); if (!pr.length) continue; await rpc('panel_cat_guardar_precios', { p_partida: q.id, p_precios: pr.map(({ acabado, modalidad, ref, bajo, alto }) => ({ acabado, modalidad, ref, bajo, alto })), p_publicar: pub, p_motivo: `Ajuste en bloque ${p > 0 ? '+' : ''}${String(p).replace('.', ',')} %` }); ok++; } catch (x) { fallos.push(`${q.nombre}: ${mensajeError(x)}`); } }
    cerrarVentana(); await catRecargar(); aviso(fallos.length ? `Ajustadas ${ok}. Fallaron ${fallos.length}: ${fallos[0]}` : `${ok} partidas ajustadas ${pub ? 'y publicadas' : 'como borrador'}.`, fallos.length > 0); };
}

// ====================== editor de una partida ======================
function catEditorPintar() {
  const C = window.__cat; const p = C.partidas.find((x) => x.id === C.sel) || null; const nuevo = !p; catSucio(false);
  const d = p || { id: '', categoria: C.cat || (C.cats[0] && C.cats[0].codigo) || '', nombre: '', descripcion: '', incluye: '', unidad: 'm²', cantidad_defecto: 1, cantidad_min: 1, cantidad_max: 1000, icono: '', activa: false, precios: [] };
  C.edit = { unico: catEsUnico(d) };
  $('#cat-editor').innerHTML = catEditorHtml(d, nuevo);
  catEditorEnlazar(); catRefrescar();
}

function catGridHtml(d, unico) {
  const acs = unico ? [['unico', 'Precio único']] : CAT_ACAB;
  return `<tr><th></th>${acs.map((a) => `<th>${a[1]}</th>`).join('')}</tr>${CAT_MOD.map((m) => `<tr><td class="l">${m[1]}</td>${acs.map((a) => { const x = catPrecioDe(d, a[0], m[0]); const r = x && x.ref != null ? Number(x.ref) : null;
    return `<td class="cat-cel ${r == null ? 'falta' : ''} ${x && x.estado === 'borrador' ? 'bor' : ''}"><input class="r" inputmode="decimal" placeholder="€" data-ac="${a[0]}" data-mod="${m[0]}" data-k="ref" value="${r == null ? '' : catTxt(r)}" aria-label="${m[1]} ${a[1]}" /><div class="mm"><input inputmode="decimal" placeholder="mín" data-ac="${a[0]}" data-mod="${m[0]}" data-k="bajo" value="${x && Number(x.bajo) !== r ? catTxt(x.bajo) : ''}" /><input inputmode="decimal" placeholder="máx" data-ac="${a[0]}" data-mod="${m[0]}" data-k="alto" value="${x && Number(x.alto) !== r ? catTxt(x.alto) : ''}" /></div></td>`; }).join('')}</tr>`).join('')}`;
}

function catEditorHtml(d, nuevo) {
  const C = window.__cat; const unico = C.edit.unico; const hayBorrador = (d.precios || []).some((x) => x.estado === 'borrador');
  const icoSel = d.icono || CAT_ICONO_CAT[d.categoria] || 'casa';
  return `<div class="panel"><header style="flex-wrap:wrap;gap:8px"><h2 style="flex:1 1 100%">${nuevo ? 'Nueva partida' : esc(d.nombre)} <span class="cat-sucio hidden" id="cat-sucio">● Cambios sin guardar</span></h2>
      <div class="cab-acc" style="flex:1 1 100%;justify-content:flex-start"><span style="display:inline-flex;gap:8px;align-items:center;font-weight:600">Publicada <button type="button" class="cat-sw ${d.activa ? 'on' : ''}" id="cat-activa" aria-pressed="${!!d.activa}"></button></span>
      ${nuevo ? '' : '<button class="btn" id="cat-dup">Duplicar</button>'}<button class="btn" id="cat-deshacer">Deshacer</button><button class="btn primario" id="cat-guardar" title="Ctrl+S">Guardar</button></div></header>
    <div style="padding:14px"><h3 style="margin:0 0 8px;font-size:14px">Datos básicos</h3>
      <div class="cat-f"><div><label for="cat-nombre">Nombre</label><input type="text" id="cat-nombre" maxlength="120" value="${esc(d.nombre)}" /></div>
        <div><label for="cat-categoria">Categoría</label><select id="cat-categoria">${C.cats.map((x) => `<option value="${esc(x.codigo)}" ${x.codigo === d.categoria ? 'selected' : ''}>${esc(x.nombre)}</option>`).join('')}</select></div>
        <div><label for="cat-unidad">Unidad</label><input type="text" id="cat-unidad" maxlength="12" list="cat-unidades" value="${esc(d.unidad)}" /><datalist id="cat-unidades"><option>m²</option><option>m</option><option>ud</option><option>m³</option><option>h</option></datalist></div></div>
      <div class="cat-f"><div><label for="cat-desc">Descripción (la ve el cliente)</label><input type="text" id="cat-desc" maxlength="500" value="${esc(d.descripcion || '')}" /></div>
        <div style="grid-column:span 2"><label for="cat-incluye">Qué incluye</label><input type="text" id="cat-incluye" maxlength="200" value="${esc(d.incluye || '')}" placeholder="Retirada, instalación y mampara" /></div></div>
      <div class="cat-f" style="grid-template-columns:1fr 1fr 1fr"><div><label for="cat-cdef">Cantidad por defecto</label><input type="text" inputmode="decimal" id="cat-cdef" value="${catTxt(d.cantidad_defecto).replace(',00', '')}" /></div>
        <div><label for="cat-cmin">Mínimo</label><input type="text" inputmode="decimal" id="cat-cmin" value="${catTxt(d.cantidad_min).replace(',00', '')}" /></div>
        <div><label for="cat-cmax">Máximo</label><input type="text" inputmode="decimal" id="cat-cmax" value="${catTxt(d.cantidad_max).replace(',00', '')}" /></div></div>
      <label class="suave peq">Icono</label><div class="cat-icos" id="cat-icos" data-ico="${esc(icoSel)}">${CAT_ICONOS.map((k) => `<button type="button" class="cat-ico ${k === icoSel ? 'on' : ''}" data-ico="${k}" title="${k}">${catIc(k, 34)}</button>`).join('')}</div>
      <h3 style="margin:18px 0 4px;font-size:14px">Precios (sin IVA)</h3><p class="suave peq" style="margin:0 0 6px">Escribe y pulsa Tab para pasar a la siguiente casilla. «mín» y «máx» son opcionales.</p>
      <label class="peq"><input type="checkbox" id="cat-unico" ${unico ? 'checked' : ''} /> Esta partida no tiene acabados (un solo precio)</label>
      <table class="cat-g" id="cat-grid">${catGridHtml(d, unico)}</table>
      <div class="cat-tools"><button class="btn peq" id="cat-cp-basico">Copiar Básico a Medio y Alto</button>
        <span>Ajustar todos ±<input type="text" id="cat-pct" inputmode="decimal" placeholder="%" /> %</span><button class="btn peq" id="cat-aj">Aplicar</button>
        <span>Rango ±<input type="text" id="cat-rg" inputmode="decimal" placeholder="%" /> %</span><button class="btn peq" id="cat-rga">Calcular</button><button class="btn peq" id="cat-limpiar">Limpiar precios</button></div>
      <div class="cat-av" id="cat-av"></div>
      <p class="suave peq" style="margin:8px 0 0">${hayBorrador ? '<b>Hay precios en borrador sin publicar (casillas ámbar).</b> ' : ''}Cada cambio de precio queda en el historial (quién y cuándo). Los porcentajes los eliges tú: no hay ninguno por defecto.</p></div></div>`;
}

function catLeer() {
  const g = (id) => { const e = document.getElementById(id); return e ? e.value : ''; };
  const celdas = {}; document.querySelectorAll('#cat-grid input[data-k]').forEach((i) => { const k = `${i.dataset.ac}|${i.dataset.mod}`; (celdas[k] = celdas[k] || {})[i.dataset.k] = i.value; });
  return { nombre: g('cat-nombre').trim(), categoria: g('cat-categoria'), unidad: g('cat-unidad').trim(), desc: g('cat-desc'), incluye: g('cat-incluye'),
    cdef: catNum(g('cat-cdef')), cmin: catNum(g('cat-cmin')), cmax: catNum(g('cat-cmax')), icono: (document.getElementById('cat-icos') || { dataset: {} }).dataset.ico || '',
    activa: !!(document.getElementById('cat-activa') || { classList: { contains: () => false } }).classList.contains('on'), unico: !!(document.getElementById('cat-unico') || {}).checked, celdas };
}

function catValidar(f) {
  const av = [], mal = [];
  for (const [k, x] of Object.entries(f.celdas)) { const [ac, mod] = k.split('|'); const r = catNum(x.ref), b = catNum(x.bajo), a = catNum(x.alto);
    if ([r, b, a].some((n) => Number.isNaN(n))) { mal.push(`Hay un importe que no es un número (${ac}).`); continue; }
    if (r != null && r <= 0) mal.push('Los importes deben ser mayores que 0.');
    if (r != null && ((b != null && b > r) || (a != null && a < r))) mal.push(`El rango no cuadra en «${ac} / ${mod === 'solo_mano_obra' ? 'sin' : 'con'} materiales»: mín ≤ precio ≤ máx.`); }
  for (const ac of ['unico', 'basico', 'medio', 'alto']) { const con = catNum((f.celdas[`${ac}|mano_obra_materiales`] || {}).ref), sin = catNum((f.celdas[`${ac}|solo_mano_obra`] || {}).ref);
    if (con != null && sin != null && sin > con) mal.push(`En «${ac}», «sin materiales» no puede costar más que «con materiales».`); }
  const acs = f.unico ? ['unico'] : ['basico', 'medio', 'alto']; const faltan = [];
  for (const ac of acs) for (const m of CAT_MOD) if (catNum((f.celdas[`${ac}|${m[0]}`] || {}).ref) == null) faltan.push(`${ac} / ${m[1].toLowerCase()}`);
  if (f.activa && faltan.length === acs.length * 2) mal.push('Para publicar, escribe al menos un precio.');
  else if (faltan.length) av.push(`Faltan precios: ${faltan.join(', ')}. En la app solo se podrá elegir lo que tenga precio.`);
  return { av, mal };
}

function catRefrescar() {
  const f = catLeer(); const r = catValidar(f); const av = $('#cat-av');
  if (av) { av.className = 'cat-av' + (r.mal.length ? ' mal' : ''); av.innerHTML = r.mal.length ? r.mal.map(esc).join('<br>') : r.av.map(esc).join('<br>'); }
  document.querySelectorAll('#cat-grid td.cat-cel').forEach((td) => td.classList.toggle('falta', !String(td.querySelector('input.r').value).trim()));
  catPreview();
}

function catEditorEnlazar() {
  const C = window.__cat; const ed = $('#cat-editor');
  ed.oninput = () => { catSucio(true); catRefrescar(); };
  ed.onchange = (ev) => { if (ev.target.id === 'cat-unico') catCambiarUnico(catLeer().unico); else { catSucio(true); catRefrescar(); } };
  ed.onclick = async (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.id === 'cat-activa') { b.classList.toggle('on'); b.setAttribute('aria-pressed', b.classList.contains('on')); catSucio(true); catRefrescar(); return; }
    if (b.dataset.ico && b.closest('#cat-icos')) { $('#cat-icos').dataset.ico = b.dataset.ico; document.querySelectorAll('#cat-icos .cat-ico').forEach((x) => x.classList.toggle('on', x === b)); catSucio(true); catRefrescar(); return; }
    if (b.id === 'cat-guardar') return catGuardar();
    if (b.id === 'cat-deshacer') { catEditorPintar(); aviso('Cambios descartados.'); return; }
    if (b.id === 'cat-dup') { if (!catSalir()) return; try { const id = await rpc('panel_cat_duplicar', { p_id: C.sel }); await catRecargar(id); aviso('Partida duplicada (oculta, con los precios en borrador).'); } catch (e) { aviso(mensajeError(e), true); } return; }
    const inp = (sel) => document.querySelectorAll(`#cat-grid ${sel}`);
    if (b.id === 'cat-cp-basico') { inp('input[data-ac="basico"]').forEach((i) => ['medio', 'alto'].forEach((a) => { const t = document.querySelector(`#cat-grid input[data-ac="${a}"][data-mod="${i.dataset.mod}"][data-k="${i.dataset.k}"]`); if (t) t.value = i.value; })); catSucio(true); catRefrescar(); return; }
    if (b.id === 'cat-aj') { const p = catNum($('#cat-pct').value); if (p == null || Number.isNaN(p)) { aviso('Escribe un porcentaje.', true); return; }
      inp('input[data-k]').forEach((i) => { const n = catNum(i.value); if (n != null && !Number.isNaN(n)) i.value = catTxt(Math.round(n * (1 + p / 100) * 100) / 100); }); catSucio(true); catRefrescar(); return; }
    if (b.id === 'cat-rga') { const p = catNum($('#cat-rg').value); if (p == null || Number.isNaN(p) || p < 0) { aviso('Escribe el porcentaje del rango.', true); return; }
      inp('input.r').forEach((i) => { const n = catNum(i.value); if (n == null || Number.isNaN(n)) return; const q = (k) => document.querySelector(`#cat-grid input[data-ac="${i.dataset.ac}"][data-mod="${i.dataset.mod}"][data-k="${k}"]`);
        q('bajo').value = catTxt(Math.round(n * (1 - p / 100) * 100) / 100); q('alto').value = catTxt(Math.round(n * (1 + p / 100) * 100) / 100); }); catSucio(true); catRefrescar(); return; }
    if (b.id === 'cat-limpiar') { inp('input[data-k]').forEach((i) => { i.value = ''; }); catSucio(true); catRefrescar(); return; }
  };
}

// Cambia entre «3 acabados» y «precio unico» conservando lo escrito (el Básico pasa a ser el único y al revés)
function catCambiarUnico(unico) {
  const C = window.__cat; const f = catLeer(); const precios = [];
  for (const m of CAT_MOD) { const from = unico ? 'basico' : 'unico', to = unico ? 'unico' : 'basico'; const x = f.celdas[`${from}|${m[0]}`] || {}; const r = catNum(x.ref);
    if (r != null && !Number.isNaN(r)) precios.push({ acabado: to, modalidad: m[0], estado: 'borrador', ref: r, bajo: catNum(x.bajo) == null ? r : catNum(x.bajo), alto: catNum(x.alto) == null ? r : catNum(x.alto) }); }
  C.edit.unico = unico; $('#cat-grid').innerHTML = catGridHtml({ precios }, unico); catSucio(true); catRefrescar();
}

async function catGuardar() {
  const C = window.__cat; const f = catLeer(); const v = catValidar(f);
  if (f.nombre.length < 3) { aviso('Escribe el nombre de la partida.', true); return; }
  if (!f.unidad) { aviso('Indica la unidad (m², ud...).', true); return; }
  if (![f.cdef, f.cmin, f.cmax].every((n) => Number.isFinite(n))) { aviso('Revisa las cantidades (por defecto, mínimo y máximo).', true); return; }
  if (v.mal.length) { aviso(v.mal[0], true); return; }
  const btn = $('#cat-guardar'); btn.disabled = true;
  try {
    const id = await rpc('panel_cat_guardar_partida', { p_id: C.nueva ? null : C.sel, p_categoria: f.categoria, p_nombre: f.nombre, p_descripcion: f.desc, p_incluye: f.incluye, p_unidad: f.unidad,
      p_cant_defecto: f.cdef, p_cant_min: f.cmin, p_cant_max: f.cmax, p_icono: f.icono || null, p_subcategoria: null, p_orden: (C.partidas.find((p) => p.id === C.sel) || {}).orden || 0 });
    const precios = [];
    for (const ac of ['unico', 'basico', 'medio', 'alto']) for (const m of CAT_MOD) { const x = f.celdas[`${ac}|${m[0]}`] || {}; const r = catNum(x.ref), b = catNum(x.bajo), a = catNum(x.alto);
      precios.push({ acabado: ac, modalidad: m[0], ref: r == null ? null : r, bajo: b == null ? null : b, alto: a == null ? null : a }); }
    const res = await rpc('panel_cat_guardar_precios', { p_partida: id, p_precios: precios, p_publicar: f.activa, p_motivo: 'Alta manual desde el panel' });
    await rpc('panel_cat_activar', { p_id: id, p_activa: f.activa });
    await catRecargar(id);
    aviso(f.activa ? `Guardada y publicada (${res.publicados} precios publicados${res.sin_cambios ? ', ' + res.sin_cambios + ' sin cambios' : ''}).` : 'Guardada como borrador: todavía no se ve en la app.');
  } catch (e) { aviso(mensajeError(e), true); btn.disabled = false; }
}

// ====================== vista previa interactiva ======================
function catPvPrecio(f, ac, mod) {
  const x = f.celdas[`${f.unico ? 'unico' : ac}|${mod}`] || {}; const r = catNum(x.ref); if (r == null || Number.isNaN(r)) return null;
  const b = catNum(x.bajo), a = catNum(x.alto); return { r, b: b == null || Number.isNaN(b) ? r : b, a: a == null || Number.isNaN(a) ? r : a };
}
function catPreview() {
  const C = window.__cat; const e = document.getElementById('cat-prev'); if (!e) return; const f = catLeer(); const pv = C.pv; const cant = pv.cant == null ? (Number.isFinite(f.cdef) ? f.cdef : 1) : pv.cant;
  const ico = f.icono || CAT_ICONO_CAT[f.categoria] || 'casa'; const cat = (C.cats.find((x) => x.codigo === f.categoria) || {}).nombre || '';
  const cur = catPvPrecio(f, pv.ac, pv.mod); const un = esc(f.unidad || 'ud');
  const rango = (q, n) => (q.b === q.a ? catEur(q.r * n) : `${catEur(q.b * n)} – ${catEur(q.a * n)}`);
  const desde = (() => { const l = CAT_MOD.flatMap((m) => (f.unico ? ['unico'] : ['basico', 'medio', 'alto']).map((a) => catPvPrecio(f, a, m[0]))).filter(Boolean); return l.length ? catEur(Math.min(...l.map((q) => q.r))) : null; })();
  $('#cat-ptabs').innerHTML = [['detalle', 'Detalle'], ['lista', 'En la lista'], ['pedido', `Pedido${pv.cesta.length ? ' (' + pv.cesta.length + ')' : ''}`]].map((t) => `<button class="${pv.tab === t[0] ? 'on' : ''}" data-pvt="${t[0]}">${t[1]}</button>`).join('');
  let h = '';
  if (pv.tab === 'detalle') {
    h = `<div class="cat-hero">${catIc(ico, 84)}</div><div class="cat-pvk">${esc(cat)}</div><div class="cat-pvn">${esc(f.nombre || 'Nombre de la partida')}</div><div style="font-size:11.5px;color:#52657A">${esc(f.incluye || f.desc || '')}</div>
      ${f.unico ? '' : `<div class="cat-pch">${CAT_ACAB.map((a) => `<button type="button" class="${pv.ac === a[0] ? 'on' : ''}" data-pv-ac="${a[0]}">${a[1]}</button>`).join('')}</div>`}
      <div class="cat-pseg">${CAT_MOD.map((m) => { const x = catPvPrecio(f, pv.ac, m[0]); return `<button type="button" class="${pv.mod === m[0] ? 'on' : ''}" data-pv-mod="${m[0]}">${m[1]}<small>${x ? catEur(x.r) + '/' + un : '—'}</small></button>`; }).join('')}</div>
      <div class="cat-pq"><span>Cantidad<button type="button" data-pv-q="-1">−</button><b>${esc(String(cant).replace('.', ','))} ${un}</b><button type="button" data-pv-q="1">+</button></span></div>
      <div class="cat-pdk"><div>Total estimado<b>${cur ? rango(cur, cant) : '—'}</b></div><button type="button" data-pv-add ${cur ? '' : 'disabled'}>＋ Añadir</button></div>`;
  } else if (pv.tab === 'lista') {
    h = `<div class="cat-pcard cat-pop">${catIc(ico, 46)}<div class="nm">${esc(f.nombre || 'Nombre de la partida')}<small>${desde ? 'desde ' + desde + ' / ' + un : 'sin precio todavía'}</small></div><button class="mas" type="button" data-pv-add ${cur ? '' : 'disabled'}>+</button></div>
      <p class="suave peq" style="margin:6px 4px">Así aparece en la lista de «${esc(cat)}». El «+» la añade con el acabado y la cantidad por defecto.</p>`;
  } else {
    const lineas = pv.cesta.map((l, i) => { const q = catPvPrecio(f, l.ac, l.mod); return { l, i, q }; });
    const tot = lineas.reduce((s, x) => (x.q ? [s[0] + x.q.b * x.l.cant, s[1] + x.q.a * x.l.cant] : s), [0, 0]);
    h = lineas.length ? lineas.map(({ l, i, q }) => `<div class="cat-pl"><b>${esc(f.nombre || 'Partida')}</b> <span class="suave">${l.ac === 'unico' ? '' : esc((CAT_ACAB.find((a) => a[0] === l.ac) || [0, ''])[1]) + ' · '}${esc(String(l.cant).replace('.', ','))} ${un}</span><span style="float:right;font-weight:700">${q ? rango(q, l.cant) : '—'}</span>
        <div class="seg">${CAT_MOD.map((m) => `<button type="button" class="${l.mod === m[0] ? 'on' : ''}" data-pv-lm="${i}|${m[0]}">${m[1]}</button>`).join('')}</div></div>`).join('')
      + `<div class="cat-pl" style="display:flex;justify-content:space-between"><b>Total</b><b>${tot[0] === tot[1] ? catEur(tot[0]) : catEur(tot[0]) + ' – ' + catEur(tot[1])}</b></div><div class="cat-pdk" style="position:static;margin-top:8px"><div>IVA a confirmar</div><button type="button" data-pv-pagar>Pagar</button></div>`
      : '<p class="suave peq" style="margin:14px 4px">Aún no has añadido nada. Pulsa «Añadir» en el detalle para ver cómo queda el pedido, con «con / sin materiales» en cada línea.</p>';
  }
  e.innerHTML = `<div class="cat-phone">${pv.toast ? '<div class="cat-toast">Añadido al pedido</div>' : ''}${h}</div>`;
  e.onclick = (ev) => { const b = ev.target.closest('button'); if (!b || b.disabled) return; const d = b.dataset;
    if (d.pvt !== undefined) pv.tab = d.pvt; else if (d.pvAc) pv.ac = d.pvAc; else if (d.pvMod) pv.mod = d.pvMod;
    else if (d.pvQ) { const mn = Number.isFinite(f.cmin) ? f.cmin : 1, mx = Number.isFinite(f.cmax) ? f.cmax : 1000; pv.cant = Math.min(mx, Math.max(mn, cant + Number(d.pvQ) * (cant >= 10 ? 5 : 1))); }
    else if (d.pvLm) { const [i, m] = d.pvLm.split('|'); pv.cesta[Number(i)].mod = m; }
    else if ('pvAdd' in d) { if (pv.cesta.length < 10) pv.cesta.push({ ac: f.unico ? 'unico' : pv.ac, mod: pv.mod, cant }); pv.toast = true; setTimeout(() => { pv.toast = false; catPreview(); }, 1100); }
    else if ('pvPagar' in d) { aviso('En la app, «Pagar» está apagado hasta que actives los pagos (con tu autorización).'); return; }
    catPreview(); };
  document.getElementById('cat-ptabs').onclick = (ev) => { const b = ev.target.closest('[data-pvt]'); if (b) { pv.tab = b.dataset.pvt; catPreview(); } };
}

// ====================== vista «Cuadrícula de precios» (como una hoja de cálculo) ======================
function catCuadricula() {
  const C = window.__cat;
  $('#cat-cuerpo').innerHTML = `<div class="panel"><div style="padding:12px"><div style="display:grid;grid-template-columns:minmax(220px,340px) 1fr;gap:12px;align-items:start"><div>${catFiltrosHtml()}</div>
    <div class="cab-acc" style="justify-content:flex-end"><span class="suave peq" id="cat-gcont"></span>
      <label class="peq"><input type="checkbox" id="cat-gpub" /> Publicar al guardar</label><button class="btn" id="cat-gbor" disabled>Publicar borradores</button><button class="btn primario" id="cat-g-guardar" disabled title="Ctrl+S">Guardar cambios</button></div></div>
    <p class="suave peq" style="margin:2px 0 8px">Edita los precios directamente. Enter o las flechas ↑ ↓ bajan y suben; puedes pegar un bloque copiado de Excel. Las casillas ámbar son borradores. Si una casilla tenía rango (mín–máx), se mantiene en la misma proporción.</p>
    <div class="tabla-caja"><table class="cat-gt" id="cat-gt"></table></div></div></div>`;
  const rec = () => { catGridTabla(); };
  catFiltrosEnlazar(rec); rec();
  $('#cat-g-guardar').onclick = catGuardarCuadricula;
  $('#cat-gbor').onclick = catPublicarBorradores;
}

function catGridTabla() {
  const C = window.__cat; const l = catVisibles();
  const cab = `<thead><tr><th rowspan="2" style="text-align:left">Partida</th><th colspan="3" style="border-bottom:1px solid var(--linea2)">Con materiales</th><th colspan="3" style="border-bottom:1px solid var(--linea2)">Sin materiales</th></tr>
    <tr>${[0, 1].map(() => CAT_ACAB.map((a) => `<th>${a[1]}</th>`).join('')).join('')}</tr></thead>`;
  const celda = (p, a, m, span) => { const x = catPrecioDe(p, a, m); return `<td colspan="${span}" class="${span > 1 ? 'u' : ''}"><input inputmode="decimal" data-pid="${esc(p.id)}" data-ac="${a}" data-mod="${m}" value="${x ? catTxt(x.ref) : ''}" class="${x && x.estado === 'borrador' ? 'bor' : ''}" aria-label="${esc(p.nombre)} ${a} ${m}" /></td>`; };
  $('#cat-gt').innerHTML = cab + '<tbody>' + (l.length ? l.map((p) => { const u = catEsUnico(p);
    return `<tr data-pid="${esc(p.id)}"><td class="cat-nom">${catIc(catIconoDe(p), 26)} <a href="javascript:void(0)" data-edit="${esc(p.id)}" style="color:inherit;text-decoration:none">${esc(p.nombre)}</a> <span class="suave peq">/${esc(p.unidad)}</span> ${p.activa ? '' : '<span class="e neutro peq">oculta</span>'}</td>`
      + CAT_MOD.map((m) => (u ? celda(p, 'unico', m[0], 3) : CAT_ACAB.map((a) => celda(p, a[0], m[0], 1)).join(''))).join('') + '</tr>'; }).join('') : '<tr><td colspan="7" class="suave">No hay partidas con estos filtros.</td></tr>') + '</tbody>';
  const t = $('#cat-gt');
  t.oninput = (ev) => { const i = ev.target; if (i.tagName !== 'INPUT') return; i.classList.toggle('ch', i.value !== i.defaultValue); catGridContador(); };
  t.onclick = (ev) => { const a = ev.target.closest('[data-edit]'); if (!a || !catSalir()) return; C.vista = 'partidas'; C.sel = a.dataset.edit; C.nueva = false; catTabs(); catCuerpo(); };
  t.onkeydown = (ev) => { const i = ev.target; if (i.tagName !== 'INPUT') return; const k = ev.key; if (!['Enter', 'ArrowDown', 'ArrowUp'].includes(k)) return;
    const filas = [...t.querySelectorAll('tbody tr[data-pid]')]; const f = i.closest('tr'); const j = filas.indexOf(f) + (k === 'ArrowUp' ? -1 : 1); if (j < 0 || j >= filas.length) return; ev.preventDefault();
    const n = filas[j].querySelector(`input[data-mod="${i.dataset.mod}"][data-ac="${i.dataset.ac}"]`) || filas[j].querySelector(`input[data-mod="${i.dataset.mod}"]`); if (n) { n.focus(); n.select(); } };
  t.onpaste = (ev) => { const i = ev.target; if (i.tagName !== 'INPUT') return; const txt = (ev.clipboardData || window.clipboardData).getData('text'); if (!/[\t\n]/.test(txt.trim())) return; ev.preventDefault();
    const filas = [...t.querySelectorAll('tbody tr[data-pid]')]; let r = filas.indexOf(i.closest('tr')); const c0 = [...i.closest('tr').querySelectorAll('input')].indexOf(i);
    txt.replace(/\r/g, '').split('\n').filter((x) => x.trim() !== '').forEach((lin) => { const fila = filas[r++]; if (!fila) return; const ins = [...fila.querySelectorAll('input')];
      lin.split('\t').forEach((v, k) => { const d = ins[c0 + k]; if (d) { const n = catNum(v); d.value = n == null || Number.isNaN(n) ? '' : catTxt(n); d.classList.toggle('ch', d.value !== d.defaultValue); } }); }); catGridContador(); };
  catGridContador();
}

function catGridContador() {
  const C = window.__cat; const ch = new Set([...document.querySelectorAll('#cat-gt input.ch')].map((i) => i.dataset.pid));
  const bor = catVisibles().filter((p) => (p.precios || []).some((x) => x.estado === 'borrador')).length;
  const e = $('#cat-gcont'); if (e) e.textContent = ch.size ? `${ch.size} partida${ch.size > 1 ? 's' : ''} con cambios` : `${catVisibles().length} partidas`;
  const g = $('#cat-g-guardar'); if (g) g.disabled = !ch.size; const b = $('#cat-gbor'); if (b) { b.disabled = !bor; b.textContent = bor ? `Publicar borradores (${bor})` : 'Publicar borradores'; }
  catSucio(ch.size > 0);
}

// Construye los precios de una fila conservando la proporción del rango anterior
function catFilaPrecios(p, inputs) {
  const out = [];
  inputs.forEach((i) => { const r = catNum(i.value); const x = catPrecioDe(p, i.dataset.ac, i.dataset.mod);
    if (r == null) { out.push({ acabado: i.dataset.ac, modalidad: i.dataset.mod, ref: null }); return; }
    if (Number.isNaN(r) || r <= 0) throw new Error(`«${p.nombre}»: hay un importe no válido.`);
    const kb = x && Number(x.ref) ? Number(x.bajo) / Number(x.ref) : 1, ka = x && Number(x.ref) ? Number(x.alto) / Number(x.ref) : 1;
    out.push({ acabado: i.dataset.ac, modalidad: i.dataset.mod, ref: r, bajo: Math.round(r * kb * 100) / 100, alto: Math.round(r * ka * 100) / 100 }); });
  for (const a of ['unico', 'basico', 'medio', 'alto']) { const c = out.find((x) => x.acabado === a && x.modalidad === 'mano_obra_materiales'), s = out.find((x) => x.acabado === a && x.modalidad === 'solo_mano_obra');
    if (c && s && c.ref != null && s.ref != null && s.ref > c.ref) throw new Error(`«${p.nombre}»: «sin materiales» no puede costar más que «con materiales».`); }
  return out;
}

async function catGuardarCuadricula() {
  const C = window.__cat; const pub = $('#cat-gpub').checked; const ids = [...new Set([...document.querySelectorAll('#cat-gt input.ch')].map((i) => i.dataset.pid))];
  document.querySelectorAll('#cat-gt tr.err').forEach((t) => t.classList.remove('err')); const lotes = [];
  try { for (const id of ids) { const p = C.partidas.find((x) => x.id === id); lotes.push([p, catFilaPrecios(p, [...document.querySelectorAll(`#cat-gt input[data-pid="${id}"]`)])]); } }
  catch (e) { aviso(mensajeError(e), true); return; }
  const b = $('#cat-g-guardar'); b.disabled = true; let ok = 0; const fallos = [];
  for (const [p, precios] of lotes) { try { await rpc('panel_cat_guardar_precios', { p_partida: p.id, p_precios: precios, p_publicar: pub, p_motivo: 'Edición en cuadrícula' }); ok++; } catch (e) { fallos.push(`${p.nombre}: ${mensajeError(e)}`); const tr = document.querySelector(`#cat-gt tr[data-pid="${p.id}"]`); if (tr) tr.classList.add('err'); } }
  C.partidas = await rpc('panel_cat_listar'); catSucio(false); catKpis(); catGridTabla();
  aviso(fallos.length ? `Guardadas ${ok}. Fallaron ${fallos.length}: ${fallos[0]}` : `${ok} partidas guardadas ${pub ? 'y publicadas' : 'como borrador'}.`, fallos.length > 0);
}

async function catPublicarBorradores() {
  const C = window.__cat; const l = catVisibles().filter((p) => (p.precios || []).some((x) => x.estado === 'borrador'));
  if (!l.length || !confirm(`Se publicarán los precios en borrador de ${l.length} partida${l.length > 1 ? 's' : ''}. Esto cambia lo que ve el cliente. ¿Continuar?`)) return;
  let ok = 0; const fallos = [];
  for (const p of l) { try { const precios = (p.precios || []).filter((x) => x.estado === 'borrador').map((x) => ({ acabado: x.acabado, modalidad: x.modalidad, ref: Number(x.ref), bajo: Number(x.bajo), alto: Number(x.alto) }));
    await rpc('panel_cat_guardar_precios', { p_partida: p.id, p_precios: precios, p_publicar: true, p_motivo: 'Publicación de borradores' }); ok++; } catch (e) { fallos.push(`${p.nombre}: ${mensajeError(e)}`); } }
  C.partidas = await rpc('panel_cat_listar'); catKpis(); catGridTabla();
  aviso(fallos.length ? `Publicadas ${ok}. Fallaron ${fallos.length}: ${fallos[0]}` : `${ok} partidas publicadas.`, fallos.length > 0);
}

// ====================== pestaña «Proveedores» (directorio para el cliente) ======================
async function catProveedores() {
  const C = window.__cat; const cu = $('#cat-cuerpo');
  cu.innerHTML = '<p class="suave">Cargando proveedores…</p>';
  try { C.prov = await rpc('panel_prov_listar'); C.provMsgs = await rpc('panel_prov_mensajes'); }
  catch (e) { cu.innerHTML = `<div class="panel" style="padding:14px 18px">Esta pestaña necesita la migración 0104 en Supabase. <span class="suave">(${esc(mensajeError(e))})</span></div>`; return; }
  C.provNuevos = C.provMsgs.filter((m) => m.estado === 'nuevo').length; catTabs();
  catProvPintar();
}

function catProvPintar() {
  const C = window.__cat; const cu = $('#cat-cuerpo'); const sel = C.prov.find((p) => p.id === C.provSel) || null;
  const q = (C.provQ || '').trim().toLowerCase();
  const lista = C.prov.filter((p) => (!q || p.nombre.toLowerCase().includes(q) || (p.zona || '').toLowerCase().includes(q)));
  cu.innerHTML = `<div style="display:grid;grid-template-columns:minmax(260px,320px) minmax(0,1fr);gap:14px;align-items:start" class="cat-prov-wrap">
    <div class="panel"><div style="padding:12px"><input type="search" id="cat-pq" placeholder="Buscar proveedor o zona" value="${esc(C.provQ || '')}" style="width:100%" />
      <div style="margin:8px 0"><button class="btn primario peq" id="cat-pnuevo">+ Nuevo proveedor</button></div>
      <div id="cat-plista">${lista.length ? lista.map((p) => `<div class="cat-it ${p.id === C.provSel ? 'on' : ''}" data-pid="${esc(p.id)}" role="button" tabindex="0">${catIc(CAT_ICONO_CAT[p.categoria] || 'casa', 30)}
        <span class="nm"><b>${esc(p.nombre)}</b><small>${esc(p.categoria_nombre || 'Sin categoría')}${p.zona ? ' · ' + esc(p.zona) : ''}${p.mensajes_nuevos ? ` · <b style="display:inline;color:var(--aviso)">${p.mensajes_nuevos} mensaje${p.mensajes_nuevos > 1 ? 's' : ''}</b>` : ''}</small></span>
        <button class="cat-sw ${p.publicado ? 'on' : ''}" data-ptog type="button" aria-pressed="${p.publicado}" title="${p.publicado ? 'Visible para el cliente: pulsa para ocultar' : 'Oculto: pulsa para publicar'}"></button></div>`).join('')
        : '<p class="suave peq">Todavía no hay proveedores. Pulsa «Nuevo proveedor».</p>'}</div></div></div>
    <div id="cat-peditor"></div></div>
    <div class="panel" style="margin-top:14px"><header><h2>Mensajes de clientes a proveedores</h2></header><div style="padding:12px" id="cat-pmsgs"></div></div>`;
  $('#cat-pq').oninput = (e) => { C.provQ = e.target.value; const pos = e.target.selectionStart; catProvPintar(); const i = $('#cat-pq'); i.focus(); i.setSelectionRange(pos, pos); };
  $('#cat-pnuevo').onclick = () => { if (!catSalir()) return; C.provSel = null; C.provNuevo = true; catProvPintar(); };
  $('#cat-plista').onclick = async (ev) => {
    const it = ev.target.closest('[data-pid]'); if (!it) return; const id = it.dataset.pid;
    if (ev.target.closest('[data-ptog]')) { const p = C.prov.find((x) => x.id === id);
      try { await rpc('panel_prov_publicar', { p_id: id, p_publicado: !p.publicado }); p.publicado = !p.publicado; aviso(p.publicado ? 'Proveedor publicado.' : 'Proveedor oculto.'); catProvPintar(); }
      catch (e) { aviso(mensajeError(e), true); } return; }
    if (id === C.provSel && !C.provNuevo) return; if (!catSalir()) return; C.provSel = id; C.provNuevo = false; catProvPintar(); };
  catProvEditor(C.provNuevo ? null : sel, C.provNuevo || !!sel);
  catProvMensajes();
}

function catProvEditor(d, abierto) {
  const C = window.__cat; const e = $('#cat-peditor');
  if (!abierto) { e.innerHTML = '<div class="panel" style="padding:18px"><p class="suave" style="margin:0">Elige un proveedor de la lista o pulsa «Nuevo proveedor». Aquí decides si aparece en la app del cliente y qué datos se enseñan.</p></div>'; return; }
  const x = d || { id: '', nombre: '', categoria: '', zona: '', descripcion: '', telefono: '', email: '', web: '', consentimiento: false, mostrar_contacto: false, publicado: false, orden: 0 };
  const v = (k) => esc(x[k] == null ? '' : x[k]);
  e.innerHTML = `<div class="panel"><header style="flex-wrap:wrap;gap:8px"><h2 style="flex:1 1 100%">${d ? esc(d.nombre) : 'Nuevo proveedor'} <span class="cat-sucio hidden" id="cat-sucio">● Cambios sin guardar</span></h2></header>
    <div style="padding:14px"><div class="cat-f"><div style="grid-column:span 2"><label for="cp-nombre">Nombre comercial</label><input type="text" id="cp-nombre" maxlength="120" value="${v('nombre')}" /></div>
      <div><label for="cp-cat">Oficio (categoría)</label><select id="cp-cat"><option value="">Sin categoría</option>${C.cats.map((c) => `<option value="${esc(c.codigo)}" ${c.codigo === x.categoria ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}</select></div></div>
      <div class="cat-f"><div><label for="cp-zona">Zona (provincia o ciudad)</label><input type="text" id="cp-zona" maxlength="120" value="${v('zona')}" /></div>
        <div style="grid-column:span 2"><label for="cp-desc">Descripción (la ve el cliente, máx. 600)</label><input type="text" id="cp-desc" maxlength="600" value="${v('descripcion')}" /></div></div>
      <div class="cat-f"><div><label for="cp-tel">Teléfono</label><input type="text" id="cp-tel" inputmode="tel" maxlength="25" value="${v('telefono')}" /></div>
        <div><label for="cp-email">Email</label><input type="text" id="cp-email" maxlength="120" value="${v('email')}" /></div>
        <div><label for="cp-web">Web (https://…)</label><input type="text" id="cp-web" maxlength="200" value="${v('web')}" /></div></div>
      <div style="margin-top:12px;display:grid;gap:8px">
        <label><input type="checkbox" id="cp-cons" ${x.consentimiento ? 'checked' : ''} /> <b>Tengo el consentimiento de este proveedor</b> para aparecer en la app de 3B Conecta ${x.consentimiento_en ? `<span class="suave peq">(registrado ${esc(fechaHora(x.consentimiento_en))})</span>` : ''}</label>
        <label><input type="checkbox" id="cp-mostrar" ${x.mostrar_contacto ? 'checked' : ''} /> Enseñar teléfono, email y web al cliente <span class="suave peq">(si no, solo puede escribirte a ti y tú se lo haces llegar)</span></label>
        <label style="display:flex;gap:8px;align-items:center"><button type="button" class="cat-sw ${x.publicado ? 'on' : ''}" id="cp-pub" aria-pressed="${!!x.publicado}"></button> <b>Publicado</b> <span class="suave peq">(visible en la app cuando el catálogo esté encendido)</span></label></div>
      <div class="cat-f" style="grid-template-columns:140px 1fr;margin-top:10px"><div><label for="cp-orden">Orden en la lista</label><input type="text" inputmode="numeric" id="cp-orden" value="${v('orden')}" /></div>
        <div class="suave peq" style="align-self:end">Sin puntuaciones ni ránking automático: el orden lo decides tú.</div></div>
      <div class="cat-pcard" id="cp-prev" style="margin-top:14px"></div>
      <div class="cat-av" id="cp-av"></div>
      <p style="margin:12px 0 0"><button class="btn primario" id="cat-p-guardar" title="Ctrl+S">Guardar proveedor</button> <button class="btn" id="cp-deshacer">Deshacer</button></p></div></div>`;
  const leer = () => { const g = (i) => $('#' + i).value.trim(); return { nombre: g('cp-nombre'), cat: g('cp-cat'), zona: g('cp-zona'), desc: g('cp-desc'), tel: g('cp-tel'), email: g('cp-email'), web: g('cp-web'),
    cons: $('#cp-cons').checked, mostrar: $('#cp-mostrar').checked, pub: $('#cp-pub').classList.contains('on'), orden: g('cp-orden') }; };
  const refrescar = () => { const f = leer(); const av = [];
    if (f.pub && !f.cons) av.push('Para publicar necesitas marcar el consentimiento del proveedor.');
    if (f.mostrar && !f.cons) av.push('Para enseñar sus datos de contacto necesitas su consentimiento.');
    if (f.web && !/^https?:\/\//i.test(f.web)) av.push('La web debe empezar por https://');
    if (f.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)) av.push('El email no parece válido.');
    if (f.tel && !/^[0-9+() .-]{6,25}$/.test(f.tel)) av.push('El teléfono solo puede llevar números, espacios, +, ( ) y guiones.');
    const a = $('#cp-av'); a.className = 'cat-av' + (av.length ? ' mal' : ''); a.innerHTML = av.map(esc).join('<br>');
    const cat = (C.cats.find((c) => c.codigo === f.cat) || {}).nombre || '';
    $('#cp-prev').innerHTML = `${catIc(CAT_ICONO_CAT[f.cat] || 'casa', 44)}<div class="nm"><b>${esc(f.nombre || 'Nombre del proveedor')}</b><small>${esc(cat)}${f.zona ? ' · ' + esc(f.zona) : ''}</small>
      <small>${esc(f.desc)}</small>${f.mostrar ? `<small>${esc([f.tel, f.email, f.web].filter(Boolean).join(' · ') || 'Sin datos de contacto')}</small>` : '<small><i>El cliente solo podrá escribirte a ti.</i></small>'}</div>`;
    return av; };
  e.oninput = () => { catSucio(true); refrescar(); };
  e.onchange = (ev) => { if (ev.target.id === 'cp-cons' && !ev.target.checked) { $('#cp-mostrar').checked = false; $('#cp-pub').classList.remove('on'); } catSucio(true); refrescar(); };
  e.onclick = async (ev) => { const b = ev.target.closest('button'); if (!b) return;
    if (b.id === 'cp-pub') { b.classList.toggle('on'); b.setAttribute('aria-pressed', b.classList.contains('on')); catSucio(true); refrescar(); return; }
    if (b.id === 'cp-deshacer') { catSucio(false); catProvPintar(); return; }
    if (b.id !== 'cat-p-guardar') return;
    const f = leer(); const av = refrescar();
    if (f.nombre.length < 2) { aviso('Escribe el nombre del proveedor.', true); return; }
    if (av.length) { aviso(av[0], true); return; }
    const orden = f.orden === '' ? 0 : Number(f.orden); if (!Number.isInteger(orden)) { aviso('El orden debe ser un número entero.', true); return; }
    b.disabled = true;
    try { const id = await rpc('panel_prov_guardar', { p_id: d ? d.id : null, p_nombre: f.nombre, p_categoria: f.cat || null, p_zona: f.zona || null, p_descripcion: f.desc || null,
        p_telefono: f.tel || null, p_email: f.email || null, p_web: f.web || null, p_consentimiento: f.cons, p_mostrar_contacto: f.mostrar, p_publicado: f.pub, p_orden: orden });
      C.prov = await rpc('panel_prov_listar'); C.provSel = id; C.provNuevo = false; catSucio(false); catProvPintar(); aviso(f.pub ? 'Proveedor guardado y publicado.' : 'Proveedor guardado (oculto).'); }
    catch (x) { aviso(mensajeError(x), true); b.disabled = false; } };
  refrescar();
}

function catProvMensajes() {
  const C = window.__cat; const e = $('#cat-pmsgs'); const l = C.provMsgs;
  const pill = { nuevo: ['Nuevo', 'aviso'], reenviado: ['Reenviado', 'ok'], descartado: ['Descartado', 'neutro'] };
  e.innerHTML = (l.length ? `<p class="suave peq" style="margin:0 0 8px">«Reenviado» significa que ya se lo has hecho llegar tú al proveedor. El panel no envía correos ni mensajes. El cliente aceptó que se comparta su mensaje y su teléfono.</p>
    <div class="tabla-caja"><table class="t"><thead><tr><th>Estado</th><th>Fecha</th><th>Cliente</th><th>Proveedor</th><th>Mensaje</th><th></th></tr></thead><tbody>${l.map((m) => `<tr><td><span class="e ${pill[m.estado][1]}">${pill[m.estado][0]}</span></td>
      <td>${esc(fechaHora(m.creado))}</td><td>${esc(m.persona || '—')}<br><span class="suave peq">${esc(m.telefono || '')}</span></td><td>${esc(m.proveedor)}<br><span class="suave peq">${esc([m.proveedor_telefono, m.proveedor_email].filter(Boolean).join(' · '))}</span></td>
      <td style="max-width:360px">${esc(m.mensaje)}</td><td style="white-space:nowrap">${m.estado === 'nuevo' ? `<button class="btn peq" data-pm="${esc(m.id)}|reenviado">Marcar reenviado</button> <button class="btn peq" data-pm="${esc(m.id)}|descartado">Descartar</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`
    : '<p class="suave peq" style="margin:0">Todavía no hay mensajes. Cuando un cliente escriba a un proveedor, aparecerá aquí.</p>');
  e.onclick = async (ev) => { const b = ev.target.closest('[data-pm]'); if (!b) return; const [id, est] = b.dataset.pm.split('|');
    try { await rpc('panel_prov_mensaje_gestionar', { p_id: id, p_estado: est }); C.prov = await rpc('panel_prov_listar'); C.provMsgs = await rpc('panel_prov_mensajes'); C.provNuevos = C.provMsgs.filter((m) => m.estado === 'nuevo').length; catTabs(); catProvPintar(); aviso('Mensaje marcado como ' + est + '.'); }
    catch (x) { aviso(mensajeError(x), true); } };
}

// ---------------- Pegar varias partidas desde Excel -----------------
function catVentanaPegar() {
  abrirVentana(`<h2>Pegar varias partidas desde Excel</h2>
    <p class="suave">Copia las filas en Excel y pégalas aquí (columnas separadas por tabulador). Orden de columnas:</p>
    <p style="font-size:12px"><b>Categoría · Nombre · Unidad · Con materiales (Básico) · Medio · Alto · Sin materiales (Básico) · Medio · Alto · Descripción · Qué incluye</b></p>
    <p class="suave" style="font-size:12px">Categoría: el nombre o el código (por ejemplo «Baño» o «bano»). Los precios son sin IVA; las casillas vacías se dejan sin precio. Si ya existe una partida con el mismo nombre en esa categoría, se actualiza. <b>Todo entra oculto y en borrador</b>: lo revisas y lo publicas tú.</p>
    <textarea id="cat-pegado" rows="8" style="width:100%" placeholder="Baño&#9;Cambio de grifería&#9;ud&#9;85&#9;110&#9;150"></textarea>
    <p><button class="btn" id="cat-prueba">Revisar</button></p><div id="cat-pres"></div>
    <p style="text-align:right"><button class="btn" data-cerrar>Cerrar</button> <button class="btn primario" id="cat-importar" disabled>Importar como borrador</button></p>`, 820);
  $('[data-cerrar]').onclick = cerrarVentana;
  const norm = (s) => String(s || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  let filas = [];
  $('#cat-prueba').onclick = () => {
    const cats = window.__cat.cats; filas = [];
    const txt = $('#cat-pegado').value.split(/\r?\n/).filter((l) => l.trim());
    const out = txt.map((l, i) => {
      const c = l.split('\t'); const err = [];
      const cat = cats.find((x) => norm(x.codigo) === norm(c[0]) || norm(x.nombre) === norm(c[0]));
      if (!cat) err.push('categoría no reconocida');
      const nombre = (c[1] || '').trim(); if (nombre.length < 3) err.push('falta el nombre');
      const unidad = (c[2] || '').trim(); if (!unidad) err.push('falta la unidad');
      const n = c.slice(3, 9).map(catNum); if (n.some((x) => Number.isNaN(x) || (x != null && x <= 0))) err.push('importe no válido');
      const [cb, cm, ca, sb2, sm, sa] = n;
      [[cb, sb2], [cm, sm], [ca, sa]].forEach((p) => { if (p[0] != null && p[1] != null && p[1] > p[0]) err.push('sin materiales > con materiales'); });
      const r = { n: i + 1, err, cat, nombre, unidad, desc: (c[9] || '').trim(), incluye: (c[10] || '').trim(), p: { basico: [cb, sb2], medio: [cm, sm], alto: [ca, sa] } };
      if (!err.length) filas.push(r); return r;
    });
    $('#cat-pres').innerHTML = out.length ? `<table class="tabla"><tr><th>#</th><th>Categoría</th><th>Partida</th><th>Ud</th><th>Estado</th></tr>${out.map((r) => `<tr><td>${r.n}</td><td>${esc(r.cat ? r.cat.nombre : '—')}</td><td>${esc(r.nombre)}</td><td>${esc(r.unidad)}</td><td>${r.err.length ? `<span class="e mal">${esc(r.err.join(', '))}</span>` : '<span class="e ok">Lista</span>'}</td></tr>`).join('')}</table><p class="suave">${filas.length} listas de ${out.length}.</p>` : '<p class="suave">No hay filas.</p>';
    $('#cat-importar').disabled = !filas.length;
  };
  $('#cat-importar').onclick = async () => {
    const b = $('#cat-importar'); b.disabled = true; let ok = 0; const falla = [];
    for (const r of filas) {
      try {
        const ex = window.__cat.partidas.find((p) => p.categoria === r.cat.codigo && norm(p.nombre) === norm(r.nombre));
        const id = await rpc('panel_cat_guardar_partida', { p_id: ex ? ex.id : null, p_categoria: r.cat.codigo, p_nombre: r.nombre, p_descripcion: r.desc || (ex ? ex.descripcion : ''), p_incluye: r.incluye || (ex ? ex.incluye : ''), p_unidad: r.unidad,
          p_cant_defecto: ex ? ex.cantidad_defecto : 1, p_cant_min: ex ? ex.cantidad_min : 1, p_cant_max: ex ? ex.cantidad_max : 1000, p_icono: ex ? ex.icono : null, p_subcategoria: null, p_orden: 0 });
        const precios = []; for (const ac of ['basico', 'medio', 'alto']) { const [con, sin] = r.p[ac]; if (con != null) precios.push({ acabado: ac, modalidad: 'mano_obra_materiales', ref: con }); if (sin != null) precios.push({ acabado: ac, modalidad: 'solo_mano_obra', ref: sin }); }
        if (precios.length) await rpc('panel_cat_guardar_precios', { p_partida: id, p_precios: precios, p_publicar: false, p_motivo: 'Importado desde Excel' });
        ok++;
      } catch (e) { falla.push(`Fila ${r.n}: ${mensajeError(e)}`); }
    }
    cerrarVentana(); await catRecargar();
    aviso(falla.length ? `Importadas ${ok}. No se pudieron ${falla.length}: ${falla[0]}` : `Importadas ${ok} partidas como borrador. Revísalas y publícalas.`, falla.length > 0);
  };
}

// ---------------- Consultas de proveedores -----------------
async function catConsultas(cont) {
  let l; try { l = await rpc('panel_cat_contactos'); } catch (e) { cont.innerHTML = `<div class="panel" style="padding:14px 18px">${esc(mensajeError(e))}</div>`; return; }
  cont.innerHTML = `<div class="panel"><div style="padding:14px 18px 0"><b>Consultas de proveedores</b><p class="suave">Escriben desde la app sobre una partida del catálogo. No se envía ningún correo: las ves aquí.</p></div><div id="cat-cons"></div></div>`;
  $('#cat-cons').innerHTML = htmlTabla('cat-cons', [
    { t: 'Empresa / persona', f: (x) => `<b>${esc(x.empresa || '—')}</b><span class="sub">${esc(x.persona || '')}${x.telefono ? ' · ' + esc(x.telefono) : ''}</span>` },
    { t: 'Partida', f: (x) => esc(x.partida || '—') },
    { t: 'Mensaje', f: (x) => esc(x.mensaje) },
    { t: 'Fecha', f: (x) => fechaHora(x.creado), s: (x) => x.creado },
    { t: 'Estado', f: (x) => `<span class="e ${x.estado === 'nuevo' ? 'aviso' : 'ok'}">${x.estado === 'nuevo' ? 'Nueva' : 'Atendida'}</span>` },
    { t: '', cls: 'acc', f: (x) => x.estado === 'nuevo' ? `<button class="btn peq" data-cons="${esc(x.id)}">Marcar atendida</button>` : '' },
  ], l, 'Todavía no hay consultas.');
  cont.onclick = async (ev) => { const b = ev.target.closest('[data-cons]'); if (!b) return; b.disabled = true;
    try { await rpc('panel_cat_contacto_atender', { p_id: b.dataset.cons }); aviso('Marcada como atendida.'); await catConsultas(cont); } catch (e) { aviso(mensajeError(e), true); b.disabled = false; } };
}