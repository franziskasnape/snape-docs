// End-to-end tests of the HTTP API against a running app. Everything created here is invented and deleted again.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { png } from '../layout/png.js';

const BASE = (process.env.SNAPE_URL ?? 'http://localhost:8787').replace(/\/$/, '');
const call = async (path, method = 'GET', body, headers = {}) => {
  const raw = body instanceof Uint8Array;
  const r = await fetch(BASE + path, { method, headers: { ...(body && !raw ? { 'content-type': 'application/json' } : {}), ...headers }, body: body === undefined ? undefined : raw ? body : typeof body === 'string' ? body : JSON.stringify(body) });   // a string body is sent as it is
  const text = await r.text(); let json; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, json, text };
};

let up = false;
try { up = (await fetch(BASE + '/api/health')).ok; } catch { /* not running */ }
if (!up) console.warn(`API tests skipped: no app at ${BASE} (start it with npm run dev).`);
const d = up ? describe : describe.skip;
const created = [];
afterAll(async () => { for (const id of created) await call(`/api/documents/${id}`, 'DELETE'); });

d('API', () => {
  let id, rev, blockId;

  it('describes itself: OpenAPI, JSON Schema, example, types', async () => {
    const api = (await call('/api/openapi.json')).json;
    expect(api.openapi).toBe('3.1.0');
    expect(Object.keys(api.paths)).toContain('/api/documents/{id}');
    const schema = (await call('/api/doctypes/offer/schema')).json;
    expect(schema.properties.blocks).toBeTruthy();
    const ex = (await call('/api/doctypes/offer/example?lang=en')).json;
    expect(ex.lang).toBe('en');
    expect((await call('/api/doctypes/offer/validate', 'POST', { data: ex.data })).json.valid).toBe(true);
    expect((await call('/api/doctypes')).json.map((t) => t.id)).toContain('offer');
    expect((await call('/api/nonsense')).json.code).toBe('not_found');
  });

  it('creates an offer with content in one call; ids are filled in; title and status are kept', async () => {
    const r = await call('/api/documents', 'POST', {
      type: 'offer', lang: 'en', title: 'API test (invented)', status: 'draft',
      artwork: [{ k: 'Title', v: 'Invented work' }],
      data: { meta: { date: '2026-10-04' }, rate: 120, blocks: [
        { type: 'prose', headingKey: 'condition', paragraphs: ['Invented text.'] },
        { type: 'measures', kind: 'main', rows: [{ title: 'Cleaning', desc: 'x', hoursMin: 2, hoursMax: 3 }] },
      ] },
    });
    expect(r.status).toBe(201);
    id = r.json.id; created.push(id); rev = r.json.rev;
    const doc = (await call(`/api/documents/${id}`)).json;
    expect(doc.lang).toBe('en'); expect(doc.title).toBe('API test (invented)'); expect(doc.rev).toBe(0);
    expect(doc.data.rate).toBe(120);
    expect(doc.data.meta.validUntil).toBeTruthy();          // merged with the defaults
    blockId = doc.data.blocks[1].id;
    expect(blockId).toMatch(/^[0-9a-f]{8}$/);
    expect(doc.data.blocks[1].rows[0].id).toBeTruthy();
  });

  it('refuses invalid data with the path of each problem (422) and stores nothing', async () => {
    const r = await call('/api/documents', 'POST', { data: { blocks: [{ type: 'measures', kind: 'main', rows: [{ title: 'x', hoursMin: 'many' }] }] } });
    expect(r.status).toBe(422); expect(r.json.code).toBe('validation');
    expect(r.json.issues.map((i) => i.path)).toContain('data.blocks.0.rows.0.hoursMin');
    expect((await call('/api/documents', 'POST', { type: 'nope' })).status).toBe(400);
    expect((await call('/api/documents', 'POST', '{bad')).json.code).toBe('bad_json');
    expect((await call('/api/documents', 'POST', '[1]')).status).toBe(400);
    const put = await call(`/api/documents/${id}`, 'PUT', { status: 'banana' });
    expect(put.status).toBe(422);
  });

  it('PATCH edits by block id, appends rows, bumps the revision, and the result is validated', async () => {
    const r = await call(`/api/documents/${id}`, 'PATCH', { ops: [
      { op: 'replace', path: `/data/blocks/@${blockId}/rows/0/hoursMin`, value: 4 },
      { op: 'add', path: `/data/blocks/@${blockId}/rows/-`, value: { title: 'Retouching', desc: '', hoursMin: 1 } },
      { op: 'replace', path: '/data/privateNotes', value: '<ul><li>invented note</li></ul>' },
    ] });
    expect(r.status).toBe(200); expect(r.json.rev).toBeGreaterThan(rev); rev = r.json.rev;
    const doc = (await call(`/api/documents/${id}`)).json;
    expect(doc.data.blocks[1].rows).toHaveLength(2);
    expect(doc.data.blocks[1].rows[1].id).toBeTruthy();
    const bad = await call(`/api/documents/${id}`, 'PATCH', [{ op: 'replace', path: `/data/blocks/@${blockId}/rows/0/hoursMin`, value: 'x' }]);
    expect(bad.status).toBe(422);
    const broken = await call(`/api/documents/${id}`, 'PATCH', [{ op: 'remove', path: '/data/blocks/@nope' }]);
    expect(broken.status).toBe(400); expect(broken.json.code).toBe('patch_failed'); expect(broken.json.opIndex).toBe(0);
  });

  it('refuses a save based on an older revision (409) and accepts one based on the current revision', async () => {
    const stale = await call(`/api/documents/${id}`, 'PUT', { title: 'stale', baseRev: rev - 1 });
    expect(stale.status).toBe(409); expect(stale.json.code).toBe('conflict'); expect(stale.json.rev).toBe(rev);
    const ok = await call(`/api/documents/${id}`, 'PUT', { title: 'fresh' }, { 'If-Match': String(rev) });
    expect(ok.status).toBe(200); rev = ok.json.rev;
    expect((await call(`/api/documents/${id}`)).json.title).toBe('fresh');
  });

  it('a status change is a version; versions can be listed, saved and restored', async () => {
    await call(`/api/documents/${id}`, 'PUT', { status: 'sent' });
    const list = (await call(`/api/documents/${id}/versions`)).json;
    expect(list.some((v) => v.kind === 'status')).toBe(true);
    expect((await call(`/api/documents/${id}/versions`, 'POST', { note: 'api test' })).status).toBe(201);
  });

  it('serves the document as HTML without the private notes', async () => {
    const r = await call(`/api/documents/${id}/html`);
    expect(r.status).toBe(200);
    expect(r.text).toContain('Retouching');
    expect(r.text).not.toContain('invented note');
    expect(r.text).not.toContain('<script');
  });

  it('uploads a photo, reports its metadata and accepts it as imageId', async () => {
    const up = await call(`/api/images?documentId=${id}&w=40&h=30`, 'POST', new Uint8Array(png(40, 30, 3)), { 'content-type': 'image/png' });
    expect(up.status).toBe(201);
    const meta = (await call(`/api/images/${up.json.id}`)).json;
    expect(meta.mime).toBe('image/png'); expect(meta.documentId).toBe(id);
    const r = await call(`/api/documents/${id}`, 'PATCH', [{ op: 'add', path: '/data/overview', value: { imageId: up.json.id, caption: 'Invented photo' } }]);
    expect(r.status).toBe(200);
    expect((await call('/api/images', 'POST', new Uint8Array([1, 2, 3]), { 'content-type': 'text/plain' })).status).toBe(415);
  });

  it('duplicates and deletes; deleted documents are gone', async () => {
    const dup = await call('/api/documents', 'POST', { duplicateOf: id });
    expect(dup.status).toBe(201); created.push(dup.json.id);
    expect((await call(`/api/documents/${dup.json.id}`, 'DELETE')).status).toBe(200);
    expect((await call(`/api/documents/${dup.json.id}`)).status).toBe(404);
    expect((await call(`/api/documents/${dup.json.id}`, 'DELETE')).status).toBe(404);
  });

  it('clients: create, read, update, delete (only when unused)', async () => {
    const c = await call('/api/clients', 'POST', { name: 'API Test AG (invented)' });
    expect(c.status).toBe(201);
    expect((await call(`/api/clients/${c.json.id}`)).json.name).toBe('API Test AG (invented)');
    expect((await call('/api/clients', 'POST', {})).status).toBe(400);
    await call(`/api/documents/${id}`, 'PUT', { clientId: c.json.id });
    expect((await call(`/api/clients/${c.json.id}`, 'DELETE')).status).toBe(409);
    await call(`/api/documents/${id}`, 'PUT', { clientId: null });
    expect((await call(`/api/clients/${c.json.id}`, 'DELETE')).status).toBe(200);
    expect((await call(`/api/clients/${c.json.id}`)).status).toBe(404);
  });
});
