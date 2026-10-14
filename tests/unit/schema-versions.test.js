// Schema versioning guard. tests/fixtures/<type>/v<N>.json are FROZEN samples of what documents looked like at version N
// (invented content). Whenever the shape of the data changes in a way old data cannot satisfy (a field is renamed, removed,
// made required or changes type): raise `schemaVersion`, add a migration and a changelog line, and add v<N+1>.json.
// Adding an OPTIONAL field needs none of that (old data stays valid), but add it to the newest fixture so it stays complete.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { upgrade, needsUpgrade } from '../../src/core/migrate';
import { checkData, snapshotProblems } from '../../src/core/validate';
import { docTypes } from '../../src/core/registry';
import { renderOffer } from '../../src/doctypes/offer/render';
import { offerSchema } from '../../src/doctypes/offer/zod';
import { context } from '../layout/fixtures.js';

const fixture = (type, n) => JSON.parse(readFileSync(resolve(import.meta.dirname, `../fixtures/${type}/v${n}.json`), 'utf8'));

for (const dt of Object.values(docTypes)) {
  describe(`${dt.id}: schema versions`, () => {
    const versions = Array.from({ length: dt.schemaVersion }, (_, i) => i + 1);

    it('has one migration and one changelog line per version step', () => {
      expect(dt.migrations).toHaveLength(dt.schemaVersion - 1);
      expect(dt.schemaChangelog).toHaveLength(dt.schemaVersion - 1);
    });

    it.each(versions)('has a frozen sample document for version %i', (n) => {
      expect(existsSync(resolve(import.meta.dirname, `../fixtures/${dt.id}/v${n}.json`)), `add tests/fixtures/${dt.id}/v${n}.json`).toBe(true);
    });

    it.each(versions)('version %i data upgrades to the current version, is valid, and renders in both languages', (n) => {
      const old = fixture(dt.id, n);
      const copy = JSON.parse(JSON.stringify(old));
      const up = upgrade(dt, copy);
      expect(up.v).toBe(dt.schemaVersion);
      expect(checkData(dt, up)).toBeNull();
      for (const lang of ['de', 'en']) expect(() => renderOffer(up, context(lang))).not.toThrow();
      expect(upgrade(dt, JSON.parse(JSON.stringify(up)))).toEqual(up);       // upgrading again changes nothing
      expect(snapshotProblems(dt, { data: old })).toBeNull();                // and as a history snapshot it can be restored
    });

    it('the newest sample is already current and uses every block type and every top-level field of the schema', () => {
      const cur = fixture(dt.id, dt.schemaVersion);
      expect(cur.v).toBe(dt.schemaVersion);
      expect(needsUpgrade(dt, cur)).toBe(false);
      expect(checkData(dt, cur)).toBeNull();
      const types = offerSchema.shape.blocks.element.options.map((o) => o.shape.type.value);
      expect(cur.blocks.map((b) => b.type).sort().filter((t, i, a) => a.indexOf(t) === i)).toEqual([...types].sort());
      expect(Object.keys(cur)).toEqual(expect.arrayContaining(Object.keys(offerSchema.shape)));
    });
  });
}

describe('data from a newer app', () => {
  it('is refused rather than guessed at', () => {
    const dt = docTypes.offer;
    const issues = checkData(dt, { ...fixture('offer', dt.schemaVersion), v: dt.schemaVersion + 1 });
    expect(issues[0].path).toBe('data.v');
    expect(issues[0].message).toMatch(/newer/);
  });
});
