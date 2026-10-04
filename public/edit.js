// Document editor: form on the left, live Paged.js preview on the right.
const $ = (s, r = document) => r.querySelector(s);
const id = Number(new URLSearchParams(location.search).get('id'));
let doc = null, clients = [], clientDirty = false;
let saveTimer, previewTimer, saving = false, pendingSave = false, previewScroll = 0;

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const api = async (url, method = 'GET', body) => {
  const r = await fetch(url, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body && JSON.stringify(body) });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
};

// Stable ids for blocks, rows and photos: lets history match items even when they are moved or edited
const uid = () => Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => b.toString(16).padStart(2, '0')).join('');

// ---- path helpers: "data.blocks.2.rows.0.title" ----
const parts = (p) => p.split('.');
const get = (p) => parts(p).reduce((o, k) => o?.[k], doc);
function set(p, v) {
  const ks = parts(p), last = ks.pop();
  const o = ks.reduce((o, k) => (o[k] ??= {}), doc);
  if (v === undefined) delete o[last]; else o[last] = v;
}

// ---- labels ----
// The editor UI is always English; German/English only appears in the generated document.
const NOTE_LABELS = { hinweis: 'Note', fazit: 'Conclusion', empfehlung: 'Recommendation' };
const SECTION_UI = { artist: 'Artist & work', condition: 'Condition assessment' };
// What each standard section prints as, per document language (shown as a hint only; the real text comes from the server)
const SECTIONS = { artist: { de: 'Zum Künstler und Werk', en: 'About the Artist and Work' }, condition: { de: 'Zustandsbeurteilung', en: 'Condition Assessment' } };
const BLOCK_NAMES = { prose: 'Text section', note: 'Note', measures: 'Treatment table', pagebreak: 'Page break' };

// ---- form builders ----
const input = (path, label, opts = {}) => `<label class="field">${label}<input data-path="${path}" ${opts.type ? `type="${opts.type}" data-num="1" step="${opts.step ?? 'any'}"` : ''} value="${esc(get(path))}" ${opts.ph ? `placeholder="${esc(opts.ph)}"` : ''}></label>`;
const area = (path, label, rows = 3) => `<label class="field">${label}<textarea data-path="${path}" rows="${rows}">${esc(get(path))}</textarea></label>`;
const btn = (act, attrs, text, cls = 'mini') => `<button type="button" class="${cls}" data-act="${act}" ${attrs}>${text}</button>`;
const mover = (arr, i) => '<span class="movers">' + btn('move', `data-arr="${arr}" data-i="${i}" data-dir="-1"`, '↑') + btn('move', `data-arr="${arr}" data-i="${i}" data-dir="1"`, '↓') + btn('del', `data-arr="${arr}" data-i="${i}"`, '✕', 'mini danger') + '</span>';

function thumb(path, img, arr, i) {
  return `<div class="thumb"><img src="/img/${img.imageId}" alt=""><input data-path="${path}.caption" value="${esc(img.caption)}" placeholder="Caption">
    ${btn('del', `data-arr="${arr}" data-i="${i}"`, 'remove', 'mini danger')}</div>`;
}

function rowHtml(bp, r, i, n) {
  const p = `${bp}.rows.${i}`;
  return `<div class="row"><div class="row-head"><span class="n">${i + 1}</span>${mover(`${bp}.rows`, i, n)}</div>
    ${input(`${p}.title`, 'Title')}${area(`${p}.desc`, 'Description', 3)}
    <div class="hours">${input(`${p}.hoursMin`, 'Hours (min)', { type: 'number', step: 0.5 })}${input(`${p}.hoursMax`, 'Hours (max, optional)', { type: 'number', step: 0.5 })}</div>
    <div class="thumbs">${(r.images ?? []).map((im, k) => thumb(`${p}.images.${k}`, im, `${p}.images`, k)).join('')}
      <label class="drop">+ Photo<input type="file" accept="image/*" multiple hidden data-upload="row" data-arr="${p}.images"></label></div>
    ${btn('snip-save', `data-path="${p}"`, 'Save to library')}</div>`;
}

function blockHtml(b, i, n) {
  const p = `data.blocks.${i}`;
  let body = '';
  if (b.type === 'prose') {
    body = (b.headingKey
      ? `<p class="hint"><b>${SECTION_UI[b.headingKey]}</b> — printed as “${SECTIONS[b.headingKey][doc.lang]}” ${btn('custom-heading', `data-path="${p}"`, 'Custom heading')}</p>`
      : input(`${p}.heading`, 'Heading (optional)')) + b.paragraphs.map((_, k) => `<div class="para">${area(`${p}.paragraphs.${k}`, `Paragraph ${k + 1}`, 4)}${btn('del', `data-arr="${p}.paragraphs" data-i="${k}"`, 'remove paragraph', 'mini danger')}</div>`).join('')
      + btn('add-para', `data-arr="${p}.paragraphs"`, '+ Paragraph');
  } else if (b.type === 'note') {
    body = `<label class="field">Label<select data-path="${p}.label">${Object.entries(NOTE_LABELS).map(([k, v]) => `<option value="${k}" ${b.label === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>` + area(`${p}.html`, 'Text', 4);
  } else if (b.type === 'measures') {
    body = `<label class="field">Kind<select data-path="${p}.kind"><option value="main" ${b.kind === 'main' ? 'selected' : ''}>Proposed (numbered, counted in the cost)</option><option value="optional" ${b.kind === 'optional' ? 'selected' : ''}>Optional (added separately)</option></select></label>`
      + b.rows.map((r, k) => rowHtml(p, r, k, b.rows.length)).join('') + `<div class="addbar">${btn('add-row', `data-path="${p}"`, '+ Row')}${btn('lib-row', `data-path="${p}"`, '+ From library')}</div>`;
  } else if (b.type === 'pagebreak') {
    body = '<p class="hint">Content after this block starts on a new page.</p>';
  }
  return `<div class="block"><div class="block-head"><span class="type">${b.type === 'prose' ? `Text section — ${b.headingKey ? SECTION_UI[b.headingKey] : esc(b.heading || 'untitled')}` : BLOCK_NAMES[b.type]}${b.type === 'measures' ? ` — ${b.kind}` : ''}</span>${mover('data.blocks', i, n)}</div>${body}</div>`;
}

function formHtml() {
  const d = doc.data, ov = d.overview;
  const clientOpts = clients.map((c) => `<option value="${c.id}" ${c.id === doc.clientId ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  return `
  <fieldset><legend>Document</legend>
    ${input('title', 'Title (shown in the list)', { ph: doc.artwork[0]?.v })}
    <div class="grid2">${input('data.meta.date', 'Date', { type: 'date' })}${input('data.meta.validUntil', 'Valid until', { type: 'date' })}</div>
    <div class="grid2">${input('data.rate', 'Hourly rate (CHF)', { type: 'number' })}<span></span></div>
  </fieldset>

  <fieldset><legend>Object</legend>
    ${doc.artwork.map((a, i) => `<div class="kv-row"><input data-path="artwork.${i}.k" value="${esc(a.k)}"><input data-path="artwork.${i}.v" value="${esc(a.v)}" placeholder="…">${mover('artwork', i)}</div>`).join('')}
    ${btn('add-kv', '', '+ Line')}
    <p class="hint">Type "(?)" for details you still need to confirm.</p>
  </fieldset>

  <fieldset><legend>Client</legend>
    <label class="field">Client<select id="clientSel"><option value="">— none —</option>${clientOpts}<option value="__new">+ New client…</option></select></label>
    ${doc.client ? `<div class="grid2">${input('client.name', 'Name')}${input('client.contact', 'Contact')}</div>${input('client.address', 'Address')}<div class="grid2">${input('client.phone', 'Phone')}${input('client.email', 'E-mail')}</div>
    <p class="hint">Changes here update the client record for all its documents.</p>` : ''}
  </fieldset>

  <fieldset><legend>Overview photo</legend>
    ${ov ? `<div class="thumbs"><div class="thumb"><img src="/img/${ov.imageId}" alt=""></div></div><label class="field">Layout<select data-path="data.overview.layout">${[['auto', 'Automatic (by photo shape)'], ['landscape', 'Landscape (wide)'], ['portrait', 'Portrait (tall, narrower)']].map(([v, l]) => `<option value="${v}" ${(ov.layout ?? 'auto') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>${input('data.overview.caption', 'Caption')}${input('data.overview.note', 'Note under caption (optional)')}${btn('del-overview', '', 'Remove photo', 'mini danger')}`
        : `<label class="drop">+ Overview photo<input type="file" accept="image/*" hidden data-upload="overview"></label>`}
  </fieldset>

  <fieldset><legend>Content</legend>
    ${d.blocks.map((b, i) => blockHtml(b, i, d.blocks.length)).join('')}
    <div class="addbar">${btn('add-section', 'data-section="artist"', `+ ${SECTION_UI.artist} section`)}${btn('add-section', 'data-section="condition"', `+ ${SECTION_UI.condition} section`)}${btn('add-block', 'data-type="prose"', '+ Other text section')}${btn('add-block', 'data-type="note"', '+ Note')}${btn('add-block', 'data-type="measures" data-kind="main"', '+ Treatment table')}${btn('add-block', 'data-type="measures" data-kind="optional"', '+ Optional table')}${btn('add-block', 'data-type="pagebreak"', '+ Page break')}${btn('lib-artist', '', '+ Artist bio from library')}</div>
  </fieldset>

  <fieldset><legend>Cost summary</legend>
    <p class="hint">Hours, rate and CHF are calculated from the tables. Dates can be an ISO date (2026-10-29) or free text ("Mitte November 2026").</p>
    <div class="grid2">${input('data.cost.deliveryFrom', 'Delivery possible from')}${input('data.cost.pickupFrom', 'Pickup expected from')}</div>
    ${d.blocks.some((b) => b.type === 'measures' && b.kind === 'optional') ? input('data.cost.optionalDetail', 'Optional treatment — detail in brackets (optional)', { ph: doc.lang === 'de' ? 'Firnisreduzierung bzw. -abnahme sowie Neuauftrag eines Firnisses' : 'varnish removal and re-varnishing' }) : ''}
    <label class="check"><input type="checkbox" data-path="data.cost.materials" ${d.cost.materials ? 'checked' : ''}> Materials billed separately</label>
    <label class="check"><input type="checkbox" id="overrideToggle" ${d.cost.overrideHtml != null ? 'checked' : ''}> Edit text manually</label>
    ${d.cost.overrideHtml != null ? `<p class="hint warn">Manual text: hours and CHF figures in it do <b>not</b> update when the tables change. Untick "Edit manually" to go back to the calculated text.</p>` + area('data.cost.overrideHtml', 'Cost summary text', 8) : ''}
  </fieldset>`;
}

function renderForm() {
  const f = $('#form'), top = f.scrollTop;
  f.innerHTML = formHtml();
  f.scrollTop = top;
  $('#hNumber').textContent = doc.number;
  $('#hLang').textContent = doc.lang.toUpperCase();
  $('#printLink').href = `/documents/${doc.id}/print`;
  $('#htmlLink').href = `/documents/${doc.id}/standalone.html`;
}

// ---- change tracking ----
function dirty({ client = false, structural = false } = {}) {
  if (client) clientDirty = true;
  if (structural) renderForm();
  setState('Unsaved changes…');
  clearTimeout(saveTimer); saveTimer = setTimeout(save, 1200);
  clearTimeout(previewTimer); previewTimer = setTimeout(preview, 700);
}
const setState = (t) => ($('#saveState').textContent = t);

async function save() {
  if (saving) { pendingSave = true; return; }
  saving = true; setState('Saving…');
  try {
    if (!doc.title && doc.artwork[0]?.v) doc.title = doc.artwork[0].v;
    if (clientDirty && doc.client?.id) { await api(`/api/clients/${doc.client.id}`, 'PUT', doc.client); clientDirty = false; }
    await api(`/api/documents/${id}`, 'PUT', { title: doc.title, status: doc.status, clientId: doc.clientId, artwork: doc.artwork, data: doc.data });
    setState('Saved ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
  } catch (e) { setState('Save failed: ' + e.message); }
  saving = false;
  if (pendingSave) { pendingSave = false; save(); }
}

// ---- preview ----
// Each render goes into a fresh hidden iframe that replaces the visible one once Paged.js has finished
// (no flicker, and Paged.js always starts from a clean browsing context).
const host = $('.preview-host');
let frame = $('#preview'), nextFrame = null, previewSeq = 0;
const zoomFor = () => Math.min(1, host.clientWidth / 850);

async function preview() {
  const seq = ++previewSeq;
  $('#previewState').textContent = 'Rendering…';
  const r = await fetch('/api/documents/render', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: doc.type, number: doc.number, lang: doc.lang, client: doc.client ?? {}, artwork: doc.artwork, data: doc.data }) });
  const html = await r.text();
  if (seq !== previewSeq) return;               // a newer render superseded this one
  nextFrame?.remove();
  nextFrame = document.createElement('iframe');
  nextFrame.title = 'Preview';
  nextFrame.style.cssText = 'position:absolute;top:0;left:0;visibility:hidden;width:850px;height:3000px';
  nextFrame.srcdoc = html;
  host.append(nextFrame);
}

addEventListener('message', async (e) => {
  if (!e.data?.pagedDone || e.source !== nextFrame?.contentWindow) return;
  const nf = nextFrame; nextFrame = null;
  // Paged.js signals "done" just before the pages are attached: wait until they exist
  for (let i = 0; i < 60 && !nf.contentDocument.querySelector('.pagedjs_page'); i++) await new Promise((r) => setTimeout(r, 50));
  const scroll = host.scrollTop;
  // Never move an iframe in the DOM (that reloads it): size it in place, reveal it, drop the old one.
  nf.style.height = (nf.contentDocument.documentElement.scrollHeight + 20) + 'px';
  nf.style.zoom = zoomFor();
  nf.style.visibility = 'visible';
  frame.remove(); frame = nf; frame.id = 'preview';
  host.scrollTop = scroll;
  $('#previewState').textContent = `${nf.contentDocument.querySelectorAll('.pagedjs_page').length} pages`;
});
addEventListener('resize', () => { frame.style.zoom = zoomFor(); });

// ---- events ----
$('#form').addEventListener('input', (e) => {
  const el = e.target; const p = el.dataset.path; if (!p) return;
  let v = el.type === 'checkbox' ? el.checked : el.value;
  if (el.dataset.num) v = v === '' ? undefined : Number(v);
  else if (el.type !== 'checkbox' && v === '' && /\.(heading|note|deliveryFrom|pickupFrom)$/.test(p)) v = undefined;
  set(p, v);
  dirty({ client: p.startsWith('client.') });
});

$('#form').addEventListener('change', async (e) => {
  const el = e.target;
  if (el.id === 'clientSel') {
    if (el.value === '__new') {
      const name = prompt('Client name?'); if (!name) return renderForm();
      const r = await api('/api/clients', 'POST', { name });
      clients = await api('/api/clients'); doc.clientId = r.id; doc.client = clients.find((c) => c.id === r.id);
    } else { doc.clientId = el.value ? Number(el.value) : null; doc.client = clients.find((c) => c.id === doc.clientId) ?? null; }
    return dirty({ structural: true });
  }
  if (el.id === 'overrideToggle') {
    if (el.checked) doc.data.cost.overrideHtml = (await api('/api/documents/cost-text', 'POST', { type: doc.type, lang: doc.lang, data: doc.data })).html;
    else delete doc.data.cost.overrideHtml;
    return dirty({ structural: true });
  }
  if (el.dataset.upload) {
    for (const file of el.files) {
      setState('Uploading photo…');
      const imageId = await uploadImage(file);
      if (el.dataset.upload === 'overview') doc.data.overview = { imageId, caption: doc.lang === 'de' ? 'Gesamtansicht vor der Behandlung' : 'Overall view before treatment' };
      else (get(el.dataset.arr) ?? (set(el.dataset.arr, []), get(el.dataset.arr))).push({ id: uid(), imageId, caption: '' });
    }
    dirty({ structural: true });
  }
});

$('#form').addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const { act, arr, i, dir, type, kind, path, section } = b.dataset;
  const idx = Number(i);
  if (act === 'del') { get(arr).splice(idx, 1); }
  else if (act === 'move') { const a = get(arr), j = idx + Number(dir); if (j < 0 || j >= a.length) return; [a[idx], a[j]] = [a[j], a[idx]]; }
  else if (act === 'add-kv') { doc.artwork.push({ k: '', v: '' }); }
  else if (act === 'add-para') { get(arr).push(''); }
  else if (act === 'add-row') { get(`${path}.rows`).push({ id: uid(), title: '', desc: '', hoursMin: 1 }); }
  else if (act === 'add-section') { insertBeforeTable({ id: uid(), type: 'prose', headingKey: section, paragraphs: [''] }); }
  else if (act === 'custom-heading') { const blk = get(path); blk.heading = SECTIONS[blk.headingKey][doc.lang]; delete blk.headingKey; }
  else if (act === 'add-block') {
    const blk = { prose: { type: 'prose', paragraphs: [''] }, note: { type: 'note', label: 'hinweis', html: '' },
      measures: { type: 'measures', kind, rows: [{ id: uid(), title: '', desc: '', hoursMin: 1 }] }, pagebreak: { type: 'pagebreak' } }[type];
    blk.id = uid();
    // text sections and notes belong ahead of the first treatment table; tables and page breaks go at the end
    if (type === 'prose') insertBeforeTable(blk); else doc.data.blocks.push(blk);
  }
  else if (act === 'del-overview') { delete doc.data.overview; }
  else if (act === 'lib-row') { return openLibrary('measure', (v) => { get(`${path}.rows`).push({ id: uid(), title: v.title, desc: v.desc ?? '', hoursMin: v.hoursMin ?? 1, ...(v.hoursMax != null ? { hoursMax: v.hoursMax } : {}) }); dirty({ structural: true }); }); }
  else if (act === 'lib-artist') { return openLibrary('artist', (v) => { const sec = doc.data.blocks.find((b) => b.type === 'prose' && b.headingKey === 'artist');
    if (sec) { if (sec.paragraphs.every((p) => !p.trim())) sec.paragraphs = [v.text]; else sec.paragraphs.unshift(v.text); }
    else insertBeforeTable({ id: uid(), type: 'prose', headingKey: 'artist', paragraphs: [v.text] });
    dirty({ structural: true }); }); }
  else if (act === 'snip-save') { return saveRowToLibrary(get(path)); }
  dirty({ structural: true });
});

$('#status').addEventListener('change', (e) => { doc.status = e.target.value; dirty(); });

$('#versionBtn').addEventListener('click', async () => {
  const note = prompt('Name this version (optional):', ''); if (note === null) return;
  await save();
  await api(`/api/documents/${id}/versions`, 'POST', { note });
  setState('Version saved');
});

// ---- image upload: resize in the browser (originals stay in Google Drive) ----
async function uploadImage(file, maxEdge = 1600, quality = 0.82) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
  const cv = Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(bmp, 0, 0, w, h);
  const blob = await new Promise((res) => cv.toBlob(res, 'image/jpeg', quality));
  const r = await fetch(`/api/images?documentId=${id}&w=${w}&h=${h}`, { method: 'POST', headers: { 'content-type': 'image/jpeg' }, body: blob });
  if (!r.ok) throw new Error(await r.text());
  return (await r.json()).id;
}

// Text sections go before the first "proposed" treatment table (where Zustandsbeurteilung etc. belong)
function insertBeforeTable(block) {
  const bl = doc.data.blocks, at = bl.findIndex((b) => b.type === 'measures' && b.kind === 'main');
  bl.splice(at < 0 ? bl.length : at, 0, block);
}

// ---- version history ----
const histDlg = $('#histDlg');
const TAG = { changed: 'changed', restored: 'brought back', removed: 'removed', moved: 'moved' };

/** What restoring `snap` would change relative to the current editor state (block-aware, see diff.js). */
function diffAgainstCurrent(snap) {
  const cur = { title: doc.title, status: doc.status, artwork: doc.artwork, data: doc.data };
  return DocDiff.diffDocs(cur, snap).map((it) => `<li><span class="tag ${it.tag}">${TAG[it.tag]}</span><span class="where">${esc(it.where)}</span><div class="what">${it.html}</div></li>`);
}

// timestamps are stored in UTC; show them in the viewer's local time
const when = (t) => new Date(t.replace(' ', 'T') + 'Z').toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
const KIND_LABEL = { manual: 'saved', auto: 'auto', status: 'status', restore: 'restore' };
async function openHistory() {
  await save();                                   // make sure the stored state is what's on screen
  const list = await api(`/api/documents/${id}/versions`);
  $('#histList').innerHTML = list.length ? list.map((v) => `<button type="button" class="hist-item" data-vid="${v.id}">
      <span class="kind ${v.kind}">${KIND_LABEL[v.kind] ?? v.kind}</span>${esc(when(v.created_at))}<small>${esc(v.note ?? '')}</small></button>`).join('') : '<p class="muted">No versions yet. Press “Save version” to create the first one.</p>';
  $('#histDetail').innerHTML = '<p class="muted">Select a version to see what restoring it would change.</p>';
  histDlg.showModal();
}
let histSel = null, histTab = 'changes';

/** Render a document state into a scaled, Paged.js-paginated iframe inside `container` (same pipeline as the live preview). */
async function mountPreview(container, payload) {
  const html = await (await fetch('/api/documents/render', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })).text();
  const f = document.createElement('iframe');
  f.title = 'Preview';
  f.style.cssText = 'position:absolute;top:0;left:0;width:850px;height:3000px;border:0;visibility:hidden';
  container.replaceChildren(f);
  await new Promise((res) => {
    const h = (e) => { if (e.source === f.contentWindow && e.data?.pagedDone) { removeEventListener('message', h); res(); } };
    addEventListener('message', h);
    f.srcdoc = html;
  });
  for (let i = 0; i < 60 && f.isConnected && !f.contentDocument.querySelector('.pagedjs_page'); i++) await new Promise((r) => setTimeout(r, 50));
  if (!f.isConnected) return null;               // the user switched tab/version while this was rendering
  f.style.zoom = Math.min(1, container.clientWidth / 850);
  f.style.height = (f.contentDocument.documentElement.scrollHeight + 20) + 'px';
  f.style.visibility = 'visible';
  return f;
}

const statePayload = (st, withClient) => ({ type: doc.type, number: doc.number, lang: doc.lang, clientId: st.clientId ?? doc.clientId,
  ...(withClient ? { client: doc.client ?? {} } : {}), artwork: st.artwork ?? doc.artwork, data: st.data });

async function startSideBySide() {
  const A = $('#sbsA'), B = $('#sbsB'), snap = histSel.v.snapshot;
  A.textContent = B.textContent = 'Rendering…';
  const [fa, fb] = await Promise.all([mountPreview(A, statePayload(doc, true)), mountPreview(B, statePayload(snap, false))]);
  if (!fa || !fb) return;
  const pages = (f) => f.contentDocument.querySelectorAll('.pagedjs_page').length;
  $('#sbsLabelA').textContent = `Now — ${pages(fa)} page${pages(fa) === 1 ? '' : 's'}`;
  $('#sbsLabelB').textContent = `${when(histSel.v.createdAt)} — ${pages(fb)} page${pages(fb) === 1 ? '' : 's'}`;
  let lock = false;                               // linked scrolling (proportional, since page counts can differ)
  const link = (from, to) => from.addEventListener('scroll', () => {
    if (lock) return; lock = true;
    to.scrollTop = (from.scrollTop / Math.max(1, from.scrollHeight - from.clientHeight)) * (to.scrollHeight - to.clientHeight);
    requestAnimationFrame(() => { lock = false; });
  });
  link(A, B); link(B, A);
}

function renderHistDetail() {
  const { v, vid } = histSel, rows = diffAgainstCurrent(v.snapshot), title = `${esc(when(v.createdAt))} ${v.note ? '— ' + esc(v.note) : ''}`;
  const tabs = [['changes', `Changes (${rows.length})`], ['side', 'Side by side']].map(([k, l]) => `<button type="button" data-tab="${k}" class="${histTab === k ? 'on' : ''}">${l}</button>`).join('');
  const body = histTab === 'side'
    ? `<div class="sbs"><div class="sbs-col"><div class="sbs-label" id="sbsLabelA">Now</div><div class="sbs-pane" id="sbsA"></div></div>
        <div class="sbs-col"><div class="sbs-label" id="sbsLabelB">${esc(when(v.createdAt))}</div><div class="sbs-pane" id="sbsB"></div></div></div>`
    : rows.length ? `<p class="hint">Restoring this version would make ${rows.length} change${rows.length > 1 ? 's' : ''}. <del>Red</del> is what you have now and would disappear; <ins>green</ins> is what would appear.</p><ul class="diff">${rows.slice(0, 60).join('')}</ul>${rows.length > 60 ? `<p class="muted">…and ${rows.length - 60} more</p>` : ''}`
      : '<p class="hint">Identical to the current state.</p>';
  $('#histDetail').innerHTML = `<div class="hist-head"><h3>${title}</h3><div class="tabs2">${tabs}</div></div><div class="hist-body">${body}</div>
    <div class="hist-foot"><button type="button" class="primary" id="restoreBtn" ${rows.length ? '' : 'disabled'}>Restore this version</button>
    <span class="hint"> Your current state is saved as a version first, so you can undo a restore.</span></div>`;
  histDlg.classList.toggle('wide', histTab === 'side');
  $('#restoreBtn').onclick = async () => {
    if (!confirm('Restore this version? The current state will be saved to the history first.')) return;
    await api(`/api/documents/${id}/versions/${vid}/restore`, 'POST');
    location.reload();
  };
  if (histTab === 'side') startSideBySide();
}

$('#histList').addEventListener('click', async (e) => {
  const b = e.target.closest('.hist-item'); if (!b) return;
  document.querySelectorAll('.hist-item').forEach((x) => x.classList.toggle('on', x === b));
  histSel = { vid: b.dataset.vid, v: await api(`/api/documents/${id}/versions/${b.dataset.vid}`) };
  renderHistDetail();
});
$('#histDetail').addEventListener('click', (e) => {
  const t = e.target.closest('[data-tab]'); if (!t || !histSel) return;
  histTab = t.dataset.tab; renderHistDetail();
});
histDlg.addEventListener('close', () => { histDlg.classList.remove('wide'); histSel = null; histTab = 'changes'; });
$('#historyBtn').addEventListener('click', openHistory);
$('#histClose').addEventListener('click', () => histDlg.close());

// ---- snippet library ----
const slug = (t) => t.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const libDlg = $('#libDlg');
async function openLibrary(kind, onPick) {
  const all = await api(`/api/snippets?kind=${kind}`);
  const lang = doc.lang, label = (v) => (kind === 'measure' ? v.title : v.name);
  const draw = () => {
    const q = $('#libSearch').value.toLowerCase();
    $('#libList').innerHTML = all.filter((s) => JSON.stringify([s.key, s.de, s.en]).toLowerCase().includes(q)).map((s) => {
      const v = s[lang] ?? {}, ok = !!label(v);
      const hrs = kind === 'measure' && ok ? ` · ${v.hoursMin}${v.hoursMax != null ? '–' + v.hoursMax : ''} h` : '';
      return `<button type="button" class="lib-item" data-id="${s.id}" ${ok ? '' : 'disabled'}>${esc(ok ? label(v) : s.key)}${hrs}${s.needsReview ? '<span class="rv">needs review</span>' : ''}
        <small>${ok ? esc((kind === 'measure' ? v.desc : v.text) ?? '').slice(0, 140) : `no ${lang.toUpperCase()} version yet — add it on the Snippets page`}</small></button>`;
    }).join('') || '<p class="muted">No snippets found.</p>';
  };
  $('#libTitle').textContent = kind === 'measure' ? `Insert treatment row (${lang.toUpperCase()})` : `Insert artist bio (${lang.toUpperCase()})`;
  $('#libSearch').value = ''; draw();
  $('#libSearch').oninput = draw;
  $('#libList').onclick = (e) => { const b = e.target.closest('.lib-item'); if (!b) return; libDlg.close(); onPick(all.find((s) => s.id === Number(b.dataset.id))[lang]); };
  libDlg.showModal();
}
$('#libClose').addEventListener('click', () => libDlg.close());

async function saveRowToLibrary(row) {
  if (!row.title) return alert('Give the row a title first.');
  const key = slug(row.title);
  const v = { title: row.title, desc: row.desc, hoursMin: row.hoursMin, ...(row.hoursMax != null ? { hoursMax: row.hoursMax } : {}) };
  await api('/api/snippets', 'POST', { kind: 'measure', key, [doc.lang]: v, needsReview: true });
  setState(`Saved "${row.title}" to the library (${doc.lang.toUpperCase()}) — add the other language on the Snippets page`);
}

// ---- boot ----
(async () => {
  [doc, clients] = await Promise.all([api(`/api/documents/${id}`), api('/api/clients')]);
  const types = await api('/api/doctypes');
  const st = types.find((t) => t.id === doc.type).statuses;
  $('#status').innerHTML = st.map((s) => `<option ${s === doc.status ? 'selected' : ''}>${s}</option>`).join('');
  document.title = `${doc.number} — Snape Docs`;
  renderForm(); preview();
})();
