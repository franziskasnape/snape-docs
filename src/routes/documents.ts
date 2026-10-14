import { Hono } from 'hono';
import { buildContext, getDocument, getSettings, nextNumber, parseData, type Env } from '../core/db';
import { needsUpgrade, upgrade } from '../core/migrate';
import { todayInStudioZone } from '../core/format';
import { hostPage } from '../core/render/host';
import { getDocType, docTypes } from '../core/registry';
import { checkData, ensureIds, snapshotProblems } from '../core/validate';
import { checkEnvelope, documentCreate, documentWrite } from '../core/envelope';
import { applyPatch, PatchError } from '../core/jsonpatch';
import type { Lang } from '../core/types';

export const documents = new Hono<{ Bindings: Env }>();

const AUTO_EVERY_MIN = 10;   // at most one automatic checkpoint per 10 minutes of editing
const AUTO_KEEP = 100;       // oldest automatic checkpoints are pruned; manual/status/restore versions are kept

/** Full restorable state of a document: everything the editor can change. */
async function snapshotOf(env: Env, doc: NonNullable<Awaited<ReturnType<typeof getDocument>>>) {
  const art = doc.artwork_id ? await env.DB.prepare('SELECT fields FROM artworks WHERE id = ?').bind(doc.artwork_id).first<{ fields: string }>() : null;
  return JSON.stringify({ title: doc.title, status: doc.status, clientId: doc.client_id, artwork: art ? JSON.parse(art.fields) : [], data: parseData(doc) });
}

async function saveVersion(env: Env, doc: NonNullable<Awaited<ReturnType<typeof getDocument>>>, kind: string, note?: string | null) {
  await env.DB.prepare('INSERT INTO document_versions (document_id, data, note, kind) VALUES (?,?,?,?)').bind(doc.id, await snapshotOf(env, doc), note || null, kind).run();
  if (kind === 'auto') await env.DB.prepare(`DELETE FROM document_versions WHERE document_id = ? AND kind = 'auto' AND id NOT IN (SELECT id FROM document_versions WHERE document_id = ? AND kind = 'auto' ORDER BY id DESC LIMIT ?)`).bind(doc.id, doc.id, AUTO_KEEP).run();
}

// List (optionally filtered by type)
documents.get('/', async (c) => {
  const type = c.req.query('type');
  const sql = `SELECT d.id, d.type, d.number, d.lang, d.status, d.title, d.updated_at, d.rev, d.client_id, c.name AS client
    FROM documents d LEFT JOIN clients c ON c.id = d.client_id ${type ? 'WHERE d.type = ?' : ''} ORDER BY d.updated_at DESC, d.id DESC`;
  const stmt = c.env.DB.prepare(sql);
  const { results } = await (type ? stmt.bind(type) : stmt).all();
  return c.json(results);
});

// Create: new, or copy of an existing document
documents.post('/', async (c) => {
  const body = await c.req.json<{ type?: string; lang?: Lang; clientId?: number; duplicateOf?: number; title?: string; status?: string; artwork?: { k: string; v: string }[]; data?: any }>();
  const today = todayInStudioZone();
  const settings = await getSettings(c.env);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return c.json({ error: 'the body must be a JSON object', code: 'bad_request' }, 400);

  if (body.duplicateOf) {
    const src = await getDocument(c.env, body.duplicateOf);
    if (!src) return c.json({ error: 'not found' }, 404);
    const dt = getDocType(src.type);
    const number = await nextNumber(c.env, dt.prefix, new Date().getFullYear());
    let artworkId: number | null = null;
    if (src.artwork_id) {
      const a = await c.env.DB.prepare('SELECT client_id, fields, overview_image_id FROM artworks WHERE id = ?').bind(src.artwork_id).first<any>();
      artworkId = (await c.env.DB.prepare('INSERT INTO artworks (client_id, fields, overview_image_id) VALUES (?,?,?)').bind(a.client_id, a.fields, a.overview_image_id).run()).meta.last_row_id as number;
    }
    const data = parseData(src);
    if (data.meta) { data.meta.date = today; }
    const id = (await c.env.DB.prepare(
      `INSERT INTO documents (type, number, lang, status, client_id, artwork_id, parent_id, title, data) VALUES (?,?,?,?,?,?,?,?,?)`
    ).bind(src.type, number, src.lang, 'draft', src.client_id, artworkId, null, src.title, JSON.stringify(data)).run()).meta.last_row_id;
    return c.json({ id, number }, 201);
  }

  const dt = getDocType(body.type ?? 'offer');
  if (!dt) return c.json({ error: `unknown type, expected one of ${Object.keys(docTypes)}`, code: 'unknown_type' }, 400);
  const lang = body.lang ?? settings.defaultLang;
  const envelope = checkEnvelope(documentCreate(dt), body);
  if (envelope) return c.json({ error: 'validation failed', code: 'validation', issues: envelope }, 422);
  // `data` may be partial: top-level keys replace the defaults, `meta` and `cost` are merged into them
  const base: any = dt.defaultData(lang, settings, today);
  const merged: any = body.data ? { ...base, ...body.data, meta: { ...base.meta, ...body.data.meta }, cost: { ...base.cost, ...body.data.cost } } : base;
  if (body.data && body.data.v === undefined) merged.v = dt.schemaVersion;      // data written without a version is taken as the current one
  const data: any = ensureIds(upgrade(dt, merged));
  const issues = checkData(dt, data);
  if (issues) return c.json({ error: 'validation failed', code: 'validation', issues }, 422);
  const number = await nextNumber(c.env, dt.prefix, new Date().getFullYear());
  const art = (await c.env.DB.prepare('INSERT INTO artworks (client_id, fields) VALUES (?,?)')
    .bind(body.clientId ?? null, JSON.stringify(body.artwork ?? dt.defaultArtwork(lang))).run()).meta.last_row_id;
  const id = (await c.env.DB.prepare(
    `INSERT INTO documents (type, number, lang, status, client_id, artwork_id, title, data) VALUES (?,?,?,?,?,?,?,?)`
  ).bind(dt.id, number, lang, body.status ?? 'draft', body.clientId ?? null, art, body.title ?? null, JSON.stringify(data)).run()).meta.last_row_id;
  return c.json({ id, number, rev: 0 }, 201);
});

// Read one document with its client + artwork
documents.get('/:id', async (c) => {
  const doc = await getDocument(c.env, Number(c.req.param('id')));
  if (!doc) return c.json({ error: 'not found' }, 404);
  const client = doc.client_id ? await c.env.DB.prepare('SELECT * FROM clients WHERE id = ?').bind(doc.client_id).first() : null;
  const art = doc.artwork_id ? await c.env.DB.prepare('SELECT fields FROM artworks WHERE id = ?').bind(doc.artwork_id).first<{ fields: string }>() : null;
  const dt = getDocType(doc.type), data = parseData(doc);
  if (needsUpgrade(dt, JSON.parse(doc.data))) {      // persist the upgrade on first open (does not count as an edit)
    await c.env.DB.prepare('UPDATE documents SET data = ? WHERE id = ?').bind(JSON.stringify(data), doc.id).run();
  }
  return c.json({
    id: doc.id, type: doc.type, number: doc.number, lang: doc.lang, status: doc.status, title: doc.title,
    clientId: doc.client_id, client, artwork: art ? JSON.parse(art.fields) : [], data, schemaVersion: dt.schemaVersion, updatedAt: doc.updated_at, rev: doc.rev,
  });
});

type Doc = NonNullable<Awaited<ReturnType<typeof getDocument>>>;

/** Shared by PUT and PATCH: validate, keep history, write, bump the revision. `b` is any subset of {title,status,lang,clientId,artwork,data}. */
async function saveDoc(c: any, doc: Doc, b: any, baseRev: number | undefined) {
  const dt = getDocType(doc.type);
  if (baseRev !== undefined && baseRev !== doc.rev)
    return c.json({ error: 'The document was changed by someone else since you read it. Read it again and redo the change.', code: 'conflict', rev: doc.rev, updatedAt: doc.updated_at }, 409);
  const envelope = checkEnvelope(documentWrite(dt), b);
  if (envelope) return c.json({ error: 'validation failed', code: 'validation', issues: envelope }, 422);
  if (b.data) {
    b.data = ensureIds(upgrade(dt, b.data));                // a stale editor tab may still send an older shape
    const issues = checkData(dt, b.data);
    if (issues) return c.json({ error: 'validation failed', code: 'validation', issues }, 422);   // never store data that cannot be printed properly
  }
  // keep history: snapshot the state *before* this save on status changes, and as a periodic checkpoint
  if (b.status && b.status !== doc.status) await saveVersion(c.env, doc, 'status', `Status: ${doc.status} → ${b.status}`);
  else {
    const last = await c.env.DB.prepare('SELECT created_at FROM document_versions WHERE document_id = ? ORDER BY id DESC LIMIT 1').bind(doc.id).first();
    const ageMin = last ? (Date.now() - new Date((last as any).created_at.replace(' ', 'T') + 'Z').getTime()) / 60000 : Infinity;
    if (ageMin > AUTO_EVERY_MIN && b.data && JSON.stringify(b.data) !== JSON.stringify(parseData(doc))) await saveVersion(c.env, doc, 'auto');
  }
  await c.env.DB.prepare(
    `UPDATE documents SET title = ?, status = ?, lang = ?, client_id = ?, data = ?, rev = rev + 1, updated_at = datetime('now') WHERE id = ?`
  ).bind(b.title === undefined ? doc.title : b.title, b.status ?? doc.status, b.lang ?? doc.lang, b.clientId === undefined ? doc.client_id : b.clientId,
    b.data ? JSON.stringify(b.data) : doc.data, doc.id).run();
  if (b.artwork && doc.artwork_id) await c.env.DB.prepare('UPDATE artworks SET fields = ? WHERE id = ?').bind(JSON.stringify(b.artwork), doc.artwork_id).run();
  const now = await getDocument(c.env, doc.id);
  return c.json({ ok: true, rev: now!.rev, updatedAt: now!.updated_at });
}

const baseRevOf = (c: any, body: any): number | undefined => {
  const h = c.req.header('if-match')?.replace(/"/g, '');
  const v = body?.baseRev ?? (h !== undefined && h !== '' ? Number(h) : undefined);
  return v === undefined || v === null || Number.isNaN(Number(v)) ? undefined : Number(v);
};

// Save (replace): any subset of {title,status,lang,clientId,artwork,data}; optional baseRev / If-Match for conflict detection
documents.put('/:id', async (c) => {
  const doc = await getDocument(c.env, Number(c.req.param('id')));
  if (!doc) return c.json({ error: 'not found', code: 'not_found' }, 404);
  const b = await c.req.json<any>();
  return saveDoc(c, doc, b, baseRevOf(c, b));
});

// Edit with JSON Patch (RFC 6902) on {title,status,lang,clientId,artwork,data}. Body: an array of operations, or {ops, baseRev}.
// A path segment "@<id>" addresses the array item with that id (e.g. /data/blocks/@c4f75ceb/rows/-).
documents.patch('/:id', async (c) => {
  const doc = await getDocument(c.env, Number(c.req.param('id')));
  if (!doc) return c.json({ error: 'not found', code: 'not_found' }, 404);
  const body = await c.req.json<any>();
  const ops = Array.isArray(body) ? body : body?.ops;
  if (!Array.isArray(ops)) return c.json({ error: 'body must be an array of JSON Patch operations, or {"ops": [...], "baseRev": n}', code: 'bad_request' }, 400);
  const art = doc.artwork_id ? await c.env.DB.prepare('SELECT fields FROM artworks WHERE id = ?').bind(doc.artwork_id).first<{ fields: string }>() : null;
  const view = { title: doc.title, status: doc.status, lang: doc.lang, clientId: doc.client_id, artwork: art ? JSON.parse(art.fields) : [], data: parseData(doc) };
  let next: any;
  try { next = applyPatch(view, ops); } catch (e) {
    if (e instanceof PatchError) return c.json({ error: e.message, code: 'patch_failed', opIndex: e.index }, 400);
    throw e;
  }
  return saveDoc(c, doc, next, baseRevOf(c, Array.isArray(body) ? {} : body));
});

documents.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!(await getDocument(c.env, id))) return c.json({ error: 'not found', code: 'not_found' }, 404);
  // images may be shared with duplicates: detach instead of cascading
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE images SET document_id = NULL WHERE document_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM documents WHERE id = ?').bind(id),
  ]);
  return c.json({ ok: true });
});

// Live preview: lay out an unsaved state (same shape as GET /:id) and return a host page for an <iframe>
documents.post('/render', async (c) => {
  const b = await c.req.json<any>();
  const dt = getDocType(b.type ?? 'offer');
  const origin = new URL(c.req.url).origin;
  const base = await buildContext(c.env, { client_id: b.clientId ?? null, artwork_id: null, number: b.number, lang: b.lang } as any, (id) => `${origin}/img/${id}`, JSON.stringify(b.data));
  const documentHtml = dt.render(upgrade(dt, b.data), { ...base, client: b.client ?? base.client, artwork: b.artwork ?? [] }, { cssHref: `${origin}/house.css`, sealSrc: `${origin}/seal.png` });
  return c.html(hostPage({ documentHtml, mode: 'preview', lang: b.lang }));
});

// Default (computed) cost text for the "edit manually" box
documents.post('/cost-text', async (c) => {
  const b = await c.req.json<any>();
  const dt = getDocType(b.type ?? 'offer');
  return c.json({ html: dt.costText?.(upgrade(dt, b.data), b.lang) ?? '' });
});

// The document itself as script-free HTML (A4 flow, house design), images as absolute URLs: for previews, checks or other renderers
documents.get('/:id/html', async (c) => {
  const doc = await getDocument(c.env, Number(c.req.param('id')));
  if (!doc) return c.json({ error: 'not found', code: 'not_found' }, 404);
  const origin = new URL(c.req.url).origin;
  const ctx = await buildContext(c.env, doc, (id) => `${origin}/img/${id}`);
  return c.html(getDocType(doc.type).render(parseData(doc), ctx, { cssHref: `${origin}/house.css`, sealSrc: `${origin}/seal.png` }));
});

// ---- Version history ----
documents.post('/:id/versions', async (c) => {
  const doc = await getDocument(c.env, Number(c.req.param('id')));
  if (!doc) return c.json({ error: 'not found' }, 404);
  const { note } = await c.req.json<{ note?: string }>().catch(() => ({ note: undefined }));
  await saveVersion(c.env, doc, 'manual', note);
  return c.json({ ok: true }, 201);
});

documents.get('/:id/versions', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT id, note, kind, created_at FROM document_versions WHERE document_id = ? ORDER BY id DESC').bind(Number(c.req.param('id'))).all();
  return c.json(results);
});

// One version, normalised to {title,status,clientId,artwork,data} (older rows only stored `data`)
documents.get('/:id/versions/:vid', async (c) => {
  const v = await c.env.DB.prepare('SELECT id, note, kind, created_at, data FROM document_versions WHERE id = ? AND document_id = ?').bind(Number(c.req.param('vid')), Number(c.req.param('id'))).first<any>();
  if (!v) return c.json({ error: 'not found' }, 404);
  const raw = JSON.parse(v.data), snapshot = raw.data ? raw : { data: raw };
  const doc = await getDocument(c.env, Number(c.req.param('id')));
  const dt = getDocType(doc!.type);
  snapshot.data = upgrade(dt, snapshot.data);                              // old snapshots are upgraded on read, never rewritten
  const issues = snapshotProblems(dt, snapshot);
  return c.json({ id: v.id, note: v.note, kind: v.kind, createdAt: v.created_at, snapshot, restorable: !issues, issues: issues ?? [] });
});

// Restore: the current state is saved first, so a restore can itself be undone
documents.post('/:id/versions/:vid/restore', async (c) => {
  const id = Number(c.req.param('id'));
  const doc = await getDocument(c.env, id);
  const v = await c.env.DB.prepare('SELECT data, created_at FROM document_versions WHERE id = ? AND document_id = ?').bind(Number(c.req.param('vid')), id).first<{ data: string; created_at: string }>();
  if (!doc || !v) return c.json({ error: 'not found' }, 404);
  const raw = JSON.parse(v.data), snap = raw.data ? raw : { data: raw };
  snap.data = upgrade(getDocType(doc.type), snap.data);
  const problems = snapshotProblems(getDocType(doc.type), snap);
  if (problems) return c.json({ error: 'This version cannot be restored: it would not be a valid document.', code: 'not_restorable', issues: problems }, 422);
  await saveVersion(c.env, doc, 'restore', 'Saved automatically before a restore');
  await c.env.DB.prepare("UPDATE documents SET data = ?, title = ?, status = ?, client_id = ?, rev = rev + 1, updated_at = datetime('now') WHERE id = ?")
    .bind(JSON.stringify(snap.data), snap.title === undefined ? doc.title : snap.title, snap.status ?? doc.status, snap.clientId === undefined ? doc.client_id : snap.clientId, id).run();
  if (snap.artwork && doc.artwork_id) await c.env.DB.prepare('UPDATE artworks SET fields = ? WHERE id = ?').bind(JSON.stringify(snap.artwork), doc.artwork_id).run();
  return c.json({ ok: true });
});
