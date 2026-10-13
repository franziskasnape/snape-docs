import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { offerType, renderOffer } from '../../src/doctypes/offer/render';
import { context, makeOffer } from '../layout/fixtures.js';

const good = () => makeOffer({ seed: 1 });
const letterhead = (d) => { const html = renderOffer(d, context('de')); return html.slice(html.indexOf('doc-meta'), html.indexOf('<main>')); };

describe('offer dates', () => {
  it('accepts a normal offer', () => { expect(offerType.validate(good())).toBeNull(); });
  it.each([[null], [undefined], [''], ['02.10.2026'], ['not a date'], [NaN]])('refuses to save an offer whose date is %j', (date) => {
    const d = good(); d.meta.date = date;
    expect(offerType.validate(d)).toMatch(/date/i);
  });
  it('allows "valid until" to be left empty, but not to be garbage', () => {
    const d = good(); d.meta.validUntil = ''; expect(offerType.validate(d)).toBeNull();
    d.meta.validUntil = 'soon'; expect(offerType.validate(d)).toMatch(/valid until/i);
  });
  it('the letterhead shows the date rows with their values', () => {
    const h = letterhead(good());
    expect(h).toContain('Datum'); expect(h).toContain('04.10.2026'); expect(h).toContain('Gültig bis'); expect(h).toContain('02.01.2027');
  });
  it('the letterhead never prints a date label with no date after it', () => {
    const d = good(); d.meta.date = null; d.meta.validUntil = '';
    const h = letterhead(d);
    expect(h).not.toContain('Datum'); expect(h).not.toContain('Gültig bis'); expect(h).toContain('Angebot Nr.');
  });
});

describe('editor date inputs (regression)', () => {
  // A date input used to be converted like a number ("2026-10-02" -> NaN -> saved as empty), which blanked the offer date.
  const src = readFileSync(resolve(import.meta.dirname, '../../public/edit.js'), 'utf8');
  it('only number inputs are converted with Number()', () => {
    expect(src).toMatch(/opts\.type === 'number' \? ` data-num="1"/);
    expect(src).not.toMatch(/type="\$\{opts\.type\}" data-num="1"/);
  });
  it('ignores an empty or half-typed value in a date field instead of saving it', () => {
    expect(src).toMatch(/el\.type === 'date' && !v\) return;/);
  });
});

describe('draft offers follow today\'s date', () => {
  const d = (over = {}) => ({ ...good(), meta: { date: '2026-10-08', validUntil: '2027-01-06', dateAuto: true, ...over } });
  it('moves the date to today and keeps the validity span while a draft', () => {
    const r = offerType.refresh(d(), 'draft', '2026-10-13');
    expect(r.meta.date).toBe('2026-10-13');
    expect(r.meta.validUntil).toBe('2027-01-11');
  });
  it('never changes a sent offer, or one without the switch', () => {
    expect(offerType.refresh(d(), 'sent', '2026-10-13').meta.date).toBe('2026-10-08');
    expect(offerType.refresh(d({ dateAuto: false }), 'draft', '2026-10-13').meta.date).toBe('2026-10-08');
  });
});
