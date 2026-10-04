import { Hono } from 'hono';
import { renderOffer } from './doctypes/offer/render';
import { offer004, ctx004 } from './fixtures/offer-004';

export type Env = { DB: D1Database; IMAGES: R2Bucket };

const app = new Hono<{ Bindings: Env }>();

app.get('/api/health', async (c) => {
  const row = await c.env.DB.prepare('SELECT count(*) AS n FROM documents').first<{ n: number }>();
  return c.json({ ok: true, documents: row?.n ?? 0 });
});

// Dev-only: render the hand-written 004 fixture (removed once documents come from D1)
app.get('/dev/offer-004', (c) => {
  const html = renderOffer(offer004, { ...ctx004, lang: 'de', imageSrc: (id) => `/dev-img/${id}.jpg` });
  return c.html(html);
});

export default app;
