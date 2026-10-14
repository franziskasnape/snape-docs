import { Hono } from 'hono';
import { z } from 'zod';
import { buildContext, getDocument, getSettings, parseData, type Env } from './core/db';
import { todayInStudioZone } from './core/format';
import { checkData, ensureIds } from './core/validate';
import { upgrade } from './core/migrate';
import { openapi } from './core/openapi';
import { hostPage } from './core/render/host';

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
app.get('/api/doctypes/:type/schema', (c) => {
  const dt = getDocType(c.req.param('type'));
  if (!dt?.schema) return c.json({ error: 'unknown document type', code: 'not_found' }, 404);
  return c.json(z.toJSONSchema(dt.schema, { target: 'draft-2020-12', io: 'input' }));
});
app.get('/api/doctypes/:type/example', async (c) => {
  const dt = getDocType(c.req.param('type'));
  if (!dt) return c.json({ error: 'unknown document type', code: 'not_found' }, 404);
  const lang = c.req.query('lang') === 'en' ? 'en' : 'de';
  const data = ensureIds(dt.defaultData(lang, await getSettings(c.env), todayInStudioZone()));
  return c.json({ type: dt.id, lang, artwork: dt.defaultArtwork(lang), data });
});
// Dry run: would this `data` be accepted? Nothing is saved.
app.post('/api/doctypes/:type/validate', async (c) => {
  const dt = getDocType(c.req.param('type'));
  if (!dt) return c.json({ error: 'unknown document type', code: 'not_found' }, 404);
  const body = await c.req.json<any>();
  const issues = checkData(dt, ensureIds(upgrade(dt, body?.data ?? body)));
  return c.json({ valid: !issues, issues: issues ?? [] });
});
app.get('/api/openapi.json', (c) => c.json(openapi(new URL(c.req.url).origin)));

// Errors are always JSON on /api: {error, code, ...}
app.notFound((c) => (new URL(c.req.url).pathname.startsWith('/api/') ? c.json({ error: 'no such endpoint', code: 'not_found' }, 404) : c.text('Not found', 404)));
app.onError((e, c) => {
  if (e instanceof SyntaxError) return c.json({ error: 'the request body is not valid JSON', code: 'bad_json' }, 400);
  console.error(e);
  return c.json({ error: 'internal error', code: 'internal' }, 500);
});

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

// Print view: the document laid out into A4 pages (Vivliostyle) with a Print / Save-as-PDF button.
// The browser uses the document's <title> as the default PDF file name.
app.get('/documents/:id/print', async (c) => {
  const doc = await getDocument(c.env, Number(c.req.param('id')));
  if (!doc) return c.notFound();
  const dt = getDocType(doc.type);
  if (!dt) return c.text('unsupported document type', 400);
  const origin = new URL(c.req.url).origin;
  const ctx = await buildContext(c.env, doc, (id) => `${origin}/img/${id}`);       // absolute: the document is loaded from a blob: URL
  const documentHtml = dt.render(parseData(doc), ctx, { cssHref: `${origin}/house.css`, sealSrc: `${origin}/seal.png` });
  return c.html(hostPage({ documentHtml, mode: 'view', lang: doc.lang }));
});

// Self-contained single-file export (fonts, images, seal and the layout engine inlined) — like the original hand-built offers.
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
  const engine = new TextDecoder().decode(await asset('/vivliostyle.js'));

  const ctx = await buildContext(c.env, doc, (id) => `/img/${id}`);
  let documentHtml = dt.render(parseData(doc), ctx, { inlineCss: css, sealSrc: seal });
  for (const id of new Set([...documentHtml.matchAll(/\/img\/(\d+)/g)].map((m) => Number(m[1])))) {
    const row = await c.env.DB.prepare('SELECT r2_key, mime FROM images WHERE id = ?').bind(id).first<{ r2_key: string; mime: string }>();
    const obj = row && await c.env.IMAGES.get(row.r2_key);
    if (obj) documentHtml = documentHtml.split(`/img/${id}"`).join(`data:${row.mime};base64,${b64(await obj.arrayBuffer())}"`);
  }
  const html = hostPage({ documentHtml, mode: 'view', lang: doc.lang, inlineScript: engine, importHints: true });
  const name = `Snape-Conservation_${doc.number}_${doc.lang === 'de' ? 'Angebot' : 'Offer'}.html`;
  return c.body(html, 200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"` });
});

export default app;
