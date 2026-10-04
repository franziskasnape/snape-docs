import { Hono } from 'hono';
import { buildContext, getDocument, getSettings, nextNumber, type Env } from '../core/db';
import { getDocType, docTypes } from '../core/registry';
import type { Lang } from '../core/types';

export const documents = new Hono<{ Bindings: Env }>();

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
    const data = JSON.parse(src.data);
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
  return c.json({
    id: doc.id, type: doc.type, number: doc.number, lang: doc.lang, status: doc.status, title: doc.title,
    clientId: doc.client_id, client, artwork: art ? JSON.parse(art.fields) : [], data: JSON.parse(doc.data), updatedAt: doc.updated_at,
  });
});

// Save: any subset of {title,status,lang,clientId,artwork,data}
documents.put('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const doc = await getDocument(c.env, id);
  if (!doc) return c.json({ error: 'not found' }, 404);
  const b = await c.req.json<any>();
  const dt = getDocType(doc.type);
  if (b.status && !dt.statuses.includes(b.status)) return c.json({ error: 'invalid status' }, 400);
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
  const base = await buildContext(c.env, { client_id: b.clientId ?? null, artwork_id: null, number: b.number, lang: b.lang } as any, (id) => `/img/${id}`);
  return c.html(dt.render(b.data, { ...base, client: b.client ?? base.client, artwork: b.artwork ?? [] }, { embedded: true }));
});

// Default (computed) cost text for the "edit manually" box
documents.post('/cost-text', async (c) => {
  const b = await c.req.json<any>();
  const dt = getDocType(b.type ?? 'offer');
  return c.json({ html: dt.costText?.(b.data, b.lang) ?? '' });
});

// Version snapshots (the user's "Save version" button; also useful before big edits)
documents.post('/:id/versions', async (c) => {
  const id = Number(c.req.param('id'));
  const doc = await getDocument(c.env, id);
  if (!doc) return c.json({ error: 'not found' }, 404);
  const { note } = await c.req.json<{ note?: string }>().catch(() => ({ note: undefined }));
  await c.env.DB.prepare('INSERT INTO document_versions (document_id, data, note) VALUES (?,?,?)').bind(id, doc.data, note || null).run();
  return c.json({ ok: true }, 201);
});

documents.get('/:id/versions', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT id, note, created_at FROM document_versions WHERE document_id = ? ORDER BY id DESC').bind(Number(c.req.param('id'))).all();
  return c.json(results);
});

documents.post('/:id/versions/:vid/restore', async (c) => {
  const id = Number(c.req.param('id'));
  const v = await c.env.DB.prepare('SELECT data FROM document_versions WHERE id = ? AND document_id = ?').bind(Number(c.req.param('vid')), id).first<{ data: string }>();
  if (!v) return c.json({ error: 'not found' }, 404);
  await c.env.DB.prepare("UPDATE documents SET data = ?, updated_at = datetime('now') WHERE id = ?").bind(v.data, id).run();
  return c.json({ ok: true });
});
