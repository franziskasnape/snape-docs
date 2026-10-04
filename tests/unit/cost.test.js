import { describe, expect, it } from 'vitest';
import { costParagraph } from '../../src/doctypes/offer/cost';

const rows = (...r) => r.map(([lo, hi], i) => ({ id: `r${i}`, title: `Row ${i}`, desc: '', hoursMin: lo, ...(hi ? { hoursMax: hi } : {}) }));
const offer = (over = {}) => ({ v: 2, meta: {}, rate: 100, cost: { materials: false }, blocks: [{ id: 'b', type: 'measures', kind: 'main', rows: rows([1.5, 2], [3, 4], [1]) }], ...over });
const text = (h) => h.replace(/<[^>]+>/g, '');

describe('Kostenaufstellung', () => {
  it('computes hours and CHF from the treatment tables (German)', () => {
    const t = text(costParagraph(offer(), 'de'));
    expect(t).toContain('ca. 5.5–7 Stunden');
    expect(t).toContain('CHF 100.–');
    expect(t).toContain("ca. CHF 550–700");
    expect(t).toContain('voraussichtliche Kosten von');           // plain "Kosten" when materials are not mentioned
  });
  it('says Arbeitskosten and adds the materials sentence when materials are billed separately', () => {
    const t = text(costParagraph(offer({ cost: { materials: true } }), 'de'));
    expect(t).toContain('Arbeitskosten');
    expect(t).toContain('Materialkosten sind darin nicht enthalten');
  });
  it('adds the optional-treatment sentence only when an optional table exists, with its own CHF range', () => {
    const base = offer();
    expect(text(costParagraph(base, 'de'))).not.toContain('optionalen');
    base.blocks.push({ id: 'o', type: 'measures', kind: 'optional', rows: rows([8, 15], [2, 3]) });
    const t = text(costParagraph({ ...base, cost: { materials: true, optionalDetail: 'Firnis' } }, 'de'));
    expect(t).toContain('Die optionalen Massnahmen (Firnis) würden zusätzlich ca. 10–18 Stunden');
    expect(t).toContain("ca. CHF 1'000–1'800");
  });
  it('optional hours are not added to the main total', () => {
    const o = offer(); o.blocks.push({ id: 'o', type: 'measures', kind: 'optional', rows: rows([10]) });
    expect(text(costParagraph(o, 'de'))).toContain('ca. 5.5–7 Stunden');
  });
  it('uses the hourly rate of the offer', () => {
    const t = text(costParagraph(offer({ rate: 120 }), 'de'));
    expect(t).toContain('CHF 120.–');
    expect(t).toContain("ca. CHF 660–840");
  });
  it('mentions delivery and pickup dates, in the document language', () => {
    const cost = { materials: false, deliveryFrom: '2026-10-29', pickupFrom: 'Mitte November 2026' };
    expect(text(costParagraph(offer({ cost }), 'de'))).toContain('ab dem 29. Oktober 2026 möglich; die Abholung kann voraussichtlich ab Mitte November 2026 erfolgen.');
    expect(text(costParagraph(offer({ cost }), 'en'))).toContain('from 29 October 2026; collection is expected from Mitte November 2026.');
  });
  it('is written in English for English documents', () => {
    const t = text(costParagraph(offer(), 'en'));
    expect(t).toContain('approx. 5.5–7 hours');
    expect(t).toContain('estimated costs of approx. CHF 550–700');
    expect(t).not.toMatch(/Stunden|Kosten/);
  });
  it('a manual override replaces the calculated text', () => {
    expect(costParagraph(offer({ cost: { materials: false, overrideHtml: 'Frei formuliert.' } }), 'de')).toBe('Frei formuliert.');
  });
});
