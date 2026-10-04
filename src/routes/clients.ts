import { Hono } from 'hono';
import type { Env } from '../core/db';

export const clients = new Hono<{ Bindings: Env }>();

clients.get('/', async (c) => c.json((await c.env.DB.prepare('SELECT * FROM clients ORDER BY name').all()).results));

clients.post('/', async (c) => {
  const b = await c.req.json<any>();
  if (!b.name) return c.json({ error: 'name required' }, 400);
  const id = (await c.env.DB.prepare('INSERT INTO clients (name,address,contact,phone,email) VALUES (?,?,?,?,?)')
    .bind(b.name, b.address ?? null, b.contact ?? null, b.phone ?? null, b.email ?? null).run()).meta.last_row_id;
  return c.json({ id }, 201);
});

clients.put('/:id', async (c) => {
  const b = await c.req.json<any>();
  await c.env.DB.prepare('UPDATE clients SET name=?, address=?, contact=?, phone=?, email=? WHERE id=?')
    .bind(b.name, b.address ?? null, b.contact ?? null, b.phone ?? null, b.email ?? null, Number(c.req.param('id'))).run();
  return c.json({ ok: true });
});
