import { describe, expect, it } from 'vitest';
import { renderOffer } from '../../src/doctypes/offer/render';
import { context, makeOffer } from '../layout/fixtures.js';

const render = (data, lang = 'de', ctx = {}) => renderOffer(JSON.parse(JSON.stringify(data)), { ...context(lang), ...ctx });
const count = (html, re) => (html.match(re) ?? []).length;
const row = (i, title = `Row ${i}`) => ({ id: `r${i}`, title, desc: 'text', hoursMin: 1, hoursMax: 2 });
const offerWithRows = (n, kind = 'main') => ({ v: 2, meta: { date: '2026-10-04', validUntil: '2027-01-02' }, rate: 100, cost: { materials: false }, blocks: [{ id: 'b', type: 'measures', kind, rows: Array.from({ length: n }, (_, i) => row(i + 1)) }] });

describe('offer rendering', () => {
  it('puts the cost summary and both signature rows in one final-page section', () => {
    const html = render(makeOffer({ seed: 1 }));
    expect(count(html, /<section class="final-page">/g)).toBe(1);
    const final = html.slice(html.indexOf('<section class="final-page">'));
    expect(final).toContain('Kostenaufstellung');
    expect(count(final, /class="sign-box"/g)).toBe(4);
    expect(html.slice(0, html.indexOf('<section class="final-page">'))).not.toContain('sign-group');
  });

  it('names the file like the studio does (this becomes the PDF filename)', () => {
    expect(render(makeOffer({ seed: 1 }), 'de')).toContain('<title>Snape-Conservation_ANG-2099-001_Angebot</title>');
    expect(render(makeOffer({ seed: 1 }), 'en')).toContain('<title>Snape-Conservation_ANG-2099-001_Offer</title>');
  });

  it('ignores manual page breaks at the very end but keeps them in the middle', () => {
    const o = offerWithRows(2); o.blocks.push({ id: 'p1', type: 'pagebreak' }, { id: 'p2', type: 'pagebreak' });
    expect(count(render(o), /class="page-break"/g)).toBe(0);
    const mid = offerWithRows(2); mid.blocks.unshift({ id: 'p0', type: 'pagebreak' });
    expect(count(render(mid), /class="page-break"/g)).toBe(1);
  });

  it('prints standard section headings in the document language and keeps custom headings as typed', () => {
    const o = makeOffer({ seed: 2 }); o.blocks.push({ id: 'c', type: 'prose', heading: 'Mein eigener Titel', paragraphs: ['x'] });
    const de = render(o, 'de'), en = render(o, 'en');
    expect(de).toContain('Zum Künstler und Werk'); expect(de).toContain('Zustandsbeurteilung');
    expect(en).toContain('About the Artist and Work'); expect(en).toContain('Condition Assessment');
    expect(de).toContain('Mein eigener Titel'); expect(en).toContain('Mein eigener Titel');
    expect(de).not.toContain('Condition Assessment');
  });

  it('does not print empty paragraphs', () => {
    const o = offerWithRows(1); o.blocks.unshift({ id: 'e', type: 'prose', paragraphs: ['', '  '] });
    expect(count(render(o), /class="section-body"><\/div>/g)).toBe(0);
  });

  it('shows calculated totals and numbers the proposed rows', () => {
    const o = offerWithRows(3);
    const de = render(o, 'de'), en = render(o, 'en');
    expect(de).toContain('ca. 3–6 Std.'); expect(en).toContain('approx. 3–6 hrs');
    expect(de).toMatch(/<tr><td>1<\/td>/); expect(de).toMatch(/<tr><td>3<\/td>/);
    expect(render(offerWithRows(2, 'optional'))).toMatch(/<tr><td>–<\/td>/);       // optional rows are not numbered
  });

  it('writes one real table whose header can repeat, and keeps the last row together with the total line', () => {
    const shape = (n) => { const h = render(offerWithRows(n)); return { tables: count(h, /<table /g), theads: count(h, /<thead>/g), keepLast: count(h, /<tbody class="keep-last">/g), totalRows: count(h, /<tr class="totals">/g) }; };
    for (const n of [0, 1, 2, 6]) expect(shape(n)).toEqual({ tables: 1, theads: 1, keepLast: 1, totalRows: 1 });
    const html = render(offerWithRows(4));
    const keepLast = html.slice(html.indexOf('<tbody class="keep-last">'), html.indexOf('</tbody>', html.indexOf('<tbody class="keep-last">')));
    expect(keepLast).toContain('Row 4'); expect(keepLast).toContain('class="totals"'); expect(keepLast).not.toContain('Row 3');
  });

  it('escapes user text so a title cannot inject markup', () => {
    const o = offerWithRows(1); o.blocks[0].rows[0].title = '<img src=x onerror=alert(1)>';
    const html = render(o);
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('chooses the overview photo layout from the photo shape, unless overridden', () => {
    const layout = (id, override) => { const o = makeOffer({ seed: 3 }); o.overview = { imageId: id, caption: 'c', ...(override ? { layout: override } : {}) }; return /overview-fig (\w+)/.exec(render(o))[1]; };
    expect(layout(2)).toBe('landscape');          // 300×200
    expect(layout(3)).toBe('portrait');           // 200×300
    expect(layout(3, 'landscape')).toBe('landscape');
    expect(layout(2, 'portrait')).toBe('portrait');
  });

  it('prints object and client details and leaves out empty object lines', () => {
    const html = render(makeOffer({ seed: 4 }), 'de', { artwork: [{ k: 'Titel', v: 'Teststudie' }, { k: 'Signatur', v: '' }] });
    expect(html).toContain('Teststudie'); expect(html).not.toContain('Signatur'); expect(html).toContain('Beispiel AG');
  });
});
