import { Hono } from 'hono';
import { buildContext, getDocument, type Env } from './core/db';
import type { OfferData } from './doctypes/offer/schema';
import { renderOffer } from './doctypes/offer/render';
import { offer004, ctx004 } from './fixtures/offer-004';

const app = new Hono<{ Bindings: Env }>();

app.get('/api/health', async (c) => {
  const row = await c.env.DB.prepare('SELECT count(*) AS n FROM documents').first<{ n: number }>();
  return c.json({ ok: true, documents: row?.n ?? 0 });
});

// Images live in R2; ids are rows in `images`
app.get('/img/:id', async (c) => {
  const row = await c.env.DB.prepare('SELECT r2_key, mime FROM images WHERE id = ?').bind(Number(c.req.param('id'))).first<{ r2_key: string; mime: string }>();
  const obj = row && await c.env.IMAGES.get(row.r2_key);
  if (!row || !obj) return c.notFound();
  return new Response(obj.body, { headers: { 'Content-Type': row.mime, 'Cache-Control': 'private, max-age=3600' } });
});

// Print view: Paged.js A4 pages. Browser "Save as PDF" uses <title> as the filename.
app.get('/documents/:id/print', async (c) => {
  const doc = await getDocument(c.env, Number(c.req.param('id')));
  if (!doc) return c.notFound();
  if (doc.type !== 'offer') return c.text('unsupported document type', 400);
  const ctx = await buildContext(c.env, doc, (id) => `/img/${id}`);
  return c.html(renderOffer(JSON.parse(doc.data) as OfferData, ctx));
});

// Dev-only: render the hand-written 004 fixture (removed once documents come from D1)
app.get('/dev/offer-004', (c) => {
  const html = renderOffer(offer004, { ...ctx004, lang: 'de', imageSrc: (id) => `/dev-img/${id}.jpg` });
  return c.html(html);
});

export default app;
