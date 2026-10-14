import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { offerSchema } from '../../src/doctypes/offer/zod';
import { offerType } from '../../src/doctypes/offer/render';
import { checkData, ensureIds, snapshotProblems } from '../../src/core/validate';
import { checkEnvelope, documentCreate, documentWrite } from '../../src/core/envelope';
import { openapi } from '../../src/core/openapi';
import { makeCollectionOffer, makeOffer } from '../layout/fixtures.js';

const settings = { hourlyRate: 100, validityDays: 90, defaultLang: 'de', signatureImageId: null, signaturePlace: 'Wollerau', signatureBaseline: 0.1 };

describe('offer schema', () => {
  it('accepts a new offer, the invented test offers and a collection offer', () => {
    expect(checkData(offerType, offerType.defaultData('de', settings, '2026-10-04'))).toBeNull();
    for (const seed of [1, 2, 3, 4]) expect(checkData(offerType, makeOffer({ seed, rows: 6 }))).toBeNull();
    expect(checkData(offerType, makeCollectionOffer({ seed: 1, objects: 5 }))).toBeNull();
  });
  it('names the path of every problem', () => {
    const d = makeOffer({ seed: 1, rows: 2 });
    d.blocks[2].rows[1].hoursMin = 'three';
    d.meta.date = '4.10.2026';
    delete d.cost.materials;
    const paths = checkData(offerType, d).map((i) => i.path);
    expect(paths).toContain('data.blocks.2.rows.1.hoursMin');
    expect(paths).toContain('data.meta.date');
    expect(paths).toContain('data.cost.materials');
  });
  it('rejects an unknown block type and a wrong note label', () => {
    const d = makeOffer({ seed: 1, rows: 1 });
    d.blocks.push({ type: 'banana' });
    expect(checkData(offerType, d)).not.toBeNull();
    const e = makeOffer({ seed: 1, rows: 1 }); e.blocks.find((b) => b.type === 'note').label = 'secret';
    expect(checkData(offerType, e).map((i) => i.path).join()).toContain('label');
  });
  it('lets unknown extra keys through (older and newer data must not be rejected)', () => {
    const d = makeOffer({ seed: 1, rows: 1 }); d.futureField = { a: 1 }; d.blocks[2].rows[0].extra = true;
    expect(checkData(offerType, d)).toBeNull();
  });
  it('fills in missing ids', () => {
    const d = ensureIds({ blocks: [{ type: 'measures', rows: [{ title: 'a', images: [{ imageId: 1 }] }] }] });
    expect(d.blocks[0].id).toMatch(/^[0-9a-f]{8}$/);
    expect(d.blocks[0].rows[0].id).toBeTruthy();
    expect(d.blocks[0].rows[0].images[0].id).toBeTruthy();
  });
  it('publishes a JSON Schema and an OpenAPI description that contains it', () => {
    const js = z.toJSONSchema(offerSchema, { target: 'draft-2020-12', io: 'input' });
    expect(js.properties.blocks.items.oneOf ?? js.properties.blocks.items.anyOf).toHaveLength(5);
    const api = openapi('http://x');
    expect(api.openapi).toBe('3.1.0');
    expect(api.components.schemas.offerData.properties.cost).toBeTruthy();
    expect(Object.keys(api.paths)).toEqual(expect.arrayContaining(['/api/documents', '/api/documents/{id}', '/api/images', '/api/doctypes/{type}/schema']));
  });
});

describe('document envelope', () => {
  const dt = offerType;
  it('accepts any subset of the writable fields', () => {
    expect(checkEnvelope(documentWrite(dt), { title: 'x', status: 'sent', lang: 'en', clientId: null, artwork: [{ k: 'a', v: 'b' }], baseRev: 3 })).toBeNull();
    expect(checkEnvelope(documentWrite(dt), {})).toBeNull();
  });
  it('names a bad status, language, artwork line and unknown field', () => {
    const issues = checkEnvelope(documentWrite(dt), { status: 'banana', lang: 'fr', artwork: [{ k: 1 }], titel: 'typo' });
    const paths = issues.map((i) => i.path);
    expect(paths).toEqual(expect.arrayContaining(['status', 'lang', 'artwork.0.k', 'artwork.0.v', 'titel']));
  });
  it('create accepts type, duplicateOf and data', () => {
    expect(checkEnvelope(documentCreate(dt), { type: 'offer', lang: 'de', data: { anything: 1 } })).toBeNull();
    expect(checkEnvelope(documentCreate(dt), { duplicateOf: 'x' })).not.toBeNull();
  });
});

describe('restoring a history snapshot', () => {
  const dt = offerType;
  it('is possible for a valid snapshot, also an old one without the envelope fields', () => {
    const data = makeOffer({ seed: 1, rows: 2 });
    expect(snapshotProblems(dt, { title: 'x', status: 'draft', clientId: 1, artwork: [], data })).toBeNull();
    expect(snapshotProblems(dt, { data })).toBeNull();
  });
  it('is refused when the data would not be a valid document, with the paths', () => {
    const data = makeOffer({ seed: 1, rows: 2 }); data.blocks[2].rows[0].hoursMin = null;
    const issues = snapshotProblems(dt, { data });
    expect(issues.map((i) => i.path)).toContain('data.blocks.2.rows.0.hoursMin');
    expect(snapshotProblems(dt, { status: 'banana', data: makeOffer({ seed: 2 }) }).map((i) => i.path)).toContain('status');
  });
});
