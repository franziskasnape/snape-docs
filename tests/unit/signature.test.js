import { describe, expect, it } from 'vitest';
import { renderOffer } from '../../src/doctypes/offer/render';
import { context, makeOffer } from '../layout/fixtures.js';

// the last page is everything from the final-page section on
const lastPage = (d, lang = 'de', ctx = {}) => { const h = renderOffer(JSON.parse(JSON.stringify(d)), { ...context(lang), ...ctx }); return h.slice(h.indexOf('<section class="final-page">')); };
const boxes = (html) => html.split('<div class="sign-block">').slice(1);          // [contractor row, client row]

describe('contractor signature on the last page', () => {
  it('pre-fills place and offer date on the contractor line, and the signature image on the right', () => {
    const [contractor, client] = boxes(lastPage(makeOffer({ seed: 1 })));
    expect(contractor).toContain('<span class="sign-text">Wollerau, 04.10.2026</span>');
    expect(contractor).toContain('class="sign-image"');
    expect(contractor).toContain('Unterschrift Auftragnehmerin');
    expect(client).not.toContain('sign-text'); expect(client).not.toContain('sign-image');   // the client's row stays blank
  });
  it('places the signature ON the form line: the image is lowered by the part of the strokes that reaches below its baseline', () => {
    const [contractor] = boxes(lastPage(makeOffer({ seed: 1 })));                    // fixture baseline 0.15 of 14 mm
    expect(contractor).toContain('style="height:14mm;margin-bottom:-2.10mm"');
    const [other] = boxes(lastPage(makeOffer({ seed: 1 }), 'de', { signature: { src: 'x.png', place: 'Wollerau', baseline: 0 } }));
    expect(other).toContain('margin-bottom:-0.00mm');
    expect(contractor).toContain('sign-rule filled has-image');
  });
  it('uses the offer date (not today), so a re-printed offer keeps its date', () => {
    const d = makeOffer({ seed: 1 }); d.meta.date = '2026-03-09';
    expect(lastPage(d)).toContain('Wollerau, 09.03.2026');
  });
  it('writes the date in the document language', () => {
    expect(lastPage(makeOffer({ seed: 1 }), 'en')).toContain('Wollerau, 4 October 2026');
  });
  it('can be switched off per offer', () => {
    const d = makeOffer({ seed: 1 }); d.sign = { enabled: false };
    const [contractor] = boxes(lastPage(d));
    expect(contractor).not.toContain('sign-text'); expect(contractor).not.toContain('sign-image'); expect(contractor).not.toContain('Wollerau');
  });
  it('an offer can use its own place of signing', () => {
    const d = makeOffer({ seed: 1 }); d.sign = { place: '  Zürich ' };
    expect(lastPage(d)).toContain('Zürich, 04.10.2026');
    expect(lastPage(d)).not.toContain('Wollerau');
  });
  it('without an uploaded signature image only place and date are printed', () => {
    const [contractor] = boxes(lastPage(makeOffer({ seed: 1 }), 'de', { signature: { src: '', place: 'Wollerau' } }));
    expect(contractor).toContain('Wollerau, 04.10.2026'); expect(contractor).not.toContain('sign-image');
  });
  it('escapes the place so it cannot inject markup', () => {
    const d = makeOffer({ seed: 1 }); d.sign = { place: '<b>x</b>' };
    expect(lastPage(d)).toContain('&lt;b&gt;x&lt;/b&gt;, 04.10.2026');
  });
  it('the signature image never ends up in the public repository files', () => {
    // the real signature is uploaded in Settings and lives in the database; the fixtures only use an invented gradient
    expect(makeOffer({ seed: 1 })).not.toHaveProperty('signatureImage');
  });
});
