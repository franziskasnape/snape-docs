import { Hono } from 'hono';
import type { Env } from '../core/db';

export const snippets = new Hono<{ Bindings: Env }>();

interface Row { id: number; kind: string; key: string; de: string; en: string; needs_review: number; updated_at: string }
const out = (r: Row) => ({ id: r.id, kind: r.kind, key: r.key, de: JSON.parse(r.de), en: JSON.parse(r.en), needsReview: !!r.needs_review, updatedAt: r.updated_at });

snippets.get('/', async (c) => {
  const kind = c.req.query('kind');
  const stmt = c.env.DB.prepare(`SELECT * FROM snippets ${kind ? 'WHERE kind = ?' : ''} ORDER BY kind, key`);
  const { results } = await (kind ? stmt.bind(kind) : stmt).all<Row>();
  return c.json(results.map(out));
});

// Upsert by (kind, key). Only the languages present in the body are overwritten (the other side is kept).
snippets.post('/', async (c) => {
  const b = await c.req.json<{ kind: string; key: string; de?: object; en?: object; needsReview?: boolean }>();
  if (!b.kind || !b.key) return c.json({ error: 'kind and key required' }, 400);
  const cur = await c.env.DB.prepare('SELECT * FROM snippets WHERE kind = ? AND key = ?').bind(b.kind, b.key).first<Row>();
  const de = JSON.stringify(b.de ?? (cur ? JSON.parse(cur.de) : {}));
  const en = JSON.stringify(b.en ?? (cur ? JSON.parse(cur.en) : {}));
  const nr = b.needsReview == null ? (cur?.needs_review ?? 0) : b.needsReview ? 1 : 0;
  if (cur) {
    await c.env.DB.prepare("UPDATE snippets SET de=?, en=?, needs_review=?, updated_at=datetime('now') WHERE id=?").bind(de, en, nr, cur.id).run();
    return c.json({ id: cur.id, updated: true });
  }
  const id = (await c.env.DB.prepare('INSERT INTO snippets (kind,key,de,en,needs_review) VALUES (?,?,?,?,?)').bind(b.kind, b.key, de, en, nr).run()).meta.last_row_id;
  return c.json({ id, updated: false }, 201);
});

snippets.put('/:id', async (c) => {
  const b = await c.req.json<{ key?: string; de?: object; en?: object; needsReview?: boolean }>();
  const id = Number(c.req.param('id'));
  const cur = await c.env.DB.prepare('SELECT * FROM snippets WHERE id = ?').bind(id).first<Row>();
  if (!cur) return c.json({ error: 'not found' }, 404);
  await c.env.DB.prepare("UPDATE snippets SET key=?, de=?, en=?, needs_review=?, updated_at=datetime('now') WHERE id=?")
    .bind(b.key ?? cur.key, JSON.stringify(b.de ?? JSON.parse(cur.de)), JSON.stringify(b.en ?? JSON.parse(cur.en)), b.needsReview == null ? cur.needs_review : b.needsReview ? 1 : 0, id).run();
  return c.json({ ok: true });
});

snippets.delete('/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM snippets WHERE id = ?').bind(Number(c.req.param('id'))).run();
  return c.json({ ok: true });
});
