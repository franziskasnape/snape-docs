import { Hono } from 'hono';
import { buildContext, getDocument, getSettings, nextNumber, parseData, type Env } from '../core/db';
import { needsUpgrade, upgrade } from '../core/migrate';
import { getDocType, docTypes } from '../core/registry';
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
  const sql = `SELECT d.id, d.type, d.number, d.lang, d.status, d.title, d.updated_at, c.name AS client
    FROM documents d LEFT JOIN clients c ON c.id = d.client_id ${type ? 'WHERE d.type = ?' : ''} ORDER BY d.updated_at DESC, d.id DESC`;
  const stmt = c.env.DB.prepare(sql);
  const { results } = await (type ? stmt.bind(type) : stmt).all();
  return c.json(results);
});

// Create: new, or copy of an existing document
documents.post('/', async (c) => {
  const body = await c.req.json<{ type?: string; lang?: Lang; clientId?: number; duplicateOf?: number }>();
  const today = new Date().toISOString().slice(0, 10);
  const settings = await getSettings(c.env);

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
  if (!dt) return c.json({ error: `unknown type, expected one of ${Object.keys(docTypes)}` }, 400);
  const lang = body.lang ?? settings.defaultLang;
  const number = await nextNumber(c.env, dt.prefix, new Date().getFullYear());
  const art = (await c.env.DB.prepare('INSERT INTO artworks (client_id, fields) VALUES (?,?)')
    .bind(body.clientId ?? null, JSON.stringify(dt.defaultArtwork(lang))).run()).meta.last_row_id;
  const id = (await c.env.DB.prepare(
    `INSERT INTO documents (type, number, lang, client_id, artwork_id, data) VALUES (?,?,?,?,?,?)`
  ).bind(dt.id, number, lang, body.clientId ?? null, art, JSON.stringify(dt.defaultData(lang, settings, today))).run()).meta.last_row_id;
  return c.json({ id, number }, 201);
});

// Read one document with its client + artwork
documents.get('/:id', async (c) => {
  const doc = await getDocument(c.env, Number(c.req.param('id')));
  if (!doc) return c.json({ error: 'not found' }, 404);
  const client = doc.client_id ? await c.env.DB.prepare('SELECT * FROM clients WHERE id = ?').bind(doc.client_id).first() : null;
  const art = doc.artwork_id ? await c.env.DB.prepare('SELECT fields FROM artworks WHERE id = ?').bind(doc.artwork_id).first<{ fields: string }>() : null;
  const data = parseData(doc);
  if (needsUpgrade(getDocType(doc.type), JSON.parse(doc.data))) {      // persist the upgrade on first open (does not count as an edit)
    await c.env.DB.prepare('UPDATE documents SET data = ? WHERE id = ?').bind(JSON.stringify(data), doc.id).run();
  }
  return c.json({
    id: doc.id, type: doc.type, number: doc.number, lang: doc.lang, status: doc.status, title: doc.title,
    clientId: doc.client_id, client, artwork: art ? JSON.parse(art.fields) : [], data, updatedAt: doc.updated_at,
  });
});

// Save: any subset of {title,status,lang,clientId,artwork,data}
documents.put('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const doc = await getDocument(c.env, id);
  if (!doc) return c.json({ error: 'not found' }, 404);
  const b = await c.req.json<any>();
  const dt = getDocType(doc.type);
  if (b.data) b.data = upgrade(dt, b.data);                 // a stale editor tab may still send an older shape
  if (b.status && !dt.statuses.includes(b.status)) return c.json({ error: 'invalid status' }, 400);
  // keep history: snapshot the state *before* this save on status changes, and as a periodic checkpoint
  if (b.status && b.status !== doc.status) await saveVersion(c.env, doc, 'status', `Status: ${doc.status} → ${b.status}`);
  else {
    const last = await c.env.DB.prepare('SELECT created_at FROM document_versions WHERE document_id = ? ORDER BY id DESC LIMIT 1').bind(id).first<{ created_at: string }>();
    const ageMin = last ? (Date.now() - new Date(last.created_at.replace(' ', 'T') + 'Z').getTime()) / 60000 : Infinity;
    if (ageMin > AUTO_EVERY_MIN && b.data && JSON.stringify(b.data) !== JSON.stringify(parseData(doc))) await saveVersion(c.env, doc, 'auto');
  }
  await c.env.DB.prepare(
    `UPDATE documents SET title = ?, status = ?, lang = ?, client_id = ?, data = ?, updated_at = datetime('now') WHERE id = ?`
  ).bind(b.title ?? doc.title, b.status ?? doc.status, b.lang ?? doc.lang, b.clientId === undefined ? doc.client_id : b.clientId,
    b.data ? JSON.stringify(b.data) : doc.data, id).run();
  if (b.artwork && doc.artwork_id) await c.env.DB.prepare('UPDATE artworks SET fields = ? WHERE id = ?').bind(JSON.stringify(b.artwork), doc.artwork_id).run();
  return c.json({ ok: true });
});

documents.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  // images may be shared with duplicates: detach instead of cascading
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE images SET document_id = NULL WHERE document_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM documents WHERE id = ?').bind(id),
  ]);
  return c.json({ ok: true });
});

// Live preview: render an unsaved state (same shape as GET /:id)
documents.post('/render', async (c) => {
  const b = await c.req.json<any>();
  const dt = getDocType(b.type ?? 'offer');
  const base = await buildContext(c.env, { client_id: b.clientId ?? null, artwork_id: null, number: b.number, lang: b.lang } as any, (id) => `/img/${id}`, JSON.stringify(b.data));
  return c.html(dt.render(upgrade(dt, b.data), { ...base, client: b.client ?? base.client, artwork: b.artwork ?? [] }, { embedded: true }));
});

// Default (computed) cost text for the "edit manually" box
documents.post('/cost-text', async (c) => {
  const b = await c.req.json<any>();
  const dt = getDocType(b.type ?? 'offer');
  return c.json({ html: dt.costText?.(upgrade(dt, b.data), b.lang) ?? '' });
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
  snapshot.data = upgrade(getDocType(doc!.type), snapshot.data);          // old snapshots are upgraded on read, never rewritten
  return c.json({ id: v.id, note: v.note, kind: v.kind, createdAt: v.created_at, snapshot });
});

// Restore: the current state is saved first, so a restore can itself be undone
documents.post('/:id/versions/:vid/restore', async (c) => {
  const id = Number(c.req.param('id'));
  const doc = await getDocument(c.env, id);
  const v = await c.env.DB.prepare('SELECT data, created_at FROM document_versions WHERE id = ? AND document_id = ?').bind(Number(c.req.param('vid')), id).first<{ data: string; created_at: string }>();
  if (!doc || !v) return c.json({ error: 'not found' }, 404);
  const raw = JSON.parse(v.data), snap = raw.data ? raw : { data: raw };
  snap.data = upgrade(getDocType(doc.type), snap.data);
  await saveVersion(c.env, doc, 'restore', 'Saved automatically before a restore');
  await c.env.DB.prepare("UPDATE documents SET data = ?, title = ?, status = ?, client_id = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(JSON.stringify(snap.data), snap.title === undefined ? doc.title : snap.title, snap.status ?? doc.status, snap.clientId === undefined ? doc.client_id : snap.clientId, id).run();
  if (snap.artwork && doc.artwork_id) await c.env.DB.prepare('UPDATE artworks SET fields = ? WHERE id = ?').bind(JSON.stringify(snap.artwork), doc.artwork_id).run();
  return c.json({ ok: true });
});
