/**
 * Layout regression tests. They render invented offers with the real page-layout host (Vivliostyle) in headless Chrome and
 * check for typical print-layout defects. Run with `npm run test:layout` (needs Google Chrome or CHROME_PATH, and
 * `npm install` once so public/vivliostyle.js exists). Fonts are optional but make results match real documents.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { engineInstalled, findChrome, fontsInstalled, startHarness } from './harness.js';
import { findDefects, lowFillPages } from './defects.js';
import { makeOffer, rng, words } from './fixtures.js';

const ready = !!findChrome() && engineInstalled();
if (!ready) console.warn('Layout tests skipped: need Google Chrome (or CHROME_PATH) and public/vivliostyle.js (run npm install).');
if (ready && !fontsInstalled()) console.warn('Note: studio fonts are not installed (npm run fonts); layout is checked with fallback fonts.');

const d = ready ? describe : describe.skip;
let h;
beforeAll(async () => { if (ready) h = await startHarness(); }, 60000);
afterAll(async () => { await h?.close(); });

/** Render many variants, at most 4 at a time. */
async function renderAll(variants, lang = 'de') {
  const results = new Array(variants.length); let next = 0;
  await Promise.all(Array.from({ length: 4 }, async () => { while (next < variants.length) { const i = next++; results[i] = { ...variants[i], pages: await h.render(variants[i].data, lang) }; } }));
  return results;
}

// ---- sweeps: many different content lengths, so page breaks land in many different places ----
const sweep = (label, build, n) => Array.from({ length: n }, (_, i) => ({ name: `${label} #${i + 1}`, data: build(i + 1) }));

d('realistic offers (2–5 line descriptions, 0–2 photos per row)', () => {
  const variants = sweep('realistic', (i) => { const r = rng(i * 7); return makeOffer({ seed: i, rows: 3 + Math.floor(r() * 16), optionalRows: Math.floor(r() * 4), extraBefore: Math.floor(r() * 7), prose: [1 + Math.floor(r() * 3), 1 + Math.floor(r() * 5), Math.floor(r() * 3)], overviewPortrait: i % 4 === 0 }); }, 40);
  let results;
  beforeAll(async () => { results = await renderAll(variants); }, 240000);

  it('has no layout defects on any of the 40 variants', () => {
    const bad = results.map((r) => ({ name: r.name, defects: findDefects(r.pages) })).filter((r) => r.defects.length);
    expect(bad.map((b) => `${b.name}:\n  ${b.defects.join('\n  ')}`).join('\n')).toBe('');
  });

  it('does not leave large white gaps in the middle of the document', () => {
    const bad = results.map((r) => ({ name: r.name, gaps: lowFillPages(r.pages, 110) })).filter((r) => r.gaps.length);
    expect(bad.map((b) => `${b.name}: ${b.gaps.join('; ')}`).join('\n')).toBe('');
  });
});

d('demanding offers (very long descriptions and many photos)', () => {
  const variants = sweep('extreme', (i) => makeOffer({ seed: 100 + i, rows: 8 + (i % 8), optionalRows: i % 4, rowSentences: (r) => 5 + Math.floor(r() * 9), photoRate: 0.7, extraBefore: i % 6, prose: [2, 4, 2] }), 16);
  let results;
  beforeAll(async () => { results = await renderAll(variants); }, 240000);

  it('has no layout defects (white gaps are tolerated for rows taller than a third of a page)', () => {
    const bad = results.map((r) => ({ name: r.name, defects: findDefects(r.pages) })).filter((r) => r.defects.length);
    expect(bad.map((b) => `${b.name}:\n  ${b.defects.join('\n  ')}`).join('\n')).toBe('');
  });
});

d('text-heavy offers (many headed sections, long paragraphs)', () => {
  // headings are the classic orphan risk: a heading at the very bottom of a page with its text on the next
  const heavy = (i) => {
    const r = rng(500 + i), data = makeOffer({ seed: 500 + i, rows: 2 + Math.floor(r() * 6), optionalRows: 0, prose: [2, 3, 0] });
    const extra = Array.from({ length: 4 + Math.floor(r() * 4) }, (_, k) => ({
      id: `x${k}`, type: 'prose', heading: ['Beurteilung der Oberflächenwirkung', 'Hinweise zur Behandlung', 'Zustand der Rahmung', 'Empfehlungen zur Aufbewahrung', 'Weiteres Vorgehen', 'Bemerkungen', 'Offene Fragen'][k % 7],
      paragraphs: Array.from({ length: 1 + Math.floor(r() * 3) }, () => words(r, 2 + Math.floor(r() * 7))),
    }));
    data.blocks.splice(2, 0, ...extra.slice(0, 2)); data.blocks.splice(data.blocks.length - 1, 0, ...extra.slice(2));
    return data;
  };
  const variants = sweep('text-heavy', heavy, 30);
  let results;
  beforeAll(async () => { results = await renderAll(variants); }, 240000);
  it('has no layout defects', () => {
    const bad = results.map((r) => ({ name: r.name, defects: findDefects(r.pages) })).filter((r) => r.defects.length);
    expect(bad.map((b) => `${b.name}:\n  ${b.defects.join('\n  ')}`).join('\n')).toBe('');
  });
});

d('PDF export (the print view as the browser saves it)', () => {
  it('gives A4 pages with page numbers, the repeated table header, and the cost summary + signatures on the last page', async () => {
    const buf = await h.pdf(makeOffer({ seed: 11, rows: 15, optionalRows: 3, photoRate: 0.5 }));
    const pdf = await getDocument({ data: new Uint8Array(buf), useSystemFonts: true, verbosity: 0 }).promise;
    const texts = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i), vp = page.getViewport({ scale: 1 });
      expect([Math.round((vp.width / 72) * 25.4), Math.round((vp.height / 72) * 25.4)], `page ${i} size`).toEqual([210, 297]);
      texts.push((await page.getTextContent()).items.map((x) => x.str).join(' ').replace(/\s+/g, ' '));
    }
    expect(pdf.numPages).toBeGreaterThanOrEqual(4);
    texts.forEach((t, i) => expect(t, `page ${i + 1} footer`).toContain(`Seite ${i + 1} / ${pdf.numPages}`));
    const withHeader = texts.filter((t) => /B\s?E\s?S\s?C\s?H\s?R\s?E\s?I\s?B\s?U\s?N\s?G/i.test(t) || /beschreibung/i.test(t)).length;
    expect(withHeader, 'pages showing the table header row').toBeGreaterThanOrEqual(3);   // first table page + two continuation pages
    const last = texts[texts.length - 1];
    expect(last).toContain('Kostenaufstellung'); expect(last.toLowerCase()).toContain('ort, datum');
    texts.slice(0, -1).forEach((t, i) => expect(t.toLowerCase(), `page ${i + 1}`).not.toContain('ort, datum'));
  });
});

d('special cases', () => {
  it('an almost empty offer is two pages: content, then cost summary + signatures', async () => {
    const pages = await h.render(makeOffer({ seed: 1, rows: 0, optionalRows: 0, prose: [0, 0, 0] }));
    expect(findDefects(pages)).toEqual([]);
    expect(pages).toHaveLength(2);
  });

  it('a single treatment row keeps heading, table and total together', async () => {
    const pages = await h.render(makeOffer({ seed: 2, rows: 1, optionalRows: 0 }));
    expect(findDefects(pages)).toEqual([]);
  });

  it('a manual page break as the very last block does not create a blank page', async () => {
    const data = makeOffer({ seed: 3, rows: 4 }); data.blocks.push({ id: 'pb', type: 'pagebreak' });
    expect(findDefects(await h.render(data))).toEqual([]);
  });

  it('a manual page break in the middle starts the next content on a new page', async () => {
    const data = makeOffer({ seed: 4, rows: 3, optionalRows: 0 }); data.blocks.splice(2, 0, { id: 'pb', type: 'pagebreak' });
    const pages = await h.render(data);
    expect(findDefects(pages)).toEqual([]);
    expect(pages.find((p) => p.rowTitles.length)?.index).toBeGreaterThan(1);
  });

  it('English documents lay out without defects', async () => {
    const r = await renderAll(sweep('en', (i) => makeOffer({ seed: 300 + i, rows: 9, optionalRows: 2 }), 6), 'en');
    expect(r.flatMap((x) => findDefects(x.pages).map((m) => `${x.name}: ${m}`))).toEqual([]);
  });

});
