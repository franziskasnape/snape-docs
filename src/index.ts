import { Hono } from 'hono';

export type Env = { DB: D1Database; IMAGES: R2Bucket };

const app = new Hono<{ Bindings: Env }>();

app.get('/api/health', async (c) => {
  const row = await c.env.DB.prepare('SELECT count(*) AS n FROM documents').first<{ n: number }>();
  return c.json({ ok: true, documents: row?.n ?? 0 });
});

export default app;
