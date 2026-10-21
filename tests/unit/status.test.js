import { describe, expect, it } from 'vitest';
import { editEffect, isDecision, moveFor, revLabel, transitionHelp } from '../../src/core/status';
import { sameContent } from '../../src/core/revisions';
import { offerTotals } from '../../src/doctypes/offer/cost';
import { renderOffer } from '../../src/doctypes/offer/render';
import { context, makeOffer } from '../layout/fixtures.js';

describe('revision labels', () => {
  it('count A, B, … Z, AA', () => {
    expect([1, 2, 3, 26, 27, 28, 52, 53].map(revLabel)).toEqual(['A', 'B', 'C', 'Z', 'AA', 'AB', 'AZ', 'BA']);
  });
});

describe('status rules', () => {
  it('only a draft can be sent, and only a sent revision can be answered', () => {
    expect(moveFor('draft', 'sent')).toBe('freeze');
    for (const to of ['accepted', 'declined', 'withdrawn']) { expect(moveFor('sent', to)).toBe('decide'); expect(moveFor('draft', to)).toBeNull(); expect(moveFor('accepted', to)).toBeNull(); }
    expect(moveFor('sent', 'draft')).toBeNull(); expect(moveFor('accepted', 'sent')).toBeNull(); expect(moveFor('draft', 'draft')).toBeNull();
    expect(isDecision('withdrawn')).toBe(true); expect(isDecision('sent')).toBe(false);
  });
  it('editing: only a draft can be changed, everything else is locked until the next revision is created', () => {
    expect(editEffect('draft')).toBe('in-place');
    for (const s of ['sent', 'accepted', 'declined', 'withdrawn']) expect(editEffect(s)).toBe('locked');
  });
  it('explains refused moves in plain words', () => {
    expect(transitionHelp('draft', 'accepted')).toMatch(/mark it as sent first/);
    expect(transitionHelp('accepted', 'declined')).toMatch(/undo that decision/);
    expect(transitionHelp('sent', 'draft')).toMatch(/Create Revision B/);
    expect(transitionHelp('sent', 'sent')).toMatch(/already/);
  });
});

describe('what counts as a change of a sent offer', () => {
  it('ignores private notes, notices everything else', () => {
    const a = makeOffer({ seed: 1, rows: 2 });
    const b = JSON.parse(JSON.stringify(a)); b.privateNotes = '<b>x</b>';
    expect(sameContent(a, b)).toBe(true);
    b.blocks[2].rows[0].hoursMin += 1;
    expect(sameContent(a, b)).toBe(false);
  });
});

describe('headline figures of an offer', () => {
  it('sums the proposed work and leaves optional tables out', () => {
    const d = makeOffer({ seed: 3, rows: 3, optionalRows: 2 }); d.rate = 100;
    const main = d.blocks.find((b) => b.type === 'measures' && b.kind === 'main').rows;
    const t = offerTotals(d);
    expect(t.hoursMin).toBe(main.reduce((a, r) => a + r.hoursMin, 0));
    expect(t.chfMax).toBe(t.hoursMax * 100);
  });
  it('with alternative options the range runs from the cheapest to the dearest option (plus the common work)', () => {
    const rows = (...h) => h.map(([lo, hi], i) => ({ id: `r${i}`, title: 't', hoursMin: lo, hoursMax: hi }));
    const d = { v: 2, meta: {}, rate: 100, cost: { materials: false }, blocks: [
      { type: 'measures', kind: 'main', option: 'Basis', common: true, rows: rows([10, 12]) },
      { type: 'measures', kind: 'main', option: 'A', rows: rows([2, 3]) },
      { type: 'measures', kind: 'main', option: 'B', rows: rows([6, 9]) }] };
    expect(offerTotals(d)).toMatchObject({ hoursMin: 12, hoursMax: 21, chfMin: 1200, chfMax: 2100 });
  });
});

describe('the revision on the printed offer', () => {
  const render = (rev) => renderOffer(makeOffer({ seed: 5, rows: 2 }), { ...context('de'), revision: rev });
  it('revision A prints exactly as before: no mark', () => {
    const html = render({ no: 1, label: 'A' });
    expect(html).not.toContain('Rev.'); expect(html).not.toContain('doc-replaces');
    expect(html).toContain('Snape-Conservation_ANG-2099-001_Angebot');
  });
  it('later revisions show the mark in the header and the file name, and what they replace', () => {
    const html = render({ no: 2, label: 'B', replaces: { label: 'A', date: '2026-10-08' } });
    expect(html).toContain('ANG-2099-001 · Rev. B');
    expect(html).toContain('Ersetzt Angebot Rev. A vom 08.10.2026');
    expect(html).toContain('Snape-Conservation_ANG-2099-001_Rev-B_Angebot');
    expect(renderOffer(makeOffer({ seed: 5, rows: 2 }), { ...context('en'), revision: { no: 2, label: 'B', replaces: { label: 'A', date: '2026-10-08' } } })).toContain('Replaces offer Rev. A of 08.10.2026');
  });
});
