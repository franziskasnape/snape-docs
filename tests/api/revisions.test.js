// Issued revisions through the HTTP API: sending freezes a copy, editing starts the next revision, accepted offers lock.
// Invented content only; every offer created here is deleted afterwards.
import { afterAll, describe, expect, it } from 'vitest';

const BASE = (process.env.SNAPE_URL ?? 'http://localhost:8787').replace(/\/$/, '');
const call = async (path, method = 'GET', body) => {
  const r = await fetch(BASE + path, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body && JSON.stringify(body) });
  const text = await r.text(); let json; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, json, text };
};
let up = false;
try { up = (await fetch(BASE + '/api/health')).ok; } catch { /* not running */ }
if (!up) console.warn(`Revision tests skipped: no app at ${BASE}.`);
const d = up ? describe : describe.skip;
const created = [];
afterAll(async () => { for (const id of created) await call(`/api/documents/${id}`, 'DELETE'); });

const make = async (text = 'Erster Text der Revision A.') => {
  const r = await call('/api/documents', 'POST', { title: 'revisions (invented)', lang: 'de', artwork: [{ k: 'Titel', v: 'Erfunden' }], data: { blocks: [
    { type: 'prose', headingKey: 'condition', paragraphs: [text] },
    { type: 'measures', kind: 'main', rows: [{ title: 'Reinigung', desc: 'x', hoursMin: 2, hoursMax: 3 }] }] } });
  created.push(r.json.id); return r.json.id;
};
const get = async (id) => (await call(`/api/documents/${id}`)).json;
const edit = (id, text) => call(`/api/documents/${id}`, 'PATCH', [{ op: 'replace', path: '/data/blocks/0/paragraphs/0', value: text }]);

d('revisions', () => {
  it('marking as sent freezes revision A with its date, note and headline figures', async () => {
    const id = await make();
    const r = await call(`/api/documents/${id}`, 'PUT', { status: 'sent', statusDate: '2026-10-08', statusNote: 'per E-Mail' });
    expect(r.status).toBe(200); expect(r.json.status).toBe('sent');
    const doc = await get(id);
    expect(doc.revisionLabel).toBe('A'); expect(doc.revisions).toHaveLength(1);
    expect(doc.revisions[0]).toMatchObject({ label: 'A', status: 'sent', sentAt: '2026-10-08', sentNote: 'per E-Mail' });
    expect(doc.revisions[0].summary).toMatchObject({ hoursMin: 2, hoursMax: 3, chfMin: 200, chfMax: 300 });
    const rev = (await call(`/api/documents/${id}/revisions/1`)).json;
    expect(rev.snapshot.data.blocks[0].paragraphs[0]).toBe('Erster Text der Revision A.');
    expect(rev.snapshot.artwork[0].v).toBe('Erfunden');
  });

  it('changing a sent offer starts revision B; revision A stays exactly as sent and can still be printed', async () => {
    const id = await make();
    await call(`/api/documents/${id}`, 'PUT', { status: 'sent', statusDate: '2026-10-08' });
    const r = await edit(id, 'Geänderter Text der Revision B.');
    expect(r.status).toBe(200); expect(r.json.newRevisionStarted).toBe(true);
    expect(r.json).toMatchObject({ status: 'draft', revision: 2, revisionLabel: 'B' });
    const doc = await get(id);
    expect(doc.data.blocks[0].paragraphs[0]).toBe('Geänderter Text der Revision B.');
    expect(doc.data.meta.dateAuto).toBe(true);                         // a new revision is a new date
    const a = (await call(`/api/documents/${id}/revisions/1/html`)).text;
    expect(a).toContain('Erster Text der Revision A.'); expect(a).not.toContain('Geänderter Text');
    expect(a).not.toContain('Rev. A');                                  // the first revision prints without a revision mark
    const work = (await call(`/api/documents/${id}/html`)).text;
    expect(work).toContain('Geänderter Text'); expect(work).toContain('Rev. B'); expect(work).toContain('Ersetzt Angebot Rev. A vom 08.10.2026');
    expect((await call(`/documents/${id}/revisions/1/print`)).status).toBe(200);
  });

  it('private notes can be edited on a sent offer without starting a revision', async () => {
    const id = await make();
    await call(`/api/documents/${id}`, 'PUT', { status: 'sent' });
    const r = await call(`/api/documents/${id}`, 'PATCH', [{ op: 'add', path: '/data/privateNotes', value: '<ul><li>nur für mich</li></ul>' }]);
    expect(r.json.newRevisionStarted).toBe(false); expect(r.json.revision).toBe(1); expect(r.json.status).toBe('sent');
    expect((await call(`/api/documents/${id}/revisions/1`)).text).not.toContain('nur für mich');   // never part of what was sent
  });

  it('sending revision B marks A as replaced; the client answer belongs to one revision', async () => {
    const id = await make();
    await call(`/api/documents/${id}`, 'PUT', { status: 'sent', statusDate: '2026-10-08' });
    await edit(id, 'Text B');
    expect((await call(`/api/documents/${id}`, 'PUT', { status: 'sent', statusDate: '2026-10-20' })).status).toBe(200);
    let doc = await get(id);
    expect(doc.revisions.map((r) => [r.label, r.status])).toEqual([['A', 'superseded'], ['B', 'sent']]);
    expect((await call(`/api/documents/${id}/revisions/1/decision`, 'POST', { status: 'accepted' })).status).toBe(422);   // A was replaced
    const ok = await call(`/api/documents/${id}`, 'PUT', { status: 'accepted', statusDate: '2026-10-22', statusNote: 'per Telefon' });
    expect(ok.status).toBe(200);
    doc = await get(id);
    expect(doc.status).toBe('accepted'); expect(doc.revisions[1]).toMatchObject({ status: 'accepted', decidedAt: '2026-10-22', decidedNote: 'per Telefon' });
  });

  it('an accepted offer is locked until "Create amendment", which starts the next revision', async () => {
    const id = await make();
    await call(`/api/documents/${id}`, 'PUT', { status: 'sent' });
    await call(`/api/documents/${id}`, 'PUT', { status: 'accepted' });
    const locked = await edit(id, 'Versuch');
    expect(locked.status).toBe(409); expect(locked.json.code).toBe('locked');
    expect((await get(id)).data.blocks[0].paragraphs[0]).toBe('Erster Text der Revision A.');
    const am = await call(`/api/documents/${id}/amend`, 'POST');
    expect(am.status).toBe(201); expect(am.json).toMatchObject({ revision: 2, label: 'B', status: 'draft' });
    expect((await edit(id, 'Nach der Änderung')).status).toBe(200);
    const doc = await get(id);
    expect(doc.revisions).toHaveLength(1); expect(doc.revisions[0].status).toBe('accepted');   // A stays accepted
    expect((await call(`/api/documents/${id}/amend`, 'POST')).status).toBe(422);               // already a draft
  });

  it('declined and withdrawn are recorded; decisions can be undone; wrong moves are refused with a reason', async () => {
    const id = await make();
    const bad = await call(`/api/documents/${id}`, 'PUT', { status: 'accepted' });
    expect(bad.status).toBe(422); expect(bad.json.code).toBe('invalid_transition'); expect(bad.json.error).toMatch(/mark it as sent first/);
    await call(`/api/documents/${id}`, 'PUT', { status: 'sent' });
    expect((await call(`/api/documents/${id}`, 'PUT', { status: 'draft' })).json.error).toMatch(/editing it|Create amendment/);
    expect((await call(`/api/documents/${id}`, 'PUT', { status: 'withdrawn', statusNote: 'zurückgezogen' })).status).toBe(200);
    expect((await get(id)).status).toBe('withdrawn');
    expect((await call(`/api/documents/${id}/revisions/1/decision`, 'DELETE')).status).toBe(200);
    expect((await get(id)).status).toBe('sent');
    expect((await call(`/api/documents/${id}/revisions/1/decision`, 'POST', { status: 'declined', at: '2026-10-25' })).status).toBe(200);
    // withdrawn / declined offers are not locked: a change starts a new revision
    expect((await edit(id, 'Neuer Anlauf')).json.revision).toBe(2);
    expect((await call(`/api/documents/${id}/revisions/1/decision`, 'POST', { status: 'accepted' })).status).toBe(422);   // already declined
    expect((await call(`/api/documents/${id}`, 'PUT', { status: 'banana' })).status).toBe(422);
  });

  it('dates and notes can be corrected, and a sent record taken back while no answer is recorded', async () => {
    const id = await make();
    await call(`/api/documents/${id}`, 'PUT', { status: 'sent', statusDate: '2026-10-01' });
    expect((await call(`/api/documents/${id}/revisions/1`, 'PATCH', { sentAt: '2026-10-02', note: 'korrigiert' })).status).toBe(200);
    expect((await get(id)).revisions[0]).toMatchObject({ sentAt: '2026-10-02', sentNote: 'korrigiert' });
    expect((await call(`/api/documents/${id}/revisions/1`, 'PATCH', { sentAt: '2.10.2026' })).status).toBe(422);
    expect((await call(`/api/documents/${id}/revisions/1`, 'DELETE')).status).toBe(200);
    const doc = await get(id);
    expect(doc.status).toBe('draft'); expect(doc.revisions).toHaveLength(0);
    expect((await call(`/api/documents/${id}/revisions/1`, 'DELETE')).status).toBe(422);
  });

  it('copying a sent revision gives a new draft with exactly that content', async () => {
    const id = await make();
    await call(`/api/documents/${id}`, 'PUT', { status: 'sent' });
    await edit(id, 'Text von B');
    const dup = await call('/api/documents', 'POST', { duplicateOf: id, revision: 1 });
    expect(dup.status).toBe(201); created.push(dup.json.id);
    const copy = await get(dup.json.id);
    expect(copy.data.blocks[0].paragraphs[0]).toBe('Erster Text der Revision A.');
    expect(copy.status).toBe('draft'); expect(copy.revisions).toHaveLength(0);
    expect((await call('/api/documents', 'POST', { duplicateOf: id, revision: 5 })).status).toBe(404);
  });

  it('restoring a history version into a sent offer starts a new revision and never restores the status', async () => {
    const id = await make();
    await edit(id, 'Zwischenstand');
    await call(`/api/documents/${id}/versions`, 'POST', { note: 'checkpoint' });
    await edit(id, 'Endstand');
    await call(`/api/documents/${id}`, 'PUT', { status: 'sent' });
    const v = (await call(`/api/documents/${id}/versions`)).json.find((x) => x.note === 'checkpoint');
    const r = await call(`/api/documents/${id}/versions/${v.id}/restore`, 'POST');
    expect(r.status).toBe(200);
    const doc = await get(id);
    expect(doc.revision).toBe(2); expect(doc.status).toBe('draft');
    expect(doc.data.blocks[0].paragraphs[0]).toBe('Zwischenstand');
    expect((await call(`/api/documents/${id}/revisions/1`)).json.snapshot.data.blocks[0].paragraphs[0]).toBe('Endstand');   // A is untouched
  });

  it('an offer sent before revisions existed can be recorded from its history (fromVersion)', async () => {
    const id = await make();
    await edit(id, 'Gesendeter Stand');
    await call(`/api/documents/${id}/versions`, 'POST', { note: 'as sent' });
    await edit(id, 'Danach geändert');
    const v = (await call(`/api/documents/${id}/versions`)).json.find((x) => x.note === 'as sent');
    const r = await call(`/api/documents/${id}/revisions`, 'POST', { fromVersion: v.id, sentAt: '2026-10-08', note: 'nachgetragen' });
    expect(r.status).toBe(201);
    const doc = await get(id);
    expect(doc.revisions[0]).toMatchObject({ label: 'A', sentAt: '2026-10-08', sentNote: 'nachgetragen' });
    const html = (await call(`/api/documents/${id}/revisions/1/html`)).text;
    expect(html).toContain('Gesendeter Stand'); expect(html).not.toContain('Danach geändert');   // frozen from the history version, not from the later edit
    expect((await get(id)).data.blocks[0].paragraphs[0]).toBe('Danach geändert');                 // the working copy is untouched
  });

  it('refuses a sent date that is not a date', async () => {
    const id = await make();
    const ok = await call(`/api/documents/${id}`, 'PUT', { status: 'sent', statusDate: '8.10.2026' });
    expect(ok.status).toBe(422);
  });
});
