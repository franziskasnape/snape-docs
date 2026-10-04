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
