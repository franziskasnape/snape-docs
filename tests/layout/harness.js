// Renders an offer in headless Chrome (real Paged.js pagination) and returns a per-page report.
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { renderOffer } from '../../src/doctypes/offer/render';
import { analyze } from './checks.js';
import { context } from './fixtures.js';

const ROOT = resolve(import.meta.dirname, '../..');
const PUBLIC = join(ROOT, 'public');
const MIME = { '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.otf': 'font/otf', '.html': 'text/html; charset=utf-8' };

export function findChrome() {
  const c = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  return c.find((p) => p && existsSync(p));
}
export const pagedInstalled = () => existsSync(join(PUBLIC, 'paged.polyfill.js'));
export const fontsInstalled = () => existsSync(join(PUBLIC, 'fonts/Synonym-400.otf'));

export async function startHarness() {
  const docs = new Map();
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const m = /^\/doc\/(\d+)\.html$/.exec(url.pathname);
    if (m && docs.has(+m[1])) { res.writeHead(200, { 'content-type': MIME['.html'] }); return res.end(docs.get(+m[1])); }
    const file = join(PUBLIC, decodeURIComponent(url.pathname));
    if (file.startsWith(PUBLIC) && existsSync(file) && !file.endsWith('/')) { res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' }); return res.end(readFileSync(file)); }
    res.writeHead(404); res.end();
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--no-sandbox', '--font-render-hinting=none'] });
  let n = 0;

  /** Render offer data; resolves to an array with one report per printed page. `screenshotDir` also saves page-N.png files. */
  async function render(data, lang = 'de', { screenshotDir } = {}) {
    const html = renderOffer(JSON.parse(JSON.stringify(data)), context(lang), { embedded: true });
    const id = ++n; docs.set(id, html);
    const page = await browser.newPage();
    try {
      await page.setViewport({ width: 900, height: 1200 });
      await page.evaluateOnNewDocument(() => { window.addEventListener('message', (e) => { if (e.data && e.data.pagedDone) window.__pagedDone = true; }); });
      await page.goto(`http://127.0.0.1:${port}/doc/${id}.html`, { waitUntil: 'load' });
      await page.waitForFunction('window.__pagedDone === true', { timeout: 60000 });
      await page.evaluate(() => document.fonts.ready);
      await new Promise((r) => setTimeout(r, 150));
      const report = await page.evaluate(analyze);
      if (screenshotDir) {                                     // debugging aid: one PNG per printed page
        mkdirSync(screenshotDir, { recursive: true });
        const els = await page.$$('.pagedjs_page');
        for (let i = 0; i < els.length; i++) await els[i].screenshot({ path: join(screenshotDir, `page-${i + 1}.png`) });
      }
      return report;
    } finally { await page.close(); docs.delete(id); }
  }
  return { render, close: async () => { await browser.close(); server.close(); } };
}
