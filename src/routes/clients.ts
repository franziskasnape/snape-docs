import { Hono } from 'hono';
import type { Env } from '../core/db';

export const clients = new Hono<{ Bindings: Env }>();

clients.get('/', async (c) => c.json((await c.env.DB.prepare('SELECT * FROM clients ORDER BY name').all()).results));

clients.get('/:id', async (c) => {
  const row = await c.env.DB.prepare('SELECT * FROM clients WHERE id = ?').bind(Number(c.req.param('id'))).first();
  return row ? c.json(row) : c.json({ error: 'not found', code: 'not_found' }, 404);
});

clients.post('/', async (c) => {
  const b = await c.req.json<any>();
  if (!b.name) return c.json({ error: 'name required' }, 400);
  const id = (await c.env.DB.prepare('INSERT INTO clients (name,address,contact,phone,email) VALUES (?,?,?,?,?)')
    .bind(b.name, b.address ?? null, b.contact ?? null, b.phone ?? null, b.email ?? null).run()).meta.last_row_id;
  return c.json({ id }, 201);
});

clients.put('/:id', async (c) => {
  const b = await c.req.json<any>();
  if (!b.name) return c.json({ error: 'name required', code: 'validation' }, 400);
  await c.env.DB.prepare('UPDATE clients SET name=?, address=?, contact=?, phone=?, email=? WHERE id=?')
    .bind(b.name, b.address ?? null, b.contact ?? null, b.phone ?? null, b.email ?? null, Number(c.req.param('id'))).run();
  return c.json({ ok: true });
});

// A client that no document uses can be deleted
clients.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const used = await c.env.DB.prepare('SELECT count(*) AS n FROM documents WHERE client_id = ?').bind(id).first<{ n: number }>();
  if (used && used.n > 0) return c.json({ error: `${used.n} document(s) still use this client`, code: 'in_use' }, 409);
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE images SET artwork_id = NULL WHERE artwork_id IN (SELECT id FROM artworks WHERE client_id = ?)').bind(id),
    c.env.DB.prepare('DELETE FROM artworks WHERE client_id = ? AND id NOT IN (SELECT artwork_id FROM documents WHERE artwork_id IS NOT NULL)').bind(id),   // left over from deleted documents
    c.env.DB.prepare('DELETE FROM clients WHERE id = ?').bind(id),
  ]);
  return c.json({ ok: true });
});
