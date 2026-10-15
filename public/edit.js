// Document editor: form on the left, live page-layout preview (Vivliostyle) on the right.
const $ = (s, r = document) => r.querySelector(s);
const id = Number(new URLSearchParams(location.search).get('id'));
let doc = null, clients = [], appSettings = { signaturePlace: 'Wollerau', signatureImageId: null }, clientDirty = false;
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
const BLOCK_NAMES = { prose: 'Text section', note: 'Note', measures: 'Treatment table', objects: 'Object list', pagebreak: 'Page break' };

// ---- form builders ----
const input = (path, label, opts = {}) => `<label class="field">${label}<input data-path="${path}" lang="${doc.lang}" spellcheck="true" ${opts.type ? `type="${opts.type}"${opts.type === 'number' ? ` data-num="1" step="${opts.step ?? 'any'}"` : ''}` : ''} value="${esc(get(path))}" ${opts.ph ? `placeholder="${esc(opts.ph)}"` : ''}></label>`;
const area = (path, label, rows = 3) => `<label class="field">${label}<textarea data-path="${path}" lang="${doc.lang}" spellcheck="true" rows="${rows}">${esc(get(path))}</textarea></label>`;
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

function objectRowHtml(bp, r, i, n) {
  const p = `${bp}.rows.${i}`;
  return `<div class="orow"><div class="ophoto">${r.imageId != null ? `<img src="/img/${r.imageId}" alt="">` : '<span class="hint">no photo</span>'}
      <label class="drop">${r.imageId != null ? 'Replace' : '+ Photo'}<input type="file" accept="image/*" hidden data-upload="objphoto" data-target="${p}"></label>${mover(`${bp}.rows`, i, n)}</div>
    <div class="ofields"><div class="ogrid">${input(`${p}.no`, 'No.')}${input(`${p}.title`, 'Title / motif')}${input(`${p}.technique`, 'Technique / support')}${input(`${p}.size`, 'Size (H × W)', { ph: '?' })}
      ${input(`${p}.hoursMin`, 'Hours (min)', { type: 'number', step: 0.5 })}${input(`${p}.hoursMax`, 'Hours (max)', { type: 'number', step: 0.5 })}</div>
      ${area(`${p}.text`, 'Assessment of this object (empty = shared text above)', 2)}</div></div>`;
}

function blockHtml(b, i, n) {
  const p = `data.blocks.${i}`;
  let body = '';
  if (b.type === 'prose') {
    body = (b.headingKey
      ? `<p class="hint"><b>${SECTION_UI[b.headingKey]}</b> — printed as “${SECTIONS[b.headingKey][doc.lang]}” ${btn('custom-heading', `data-path="${p}"`, 'Custom heading')}</p>`
      : input(`${p}.heading`, 'Heading (optional)')) + b.paragraphs.map((_, k) => `<div class="para">${area(`${p}.paragraphs.${k}`, `Paragraph ${k + 1}`, 4)}${btn('del', `data-arr="${p}.paragraphs" data-i="${k}"`, 'remove paragraph', 'mini danger')}</div>`).join('')
      + btn('add-para', `data-arr="${p}.paragraphs"`, '+ Paragraph')
      + `<label class="field">Bullet points (optional, one per line)<textarea data-path="${p}.bullets" data-lines="1" rows="4">${esc((b.bullets ?? []).join('\n'))}</textarea></label>`;
  } else if (b.type === 'note') {
    body = `<label class="field">Label<select data-path="${p}.label">${Object.entries(NOTE_LABELS).map(([k, v]) => `<option value="${k}" ${b.label === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>` + area(`${p}.html`, 'Text', 4);
  } else if (b.type === 'objects') {
    body = input(`${p}.heading`, 'Heading (empty = standard)') + area(`${p}.defaultText`, 'Assessment text shared by all objects (a row can have its own)', 4)
      + `<div class="bulk"><label class="drop">+ Photos (one row per photo, by file name)<input type="file" accept="image/*" multiple hidden data-upload="objects" data-target="${p}"></label>
         <span class="hint">Hours for all rows:</span><input type="number" step="0.5" id="bulkMin${i}" placeholder="min"><input type="number" step="0.5" id="bulkMax${i}" placeholder="max (optional)">${btn('apply-hours', `data-path="${p}" data-i="${i}"`, 'Apply to all')}</div>`
      + `<p class="hint">${b.rows.length} object${b.rows.length === 1 ? '' : 's'}</p>`
      + b.rows.map((r, k) => objectRowHtml(p, r, k, b.rows.length)).join('') + `<div class="addbar">${btn('add-object', `data-path="${p}"`, '+ Object')}</div>`;
  } else if (b.type === 'measures') {
    body = (b.kind === 'main' ? input(`${p}.option`, 'Option label (only if the client chooses between tables, e.g. “Option A”)') + (b.option ? `<label class="check"><input type="checkbox" data-path="${p}.common" ${b.common ? 'checked' : ''}> Needed in every option (added to each option’s total, not an alternative)</label>` : '') : '') + `<label class="field">Kind<select data-path="${p}.kind"><option value="main" ${b.kind === 'main' ? 'selected' : ''}>Proposed (numbered, counted in the cost)</option><option value="optional" ${b.kind === 'optional' ? 'selected' : ''}>Optional (added separately)</option></select></label>`
      + b.rows.map((r, k) => rowHtml(p, r, k, b.rows.length)).join('') + `<div class="addbar">${btn('add-row', `data-path="${p}"`, '+ Row')}${btn('lib-row', `data-path="${p}"`, '+ From library')}</div>`;
  } else if (b.type === 'pagebreak') {
    body = '<p class="hint">Content after this block starts on a new page.</p>';
  }
  return `<div class="block" data-bp="${p}"><div class="block-head"><span class="type">${b.type === 'prose' ? `Text section — ${b.headingKey ? SECTION_UI[b.headingKey] : esc(b.heading || 'untitled')}` : BLOCK_NAMES[b.type]}${b.type === 'measures' ? ` — ${b.kind}` : ''}</span>${mover('data.blocks', i, n)}</div>${body}</div>`;
}

// ---- private notes: a small rich-text field whose content is never printed ----
const cleanNotes = (html) => DocNotes.clean(html);               // see notes.js (unit tested)

function formHtml() {
  const d = doc.data, ov = d.overview;
  const clientOpts = clients.map((c) => `<option value="${c.id}" ${c.id === doc.clientId ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  return `
  <fieldset class="notes"><legend>Private notes — never printed</legend>
    <div class="rt-bar">${[['bold', '<b>B</b>'], ['italic', '<i>I</i>'], ['insertUnorderedList', '• List'], ['insertOrderedList', '1. List']].map(([c, t]) => `<button type="button" class="mini" data-cmd="${c}">${t}</button>`).join('')}</div>
    <div class="rt" id="notes" contenteditable="true" data-placeholder="Notes for yourself about this offer (not printed, not in the PDF)…">${cleanNotes(d.privateNotes)}</div>
  </fieldset>

  <fieldset><legend>Document</legend>
    ${input('title', 'Title (shown in the list)', { ph: doc.artwork[0]?.v })}
    <div class="grid2">${input('data.meta.date', 'Date', { type: 'date' })}${input('data.meta.validUntil', 'Valid until', { type: 'date' })}</div>
    <label class="check"><input type="checkbox" data-path="data.meta.dateAuto" ${d.meta.dateAuto ? 'checked' : ''}> Use today’s date while this offer is a draft (the date is fixed once it is marked as sent)</label>
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
    <div class="addbar">${btn('add-section', 'data-section="artist"', `+ ${SECTION_UI.artist} section`)}${btn('add-section', 'data-section="condition"', `+ ${SECTION_UI.condition} section`)}${btn('add-block', 'data-type="prose"', '+ Other text section')}${btn('add-block', 'data-type="note"', '+ Note')}${btn('add-block', 'data-type="measures" data-kind="main"', '+ Treatment table')}${btn('add-block', 'data-type="measures" data-kind="optional"', '+ Optional table')}${btn('add-block', 'data-type="objects"', '+ Object list')}${btn('add-block', 'data-type="pagebreak"', '+ Page break')}${btn('lib-artist', '', '+ Artist bio from library')}</div>
  </fieldset>

  <fieldset data-bp="#cost"><legend>Cost summary</legend>
    <p class="hint">Hours, rate and CHF are calculated from the tables. Dates can be an ISO date (2026-10-29) or free text ("Mitte November 2026").</p>
    <div class="grid2">${input('data.cost.deliveryFrom', 'Delivery possible from')}${input('data.cost.pickupFrom', 'Pickup expected from')}</div>
    ${d.blocks.some((b) => b.type === 'measures' && b.kind === 'optional') ? input('data.cost.optionalDetail', 'Optional treatment — detail in brackets (optional)', { ph: doc.lang === 'de' ? 'Firnisreduzierung bzw. -abnahme sowie Neuauftrag eines Firnisses' : 'varnish removal and re-varnishing' }) : ''}
    <label class="field">Layout<select data-path="data.cost.style"><option value="text" ${d.cost.style !== 'lines' ? 'selected' : ''}>One sentence</option><option value="lines" ${d.cost.style === 'lines' ? 'selected' : ''}>Lines: rate, effort, labour costs (+ text below)</option></select></label>
    <label class="check"><input type="checkbox" data-path="data.cost.materials" ${d.cost.materials ? 'checked' : ''}> Materials billed separately</label>
    <label class="check"><input type="checkbox" id="overrideToggle" ${d.cost.overrideHtml != null ? 'checked' : ''}> Edit text manually</label>
    ${d.cost.overrideHtml != null ? `<p class="hint warn">Manual text: hours and CHF figures in it do <b>not</b> update when the tables change. Untick "Edit manually" to go back to the calculated text.</p>` + area('data.cost.overrideHtml', 'Cost summary text', 8) : ''}
  </fieldset>

  <fieldset data-bp="#sign"><legend>Signature</legend>
    <label class="check"><input type="checkbox" data-path="data.sign.enabled" ${d.sign?.enabled !== false ? 'checked' : ''}> Print my signature, place and date on the contractor line of the last page</label>
    ${input('data.sign.place', 'Place of signing (empty = default)', { ph: appSettings.signaturePlace })}
    <p class="hint">The date is the offer date (top of this form). ${appSettings.signatureImageId ? 'Your signature image comes from the Settings page.' : '<b>No signature image yet</b>: upload it on the <a href="/settings.html" target="_blank">Settings page</a>; until then only place and date are printed.'}</p>
  </fieldset>`;
}

function renderForm() {
  const f = $('#form'), top = f.scrollTop;
  f.innerHTML = formHtml();
  f.querySelectorAll('textarea, input:not([type]), input[type=text], input[type=search], input[type=email], input[type=tel]').forEach((e) => { e.lang = doc.lang; e.spellcheck = true; });   // the browser checks spelling in the offer's language
  f.scrollTop = top;
  $('#hNumber').textContent = doc.number;
  $('#hLang').textContent = doc.lang.toUpperCase();
  $('#printLink').href = `/documents/${doc.id}/print`;
  $('#htmlLink').href = `/documents/${doc.id}/standalone.html`;
}

// ---- change tracking ----
function dirty({ client = false, structural = false, quiet = false } = {}) {
  if (client) clientDirty = true;
  if (structural) renderForm();
  setState('Unsaved changes…');
  clearTimeout(saveTimer); saveTimer = setTimeout(save, 1200);
  if (quiet) return;                                  // e.g. private notes: they are not part of the printed document
  clearTimeout(previewTimer); previewTimer = setTimeout(preview, 700);
}
const setState = (t) => ($('#saveState').textContent = t);

let stale = false;     // another editor, script or agent saved this document after we read it
async function save() {
  if (stale) return;
  if (saving) { pendingSave = true; return; }
  saving = true; setState('Saving…');
  try {
    if (!doc.title && doc.artwork[0]?.v) doc.title = doc.artwork[0].v;
    if (clientDirty && doc.client?.id) { await api(`/api/clients/${doc.client.id}`, 'PUT', doc.client); clientDirty = false; }
    doc.rev = (await api(`/api/documents/${id}`, 'PUT', { title: doc.title, status: doc.status, clientId: doc.clientId, artwork: doc.artwork, data: doc.data, baseRev: doc.rev })).rev;
    setState('Saved ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
  } catch (e) {
    let j = {}; try { j = JSON.parse(e.message); } catch { /* not JSON */ }
    if (j.code === 'conflict') { stale = true; setState('Changed elsewhere: reload this page. Edits made here since are NOT saved.'); }
    else setState('Save failed: ' + (j.issues?.map((i) => `${i.path}: ${i.message}`).join('; ') || j.error || e.message));
  }
  saving = false;
  if (pendingSave) { pendingSave = false; save(); }
}

// ---- preview ----
// Each render goes into a fresh hidden iframe that replaces the visible one once the layout engine has finished
// (no flicker, and the engine always starts from a clean browsing context).
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
  // the host posts "done" when layout is complete; make sure the pages are in the DOM before measuring
  for (let i = 0; i < 60 && !nf.contentDocument.querySelector('[data-vivliostyle-page-container]'); i++) await new Promise((r) => setTimeout(r, 50));
  const scroll = host.scrollTop;
  // Never move an iframe in the DOM (that reloads it): size it in place, reveal it, drop the old one.
  nf.style.height = (nf.contentDocument.documentElement.scrollHeight + 20) + 'px';
  nf.style.zoom = zoomFor();
  nf.style.visibility = 'visible';
  frame.remove(); frame = nf; frame.id = 'preview';
  host.scrollTop = scroll;
  $('#previewState').textContent = `${nf.contentDocument.querySelectorAll('[data-vivliostyle-page-container]').length} pages`;
  nf.contentDocument.addEventListener('dblclick', (ev) => onPreviewDblClick(ev, nf.contentWindow));
});
addEventListener('resize', () => { frame.style.zoom = zoomFor(); });

// ---- double-click in the preview: jump to the field (and the word) in the form ----
function flash(el) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1600); }
function revealField(info) {
  const form = $('#form'), q = (a, v) => form.querySelector(`[${a}="${v.replace(/"/g, '\\"')}"]`);
  const field = info.path.replace(/"/g, '\\"'), el = form.querySelector(`input[data-path="${field}"], textarea[data-path="${field}"], select[data-path="${field}"]`);   // fields only (a button may share a path)
  if (!el) {                                               // no field of its own (a heading, the calculated cost text…): show the block
    const box = q('data-bp', /^data\.blocks\.\d+/.exec(info.path)?.[0] ?? info.path);
    if (box) { box.scrollIntoView({ block: 'center', behavior: 'smooth' }); flash(box); }
    return;
  }
  const label = el.closest('label, .kv-row, .para') ?? el;
  label.scrollIntoView({ block: 'center' });
  const at = info.word ? DocLocate.locate(el.value, info.html, info.word, info.k, info.line) : null;
  if (at) el.setSelectionRange(at[0], at[1]);
  el.focus({ preventScroll: true });
  flash(label);
}
function onPreviewDblClick(e, win) {
  const el = e.target.closest?.('[data-src]');
  if (!el) return;
  const sel = win.getSelection();
  const word = sel.toString().trim().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
  let k = 0;
  if (word && sel.rangeCount) {                            // which occurrence of the word was it? (count the ones before it in this text)
    const r = sel.getRangeAt(0), pre = el.ownerDocument.createRange();
    pre.selectNodeContents(el);
    try { pre.setEnd(r.startContainer, r.startOffset); k = DocLocate.countWord(pre.toString(), word); } catch { k = 0; }
  }
  revealField({ path: el.dataset.src, html: el.dataset.srcHtml === '1', line: el.dataset.srcLine !== undefined ? Number(el.dataset.srcLine) : undefined, word, k });
}

// ---- events ----
$('#form').addEventListener('input', (e) => {
  const el = e.target; const p = el.dataset.path; if (!p || el.type === 'file') return;
  let v = el.type === 'checkbox' ? el.checked : el.value;
  if (el.dataset.lines) v = v === '' ? undefined : v.split('\n');
  else if (el.dataset.num) v = v === '' ? (/\.(hoursMin|rate)$/.test(p) ? 0 : undefined) : Number(v);   // an empty required number is 0, never missing
  else if (el.type !== 'checkbox' && v === '' && /\.(heading|note|deliveryFrom|pickupFrom)$/.test(p)) v = undefined;
  if (el.type === 'date' && !v) return;           // a half-typed or cleared date is not a date: keep the last good one
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
    const files = [...el.files];
    if (el.dataset.upload === 'objects') files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    for (const [k, file] of files.entries()) {
      setState(files.length > 1 ? `Uploading photo ${k + 1} of ${files.length}…` : 'Uploading photo…');
      const imageId = await uploadImage(file);
      if (el.dataset.upload === 'objphoto') get(el.dataset.target).imageId = imageId;
      else if (el.dataset.upload === 'objects') { const blk = get(el.dataset.target); blk.rows.push(newObject(blk, { imageId })); }
      else if (el.dataset.upload === 'overview') doc.data.overview = { imageId, caption: doc.lang === 'de' ? 'Gesamtansicht vor der Behandlung' : 'Overall view before treatment' };
      else (get(el.dataset.arr) ?? (set(el.dataset.arr, []), get(el.dataset.arr))).push({ id: uid(), imageId, caption: '' });
    }
    dirty({ structural: true });
  }
});

$('#form').addEventListener('input', (e) => {
  if (e.target.id !== 'notes') return;
  const html = cleanNotes(e.target.innerHTML);
  if (html) doc.data.privateNotes = html; else delete doc.data.privateNotes;
  dirty({ quiet: true });
});
$('#form').addEventListener('mousedown', (e) => {                          // keep the selection in the notes while a toolbar button is used
  const b = e.target.closest('[data-cmd]'); if (!b) return;
  e.preventDefault(); document.execCommand(b.dataset.cmd);
  if (/List$/.test(b.dataset.cmd)) {                                      // Chrome jumps the caret to the start of the line: put it back at the end
    const sel = getSelection(), at = sel.anchorNode?.nodeType === 1 ? sel.anchorNode : sel.anchorNode?.parentElement, line = at?.closest('li') ?? at;
    if (line && $('#notes').contains(line)) { const r = document.createRange(); r.selectNodeContents(line); r.collapse(false); sel.removeAllRanges(); sel.addRange(r); }
  }
  $('#notes').dispatchEvent(new Event('input', { bubbles: true }));
});
$('#form').addEventListener('paste', (e) => {                              // paste as plain text
  if (e.target.id !== 'notes') return;
  e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
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
  else if (act === 'add-object') { const blk = get(path); blk.rows.push(newObject(blk)); }
  else if (act === 'apply-hours') {
    const min = $(`#bulkMin${i}`).value, max = $(`#bulkMax${i}`).value;
    if (min === '') return alert('Enter at least the minimum hours.');
    if (!confirm(`Set ${min}${max ? '–' + max : ''} hours on all ${get(path).rows.length} objects? Existing hours on these rows are replaced.`)) return;
    for (const r of get(path).rows) { r.hoursMin = Number(min); if (max === '') delete r.hoursMax; else r.hoursMax = Number(max); }
  }
  else if (act === 'add-section') { insertBeforeTable({ id: uid(), type: 'prose', headingKey: section, paragraphs: [''] }); }
  else if (act === 'custom-heading') { const blk = get(path); blk.heading = SECTIONS[blk.headingKey][doc.lang]; delete blk.headingKey; }
  else if (act === 'add-block') {
    const blk = { prose: { type: 'prose', paragraphs: [''] }, note: { type: 'note', label: 'hinweis', html: '' },
      objects: { type: 'objects', defaultText: '', rows: [] },
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

/** A new object row: the next number after the last row, hours copied from it. */
function newObject(blk, extra = {}) {
  const last = blk.rows[blk.rows.length - 1];
  const next = last && /^\d+$/.test(last.no) ? String(Number(last.no) + 1).padStart(last.no.length, '0') : String(blk.rows.length + 1).padStart(3, '0');
  return { id: uid(), no: next, title: '', technique: '', size: '', hoursMin: last?.hoursMin ?? 1, ...(last?.hoursMax != null ? { hoursMax: last.hoursMax } : {}), ...extra };
}

// Text sections go before the first "proposed" treatment table (where Zustandsbeurteilung etc. belong)
function insertBeforeTable(block) {
  const bl = doc.data.blocks, at = bl.findIndex((b) => b.type === 'measures' && b.kind === 'main');
  bl.splice(at < 0 ? bl.length : at, 0, block);
}

// ---- proofread (Claude): suggestions only, you accept each one ----
const proofDlg = $('#proofDlg');
const plain = (h) => h.replace(/<[^>]+>/g, '');
let proofResult = null;
/** Find the array item / object a pointer like /data/blocks/@ab12cd34/rows/@ef56/title leads to. */
function pointerTarget(path) {
  const segs = path.split('/').slice(1).map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'));
  let cur = doc;
  for (const s of segs.slice(0, -1)) {
    cur = Array.isArray(cur) && s.startsWith('@') ? cur.find((x) => x?.id === s.slice(1)) : cur?.[s];
    if (cur == null) return null;
  }
  return { parent: cur, key: segs[segs.length - 1] };
}
async function openProofread() {
  proofDlg.showModal(); $('#proofApply').hidden = true; $('#proofNote').textContent = '';
  $('#proofBody').innerHTML = '<p class="hint">Checking the wording with Claude… this takes about half a minute.</p>';
  try {
    await save();
    proofResult = await api(`/api/documents/${id}/proofread`, 'POST');
  } catch (e) {
    let j = {}; try { j = JSON.parse(e.message); } catch { /* not JSON */ }
    const first = ['bridge_down', 'not_logged_in', 'not_configured'].includes(j.code);
    $('#proofBody').innerHTML = `<p class="hint warn">${esc(j.error || e.message)}</p>`
      + (first ? '<p class="hint">First time? Setup (about 5 minutes, no extra cost): docs/RUNNING.md, section “Proofreading”.</p>' : '');
    return;
  }
  const r = proofResult;
  $('#proofNote').textContent = `${r.checked} text fields checked · ${r.usage.inputTokens + r.usage.outputTokens} tokens`;
  if (!r.suggestions.length) { $('#proofBody').innerHTML = '<p>No corrections suggested.</p>' + (r.skipped ? `<p class="hint">${r.skipped} suggestion${r.skipped > 1 ? 's were' : ' was'} discarded because ${r.skipped > 1 ? 'they' : 'it'} would have changed numbers or formatting.</p>` : ''); return; }
  $('#proofBody').innerHTML = `<p class="hint">${r.suggestions.length} suggestion${r.suggestions.length > 1 ? 's' : ''}. Untick any you do not want. <del>Red</del> is removed, <ins>green</ins> is added.</p><ul class="diff">`
    + r.suggestions.map((s, i) => `<li><span class="tag">${esc(s.category)}</span><span class="where"><label><input type="checkbox" data-sug="${i}" checked> ${esc(s.label)}</label></span><div class="what">${DocDiff.wordDiff(plain(s.before), plain(s.after))}<div class="hint">${esc(s.reason)}</div></div></li>`).join('') + '</ul>'
    + (r.skipped ? `<p class="hint">${r.skipped} further suggestion${r.skipped > 1 ? 's were' : ' was'} discarded because ${r.skipped > 1 ? 'they' : 'it'} would have changed numbers or formatting.</p>` : '');
  $('#proofApply').hidden = false;
}
$('#proofBtn').addEventListener('click', openProofread);
$('#proofClose').addEventListener('click', () => proofDlg.close());
$('#proofApply').addEventListener('click', () => {
  let done = 0, stale = 0;
  for (const cb of proofDlg.querySelectorAll('[data-sug]:checked')) {
    const s = proofResult.suggestions[Number(cb.dataset.sug)], t = pointerTarget(s.path);
    if (!t || t.parent[t.key] !== s.before) { stale++; continue; }       // edited since the check: leave it alone
    t.parent[t.key] = s.after; done++;
  }
  proofDlg.close();
  if (done) dirty({ structural: true });
  setState(`${done} correction${done === 1 ? '' : 's'} applied${stale ? `, ${stale} skipped (text changed meanwhile)` : ''}`);
});

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

/** Render a document state into a scaled, paginated iframe inside `container` (same pipeline as the live preview). */
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
  for (let i = 0; i < 60 && f.isConnected && !f.contentDocument.querySelector('[data-vivliostyle-page-container]'); i++) await new Promise((r) => setTimeout(r, 50));
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
  const pages = (f) => f.contentDocument.querySelectorAll('[data-vivliostyle-page-container]').length;
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
    <div class="hist-foot"><button type="button" class="primary" id="restoreBtn" ${rows.length && v.restorable !== false ? '' : 'disabled'}>Restore this version</button>
    <span class="hint">${v.restorable === false ? 'This version cannot be restored: ' + esc((v.issues ?? []).slice(0, 2).map((i) => `${i.path} ${i.message}`).join('; ')) : ' Your current state is saved as a version first, so you can undo a restore.'}</span></div>`;
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
  [doc, clients, appSettings] = await Promise.all([api(`/api/documents/${id}`), api('/api/clients'), api('/api/settings')]);
  const types = await api('/api/doctypes');
  const st = types.find((t) => t.id === doc.type).statuses;
  $('#status').innerHTML = st.map((s) => `<option ${s === doc.status ? 'selected' : ''}>${s}</option>`).join('');
  document.title = `${doc.number} — Snape Docs`;
  renderForm(); preview();
})();
