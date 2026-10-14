import { Hono } from 'hono';
import type { Env } from '../core/db';

export const images = new Hono<{ Bindings: Env }>();

const MAX_BYTES = 6 * 1024 * 1024;

// Upload one already-resized image (the browser downsizes before sending; originals stay in Google Drive).
// POST /api/images?documentId=N  body: raw JPEG/PNG bytes
images.post('/', async (c) => {
  const mime = c.req.header('content-type') ?? '';
  if (!/^image\/(jpeg|png)$/.test(mime)) return c.json({ error: 'JPEG or PNG only' }, 415);
  const buf = await c.req.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) return c.json({ error: 'image too large — resize before upload' }, 413);
  const docId = Number(c.req.query('documentId')) || null;
  const key = `images/${crypto.randomUUID()}.${mime === 'image/png' ? 'png' : 'jpg'}`;
  await c.env.IMAGES.put(key, buf, { httpMetadata: { contentType: mime } });
  const w = Number(c.req.query('w')) || null, h = Number(c.req.query('h')) || null;
  const id = (await c.env.DB.prepare('INSERT INTO images (document_id, r2_key, mime, width, height) VALUES (?,?,?,?,?)')
    .bind(docId, key, mime, w, h).run()).meta.last_row_id;
  return c.json({ id }, 201);
});

// Metadata of one image, and the images of a document: GET /api/images/:id, GET /api/images?documentId=N (the bytes are at /img/:id)
images.get('/:id', async (c) => {
  const row = await c.env.DB.prepare('SELECT id, document_id AS documentId, mime, width, height, created_at AS createdAt FROM images WHERE id = ?').bind(Number(c.req.param('id'))).first();
  return row ? c.json({ ...row, url: `/img/${(row as any).id}` }) : c.json({ error: 'not found', code: 'not_found' }, 404);
});
images.get('/', async (c) => {
  const doc = Number(c.req.query('documentId'));
  const { results } = await (doc
    ? c.env.DB.prepare('SELECT id, document_id AS documentId, mime, width, height FROM images WHERE document_id = ? ORDER BY id').bind(doc)
    : c.env.DB.prepare('SELECT id, document_id AS documentId, mime, width, height FROM images ORDER BY id DESC LIMIT 200')).all();
  return c.json(results);
});
