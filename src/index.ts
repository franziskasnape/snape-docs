import { Hono } from 'hono';
import { buildContext, getDocument, type Env } from './core/db';

import { documents } from './routes/documents';
import { clients } from './routes/clients';
import { images } from './routes/images';
import { snippets } from './routes/snippets';
import { docTypes, getDocType } from './core/registry';
import { settings } from './routes/settings';

const app = new Hono<{ Bindings: Env }>();
app.route('/api/documents', documents);
app.route('/api/clients', clients);
app.route('/api/images', images);
app.route('/api/snippets', snippets);
app.route('/api/settings', settings);
app.get('/api/doctypes', (c) => c.json(Object.values(docTypes).map(({ id, prefix, labels, statuses }) => ({ id, prefix, labels, statuses }))));

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
  const dt = getDocType(doc.type);
  if (!dt) return c.text('unsupported document type', 400);
  const ctx = await buildContext(c.env, doc, (id) => `/img/${id}`);
  return c.html(dt.render(JSON.parse(doc.data), ctx));
});

// Self-contained single-file export (fonts, images, seal and Paged.js inlined) — like the original hand-built offers.
app.get('/documents/:id/standalone.html', async (c) => {
  const doc = await getDocument(c.env, Number(c.req.param('id')));
  if (!doc) return c.notFound();
  const dt = getDocType(doc.type);
  const origin = new URL(c.req.url).origin;
  const asset = async (path: string) => (await c.env.ASSETS.fetch(new Request(origin + path))).arrayBuffer();
  const b64 = (buf: ArrayBuffer) => { let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };

  let css = new TextDecoder().decode(await asset('/house.css'));
  for (const f of new Set(css.match(/\/fonts\/[\w-]+\.otf/g) ?? [])) css = css.split(f).join(`data:font/otf;base64,${b64(await asset(f))}`);
  const seal = `data:image/png;base64,${b64(await asset('/seal.png'))}`;
  const paged = new TextDecoder().decode(await asset('/paged.polyfill.js')).replace(/<\/script/gi, '<\\/script');

  const ctx = await buildContext(c.env, doc, (id) => `/img/${id}`);
  let html = dt.render(JSON.parse(doc.data), ctx, { inlineCss: css, sealSrc: seal, inlinePaged: paged });
  for (const id of new Set([...html.matchAll(/\/img\/(\d+)/g)].map((m) => Number(m[1])))) {
    const row = await c.env.DB.prepare('SELECT r2_key, mime FROM images WHERE id = ?').bind(id).first<{ r2_key: string; mime: string }>();
    const obj = row && await c.env.IMAGES.get(row.r2_key);
    if (obj) html = html.split(`/img/${id}"`).join(`data:${row.mime};base64,${b64(await obj.arrayBuffer())}"`);
  }
  const name = `Snape-Conservation_${doc.number}_${doc.lang === 'de' ? 'Angebot' : 'Offer'}.html`;
  return c.body(html, 200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"` });
});

export default app;
