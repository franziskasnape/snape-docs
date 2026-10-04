import { describe, expect, it } from 'vitest';
import '../../public/diff.js';                       // a browser script: it publishes itself as globalThis.DocDiff
const { diffDocs, wordDiff } = globalThis.DocDiff;

const strip = (h) => h.replace(/<del>/g, '[-').replace(/<\/del>/g, '-]').replace(/<ins>/g, '{+').replace(/<\/ins>/g, '+}');
const row = (id, title, min, max) => ({ id, title, desc: `desc ${title}`, hoursMin: min, ...(max != null ? { hoursMax: max } : {}) });
const base = () => ({
  title: 'Test', status: 'draft', artwork: [{ k: 'Künstler/in', v: 'A' }, { k: 'Titel', v: '?' }],
  data: { v: 2, meta: { date: '2026-10-02', validUntil: '2026-12-31' }, rate: 100, cost: { materials: true }, overview: { imageId: 1, caption: 'x' },
    blocks: [
      { id: 'b1', type: 'prose', headingKey: 'artist', paragraphs: ['Erster Absatz bleibt gleich.', 'Der zweite Absatz ist ein Beispieltext.'] },
      { id: 'b2', type: 'measures', kind: 'main', rows: [row('r1', 'Untersuchung', 1.5, 2), row('r2', 'Reinigung', 3, 4), row('r3', 'Dokumentation', 1)] },
      { id: 'b3', type: 'note', label: 'hinweis', html: 'Ohne Passepartout.' }] },
});
const clone = (o) => JSON.parse(JSON.stringify(o));

describe('history diff (current → version)', () => {
  it('reports nothing for identical documents', () => { expect(diffDocs(base(), base())).toEqual([]); });

  it('shows text changes word by word', () => {
    const cur = clone(base()); cur.data.blocks[0].paragraphs[1] = 'Der zweite Absatz ist ein längerer Beispieltext.';
    const [c] = diffDocs(cur, base());
    expect(c.tag).toBe('changed');
    expect(c.where).toBe('1. Text section – Artist & work › paragraph 2');
    expect(strip(c.html)).toBe('Der zweite Absatz ist ein [-längerer -]Beispieltext.');
  });

  it('matches by id: a reordered block is one "moved" entry, not a pile of edits', () => {
    const cur = clone(base()); cur.data.blocks = [cur.data.blocks[2], cur.data.blocks[0], cur.data.blocks[1]];
    const d = diffDocs(cur, base());
    expect(d).toHaveLength(1);
    expect(d[0].tag).toBe('moved');
  });

  it('a row deleted since the version is "restored"; a row added since is "removed"', () => {
    const del = clone(base()); del.data.blocks[1].rows.splice(1, 1);
    expect(diffDocs(del, base()).map((x) => x.tag)).toEqual(['restored']);
    const add = clone(base()); add.data.blocks[1].rows.push(row('r9', 'Neu', 1));
    expect(diffDocs(add, base()).map((x) => x.tag)).toEqual(['removed']);
  });

  it('reports field edits inside a moved row once, at the right row', () => {
    const cur = clone(base()); cur.data.blocks[1].rows[0].hoursMin = 2; cur.data.blocks[1].rows.reverse();
    const d = diffDocs(cur, base());
    expect(d.some((x) => x.tag === 'changed' && /hours \(min\)/.test(x.where) && /2 → 1.5/.test(x.html))).toBe(true);
  });

  it('compares title, status, rate, object lines and cost fields', () => {
    const cur = clone(base()); cur.title = 'Neu'; cur.status = 'sent'; cur.data.rate = 120; cur.artwork[1].v = 'Landschaft'; cur.data.cost.deliveryFrom = '2026-11-05';
    const where = diffDocs(cur, base()).map((x) => x.where);
    expect(where).toEqual(expect.arrayContaining(['Title', 'Status', 'Document › hourly rate', 'Object › Titel', 'Cost summary › delivery from']));
  });

  it('tolerates old snapshots that only stored `data` (no title/status/artwork)', () => {
    expect(diffDocs(base(), { data: clone(base()).data })).toEqual([]);
  });

  it('wordDiff marks only the changed words', () => {
    expect(strip(wordDiff('Das ist gut.', 'Das ist sehr gut.'))).toBe('Das ist {+sehr +}gut.');
  });
});
