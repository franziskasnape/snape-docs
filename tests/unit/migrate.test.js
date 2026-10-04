import { describe, expect, it } from 'vitest';
import { needsUpgrade, uid, upgrade } from '../../src/core/migrate';
import { offerType } from '../../src/doctypes/offer/render';

// a document as it was stored before stable ids existed (schema v1)
const v1 = () => ({
  meta: { date: '2026-10-02', validUntil: '2026-12-31' }, rate: 100, cost: { materials: true },
  blocks: [
    { type: 'prose', heading: 'Titel', paragraphs: ['a'] },
    { type: 'measures', kind: 'main', rows: [{ title: 'A', desc: '', hoursMin: 1, images: [{ imageId: 5, caption: 'x' }, { imageId: 6 }] }, { title: 'B', desc: '', hoursMin: 2 }] },
  ],
});

describe('schema migrations (offer)', () => {
  it('upgrades v1 to the current version and assigns stable ids to blocks, rows and photos', () => {
    const d = upgrade(offerType, v1());
    expect(d.v).toBe(offerType.schemaVersion);
    expect(d.blocks.map((b) => b.id)).toEqual(['b1', 'b2']);
    expect(d.blocks[1].rows.map((r) => r.id)).toEqual(['b2-r1', 'b2-r2']);
    expect(d.blocks[1].rows[0].images.map((i) => i.id)).toEqual(['b2-r1-p1', 'b2-r1-p2']);
  });
  it('is deterministic: the same stored data always upgrades to the same ids (history relies on this)', () => {
    expect(upgrade(offerType, v1())).toEqual(upgrade(offerType, v1()));
  });
  it('is idempotent and never overwrites existing ids', () => {
    const once = upgrade(offerType, v1());
    expect(upgrade(offerType, JSON.parse(JSON.stringify(once)))).toEqual(once);
    const withIds = v1(); withIds.blocks[0].id = 'custom'; withIds.v = 1;
    expect(upgrade(offerType, withIds).blocks[0].id).toBe('custom');
  });
  it('leaves current data alone', () => {
    const cur = upgrade(offerType, v1());
    expect(needsUpgrade(offerType, cur)).toBe(false);
    expect(needsUpgrade(offerType, v1())).toBe(true);
  });
  it('generates short unique ids for new items', () => {
    const ids = new Set(Array.from({ length: 500 }, () => uid()));
    expect(ids.size).toBe(500);
    expect([...ids][0]).toMatch(/^[0-9a-f]{8}$/);
  });
  it('new documents are created in the current shape', () => {
    const d = offerType.defaultData('de', { hourlyRate: 100, validityDays: 90, defaultLang: 'de' }, '2026-10-04');
    expect(d.v).toBe(offerType.schemaVersion);
    expect(d.blocks.every((b) => b.id)).toBe(true);
    expect(d.meta.validUntil).toBe('2027-01-02');
  });
});
