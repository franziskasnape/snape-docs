import { Hono } from 'hono';
import { getDocument, type DocRow, type Env } from '../core/db';
import { getDocType } from '../core/registry';
import { upgrade } from '../core/migrate';
import { ensureIds } from '../core/validate';
import { decide, editRevisionMeta, getRevisionRow, listRevisionRows, markSent, publicRevision, RevisionError, startNextRevision, undoDecision, unsend } from '../core/revisions';
import { revLabel } from '../core/status';
import { revisionHtml } from '../core/revisionRender';
/** Issued revisions of a document, mounted at /api/documents/:id/revisions */
export const revisions = new Hono<{ Bindings: Env }>();

const fail = (c: any, e: unknown) => {
  if (e instanceof RevisionError) return c.json({ error: e.message, code: e.code, ...(e.issues ? { issues: e.issues } : {}) }, e.status);
  throw e;
};
async function load(c: any): Promise<DocRow | null> { return getDocument(c.env, Number(c.req.param('id'))); }
const notFound = (c: any, what = 'not found') => c.json({ error: what, code: 'not_found' }, 404);
const revNoOf = (c: any) => Number(c.req.param('n'));
const asDate = (v: unknown) => (typeof v === 'string' ? v : undefined);
const asNote = (v: unknown) => (typeof v === 'string' ? v.trim().slice(0, 500) : undefined);

// List: every revision that was sent, oldest first, with dates, notes and headline figures
revisions.get('/', async (c) => {
  const doc = await load(c); if (!doc) return notFound(c);
  const dt = getDocType(doc.type);
  return c.json({ current: { revision: doc.revision, label: revLabel(doc.revision), status: doc.status }, revisions: (await listRevisionRows(c.env, doc.id)).map((r) => publicRevision(r, dt)) });
});

// Mark the current revision as sent. Body (all optional): {sentAt, note, fromVersion}. fromVersion = a history version id to freeze
// instead of the current state: for an offer that was sent before revisions existed.
revisions.post('/', async (c) => {
  const doc = await load(c); if (!doc) return notFound(c);
  const b = await c.req.json<any>().catch(() => ({}));
  try {
    let from;
    if (b.fromVersion !== undefined) {
      const v = await c.env.DB.prepare('SELECT data FROM document_versions WHERE id = ? AND document_id = ?').bind(Number(b.fromVersion), doc.id).first<{ data: string }>();
      if (!v) return notFound(c, 'no such history version');
      const raw = JSON.parse(v.data), snap = raw.data ? raw : { data: raw };
      from = { data: ensureIds(upgrade(getDocType(doc.type), snap.data)), artwork: snap.artwork ?? [], clientId: snap.clientId ?? doc.client_id, title: snap.title };
    }
    await markSent(c.env, doc, { sentAt: asDate(b.sentAt), note: asNote(b.note), from });
  } catch (e) { return fail(c, e); }
  const now = (await getDocument(c.env, doc.id))!;
  return c.json({ ok: true, revision: now.revision, label: revLabel(now.revision), status: now.status, rev: now.rev }, 201);
});

// One revision with its frozen snapshot
revisions.get('/:n', async (c) => {
  const doc = await load(c); if (!doc) return notFound(c);
  const row = await getRevisionRow(c.env, doc.id, revNoOf(c)); if (!row) return notFound(c, 'that revision was never sent');
  return c.json({ ...publicRevision(row, getDocType(doc.type)), snapshot: JSON.parse(row.snapshot) });
});

// The revision exactly as it was sent, as HTML (images as absolute URLs)
revisions.get('/:n/html', async (c) => {
  const doc = await load(c); if (!doc) return notFound(c);
  const row = await getRevisionRow(c.env, doc.id, revNoOf(c)); if (!row) return notFound(c, 'that revision was never sent');
  return c.html(await revisionHtml(c.env, doc, row, new URL(c.req.url).origin));
});

// Edit dates and notes: {sentAt, note, decidedAt, decidedNote}
revisions.patch('/:n', async (c) => {
  const doc = await load(c); if (!doc) return notFound(c);
  const b = await c.req.json<any>().catch(() => ({}));
  try { await editRevisionMeta(c.env, doc, revNoOf(c), { sentAt: asDate(b.sentAt), sentNote: b.note === undefined ? undefined : asNote(b.note), decidedAt: asDate(b.decidedAt), decidedNote: b.decidedNote === undefined ? undefined : asNote(b.decidedNote) }); } catch (e) { return fail(c, e); }
  return c.json({ ok: true });
});

// Record the client's answer: {status: accepted | declined | withdrawn, at, note}
revisions.post('/:n/decision', async (c) => {
  const doc = await load(c); if (!doc) return notFound(c);
  const b = await c.req.json<any>().catch(() => ({}));
  try { await decide(c.env, doc, revNoOf(c), String(b.status ?? ''), { at: asDate(b.at), note: asNote(b.note) }); } catch (e) { return fail(c, e); }
  return c.json({ ok: true });
});
revisions.delete('/:n/decision', async (c) => {
  const doc = await load(c); if (!doc) return notFound(c);
  try { await undoDecision(c.env, doc, revNoOf(c)); } catch (e) { return fail(c, e); }
  return c.json({ ok: true });
});

// Take back the latest "sent" record (marked by mistake). Revisions are permanent otherwise.
revisions.delete('/:n', async (c) => {
  const doc = await load(c); if (!doc) return notFound(c);
  if (revNoOf(c) !== doc.revision) return c.json({ error: 'only the latest revision can be taken back', code: 'invalid_transition' }, 422);
  try { await unsend(c.env, doc); } catch (e) { return fail(c, e); }
  return c.json({ ok: true });
});

export const amend = async (c: any) => {
  const doc = await load(c); if (!doc) return notFound(c);
  if (doc.status === 'draft') return c.json({ error: 'this revision is already a draft', code: 'invalid_transition' }, 422);
  const now = await startNextRevision(c.env, doc);
  return c.json({ ok: true, revision: now.revision, label: revLabel(now.revision), status: now.status, rev: now.rev }, 201);
};
