// The editor page in a real browser: what a person actually does. Invented content only; test offers are deleted afterwards.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { findChrome } from '../layout/harness.js';
import { png } from '../layout/png.js';

const BASE = (process.env.SNAPE_URL ?? 'http://localhost:8787').replace(/\/$/, '');
let up = false;
try { up = (await fetch(BASE + '/api/health')).ok; } catch { /* not running */ }
const chrome = findChrome();
const ready = up && !!chrome;
if (!ready) console.warn(`Editor tests skipped: need the app at ${BASE} (npm run dev) and Google Chrome (or CHROME_PATH).`);
const d = ready ? describe : describe.skip;

const api = async (path, method = 'GET', body) => {
  const r = await fetch(BASE + path, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body && JSON.stringify(body) });
  return { status: r.status, json: await r.json().catch(() => null) };
};
const created = [];
const make = async (body) => { const r = await api('/api/documents', 'POST', body); created.push(r.json.id); return r.json.id; };
let browser;
beforeAll(async () => {
  if (!ready) return;
  browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
}, 60000);
afterAll(async () => {
  await browser?.close();
  for (const id of created) await api(`/api/documents/${id}`, 'DELETE');
});

/** Wait until a preview frame has finished laying out its pages (and carries the double-click markers). */
async function previewReady(page, timeout = 60000) {
  const t0 = Date.now();
  for (;;) {
    for (const f of page.frames().filter((x) => x !== page.mainFrame() && !x.isDetached())) {
      const n = await f.evaluate(() => document.querySelectorAll('[data-vivliostyle-page-container]').length).catch(() => 0);
      if (n > 0) return f;
    }
    if (Date.now() - t0 > timeout) throw new Error('the preview never finished');
    await new Promise((r) => setTimeout(r, 200));
  }
}

/** Poll until `check()` is true (the editor saves a moment after a change). */
async function waitFor(check, timeout = 15000, what = 'condition') {
  const t0 = Date.now();
  for (;;) { if (await check()) return; if (Date.now() - t0 > timeout) throw new Error(`timed out waiting for ${what}`); await new Promise((r) => setTimeout(r, 200)); }
}

/** Open the editor for a document and wait until the form and the first preview are there. */
async function open(id, { viewport = { width: 1400, height: 1000 } } = {}) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  await page.goto(`${BASE}/edit.html?id=${id}`, { waitUntil: 'load' });
  await previewReady(page);
  return page;
}
const doc = async (id) => (await api(`/api/documents/${id}`)).json;
const focused = (page) => page.evaluate(() => { const a = document.activeElement; return { path: a.dataset?.path, selected: a.value?.slice(a.selectionStart, a.selectionEnd), start: a.selectionStart, tag: a.tagName }; });

d('editor in the browser', () => {
  it('double-click in the preview jumps to the field and selects that very word (second of two equal words, word after a tag)', async () => {
    const id = await make({ title: 'dblclick (invented)', lang: 'de', data: { blocks: [
      { type: 'prose', headingKey: 'condition', paragraphs: ['Die Risse sind fein. Die Risse verlaufen lang.', 'Ein <strong>fetter</strong> Befund mit Rissen.'], bullets: ['Erster Punkt', 'Zweiter Punkt'] },
      { type: 'measures', kind: 'main', rows: [{ title: 'Reinigung', desc: 'Trocken mit Pinsel.', hoursMin: 2 }] }] } });
    const page = await open(id, { viewport: { width: 2300, height: 1100 } });
    const dbl = async (selector, word, nth = 0) => {
      for (let attempt = 0; ; attempt++) {
        try { await dblOnce(selector, word, nth); return; } catch (e) { if (attempt >= 3 || !/detached|Execution context|not found/.test(e.message)) throw e; await previewReady(page); await new Promise((r) => setTimeout(r, 500)); }   // the preview was swapped for a newer render: try again
      }
    };
    const dblOnce = async (selector, word, nth = 0) => {
      const frame = (await Promise.all(page.frames().filter((f) => f !== page.mainFrame()).map(async (f) => ((await f.$(selector)) ? f : null)))).find(Boolean);
      expect(frame, `no preview text for ${selector}`).toBeTruthy();
      await (await frame.frameElement()).evaluate((e) => { e.style.zoom = '1'; });   // the editor shrinks the preview with CSS zoom; click at true size so the mouse position is exact
      await frame.evaluate((sel, w, n) => {                                  // wrap that one word in a span so it can be clicked like a person would
        const el = document.querySelector(sel), tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let c = 0, node;
        while ((node = tw.nextNode())) { let from = 0, i; while ((i = node.data.indexOf(w, from)) >= 0) { if (c++ === n) { const r = document.createRange(); r.setStart(node, i); r.setEnd(node, i + w.length); const s = document.createElement('span'); s.id = '__t' + Date.now(); window.__lastSpan = s.id; r.surroundContents(s); return; } from = i + 1; } }
        throw new Error('word not found');
      }, selector, word, nth);
      await (await frame.$('#' + (await frame.evaluate(() => window.__lastSpan)))).click({ count: 2 });
      await new Promise((r) => setTimeout(r, 250));
    };

    await dbl('[data-src="data.blocks.0.paragraphs.0"]', 'Risse', 1);
    let f = await focused(page);
    expect(f.path).toBe('data.blocks.0.paragraphs.0'); expect(f.selected).toBe('Risse');
    expect(f.start).toBe('Die Risse sind fein. Die '.length);                         // the SECOND "Risse"

    await dbl('[data-src="data.blocks.0.paragraphs.1"]', 'Befund');
    f = await focused(page);
    expect(f.path).toBe('data.blocks.0.paragraphs.1'); expect(f.selected).toBe('Befund');
    expect(f.start).toBe('Ein <strong>fetter</strong> '.length);                       // position in the source, after the tags

    await dbl('[data-src="data.blocks.0.bullets"][data-src-line="1"]', 'Punkt');
    f = await focused(page);
    expect(f.path).toBe('data.blocks.0.bullets'); expect(f.selected).toBe('Punkt'); expect(f.start).toBe('Erster Punkt\nZweiter '.length);

    await dbl('[data-src="data.blocks.1.rows.0.desc"]', 'Pinsel');
    f = await focused(page);
    expect(f.path).toBe('data.blocks.1.rows.0.desc'); expect(f.selected).toBe('Pinsel');

    // a heading has no field of its own: the block is shown and flashes
    const frame = page.frames().find((fr) => fr !== page.mainFrame());
    await frame.evaluate(() => { const h = document.querySelector('.section-heading[data-src="data.blocks.0"]'); h.id = '__h'; });
    await (await frame.$('#__h')).click({ count: 2 });
    await page.waitForFunction(() => document.querySelector('[data-bp="data.blocks.0"]').classList.contains('flash'), { timeout: 3000 });
    await page.close();
  });

  it('every text field is marked with the offer\'s language for the browser spell check', async () => {
    const de = await make({ title: 'lang de (invented)', lang: 'de' }), en = await make({ title: 'lang en (invented)', lang: 'en' });
    for (const [id, lang] of [[de, 'de'], [en, 'en']]) {
      const page = await open(id);
      const langs = await page.$$eval('#form textarea[data-path], #form input[data-path]:not([type=number]):not([type=date]):not([type=checkbox])', (els) => [...new Set(els.map((e) => e.lang))]);
      expect(langs).toEqual([lang]);
      await page.close();
    }
  });

  it('private notes: bullets keep the typing order, are saved, survive a reload, and are never in the document', async () => {
    const id = await make({ title: 'notes (invented)', lang: 'de' });
    const page = await open(id);
    await page.click('#notes');
    await page.keyboard.type('alpha');
    await page.click('[data-cmd="insertUnorderedList"]');
    await page.keyboard.type(' beta');
    await page.keyboard.press('Enter');
    await page.keyboard.type('gamma');
    await waitFor(async () => (await doc(id)).data.privateNotes === '<ul><li>alpha beta</li><li>gamma</li></ul>', 15000, 'the notes to be saved');
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('#notes');
    expect(await page.$eval('#notes', (e) => e.innerText.replace(/\s+/g, ' ').trim())).toBe('alpha beta gamma');
    expect(await (await fetch(`${BASE}/api/documents/${id}/html`)).text()).not.toContain('gamma');
    await page.close();
  });

  it('private notes: dangerous markup that is already stored is neutralised when the editor opens, and cleaned on the next save', async () => {
    const id = await make({ title: 'notes xss (invented)', lang: 'de' });
    await api(`/api/documents/${id}`, 'PATCH', [{ op: 'add', path: '/data/privateNotes', value: '<b onclick="alert(1)">fett</b><img src=x onerror="alert(2)"><script>alert(3)</script><a href="javascript:alert(4)">link</a>' }]);
    const page = await browser.newPage();
    let alerted = false; page.on('dialog', async (dlg) => { alerted = true; await dlg.dismiss(); });
    await page.goto(`${BASE}/edit.html?id=${id}`, { waitUntil: 'load' });
    await page.waitForSelector('#notes');
    await new Promise((r) => setTimeout(r, 1500));
    expect(await page.$eval('#notes', (e) => e.innerHTML)).toBe('<b>fett</b>link');
    expect(await page.$$eval('#notes img, #notes script, #notes a, #notes [onclick]', (e) => e.length)).toBe(0);
    expect(alerted).toBe(false);
    await page.click('#notes'); await page.keyboard.press('End'); await page.keyboard.type('!');
    await waitFor(async () => !/onerror|<script|javascript:|onclick/.test((await doc(id)).data.privateNotes ?? ''), 15000, 'the cleaned notes to be saved');
    expect((await doc(id)).data.privateNotes).toBe('<b>fett</b>link!');
    await page.close();
  });

  it('a stale tab does not overwrite a change made elsewhere: it says so and keeps the other change', async () => {
    const id = await make({ title: 'conflict (invented)', lang: 'de' });
    const page = await open(id);
    await api(`/api/documents/${id}`, 'PATCH', [{ op: 'replace', path: '/title', value: 'Changed by a script' }]);
    await page.click('[data-path="title"]', { clickCount: 3 });
    await page.keyboard.type('typed in the stale tab');
    await page.waitForFunction(() => /Changed elsewhere/.test(document.querySelector('#saveState').textContent), { timeout: 15000 });
    expect((await doc(id)).title).toBe('Changed by a script');
    await page.close();
  });

  it('proofread dialog: shows the suggestion, applies only ticked ones, skips text that changed meanwhile', async () => {
    const id = await make({ title: 'proofread ui (invented)', lang: 'de', data: { blocks: [{ type: 'prose', headingKey: 'condition', paragraphs: ['Das Gemaelde zeigt Risse.', 'Zweiter Absatz mit Fehlr.'] }] } });
    const blk = (await doc(id)).data.blocks[0].id;
    const page = await open(id);
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (req.url().endsWith(`/api/documents/${id}/proofread`)) {
        req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({
          suggestions: [
            { path: `/data/blocks/@${blk}/paragraphs/0`, label: 'Block 1: paragraph 1', before: 'Das Gemaelde zeigt Risse.', after: 'Das Gemälde zeigt Risse.', category: 'spelling', reason: 'Umlaut.', html: true },
            { path: `/data/blocks/@${blk}/paragraphs/1`, label: 'Block 1: paragraph 2', before: 'Zweiter Absatz mit Fehlr.', after: 'Zweiter Absatz mit Fehler.', category: 'spelling', reason: 'Typo.', html: true },
            { path: `/data/blocks/@${blk}/paragraphs/0`, label: 'stale', before: 'Text that is not there', after: 'x', category: 'style', reason: 'stale', html: true },
          ], checked: 2, skipped: 0, model: 'test', usage: { inputTokens: 1, outputTokens: 1 }, rev: 0 }) });
      } else req.continue();
    });
    await page.click('#proofBtn');
    await page.waitForSelector('[data-sug]', { timeout: 15000 });
    expect(await page.$$eval('[data-sug]', (e) => e.length)).toBe(3);
    expect(await page.$eval('#proofBody', (e) => e.innerHTML)).toContain('<ins>Gemälde</ins>');
    await page.click('[data-sug="1"]');                                   // untick the second suggestion
    await page.click('#proofApply');
    expect(await page.$eval('#saveState', (e) => e.textContent)).toMatch(/1 correction applied, 1 skipped/);   // the stale one was skipped
    await waitFor(async () => (await doc(id)).data.blocks[0].paragraphs[0] === 'Das Gemälde zeigt Risse.', 15000, 'the correction to be saved');
    const p = (await doc(id)).data.blocks[0].paragraphs;
    expect(p[0]).toBe('Das Gemälde zeigt Risse.');                        // applied
    expect(p[1]).toBe('Zweiter Absatz mit Fehlr.');                       // unticked: untouched
    await page.close();
  });

  it('proofread dialog explains a missing helper or key in plain words', async () => {
    const id = await make({ title: 'proofread error (invented)', lang: 'de' });
    const page = await open(id);
    await page.setRequestInterception(true);
    page.on('request', (req) => (req.url().endsWith('/proofread')
      ? req.respond({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'The local Claude helper is not running.', code: 'bridge_down' }) }) : req.continue()));
    await page.click('#proofBtn');
    await page.waitForFunction(() => /not running/.test(document.querySelector('#proofBody').textContent), { timeout: 10000 });
    expect(await page.$eval('#proofBody', (e) => e.textContent)).toMatch(/First time\?/);
    expect(await page.$eval('#proofApply', (e) => e.hidden)).toBe(true);
    await page.close();
  });

  it('object list: "Apply to all" sets the hours on every row, and photos add one row each in file-name order', async () => {
    const id = await make({ title: 'objects ui (invented)', lang: 'de', data: { blocks: [
      { type: 'objects', defaultText: 'Gemeinsamer Text.', rows: [1, 2, 3].map((n) => ({ no: String(n).padStart(3, '0'), title: `Objekt ${n}`, hoursMin: 1, hoursMax: 2 })) }] } });
    const page = await open(id);
    page.on('dialog', (dlg) => dlg.accept());
    await page.type('#bulkMin0', '3'); await page.type('#bulkMax0', '5');
    await page.click('[data-act="apply-hours"]');
    await waitFor(async () => (await doc(id)).data.blocks[0].rows.every((r) => r.hoursMin === 3), 15000, 'the hours to be saved');
    expect((await doc(id)).data.blocks[0].rows.map((r) => [r.hoursMin, r.hoursMax])).toEqual([[3, 5], [3, 5], [3, 5]]);

    const dir = mkdtempSync(join(tmpdir(), 'snape-editor-')), files = ['b-second.png', 'a-first.png'].map((n, i) => { const f = join(dir, n); writeFileSync(f, png(60 + i * 10, 40, i + 1)); return f; });
    await (await page.$('input[data-upload="objects"]')).uploadFile(...files);
    await waitFor(async () => (await doc(id)).data.blocks[0].rows.length === 5, 20000, 'the two photo rows to be saved');
    const rows = (await doc(id)).data.blocks[0].rows;
    expect(rows).toHaveLength(5);
    expect(rows.slice(3).map((r) => r.no)).toEqual(['004', '005']);       // numbering continues
    expect(rows.slice(3).every((r) => Number.isInteger(r.imageId))).toBe(true);
    expect(rows[3].hoursMin).toBe(3);                                      // new rows copy the hours of the last row
    const sizes = await Promise.all(rows.slice(3).map(async (r) => (await api(`/api/images/${r.imageId}`)).json.width));
    expect(sizes).toEqual([70, 60]);                                       // a-first.png (70 wide) came before b-second.png (60 wide)
    await page.close();
  });

  it('revisions: mark as sent, edit starts Revision B, the Sent versions panel compares, accepted locks and amends', async () => {
    const id = await make({ title: 'revisions ui (invented)', lang: 'de', artwork: [{ k: 'Titel', v: 'Erfunden' }], data: { blocks: [
      { type: 'prose', headingKey: 'condition', paragraphs: ['Text der ersten Revision.'] },
      { type: 'measures', kind: 'main', rows: [{ title: 'Reinigung', desc: 'x', hoursMin: 2, hoursMax: 3 }] }] } });
    const page = await open(id);
    page.on('dialog', (dlg) => dlg.accept());
    const text = (sel) => page.$eval(sel, (e) => e.textContent.trim());

    // draft: the one action is "Mark as sent"; the dialog asks for a date and a note
    expect(await text('#hStatus')).toBe('Draft'); expect(await text('#hRev')).toBe('Rev. A');
    expect(await page.$eval('#revBanner', (e) => e.hidden)).toBe(true);
    await page.click('[data-sact="sent"]');
    await page.waitForSelector('#markDlg[open]');
    await page.$eval('#markDate', (e) => { e.value = '2026-10-08'; });
    await page.type('#markNote', 'per E-Mail');
    await page.click('#markOk');
    await waitFor(async () => (await text('#hStatus')) === 'Sent', 15000, 'the status to become Sent');
    expect(await text('#revBanner')).toMatch(/Revision A was sent on 08\.10\.2026/);
    expect(await text('#sentBtn')).toBe('Sent versions (1)');
    expect((await doc(id)).revisions[0]).toMatchObject({ sentAt: '2026-10-08', sentNote: 'per E-Mail', status: 'sent' });

    // the first change starts Revision B; the date follows today again; Revision A stays as sent
    await page.$eval('textarea[data-path="data.blocks.0.paragraphs.0"]', (e) => { e.focus(); e.select(); });
    await page.keyboard.type('Text der zweiten Revision.');
    await waitFor(async () => (await text('#hRev')) === 'Rev. B', 15000, 'Revision B to start');
    expect(await text('#hStatus')).toBe('Draft');
    expect(await text('#revBanner')).toMatch(/You are editing Revision B.*Revision A was sent on 08\.10\.2026/);
    expect(await text('#saveState')).toMatch(/Revision B started/);
    const dateNow = await page.$eval('input[data-path="data.meta.date"]', (e) => e.value);
    expect(dateNow).toBe(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich' }).format(new Date()));
    await waitFor(async () => (await doc(id)).data.blocks[0].paragraphs[0] === 'Text der zweiten Revision.', 15000, 'the text to be saved');
    expect((await api(`/api/documents/${id}/revisions/1`)).json.snapshot.data.blocks[0].paragraphs[0]).toBe('Text der ersten Revision.');

    // the Sent versions panel: Revision A with its date, a working Revision B, and a comparison with what is there now
    await page.click('#sentBtn');
    await page.waitForSelector('#sentBody .sent-row[data-rev="1"]');
    expect(await text('#sentBody')).toMatch(/Revision B.*Draft, not sent/s);
    expect(await text('#sentBody [data-rev="1"]')).toMatch(/Revision A.*Sent 08\.10\.2026.*per E-Mail/s);
    expect(await page.$eval('#sentBody [data-rev="1"] a.btn', (e) => e.getAttribute('href'))).toBe(`/documents/${id}/revisions/1/print`);
    await page.click('#sentBody [data-rev="1"] [data-s="compare"]');
    await page.waitForSelector('#sentBody [data-rev="1"] .diff-box .diff');
    expect(await page.$eval('#sentBody [data-rev="1"] .diff-box', (e) => e.innerHTML)).toContain('erste');
    await page.click('#sentClose');

    // send B, then record the answer: accepted locks the form until "Create amendment"
    await page.click('[data-sact="sent"]'); await page.waitForSelector('#markDlg[open]'); await page.click('#markOk');
    await waitFor(async () => (await text('#hStatus')) === 'Sent', 15000, 'Revision B to be sent');
    expect((await doc(id)).revisions.map((r) => [r.label, r.status])).toEqual([['A', 'superseded'], ['B', 'sent']]);
    await page.click('[data-sact="accepted"]'); await page.waitForSelector('#markDlg[open]'); await page.click('#markOk');
    await waitFor(async () => (await text('#hStatus')) === 'Accepted', 15000, 'the status to become Accepted');
    // locked means "cannot be changed", not "cannot be read": the form still scrolls, the fields are disabled, private notes stay editable
    expect(await page.$$eval('#form > fieldset:not(.notes)', (f) => f.every((x) => x.disabled))).toBe(true);
    expect(await page.$eval('#form > fieldset.notes', (f) => f.disabled)).toBe(false);
    const scrolled = await page.$eval('#form', (f) => { f.scrollTop = 0; f.scrollTop = 300; return { max: f.scrollHeight - f.clientHeight, top: f.scrollTop }; });
    expect(scrolled.max).toBeGreaterThan(0); expect(scrolled.top).toBeGreaterThan(0);
    expect(await page.$eval('textarea[data-path="data.blocks.0.paragraphs.0"]', (e) => e.matches(':disabled'))).toBe(true);          // disabled by its fieldset
    await page.click('#notes'); await page.keyboard.type('Notiz');
    await waitFor(async () => /Notiz/.test((await doc(id)).data.privateNotes ?? ''), 15000, 'a private note on an accepted offer to be saved');
    expect((await doc(id)).status).toBe('accepted');                       // a private note is not a change of the offer
    expect(await text('#revBanner')).toMatch(/Revision B was accepted.*locked/s);
    await page.click('#revBanner [data-sact="amend"]');
    await page.waitForFunction(() => /Rev\. C/.test(document.querySelector('#hRev')?.textContent ?? ''), { timeout: 20000 });
    expect(await text('#hStatus')).toBe('Draft');
    expect(await page.$$eval('#form > fieldset', (f) => f.some((x) => x.disabled))).toBe(false);
    expect((await doc(id)).revisions.map((r) => [r.label, r.status])).toEqual([['A', 'superseded'], ['B', 'accepted']]);
    await page.close();
  });

  it('the landing page shows the revision of each offer, and the client page lists every revision that was sent', async () => {
    const cl = await api('/api/clients', 'POST', { name: 'Revisions Test AG (invented)' });
    let id;
    try {
    id = await make({ title: 'landing (invented)', lang: 'de', clientId: cl.json.id });
    await api(`/api/documents/${id}`, 'PUT', { status: 'sent', statusDate: '2026-10-08' });
    await api(`/api/documents/${id}`, 'PATCH', [{ op: 'replace', path: '/title', value: 'landing (invented)' }, { op: 'replace', path: '/data/rate', value: 120 }]);
    const page = await browser.newPage();
    await page.goto(`${BASE}/`, { waitUntil: 'load' });
    await page.waitForSelector(`tr[data-id="${id}"]`);
    const row = await page.$eval(`tr[data-id="${id}"]`, (e) => e.innerText.replace(/\s+/g, ' '));
    expect(row).toMatch(/draft/i); expect(await page.$eval(`tr[data-id="${id}"] td:nth-child(5) b`, (e) => e.textContent)).toBe('B'); expect(row).toMatch(/A sent 08\.10\./);   // own "Rev." column
    await page.goto(`${BASE}/client.html?id=${cl.json.id}`, { waitUntil: 'load' });
    await page.waitForSelector('#list tbody tr');
    const txt = await page.$eval('#list', (e) => e.innerText.replace(/\s+/g, ' '));
    expect(txt).toMatch(/Rev\. A.*sent 08\.10\.2026/i); expect(txt).toMatch(/Rev\. B.*draft/i);
    expect(await page.$eval('#list a[href*="/revisions/1/print"]', (e) => e.getAttribute('href'))).toBe(`/documents/${id}/revisions/1/print`);
    await page.close();
    } finally { if (id) await api(`/api/documents/${id}`, 'DELETE'); await api(`/api/clients/${cl.json.id}`, 'DELETE'); }
  });
});
